#!/bin/sh
python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py fix_stuck_posts

# Start Celery worker with beat scheduler in background (handles scheduled posts)
celery -A config worker -B -l info --concurrency=1 &

# Start Waitress in the foreground as a lightweight single-process WSGI server to prevent Out-Of-Memory (OOM) crashes
waitress-serve --port=$PORT --threads=2 config.wsgi:application
