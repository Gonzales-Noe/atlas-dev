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

ENV PORT=10000
ENV WEB_CONCURRENCY=1

RUN chmod +x start.sh

# Render default port is 10000; start.sh binds 0.0.0.0:$PORT
CMD ["./start.sh"]
