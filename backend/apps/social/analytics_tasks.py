"""
Task to periodically fetch analytics from social media platforms
and update our stored metrics.
"""
from celery import shared_task
import logging
import httpx
from django.db import transaction
from django.utils import timezone
from urllib.parse import quote

logger = logging.getLogger(__name__)
LINKEDIN_API_VERSION = '202603'
LINKEDIN_POSTS_BASE_URL = 'https://api.linkedin.com/rest/posts'


@shared_task
def refresh_post_analytics():
    """
    Fetch updated analytics for all published posts.
    Runs periodically (e.g. every hour) via Celery Beat.
    """
    from apps.social.models import ScheduledPost

    published_posts = ScheduledPost.objects.filter(
        status='published',
        platform_post_id__isnull=False,
    ).exclude(platform_post_id='').select_related('social_account')

    updated = _refresh_queryset_analytics(published_posts)
    logger.info(f"Analytics refreshed for {updated} posts")
    return {'updated': updated}


def refresh_post_analytics_for_user(user, min_interval_minutes: int = 0):
    from apps.social.models import ScheduledPost

    cutoff = timezone.now() - timezone.timedelta(minutes=min_interval_minutes)
    published_posts = ScheduledPost.objects.filter(
        user=user,
        status='published',
        platform_post_id__isnull=False,
    ).exclude(platform_post_id='').select_related('social_account')

    stale_posts = published_posts.filter(analytics_updated_at__isnull=True) | published_posts.filter(analytics_updated_at__lt=cutoff)
    return _refresh_queryset_analytics(stale_posts.distinct())


def _refresh_queryset_analytics(posts):
    from apps.social.models import PostAnalytics

    updated = 0
    for post in posts:
        try:
            with transaction.atomic():
                post = (
                    type(post).objects
                    .select_for_update()
                    .select_related('social_account', 'project')
                    .get(pk=post.pk)
                )

            metrics = _fetch_metrics(post)
            if metrics.get('deleted'):
                project = post.project
                post_id = post.id
                post.delete()
                try:
                    from apps.videos.tasks import _sync_project_post_status
                    _sync_project_post_status(project)
                except Exception as sync_exc:
                    logger.warning("Project status sync failed after deleting removed post %s: %s", post_id, sync_exc)
                updated += 1
                continue
            if metrics:
                # Keep the highest known count so manual in-app share records are not
                # overwritten by platforms that do not expose live share metrics.
                post.likes_count = _merge_metric(post.likes_count, metrics.get('likes'))
                post.comments_count = _merge_metric(post.comments_count, metrics.get('comments'))
                post.shares_count = _merge_metric(post.shares_count, metrics.get('shares'))
                post.views_count = _merge_metric(post.views_count, metrics.get('views'))
                post.reach = _merge_metric(post.reach, metrics.get('reach'))
                post.analytics_updated_at = timezone.now()
                post.save(update_fields=[
                    'likes_count', 'comments_count', 'shares_count',
                    'views_count', 'reach', 'analytics_updated_at'
                ])

                total = post.likes_count + post.comments_count + post.shares_count
                reach = post.reach or post.views_count or 1
                PostAnalytics.objects.create(
                    scheduled_post=post,
                    likes=post.likes_count,
                    comments=post.comments_count,
                    shares=post.shares_count,
                    views=post.views_count,
                    reach=post.reach,
                    engagement_rate=round((total / reach) * 100, 2) if reach else 0,
                    raw_data=metrics,
                )
                updated += 1
        except Exception as e:
            logger.warning(f"Analytics fetch failed for post {post.id}: {e}")

    return updated


def _merge_metric(existing_value, new_value):
    existing = int(existing_value or 0)
    if new_value is None:
        return existing

    try:
        incoming = int(new_value)
    except (TypeError, ValueError):
        return existing

    return max(existing, incoming)


def _fetch_metrics(post) -> dict:
    """Fetch metrics from the appropriate platform API"""
    platform = post.social_account.platform
    access_token = post.social_account.get_access_token()
    post_id = post.platform_post_id

    if platform == 'instagram':
        return _instagram_metrics(post_id, access_token)
    elif platform == 'facebook':
        return _facebook_metrics(post_id, access_token)
    elif platform == 'linkedin':
        return _linkedin_metrics(post_id, access_token)
    elif platform == 'youtube':
        return _youtube_metrics(post_id, access_token, post.social_account)
    return {}


