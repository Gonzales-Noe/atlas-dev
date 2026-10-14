# Development-specific settings
from .base import *

DEBUG = True
ALLOWED_HOSTS = ['*']

# Allow all origins in dev so Flutter web, Expo, etc. can reach the API
CORS_ALLOW_ALL_ORIGINS = True

# Development tools
INSTALLED_APPS += [
    'debug_toolbar',
    'django_extensions',
]

MIDDLEWARE += [
    'debug_toolbar.middleware.DebugToolbarMiddleware',
]

INTERNAL_IPS = ['127.0.0.1']

# The SQL panel can fail while interpreting psycopg isolation levels and turn
# otherwise successful API responses into 500s in development.
DEBUG_TOOLBAR_CONFIG = {
    'DISABLE_PANELS': {
        'debug_toolbar.panels.profiling.ProfilingPanel',
        'debug_toolbar.panels.redirects.RedirectsPanel',
        'debug_toolbar.panels.sql.SQLPanel',
    },
}

# Extended logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {'class': 'logging.StreamHandler'},
    },
    'root': {'handlers': ['console'], 'level': 'INFO'},
    'loggers': {
        # Suppress verbose HuggingFace/httpx download chatter
        'httpx': {'level': 'WARNING'},
        'httpcore': {'level': 'WARNING'},
        'filelock': {'level': 'WARNING'},
        'huggingface_hub': {'level': 'WARNING'},
        'sentence_transformers': {'level': 'WARNING'},
    },
}
