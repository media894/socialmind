"""
Social media platform publishers.
Handles the actual API calls to post videos to Instagram, Facebook, LinkedIn.
"""
import logging
import json
import httpx
import mimetypes
import os
import shutil
import subprocess
import tempfile
import time
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone as dt_timezone
from urllib.parse import quote
from typing import Optional

logger = logging.getLogger(__name__)


class PublishAPIError(Exception):
    def __init__(self, message: str, details: Optional[dict] = None):
        super().__init__(message)
        self.details = details or {}


def _raise_for_status_with_body(response, *, platform: str = '', context: str = ''):
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        body = (response.text or '').strip()
        details = {
            'platform': platform,
            'context': context,
            'status_code': response.status_code,
            'raw_body': body[:2000],
        }
        message = str(exc)

        parsed = _safe_json_loads(body)
        if isinstance(parsed, dict):
            details['response_json'] = parsed
            if isinstance(parsed.get('errors'), list) and parsed['errors']:
                details['x_errors'] = parsed['errors']
                first_error = parsed['errors'][0]
                if isinstance(first_error, dict):
                    message = first_error.get('detail') or first_error.get('title') or message
            api_error = parsed.get('error') if isinstance(parsed.get('error'), dict) else parsed
            if isinstance(api_error, dict):
                details['error_code'] = api_error.get('code')
                details['error_subcode'] = api_error.get('error_subcode')
                details['error_type'] = api_error.get('type')
                details['fbtrace_id'] = api_error.get('fbtrace_id')
                if api_error.get('message'):
                    message = api_error['message']
                hint = _meta_permission_hint(platform, details)
                if hint:
                    details['hint'] = hint
                    if hint not in message:
                        message = f"{message} {hint}".strip()
        elif body:
            message = f"{exc}. Response: {body[:800]}"

        raise PublishAPIError(message, details=details) from exc


def _safe_json_loads(value: str):
    if not value:
        return None
    try:
        return json.loads(value)
    except Exception:
        return None


def _meta_permission_hint(platform: str, details: dict) -> str:
    platform = (platform or '').lower()
    code = int(details.get('error_code') or 0)
    message = str((details.get('response_json') or {}).get('error', {}).get('message') or details.get('raw_body') or '').lower()

    if platform in {'instagram', 'facebook'}:
        if code == 190 or 'access token' in message or 'oauthexception' in message:
            return (
                'Meta access token looks invalid or expired. Reconnect the account and make sure the token is a long-lived Page token with the required publish permissions.'
            )
        if code in {10, 200, 100} or 'permission' in message:
            return (
                'Meta rejected the post because the app/token is missing the required permissions. '
                'Check that the Facebook App is approved for publishing, the Page/Instagram account is linked correctly, and the token includes the needed publish scopes.'
            )
        if 'instagram' in platform and 'facebook page' in message:
            return 'Instagram publishing needs a connected Facebook Page and a valid Instagram Business account.'
        if 'facebook' in platform and 'page id' in message:
            return 'Facebook publishing needs a valid numeric Facebook Page ID and a Page token with publish permission.'

    if platform in {'twitter', 'x', 'twitter_x'}:
        if 'unauthorized' in message or 'forbidden' in message or 'oauth' in message or 'scope' in message or 'permission' in message:
            return (
                'Twitter/X publishing needs an OAuth 2.0 user access token with tweet.write, tweet.read, users.read, offline.access, and media.write permissions.'
            )

    return ''


class PublisherBase(ABC):
    """Base class for social media publishers"""

    @abstractmethod
    def publish(self, social_account, video_path: str, caption: str,
                hashtags: list, **kwargs) -> dict:
        pass

    def format_caption(self, caption: str, hashtags: list, max_length: int = 2200) -> str:
        hashtag_str = ' '.join(hashtags) if hashtags else ''
        full_caption = f"{caption}\n\n{hashtag_str}".strip()
        if len(full_caption) > max_length:
            available = max_length - len(hashtag_str) - 3
            full_caption = f"{caption[:available]}...\n\n{hashtag_str}"
        return full_caption