def _youtube_metrics(video_id: str, access_token: str, social_account) -> dict:
    """Fetch YouTube video statistics using Data API v3."""
    import os
    if not video_id:
        return {}

    def _get_token(token):
        """Try to refresh token if needed."""
        return token

    def _refresh_access_token(account):
        """Refresh Google OAuth token using stored refresh token."""
        refresh_token = account.get_refresh_token() if hasattr(account, 'get_refresh_token') else None
        if not refresh_token:
            return None
        client_id = os.environ.get('GOOGLE_CLIENT_ID', '')
        client_secret = os.environ.get('GOOGLE_CLIENT_SECRET', '')
        if not client_id or not client_secret:
            return None
        try:
            with httpx.Client(timeout=15) as client:
                resp = client.post(
                    'https://oauth2.googleapis.com/token',
                    data={
                        'grant_type': 'refresh_token',
                        'refresh_token': refresh_token,
                        'client_id': client_id,
                        'client_secret': client_secret,
                    },
                    headers={'Content-Type': 'application/x-www-form-urlencoded'},
                )
                data = resp.json()
                new_token = data.get('access_token')
                if new_token:
                    account.set_access_token(new_token)
                    account.save()
                    return new_token
        except Exception as e:
            logger.warning('YouTube token refresh failed: %s', e)
        return None

    try:
        with httpx.Client(timeout=20) as client:
            def _fetch(token):
                return client.get(
                    'https://www.googleapis.com/youtube/v3/videos',
                    params={'part': 'statistics,status', 'id': video_id},
                    headers={'Authorization': f'Bearer {token}'},
                )

            current_token = access_token
            resp = _fetch(current_token)

            # Handle 401 — try refreshing token once
            if resp.status_code == 401:
                refreshed = _refresh_access_token(social_account)
                if refreshed:
                    current_token = refreshed
                    resp = _fetch(current_token)
                    if resp.status_code == 401:
                        return {}

            if resp.status_code == 404:
                return {'deleted': True, 'message': 'YouTube video was removed from the platform.'}

            data = resp.json()
            items = data.get('items') or []
            if not items:
                return {}

            stats = items[0].get('statistics') or {}
            shares = _fetch_youtube_shares(client, current_token, video_id)
            return {
                'likes':    int(stats.get('likeCount') or 0),
                'views':    int(stats.get('viewCount') or 0),
                'comments': int(stats.get('commentCount') or 0),
                'shares':   shares,
                'reach':    int(stats.get('viewCount') or 0),
            }
    except Exception as e:
        logger.warning('YouTube analytics fetch failed for video %s: %s', video_id, e)
        return {}


def _fetch_youtube_shares(client: httpx.Client, token: str, video_id: str) -> int:
    """Fetch share count from YouTube Analytics API (separate from Data API)."""
    from datetime import date, timedelta
    try:
        today = date.today().isoformat()
        start_date = (date.today() - timedelta(days=730)).isoformat()
        resp = client.get(
            'https://youtubeanalytics.googleapis.com/v2/reports',
            params={
                'ids': 'channel==MINE',
                'startDate': start_date,
                'endDate': today,
                'metrics': 'shares',
                'dimensions': 'video',
                'filters': f'video=={video_id}',
            },
            headers={'Authorization': f'Bearer {token}'},
        )
        if not resp.is_success:
            return 0
        rows = (resp.json().get('rows') or [])
        if rows and len(rows[0]) >= 2:
            return int(rows[0][1] or 0)
        return 0
    except Exception as e:
        logger.debug('YouTube shares fetch failed for video %s: %s', video_id, e)
        return 0


def _instagram_metrics(media_id: str, token: str) -> dict:
    """Fetch Instagram media insights"""
    try:
        with httpx.Client(timeout=30) as client:
            # Basic fields
            resp = client.get(
                f'https://graph.facebook.com/v18.0/{media_id}',
                params={
                    'fields': 'like_count,comments_count',
                    'access_token': token,
                }
            )
            if resp.status_code == 404:
                return {'deleted': True, 'message': 'Instagram post was removed from the platform.'}
            data = resp.json()
            if data.get('error'):
                message = str(data['error'].get('message', ''))
                if 'Unsupported get request' in message or 'does not exist' in message:
                    return {'deleted': True, 'message': 'Instagram post was removed from the platform.'}

            # Insights (requires business account)
            insights_resp = client.get(
                f'https://graph.facebook.com/v18.0/{media_id}/insights',
                params={
                    'metric': 'impressions,reach,saved,video_views,shares',
                    'access_token': token,
                }
            )
            insights = {
                item['name']: item['values'][0]['value']
                for item in insights_resp.json().get('data', [])
            }

            return {
                'likes': data.get('like_count', 0),
                'comments': data.get('comments_count', 0),
                'shares': insights.get('shares', 0),
                'views': insights.get('video_views', 0),
                'reach': insights.get('reach', 0),
                'impressions': insights.get('impressions', 0),
                'saved': insights.get('saved', 0),
            }
    except Exception as e:
        logger.debug(f"Instagram metrics error: {e}")
        return {}


def _facebook_metrics(post_id: str, token: str) -> dict:
    """Fetch Facebook post insights"""
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.get(
                f'https://graph.facebook.com/v18.0/{post_id}',
                params={
                    'fields': 'likes.summary(true),comments.summary(true),shares,views',
                    'access_token': token,
                }
            )
            if resp.status_code == 404:
                return {'deleted': True, 'message': 'Facebook post was removed from the platform.'}
            data = resp.json()
            if data.get('error'):
                message = str(data['error'].get('message', ''))
                if 'Unsupported get request' in message or 'does not exist' in message:
                    return {'deleted': True, 'message': 'Facebook post was removed from the platform.'}
            return {
                'likes': data.get('likes', {}).get('summary', {}).get('total_count', 0),
                'comments': data.get('comments', {}).get('summary', {}).get('total_count', 0),
                'shares': data.get('shares', {}).get('count', 0),
                'views': data.get('views', 0),
            }
    except Exception as e:
        logger.debug(f"Facebook metrics error: {e}")
        return {}


