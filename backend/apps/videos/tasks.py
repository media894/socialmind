"""
Celery tasks for async video generation and publishing.
Pipeline: Groq/OpenAI script → ElevenLabs voice → Pexels footage → FFmpeg render
"""
import logging
import time
import os
import tempfile
from urllib.parse import urljoin
from celery import shared_task
from django.utils import timezone
from apps.videos.video_uploader import get_platform_render_preset, render_platform_video
from apps.social.publishers import PublishAPIError

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def generate_video_task(self, project_id: str, api_key_config_id: int):
    from apps.videos.models import VideoProject, GenerationLog
    from apps.users.models import APIKeyConfig
    from apps.videos.ai_services import get_ai_service
    from apps.videos.video_engine import VideoGenerator, generate_voice_audio

    try:
        project = VideoProject.objects.get(id=project_id)
        api_key_config = APIKeyConfig.objects.get(id=api_key_config_id)
    except Exception as e:
        logger.error(f"Task setup failed: {e}")
        return {'error': str(e)}

    self.update_state(state='PROGRESS', meta={'step': 'Starting AI generation', 'progress': 5})

    try:
        user = project.user

        # ── Step 1: Generate Script ─────────────────────────────────
        self.update_state(state='PROGRESS', meta={'step': 'Generating script with AI', 'progress': 15})
        start_time = time.time()

        ai_service = get_ai_service(api_key_config.service, api_key_config.get_key())
        script_result = ai_service.generate_script(
            topic=project.topic,
            duration=project.duration_seconds,
            tone=project.tone or 'professional',
            audience=project.target_audience or 'general audience',
            content_type=project.content_type,
        )

        # Extract clean script text
        import re, json as _json
        raw_script = script_result.get('script', '') or script_result.get('narration', '') or str(script_result)
        raw_script = raw_script.strip()
        if raw_script.startswith('{'):
            try:
                parsed = _json.loads(raw_script)
                raw_script = parsed.get('script', parsed.get('narration', raw_script))
            except:
                pass
        raw_script = re.sub(r'```.*?```', '', raw_script, flags=re.DOTALL).strip()

        project.ai_script = raw_script
        project.save()

        GenerationLog.objects.create(
            project=project,
            ai_service=api_key_config.service,
            prompt_used=project.topic,
            response_data=script_result if isinstance(script_result, dict) else {'script': raw_script},
            tokens_used=script_result.get('_tokens', 0) if isinstance(script_result, dict) else 0,
            success=True,
            duration_seconds=time.time() - start_time,
        )

        # ── Step 2: Generate Caption & Hashtags ─────────────────────
        self.update_state(state='PROGRESS', meta={'step': 'Creating captions & hashtags', 'progress': 30})

        try:
            caption = ai_service.generate_caption(project.ai_script)
            hashtags = ai_service.generate_hashtags(project.topic)
        except Exception as e:
            logger.warning(f"Caption/hashtag generation failed: {e}")
            caption = f"🎬 {project.title}"
            hashtags = []

        project.ai_caption = caption
        project.ai_hashtags = hashtags
        project.save()

        # ── Step 3: Generate Voice Audio (ElevenLabs) ───────────────
        self.update_state(state='PROGRESS', meta={'step': 'Generating voice narration', 'progress': 45})

        audio_path = None
        try:
            elevenlabs_key = user.api_keys.filter(service='elevenlabs', is_active=True).first()
            if elevenlabs_key:
                audio_path = generate_voice_audio(
                    text=project.ai_script,
                    api_key=elevenlabs_key.get_key(),
                    output_path=f'/tmp/socialmind/{project_id}_voice.mp3'
                )
                if audio_path:
                    logger.info(f"✅ Voice audio generated for {project_id}")
        except Exception as e:
            logger.warning(f"Voice generation skipped: {e}")

        # ── Step 4: Get Pexels API Key ───────────────────────────────
        pexels_api_key = None
        try:
            pexels_key = user.api_keys.filter(service='pexels', is_active=True).first()
            if pexels_key:
                pexels_api_key = pexels_key.get_key()
                logger.info("✅ Pexels key found — will use real footage")
        except Exception as e:
            logger.warning(f"Pexels key check failed: {e}")

        # ── Step 5: Render Video ─────────────────────────────────────
        self.update_state(state='PROGRESS', meta={'step': 'Rendering video', 'progress': 60})

        generator = VideoGenerator()
        logo_path = _resolve_project_logo_path(project)
        video_result = generator.generate_text_video(
            script=project.ai_script,
            title=project.title,
            duration=project.duration_seconds,
            theme=_tone_to_theme(project.tone),
            output_filename=f"{project_id}.mp4",
            logo_path=logo_path,
            audio_path=audio_path,
            pexels_api_key=pexels_api_key,
            topic=project.topic,
        )

        # ── Step 6: Generate Thumbnail ───────────────────────────────
        self.update_state(state='PROGRESS', meta={'step': 'Creating thumbnail', 'progress': 85})

        thumbnail_path = None
        if video_result.get('output_path'):
            thumbnail_path = generator.generate_thumbnail(video_result['output_path'])

        # ── Step 7: Save to Storage ──────────────────────────────────
        self.update_state(state='PROGRESS', meta={'step': 'Saving video', 'progress': 92})\

        output_path = video_result.get('output_path')
        pexels_url = video_result.get('pexels_url', '')
        if output_path:
            video_url = _upload_to_storage(output_path, f"videos/{project_id}.mp4")
        elif pexels_url:
            video_url = pexels_url
            logger.info(f"Using Pexels URL directly: {video_url}")
        else:
            video_url = ''
        thumbnail_url = _upload_to_storage(thumbnail_path, f"thumbnails/{project_id}.jpg") if thumbnail_path else ''

        # ── Update Project ───────────────────────────────────────────
        project.video_url = video_url
        project.thumbnail_url = thumbnail_url
        project.duration_actual = video_result.get('duration', project.duration_seconds)
        project.file_size = video_result.get('file_size', 0)
        project.resolution = video_result.get('resolution', '')
        project.status = 'review'
        project.save()

        has_voice = '🎙️ + ' if audio_path else ''
        has_footage = '📹 + ' if video_result.get('has_footage') else ''
        logger.info(f"✅ Video generated: {has_footage}{has_voice}📝 for {project_id}")

        self.update_state(state='PROGRESS', meta={'step': 'Complete!', 'progress': 100})
        return {'success': True, 'project_id': project_id, 'video_url': video_url}

    except Exception as e:
        logger.error(f"Video generation failed for {project_id}: {e}")
        try:
            project.status = 'failed'
            project.save()
            GenerationLog.objects.create(
                project=project,
                ai_service=api_key_config.service if 'api_key_config' in locals() else 'unknown',
                prompt_used=project.topic,
                response_data={},
                success=False,
                error_message=str(e),
            )
        except Exception:
            pass
        raise self.retry(exc=e)


