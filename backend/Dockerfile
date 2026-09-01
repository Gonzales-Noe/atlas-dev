FROM python:3.11-slim

WORKDIR /app

# System deps (Postgres client for ops; build tools for some Python wheels)
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# collectstatic needs prod settings + placeholder env (no live DB required)
RUN DJANGO_SETTINGS_MODULE=atlas.settings.prod \
    DB_NAME=postgres \
    DB_USER=postgres \
    DB_PASSWORD=build-placeholder \
    DB_HOST=localhost \
    DB_PORT=5432 \
    SECRET_KEY=build-placeholder \
    ALLOWED_HOSTS=localhost \
    python manage.py collectstatic --noinput

# Render injects $PORT; default 8000 for local docker runs
ENV PORT=8000
EXPOSE 8000

# Shell form so $PORT expands. Keep workers low for Render starter/free RAM.
# Set DJANGO_SETTINGS_MODULE=atlas.settings.prod on Render (do not bake it here
# so local docker-compose can keep using atlas.settings.dev).
CMD gunicorn atlas.wsgi:application --bind 0.0.0.0:${PORT} --workers 2 --timeout 120