def _linkedin_metrics(post_id: str, token: str) -> dict:
    """Fetch LinkedIn post statistics"""
    try:
        metrics = {'likes': 0, 'comments': 0, 'shares': 0, 'views': 0, 'debug': {}}

        with httpx.Client(timeout=30) as client:
            if _is_linkedin_deleted_via_posts_api(client, token, post_id):
                return {
                    'deleted': True,
                    'message': 'LinkedIn post was removed from the platform.',
                    'debug': {'source': 'posts_api', 'status': 'deleted'},
                }

            social_action_stats = _linkedin_social_actions_metrics(client, token, post_id)
            if social_action_stats:
                metrics['likes'] = social_action_stats.get('likes', metrics['likes'])
                metrics['comments'] = social_action_stats.get('comments', metrics['comments'])
                metrics['shares'] = social_action_stats.get('shares', metrics['shares'])
            else:
                social_actions_resp = client.get(
                    f'https://api.linkedin.com/v2/socialActions/{post_id}',
                    headers={'Authorization': f'Bearer {token}'},
                )
                if _is_linkedin_deleted_response(social_actions_resp):
                    return {'deleted': True, 'message': 'LinkedIn post was removed from the platform.'}
                social_actions_resp.raise_for_status()
                social_data = social_actions_resp.json()
                metrics['likes'] = social_data.get('likesSummary', {}).get('totalLikes', 0)
                metrics['comments'] = social_data.get('commentsSummary', {}).get('totalFirstLevelComments', 0)
                metrics['shares'] = _extract_linkedin_share_count(social_data)

            from apps.social.models import ScheduledPost
            post = ScheduledPost.objects.select_related('social_account').filter(platform_post_id=post_id).first()
            organization_urn = _resolve_linkedin_organization_urn(post.social_account) if post else ''

            if organization_urn.startswith('urn:li:organization:'):
                share_stats = _linkedin_share_statistics(client, token, organization_urn, post_id)
                if share_stats:
                    metrics['shares'] = max(metrics['shares'], share_stats.get('shares', metrics['shares']))
                    metrics['views'] = share_stats.get('views', metrics['views'])
                    metrics['likes'] = max(metrics['likes'], share_stats.get('likes', metrics['likes']))
                    metrics['comments'] = max(metrics['comments'], share_stats.get('comments', metrics['comments']))
                    metrics['debug'] = share_stats.get('debug', metrics['debug'])
            else:
                member_stats = _linkedin_member_post_statistics(client, token, post_id)
                if member_stats:
                    metrics['shares'] = max(metrics['shares'], member_stats.get('shares', metrics['shares']))
                    metrics['views'] = max(metrics['views'], member_stats.get('views', metrics['views']))
                    metrics['likes'] = max(metrics['likes'], member_stats.get('likes', metrics['likes']))
                    metrics['comments'] = max(metrics['comments'], member_stats.get('comments', metrics['comments']))
                    metrics['debug'] = member_stats.get('debug', metrics['debug'])

            # LinkedIn often exposes likes/comments but not impressions for personal posts.
            # Use engagement-based views as a safe fallback so the app still shows activity.
            metrics['views'] = max(metrics['views'], metrics['likes'] + metrics['comments'] + metrics['shares'])
            return metrics
    except Exception as e:
        logger.debug(f"LinkedIn metrics error: {e}")
        return {}


def _linkedin_share_statistics(client: httpx.Client, token: str, organization_urn: str, post_id: str) -> dict:
    """
    Fetch LinkedIn share statistics for the concrete post URN.
    LinkedIn exposes share statistics for either share URNs or UGC post URNs,
    so we try both request shapes and return the first valid response.
    """
    headers = {
        'Authorization': f'Bearer {token}',
        'Linkedin-Version': LINKEDIN_API_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
    }

    candidates = []
    if post_id.startswith('urn:li:share:'):
        candidates.append({'shares': f'List({post_id})'})
        candidates.append({'shares[0]': post_id})
    if post_id.startswith('urn:li:ugcPost:'):
        candidates.append({'ugcPosts': f'List({post_id})'})
        candidates.append({'ugcPosts[0]': post_id})
    if not candidates:
        candidates.append({'shares': f'List({post_id})'})
        candidates.append({'ugcPosts': f'List({post_id})'})
        candidates.append({'shares[0]': post_id})
        candidates.append({'ugcPosts[0]': post_id})

    debug = {
        'source': 'organizationalEntityShareStatistics',
        'status': 'no_rows',
    }

    for extra_params in candidates:
        response = client.get(
            'https://api.linkedin.com/rest/organizationalEntityShareStatistics',
            headers=headers,
            params={
                'q': 'organizationalEntity',
                'organizationalEntity': organization_urn,
                **extra_params,
            },
        )

        if response.status_code in {404, 410}:
            continue

        if not response.is_success:
            debug = {
                'source': 'organizationalEntityShareStatistics',
                'status': 'access_limited',
                'http_status': response.status_code,
            }
            continue

        try:
            payload = response.json()
        except Exception:
            continue

        elements = payload.get('elements') or []
        if not elements:
            debug = {
                'source': 'organizationalEntityShareStatistics',
                'status': 'no_rows',
                'requested': extra_params,
            }
            continue

        element = elements[0] or {}
        totals = element.get('totalShareStatistics') or {}
        debug = {
            'source': 'organizationalEntityShareStatistics',
            'status': 'ok',
            'requested': extra_params,
        }
        stats = {
            'likes': totals.get('likeCount', 0),
            'comments': totals.get('commentCount', 0),
            'shares': totals.get('shareCount', 0),
            'views': totals.get('impressionCount', 0),
        }
        notification_fallback = _linkedin_share_notification_statistics(client, token, organization_urn, post_id)
        if notification_fallback:
            stats['shares'] = max(stats['shares'], notification_fallback.get('shares', 0))
            stats['likes'] = max(stats['likes'], notification_fallback.get('likes', 0))
            stats['comments'] = max(stats['comments'], notification_fallback.get('comments', 0))
            stats['views'] = max(stats['views'], notification_fallback.get('views', 0))
            if notification_fallback.get('debug'):
                debug = notification_fallback['debug']
        stats['debug'] = debug
        return stats

    fallback = _linkedin_share_notification_statistics(client, token, organization_urn, post_id)
    if fallback and 'debug' not in fallback:
        fallback['debug'] = debug
    return fallback


