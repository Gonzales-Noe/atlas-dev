# Django base settings - shared configuration for all environments
import os
import sys
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
    'apps.academics.apps.AcademicsConfig',
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

# Schema commands need a real Postgres session (advisory locks). Transaction
# poolers on :6543 drop those, so migrate/dbshell use DB_DIRECT_* instead.
_mgmt_cmd = sys.argv[1] if len(sys.argv) > 1 else ''
_SCHEMA_COMMANDS = {
    'migrate',
    'makemigrations',
    'showmigrations',
    'sqlmigrate',
    'dbshell',
}
_use_direct = (
    os.environ.get('DB_USE_DIRECT', '').lower() in {'1', 'true', 'yes'}
    or _mgmt_cmd in _SCHEMA_COMMANDS
)
if _use_direct:
    _db_host = os.environ.get('DB_DIRECT_HOST') or os.environ['DB_HOST']
    _db_port = os.environ.get('DB_DIRECT_PORT') or '5432'
    _db_user = os.environ.get('DB_DIRECT_USER') or os.environ['DB_USER']
else:
    _db_host = os.environ['DB_HOST']
    _db_port = os.environ.get('DB_PORT', '5432')
    _db_user = os.environ['DB_USER']

_is_transaction_pooler = str(_db_port) == '6543'
_is_supabase_pooler = _db_host.lower().endswith('.pooler.supabase.com')

DATABASES = {
    'default': {
        'ENGINE': os.environ.get('DB_ENGINE', 'django.db.backends.postgresql'),
        'NAME': os.environ['DB_NAME'],
        'USER': _db_user,
        'PASSWORD': os.environ['DB_PASSWORD'],
        'HOST': _db_host,
        'PORT': _db_port,
        # Don't retain client sessions in Supabase's small session-mode pool.
        'CONN_MAX_AGE': 0 if _is_transaction_pooler or _is_supabase_pooler else 60,
        'DISABLE_SERVER_SIDE_CURSORS': _is_transaction_pooler,
        'OPTIONS': {
            'sslmode': os.environ.get('DB_SSLMODE', 'require'),
            'connect_timeout': 15,
        },
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

# Public base URL used inside transactional emails (reset links, logo, etc.).
# Override with BASE_URL in production, e.g. https://atlas.example.com
BASE_URL = os.environ.get('BASE_URL', 'http://localhost:5173').rstrip('/')

# Comma-separated list of recipients that should receive contact-form emails.
ATLAS_CONTACT_EMAILS = os.environ.get(
    'ATLAS_CONTACT_EMAILS', 'atlasdegdev@gmail.com'
)

# Optional override for the logo URL embedded in emails. Falls back to the
# static email/atlas-logo.png asset served by Django.
ATLAS_EMAIL_LOGO_URL = os.environ.get('ATLAS_EMAIL_LOGO_URL', '').strip()

PAYMONGO_SECRET_KEY = os.environ.get('PAYMONGO_SECRET_KEY', '').strip()
PAYMONGO_WEBHOOK_SECRET = os.environ.get('PAYMONGO_WEBHOOK_SECRET', '').strip()
PAYMONGO_API_BASE = os.environ.get('PAYMONGO_API_BASE', 'https://api.paymongo.com').rstrip('/')
PAYMONGO_SUCCESS_URL = os.environ.get('PAYMONGO_SUCCESS_URL', 'http://localhost:5173/billing/onboarding?status=success')
PAYMONGO_CANCEL_URL = os.environ.get('PAYMONGO_CANCEL_URL', 'http://localhost:5173/billing/onboarding?status=cancelled')

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
