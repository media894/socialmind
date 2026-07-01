from django.apps import AppConfig


class VideosConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.videos'

    def ready(self):
        import threading
        import os

        # Avoid running in manage.py commands like migrate, shell, etc.
        if os.environ.get('DISABLE_SCHEDULER'):
            return

        # Prevent double-start in Django's autoreloader (development)
        if os.environ.get('RUN_MAIN') == 'true':
            return

        def run_scheduler():
            import time
            import logging
            logger = logging.getLogger(__name__)
            logger.info('[Scheduler] Background post scheduler started (no-Celery mode).')

            # Wait for Django to fully initialize before running
            time.sleep(10)

            while True:
                try:
                    _run_due_posts()
                except Exception as e:
                    logger.error(f'[Scheduler] Unexpected error: {e}')
                time.sleep(60)

        t = threading.Thread(target=run_scheduler, daemon=True, name='post-scheduler')
        t.start()


def _run_due_posts():
    """
    Directly publish due scheduled posts without going through Celery.
    Also resets posts stuck in 'publishing' for more than 15 minutes.
    """
    import logging
    import threading
    from django.utils import timezone

    logger = logging.getLogger(__name__)

    try:
        from apps.social.models import ScheduledPost
        from apps.videos.tasks import execute_publish_post

        now = timezone.now()

        # Reset posts stuck in publishing > 15 mins
        stuck_cutoff = now - timezone.timedelta(minutes=15)
        stuck = ScheduledPost.objects.filter(
            status='publishing',
            updated_at__lte=stuck_cutoff,
        )
        for p in stuck:
            p.status = 'failed'
            p.error_message = 'Publishing timed out. The scheduler restarted or the task failed silently.'
            p.save()
            logger.warning('[Scheduler] Reset stuck post %s to failed.', p.id)

        # Find due posts
        due_posts = ScheduledPost.objects.filter(
            status='scheduled',
            scheduled_at__lte=now,
            project__status__in=['approved', 'scheduled'],
        ).select_related('project', 'social_account')

        for post in due_posts:
            # Atomic status check - mark as publishing to avoid duplicates
            updated = ScheduledPost.objects.filter(
                id=post.id, status='scheduled'
            ).update(status='publishing')
            if not updated:
                continue

            post_id = str(post.id)
            logger.info('[Scheduler] Dispatching post %s for platform %s', post_id, post.social_account.platform)

            # Run each publish in its own thread so one failure doesn't block others
            def _publish(pid=post_id):
                try:
                    execute_publish_post(pid)
                except Exception as exc:
                    logger.error('[Scheduler] publish failed for post %s: %s', pid, exc)

            threading.Thread(target=_publish, daemon=True, name=f'publish-{post_id}').start()

    except Exception as exc:
        logger.error('[Scheduler] _run_due_posts error: %s', exc)
