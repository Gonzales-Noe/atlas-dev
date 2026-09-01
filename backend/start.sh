#!/bin/sh
set -e

echo "==> ATLAS backend starting"
echo "    PORT=${PORT:-10000}"
echo "    WEB_CONCURRENCY=${WEB_CONCURRENCY:-1}"
echo "    DJANGO_SETTINGS_MODULE=${DJANGO_SETTINGS_MODULE:-<unset>}"

# Fail fast with a clear log if Django/WSGI cannot import (syntax, settings, etc.)
python -c "from atlas.wsgi import application; print('WSGI import OK')"

exec gunicorn atlas.wsgi:application \
  --bind "0.0.0.0:${PORT:-10000}" \
  --workers "${WEB_CONCURRENCY:-1}" \
  --timeout 300 \
  --graceful-timeout 120 \
  --access-logfile - \
  --error-logfile - \
  --preload
