# Production-specific settings
from .base import *

DEBUG = False
ALLOWED_HOSTS = ['atlas.example.com', 'db.ycsafjkouarqpzanxelz.supabase.co', 'swagger-dense-barcode.ngrok-free.dev']

# Security
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
