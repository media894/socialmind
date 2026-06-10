from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    'check-scheduled-posts': {
        'task': 'apps.videos.tasks.check_scheduled_posts',
        'schedule': crontab(minute='*'),
    },
    'reset-monthly-quotas': {
        'task': 'apps.videos.tasks.reset_monthly_quotas',
        'schedule': crontab(hour=0, minute=0, day_of_month=1),
    },
}