class InstagramPublisher(PublisherBase):
    """
    Instagram Graph API publisher.
    Requires: Instagram Business Account connected to a Facebook Page.
    Flow: Upload video -> Create container -> Wait -> Publish
    """
    BASE_URL = 'https://graph.facebook.com/v18.0'

    def publish(self, social_account, video_path: str, caption: str,
                hashtags: list, **kwargs) -> dict:
        access_token = social_account.get_access_token()
        ig_user_id = social_account.platform_user_id
        full_caption = self.format_caption(caption, hashtags, max_length=2200)
        public_video_url = kwargs.get('video_url') or video_path

        if not public_video_url or not public_video_url.startswith(('http://', 'https://')):
            raise Exception(
                'Instagram publishing requires a public video URL. '
                'Set PUBLIC_APP_URL or configure S3 storage.'
            )

        with httpx.Client(timeout=120) as client:
            # Step 1: Create a video container
            container_response = client.post(
                f'{self.BASE_URL}/{ig_user_id}/media',
                data={
                    'media_type': 'REELS',
'video_url': public_video_url,
'caption': full_caption,
'share_to_feed': 'true',
'access_token': access_token,
                }
            )
            _raise_for_status_with_body(container_response, platform='instagram', context='create media container')
            container_id = container_response.json().get('id')

            if not container_id:
                raise Exception(f"Failed to create container: {container_response.text}")

            # Step 2: Wait for container to be ready
            # Poll up to 24 × 5s = 2 minutes.
            # Error 2207076 = Instagram could NOT fetch the video from the URL.
            # Root fix: use Cloudinary or S3 so the URL is always a permanent public HTTPS link.
            import time
            last_status_data = {}
            for attempt in range(24):
                time.sleep(5)
                status_resp = client.get(
                    f'{self.BASE_URL}/{container_id}',
                    params={'fields': 'status_code,status', 'access_token': access_token}
                )
                _raise_for_status_with_body(status_resp, platform='instagram', context='check container status')
                status_data = status_resp.json()
                last_status_data = status_data
                if status_data.get('status_code') == 'FINISHED':
                    break
                if status_data.get('status_code') == 'ERROR':
                    status_str = str(status_data)
                    hint = ''
                    if '2207076' in status_str:
                        hint = (
                            ' FIX: Instagram could not download the video from your server URL. '
                            'The video URL must be a permanent public HTTPS URL reachable from the internet. '
                            'Set CLOUDINARY_URL or AWS S3 credentials in your backend .env file. '
                            'localhost and private network URLs will always fail with this error.'
                        )
                    elif '2207001' in status_str or '2207082' in status_str:
                        hint = ' FIX: Temporary Instagram server issue. Wait a few minutes and retry.'
                    raise Exception(f'Container processing failed: {status_data}{hint}')
            else:
                raise Exception(
                    f'Instagram container did not finish processing in time. Last status: {last_status_data}'
                )

            # Step 3: Publish the container
            publish_response = client.post(
                f'{self.BASE_URL}/{ig_user_id}/media_publish',
                data={'creation_id': container_id, 'access_token': access_token}
            )
            _raise_for_status_with_body(publish_response, platform='instagram', context='publish media container')
            post_id = publish_response.json().get('id')

            return {
                'post_id': post_id,
                'platform': 'instagram',
                'url': f'https://www.instagram.com/p/{post_id}/',
                'container_id': container_id,
            }


