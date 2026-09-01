#!/bin/sh
set -e

echo "==> ATLAS backend starting"
echo "    PORT=${PORT:-10000}"
echo "    WEB_CONCURRENCY=${WEB_CONCURRENCY:-1}"
echo "    DJANGO_SETTINGS_MODULE=${DJANGO_SETTINGS_MODULE:-atlas.settings.prod}"

export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-atlas.settings.prod}"

python <<'PY'
import os, sys
required = ["DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST", "SECRET_KEY"]
missing = [k for k in required if not os.environ.get(k)]
if missing:
    print("FATAL: missing env vars:", ", ".join(missing), file=sys.stderr)
    sys.exit(1)
print("Env vars OK")
PY

python <<'PY'
import django
django.setup()
from django.urls import get_resolver
get_resolver().urlconf_module
print("WSGI + URLconf OK")
PY

exec gunicorn atlas.wsgi:application \
  --bind "0.0.0.0:${PORT:-10000}" \
  --workers "${WEB_CONCURRENCY:-1}" \
  --timeout 300 \
  --graceful-timeout 120 \
  --access-logfile - \
  --error-logfile -