@shared_task(bind=True, max_retries=3)
def publish_post_task(self, scheduled_post_id: str):
    return execute_publish_post(scheduled_post_id, retry_task=self)


def execute_publish_post(scheduled_post_id: str, retry_task=None):
    from apps.social.models import ScheduledPost, PublishLog
    from apps.social.publishers import PublishAPIError, get_publisher

    try:
        post = ScheduledPost.objects.select_related('project', 'social_account').get(id=scheduled_post_id)
    except Exception as e:
        logger.error(f"Post {scheduled_post_id} not found: {e}")
        return

    from apps.users.access_control import user_has_video_access, block_user_scheduled_content
    if post.status == 'blocked' or not user_has_video_access(post.user):
        block_user_scheduled_content(post.user, reason='publish_access_blocked')
        post.refresh_from_db()
        logger.info("Skipped blocked scheduled post %s for user %s", scheduled_post_id, post.user_id)
        return {'success': False, 'blocked': True}

    post.status = 'publishing'
    post.save()

    try:
        publisher = get_publisher(post.social_account.platform)
        video_source = _resolve_platform_video_source(
            post.project,
            post.social_account.platform,
            platform_subtype=post.platform_subtype or '',
        )
        result = publisher.publish(
            social_account=post.social_account,
            video_path=video_source['local_path'],
            video_url=video_source['public_url'],
            title=post.project.title,
            caption=post.final_caption,
            hashtags=post.final_hashtags,
            scheduled_at=post.scheduled_at,
            video_ratio=video_source.get('ratio', ''),
            platform_subtype=post.platform_subtype or '',
        )

        post.status = 'published'
        post.published_at = timezone.now()
        post.platform_post_id = result.get('post_id', '')
        post.platform_url = result.get('url', '')
        post.error_message = ''
        post.save()
        _sync_project_post_status(post.project)

        logger.info(
            "Published post %s successfully | platform=%s | account=%s | post_id=%s",
            scheduled_post_id,
            post.social_account.platform,
            post.social_account.platform_username,
            result.get('post_id'),
        )
        PublishLog.objects.create(
            scheduled_post=post,
            success=True,
            response_data={
                'result': result,
                'platform': post.social_account.platform,
                'account_username': post.social_account.platform_username,
                'video_ratio': video_source.get('ratio', ''),
                'video_resolution': video_source.get('resolution', ''),
            },
        )
        return {'success': True, 'post_id': result.get('post_id')}

    except Exception as e:
        error_payload = _build_publish_error_payload(post, e)
        logger.exception(
            "Publishing failed for %s | platform=%s | account=%s | payload=%s",
            scheduled_post_id,
            post.social_account.platform,
            post.social_account.platform_username,
            error_payload,
        )
        post.status = 'failed'
        post.error_message = error_payload['message']
        post.save()
        _sync_project_post_status(post.project)
        PublishLog.objects.create(
            scheduled_post=post,
            success=False,
            response_data=error_payload,
            error_message=error_payload['message'],
        )
        if retry_task is not None and not _is_permanent_publish_error(e):
            raise retry_task.retry(exc=e)
        raise


