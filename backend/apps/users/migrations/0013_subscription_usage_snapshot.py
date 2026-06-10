"""
Migration: 0013_subscription_usage_snapshot

Adds:
  - User.posts_scheduled_since_subscription (IntegerField)
  - User.posts_published_since_subscription (IntegerField)
  - SubscriptionUsageSnapshot table
  - Refreshed DB views including new columns + new subscription_usage_summary view
"""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
from decimal import Decimal


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0012_useractivitylog_post_actions'),
    ]

    operations = [

        # 1. Two new counters on User
        migrations.AddField(
            model_name='user',
            name='posts_scheduled_since_subscription',
            field=models.IntegerField(
                default=0,
                help_text='Posts scheduled during the current subscription period.',
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='posts_published_since_subscription',
            field=models.IntegerField(
                default=0,
                help_text='Posts published during the current subscription period.',
            ),
        ),

        # 2. SubscriptionUsageSnapshot table
        migrations.CreateModel(
            name='SubscriptionUsageSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                (
                    'user',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='subscription_snapshots',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                ('subscription_plan', models.CharField(max_length=20)),
                ('paypal_subscription_id', models.CharField(max_length=128, blank=True)),
                ('paypal_plan_id', models.CharField(max_length=128, blank=True)),
                ('plan_price_usd', models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))),
                ('monthly_video_quota', models.IntegerField(default=0)),
                # Baseline counters at activation moment
                ('baseline_videos_generated', models.IntegerField(default=0)),
                ('baseline_posts_scheduled', models.IntegerField(default=0)),
                ('baseline_posts_published', models.IntegerField(default=0)),
                # Timestamps
                ('subscription_started_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                # Filled in at end of subscription
                ('ended_at', models.DateTimeField(null=True, blank=True)),
                ('end_reason', models.CharField(
                    max_length=40, blank=True,
                    choices=[
                        ('cancelled_7day', 'Cancelled within 7 days'),
                        ('expired', 'Expired'),
                        ('suspended', 'Suspended'),
                        ('admin', 'Admin action'),
                    ],
                )),
                # Final usage & refund
                ('videos_used_during_period', models.IntegerField(null=True, blank=True)),
                ('posts_scheduled_during_period', models.IntegerField(null=True, blank=True)),
                ('posts_published_during_period', models.IntegerField(null=True, blank=True)),
                ('usage_charge_usd', models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)),
                ('refund_amount_usd', models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)),
                ('paypal_refund_id', models.CharField(max_length=128, blank=True)),
            ],
            options={
                'db_table': 'subscription_usage_snapshots',
                'ordering': ['-created_at'],
            },
        ),

        # 3. Refresh DB views
        migrations.RunSQL(
            sql="""
                DROP VIEW IF EXISTS subscription_usage_summary;
                DROP VIEW IF EXISTS user_complete_activity_overview;
                DROP VIEW IF EXISTS user_activity_overview;
                DROP VIEW IF EXISTS user_admin_overview;

                CREATE OR REPLACE VIEW user_admin_overview AS
                SELECT
                    id,
                    email,
                    username,
                    first_name,
                    last_name,
                    subscription_plan,
                    subscription_status,
                    monthly_video_quota,
                    videos_generated_this_month,
                    posts_scheduled_since_subscription,
                    posts_published_since_subscription,
                    GREATEST(monthly_video_quota - videos_generated_this_month, 0) AS quota_remaining,
                    paypal_subscription_id,
                    paypal_plan_id,
                    subscription_started_at,
                    is_active,
                    email_verified,
                    created_at,
                    updated_at
                FROM users
                ORDER BY created_at DESC;

                CREATE OR REPLACE VIEW user_activity_overview AS
                SELECT
                    l.id,
                    l.created_at,
                    l.user_email,
                    u.username,
                    l.action,
                    l.detail,
                    l.metadata,
                    l.ip_address,
                    l.user_id
                FROM user_activity_logs l
                LEFT JOIN users u ON u.id = l.user_id
                ORDER BY l.created_at DESC;

                CREATE OR REPLACE VIEW user_complete_activity_overview AS
                SELECT
                    u.id AS user_id,
                    u.email,
                    u.username,
                    u.first_name,
                    u.last_name,
                    u.is_active,
                    u.email_verified,
                    u.phone_verified,
                    u.subscription_plan,
                    u.subscription_status,
                    u.monthly_video_quota,
                    u.videos_generated_this_month,
                    u.posts_scheduled_since_subscription,
                    u.posts_published_since_subscription,
                    GREATEST(u.monthly_video_quota - u.videos_generated_this_month, 0) AS quota_remaining,
                    u.subscription_started_at,
                    u.paypal_subscription_id,
                    u.paypal_plan_id,
                    u.paypal_last_payment_id,
                    u.paypal_last_payment_currency,
                    u.created_at AS user_created_at,
                    u.updated_at AS user_updated_at,
                    l.id AS activity_id,
                    l.action AS activity_action,
                    l.detail AS activity_detail,
                    l.metadata AS activity_metadata,
                    l.ip_address AS activity_ip_address,
                    l.created_at AS activity_created_at
                FROM users u
                LEFT JOIN user_activity_logs l ON l.user_id = u.id
                ORDER BY u.created_at DESC, l.created_at DESC;

                CREATE OR REPLACE VIEW subscription_usage_summary AS
                SELECT
                    s.id AS snapshot_id,
                    s.user_id,
                    u.email,
                    u.username,
                    s.subscription_plan,
                    s.plan_price_usd,
                    s.monthly_video_quota,
                    s.subscription_started_at,
                    s.ended_at,
                    s.end_reason,
                    s.baseline_videos_generated,
                    s.videos_used_during_period,
                    s.posts_scheduled_during_period,
                    s.posts_published_during_period,
                    s.usage_charge_usd,
                    s.refund_amount_usd,
                    s.paypal_refund_id,
                    s.created_at AS snapshot_created_at
                FROM subscription_usage_snapshots s
                JOIN users u ON u.id = s.user_id
                ORDER BY s.created_at DESC;
            """,
            reverse_sql="""
                DROP VIEW IF EXISTS subscription_usage_summary;
                DROP VIEW IF EXISTS user_complete_activity_overview;
                DROP VIEW IF EXISTS user_activity_overview;
                DROP VIEW IF EXISTS user_admin_overview;
            """,
        ),
    ]
