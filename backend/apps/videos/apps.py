from django.apps import AppConfig


class VideosConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.videos'

    def ready(self):
        import os
        import threading

        # Skip in management commands or if explicitly disabled
        if os.environ.get('DISABLE_SCHEDULER') or os.environ.get('RUN_MAIN') == 'true':
            return

        try:
            t = threading.Thread(target=_scheduler_loop, daemon=True, name='post-scheduler')
            t.start()
        except Exception:
            pass  # Never crash Django startup due to scheduler


def _scheduler_loop():
    import time
    import logging
    logger = logging.getLogger('apps.videos.scheduler')

    # Give Django time to finish startup
    time.sleep(15)
    logger.info('[Scheduler] Background post scheduler started.')

    while True:
        try:
            _run_due_posts(logger)
        except Exception as exc:
            logger.error('[Scheduler] Unexpected error: %s', exc)
        time.sleep(60)


def _run_due_posts(logger=None):
    import logging
    import threading
    if logger is None:
        logger = logging.getLogger('apps.videos.scheduler')

    try:
        import django
        django.setup.__module__  # ensure Django is ready

        from django.utils import timezone
        from apps.social.models import ScheduledPost

        now = timezone.now()

        # Reset posts stuck in publishing for > 15 minutes
        stuck_cutoff = now - timezone.timedelta(minutes=15)
        for p in ScheduledPost.objects.filter(status='publishing', updated_at__lte=stuck_cutoff):
            p.status = 'failed'
            p.error_message = 'Publishing timed out. The scheduler will retry on next run.'
            p.save(update_fields=['status', 'error_message', 'updated_at'])
            logger.warning('[Scheduler] Reset stuck post %s to failed.', p.id)

        # Trigger due posts
        due = ScheduledPost.objects.filter(
            status='scheduled',
            scheduled_at__lte=now,
            project__status__in=['approved', 'scheduled'],
        ).select_related('project', 'social_account')

        for post in due:
            updated = ScheduledPost.objects.filter(id=post.id, status='scheduled').update(status='publishing')
            if not updated:
                continue

            post_id = str(post.id)
            logger.info('[Scheduler] Publishing post %s on %s', post_id, post.social_account.platform)

            def _do_publish(pid=post_id):
                try:
                    # Import here to avoid circular import at module load time
                    from apps.videos.tasks import execute_publish_post
                    execute_publish_post(pid)
                except Exception as exc:
                    import logging as _log
                    _log.getLogger('apps.videos.scheduler').error(
                        '[Scheduler] Publish failed for post %s: %s', pid, exc
                    )

            threading.Thread(target=_do_publish, daemon=True, name=f'pub-{post_id}').start()

    except Exception as exc:
        logger.error('[Scheduler] _run_due_posts error: %s', exc)
