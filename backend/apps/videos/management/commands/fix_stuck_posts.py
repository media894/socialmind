from django.core.management.base import BaseCommand
from apps.social.models import ScheduledPost, PublishLog

class Command(BaseCommand):
    help = 'Reset stuck publishing posts and dump recent failed logs'

    def handle(self, *args, **kwargs):
        # Reset stuck posts
        count = ScheduledPost.objects.filter(status='publishing').update(status='scheduled')
        self.stdout.write(f'Reset {count} stuck posts to scheduled status.')

        # Dump recent failed logs
        self.stdout.write('\n--- RECENT FAILED PUBLISH LOGS ---')
        recent_failures = PublishLog.objects.filter(success=False).select_related('scheduled_post', 'scheduled_post__social_account').order_by('-attempt_at')[:10]
        for log in recent_failures:
            self.stdout.write(f'Post ID: {log.scheduled_post_id} | Platform: {log.scheduled_post.social_account.platform}')
            self.stdout.write(f'Time: {log.attempt_at} | Error: {log.error_message}')
            self.stdout.write(f'Response Data: {log.response_data}\n')
        self.stdout.write('----------------------------------\n')