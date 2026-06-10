from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0008_user_subscription_started_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='paypal_last_payment_currency',
            field=models.CharField(blank=True, default='USD', max_length=10),
        ),
        migrations.AddField(
            model_name='user',
            name='paypal_last_payment_id',
            field=models.CharField(blank=True, max_length=128),
        ),
    ]