@shared_task
def check_scheduled_posts():
    from apps.social.models import ScheduledPost
    from apps.users.access_control import expire_user_subscription_if_needed
    now = timezone.now()

    # Clean up posts stuck in publishing for more than 15 minutes
    stuck_cutoff = now - timezone.timedelta(minutes=15)
    stuck_posts = ScheduledPost.objects.filter(
        status='publishing',
        updated_at__lte=stuck_cutoff
    )
    for p in stuck_posts:
        p.status = 'failed'
        p.error_message = 'Publishing timed out. The background task worker process restarted or failed to finish.'
        p.save()
        _sync_project_post_status(p.project)

    for user_id in ScheduledPost.objects.filter(status='scheduled').values_list('user_id', flat=True).distinct():
        try:
            from django.contrib.auth import get_user_model
            user = get_user_model().objects.get(pk=user_id)
            expire_user_subscription_if_needed(user)
        except Exception as exc:
            logger.warning("Subscription expiry check failed for user %s: %s", user_id, exc)

    due_posts = ScheduledPost.objects.filter(
        status='scheduled',
        scheduled_at__lte=now,
        project__status__in=['approved', 'scheduled'],
    ).select_related('project', 'social_account')
    triggered = 0
    for post in due_posts:
        from apps.users.access_control import user_has_video_access, block_user_scheduled_content
        if not user_has_video_access(post.user):
            block_user_scheduled_content(post.user, reason='scheduled_publish_quota_limit')
            continue
        updated = ScheduledPost.objects.filter(
            id=post.id,
            status='scheduled',
        ).update(status='publishing')
        if not updated:
            continue
        try:
            publish_post_task.delay(str(post.id))
            triggered += 1
        except Exception as exc:
            logger.warning("Failed to dispatch scheduled post %s: %s", post.id, exc)
            ScheduledPost.objects.filter(id=post.id, status='publishing').update(status='scheduled')
    logger.info(f"Triggered {triggered} scheduled posts")
    return {'triggered': triggered}


def _sync_project_post_status(project):
    from apps.social.models import ScheduledPost

    related = ScheduledPost.objects.filter(project=project)
    if related.filter(status='publishing').exists():
        next_status = 'publishing'
    elif related.filter(status='scheduled').exists():
        next_status = 'scheduled'
    elif related.filter(status='published').exists():
        next_status = 'published'
    elif related.filter(status='failed').exists():
        next_status = 'failed'
    else:
        next_status = 'approved'

    if project.status != next_status:
        project.status = next_status
        project.save(update_fields=['status', 'updated_at'])


@shared_task
def reset_monthly_quotas():
    from django.contrib.auth import get_user_model
    User = get_user_model()
    count = User.objects.all().update(videos_generated_this_month=0)
    logger.info(f"Reset quotas for {count} users")
    return {'reset': count}


@shared_task
def expire_subscriptions():
    from django.contrib.auth import get_user_model
    from apps.users.access_control import expire_user_subscription_if_needed

    User = get_user_model()
    candidates = User.objects.exclude(subscription_plan='free').exclude(
        subscription_status='expired'
    ).filter(subscription_started_at__isnull=False)
    expired = 0
    for user in candidates:
        if expire_user_subscription_if_needed(user):
            expired += 1
    logger.info("Expired %s subscription(s)", expired)
    return {'expired': expired}


