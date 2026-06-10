from django.db import migrations, models


DEMO_TITLES = {
    'summer sale 2025 campaign',
    'how to use our app — onboarding',
    'q3 2025 product announcement',
    'customer success story',
}


def mark_demo_seed_projects(apps, schema_editor):
    VideoProject = apps.get_model('videos', 'VideoProject')

    for project in VideoProject.objects.select_related('user').all():
        title = str(getattr(project, 'title', '') or '').strip().lower()
        user_email = str(getattr(project.user, 'email', '') or '').strip().lower()
        user_username = str(getattr(project.user, 'username', '') or '').strip().lower()
        if title in DEMO_TITLES and (user_email == 'demo@socialmind.dev' or user_username == 'demo_user'):
            project.is_demo_seed = True
            project.save(update_fields=['is_demo_seed'])


class Migration(migrations.Migration):

    dependencies = [
        ('videos', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='videoproject',
            name='is_demo_seed',
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(mark_demo_seed_projects, migrations.RunPython.noop),
    ]

