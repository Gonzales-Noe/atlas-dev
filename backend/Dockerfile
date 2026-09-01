FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Slim requirements for Render free-tier RAM (~512MB)
COPY requirements-render.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

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

RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

CMD ["/bin/sh", "./start.sh"]