class FacebookPublisher(PublisherBase):
    """
    Facebook Graph API publisher for Pages.
    Supports posting videos to Facebook Pages.

    Fix for error #100 / permission errors:
    Always resolve a proper long-lived Page access token before posting.
    A user token cannot publish to a Page — we must exchange it for the
    Page-specific token via /{page_id}?fields=access_token.
    """
    BASE_URL = 'https://graph.facebook.com/v18.0'

    def _get_page_token(self, client: httpx.Client, user_token: str, page_id: str) -> str:
        """
        Exchange a user access token for a long-lived Page access token.
        This resolves the #100 'no permission to publish' error.
        """
        try:
            resp = client.get(
                f'{self.BASE_URL}/{page_id}',
                params={'fields': 'access_token', 'access_token': user_token},
            )
            if resp.status_code == 200:
                page_token = resp.json().get('access_token')
                if page_token:
                    logger.info('FacebookPublisher: successfully obtained Page access token for page %s', page_id)
                    return page_token
        except Exception as exc:
            logger.warning('FacebookPublisher: could not fetch Page token, falling back to stored token. Error: %s', exc)
        # Fall back to the stored token if exchange fails
        return user_token

    def publish(self, social_account, video_path: str, caption: str,
                hashtags: list, **kwargs) -> dict:
        user_token = social_account.get_access_token()
        page_id = social_account.page_id or social_account.platform_user_id
        full_caption = self.format_caption(caption, hashtags, max_length=63206)
        public_video_url = kwargs.get('video_url') or video_path

        if not public_video_url or not public_video_url.startswith(('http://', 'https://')):
            raise Exception(
                'Facebook publishing requires a public video URL. '
                'Set PUBLIC_APP_URL or configure S3 storage.'
            )

        with httpx.Client(timeout=120) as client:
            # Always obtain the Page-specific access token to avoid #100 permission errors.
            # A generic user token lacks publish_pages / pages_manage_posts scope on the Page.
            access_token = self._get_page_token(client, user_token, page_id)

            response = client.post(
                f'{self.BASE_URL}/{page_id}/videos',
                data={
                    'file_url': public_video_url,
                    'description': full_caption,
                    'access_token': access_token,
                    'published': True,
                }
            )
            _raise_for_status_with_body(response, platform='facebook', context='publish video to page')
            data = response.json()
            post_id = data.get('id')

            return {
                'post_id': post_id,
                'platform': 'facebook',
                'url': f'https://www.facebook.com/{post_id}',
            }


