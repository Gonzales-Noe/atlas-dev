"""
Seed script: adds Batangas State University institution + 4 users
from the mobile dump into atlas_dev. Run via:
    cd backend && python seed_mobile_users.py
"""
import os
import sys
import uuid

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'atlas.settings.dev')
os.environ.setdefault('DB_ENGINE', 'django.db.backends.postgresql')
os.environ.setdefault('DB_NAME', 'atlas_dev')
os.environ.setdefault('DB_USER', 'postgres')
os.environ.setdefault('DB_PASSWORD', 'postgres')
os.environ.setdefault('DB_HOST', 'localhost')
os.environ.setdefault('DB_PORT', '5432')

import django
django.setup()

from apps.integrations.models import Institution, UserProfile, UserRole

BSU_INSTITUTION_ID = uuid.UUID('c101a1a1-0000-4000-8000-000000000001')

# User data from mobile dump (passwords already hashed with pbkdf2_sha256)
USERS = [
    {
        'user_id': uuid.UUID('c101a1a1-0000-4000-8000-0000000a0001'),
        'email': 'faculty1@g.batstate-u.edu.ph',
        'password_hash': 'pbkdf2_sha256$1200000$suDuQTTO7FEMQduWpabeSP$4zgOIo3S0v3Q+hNgOVm8ftysRjb7qh577yF9pxoRzyo=',
        'role': UserRole.FACULTY,
        'name': 'Zymon Andrew Maquinto',
        'department': 'CICS',
    },
    {
        'user_id': uuid.UUID('c101a1a1-0000-4000-8000-0000000a0002'),
        'email': '23-35006@g.batstate-u.edu.ph',
        'password_hash': 'pbkdf2_sha256$1200000$FaO0VzaTt9uDsW5UfFv167$Be5Rlsnn9TF0cOKRORgn0iQzUfMAqZUs7pczfCvZVhE=',
        'role': UserRole.STUDENT,
        'name': 'Jasmin Esperida',
        'department': 'CICS',
        'section': 'BSIT BA 3301',
    },
    {
        'user_id': uuid.UUID('c101a1a1-0000-4000-8000-0000000a0003'),
        'email': 'faculty2@g.batstate-u.edu.ph',
        'password_hash': 'pbkdf2_sha256$1200000$lKJfYeMgLnFknxqAO42ANE$9QVMoxWoBXT1aHHkQoo+rLxevnNjVMCRRD/1kWvPbHc=',
        'role': UserRole.FACULTY,
        'name': 'Jexus Jay Masilungan',
        'department': 'CICS',
    },
    {
        'user_id': uuid.UUID('c101a1a1-0000-4000-8000-0000000a0004'),
        'email': '23-32547@g.batstate-u.edu.ph',
        'password_hash': 'pbkdf2_sha256$1200000$Bpgv48JyHFCTxHbTYAwPfB$jynapnug7fA4Jfmhk97T1jAdRHTp+PWSS0dOkRpKTDA=',
        'role': UserRole.STUDENT,
        'name': 'Hearty Isabel Delacion',
        'department': 'CICS',
        'section': 'BSIT BA 3302',
    },
]


def main():
    institution, created = Institution.objects.get_or_create(
        institution_id=BSU_INSTITUTION_ID,
        defaults={
            'name': 'Batangas State University',
            'plan_tier': 'free',
            'subscription_status': 'active',
            'is_active': True,
        },
    )
    print(f"{'Created' if created else 'Already exists'}: {institution.name}")

    for u in USERS:
        profile, created = UserProfile.objects.update_or_create(
            email=u['email'],
            defaults={
                'user_id': u['user_id'],
                'institution': institution,
                'password_hash': u['password_hash'],
                'role': u['role'],
                'is_active': True,
            },
        )
        status = 'Created' if created else 'Updated'
        print(f"{status}: {profile.email} -> {profile.role} | {u['name']} ({u['department']})")

    print("\nDone. User count:", UserProfile.objects.filter(institution=institution).count())


if __name__ == '__main__':
    main()
