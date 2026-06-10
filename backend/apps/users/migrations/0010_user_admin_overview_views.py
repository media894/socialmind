from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0009_user_paypal_last_payment_fields'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
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
            """,
            reverse_sql="""
                DROP VIEW IF EXISTS user_activity_overview;
                DROP VIEW IF EXISTS user_admin_overview;
            """,
        ),
    ]
