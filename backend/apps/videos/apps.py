from django.apps import AppConfig


class VideosConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.videos'

    def ready(self):
        import threading
        import os

        # Only run scheduler in the main process (not in migrations, shell, etc.)
        if os.environ.get('RUN_MAIN') == 'true' or os.environ.get('SERVER_SOFTWARE'):
            return
        if os.environ.get('DISABLE_SCHEDULER'):
            return

        def run_scheduler():
            import time
            import logging
            logger = logging.getLogger(__name__)
            logger.info('[Scheduler] Background post scheduler started.')
            while True:
                try:
                    from apps.videos.tasks import check_scheduled_posts
                    check_scheduled_posts()
                except Exception as e:
                    logger.error(f'[Scheduler] Error in check_scheduled_posts: {e}')
                time.sleep(60)

        t = threading.Thread(target=run_scheduler, daemon=True)
        t.start()
