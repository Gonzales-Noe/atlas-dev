"""
Reset passwords for Batangas State University users to known values.
Run via: cd backend && python reset_batstateu_passwords.py
"""
import os
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'atlas.settings.dev')
os.environ.setdefault('DB_ENGINE', 'django.db.backends.postgresql')
os.environ.setdefault('DB_NAME', 'atlas_dev')
os.environ.setdefault('DB_USER', 'postgres')
os.environ.setdefault('DB_PASSWORD', 'postgres')
os.environ.setdefault('DB_HOST', 'localhost')
os.environ.setdefault('DB_PORT', '5432')

import django
django.setup()

from django.contrib.auth.hashers import make_password
from apps.integrations.models import UserProfile

RESETS = [
    {
        'email': 'faculty1@g.batstate-u.edu.ph',
        'password': 'AtlasFaculty2026!',
    },
    {
        'email': 'faculty2@g.batstate-u.edu.ph',
        'password': 'AtlasFaculty2026!',
    },
    {
        'email': '23-35006@g.batstate-u.edu.ph',
        'password': 'AtlasStudent2026!',
    },
    {
        'email': '23-32547@g.batstate-u.edu.ph',
        'password': 'AtlasStudent2026!',
    },
]

def main():
    for entry in RESETS:
        profile = UserProfile.objects.filter(email=entry['email']).first()
        if profile:
            profile.password_hash = make_password(entry['password'])
            profile.save(update_fields=['password_hash'])
            print(f"OK  {entry['email']} -- password set to '{entry['password']}'")
        else:
            print(f"ERR {entry['email']} -- user not found in database")

    print("\nDone. Passwords reset for Batangas State University users.")

if __name__ == '__main__':
    main()
