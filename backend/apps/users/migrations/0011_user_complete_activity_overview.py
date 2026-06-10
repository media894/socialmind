from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0010_user_admin_overview_views'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
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
            """,
            reverse_sql="""
                DROP VIEW IF EXISTS user_complete_activity_overview;
            """,
        ),
    ]
