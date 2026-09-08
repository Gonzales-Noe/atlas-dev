# Django base settings - shared configuration for all environments
import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-dev-key-change-in-production')
DEBUG = True
ALLOWED_HOSTS = []

INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party apps
    'rest_framework',
    'corsheaders',
    'channels',
    # Local apps
    'apps.users.apps.UsersConfig',
    'apps.curriculum.apps.CurriculumConfig',
    'apps.assessment.apps.AssessmentConfig',
    'apps.analytics.apps.AnalyticsConfig',
    'apps.integrations.apps.IntegrationsConfig',
    'apps.grading.apps.GradingConfig',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'atlas.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'atlas.wsgi.application'
ASGI_APPLICATION = 'atlas.asgi.application'

# Require explicit DB_* from .env (Supabase). No localhost / atlas_dev fallbacks.
_missing_db = [k for k in ('DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST') if not os.environ.get(k)]
if _missing_db:
    raise ImproperlyConfigured(
        f"Missing required database env vars: {', '.join(_missing_db)}. "
        "Set them in backend/.env to your Supabase Postgres connection."
    )

DATABASES = {
    'default': {
        'ENGINE': os.environ.get('DB_ENGINE', 'django.db.backends.postgresql'),
        'NAME': os.environ['DB_NAME'],
        'USER': os.environ['DB_USER'],
        'PASSWORD': os.environ['DB_PASSWORD'],
        'HOST': os.environ['DB_HOST'],
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

EMAIL_BACKEND = os.environ.get('EMAIL_BACKEND', 'django.core.mail.backends.smtp.EmailBackend')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'no-reply@atlas.local')
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'localhost')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'true').lower() == 'true'
EMAIL_USE_SSL = os.environ.get('EMAIL_USE_SSL', 'false').lower() == 'true'
EMAIL_TIMEOUT = int(os.environ.get('EMAIL_TIMEOUT', '15'))

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'apps.users.authentication.UserProfileJWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}

SIMPLE_JWT = {
    'USER_ID_FIELD': 'user_id',
    'USER_ID_CLAIM': 'user_id',
}

# Google Sign-In: comma-separated OAuth client IDs allowed as ID-token audience.
# The Web client ID must be included — Android native sign-in issues tokens with aud = serverClientId.
_google_oauth_client_ids = os.environ.get(
    'GOOGLE_OAUTH_CLIENT_IDS',
    '140618226788-lt31psljafm1en4n3aajo054thn5kfin.apps.googleusercontent.com,'
    '140618226788-r55pqlat0o2vvlsc1on3j22e668a1hpq.apps.googleusercontent.com',
)
GOOGLE_OAUTH_CLIENT_IDS = [cid.strip() for cid in _google_oauth_client_ids.split(',') if cid.strip()]

CORS_ALLOWED_ORIGINS = os.environ.get('CORS_ALLOWED_ORIGINS', 'http://localhost:5173').split(',')

# ── OMR Grading ─────────────────────────────────────────────────────────────
# Command used to invoke OMRChecker.  Can be a string or list.
# Examples:
#   "omrchecker"                           – installed via pip
#   ["python", "/opt/OMRChecker/main.py"]  – path to a repo checkout
# Override via environment: OMR_CHECKER_CMD
_omr_checker_cmd_raw = os.environ.get('OMR_CHECKER_CMD', 'omrchecker')
OMR_CHECKER_CMD = (
    _omr_checker_cmd_raw.split()
    if isinstance(_omr_checker_cmd_raw, str)
    else _omr_checker_cmd_raw
)
# Maximum seconds allowed for a single OMRChecker subprocess run.
OMR_JOB_TIMEOUT_SECONDS = int(os.environ.get('OMR_JOB_TIMEOUT_SECONDS', '300'))

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [(os.environ.get('REDIS_HOST', 'localhost'), int(os.environ.get('REDIS_PORT', 6379)))],
        },
    },
}