def _tone_to_theme(tone: str) -> str:
    mapping = {
        'professional': 'professional', 'corporate': 'professional',
        'vibrant': 'vibrant', 'energetic': 'vibrant', 'fun': 'vibrant',
        'minimal': 'minimal', 'clean': 'minimal',
        'dark': 'dark', 'elegant': 'dark',
        'natural': 'nature', 'eco': 'nature',
    }
    return mapping.get((tone or '').lower(), 'professional')


def _upload_to_cloudinary(local_path: str, s3_key: str) -> str:
    """
    Upload video to Cloudinary and return a permanent public URL.
    Requires CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET
    to be set in environment/.env.
    Sign up free at https://cloudinary.com — free tier gives 25GB storage & bandwidth.
    """
    try:
        import cloudinary
        import cloudinary.uploader
        from django.conf import settings

        cloud_name = getattr(settings, 'CLOUDINARY_CLOUD_NAME', '') or os.environ.get('CLOUDINARY_CLOUD_NAME', '')
        api_key = getattr(settings, 'CLOUDINARY_API_KEY', '') or os.environ.get('CLOUDINARY_API_KEY', '')
        api_secret = getattr(settings, 'CLOUDINARY_API_SECRET', '') or os.environ.get('CLOUDINARY_API_SECRET', '')
        cloudinary_url = getattr(settings, 'CLOUDINARY_URL', '') or os.environ.get('CLOUDINARY_URL', '')

        if not (cloud_name and api_key and api_secret) and not cloudinary_url:
            return ''

        if cloudinary_url:
            cloudinary.config(url=cloudinary_url)
        else:
            cloudinary.config(cloud_name=cloud_name, api_key=api_key, api_secret=api_secret)

        # Use s3_key as the public_id (strip extension)
        public_id = s3_key.replace('/', '_').rsplit('.', 1)[0]
        result = cloudinary.uploader.upload(
            local_path,
            resource_type='video',
            public_id=public_id,
            overwrite=True,
            invalidate=True,
        )
        url = result.get('secure_url', '')
        if url:
            logger.info('Cloudinary upload succeeded: %s', url)
        return url
    except ImportError:
        logger.warning('cloudinary package not installed. Run: pip install cloudinary')
        return ''
    except Exception as e:
        logger.warning('Cloudinary upload failed: %s', e)
        return ''


def _upload_to_storage(local_path: str, s3_key: str) -> str:
    if not local_path:
        return ''
    from pathlib import Path as P
    if not P(local_path).exists():
        return ''

    # ── 1. Try S3 ────────────────────────────────────────────────────
    try:
        import boto3
        from django.conf import settings
        if getattr(settings, 'AWS_ACCESS_KEY_ID', ''):
            s3 = boto3.client('s3',
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                region_name=settings.AWS_S3_REGION_NAME,
            )
            s3.upload_file(local_path, settings.AWS_STORAGE_BUCKET_NAME, s3_key,
                           ExtraArgs={'ContentType': 'video/mp4'})
            url = s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': settings.AWS_STORAGE_BUCKET_NAME, 'Key': s3_key},
                ExpiresIn=604800
            )
            logger.info('S3 upload succeeded with presigned URL')
            return url
    except Exception as e:
        logger.warning(f"S3 upload failed, trying Cloudinary: {e}")

    # ── 2. Try Cloudinary (free public CDN, no server-exposure needed) ─
    cloudinary_url = _upload_to_cloudinary(local_path, s3_key)
    if cloudinary_url:
        return cloudinary_url

    # ── 3. Fall back to local media (only works if PUBLIC_APP_URL is a real public HTTPS domain) ─
    import shutil
    from django.conf import settings
    dest = P(settings.MEDIA_ROOT) / s3_key
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(local_path, str(dest))
    local_relative_url = f"{settings.MEDIA_URL}{s3_key}"

    # Warn loudly if PUBLIC_APP_URL is not set or is localhost — Meta cannot fetch it
    public_base = getattr(settings, 'PUBLIC_APP_URL', '').rstrip('/')
    if not public_base or 'localhost' in public_base or '127.0.0.1' in public_base:
        logger.error(
            'CRITICAL: Video saved locally but PUBLIC_APP_URL is "%s". '
            'Meta (Instagram/Facebook) cannot fetch videos from localhost. '
            'Set PUBLIC_APP_URL to your real public domain, or configure S3/Cloudinary. '
            'Post will fail with "Unable to fetch video file from URL".',
            public_base,
        )
    return local_relative_url