class LinkedInPublisher(PublisherBase):
    """
    LinkedIn Posts + Videos API publisher.
    Posts videos to LinkedIn profiles or company pages.
    """
    BASE_URL = 'https://api.linkedin.com/rest'
    API_VERSION = '202503'

    def publish(self, social_account, video_path: str, caption: str,
                hashtags: list, **kwargs) -> dict:
        access_token = social_account.get_access_token()
        full_caption = self.format_caption(caption, hashtags, max_length=3000)
        local_video_path = _ensure_local_video_file(video_path, kwargs.get('video_url'))
        local_video_path = _prepare_linkedin_video_file(local_video_path)
        file_size = os.path.getsize(local_video_path)

        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Linkedin-Version': self.API_VERSION,
            'X-Restli-Protocol-Version': '2.0.0',
        }
        author = _resolve_linkedin_author(social_account)

        try:
            with httpx.Client(timeout=120) as client:
                video_urn, upload_instructions, upload_token = self._initialize_upload(client, headers, author, file_size)
                uploaded_part_ids = self._upload_video(upload_instructions, local_video_path)
                self._finalize_upload(client, headers, video_urn, upload_token, uploaded_part_ids)
                self._wait_for_video_ready(client, video_urn, headers)
                post_id = self._create_post(client, headers, author, video_urn, full_caption, kwargs.get('title'))

                return {
                    'post_id': post_id,
                    'platform': 'linkedin',
                    'url': f'https://www.linkedin.com/feed/update/{post_id}/',
                    'asset_id': video_urn,
                }
        except Exception as exc:
            raise self._rewrite_linkedin_error(exc, author)

    def _initialize_upload(self, client: httpx.Client, headers: dict, author: str, file_size: int):
        response = client.post(
            f'{self.BASE_URL}/videos?action=initializeUpload',
            headers=headers,
            json={
                'initializeUploadRequest': {
                    'owner': author,
                    'fileSizeBytes': file_size,
                    'uploadCaptions': False,
                    'uploadThumbnail': False,
                }
            }
        )
        _raise_for_status_with_body(response, platform='linkedin', context='initialize upload')
        payload = response.json().get('value', {})
        upload_instructions = payload.get('uploadInstructions') or []
        video_urn = payload.get('video', '')
        upload_token = payload.get('uploadToken', '')
        if not upload_instructions or not video_urn:
            raise Exception(f'LinkedIn initializeUpload returned an unexpected response: {response.text[:800]}')
        sorted_instructions = sorted(
            upload_instructions,
            key=lambda item: (item.get('firstByte', 0), item.get('lastByte', 0)),
        )
        return video_urn, sorted_instructions, upload_token

    def _upload_video(self, upload_instructions: list[dict], local_video_path: str):
        uploaded_part_ids = []

        with httpx.Client(timeout=300, follow_redirects=True) as upload_client:
            with open(local_video_path, 'rb') as f:
                for instruction in upload_instructions:
                    upload_url = instruction.get('uploadUrl')
                    if not upload_url:
                        raise Exception('LinkedIn uploadInstructions did not include an uploadUrl.')

                    first_byte = instruction.get('firstByte')
                    last_byte = instruction.get('lastByte')
                    if first_byte is not None and last_byte is not None:
                        part_length = (last_byte - first_byte) + 1
                        f.seek(first_byte)
                        chunk = f.read(part_length)
                    else:
                        chunk = f.read()

                    if not chunk:
                        raise Exception('LinkedIn upload chunk was empty before upload.')

                    response = self._upload_video_part(upload_client, upload_url, chunk)
                    etag = response.headers.get('etag') or response.headers.get('ETag')
                    if not etag:
                        raise Exception('LinkedIn upload succeeded but did not return an ETag for finalizeUpload.')
                    uploaded_part_ids.append(etag.strip('"'))

        return uploaded_part_ids

    def _upload_video_part(self, upload_client: httpx.Client, upload_url: str, chunk: bytes) -> httpx.Response:
        last_error = None

        for attempt in range(1, 4):
            try:
                response = upload_client.put(
                    upload_url,
                    content=chunk,
                    headers={'Content-Type': 'application/octet-stream'},
                )
                _raise_for_status_with_body(response, platform='linkedin', context='upload video part')
                return response
            except Exception as exc:
                last_error = exc
                if attempt == 3:
                    break
                time.sleep(attempt * 2)

        raise Exception(
            'LinkedIn video upload failed after retries. '
            f'LinkedIn accepts MP4 uploads via the Videos API; the uploader retried transient upload failures but still failed. '
            f'Original error: {last_error}'
        )

    def _finalize_upload(self, client: httpx.Client, headers: dict, video_urn: str, upload_token: str, uploaded_part_ids: list[str]):
        response = client.post(
            f'{self.BASE_URL}/videos?action=finalizeUpload',
            headers=headers,
            json={
                'finalizeUploadRequest': {
                    'video': video_urn,
                    'uploadToken': upload_token or '',
                    'uploadedPartIds': uploaded_part_ids,
                }
            }
        )
        _raise_for_status_with_body(response, platform='linkedin', context='finalize upload')

    def _wait_for_video_ready(self, client: httpx.Client, video_urn: str, headers: dict):
        last_payload = None

        for _ in range(20):
            response = client.get(
                f'{self.BASE_URL}/videos/{quote(video_urn, safe="")}',
                headers=headers
            )
            _raise_for_status_with_body(response, platform='linkedin', context='poll video readiness')
            payload = response.json()
            last_payload = payload
            status = payload.get('status')

            if status == 'AVAILABLE':
                return
            if status in {'PROCESSING_FAILED', 'CLIENT_ERROR', 'SERVER_ERROR'}:
                raise Exception(f'LinkedIn video processing failed: {payload}')

            time.sleep(2)

        raise Exception(f'LinkedIn video upload did not become ready in time: {last_payload}')

    def _create_post(self, client: httpx.Client, headers: dict, author: str, video_urn: str, full_caption: str, title: Optional[str]):
        safe_title = (title or full_caption.splitlines()[0] or 'Video post').strip()[:200]
        response = client.post(
            f'{self.BASE_URL}/posts',
            headers=headers,
            json={
                'author': author,
                'commentary': full_caption,
                'visibility': 'PUBLIC',
                'distribution': {
                    'feedDistribution': 'MAIN_FEED',
                    'targetEntities': [],
                    'thirdPartyDistributionChannels': [],
                },
                'content': {
                    'media': {
                        'title': safe_title,
                        'id': video_urn,
                    }
                },
                'lifecycleState': 'PUBLISHED',
                'isReshareDisabledByAuthor': False,
            }
        )
        _raise_for_status_with_body(response, platform='linkedin', context='create post')
        return response.headers.get('x-restli-id') or response.headers.get('X-RestLi-Id') or response.json().get('id', '')

    def _rewrite_linkedin_error(self, exc: Exception, author: str) -> Exception:
        message = str(exc)
        lower = message.lower()
        if 'organization permissions must be used when using organization as owner' in lower:
            return Exception(
                'LinkedIn rejected the upload because this account is posting as an organization, '
                'but the access token does not have organization posting permission. '
                'Use a token with `w_organization_social` and make sure the LinkedIn user is an admin/content admin '
                f'for that organization. Author used: {author}. Original error: {message}'
            )
        if '403' in lower or 'forbidden' in lower:
            target_type = 'organization' if ':organization:' in author else 'member'
            permission_hint = (
                'For organization posting, the token must have `w_organization_social` and the logged-in LinkedIn member must be a page admin/content admin for that exact organization URN.'
                if target_type == 'organization'
                else 'For personal posting, the token must have `w_member_social`.'
            )
            return Exception(
                f'LinkedIn rejected the post with 403 Forbidden. {permission_hint} '
                f'Author used: {author}. Original error: {message}'
            )
        if 'ugcposts' in lower:
            return Exception(
                f'LinkedIn rejected the legacy UGC post flow. The publisher now uses the newer Posts API, but the token or app permissions still need to allow posting. Original error: {message}'
            )
        if 'dms-uploads' in lower and '500' in lower:
            return Exception(
                'LinkedIn failed during the raw video upload step. '
                'This app now converts videos to MP4 and retries upload automatically, but LinkedIn still returned a server error. '
                f'Author used: {author}. Original error: {message}'
            )
        return exc


