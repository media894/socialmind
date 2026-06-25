#!/bin/sh
python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py fix_stuck_posts

# Start Celery worker in the background (with beat)
celery -A config worker --beat --loglevel=info --concurrency=1 &

# Start Gunicorn in the foreground
gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 3 --timeout 120