def _ensure_public_url(url: str) -> str:
    from django.conf import settings

    if not url:
        return ''
    if url.startswith(('http://', 'https://')):
        # Reject localhost/private URLs — Meta cannot reach them
        if 'localhost' in url or '127.0.0.1' in url or url.startswith('http://'):
            public_base = getattr(settings, 'PUBLIC_APP_URL', '').rstrip('/')
            if public_base and 'localhost' not in public_base and '127.0.0.1' not in public_base:
                path_part = '/' + url.split('/', 3)[-1] if url.count('/') >= 3 else url
                return urljoin(f"{public_base}/", path_part.lstrip('/'))
            logger.warning(
                '_ensure_public_url: URL "%s" is not publicly reachable by Meta. '
                'Set a real PUBLIC_APP_URL or use S3/Cloudinary storage.',
                url,
            )
        return url

    public_base = getattr(settings, 'PUBLIC_APP_URL', '').rstrip('/')
    if public_base and 'localhost' not in public_base and '127.0.0.1' not in public_base:
        return urljoin(f"{public_base}/", url.lstrip('/'))

    logger.warning(
        '_ensure_public_url: Cannot build a public URL from "%s". '
        'PUBLIC_APP_URL is not set or is localhost. Meta will reject this URL.',
        url,
    )
    return ''


def _render_platform_variant(project, platform: str, source_path: str) -> dict:
    preset = get_platform_render_preset(platform, source_path)
    variant_dir = os.path.join(tempfile.gettempdir(), 'socialmind', 'platform_variants', str(project.id))
    try:
        variant_path = render_platform_video(source_path, platform, output_dir=variant_dir)
    except (RuntimeError, FileNotFoundError, OSError) as exc:
        # ffmpeg not installed — skip re-encoding and use the source file directly
        if 'ffmpeg' in str(exc).lower() or isinstance(exc, FileNotFoundError):
            logger.warning(
                "ffmpeg unavailable for platform %s, using source file as-is: %s",
                platform, exc,
            )
            variant_path = source_path
        else:
            raise
    return {
        'path': variant_path,
        'ratio': preset.get('ratio', ''),
        'resolution': preset.get('resolution', ''),
        'source_ratio': preset.get('source_ratio', None),
        'available_ratios': preset.get('available_ratios', []),
    }


def _resolve_platform_video_source(project, platform: str, platform_subtype: str = '') -> dict:
    from django.conf import settings

    source = _resolve_project_video_source(project)
    local_path = source.get('local_path') or ''
    public_url = source.get('public_url', '')

    # On Render (ephemeral filesystem), the local file may not exist after a restart.
    # Download from S3/public URL to /tmp so all platforms can publish.
    if (not local_path or not os.path.exists(local_path)) and public_url and public_url.startswith('https://'):
        import tempfile, httpx as _httpx
        try:
            logger.info('Local file missing for platform %s, downloading from %s', platform, public_url)
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
            with _httpx.Client(timeout=120, follow_redirects=True) as client:
                r = client.get(public_url)
                r.raise_for_status()
                tmp.write(r.content)
            local_path = tmp.name
            logger.info('Downloaded video to %s for publishing', local_path)
        except Exception as dl_exc:
            logger.warning('Could not download video from %s: %s', public_url, dl_exc)
            # For instagram/facebook we can pass the URL directly without a local file
            if platform in {'instagram', 'facebook'}:
                return {
                    'local_path': '',
                    'public_url': public_url,
                    'ratio': '',
                    'resolution': '',
                }
            raise Exception(f'Could not find the source video file for publishing. Download failed: {dl_exc}')

    if not local_path or not os.path.exists(local_path):
        raise Exception('Could not find the source video file for publishing.')

    resolved_platform = platform
    subtype = str(platform_subtype or '').lower()
    if platform == 'youtube' and subtype == 'shorts':
        # Shorts need the vertical variant so YouTube classifies the upload correctly.
        resolved_platform = 'youtube_shorts'
    elif platform == 'instagram' and subtype in {'post', 'feed', 'square'}:
        # Instagram feed posts should use the square variant when explicitly selected.
        resolved_platform = 'instagram_post'
    elif platform == 'instagram' and subtype in {'reel', 'reels'}:
        resolved_platform = 'instagram_reels'

    render_info = _render_platform_variant(project, resolved_platform, local_path)
    rendered_path = render_info['path']
    public_url = ''

    if platform in {'instagram', 'facebook'}:
        stored_url = _upload_to_storage(rendered_path, f"videos/platform_variants/{project.id}/{platform}.mp4")
        public_url = _ensure_public_url(stored_url)
        if not public_url:
            raise Exception(
                f'{platform.title()} publishing requires a public video URL. '
                'Configure PUBLIC_APP_URL or S3 storage so the rendered variant can be fetched by the platform.'
            )

    elif platform == 'linkedin':
        public_url = _ensure_public_url(source.get('public_url') or '')
    elif platform == 'youtube':
        public_url = _ensure_public_url(source.get('public_url') or '')
    else:
        public_url = _ensure_public_url(source.get('public_url') or '')

    return {
        'local_path': rendered_path,
        'public_url': public_url,
        'ratio': render_info['ratio'],
        'resolution': render_info['resolution'],
    }