class YouTubePublisher(PublisherBase):
    """
    YouTube Data API publisher for Shorts-style video uploads.
    Uses the stored Google OAuth access token and refresh token to upload videos.
    """

    def publish(self, social_account, video_path: str, caption: str,
                hashtags: list, **kwargs) -> dict:
        # Validate Google OAuth credentials are configured before attempting anything
        client_id = os.environ.get('GOOGLE_CLIENT_ID', '')
        client_secret = os.environ.get('GOOGLE_CLIENT_SECRET', '')
        if not client_id or not client_secret:
            raise Exception(
                'Google OAuth is not configured. '
                'To fix this, add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your backend '
                '.env file (or environment variables). '
                'Get these from https://console.cloud.google.com/ → APIs & Services → Credentials → '
                'Create OAuth 2.0 Client ID (Web application). '
                'Make sure the YouTube Data API v3 is enabled in your project.'
            )
        access_token = self._get_valid_access_token(social_account)
        local_video_path = _ensure_local_video_file(video_path, kwargs.get('video_url'))
        raw_title = kwargs.get('title') or social_account.platform_name or social_account.platform_username or 'Video'
        video_title = self._safe_title(raw_title)
        platform_subtype = str(kwargs.get('platform_subtype') or '').lower()
        if platform_subtype == 'shorts':
            if '#Shorts' not in video_title and '#shorts' not in video_title:
                shorts_suffix = ' #Shorts'
                video_title = video_title[:100 - len(shorts_suffix)] + shorts_suffix
        description = self._build_description(caption, hashtags)
        scheduled_at = kwargs.get('scheduled_at')
        privacy_status, publish_at = self._resolve_privacy_settings(scheduled_at)
        category_id = str(kwargs.get('category_id') or '22')
        tags = self._build_tags(video_title, hashtags)

        mime_type = mimetypes.guess_type(local_video_path)[0] or 'video/mp4'
        file_size = os.path.getsize(local_video_path)

        snippet = {
            'title': video_title,
            'description': description,
            'tags': tags,
            'categoryId': category_id,
        }
        status = {
            'privacyStatus': privacy_status,
        }
        if publish_at:
            status['publishAt'] = publish_at

        with httpx.Client(timeout=300, follow_redirects=True) as client:
            upload_url = self._create_resumable_upload(client, access_token, snippet, status, mime_type, file_size)
            result = self._upload_resumable_video(client, upload_url, local_video_path, mime_type)

        return {
            'post_id': result.get('id', ''),
            'platform': 'youtube',
            'url': f"https://www.youtube.com/watch?v={result.get('id', '')}",
            'channel_id': social_account.platform_user_id,
        }

    def _safe_title(self, title: str) -> str:
        value = (title or 'Video').strip()
        return value[:100] or 'Video'

    def _build_description(self, caption: str, hashtags: list) -> str:
        full_caption = self.format_caption(caption or '', hashtags or [], max_length=5000)
        return full_caption[:5000]

    def _build_tags(self, title: str, hashtags: list) -> list[str]:
        tags = []
        for value in [title, *(hashtags or [])]:
            tag = str(value or '').strip().lstrip('#')
            if tag and tag not in tags:
                tags.append(tag[:30])
        return tags[:20]

    def _resolve_privacy_settings(self, scheduled_at) -> tuple[str, Optional[str]]:
        if not scheduled_at:
            return 'public', None

        try:
            if isinstance(scheduled_at, str):
                scheduled_at = datetime.fromisoformat(scheduled_at.replace('Z', '+00:00'))
        except Exception:
            scheduled_at = None

        if not scheduled_at:
            return 'public', None

        if getattr(scheduled_at, 'tzinfo', None) is None:
            scheduled_at = scheduled_at.replace(tzinfo=dt_timezone.utc)

        now = datetime.now(dt_timezone.utc)
        if scheduled_at <= now:
            return 'public', None

        publish_at = scheduled_at.astimezone(dt_timezone.utc).isoformat().replace('+00:00', 'Z')
        return 'private', publish_at

    def _google_token_url(self) -> str:
        return 'https://oauth2.googleapis.com/token'

    def _refresh_access_token(self, social_account) -> tuple[str, Optional[int]]:
        refresh_token = social_account.get_refresh_token()
        client_id = os.environ.get('GOOGLE_CLIENT_ID','' )
        client_secret = os.environ.get('GOOGLE_CLIENT_SECRET', '')

        if not client_id or not client_secret:
            missing = []
            if not client_id:
                missing.append('GOOGLE_CLIENT_ID')
            if not client_secret:
                missing.append('GOOGLE_CLIENT_SECRET')
            raise Exception(
                f'Google OAuth is not configured: missing {", ".join(missing)}. '
                'Add these to your backend .env file. '
                'Get them from https://console.cloud.google.com/ → APIs & Services → Credentials → '
                'OAuth 2.0 Client IDs. Ensure the YouTube Data API v3 is also enabled.'
            )
        if not refresh_token:
            raise Exception(
                'YouTube publishing requires a Google refresh token. Reconnect the YouTube account from Settings using the Google OAuth flow.'
            )

        with httpx.Client(timeout=30) as client:
            resp = client.post(
                self._google_token_url(),
                data={
                    'client_id': client_id,
                    'client_secret': client_secret,
                    'refresh_token': refresh_token,
                    'grant_type': 'refresh_token',
                },
                headers={'Content-Type': 'application/x-www-form-urlencoded'},
            )
            _raise_for_status_with_body(resp, platform='youtube', context='refresh access token')
            payload = resp.json()
            new_token = payload.get('access_token', '')
            expires_in = payload.get('expires_in')
            if not new_token:
                raise Exception(f'Google token refresh returned an unexpected payload: {payload}')
            return new_token, int(expires_in) if expires_in else None

    def _get_valid_access_token(self, social_account) -> str:
        try:
            token = social_account.get_access_token()
        except Exception:
            token = ''

        token_expires_at = getattr(social_account, 'token_expires_at', None)
        should_refresh = not token
        if token_expires_at:
            should_refresh = should_refresh or token_expires_at <= datetime.now(dt_timezone.utc)

        if should_refresh:
            token, expires_in = self._refresh_access_token(social_account)
            social_account.set_access_token(token)
            if expires_in:
                from django.utils import timezone
                social_account.token_expires_at = timezone.now() + timedelta(seconds=expires_in)
            social_account.save(update_fields=['encrypted_access_token', 'token_expires_at'])

        return token

    def _create_resumable_upload(self, client: httpx.Client, access_token: str, snippet: dict, status: dict, mime_type: str, file_size: int) -> str:
        response = client.post(
            'https://www.googleapis.com/upload/youtube/v3/videos',
            params={
                'uploadType': 'resumable',
                'part': 'snippet,status',
            },
            headers={
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': mime_type,
                'X-Upload-Content-Length': str(file_size),
            },
            json={
                'snippet': snippet,
                'status': status,
            },
        )
        _raise_for_status_with_body(response, platform='youtube', context='initiate resumable upload')
        upload_url = response.headers.get('Location') or response.headers.get('location')
        if not upload_url:
            raise Exception('YouTube resumable upload did not return an upload URL.')
        return upload_url

    def _upload_resumable_video(self, client: httpx.Client, upload_url: str, local_video_path: str, mime_type: str) -> dict:
        with open(local_video_path, 'rb') as file_handle:
            upload_response = client.put(
                upload_url,
                content=file_handle.read(),
                headers={
                    'Content-Type': mime_type,
                },
            )
        _raise_for_status_with_body(upload_response, platform='youtube', context='upload video bytes')
        try:
            return upload_response.json()
        except Exception:
            return {}


