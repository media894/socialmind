from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_socialaccount_platform_youtube'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='paypal_plan_id',
            field=models.CharField(blank=True, max_length=128),
        ),
        migrations.AddField(
            model_name='user',
            name='paypal_subscription_id',
            field=models.CharField(blank=True, max_length=128),
        ),
        migrations.AddField(
            model_name='user',
            name='subscription_status',
            field=models.CharField(blank=True, max_length=40),
        ),
    ]
