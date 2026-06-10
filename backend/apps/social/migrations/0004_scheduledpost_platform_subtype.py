from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('social', '0003_postactivityevent'),
    ]

    operations = [
        migrations.AddField(
            model_name='scheduledpost',
            name='platform_subtype',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
    ]