class TwitterPublisher(PublisherBase):
    """
    X API v2 publisher.
    Uploads the rendered video with the chunked media flow, then creates a Post.
    """
    BASE_URL = 'https://api.x.com/2'
    CHUNK_SIZE = 4 * 1024 * 1024

    def publish(self, social_account, video_path: str, caption: str,
                hashtags: list, **kwargs) -> dict:
        access_token = social_account.get_access_token()
        if not access_token:
            raise Exception(
                'Twitter/X publishing requires an OAuth 2.0 user access token with tweet.write and media.write permissions.'
            )

        local_video_path = _ensure_local_video_file(video_path, kwargs.get('video_url'))
        mime_type = mimetypes.guess_type(local_video_path)[0] or 'video/mp4'
        if mime_type not in {'video/mp4', 'video/webm', 'video/quicktime'}:
            mime_type = 'video/mp4'

        text = self._format_post_text(caption, hashtags)
        with httpx.Client(timeout=300, follow_redirects=True) as client:
            media_id = self._upload_video(client, access_token, local_video_path, mime_type)
            tweet = self._create_post(client, access_token, text, media_id)

        post_id = str(tweet.get('id') or '')
        username = str(social_account.platform_username or '').strip().lstrip('@')
        url = f'https://x.com/i/web/status/{post_id}' if post_id else ''
        if username and post_id:
            url = f'https://x.com/{username}/status/{post_id}'

        return {
            'post_id': post_id,
            'platform': 'twitter',
            'url': url,
            'media_id': media_id,
        }

    def _headers(self, access_token: str) -> dict:
        return {'Authorization': f'Bearer {access_token}'}

    def _format_post_text(self, caption: str, hashtags: list) -> str:
        text = self.format_caption(caption or '', hashtags or [], max_length=280).strip()
        if len(text) <= 280:
            return text or ' '

        hashtags_text = ' '.join(hashtags or '').strip()
        if hashtags_text and len(hashtags_text) < 270:
            available = 277 - len(hashtags_text)
            return f'{(caption or "")[:available].rstrip()}... {hashtags_text}'.strip()[:280]
        return text[:277].rstrip() + '...'

    def _upload_video(self, client: httpx.Client, access_token: str, local_video_path: str, mime_type: str) -> str:
        media_id, processing_info = self._initialize_upload(client, access_token, local_video_path, mime_type)
        self._append_upload(client, access_token, media_id, local_video_path)
        processing_info = self._finalize_upload(client, access_token, media_id, processing_info)
        self._wait_for_processing(client, access_token, media_id, processing_info)
        return media_id

    def _initialize_upload(self, client: httpx.Client, access_token: str, local_video_path: str, mime_type: str) -> tuple[str, dict]:
        response = client.post(
            f'{self.BASE_URL}/media/upload/initialize',
            headers={**self._headers(access_token), 'Content-Type': 'application/json'},
            json={
                'media_category': 'tweet_video',
                'media_type': mime_type,
                'shared': False,
                'total_bytes': os.path.getsize(local_video_path),
            },
        )
        _raise_for_status_with_body(response, platform='twitter', context='initialize media upload')
        data = response.json().get('data') or {}
        media_id = str(data.get('id') or '')
        if not media_id:
            raise Exception(f'Twitter/X initialize upload returned an unexpected response: {response.text[:800]}')
        return media_id, data.get('processing_info') or {}

    def _append_upload(self, client: httpx.Client, access_token: str, media_id: str, local_video_path: str):
        with open(local_video_path, 'rb') as file_handle:
            segment_index = 0
            while True:
                chunk = file_handle.read(self.CHUNK_SIZE)
                if not chunk:
                    break

                response = client.post(
                    f'{self.BASE_URL}/media/upload/{media_id}/append',
                    headers=self._headers(access_token),
                    data={'segment_index': str(segment_index)},
                    files={'media': ('segment', chunk, 'application/octet-stream')},
                )
                _raise_for_status_with_body(response, platform='twitter', context='append media upload')
                segment_index += 1

    def _finalize_upload(self, client: httpx.Client, access_token: str, media_id: str, processing_info: dict) -> dict:
        response = client.post(
            f'{self.BASE_URL}/media/upload/{media_id}/finalize',
            headers=self._headers(access_token),
        )
        _raise_for_status_with_body(response, platform='twitter', context='finalize media upload')
        data = response.json().get('data') or {}
        return data.get('processing_info') or processing_info or {}

    def _wait_for_processing(self, client: httpx.Client, access_token: str, media_id: str, processing_info: dict):
        state = str((processing_info or {}).get('state') or '').lower()
        if not processing_info or state == 'succeeded':
            return

        last_payload = {}
        for _ in range(30):
            if state == 'failed':
                raise Exception(f'Twitter/X video processing failed: {last_payload or processing_info}')

            delay = int((processing_info or {}).get('check_after_secs') or 2)
            time.sleep(max(1, min(delay, 10)))
            response = client.get(
                f'{self.BASE_URL}/media/upload',
                headers=self._headers(access_token),
                params={'media_id': media_id, 'command': 'STATUS'},
            )
            _raise_for_status_with_body(response, platform='twitter', context='check media upload status')
            last_payload = response.json()
            data = last_payload.get('data') or {}
            processing_info = data.get('processing_info') or {}
            state = str(processing_info.get('state') or '').lower()
            if state == 'succeeded':
                return

        raise Exception(f'Twitter/X video processing did not finish in time: {last_payload or processing_info}')

    def _create_post(self, client: httpx.Client, access_token: str, text: str, media_id: str) -> dict:
        response = client.post(
            f'{self.BASE_URL}/tweets',
            headers={**self._headers(access_token), 'Content-Type': 'application/json'},
            json={
                'text': text or ' ',
                'media': {
                    'media_ids': [media_id],
                },
            },
        )
        _raise_for_status_with_body(response, platform='twitter', context='create post')
        return response.json().get('data') or {}


