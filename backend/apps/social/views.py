from rest_framework import serializers, viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db import transaction
from django.db.models import F
from django.urls import path, include
from rest_framework.routers import DefaultRouter
import logging
from .models import ScheduledPost, PublishLog, PostAnalytics, PostActivityEvent
from .analytics_tasks import collect_recent_activity_notifications
from apps.videos.tasks import publish_post_task
from apps.users.views import _get_client_ip, _social_account_warnings, log_activity
from apps.users.access_control import (
    enforce_analytics_access,
    enforce_schedule_access,
    enforce_video_access,
)

logger = logging.getLogger(__name__)

PLATFORM_DISPLAY_NAMES = {
    'instagram': 'Instagram',
    'facebook': 'Facebook',
    'linkedin': 'LinkedIn',
    'youtube': 'YouTube Shorts',
}


def _display_platform_name(platform: str) -> str:
    return PLATFORM_DISPLAY_NAMES.get(str(platform or '').lower(), str(platform or '').title())


class ScheduledPostSerializer(serializers.ModelSerializer):
    platform = serializers.ReadOnlyField()
    final_caption = serializers.ReadOnlyField()
    final_hashtags = serializers.ReadOnlyField()
    project_title = serializers.CharField(source='project.title', read_only=True)
    project_video_url = serializers.SerializerMethodField()
    analytics_debug = serializers.SerializerMethodField()
    social_account_username = serializers.CharField(
        source='social_account.platform_username', read_only=True
    )

    class Meta:
        model = ScheduledPost
        fields = ('id', 'project', 'project_title', 'social_account', 'social_account_username',
                  'platform', 'platform_subtype', 'custom_caption', 'custom_hashtags', 'scheduled_at',
                  'status', 'published_at', 'platform_post_id', 'platform_url',
                  'error_message', 'final_caption', 'final_hashtags',
                  'likes_count', 'comments_count', 'shares_count', 'views_count',
                  'analytics_debug',
                  'project_video_url',
                  'created_at')
        read_only_fields = ('id', 'status', 'published_at', 'platform_post_id',
                           'platform_url', 'error_message', 'created_at')

    def get_project_video_url(self, obj):
        project = getattr(obj, 'project', None)
        if not project:
            return ''
        if project.video_url:
            return project.video_url
        video_file = getattr(project, 'video_file', None)
        if video_file and getattr(video_file, 'name', ''):
            try:
                return video_file.url
            except Exception:
                return ''
        return ''

    def get_analytics_debug(self, obj):
        latest = getattr(obj, 'analytics', None)
        if latest is None:
            return {}

        try:
            snapshot = latest.order_by('-snapshot_at').values('raw_data').first()
        except Exception:
            snapshot = None

        raw_data = snapshot.get('raw_data') if isinstance(snapshot, dict) else {}
        debug = raw_data.get('debug') if isinstance(raw_data, dict) else {}
        return debug if isinstance(debug, dict) else {}


