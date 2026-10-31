from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.integrations.models import (
    CourseRequest,
    Institution,
    Notification,
    PushSubscription,
    UserProfile,
    UserRole,
)
from apps.users.serializers import tokens_for_profile


@override_settings(ALLOWED_HOSTS=['testserver'], SECURE_SSL_REDIRECT=False, NOTIFICATIONS_PUSH_DISABLED=True)
class NotificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.institution = Institution.objects.create(name='North Campus')
        self.admin = UserProfile.objects.create(
            email='admin@atlas.test',
            password_hash=make_password('unused-password'),
            role=UserRole.ADMIN,
            institution=self.institution,
            full_name='Ada Admin',
            is_active=True,
        )
        self.faculty = UserProfile.objects.create(
            email='faculty@atlas.test',
            password_hash=make_password('unused-password'),
            role=UserRole.FACULTY,
            institution=self.institution,
            full_name='Faye Faculty',
            is_active=True,
        )
        self.superadmin = UserProfile.objects.create(
            email='it@atlas.test',
            password_hash=make_password('unused-password'),
            role=UserRole.SUPERADMIN,
            is_active=True,
        )
        self.admin_token = tokens_for_profile(self.admin)['access']
        self.faculty_token = tokens_for_profile(self.faculty)['access']
        self.super_token = tokens_for_profile(self.superadmin)['access']

    def test_rejected_course_request_notifies_faculty(self):
        course_request = CourseRequest.objects.create(
            institution=self.institution,
            requested_by=self.faculty,
            course_code='ENG101',
            course_title='College Writing',
        )
        response = self.client.post(
            f'/api/academics/course-requests/{course_request.request_id}/review/',
            {'action': 'reject', 'admin_note': 'Add the section first.'},
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.admin_token}',
        )
        self.assertEqual(response.status_code, 200)
        note = Notification.objects.get(recipient=self.faculty)
        self.assertEqual(note.kind, 'course_request_rejected')
        self.assertIn('ENG101', note.body)
        self.assertIn('Add the section first.', note.body)
        self.assertFalse(Notification.objects.filter(recipient=self.admin, kind='course_request_rejected').exists())

    def test_inbox_mark_read_and_push_subscription(self):
        Notification.objects.create(
            recipient=self.faculty,
            kind='course_assigned',
            title='Course assigned',
            body='You now handle CS101.',
            href='/faculty/dashboard',
        )
        listed = self.client.get(
            '/api/auth/notifications/',
            HTTP_AUTHORIZATION=f'Bearer {self.faculty_token}',
        )
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data['unread_count'], 1)
        notice_id = listed.data['notifications'][0]['id']

        hidden = self.client.get(
            '/api/auth/notifications/',
            HTTP_AUTHORIZATION=f'Bearer {self.admin_token}',
        )
        self.assertEqual(hidden.data['unread_count'], 0)

        read = self.client.post(
            '/api/auth/notifications/read/',
            {'ids': [notice_id]},
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.faculty_token}',
        )
        self.assertEqual(read.status_code, 200)
        self.assertEqual(read.data['unread_count'], 0)

        subscribed = self.client.post(
            '/api/auth/notifications/push-subscribe/',
            {
                'endpoint': 'https://push.example.test/faculty',
                'keys': {'p256dh': 'key', 'auth': 'auth'},
            },
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.faculty_token}',
        )
        self.assertEqual(subscribed.status_code, 200)
        self.assertTrue(PushSubscription.objects.filter(user=self.faculty).exists())

    def test_scheduled_maintenance_notifies_faculty_and_stays_readable_while_paused(self):
        start = timezone.now() + timedelta(days=3)
        end = start + timedelta(hours=2)
        scheduled = self.client.post(
            '/api/auth/maintenance-schedules/',
            {'starts_at': start.isoformat(), 'ends_at': end.isoformat()},
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.super_token}',
        )
        self.assertEqual(scheduled.status_code, 201, scheduled.data)
        note = Notification.objects.get(recipient=self.faculty, kind='maintenance_scheduled')
        self.assertIn('Save your work', note.body)

        paused = self.client.patch(
            '/api/auth/platform-theme/',
            {'maintenance_enabled': True, 'maintenance_message': 'Back at 4.'},
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.super_token}',
        )
        self.assertEqual(paused.status_code, 200, paused.data)
        self.assertTrue(
            Notification.objects.filter(recipient=self.faculty, kind='maintenance_started').exists()
        )
        blocked = self.client.get(
            '/api/auth/dashboard/summary/',
            HTTP_AUTHORIZATION=f'Bearer {self.faculty_token}',
        )
        self.assertEqual(blocked.status_code, 503)
        inbox = self.client.get(
            '/api/auth/notifications/',
            HTTP_AUTHORIZATION=f'Bearer {self.faculty_token}',
        )
        self.assertEqual(inbox.status_code, 200)
        self.assertGreaterEqual(inbox.data['unread_count'], 1)
