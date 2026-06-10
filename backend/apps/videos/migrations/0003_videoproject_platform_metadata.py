from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('videos', '0002_videoproject_is_demo_seed'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    ALTER TABLE video_projects
                    ADD COLUMN IF NOT EXISTS platform_captions jsonb NOT NULL DEFAULT '{}'::jsonb,
                    ADD COLUMN IF NOT EXISTS platform_hashtags jsonb NOT NULL DEFAULT '{}'::jsonb,
                    ADD COLUMN IF NOT EXISTS platform_titles jsonb NOT NULL DEFAULT '{}'::jsonb,
                    ADD COLUMN IF NOT EXISTS platform_video_paths jsonb NOT NULL DEFAULT '{}'::jsonb;
                    """,
                    reverse_sql="""
                    ALTER TABLE video_projects
                    DROP COLUMN IF EXISTS platform_video_paths,
                    DROP COLUMN IF EXISTS platform_titles,
                    DROP COLUMN IF EXISTS platform_hashtags,
                    DROP COLUMN IF EXISTS platform_captions;
                    """,
                )
            ],
            state_operations=[
                migrations.AddField(
                    model_name='videoproject',
                    name='platform_captions',
                    field=models.JSONField(default=dict),
                ),
                migrations.AddField(
                    model_name='videoproject',
                    name='platform_hashtags',
                    field=models.JSONField(default=dict),
                ),
                migrations.AddField(
                    model_name='videoproject',
                    name='platform_titles',
                    field=models.JSONField(default=dict),
                ),
                migrations.AddField(
                    model_name='videoproject',
                    name='platform_video_paths',
                    field=models.JSONField(default=dict),
                ),
            ],
        ),
    ]