def get_publisher(platform: str) -> PublisherBase:
    publishers = {
        'instagram': InstagramPublisher,
        'facebook': FacebookPublisher,
        'linkedin': LinkedInPublisher,
        'youtube': YouTubePublisher,
        'twitter': TwitterPublisher,
        'twitter_x': TwitterPublisher,
        'x': TwitterPublisher,
    }
    cls = publishers.get(platform)
    if not cls:
        raise ValueError(f"No publisher for platform: {platform}")
    return cls()


def _ensure_local_video_file(local_path: str, public_url: Optional[str]) -> str:
    if local_path and os.path.exists(local_path):
        return local_path
    if not public_url:
        raise Exception('LinkedIn publishing requires a local video file or downloadable URL.')

    suffix = os.path.splitext(public_url.split('?', 1)[0])[1] or '.mp4'
    with httpx.Client(timeout=300, follow_redirects=True) as client:
        response = client.get(public_url)
        _raise_for_status_with_body(response)
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(response.content)
            return tmp.name


def _prepare_linkedin_video_file(local_video_path: str) -> str:
    ext = os.path.splitext(local_video_path)[1].lower()
    mime_type = mimetypes.guess_type(local_video_path)[0] or ''
    if ext == '.mp4' or mime_type == 'video/mp4':
        return local_video_path

    ffmpeg_path = shutil.which('ffmpeg')
    if not ffmpeg_path:
        raise Exception(
            f'LinkedIn video uploads require MP4, but this file is {ext or "not mp4"} and ffmpeg is not installed to convert it.'
        )

    output_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
    output_file.close()

    command = [
        ffmpeg_path,
        '-y',
        '-i', local_video_path,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-c:a', 'aac',
        '-b:a', '128k',
        output_file.name,
    ]

    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0 or not os.path.exists(output_file.name):
        raise Exception(
            'LinkedIn upload preparation failed while converting the video to MP4. '
            f'ffmpeg output: {(result.stderr or result.stdout or "").strip()[:800]}'
        )

    return output_file.name


def _resolve_linkedin_author(social_account) -> str:
    for candidate in [social_account.page_id, social_account.platform_user_id]:
        if candidate and candidate.startswith('urn:li:'):
            return candidate
        if candidate and str(candidate).isdigit():
            if candidate == social_account.page_id:
                return f'urn:li:organization:{candidate}'
            return f'urn:li:person:{candidate}'
    return f'urn:li:person:{social_account.platform_user_id}'