class ScheduledPostViewSet(viewsets.ModelViewSet):
    serializer_class = ScheduledPostSerializer
    permission_classes = [IsAuthenticated]

    def _log_post_activity(self, request, action, post, detail):
        log_activity(
            request.user,
            action,
            detail=detail,
            metadata={
                'post_id': str(post.id),
                'project_id': str(post.project_id),
                'project_title': getattr(post.project, 'title', ''),
                'platform': getattr(post.social_account, 'platform', ''),
                'social_account_id': str(post.social_account_id),
                'scheduled_at': post.scheduled_at.isoformat() if post.scheduled_at else '',
                'status': post.status,
            },
            ip_address=_get_client_ip(request),
        )

    def _refresh_live_metrics(self):
        try:
            from .analytics_tasks import refresh_post_analytics_for_user
            refresh_post_analytics_for_user(self.request.user)
        except Exception as exc:
            logger.warning("Live analytics refresh failed for user %s: %s", self.request.user.id, exc)

    def get_queryset(self):
        status_filter = self.request.query_params.get('status')
        qs = ScheduledPost.objects.filter(user=self.request.user).select_related(
            'project', 'social_account'
        )
        platform_filter = self.request.query_params.get('platform')
        if status_filter:
            qs = qs.filter(status=status_filter)
        if platform_filter:
            qs = qs.filter(social_account__platform=platform_filter)
        return qs

    def perform_create(self, serializer):
        post = serializer.save(user=self.request.user)
        post.project.status = 'scheduled'
        post.project.save(update_fields=['status', 'updated_at'])
        self._queue_scheduled_post(post)

    def _queue_scheduled_post(self, post):
        try:
            eta = post.scheduled_at
            task = publish_post_task.apply_async(args=[str(post.id)], eta=eta)
            post.celery_task_id = task.id
            post.save(update_fields=['celery_task_id', 'updated_at'])
            return True
        except Exception as exc:
            logger.warning("Failed to queue scheduled post %s: %s", post.id, exc)
            return False

    def _publish_post_direct(self, post):
        from apps.videos.tasks import execute_publish_post
        try:
            result = execute_publish_post(str(post.id))
            return Response({
                'message': 'Post published immediately',
                'result': result,
            }, status=200)
        except Exception as exc:
            logger.warning("Direct publish failed for %s: %s", post.id, exc)
            return Response({'error': str(exc)}, status=400)

    def _dispatch_due_post(self, post, direct=False):
        if direct:
            from apps.videos.tasks import execute_publish_post
            execute_publish_post(str(post.id))
            return {'id': str(post.id), 'status': 'published', 'mode': 'direct'}

        try:
            task = publish_post_task.delay(str(post.id))
            post.celery_task_id = task.id
            post.save(update_fields=['celery_task_id', 'updated_at'])
            return {'id': str(post.id), 'status': 'publishing', 'mode': 'celery', 'task_id': task.id}
        except Exception:
            from apps.videos.tasks import execute_publish_post
            execute_publish_post(str(post.id))
            return {'id': str(post.id), 'status': 'published', 'mode': 'direct'}

    def create(self, request, *args, **kwargs):
        allowed, payload = enforce_schedule_access(request.user, requested_count=1)
        if not allowed:
            return Response(payload, status=status.HTTP_403_FORBIDDEN)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        social_account = serializer.validated_data['social_account']

        # Validate scheduled_at BEFORE writing anything to the DB
        scheduled_at = serializer.validated_data.get('scheduled_at')
        if not scheduled_at or scheduled_at <= timezone.now() + timezone.timedelta(minutes=1):
            return Response({'error': 'Pick a future date and time at least 1 minute ahead.'}, status=400)

        try:
            token = social_account.get_access_token()
        except Exception:
            token = ''
        warnings = _social_account_warnings(
            platform=social_account.platform,
            platform_user_id=social_account.platform_user_id,
            page_id=social_account.page_id,
            token=token,
        )
        if warnings:
            return Response({
                'error': 'Selected social account is not publish-ready',
                'warnings': warnings,
            }, status=400)
        post = serializer.save(user=request.user)
        post.project.status = 'scheduled'
        post.project.save(update_fields=['status', 'updated_at'])

        self._queue_scheduled_post(post)
        self._log_post_activity(
            request,
            'post_scheduled',
            post,
            f'Post scheduled for {post.social_account.platform}',
        )
        output = self.get_serializer(post).data
        headers = self.get_success_headers(output)
        return Response(output, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=['post'])
    def publish_now(self, request, pk=None):
        """Immediately publish a post"""
        allowed, payload = enforce_video_access(request.user)
        if not allowed:
            return Response(payload, status=status.HTTP_403_FORBIDDEN)
        post = self.get_object()
        if post.status == 'blocked':
            return Response({'error': 'This scheduled post is blocked until the account has an active quota.'}, status=403)
        if post.status == 'published':
            return Response({'error': 'Already published'}, status=400)
        publishable_project_statuses = ['approved', 'scheduled', 'failed', 'published']
        if post.project.status not in publishable_project_statuses:
            return Response({'error': 'Project must be approved before publishing'}, status=400)

        try:
            task = publish_post_task.delay(str(post.id))
            post.celery_task_id = task.id
            post.save(update_fields=['celery_task_id', 'updated_at'])
            self._log_post_activity(
                request,
                'post_publish_started',
                post,
                f'Publishing started for {post.social_account.platform}',
            )
            return Response({'message': 'Publishing started', 'task_id': task.id})
        except Exception as exc:
            logger.warning("Failed to queue immediate publish for %s: %s", post.id, exc)
            return self._publish_post_direct(post)

    @action(detail=False, methods=['post'])
    def trigger_due(self, request):
        """Publish due scheduled posts for the current user.

        Celery beat handles this in production. This endpoint gives the local
        app a reliable fallback when only the web server/frontend are running.
        """
        direct = request.data.get('direct', True)
        if isinstance(direct, str):
            direct = direct.lower() not in {'0', 'false', 'no'}

        # Auto-fail any posts stuck in 'publishing' state for more than 15 minutes
        stuck_cutoff = timezone.now() - timezone.timedelta(minutes=15)
        stuck_posts = ScheduledPost.objects.filter(
            user=request.user,
            status='publishing',
            updated_at__lte=stuck_cutoff
        )
        for p in stuck_posts:
            p.status = 'failed'
            p.error_message = 'Publishing timed out. The background task worker process restarted or failed to finish.'
            p.save()
            # Sync project status
            project = p.project
            related = ScheduledPost.objects.filter(project=project)
            if not related.filter(status='publishing').exists():
                if related.filter(status='failed').exists():
                    project.status = 'failed'
                elif related.filter(status='published').exists():
                    project.status = 'published'
                project.save(update_fields=['status', 'updated_at'])

        due_posts = ScheduledPost.objects.filter(
            user=request.user,
            status='scheduled',
            scheduled_at__lte=timezone.now(),
            project__status__in=['approved', 'scheduled'],
        ).select_related('project', 'social_account')
        allowed, payload = enforce_video_access(request.user)
        if not allowed:
            return Response({'triggered': 0, 'blocked': True, **payload}, status=status.HTTP_403_FORBIDDEN)

        results = []
        for post in due_posts:
            updated = ScheduledPost.objects.filter(
                id=post.id,
                status='scheduled',
            ).update(status='publishing')
            if not updated:
                continue
            post.refresh_from_db()
            try:
                results.append(self._dispatch_due_post(post, direct=direct))
            except Exception as exc:
                logger.warning("Due publish failed for %s: %s", post.id, exc)
                post.refresh_from_db()
                results.append({
                    'id': str(post.id),
                    'status': post.status,
                    'error': post.error_message or str(exc),
                })

        return Response({'triggered': len(results), 'results': results})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a scheduled post"""
        post = self.get_object()
        if post.status != 'scheduled':
            return Response({'error': 'Can only cancel scheduled posts'}, status=400)
        if post.celery_task_id:
            from celery.app.control import Control
            from config.celery import app
            app.control.revoke(post.celery_task_id, terminate=True)
        post.status = 'cancelled'
        post.save()
        self._log_post_activity(
            request,
            'post_cancelled',
            post,
            f'Scheduled post cancelled for {post.social_account.platform}',
        )
        try:
            from apps.videos.tasks import _sync_project_post_status
            _sync_project_post_status(post.project)
        except Exception as exc:
            logger.warning("Project status sync failed after cancel for %s: %s", post.id, exc)
        return Response({'message': 'Post cancelled'})

    @action(detail=True, methods=['post'])
    def mark_as_posted(self, request, pk=None):
        """Manually mark a scheduled post as published (for posts done outside the platform)."""
        post = self.get_object()
        if post.status == 'published':
            return Response({'error': 'Already marked as posted'}, status=400)
        with transaction.atomic():
            post.status = 'published'
            post.published_at = post.published_at or timezone.now()
            post.save(update_fields=['status', 'published_at', 'updated_at'])
            try:
                from apps.videos.tasks import _sync_project_post_status
                _sync_project_post_status(post.project)
            except Exception as exc:
                logger.warning("Project status sync failed after mark_as_posted for %s: %s", post.id, exc)
        self._log_post_activity(
            request,
            'post_published',
            post,
            f'Post manually marked as published for {post.social_account.platform}',
        )
        return Response({'message': 'Post marked as posted', 'status': 'published'})

    @action(detail=False, methods=['get'])
    def calendar(self, request):
        """Get posts for calendar view"""
        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')
        qs = self.get_queryset()
        if from_date:
            qs = qs.filter(scheduled_at__gte=from_date)
        if to_date:
            qs = qs.filter(scheduled_at__lte=to_date)
        return Response(ScheduledPostSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'])
    def analytics_summary(self, request):
        """Get analytics summary across all published posts"""
        from django.db.models import Sum, Avg, Count
        allowed, payload = enforce_analytics_access(request.user)
        if not allowed:
            return Response(payload, status=status.HTTP_403_FORBIDDEN)
        try:
            from .analytics_tasks import refresh_post_analytics_for_user
            refresh_post_analytics_for_user(request.user)
        except Exception as exc:
            logger.warning("Analytics summary refresh failed for user %s: %s", request.user.id, exc)

        posts = self.get_queryset().filter(status='published')
        summary = posts.aggregate(
            total_posts=Count('id'),
            total_likes=Sum('likes_count'),
            total_comments=Sum('comments_count'),
            total_shares=Sum('shares_count'),
            total_views=Sum('views_count'),
            avg_likes=Avg('likes_count'),
        )
        summary = {key: (value or 0) for key, value in summary.items()}
        summary['total_views'] = max(
            summary['total_views'],
            summary['total_likes'] + summary['total_comments'] + summary['total_shares'],
        )
        platform_breakdown = {}
        for platform in ['instagram', 'facebook', 'linkedin', 'youtube']:
            platform_posts = posts.filter(social_account__platform=platform)
            breakdown = platform_posts.aggregate(
                count=Count('id'),
                likes=Sum('likes_count'),
                comments=Sum('comments_count'),
                shares=Sum('shares_count'),
                views=Sum('views_count'),
            )
            breakdown = {key: (value or 0) for key, value in breakdown.items()}
            breakdown['views'] = max(
                breakdown['views'],
                breakdown['likes'] + breakdown['comments'] + breakdown['shares'],
            )
            platform_breakdown[platform] = breakdown
        summary['platform_breakdown'] = platform_breakdown
        return Response(summary)

    @action(detail=False, methods=['post'])
    def force_refresh_analytics(self, request):
        """Force-refresh analytics for all published posts of the current user."""
        allowed, payload = enforce_analytics_access(request.user)
        if not allowed:
            return Response(payload, status=status.HTTP_403_FORBIDDEN)
        try:
            from .analytics_tasks import refresh_post_analytics_for_user
            updated = refresh_post_analytics_for_user(request.user, min_interval_minutes=0)
            return Response({'updated': updated, 'status': 'ok'})
        except Exception as exc:
            logger.warning("Force analytics refresh failed for user %s: %s", request.user.id, exc)
            return Response({'error': str(exc)}, status=500)

    @action(detail=False, methods=['get'])
    def notifications(self, request):
        """Get recent social activity notifications for the logged-in user."""
        try:
            self._refresh_live_metrics()
        except Exception as exc:
            logger.warning("Notification refresh failed for user %s: %s", request.user.id, exc)

        posts = self.get_queryset().filter(status='published').select_related('project', 'social_account')
        notifications = []
        for post in posts:
            try:
                notifications.extend(collect_recent_activity_notifications(post))
            except Exception as exc:
                logger.warning("Notification collection failed for post %s: %s", post.id, exc)

        manual_events = (
            PostActivityEvent.objects
            .filter(scheduled_post__user=request.user)
            .select_related('scheduled_post', 'scheduled_post__project', 'scheduled_post__social_account')
            .order_by('-created_at')
        )
        for event in manual_events:
            actor_name = event.actor_name or f"@{request.user.get_username()}" or 'You'
            notifications.append({
                'id': f'manual-{event.id}',
                'type': event.event_type,
                'username': actor_name,
                'profileName': actor_name,
                'actorId': event.actor_id or '',
                'title': event.scheduled_post.project.title or 'Untitled post',
                'platform': event.platform or _display_platform_name(event.scheduled_post.social_account.platform),
                'platformKey': event.platform or event.scheduled_post.social_account.platform,
                'postId': str(event.scheduled_post.id),
                'postUrl': event.target_url or event.scheduled_post.platform_url or None,
                'updatedAt': int(event.created_at.timestamp() * 1000),
                'message': f"{event.actor_name or 'You'} shared your post \"{event.scheduled_post.project.title}\"",
                'detail': event.detail or 'shared your post',
                'total': 1,
                'analyticsTarget': event.analytics_target or f'/analytics?post={event.scheduled_post.id}&event=share&platform={event.platform or event.scheduled_post.social_account.platform}',
                'actorUrn': event.actor_id or '',
            })

        notifications.sort(key=lambda item: (item.get('updatedAt') or 0, item.get('total') or 0), reverse=True)
        return Response(notifications[:50])

    @action(detail=True, methods=['get'])
    def publish_logs(self, request, pk=None):
        """Inspect publish attempts for a single scheduled post."""
        post = self.get_object()
        logs = post.publish_logs.order_by('-attempt_at').values(
            'id',
            'success',
            'attempt_at',
            'error_message',
            'response_data',
        )
        return Response(list(logs))

    @action(detail=True, methods=['post'])
    def record_share(self, request, pk=None):
        """Record an in-app share so analytics and notifications update immediately."""
        post = self.get_object()
        platform = str(request.data.get('platform', post.social_account.platform) or post.social_account.platform).strip().lower()
        actor_name = str(request.data.get('actor_name', '') or '').strip()
        actor_id = str(request.data.get('actor_id', '') or '').strip()
        target_url = str(request.data.get('target_url', '') or '').strip()
        detail = str(request.data.get('detail', 'shared your post') or 'shared your post').strip()

        if not actor_name:
            actor_name = f"@{request.user.get_username()}" if request.user.get_username() else 'You'

        with transaction.atomic():
            ScheduledPost.objects.filter(pk=post.pk).update(
                shares_count=F('shares_count') + 1,
                analytics_updated_at=timezone.now(),
            )
            PostActivityEvent.objects.create(
                scheduled_post=post,
                event_type='share',
                platform=platform,
                actor_name=actor_name,
                actor_id=actor_id,
                detail=detail,
                target_url=target_url or post.platform_url or '',
                analytics_target=f'/analytics?post={post.id}&event=share&platform={platform}',
            )

        post.refresh_from_db(fields=['shares_count', 'analytics_updated_at'])
        return Response({
            'message': 'Share recorded',
            'post_id': str(post.id),
            'shares_count': post.shares_count,
            'analytics_updated_at': post.analytics_updated_at,
        }, status=status.HTTP_200_OK)


# URLs
router = DefaultRouter()
router.register('posts', ScheduledPostViewSet, basename='scheduled-posts')

urlpatterns = [path('', include(router.urls))]