def _linkedin_share_notification_statistics(client: httpx.Client, token: str, organization_urn: str, post_id: str) -> dict:
    """
    Fallback for share/repost counts using organization notifications.
    LinkedIn can expose share activity through notifications even when the
    dedicated share-statistics endpoint returns no rows for the post URN.
    """
    shares = 0
    share_rows = 0
    share_mention_rows = 0
    access_limited = False
    for action in ('SHARE', 'SHARE_MENTION'):
        for source_post in _linkedin_source_post_candidates(post_id):
            response = client.get(
                'https://api.linkedin.com/rest/organizationalEntityNotifications',
                headers={
                    'Authorization': f'Bearer {token}',
                    'Linkedin-Version': LINKEDIN_API_VERSION,
                    'X-Restli-Protocol-Version': '2.0.0',
                },
                params={
                    'q': 'criteria',
                    'organizationalEntity': organization_urn,
                    'actions': f'List({action})',
                    'sourcePost': source_post,
                },
            )

            if response.status_code in {401, 403}:
                access_limited = True
                continue
            if response.status_code in {404, 410} or not response.is_success:
                continue

            payload = _safe_json(response)
            elements = payload.get('elements') or []
            if action == 'SHARE':
                share_rows += len(elements)
            else:
                share_mention_rows += len(elements)
            for item in elements:
                if _linkedin_item_mentions_post(item, post_id):
                    shares += 1

    if not shares:
        if access_limited:
            return {
                'likes': 0,
                'comments': 0,
                'shares': 0,
                'views': 0,
                'debug': {
                    'source': 'organizationalEntityNotifications',
                    'status': 'access_limited',
                    'share_rows': share_rows,
                    'share_mention_rows': share_mention_rows,
                },
            }
        return {
            'likes': 0,
            'comments': 0,
            'shares': 0,
            'views': 0,
            'debug': {
                'source': 'organizationalEntityNotifications',
                'status': 'no_rows',
                'share_rows': share_rows,
                'share_mention_rows': share_mention_rows,
            },
        }

    return {
        'likes': 0,
        'comments': 0,
        'shares': shares,
        'views': 0,
        'debug': {
            'source': 'organizationalEntityNotifications',
            'status': 'share_rows' if share_rows else 'share_mention_rows',
            'share_rows': share_rows,
            'share_mention_rows': share_mention_rows,
        },
    }


def _linkedin_member_post_statistics(client: httpx.Client, token: str, post_id: str) -> dict:
    """
    Fetch LinkedIn analytics for a personal member post.

    This is the correct source for reshares on member-owned posts. LinkedIn
    expects the post entity to be expressed as a share or ugcPost URN.
    """
    headers = {
        'Authorization': f'Bearer {token}',
        'Linkedin-Version': LINKEDIN_API_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
    }

    for entity in _linkedin_member_post_entity_candidates(post_id):
        response = client.get(
            'https://api.linkedin.com/rest/memberCreatorPostAnalytics',
            headers=headers,
            params={
                'q': 'entity',
                'entity': entity,
                'queryType': 'RESHARE',
                'aggregation': 'TOTAL',
            },
        )

        if response.status_code in {404, 410} or not response.is_success:
            continue

        payload = _safe_json(response)
        elements = payload.get('elements') or []
        if not elements:
            continue

        item = elements[0] or {}
        count = item.get('count')
        if count is None and isinstance(item.get('metricType'), dict):
            count = item.get('count', 0)

        if count is None:
            continue

        try:
            reshare_count = max(0, int(count))
        except (TypeError, ValueError):
            continue

        return {
            'likes': 0,
            'comments': 0,
            'shares': reshare_count,
            'views': 0,
            'debug': {
                'source': 'memberCreatorPostAnalytics',
                'status': 'ok',
                'entity': entity,
                'queryType': 'RESHARE',
            },
        }

    return {
        'likes': 0,
        'comments': 0,
        'shares': 0,
        'views': 0,
        'debug': {
            'source': 'memberCreatorPostAnalytics',
            'status': 'no_rows',
            'queryType': 'RESHARE',
        },
    }


def _resolve_linkedin_organization_urn(social_account) -> str:
    """
    Normalize the LinkedIn organization identifier used for analytics.
    Publishing accepts either a raw numeric page ID or a full URN, but the
    share statistics endpoint requires an organization URN.
    """
    candidates = [
        str(getattr(social_account, 'page_id', '') or '').strip(),
        str(getattr(social_account, 'platform_user_id', '') or '').strip(),
    ]

    for candidate in candidates:
        if not candidate:
            continue
        if candidate.startswith('urn:li:organization:'):
            return candidate
        if candidate.isdigit():
            return f'urn:li:organization:{candidate}'
    return ''


