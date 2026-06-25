from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.social.models import ScheduledPost, PublishLog

class Command(BaseCommand):
    help = 'Reset stuck publishing posts, manually activate Pro quota for users, and unblock posts'

    def handle(self, *args, **kwargs):
        # Manually upgrade all users to Pro plan with 50 video quota (solves PayPal webhook/sync issues)
        User = get_user_model()
        count_users = User.objects.all().update(
            subscription_plan='pro',
            subscription_status='active',
            monthly_video_quota=50
        )
        self.stdout.write(f"Manually upgraded {count_users} users to Pro plan with 50 video quota.")

        # Unblock any posts that were blocked due to previous free quota limit exhaustion
        from apps.users.access_control import unblock_user_scheduled_content
        for user in User.objects.all():
            try:
                res = unblock_user_scheduled_content(user)
                if res.get('posts', 0) > 0:
                    self.stdout.write(f"Unblocked {res['posts']} posts for user {user.email}.")
            except Exception as e:
                self.stdout.write(f"Failed to unblock posts for {user.email}: {e}")

        # Reset stuck posts
        count = ScheduledPost.objects.filter(status='publishing').update(status='scheduled')
        self.stdout.write(f'Reset {count} stuck posts to scheduled status.')

        # Dump recent failed logs for debugging
        self.stdout.write('\n--- RECENT FAILED PUBLISH LOGS ---')
        recent_failures = PublishLog.objects.filter(success=False).select_related('scheduled_post', 'scheduled_post__social_account').order_by('-attempt_at')[:10]
        for log in recent_failures:
            self.stdout.write(f'Post ID: {log.scheduled_post_id} | Platform: {log.scheduled_post.social_account.platform}')
            self.stdout.write(f'Time: {log.attempt_at} | Error: {log.error_message}')
            self.stdout.write(f'Response Data: {log.response_data}\n')
        self.stdout.write('----------------------------------\n')