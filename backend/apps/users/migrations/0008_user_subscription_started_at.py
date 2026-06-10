from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0007_useractivitylog'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='subscription_started_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