def _linkedin_social_actions_metrics(client: httpx.Client, token: str, post_id: str) -> dict:
    """
    Fetch LinkedIn social action counts using the current REST shape.
    LinkedIn can return the summary directly or inside an elements list, and
    some responses expose share/repost totals under different summary keys.
    """
    headers = {
        'Authorization': f'Bearer {token}',
        'Linkedin-Version': LINKEDIN_API_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
    }

    response = client.get(
        'https://api.linkedin.com/rest/socialActions',
        headers=headers,
        params={'ids': f'List({post_id})'},
    )

    if response.status_code in {404, 410} or not response.is_success:
        return {}

    try:
        payload = response.json()
    except Exception:
        return {}

    candidates = []
    if isinstance(payload, dict):
        candidates.append(payload)
        elements = payload.get('elements') or []
        if elements and isinstance(elements[0], dict):
            candidates.append(elements[0])

    for item in candidates:
        likes_summary = item.get('likesSummary') or {}
        comments_summary = item.get('commentsSummary') or {}
        shares = _extract_linkedin_share_count(item)

        likes = likes_summary.get('totalLikes')
        if likes is None:
            likes = likes_summary.get('aggregatedTotalLikes', 0)

        comments = comments_summary.get('totalFirstLevelComments')
        if comments is None:
            comments = comments_summary.get('aggregatedTotalComments', 0)

        if likes or comments or shares or 'likesSummary' in item or 'commentsSummary' in item:
            return {
                'likes': likes or 0,
                'comments': comments or 0,
                'shares': shares or 0,
            }

    return {}


def _extract_linkedin_share_count(payload) -> int:
    """
    Try multiple LinkedIn response shapes to find a share/repost total.
    """
    if not isinstance(payload, dict):
        return 0

    nested_keys = [
        ('sharesSummary', 'totalShares'),
        ('sharesSummary', 'aggregatedTotalShares'),
        ('sharesSummary', 'count'),
        ('repostsSummary', 'totalReposts'),
        ('repostsSummary', 'aggregatedTotalReposts'),
        ('repostsSummary', 'count'),
        ('totalShareStatistics', 'shareCount'),
        ('shareSummary', 'totalShares'),
        ('shareSummary', 'count'),
    ]
    for parent_key, child_key in nested_keys:
        parent = payload.get(parent_key)
        if isinstance(parent, dict):
            value = parent.get(child_key)
            if value is not None:
                try:
                    return max(0, int(value))
                except (TypeError, ValueError):
                    pass

    direct_keys = ['shareCount', 'shares', 'sharesCount', 'repostCount', 'reposts', 'repostsCount']
    for key in direct_keys:
        value = payload.get(key)
        if value is not None:
            try:
                return max(0, int(value))
            except (TypeError, ValueError):
                pass

    elements = payload.get('elements')
    if isinstance(elements, list):
        for item in elements:
            if not isinstance(item, dict):
                continue
            share_count = _extract_linkedin_share_count(item)
            if share_count:
                return share_count

    return 0


def _is_linkedin_deleted_via_posts_api(client: httpx.Client, token: str, post_id: str) -> bool:
    """
    LinkedIn's Posts API is the authoritative place to verify whether a post still exists.
    The docs state that a missing post returns 404 NOT_FOUND, and deletion is idempotent.
    """
    headers = {
        'Authorization': f'Bearer {token}',
        'Linkedin-Version': LINKEDIN_API_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
    }

    encoded_post_id = quote(post_id, safe='')
    response = client.get(
        f'{LINKEDIN_POSTS_BASE_URL}/{encoded_post_id}',
        headers=headers,
        params={'viewContext': 'AUTHOR'},
    )

    if response.status_code in {404, 410}:
        return True

    try:
        payload = response.json()
    except Exception:
        payload = {}

    error = payload.get('error') if isinstance(payload, dict) else {}
    message_bits = [
        str(response.text or ''),
        str(payload.get('message', '') if isinstance(payload, dict) else ''),
        str(error.get('message', '') if isinstance(error, dict) else ''),
        str(error.get('errorDescription', '') if isinstance(error, dict) else ''),
        str(error.get('serviceErrorCode', '') if isinstance(error, dict) else ''),
    ]
    haystack = ' '.join(message_bits).lower()

    return any(marker in haystack for marker in (
        'not_found',
        'not found',
        'content not found',
        'requested post was not found',
        'the requested post was not found',
    ))


def _is_linkedin_deleted_response(response) -> bool:
    """
    LinkedIn can report removed posts with different non-success responses
    depending on the endpoint and API revision.
    Treat any clear "missing post" response as deleted so the app can sync
    the removal across dashboards.
    """
    if response.status_code in {404, 410}:
        return True

    try:
        payload = response.json()
    except Exception:
        payload = {}

    error = payload.get('error') if isinstance(payload, dict) else {}
    message_bits = [
        str(response.text or ''),
        str(payload.get('message', '') if isinstance(payload, dict) else ''),
        str(error.get('message', '') if isinstance(error, dict) else ''),
        str(error.get('errorDescription', '') if isinstance(error, dict) else ''),
        str(error.get('serviceErrorCode', '') if isinstance(error, dict) else ''),
    ]
    haystack = ' '.join(message_bits).lower()

    missing_markers = [
        'removed from the platform',
        'deleted from the platform',
        'not found',
        'does not exist',
        'no such post',
        'resource not found',
        'content not available',
        'unknown entity',
    ]
    return any(marker in haystack for marker in missing_markers)


