# Production-specific settings (Render / VPS)
import os

from django.core.exceptions import ImproperlyConfigured

from .base import *

DEBUG = False

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get('ALLOWED_HOSTS', '').split(',')
    if h.strip()
]
if not ALLOWED_HOSTS:
    render_host = os.environ.get('RENDER_EXTERNAL_HOSTNAME', '').strip()
    if render_host:
        ALLOWED_HOSTS = [render_host]
if not ALLOWED_HOSTS and os.environ.get('RENDER') == 'true':
    ALLOWED_HOSTS = ['.onrender.com']
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured(
        "ALLOWED_HOSTS must be set in production "
        "(e.g. your-service.onrender.com)."
    )

# Supabase requires SSL from external hosts (Render → Supabase)
DATABASES['default']['OPTIONS'] = {
    'sslmode': os.environ.get('DB_SSLMODE', 'require'),
}

# Avoid DB hit on every request for anonymous/session cookie
SESSION_ENGINE = 'django.contrib.sessions.backends.signed_cookies'

# Frontend origin(s) for CSRF when browser posts cross-origin
CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.environ.get('CSRF_TRUSTED_ORIGINS', '').split(',')
    if o.strip()
]

# Required when frontend (Render Static Site) calls API with withCredentials
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',')
    if o.strip()
]

# Static files via WhiteNoise
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        # Non-manifest: avoids collectstatic failures on missing referenced files
        'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage',
    },
}
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    *[m for m in MIDDLEWARE if m != 'django.middleware.security.SecurityMiddleware'],
]

# Render terminates TLS; trust X-Forwarded-Proto
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'true').lower() == 'true'
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = int(os.environ.get('SECURE_HSTS_SECONDS', '31536000'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Redis is optional on interim Render deploys (no websocket routes yet).
# Set REDIS_HOST to a real Redis host when you add Render Redis / VPS Redis.
_redis_host = os.environ.get('REDIS_HOST', '').strip()
if _redis_host and _redis_host not in ('localhost', '127.0.0.1'):
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {
                'hosts': [(_redis_host, int(os.environ.get('REDIS_PORT', '6379')))],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        },
    }
