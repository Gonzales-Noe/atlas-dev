"""SQLite settings for offline unit tests when Supabase is unreachable."""

import os

os.environ.setdefault('DB_NAME', 'atlas_test')
os.environ.setdefault('DB_USER', 'atlas')
os.environ.setdefault('DB_PASSWORD', 'atlas')
os.environ.setdefault('DB_HOST', 'localhost')
os.environ.setdefault('DB_PORT', '5432')
os.environ.setdefault('DB_ENGINE', 'django.db.backends.sqlite3')
os.environ.setdefault(
    'ATLAS_ENCRYPTION_KEYS',
    'dGVzdC1rZXktZm9yLWxvY2FsLXVuaXQtdGVzdHMtb25seQ==',
)

from .base import *  # noqa: E402,F401,F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
SILENCED_SYSTEM_CHECKS = list(globals().get('SILENCED_SYSTEM_CHECKS', [])) + ['atlas.E001']
