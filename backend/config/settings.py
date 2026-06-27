import os
from pathlib import Path
from datetime import timedelta

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / '.env')

SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-change-this-in-production')
DEBUG = os.environ.get('DEBUG', 'True') == 'True'

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') + [
    'evacuee-chaperone-stuffed.ngrok-free.dev',
    '.onrender.com',  # allows all render subdomains
]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'storages',
    # Local apps
    'apps.users',
    'apps.videos',
    'apps.social',
    'apps.tasks',
    'django_celery_beat',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'socialmind-default-cache',
    }
}

ROOT_URLCONF = 'config.urls'

TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [], 'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.debug',
        'django.template.context_processors.request',
        'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'socialmind'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': os.environ.get('DB_PASSWORD', 'postgres'),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

AUTH_USER_MODEL = 'users.User'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 500,
}

DATA_UPLOAD_MAX_MEMORY_SIZE = 209715200
FILE_UPLOAD_MAX_MEMORY_SIZE = 209715200

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
}

# Celery
CELERY_BROKER_URL = os.environ.get('REDIS_URL', 'redis://red-d8l98j7avr4c73f4rqjg:6379')
CELERY_RESULT_BACKEND = os.environ.get('REDIS_URL', 'redis://red-d8l98j7avr4c73f4rqjg:6379')
CELERY_ACCEPT_CONTENT = ['application/json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'
CELERY_BEAT_SCHEDULER = 'celery.beat:PersistentScheduler'

# AWS S3
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID', '')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY', '')
AWS_STORAGE_BUCKET_NAME = os.environ.get('AWS_STORAGE_BUCKET_NAME', 'socialmind-media')
AWS_S3_REGION_NAME = os.environ.get('AWS_S3_REGION_NAME', 'us-east-1')
AWS_S3_FILE_OVERWRITE = False
AWS_DEFAULT_ACL = 'public-read'
AWS_S3_CUSTOM_DOMAIN = f'{AWS_STORAGE_BUCKET_NAME}.s3.amazonaws.com'
# PUBLIC_APP_URL must be set to your publicly reachable domain (e.g. https://yourdomain.com)
# so that Facebook/Instagram can fetch the video file when publishing.
# In development, set it to your ngrok/tunnel URL. Never leave it as localhost in production.
_public_app_url_default = 'http://localhost:3000' if DEBUG else ''
PUBLIC_APP_URL = os.environ.get('PUBLIC_APP_URL', _public_app_url_default).rstrip('/')

if not DEBUG and not os.environ.get('PUBLIC_APP_URL'):
    import warnings
    warnings.warn(
        "PUBLIC_APP_URL is not set in production! Facebook and Instagram publishing will fail "
        "because the platform cannot fetch video files from a non-public URL. "
        "Set PUBLIC_APP_URL=https://yourdomain.com in your .env file.",
        RuntimeWarning,
        stacklevel=2,
    )

# Use S3 for media storage when AWS credentials are provided (regardless of DEBUG).
# Fall back to local media storage when AWS is not configured.
_use_s3 = bool(os.environ.get('AWS_ACCESS_KEY_ID') and os.environ.get('AWS_STORAGE_BUCKET_NAME'))
if _use_s3:
    DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
    AWS_DEFAULT_ACL = 'public-read'
    AWS_S3_OBJECT_PARAMETERS = {'CacheControl': 'max-age=86400'}
elif not DEBUG:
    # Production without S3: files are served from MEDIA_ROOT via the app server.
    # Make sure your web server (nginx/gunicorn) serves MEDIA_ROOT at MEDIA_URL publicly.
    pass

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# CORS
CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        'CORS_ORIGINS',
        'http://localhost:3000,https://socialmind-frontend.onrender.com'
    ).split(',')
    if o.strip()
]
CORS_ALLOW_HEADERS = list([
    'accept', 'accept-encoding', 'authorization', 'content-type',
    'dnt', 'origin', 'user-agent', 'x-csrftoken', 'x-requested-with',
    'x-retry-count',
])

EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.gmail.com' if os.environ.get('EMAIL_HOST_USER') else '')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'True') == 'True'
EMAIL_USE_SSL = os.environ.get('EMAIL_USE_SSL', 'False') == 'True'
EMAIL_BACKEND = os.environ.get(
    'EMAIL_BACKEND',
    'django.core.mail.backends.smtp.EmailBackend' if EMAIL_HOST else 'django.core.mail.backends.console.EmailBackend'
)
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER or 'SocialMind <no-reply@socialmind.local>')

# PayPal subscriptions
PAYPAL_ENVIRONMENT = os.environ.get('PAYPAL_ENVIRONMENT', 'sandbox').strip().lower()
PAYPAL_CLIENT_ID = os.environ.get('PAYPAL_CLIENT_ID', '')
PAYPAL_CLIENT_SECRET = os.environ.get('PAYPAL_CLIENT_SECRET', '')
PAYPAL_PRO_PLAN_ID = os.environ.get('PAYPAL_PRO_PLAN_ID', '')
PAYPAL_ENTERPRISE_PLAN_ID = os.environ.get('PAYPAL_ENTERPRISE_PLAN_ID', '')
PAYPAL_WEBHOOK_ID = os.environ.get("PAYPAL_WEBHOOK_ID", "")
PAYPAL_API_BASE_URL = (
    'https://api-m.paypal.com'
    if PAYPAL_ENVIRONMENT == 'live'
    else 'https://api-m.sandbox.paypal.com'
)

# Encryption key for API keys
ENCRYPTION_KEY = os.environ.get('ENCRYPTION_KEY', 'generate-a-real-fernet-key-for-production')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Celery Beat Schedule
from celery.schedules import crontab
CELERY_BEAT_SCHEDULE = {
    'check-scheduled-posts': {
        'task': 'apps.videos.tasks.check_scheduled_posts',
        'schedule': crontab(minute='*'),
    },
    'refresh-post-analytics': {
        'task': 'apps.social.analytics_tasks.refresh_post_analytics',
        'schedule': crontab(minute='*/5'),  # every 5 minutes
    },
    'reset-monthly-quotas': {
        'task': 'apps.videos.tasks.reset_monthly_quotas',
        'schedule': crontab(hour=0, minute=0, day_of_month=1),
    },
    'expire-subscriptions': {
        'task': 'apps.videos.tasks.expire_subscriptions',
        'schedule': crontab(minute='*/15'),
    },
}