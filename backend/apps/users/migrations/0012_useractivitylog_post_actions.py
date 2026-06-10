from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0011_user_complete_activity_overview'),
    ]

    operations = [
        migrations.AlterField(
            model_name='useractivitylog',
            name='action',
            field=models.CharField(
                choices=[
                    ('register', 'Register'),
                    ('login', 'Login'),
                    ('logout', 'Logout'),
                    ('password_reset', 'Password Reset'),
                    ('email_verified', 'Email Verified'),
                    ('profile_updated', 'Profile Updated'),
                    ('email_changed', 'Email Changed'),
                    ('subscription_activated', 'Subscription Activated'),
                    ('subscription_cancelled', 'Subscription Cancelled'),
                    ('subscription_suspended', 'Subscription Suspended'),
                    ('subscription_expired', 'Subscription Expired'),
                    ('subscription_refunded', 'Subscription Refunded'),
                    ('payment_completed', 'Payment Completed'),
                    ('payment_failed', 'Payment Failed'),
                    ('video_quota_consumed', 'Video Quota Consumed'),
                    ('post_scheduled', 'Post Scheduled'),
                    ('post_publish_started', 'Post Publish Started'),
                    ('post_published', 'Post Published'),
                    ('post_cancelled', 'Post Cancelled'),
                    ('account_deleted', 'Account Deleted'),
                ],
                max_length=40,
            ),
        ),
    ]
