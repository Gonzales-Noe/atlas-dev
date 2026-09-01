import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / '.env')

from django.core.wsgi import get_wsgi_application

# Render sets RENDER=true. Default to prod there so a missing
# DJANGO_SETTINGS_MODULE env var does not load dev-only apps (debug_toolbar).
_default_settings = (
    'atlas.settings.prod'
    if os.environ.get('RENDER') == 'true'
    else 'atlas.settings.dev'
)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', _default_settings)
application = get_wsgi_application()