def _resolve_project_video_source(project) -> dict:
    from django.conf import settings
    import tempfile
    import httpx

    public_url = (project.video_url or '').strip()
    local_path = ''

    if getattr(project, 'video_file', None):
        try:
            local_path = project.video_file.path
        except Exception:
            local_path = ''

    # If local file missing but we have a public URL (Cloudinary/S3), download it
    if (not local_path or not os.path.exists(local_path)) and public_url and public_url.startswith('http'):
        try:
            logger.info('Local file missing, downloading from %s', public_url)
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4', dir='/tmp')
            with httpx.Client(timeout=60, follow_redirects=True) as client:
                r = client.get(public_url)
                r.raise_for_status()
                tmp.write(r.content)
            local_path = tmp.name
            logger.info('Downloaded video to %s', local_path)
        except Exception as e:
            logger.warning('Failed to download video from URL: %s', e)

    if not public_url:
        relative_url = project.video_file.url
        public_base = getattr(settings, 'PUBLIC_APP_URL', '').rstrip('/')
        if public_base:
            public_url = f"{public_base}{relative_url}"

    if not local_path and public_url.startswith(settings.MEDIA_URL):
        relative_path = public_url[len(settings.MEDIA_URL):].lstrip('/')
        local_path = os.path.join(settings.MEDIA_ROOT, relative_path)

    if public_url and not public_url.startswith(('http://', 'https://')):
        public_base = getattr(settings, 'PUBLIC_APP_URL', '').rstrip('/')
        if public_base:
            public_url = urljoin(f"{public_base}/", public_url.lstrip('/'))

    return {
        'local_path': local_path,
        'public_url': public_url,
    }


def _resolve_project_logo_path(project) -> str:
    try:
        logo_asset = (
            project.assets.filter(asset_type='logo')
            .order_by('-uploaded_at')
            .first()
        )
        if logo_asset and getattr(logo_asset.file, 'path', ''):
            return logo_asset.file.path
    except Exception as exc:
        logger.warning("Failed to resolve logo asset for project %s: %s", getattr(project, 'id', ''), exc)
    return ''


def _build_publish_error_payload(post, exc: Exception) -> dict:
    details = dict(getattr(exc, 'details', {}) or {})
    response_json = details.get('response_json')
    api_error = response_json.get('error') if isinstance(response_json, dict) else {}

    payload = {
        'message': str(exc),
        'platform': getattr(post.social_account, 'platform', ''),
        'account_username': getattr(post.social_account, 'platform_username', ''),
        'social_account_id': str(getattr(post.social_account, 'id', '') or ''),
        'platform_user_id': getattr(post.social_account, 'platform_user_id', ''),
        'page_id': getattr(post.social_account, 'page_id', ''),
        'status_code': details.get('status_code'),
        'context': details.get('context', ''),
        'error_code': details.get('error_code'),
        'error_type': details.get('error_type'),
        'error_subcode': details.get('error_subcode'),
        'fbtrace_id': details.get('fbtrace_id'),
        'hint': details.get('hint', ''),
        'raw_body': details.get('raw_body', ''),
        'response_json': response_json if isinstance(response_json, dict) else {},
    }

    if isinstance(api_error, dict):
        payload['api_error'] = api_error

    return payload


def _is_permanent_publish_error(exc: Exception) -> bool:
    if not isinstance(exc, PublishAPIError):
        return False

    details = getattr(exc, 'details', {}) or {}
    status_code = int(details.get('status_code') or 0)
    error_code = int(details.get('error_code') or 0)

    if status_code in {400, 401, 403, 404}:
        return True
    if error_code in {10, 100, 190, 200}:
        return True
    return False
