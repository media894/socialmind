#!/bin/sh
python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py fix_stuck_posts

# Start Celery worker and beat in the background using the 'solo' pool to prevent process-forking memory overhead
celery -A config worker --beat -P solo --loglevel=warning &

# Start Gunicorn in the foreground with 1 worker to save RAM and prevent Out-Of-Memory (OOM) crashes on Render Free tier
gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 1 --timeout 120