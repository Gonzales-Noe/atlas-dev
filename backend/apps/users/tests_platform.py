from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.utils import timezone
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.integrations.models import AuditLog, Institution, PlatformSettings, UserProfile, UserRole
from apps.users.brand import normalize_hex, palette
from apps.users.serializers import tokens_for_profile


@override_settings(ALLOWED_HOSTS=['testserver'], SECURE_SSL_REDIRECT=False)
class PlatformOpsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.institution = Institution.objects.create(name='North Campus')
        self.superadmin = UserProfile.objects.create(
            email='it@atlas.test',
            password_hash=make_password('unused-password'),
            role=UserRole.SUPERADMIN,
            is_active=True,
        )
        self.faculty = UserProfile.objects.create(
            email='faculty@atlas.test',
            password_hash=make_password('unused-password'),
            role=UserRole.FACULTY,
            institution=self.institution,
            is_active=True,
        )
        self.super_token = tokens_for_profile(self.superadmin)['access']
        self.faculty_token = tokens_for_profile(self.faculty)['access']

    def test_default_palette_stays_the_designed_red(self):
        colors = palette('#aa2423')
        self.assertTrue(colors['is_default'])
        self.assertEqual(colors['brand_primary'], '#AA2423')
        self.assertEqual(colors['brand_accent'], '#E24B4A')

    def test_custom_palette_rejects_a_pale_color(self):
        with self.assertRaises(ValueError):
            normalize_hex('#F8F8F8')
        colors = palette('#1B3A6B')
        self.assertFalse(colors['is_default'])
        self.assertEqual(colors['brand_primary'], '#1B3A6B')
        self.assertTrue(colors['brand_primary_hover'].startswith('#'))

    def test_theme_is_public_and_only_superadmin_can_change_it(self):
        public = self.client.get('/api/auth/platform-theme/')
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.data['palette']['brand_primary'], '#AA2423')
        self.assertFalse(public.data['maintenance_enabled'])

        denied = self.client.patch(
            '/api/auth/platform-theme/',
            {'brand_primary': '#1B3A6B'},
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.faculty_token}',
        )
        self.assertEqual(denied.status_code, 403)

        saved = self.client.patch(
            '/api/auth/platform-theme/',
            {'brand_primary': '1B3A6B'},
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.super_token}',
        )
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.data['palette']['brand_primary'], '#1B3A6B')
        self.assertEqual(PlatformSettings.objects.get(pk=1).brand_primary, '#1B3A6B')
        self.assertTrue(
            AuditLog.objects.filter(action_type='platform_theme_updated', user=self.superadmin).exists()
        )

    def test_system_health_and_audit_are_live_superadmin_views(self):
        AuditLog.objects.create(
            user=self.faculty,
            action_type='course_assigned',
            resource_type='Course',
            details={'course_code': 'CS 101'},
        )
        denied = self.client.get(
            '/api/auth/system-health/',
            HTTP_AUTHORIZATION=f'Bearer {self.faculty_token}',
        )
        self.assertEqual(denied.status_code, 403)

        health = self.client.get(
            '/api/auth/system-health/',
            HTTP_AUTHORIZATION=f'Bearer {self.super_token}',
        )
        self.assertEqual(health.status_code, 200)
        self.assertIn(health.data['overall'], {'healthy', 'limited', 'warning', 'critical'})
        self.assertTrue(health.data['database']['ok'])
        self.assertGreaterEqual(health.data['application']['users'], 2)
        self.assertGreaterEqual(health.data['disk']['percent'], 0)

        audit = self.client.get(
            '/api/auth/platform-audit/?q=course',
            HTTP_AUTHORIZATION=f'Bearer {self.super_token}',
        )
        self.assertEqual(audit.status_code, 200)
        self.assertGreaterEqual(audit.data['count'], 1)
        self.assertEqual(audit.data['logs'][0]['role'], 'Faculty')
        self.assertTrue(audit.data['daily'])

        faculty_audit = self.client.get(
            '/api/auth/platform-audit/',
            HTTP_AUTHORIZATION=f'Bearer {self.faculty_token}',
        )
        self.assertEqual(faculty_audit.status_code, 403)

    def test_maintenance_mode_blocks_other_roles_and_keeps_superadmin(self):
        self.client.patch(
            '/api/auth/platform-theme/',
            {
                'maintenance_enabled': True,
                'maintenance_message': 'Back at 4.',
            },
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.super_token}',
        )
        blocked = self.client.get(
            '/api/auth/dashboard/summary/',
            HTTP_AUTHORIZATION=f'Bearer {self.faculty_token}',
        )
        self.assertEqual(blocked.status_code, 503)
        self.assertTrue(blocked.json()['maintenance'])

        still_open = self.client.get(
            '/api/auth/system-health/',
            HTTP_AUTHORIZATION=f'Bearer {self.super_token}',
        )
        self.assertEqual(still_open.status_code, 200)

        theme = self.client.get('/api/auth/platform-theme/')
        self.assertEqual(theme.status_code, 200)
        self.assertTrue(theme.data['maintenance_enabled'])
        self.assertEqual(theme.data['maintenance_message'], 'Back at 4.')

    def test_maintenance_notice_cannot_be_scheduled_for_today(self):
        today = timezone.localtime().replace(hour=18, minute=0, second=0, microsecond=0)
        denied = self.client.patch(
            '/api/auth/platform-theme/',
            {
                'maintenance_notice_enabled': True,
                'maintenance_scheduled_for': today.isoformat(),
            },
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.super_token}',
        )
        self.assertEqual(denied.status_code, 400)
        self.assertIn('later day', denied.data['detail'])

        later = timezone.now() + timedelta(days=2)
        until = later + timedelta(hours=2)
        missing_end = self.client.patch(
            '/api/auth/platform-theme/',
            {
                'maintenance_notice_enabled': True,
                'maintenance_scheduled_for': later.isoformat(),
                'maintenance_scheduled_until': later.isoformat(),
            },
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.super_token}',
        )
        self.assertEqual(missing_end.status_code, 400)
        self.assertIn('after the start', missing_end.data['detail'])

        saved = self.client.patch(
            '/api/auth/platform-theme/',
            {
                'maintenance_notice_enabled': True,
                'maintenance_scheduled_for': later.isoformat(),
                'maintenance_scheduled_until': until.isoformat(),
            },
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.super_token}',
        )
        self.assertEqual(saved.status_code, 200)
        self.assertTrue(saved.data['maintenance_notice_enabled'])
        self.assertTrue(saved.data['maintenance_scheduled_for'])
        self.assertTrue(saved.data['maintenance_scheduled_until'])

        public = self.client.get('/api/auth/platform-theme/')
        self.assertTrue(public.data['maintenance_notice_enabled'])
        self.assertTrue(public.data['maintenance_scheduled_until'])

    def test_scheduled_window_turns_maintenance_on_by_itself(self):
        start = timezone.now() - timedelta(minutes=1)
        end = timezone.now() + timedelta(hours=1)
        PlatformSettings.objects.create(
            settings_id=1,
            maintenance_notice_enabled=True,
            maintenance_scheduled_for=start,
            maintenance_scheduled_until=end,
        )
        theme = self.client.get('/api/auth/platform-theme/')
        self.assertEqual(theme.status_code, 200)
        self.assertTrue(theme.data['maintenance_enabled'])
        from apps.integrations.models import MaintenanceUpdate
        self.assertTrue(MaintenanceUpdate.objects.filter(summary__startswith='Maintenance started').exists())

    def test_maintenance_schedules_can_be_added_and_removed(self):
        today = timezone.localtime().replace(hour=18, minute=0, second=0, microsecond=0)
        denied = self.client.post(
            '/api/auth/maintenance-schedules/',
            {'starts_at': today.isoformat(), 'ends_at': (today + timedelta(hours=1)).isoformat()},
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.super_token}',
        )
        self.assertEqual(denied.status_code, 400)

        later = timezone.now() + timedelta(days=2)
        first = self.client.post(
            '/api/auth/maintenance-schedules/',
            {
                'starts_at': later.isoformat(),
                'ends_at': (later + timedelta(hours=2)).isoformat(),
            },
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.super_token}',
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(len(first.data['schedules']), 1)

        second_start = later + timedelta(days=1)
        second = self.client.post(
            '/api/auth/maintenance-schedules/',
            {
                'starts_at': second_start.isoformat(),
                'ends_at': (second_start + timedelta(hours=1)).isoformat(),
            },
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.super_token}',
        )
        self.assertEqual(second.status_code, 201)
        self.assertEqual(len(second.data['schedules']), 2)

        public = self.client.get('/api/auth/platform-theme/')
        self.assertTrue(public.data['maintenance_notice_enabled'])
        self.assertTrue(public.data['maintenance_scheduled_for'])

        schedule_id = first.data['schedules'][0]['id']
        removed = self.client.delete(
            f'/api/auth/maintenance-schedules/{schedule_id}/',
            HTTP_AUTHORIZATION=f'Bearer {self.super_token}',
        )
        self.assertEqual(removed.status_code, 200)
        self.assertEqual(len(removed.data['schedules']), 1)
