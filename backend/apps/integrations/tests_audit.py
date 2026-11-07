from datetime import timedelta
from io import StringIO

from django.contrib.auth.hashers import make_password
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.integrations.audit import (
    normalize_audit_scope,
    parse_view_reason,
    sanitize_audit_details,
    scrub_allocation_notes,
)
from apps.integrations.models import AuditLog, Institution, UserProfile, UserRole
from apps.users.serializers import tokens_for_profile


class AuditSanitizerTests(SimpleTestCase):
    def test_sanitize_drops_free_text_and_unknown_keys(self):
        cleaned = sanitize_audit_details({
            'course_code': 'CS 101',
            'allocation_note': 'private rationale',
            'password': 'nope',
            'mystery_blob': 'should go',
            'override_count': 2,
            'has_allocation_note': True,
            'changes': ['brand', 'maintenance'],
        })
        self.assertEqual(cleaned['course_code'], 'CS 101')
        self.assertEqual(cleaned['override_count'], 2)
        self.assertTrue(cleaned['has_allocation_note'])
        self.assertEqual(cleaned['changes'], ['brand', 'maintenance'])
        self.assertNotIn('allocation_note', cleaned)
        self.assertNotIn('password', cleaned)
        self.assertNotIn('mystery_blob', cleaned)

    def test_scrub_allocation_notes(self):
        details, changed = scrub_allocation_notes({'allocation_note': 'x', 'course_code': 'A'})
        self.assertTrue(changed)
        self.assertNotIn('allocation_note', details)
        self.assertTrue(details['has_allocation_note'])
        self.assertEqual(details['course_code'], 'A')

    def test_parse_view_reason_and_scope(self):
        reason, error = parse_view_reason({})
        self.assertIsNone(reason)
        self.assertTrue(error)
        reason, error = parse_view_reason({'reason': '  Ticket 1  '})
        self.assertEqual(reason, 'Ticket 1')
        self.assertIsNone(error)
        self.assertEqual(normalize_audit_scope(None), 'platform')
        self.assertEqual(normalize_audit_scope('all'), 'all')


@override_settings(ALLOWED_HOSTS=['testserver'], SECURE_SSL_REDIRECT=False)
class AdminAuditViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.institution_a = Institution.objects.create(name='Campus A')
        self.institution_b = Institution.objects.create(name='Campus B')
        self.admin_a = UserProfile.objects.create(
            email='admin-a@atlas.test',
            password_hash=make_password('unused'),
            role=UserRole.ADMIN,
            institution=self.institution_a,
            is_active=True,
        )
        self.admin_b = UserProfile.objects.create(
            email='admin-b@atlas.test',
            password_hash=make_password('unused'),
            role=UserRole.ADMIN,
            institution=self.institution_b,
            is_active=True,
        )
        self.faculty_a = UserProfile.objects.create(
            email='faculty-a@atlas.test',
            password_hash=make_password('unused'),
            role=UserRole.FACULTY,
            institution=self.institution_a,
            is_active=True,
        )
        self.token_a = tokens_for_profile(self.admin_a)['access']
        self.token_b = tokens_for_profile(self.admin_b)['access']
        self.log = AuditLog.objects.create(
            user=self.faculty_a,
            action_type='course_assigned',
            resource_type='Course',
            details={
                'course_code': 'CS 101',
                'faculty_email': 'faculty-a@atlas.test',
                'allocation_note': 'hidden',
            },
        )

    def test_list_summary_hides_identity_details(self):
        response = self.client.get(
            '/api/integrations/audit-logs/',
            HTTP_AUTHORIZATION=f'Bearer {self.token_a}',
        )
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.data['count'], 1)
        row = response.data['logs'][0]
        self.assertNotIn('details', row)
        self.assertEqual(row['summary'], 'CS 101 was assigned.')
        self.assertNotIn('faculty-a@atlas.test', row['summary'])

    def test_view_requires_reason_and_blocks_other_institution(self):
        denied = self.client.post(
            f'/api/integrations/audit-logs/{self.log.log_id}/view/',
            {'reason': 'Ticket 9'},
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.token_b}',
        )
        self.assertEqual(denied.status_code, 404)

        missing = self.client.post(
            f'/api/integrations/audit-logs/{self.log.log_id}/view/',
            {},
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.token_a}',
        )
        self.assertEqual(missing.status_code, 400)

        opened = self.client.post(
            f'/api/integrations/audit-logs/{self.log.log_id}/view/',
            {'reason': 'Support ticket 9'},
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.token_a}',
        )
        self.assertEqual(opened.status_code, 200)
        self.assertIn('faculty-a@atlas.test', opened.data['log']['summary'])
        self.assertNotIn('allocation_note', opened.data['log']['details'])
        self.assertTrue(
            AuditLog.objects.filter(
                action_type='audit_log_viewed',
                user=self.admin_a,
                resource_id=self.log.log_id,
            ).exists()
        )


@override_settings(ALLOWED_HOSTS=['testserver'], SECURE_SSL_REDIRECT=False)
class PurgeAuditLogsCommandTests(TestCase):
    def test_purge_deletes_old_rows_and_scrubs_notes(self):
        old = AuditLog.objects.create(
            action_type='course_assigned',
            resource_type='Course',
            details={'course_code': 'OLD'},
        )
        AuditLog.objects.filter(pk=old.pk).update(
            timestamp=timezone.now() - timedelta(days=365 * 4),
        )
        recent = AuditLog.objects.create(
            action_type='assessment_approved',
            resource_type='assessment',
            details={'override_count': 1, 'allocation_note': 'legacy text'},
        )

        out = StringIO()
        call_command('purge_audit_logs', '--dry-run', stdout=out)
        self.assertTrue(AuditLog.objects.filter(pk=old.pk).exists())
        self.assertIn('allocation_note', AuditLog.objects.get(pk=recent.pk).details)

        call_command('purge_audit_logs', stdout=StringIO())
        self.assertFalse(AuditLog.objects.filter(pk=old.pk).exists())
        scrubbed = AuditLog.objects.get(pk=recent.pk).details
        self.assertNotIn('allocation_note', scrubbed)
        self.assertTrue(scrubbed.get('has_allocation_note'))
