#!/usr/bin/env python
import os
import sys
from dotenv import load_dotenv

if __name__ == "__main__":
    # Load .env file (does not override vars already set by Docker/Compose)
    load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

    # Prefer production when ENVIRONMENT/DEBUG say so (VPS/Docker).
    # Avoids loading debug_toolbar from atlas.settings.dev on the server.
    if not os.environ.get("DJANGO_SETTINGS_MODULE"):
        env_name = (os.environ.get("ENVIRONMENT") or "").strip().lower()
        debug = (os.environ.get("DEBUG") or "true").strip().lower()
        if env_name == "production" or debug in ("0", "false", "no"):
            os.environ["DJANGO_SETTINGS_MODULE"] = "atlas.settings.prod"
        else:
            os.environ["DJANGO_SETTINGS_MODULE"] = "atlas.settings.dev"
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)
