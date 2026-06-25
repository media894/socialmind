import os
import threading
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
application = get_wsgi_application()

# Start Celery worker and beat in a background thread within the same process to save memory
if os.environ.get('START_CELERY_IN_THREAD', 'True') == 'True':
    from config.celery import app as celery_app
    
    def run_celery():
        print("Starting in-process Celery worker and beat...")
        try:
            # -P solo ensures we don't fork subprocesses. --beat starts the scheduler.
            celery_app.worker_main(['worker', '--beat', '-P', 'solo', '--loglevel=warning'])
        except Exception as e:
            print(f"Error in background Celery thread: {e}")
        
    t = threading.Thread(target=run_celery)
    t.daemon = True
    t.start()
    print("In-process Celery worker thread started.")