def collect_recent_activity_notifications(post, limit: int = 8) -> list[dict]:
    """
    Build user-facing activity notifications for a published post.

    LinkedIn exposes actor data for likes/comments, and share/repost events can
    be discovered through organization notifications. Views are only available as
    aggregate counts, so they are not emitted as person-level notifications.
    """
    platform = getattr(getattr(post, 'social_account', None), 'platform', '')
    if platform != 'linkedin' or not getattr(post, 'platform_post_id', ''):
        return []

    try:
        token = post.social_account.get_access_token()
    except Exception:
        return []

    post_id = post.platform_post_id
    events = []

    try:
        with httpx.Client(timeout=30) as client:
            if _is_linkedin_deleted_via_posts_api(client, token, post_id):
                return []

            events.extend(_linkedin_like_events(client, token, post, limit))
            events.extend(_linkedin_comment_events(client, token, post, limit))
            events.extend(_linkedin_share_events(client, token, post, limit))
    except Exception as exc:
        logger.debug("LinkedIn activity notification fetch failed for post %s: %s", post.id, exc)
        return []

    events.extend(_linkedin_share_delta_events(post, events))

    deduped = {}
    for event in events:
        deduped[event['id']] = event

    return sorted(
        deduped.values(),
        key=lambda item: (item.get('updatedAt') or 0, item.get('total') or 0),
        reverse=True,
    )[:limit]


def _linkedin_share_delta_events(post, existing_events: list[dict] | None = None) -> list[dict]:
    """
    Emit a synthetic share notification when LinkedIn exposes a higher share
    count but the API does not return a concrete share activity row.

    This keeps the UI in sync for LinkedIn posts that only surface aggregate
    counts, while avoiding duplicate rows when the app already recorded a
    manual share event for the same analytics refresh window.
    """
    if getattr(getattr(post, 'social_account', None), 'platform', '') != 'linkedin':
        return []

    current_shares = int(getattr(post, 'shares_count', 0) or 0)
    if current_shares <= 0:
        return []

    existing_events = existing_events or []
    latest_snapshot = (
        post.analytics
        .order_by('-snapshot_at')
        .values('shares', 'snapshot_at')
        .first()
    )
    if not latest_snapshot:
        return []

    baseline_shares = int(latest_snapshot.get('shares') or 0)
    delta = current_shares - baseline_shares
    if delta <= 0:
        return []

    snapshot_at = latest_snapshot.get('snapshot_at')
    latest_manual_share = (
        post.activity_events
        .filter(event_type='share')
        .order_by('-created_at')
        .values('created_at')
        .first()
    )
    if latest_manual_share and snapshot_at and latest_manual_share['created_at'] >= snapshot_at:
        return []

    if snapshot_at:
        snapshot_ms = int(snapshot_at.timestamp() * 1000)
        if any(
            str(event.get('type', '')).lower() == 'share'
            and int(event.get('updatedAt') or 0) >= snapshot_ms
            for event in existing_events
        ):
            return []

    updated_at = int((snapshot_at or timezone.now()).timestamp() * 1000)
    plural = 's' if delta != 1 else ''
    return [_build_activity_event(
        post=post,
        event_type='share',
        actor_name='LinkedIn member',
        actor_urn='',
        updated_at=updated_at,
        message=f'{delta} LinkedIn member{plural} shared your post "{post.project.title}" on LinkedIn',
        detail='shared your post',
        total=delta,
    )]


def _linkedin_like_events(client: httpx.Client, token: str, post, limit: int) -> list[dict]:
    response = client.get(
        f'https://api.linkedin.com/rest/socialActions/{quote(post.platform_post_id, safe="")}/likes',
        headers={
            'Authorization': f'Bearer {token}',
            'Linkedin-Version': LINKEDIN_API_VERSION,
            'X-Restli-Protocol-Version': '2.0.0',
        },
        params={
            'count': min(limit, 50),
            'projection': '(elements*(actor~,actor,created,lastModified,id,object))',
        },
    )

    if response.status_code in {404, 410} or not response.is_success:
        return []

    payload = _safe_json(response)
    items = payload.get('elements') or []
    events = []
    for item in items[:limit]:
        actor_urn = _linkedin_actor_urn(item)
        actor_name = _linkedin_actor_name(client, token, item, actor_urn)
        created = _linkedin_event_timestamp(item)
        events.append(_build_activity_event(
            post=post,
            event_type='like',
            actor_name=actor_name,
            actor_urn=actor_urn,
            updated_at=created,
            message=f"{actor_name} liked your post \"{post.project.title}\" on LinkedIn",
            detail='liked your post',
            total=1,
        ))
    return events


def _linkedin_comment_events(client: httpx.Client, token: str, post, limit: int) -> list[dict]:
    response = client.get(
        f'https://api.linkedin.com/rest/socialActions/{quote(post.platform_post_id, safe="")}/comments',
        headers={
            'Authorization': f'Bearer {token}',
            'Linkedin-Version': LINKEDIN_API_VERSION,
            'X-Restli-Protocol-Version': '2.0.0',
        },
        params={
            'count': min(limit, 50),
            'projection': '(elements*(actor~,actor,message,created,lastModified,id,object))',
        },
    )

    if response.status_code in {404, 410} or not response.is_success:
        return []

    payload = _safe_json(response)
    items = payload.get('elements') or []
    events = []
    for item in items[:limit]:
        actor_urn = _linkedin_actor_urn(item)
        actor_name = _linkedin_actor_name(client, token, item, actor_urn)
        created = _linkedin_event_timestamp(item)
        comment_text = ''
        message = item.get('message') or {}
        if isinstance(message, dict):
            comment_text = str(message.get('text', '') or '').strip()
        detail = comment_text or 'commented on your post'
        events.append(_build_activity_event(
            post=post,
            event_type='comment',
            actor_name=actor_name,
            actor_urn=actor_urn,
            updated_at=created,
            message=f"{actor_name} commented on your post \"{post.project.title}\" on LinkedIn",
            detail=detail,
            total=1,
        ))
    return events


