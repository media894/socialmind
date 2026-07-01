import os
import re
import urllib.parse
import json
import httpx
from rest_framework import serializers, viewsets, status
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.http import HttpResponse
from .models import VideoProject, VideoTemplate, VideoAsset, GenerationLog
from .ai_services import get_ai_service
from apps.users.access_control import (
    block_user_scheduled_content,
    enforce_schedule_access,
    enforce_video_access,
)
from apps.users.models import UserActivityLog
from apps.users.views import log_activity


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def groq_proxy(request):
    payload = request.data.get('payload', {})
    groq_key = os.environ.get('GROQ_API_KEY') or request.data.get('groq_key', '')
    if not groq_key:
        return Response({'error': 'GROQ_API_KEY not configured on server'}, status=400)
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post('https://api.groq.com/openai/v1/chat/completions',
                headers={'Authorization': f'Bearer {groq_key}', 'Content-Type': 'application/json'},
                json=payload)
        return Response(resp.json(), status=resp.status_code)
    except httpx.RequestError as e:
        return Response({'error': str(e)}, status=502)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def groq_tts_proxy(request):
    groq_key = os.environ.get('GROQ_API_KEY') or request.data.get('groq_key', '')
    text = request.data.get('input', '')
    if not text:
        return Response({'error': 'input text required'}, status=400)

    # Try Groq TTS first if key available
    if groq_key:
        tts_attempts = [
            {'model': 'playai-tts', 'voice': 'Fritz-PlayAI'},
            {'model': 'playai-tts', 'voice': 'Aaliyah-PlayAI'},
        ]
        for attempt in tts_attempts:
            try:
                with httpx.Client(timeout=60) as client:
                    resp = client.post(
                        'https://api.groq.com/openai/v1/audio/speech',
                        headers={'Authorization': f'Bearer {groq_key}', 'Content-Type': 'application/json'},
                        json={'model': attempt['model'], 'voice': attempt['voice'], 'input': text, 'response_format': 'wav'},
                    )
                if resp.status_code == 200:
                    return HttpResponse(resp.content, content_type='audio/wav')
            except Exception:
                pass

    # Fallback: Google Translate TTS (free, no key required)
    try:
        chunks = [text[i:i+200] for i in range(0, len(text), 200)]
        audio_parts = []
        for chunk in chunks:
            encoded = urllib.parse.quote(chunk)
            url = f'https://translate.google.com/translate_tts?ie=UTF-8&q={encoded}&tl=en&client=tw-ob'
            with httpx.Client(timeout=30, follow_redirects=True) as client:
                resp = client.get(url, headers={'User-Agent': 'Mozilla/5.0'})
            if resp.status_code == 200:
                audio_parts.append(resp.content)
        if audio_parts:
            return HttpResponse(b''.join(audio_parts), content_type='audio/mpeg')
    except Exception:
        pass

    return Response({'error': 'TTS unavailable'}, status=503)


# ─── Serializers ────────────────────────────────────────────────────────────────

class GenerationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = GenerationLog
        fields = ('id', 'ai_service', 'success', 'tokens_used', 'cost_estimate',
                  'duration_seconds', 'error_message', 'created_at')


class VideoAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = VideoAsset
        fields = ('id', 'asset_type', 'file', 'file_url', 'original_filename',
                  'file_size', 'mime_type', 'uploaded_at')


class VideoProjectListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views"""
    class Meta:
        model = VideoProject
        fields = ('id', 'title', 'is_demo_seed', 'status', 'content_type', 'thumbnail_url',
                  'duration_seconds', 'ai_service', 'created_at', 'updated_at')


class VideoProjectDetailSerializer(serializers.ModelSerializer):
    assets = VideoAssetSerializer(many=True, read_only=True)
    generation_logs = GenerationLogSerializer(many=True, read_only=True)
    final_caption = serializers.ReadOnlyField()
    final_hashtags = serializers.ReadOnlyField()

    class Meta:
        model = VideoProject
        fields = '__all__'
        read_only_fields = ('id', 'user', 'ai_script', 'ai_caption', 'ai_hashtags',
                           'ai_keywords', 'video_url', 'thumbnail_url', 'duration_actual',
                           'file_size', 'generation_task_id', 'created_at', 'updated_at',
                           'approved_at', 'assets', 'generation_logs',
                           'final_caption', 'final_hashtags')


class VideoProjectCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = VideoProject
        fields = ('id', 'title', 'description', 'content_type', 'topic', 'target_audience',
                  'tone', 'duration_seconds', 'ai_service', 'status')
        read_only_fields = ('id', 'status')


# ─── Views ──────────────────────────────────────────────────────────────────────

class VideoProjectViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return VideoProjectListSerializer
        if self.action == 'create':
            return VideoProjectCreateSerializer
        return VideoProjectDetailSerializer

    def get_queryset(self):
        qs = VideoProject.objects.filter(user=self.request.user)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def create(self, request, *args, **kwargs):
        allowed, payload = enforce_video_access(request.user)
        if not allowed:
            return Response(payload, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def _quota_already_consumed(self, user, client_video_id):
        client_video_id = str(client_video_id or '').strip()
        if not client_video_id:
            return False
        return UserActivityLog.objects.filter(
            user=user,
            action='video_quota_consumed',
            metadata__client_video_id=client_video_id,
        ).exists()

    def _claim_legacy_quota_consumption(self, user, client_video_id):
        client_video_id = str(client_video_id or '').strip()
        if not client_video_id:
            return False

        legacy_logs = UserActivityLog.objects.filter(
            user=user,
            action='video_quota_consumed',
        ).order_by('-created_at')[:10]
        for log in legacy_logs:
            metadata = log.metadata if isinstance(log.metadata, dict) else {}
            if metadata.get('client_video_id'):
                continue
            if not str(log.detail or '').startswith('Video generated'):
                continue
            metadata['client_video_id'] = client_video_id
            metadata['legacy_client_video_id_claimed'] = True
            log.metadata = metadata
            log.save(update_fields=['metadata'])
            return True
        return False

    def _consume_video_creation(self, user, project=None, request=None, detail='Video created', client_video_id=''):
        client_video_id = str(client_video_id or '').strip()
        if self._quota_already_consumed(user, client_video_id):
            return

        type(user).objects.filter(pk=user.pk).update(
            videos_generated_this_month=F('videos_generated_this_month') + 1
        )
        user.refresh_from_db(fields=['videos_generated_this_month'])
        log_activity(
            user,
            'video_quota_consumed',
            detail=detail,
            metadata={
                'client_video_id': client_video_id,
                'project_id': str(project.id) if project else '',
                'project_title': getattr(project, 'title', '') if project else '',
                'project_status': getattr(project, 'status', '') if project else '',
                'videos_generated_this_month': user.videos_generated_this_month,
                'monthly_video_quota': user.effective_monthly_video_quota,
                'quota_remaining': user.quota_remaining,
            },
            ip_address=(
                request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
                if request and request.META.get('HTTP_X_FORWARDED_FOR')
                else request.META.get('REMOTE_ADDR') if request else None
            ),
        )
        if user.quota_remaining <= 0:
            block_user_scheduled_content(user, reason='quota_limit_reached')

    @action(detail=False, methods=['post'])
    def generate_caption(self, request):
        """Generate social copy for a manually uploaded video."""
        title = str(request.data.get('title') or '').strip()
        file_name = str(request.data.get('file_name') or '').strip()
        platform = str(request.data.get('platform') or 'instagram').strip().lower() or 'instagram'
        video_metadata = request.data.get('video_metadata') or {}
        frame_images = request.data.get('frame_images') or []
        if not isinstance(video_metadata, dict):
            video_metadata = {}
        if not isinstance(frame_images, list):
            frame_images = []
        frame_images = [
            image for image in frame_images[:3]
            if isinstance(image, str) and image.startswith('data:image/')
        ]
        topic = title or re.sub(r'\.[^.]+$', '', file_name).replace('_', ' ').replace('-', ' ').strip()
        topic = re.sub(r'\s+', ' ', topic).strip() or 'this video'

        def normalize_hashtags(raw_tags):
            if isinstance(raw_tags, str):
                raw_tags = re.split(r'[\s,]+', raw_tags)
            clean_tags = []
            for tag in raw_tags or []:
                normalized = '#' + str(tag).strip().lstrip('#').replace(' ', '')
                normalized = re.sub(r'[^#A-Za-z0-9_]', '', normalized)
                if len(normalized) > 1 and normalized not in clean_tags:
                    clean_tags.append(normalized)
            return clean_tags[:10]

        def fallback_copy():
            words = [
                word.lower()
                for word in re.findall(r'[A-Za-z0-9]+', topic)
                if len(word) > 2
            ]
            tags = []
            for word in words:
                tag = '#' + re.sub(r'[^A-Za-z0-9]', '', word.title())
                if tag not in tags:
                    tags.append(tag)
            tags.extend(['#Video', '#SocialMedia', '#ContentCreator'])
            tags = list(dict.fromkeys(tags))[:10]
            return {
                'caption': f'{topic.title()} is ready to share. Watch the full video and tell us what you think.',
                'hashtags': tags,
                'source': 'fallback',
            }

        def generate_visual_copy(openai_key):
            if not openai_key or not frame_images:
                return None

            metadata_bits = []
            if video_metadata.get('duration_seconds'):
                metadata_bits.append(f"{video_metadata.get('duration_seconds')} seconds")
            if video_metadata.get('width') and video_metadata.get('height'):
                metadata_bits.append(f"{video_metadata.get('width')}x{video_metadata.get('height')}")
            if video_metadata.get('mime_type'):
                metadata_bits.append(str(video_metadata.get('mime_type')))
            metadata_summary = ', '.join(metadata_bits) or 'metadata unavailable'

            content = [
                {
                    'type': 'text',
                    'text': (
                        f'Analyze these sampled frames from an uploaded social video and write post copy for {platform}.\n'
                        f'User title/topic: {topic}\n'
                        f'File name: {file_name or "unknown"}\n'
                        f'Video metadata: {metadata_summary}\n'
                        'Return strict JSON with keys "caption" and "hashtags". '
                        'Caption must be under 500 characters, specific to what is visible, natural, and include a clear CTA. '
                        'Hashtags must be an array of 6 to 10 relevant hashtags with # symbols.'
                    ),
                },
            ]
            content.extend({
                'type': 'image_url',
                'image_url': {'url': image},
            } for image in frame_images)

            with httpx.Client(timeout=60) as client:
                response = client.post(
                    'https://api.openai.com/v1/chat/completions',
                    headers={
                        'Authorization': f'Bearer {openai_key}',
                        'Content-Type': 'application/json',
                    },
                    json={
                        'model': 'gpt-4o',
                        'messages': [
                            {
                                'role': 'system',
                                'content': 'You create concise, accurate social media captions from uploaded video frames.',
                            },
                            {'role': 'user', 'content': content},
                        ],
                        'max_tokens': 500,
                        'response_format': {'type': 'json_object'},
                    },
                )
                response.raise_for_status()
                text = response.json()['choices'][0]['message']['content']

            parsed = json.loads(text)
            caption = str(parsed.get('caption') or '').strip()
            hashtags = normalize_hashtags(parsed.get('hashtags') or [])
            if not caption:
                return None
            return {
                'caption': caption,
                'hashtags': hashtags or fallback_copy()['hashtags'],
                'source': 'openai-vision',
            }

        service_candidates = []
        try:
            for service in ['groq', 'openai', 'deepseek']:
                config = request.user.api_keys.filter(service=service, is_active=True).first()
                if config:
                    service_candidates.append((service, config.get_key()))
        except Exception:
            pass

        env_candidates = [
            ('groq', os.environ.get('GROQ_API_KEY')),
            ('openai', os.environ.get('OPENAI_API_KEY')),
            ('deepseek', os.environ.get('DEEPSEEK_API_KEY')),
        ]
        service_candidates.extend((service, key) for service, key in env_candidates if key)

        for service_name, api_key in service_candidates:
            if service_name != 'openai':
                continue
            try:
                visual_copy = generate_visual_copy(api_key)
                if visual_copy:
                    return Response(visual_copy)
            except Exception:
                continue

        prompt = (
            f'Uploaded video title/topic: {topic}\n'
            f'File name: {file_name or "unknown"}\n'
            f'Video metadata: {video_metadata}\n'
            f'Write one engaging {platform} caption for the uploaded video. '
            'Keep it under 500 characters, natural, specific, and include a clear call to action.'
        )

        for service_name, api_key in service_candidates:
            try:
                service = get_ai_service(service_name, api_key)
                caption = service.generate_caption(prompt, platform=platform).strip()
                hashtags = service.generate_hashtags(topic, platform=platform, count=10)
                return Response({
                    'caption': caption,
                    'hashtags': normalize_hashtags(hashtags),
                    'source': service_name,
                })
            except Exception:
                continue

        return Response(fallback_copy())

    @action(detail=True, methods=['post'])
    def generate(self, request, pk=None):
        """Trigger AI generation for a video project"""
        project = self.get_object()

        if project.status == 'generating':
            return Response({'error': 'Generation already in progress'}, status=400)

        user = request.user
        allowed, payload = enforce_video_access(user)
        if not allowed:
            return Response({'error': payload['detail'], **payload}, status=429)

        # Get API key
        ai_service = project.ai_service
        try:
            api_key_config = user.api_keys.get(service=ai_service, is_active=True)
        except Exception:
            return Response({
                'error': f'No active API key found for {ai_service}. Please add one in Settings.'
            }, status=400)

        # Queue the generation task
        from .tasks import generate_video_task
        project.status = 'generating'
        project.save()

        task = generate_video_task.delay(str(project.id), api_key_config.id)
        project.generation_task_id = task.id
        project.save()

        self._consume_video_creation(
            user,
            project=project,
            request=request,
            detail='AI video generation started',
        )

        return Response({
            'message': 'Video generation started',
            'task_id': task.id,
            'project_id': str(project.id),
        })

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a video for publishing"""
        project = self.get_object()
        if project.status not in ['review', 'draft']:
            return Response({'error': f'Cannot approve video in {project.status} status'}, status=400)

        # Allow saving edits during approval
        if 'caption' in request.data:
            project.edited_caption = request.data['caption']
        if 'hashtags' in request.data:
            project.edited_hashtags = request.data['hashtags']
        if 'user_notes' in request.data:
            project.user_notes = request.data['user_notes']

        project.status = 'approved'
        project.approved_at = timezone.now()
        project.save()

        return Response(VideoProjectDetailSerializer(project).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject and send back to draft"""
        project = self.get_object()
        project.status = 'draft'
        project.save()
        return Response({'message': 'Video sent back to draft'})

    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        """Get generation status"""
        project = self.get_object()
        response_data = {
            'status': project.status,
            'task_id': project.generation_task_id,
        }
        if project.generation_task_id:
            from celery.result import AsyncResult
            task = AsyncResult(project.generation_task_id)
            response_data['task_status'] = task.status
            response_data['task_info'] = task.info if isinstance(task.info, dict) else {}
        return Response(response_data)

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload_asset(self, request, pk=None):
        """Upload an asset file to a project"""
        project = self.get_object()
        asset_type = request.data.get('asset_type')
        file = request.FILES.get('file')

        if not file or not asset_type:
            return Response({'error': 'file and asset_type are required'}, status=400)

        asset = VideoAsset.objects.create(
            project=project,
            asset_type=asset_type,
            file=file,
            original_filename=file.name,
            file_size=file.size,
            mime_type=file.content_type,
        )
        return Response(VideoAssetSerializer(asset).data, status=201)

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def import_local(self, request):
        """Import a browser-rendered local video so it can use the real publish pipeline."""
        allowed, payload = enforce_video_access(request.user)
        if not allowed:
            return Response({'error': payload['detail'], **payload}, status=429)

        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'Video file is required'}, status=400)

        hashtags = request.data.getlist('hashtags')
        if not hashtags and request.data.get('hashtags'):
            hashtags = [
                tag.strip() for tag in request.data.get('hashtags', '').split(',')
                if tag.strip()
            ]

        duration_value = request.data.get('duration_seconds') or 30
        try:
            duration_seconds = max(int(float(duration_value)), 1)
        except (TypeError, ValueError):
            duration_seconds = 30

        format_plan = request.data.get('format_plan', '')

        project = VideoProject.objects.create(
            user=request.user,
            title=request.data.get('title') or file.name,
            description=request.data.get('description', ''),
            topic=request.data.get('topic') or request.data.get('title') or file.name,
            content_type=request.data.get('content_type', 'promotional'),
            tone=request.data.get('tone', ''),
            duration_seconds=duration_seconds,
            ai_service='local-upload',
            status='approved',
            edited_caption=request.data.get('caption', ''),
            edited_hashtags=hashtags,
            platform_captions={},
            user_notes=format_plan,
            approved_at=timezone.now(),
        )

        project.video_file.save(file.name, file, save=False)
        project.file_size = getattr(file, 'size', None)
        project.format = (file.name.rsplit('.', 1)[-1].lower() if '.' in file.name else 'mp4')
        project.video_url = build_public_media_url(request, project.video_file.url)
        project.save()
        self._consume_video_creation(
            request.user,
            project=project,
            request=request,
            detail='Local video imported',
        )

        return Response(VideoProjectDetailSerializer(project).data, status=201)

    @action(detail=True, methods=['get'])
    def preview_variants(self, request, pk=None):
        """Return available platform aspect-ratio variants for a project."""
        from apps.videos.video_uploader import PLATFORM_RENDER_PRESETS, RATIO_PRESETS, get_platform_render_preset

        project = self.get_object()
        source_path = None
        if getattr(project, 'video_file', None):
            try:
                source_path = project.video_file.path
            except Exception:
                source_path = None

        variants = []
        platform_labels = {
            'instagram': 'Instagram Reel',
            'youtube':   'YouTube Shorts / Video',
            'facebook':  'Facebook Video',
            'linkedin':  'LinkedIn Video',
            'tiktok':    'TikTok',
        }
        for platform, config in PLATFORM_RENDER_PRESETS.items():
            preset = get_platform_render_preset(platform, source_path)
            ratio = preset['ratio']
            resolution = preset['resolution']
            variants.append({
                'platform':        platform,
                'label':           platform_labels.get(platform, platform.title()),
                'content_key':     platform,
                'ratio':           ratio,
                'aspect_ratio':    ratio,
                'resolution':      resolution,
                'available_ratios': preset['available_ratios'],
                'caption':         project.final_caption or '',
                'hashtags':        project.final_hashtags or [],
            })

        return Response({
            'project_id': str(project.id),
            'title':      project.title,
            'variants':   variants,
        })

    @action(detail=True, methods=['post'])
    def schedule_multi(self, request, pk=None):
        """Create ScheduledPost records for multiple platforms from a single approved project."""
        from apps.users.models import SocialAccount
        from apps.social.models import ScheduledPost
        from apps.social.views import ScheduledPostViewSet
        
        project = self.get_object()
        if project.status not in ('approved', 'review', 'scheduled', 'published'):
            return Response(
                {'error': 'Video must be approved before scheduling.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedules = request.data.get('schedules', [])
        if not schedules:
            return Response({'error': 'No schedules provided.'}, status=status.HTTP_400_BAD_REQUEST)
        allowed, payload = enforce_schedule_access(request.user, requested_count=len(schedules))
        if not allowed:
            return Response({'error': payload['detail'], **payload}, status=status.HTTP_403_FORBIDDEN)

        created_posts = []
        errors = []

        import json as _json
        try:
            platform_subtype_map = _json.loads(request.data.get('platform_subtype', '{}') or '{}')
        except Exception:
            platform_subtype_map = {}

        queue_helper = ScheduledPostViewSet()

        with transaction.atomic():
            for entry in schedules:
                social_account_id = entry.get('social_account')
                scheduled_at_raw = entry.get('scheduled_at', '')
                caption = entry.get('caption', '')
                hashtags = entry.get('hashtags') or []

                try:
                    account = SocialAccount.objects.get(
                        id=social_account_id, user=request.user, is_active=True
                    )
                except SocialAccount.DoesNotExist:
                    errors.append(f'Social account {social_account_id} not found or inactive.')
                    continue

                parsed_at = parse_datetime(str(scheduled_at_raw))
                if parsed_at is None:
                    errors.append(f'Invalid scheduled_at for account {social_account_id}.')
                    continue
                if timezone.is_naive(parsed_at):
                    parsed_at = timezone.make_aware(parsed_at, timezone.get_current_timezone())
                if parsed_at <= timezone.now() + timezone.timedelta(minutes=1):
                    errors.append(f'Scheduled time for {account.platform} must be at least 1 minute in the future.')
                    continue

                if isinstance(hashtags, str):
                    hashtags = [t.strip() for t in hashtags.replace(',', ' ').split() if t.strip()]

                post = ScheduledPost.objects.create(
                    user=request.user,
                    project=project,
                    social_account=account,
                    custom_caption=caption or project.final_caption or '',
                    custom_hashtags=hashtags or project.final_hashtags or [],
                    scheduled_at=parsed_at,
                    status='scheduled',
                    platform_subtype=platform_subtype_map.get(account.platform, ''),
                )
                queue_helper._queue_scheduled_post(post)
                created_posts.append(post)

        if errors and not created_posts:
            return Response({'error': '; '.join(errors)}, status=status.HTTP_400_BAD_REQUEST)

        if created_posts:
            log_activity(
                request.user,
                'post_scheduled',
                detail=f'Video scheduled to {len(created_posts)} social account(s)',
                metadata={
                    'project_id': str(project.id),
                    'project_title': project.title,
                    'post_ids': [str(post.id) for post in created_posts],
                    'platforms': [post.social_account.platform for post in created_posts],
                },
                ip_address=(
                    request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
                    if request.META.get('HTTP_X_FORWARDED_FOR')
                    else request.META.get('REMOTE_ADDR')
                ),
            )

        return Response(
            {
                'scheduled': len(created_posts),
                'errors': errors,
                'posts': [
                {
                    'id': str(p.id),
                    'platform': p.social_account.platform,
                    'account': p.social_account.platform_username,
                    'scheduled_at': p.scheduled_at,
                    'status': p.status,
                    'platform_subtype': p.platform_subtype,
                }
                    for p in created_posts
                ],
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def schedule_local(self, request):
        """Import a browser-rendered video and create scheduled social posts in one request."""
        client_video_id = str(request.data.get('client_video_id') or '').strip()
        client_video_source = str(request.data.get('client_video_source') or '').strip()
        quota_already_consumed = self._quota_already_consumed(request.user, client_video_id)
        if (
            not quota_already_consumed and
            client_video_source == 'ai_generator' and
            request.user.quota_remaining <= 0
        ):
            quota_already_consumed = self._claim_legacy_quota_consumption(request.user, client_video_id)
        if not quota_already_consumed:
            allowed, payload = enforce_video_access(request.user)
            if not allowed:
                return Response({'error': payload['detail'], **payload}, status=429)

        from apps.users.models import SocialAccount
        from apps.social.models import ScheduledPost
        from apps.social.views import ScheduledPostViewSet

        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'Video file is required'}, status=400)

        hashtags = request.data.getlist('hashtags')
        if not hashtags and request.data.get('hashtags'):
            hashtags = [
                tag.strip() for tag in request.data.get('hashtags', '').split(',')
                if tag.strip()
            ]

        duration_value = request.data.get('duration_seconds') or 30
        try:
            duration_seconds = max(int(float(duration_value)), 1)
        except (TypeError, ValueError):
            duration_seconds = 30

        format_plan = request.data.get('format_plan', '')

        import json as _json
        try:
            platform_subtype_map = _json.loads(request.data.get('platform_subtype', '{}') or '{}')
        except Exception:
            platform_subtype_map = {}

        schedules_payload = []
        schedules_raw = request.data.get('schedules', '')
        if schedules_raw:
            try:
                loaded = _json.loads(schedules_raw)
                if isinstance(loaded, list):
                    schedules_payload = loaded
            except Exception:
                schedules_payload = []

        account_ids = request.data.getlist('social_accounts')
        if not account_ids and request.data.get('social_accounts'):
            account_ids = [
                value.strip() for value in request.data.get('social_accounts', '').split(',')
                if value.strip()
            ]

        if schedules_payload:
            account_ids = [
                str(entry.get('social_account') or entry.get('social_account_id') or '')
                for entry in schedules_payload
                if entry.get('social_account') or entry.get('social_account_id')
            ]
        if not account_ids:
            return Response({'error': 'Select at least one connected social account'}, status=400)
        allowed, payload = enforce_schedule_access(
            request.user,
            requested_count=len(schedules_payload) if schedules_payload else len(account_ids),
        )
        if not allowed and request.data.get('local_subscription_active') == '1':
            local_status = str(request.data.get('local_subscription_status') or '').lower()
            local_started_at = parse_datetime(str(request.data.get('local_subscription_started_at') or ''))
            if local_status == 'active' and local_started_at:
                if timezone.is_naive(local_started_at):
                    local_started_at = timezone.make_aware(local_started_at, timezone.get_current_timezone())
                allowed = timezone.now() < local_started_at + timezone.timedelta(days=30)
        if not allowed:
            return Response({'error': payload['detail'], **payload}, status=status.HTTP_403_FORBIDDEN)

        id_field = SocialAccount._meta.get_field('id')

        def normalize_account_id(value):
            try:
                return id_field.get_prep_value(value)
            except (TypeError, ValueError):
                return None

        normalized_account_ids = []
        for account_id in account_ids:
            normalized = normalize_account_id(account_id)
            if normalized is None:
                return Response({'error': 'One or more selected social accounts are invalid'}, status=400)
            normalized_account_ids.append(normalized)
        account_ids = normalized_account_ids

        if schedules_payload:
            normalized_schedules = []
            for entry in schedules_payload:
                raw_account_id = entry.get('social_account') or entry.get('social_account_id')
                normalized = normalize_account_id(raw_account_id)
                if normalized is None:
                    return Response({'error': 'One or more selected social accounts are invalid'}, status=400)
                normalized_entry = dict(entry)
                normalized_entry['social_account'] = normalized
                normalized_schedules.append(normalized_entry)
            schedules_payload = normalized_schedules

        scheduled_at = request.data.get('scheduled_at')
        parsed_scheduled_at = None
        if scheduled_at:
            parsed_scheduled_at = parse_datetime(scheduled_at)
            if parsed_scheduled_at is None:
                return Response({'error': 'Invalid scheduled_at value'}, status=400)
            if timezone.is_naive(parsed_scheduled_at):
                parsed_scheduled_at = timezone.make_aware(parsed_scheduled_at, timezone.get_current_timezone())
            if parsed_scheduled_at <= timezone.now() + timezone.timedelta(minutes=1):
                return Response({'error': 'Pick a future date and time at least 1 minute ahead.'}, status=400)

        accounts = list(
            SocialAccount.objects.filter(
                user=request.user,
                is_active=True,
                id__in=account_ids,
            )
        )
        if len(accounts) != len(set(account_ids)):
            return Response({'error': 'One or more selected social accounts are invalid'}, status=400)
        accounts_by_id = {account.pk: account for account in accounts}
        schedule_errors = []

        with transaction.atomic():
            project = VideoProject.objects.create(
                user=request.user,
                title=request.data.get('title') or file.name,
                description=request.data.get('description', ''),
                topic=request.data.get('topic') or request.data.get('title') or file.name,
                content_type=request.data.get('content_type', 'promotional'),
                tone=request.data.get('tone', ''),
                duration_seconds=duration_seconds,
                ai_service='local-upload',
                status='scheduled',
                edited_caption=request.data.get('caption', ''),
                edited_hashtags=hashtags,
                platform_captions={},
                user_notes=format_plan,
                approved_at=timezone.now(),
            )

            # Try to upload to Cloudinary first so we have a permanent public URL (prevents 404s on ephemeral/free tier dynos)
            cloudinary_url = ''
            try:
                if not settings.DEFAULT_FILE_STORAGE.endswith('S3Boto3Storage'):
                    cloudinary_url = _upload_file_to_cloudinary(file)
            except Exception as e:
                logger.warning("Optional Cloudinary upload failed in schedule_local: %s", e)

            project.video_file.save(file.name, file, save=False)
            project.file_size = getattr(file, 'size', None)
            project.format = (file.name.rsplit('.', 1)[-1].lower() if '.' in file.name else 'mp4')
            if cloudinary_url:
                project.video_url = cloudinary_url
            else:
                project.video_url = build_public_media_url(request, project.video_file.url)
            project.save()

            created_posts = []
            queue_helper = ScheduledPostViewSet()
            if schedules_payload:
                for entry in schedules_payload:
                    social_account_id = entry.get('social_account') or entry.get('social_account_id')
                    if not social_account_id:
                        schedule_errors.append('Schedule entry is missing a social account.')
                        continue
                    account = accounts_by_id.get(social_account_id)
                    if account is None:
                        schedule_errors.append(f'Social account {social_account_id} was not found or is inactive.')
                        continue

                    entry_scheduled_at = entry.get('scheduled_at') or scheduled_at
                    parsed_entry_at = parse_datetime(str(entry_scheduled_at or ''))
                    if parsed_entry_at is None:
                        schedule_errors.append(f'Invalid scheduled_at for {account.platform}.')
                        continue
                    if timezone.is_naive(parsed_entry_at):
                        parsed_entry_at = timezone.make_aware(parsed_entry_at, timezone.get_current_timezone())
                    if parsed_entry_at <= timezone.now() + timezone.timedelta(minutes=1):
                        schedule_errors.append(f'Scheduled time for {account.platform} must be at least 1 minute in the future.')
                        continue

                    entry_hashtags = entry.get('hashtags') or hashtags
                    if isinstance(entry_hashtags, str):
                        entry_hashtags = [
                            tag.strip() for tag in entry_hashtags.replace(',', ' ').split()
                            if tag.strip()
                        ]

                    post = ScheduledPost.objects.create(
                        user=request.user,
                        project=project,
                        social_account=account,
                        custom_caption=entry.get('caption', request.data.get('caption', '')),
                        custom_hashtags=entry_hashtags,
                        scheduled_at=parsed_entry_at,
                        status='scheduled',
                        platform_subtype=entry.get('platform_subtype', '') or platform_subtype_map.get(account.platform, ''),
                    )
                    queue_helper._queue_scheduled_post(post)
                    created_posts.append(post)
            else:
                if parsed_scheduled_at is None:
                    return Response({'error': 'scheduled_at is required'}, status=400)
                for account in accounts:
                    post = ScheduledPost.objects.create(
                        user=request.user,
                        project=project,
                        social_account=account,
                        custom_caption=request.data.get('caption', ''),
                        custom_hashtags=hashtags,
                        scheduled_at=parsed_scheduled_at,
                        status='scheduled',
                        platform_subtype=platform_subtype_map.get(account.platform, ''),
                    )
                    queue_helper._queue_scheduled_post(post)
                    created_posts.append(post)

            if not created_posts:
                transaction.set_rollback(True)
                detail = '; '.join(schedule_errors) or 'No valid schedules were created.'
                return Response({'error': detail}, status=400)

        self._consume_video_creation(
            request.user,
            project=project,
            request=request,
            detail=f'Local video scheduled to {len(created_posts)} social account(s)',
            client_video_id=client_video_id,
        )

        return Response({
            'project': VideoProjectDetailSerializer(project).data,
            'posts': [
                {
                    'id': str(post.id),
                    'platform': post.social_account.platform,
                    'social_account': post.social_account_id,
                    'scheduled_at': post.scheduled_at,
                    'status': post.status,
                    'platform_subtype': post.platform_subtype,
                }
                for post in created_posts
            ],
        }, status=201)


def _upload_file_to_cloudinary(file) -> str:
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

        result = cloudinary.uploader.upload(
            file,
            resource_type='video',
            overwrite=True,
        )
        url = result.get('secure_url', '')
        if url:
            import logging
            logging.getLogger(__name__).info('Uploaded local video directly to Cloudinary: %s', url)
        return url
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning('Cloudinary upload failed in views: %s', e)
        return ''


def build_public_media_url(request, relative_url: str) -> str:
    if not relative_url:
        return ''
    if relative_url.startswith(('http://', 'https://')):
        return relative_url
        
    base_url = getattr(settings, 'PUBLIC_APP_URL', '')
    if base_url and 'localhost' not in base_url and '127.0.0.1' not in base_url:
        return f"{base_url.rstrip('/')}/{relative_url.lstrip('/')}"
    return request.build_absolute_uri(relative_url)


class PublicVideoView(viewsets.GenericViewSet):
    """No-auth endpoint so QR codes can open a video player page."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def retrieve(self, request, pk=None):
        try:
            project = VideoProject.objects.get(pk=pk)
        except (VideoProject.DoesNotExist, Exception):
            return Response({'error': 'Video not found'}, status=404)
        video_url = project.video_url or (
            build_public_media_url(request, project.video_file.url) if project.video_file else ''
        )
        return Response({
            'id': str(project.id),
            'title': project.title,
            'video_url': video_url,
            'thumbnail_url': project.thumbnail_url or '',
        })


class VideoTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from .models import VideoTemplate
        return VideoTemplate.objects.filter(is_public=True)

    def get_serializer_class(self):
        class TemplateSerializer(serializers.ModelSerializer):
            class Meta:
                model = VideoTemplate
                fields = '__all__'
        return TemplateSerializer
