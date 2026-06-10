from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_user_verificationotp_user_phone_number_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='socialaccount',
            name='platform',
            field=models.CharField(choices=[('instagram', 'Instagram'), ('facebook', 'Facebook'), ('linkedin', 'LinkedIn'), ('youtube', 'YouTube Shorts')], max_length=30),
        ),
    ]