def _linkedin_share_events(client: httpx.Client, token: str, post, limit: int) -> list[dict]:
    social_account = post.social_account
    organization_urn = _resolve_linkedin_organization_urn(social_account)
    if not organization_urn:
        return []

    events = []
    published_at = getattr(post, 'published_at', None)
    time_range = {}
    if published_at:
        time_range['timeRange.start'] = int(published_at.timestamp() * 1000)
        time_range['timeRange.end'] = int(timezone.now().timestamp() * 1000)

    for action in ('SHARE', 'SHARE_MENTION'):
        for source_post in _linkedin_source_post_candidates(post.platform_post_id):
            response = client.get(
                'https://api.linkedin.com/rest/organizationalEntityNotifications',
                headers={
                    'Authorization': f'Bearer {token}',
                    'Linkedin-Version': LINKEDIN_API_VERSION,
                    'X-Restli-Protocol-Version': '2.0.0',
                },
                params={
                    'q': 'criteria',
                    'organizationalEntity': organization_urn,
                    'actions': f'List({action})',
                    'sourcePost': source_post,
                    **time_range,
                },
            )

            if response.status_code in {404, 410} or not response.is_success:
                continue

            payload = _safe_json(response)
            items = payload.get('elements') or []
            for item in items[:limit]:
                if not _linkedin_item_mentions_post(item, post.platform_post_id):
                    continue
                actor_urn = _linkedin_share_actor_urn(item)
                actor_name = _linkedin_actor_name_from_urn(client, token, actor_urn) if actor_urn else 'Someone'
                created = item.get('lastModifiedAt') or item.get('updatedAt') or 0
                events.append(_build_activity_event(
                    post=post,
                    event_type='share',
                    actor_name=actor_name,
                    actor_urn=actor_urn,
                    updated_at=created,
                    message=f"{actor_name} shared your post \"{post.project.title}\" on LinkedIn",
                    detail='shared your post',
                    total=1,
                ))
    return events


def _build_activity_event(post, event_type: str, actor_name: str, actor_urn: str, updated_at: int, message: str, detail: str, total: int) -> dict:
    safe_actor = actor_urn or actor_name or 'unknown'
    return {
        'id': f'{post.id}-{event_type}-{safe_actor}-{updated_at}',
        'type': event_type,
        'username': actor_name or 'LinkedIn member',
        'profileName': actor_name or 'LinkedIn member',
        'actorId': _extract_actor_id(actor_urn),
        'title': post.project.title or 'Untitled post',
        'platform': 'LinkedIn',
        'platformKey': 'linkedin',
        'postId': str(post.id),
        'postUrl': post.platform_url or None,
        'updatedAt': int(updated_at or 0),
        'message': message,
        'detail': detail,
        'total': total,
        'analyticsTarget': f'/analytics?post={post.id}&event={event_type}&platform=linkedin',
        'actorUrn': actor_urn or '',
    }


def _extract_actor_id(actor_urn: str) -> str:
    if not actor_urn:
        return ''

    actor_urn = str(actor_urn).strip()
    if not actor_urn:
        return ''

    if actor_urn.startswith('urn:li:person:'):
        return actor_urn.split(':')[-1]
    if actor_urn.startswith('urn:li:organization:'):
        return actor_urn.split(':')[-1]
    return actor_urn.split(':')[-1]


def _linkedin_actor_urn(item: dict) -> str:
    actor = item.get('actor') or item.get('created', {}).get('actor') or item.get('lastModified', {}).get('actor')
    if actor:
        return str(actor)
    created = item.get('created') or {}
    impersonator = created.get('impersonator') if isinstance(created, dict) else ''
    return str(impersonator or '')


def _linkedin_share_actor_urn(item: dict) -> str:
    decorated = item.get('decoratedGeneratedActivity') or {}
    share = decorated.get('share') if isinstance(decorated, dict) else {}
    if isinstance(share, dict):
        owner = share.get('owner')
        if owner:
            return str(owner)
    decorated_source = item.get('decoratedSourcePost') or {}
    if isinstance(decorated_source, dict):
        owner = decorated_source.get('owner')
        if owner:
            return str(owner)
    return str(item.get('sourcePost', '') or '')


def _linkedin_actor_name(client: httpx.Client, token: str, item: dict, actor_urn: str) -> str:
    decorated = item.get('actor~')
    if isinstance(decorated, dict):
        name = _linkedin_profile_name(decorated)
        if name:
            return name
    return _linkedin_actor_name_from_urn(client, token, actor_urn)


