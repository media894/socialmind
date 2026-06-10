from django.db import migrations, models


def set_free_plan_quota(apps, schema_editor):
    User = apps.get_model('users', 'User')
    User.objects.filter(subscription_plan='free').update(monthly_video_quota=5)


def restore_previous_free_plan_quota(apps, schema_editor):
    User = apps.get_model('users', 'User')
    User.objects.filter(subscription_plan='free').update(monthly_video_quota=50)


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0004_user_paypal_subscription_fields'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='monthly_video_quota',
            field=models.IntegerField(default=5),
        ),
        migrations.RunPython(set_free_plan_quota, restore_previous_free_plan_quota),
    ]
