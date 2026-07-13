#!/bin/bash
set -e

echo "==> Waiting for database..."
python << 'PYEOF'
import os, time, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'centralisation_donnees.settings')
django.setup()
from django.db import connections
from django.db.utils import OperationalError
for i in range(30):
    try:
        connections['default'].ensure_connection()
        print("Database ready.")
        break
    except OperationalError:
        print(f"Not ready, retry {i+1}/30...")
        time.sleep(2)
PYEOF

echo "==> Running migrations..."
python manage.py migrate --noinput

echo "==> Collecting static files..."
python manage.py collectstatic --noinput

echo "==> Starting Gunicorn..."
exec gunicorn centralisation_donnees.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 3 \
    --threads 4 \
    --worker-class gthread \
    --timeout 300 \
    --access-logfile - \
    --error-logfile -