def _linkedin_actor_name_from_urn(client: httpx.Client, token: str, actor_urn: str) -> str:
    if not actor_urn:
        return 'LinkedIn member'

    if actor_urn.startswith('urn:li:organization:'):
        return actor_urn.split(':')[-1]

    if not actor_urn.startswith('urn:li:person:'):
        return actor_urn.split(':')[-1]

    actor_id = actor_urn.split(':')[-1]
    if not actor_id:
        return 'LinkedIn member'

    headers = {
        'Authorization': f'Bearer {token}',
        'Linkedin-Version': LINKEDIN_API_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
    }

    for url in (
        f'https://api.linkedin.com/rest/people/(id:{quote(actor_id, safe="")})',
        f'https://api.linkedin.com/v2/people/(id:{quote(actor_id, safe="")})',
    ):
        try:
            response = client.get(url, headers=headers)
        except Exception:
            continue
        if not response.is_success:
            continue
        payload = _safe_json(response)
        if payload:
            name = _linkedin_profile_name(payload)
            if name:
                return name

    return actor_id


def _linkedin_profile_name(payload: dict) -> str:
    if not isinstance(payload, dict):
        return ''

    localized_first = payload.get('localizedFirstName')
    localized_last = payload.get('localizedLastName')
    if localized_first or localized_last:
        return ' '.join(part for part in [localized_first, localized_last] if part).strip()

    first = payload.get('firstName') or {}
    last = payload.get('lastName') or {}
    if isinstance(first, dict) and isinstance(last, dict):
        first_text = (first.get('localized') or {}).get('en_US') or ''
        last_text = (last.get('localized') or {}).get('en_US') or ''
        if first_text or last_text:
            return ' '.join(part for part in [first_text, last_text] if part).strip()

    for key in ('vanityName', 'name', 'localizedName', 'localizedHeadline'):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    return ''


def _linkedin_event_timestamp(item: dict) -> int:
    created = item.get('created') or {}
    if isinstance(created, dict):
        timestamp = created.get('time')
        if timestamp:
            return int(timestamp)
    last_modified = item.get('lastModified') or {}
    if isinstance(last_modified, dict):
        timestamp = last_modified.get('time')
        if timestamp:
            return int(timestamp)
    timestamp = item.get('lastModifiedAt') or item.get('createdAt') or 0
    return int(timestamp or 0)


def _safe_json(response) -> dict:
    try:
        payload = response.json()
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _linkedin_item_mentions_post(item, post_id: str) -> bool:
    target = _normalize_linkedin_reference(post_id)
    if not target:
        return False

    def walk(value) -> bool:
        if value is None:
            return False
        if isinstance(value, dict):
            return any(walk(v) for v in value.values())
        if isinstance(value, list):
            return any(walk(v) for v in value)

        candidate = _normalize_linkedin_reference(value)
        if not candidate:
            return False

        return candidate == target or candidate.endswith(target) or target.endswith(candidate)

    return walk(item)


def _normalize_linkedin_reference(value) -> str:
    if value is None:
        return ''

    text = str(value).strip()
    if not text:
        return ''

    text = text.replace('urn:li:share:', '').replace('urn:li:ugcPost:', '').replace('urn:li:activity:', '')
    text = text.rstrip('/').split('?', 1)[0]
    if '#' in text:
        text = text.rsplit('#', 1)[-1]
    if '/' in text:
        text = text.rsplit('/', 1)[-1]
    if ':' in text:
        text = text.rsplit(':', 1)[-1]
    return text.strip()


def _linkedin_source_post_candidates(post_id: str) -> list[str]:
    """
    LinkedIn notifications can reference the original post using either the
    share/ugc URN or the underlying activity URN. Try both shapes so we don't
    miss reshare events when LinkedIn returns a different canonical form.
    """
    normalized = _normalize_linkedin_reference(post_id)
    candidates = []
    if post_id:
        candidates.append(str(post_id))
    if normalized:
        candidates.append(f'urn:li:activity:{normalized}')
        candidates.append(f'urn:li:share:{normalized}')
        candidates.append(f'urn:li:ugcPost:{normalized}')

    deduped = []
    for candidate in candidates:
        if candidate and candidate not in deduped:
            deduped.append(candidate)
    return deduped


def _linkedin_member_post_entity_candidates(post_id: str) -> list[str]:
    """
    Build entity parameter candidates for memberCreatorPostAnalytics.

    LinkedIn expects the entity query value to be wrapped as either
    `(share:urn:li:share:...)` or `(ugc:urn:li:ugcPost:...)`.
    """
    normalized = _normalize_linkedin_reference(post_id)
    bases = []

    for candidate in (post_id, normalized):
        if not candidate:
            continue
        candidate = str(candidate).strip()
        if candidate.startswith('urn:li:share:'):
            bases.append(f'(share:{quote(candidate, safe="")})')
        elif candidate.startswith('urn:li:ugcPost:'):
            bases.append(f'(ugc:{quote(candidate, safe="")})')
        elif candidate.startswith('urn:li:activity:'):
            tail = candidate.split(':')[-1]
            if tail:
                bases.append(f'(share:{quote(f"urn:li:share:{tail}", safe="")})')
                bases.append(f'(ugc:{quote(f"urn:li:ugcPost:{tail}", safe="")})')
        elif candidate.isdigit():
            bases.append(f'(share:{quote(f"urn:li:share:{candidate}", safe="")})')
            bases.append(f'(ugc:{quote(f"urn:li:ugcPost:{candidate}", safe="")})')
        else:
            bases.append(f'(share:{quote(candidate, safe="")})')
            bases.append(f'(ugc:{quote(candidate, safe="")})')

    deduped = []
    for candidate in bases:
        if candidate and candidate not in deduped:
            deduped.append(candidate)
    return deduped
