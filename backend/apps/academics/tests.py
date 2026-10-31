from datetime import datetime, timezone as dt_timezone
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.academics.productivity import build_faculty_productivity, build_workspace_pace
from apps.academics.views import FacultyProductivityView, SetupStatusView


class SetupStatusFastPathTests(SimpleTestCase):
    def test_excluding_counts_skips_database_count_queries(self):
        request = APIRequestFactory().get('/api/academics/setup/status/', {'include_counts': 'false'})
        request.user = SimpleNamespace(
            is_authenticated=True,
            institution=SimpleNamespace(setup_completed=True, setup_completed_at=None),
        )
        force_authenticate(request, user=request.user)

        with (
            patch('apps.academics.views.Section.objects.filter') as sections,
            patch('apps.academics.views.Course.objects.filter') as courses,
            patch('apps.academics.views.UserProfile.objects.filter') as faculty,
            patch('apps.academics.views.GlobalDocument.objects.filter') as documents,
        ):
            response = SetupStatusView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data,
            {'setup_completed': True, 'setup_completed_at': None},
        )
        sections.assert_not_called()
        courses.assert_not_called()
        faculty.assert_not_called()
        documents.assert_not_called()


class FacultyProductivityBuilderTests(SimpleTestCase):
    def test_counts_outputs_and_keeps_student_fields_out(self):
        owner = uuid4()
        quiet = uuid4()
        former = uuid4()
        now = datetime(2026, 10, 31, 6, 0, tzinfo=dt_timezone.utc)
        events = [
            (owner, 'syllabi', datetime(2026, 10, 27, 2, 0, tzinfo=dt_timezone.utc)),
            (owner, 'modules', datetime(2026, 10, 20, 2, 0, tzinfo=dt_timezone.utc)),
            (owner, 'modules', datetime(2026, 10, 21, 2, 0, tzinfo=dt_timezone.utc)),
            (owner, 'assessments', datetime(2026, 8, 1, 2, 0, tzinfo=dt_timezone.utc)),
            (owner, 'source_files', datetime(2026, 10, 28, 2, 0, tzinfo=dt_timezone.utc)),
            (former, 'modules', datetime(2026, 10, 28, 2, 0, tzinfo=dt_timezone.utc)),
            (uuid4(), 'syllabi', datetime(2026, 10, 28, 2, 0, tzinfo=dt_timezone.utc)),
        ]

        payload = build_faculty_productivity([owner, quiet, former], events, now=now)

        self.assertEqual(payload['totals'], {
            'syllabi': 1,
            'modules': 3,
            'assessments': 1,
            'source_files': 1,
        })
        self.assertNotIn('by_faculty', payload)
        self.assertFalse(any('student' in key or 'name' in key or 'email' in key for key in payload))
        self.assertEqual(len(payload['weekly']), 12)
        self.assertEqual(payload['weekly'][-1]['syllabi'], 1)
        self.assertEqual(payload['weekly'][-1]['source_files'], 1)
        self.assertEqual(payload['weekly'][-2]['modules'], 2)
        self.assertEqual(sum(week['assessments'] for week in payload['weekly']), 0)
        rendered = str(payload)
        self.assertNotIn(str(owner), rendered)
        self.assertNotIn(str(former), rendered)


class WorkspacePaceTests(SimpleTestCase):
    def test_reports_the_step_that_takes_longest_without_names(self):
        now = datetime(2026, 10, 31, tzinfo=dt_timezone.utc)
        courses = [
            {
                'created_at': datetime(2026, 10, 1, tzinfo=dt_timezone.utc),
                'syllabus_at': datetime(2026, 10, 3, tzinfo=dt_timezone.utc),
                'module_at': datetime(2026, 10, 17, tzinfo=dt_timezone.utc),
                'assessment_at': None,
                'grading_at': None,
                'analytics_at': None,
            },
            {
                'created_at': datetime(2026, 10, 20, tzinfo=dt_timezone.utc),
                'syllabus_at': None,
                'module_at': None,
                'assessment_at': None,
                'grading_at': None,
                'analytics_at': None,
            },
        ]

        pace = build_workspace_pace(courses, now=now)
        week_of_syllabus = next(row for row in pace['weekly'] if row['period'] == 'Sep 28')
        week_of_modules = next(row for row in pace['weekly'] if row['period'] == 'Oct 12')
        october = next(row for row in pace['monthly'] if row['period'] == 'Oct 2026')

        self.assertEqual(len(pace['weekly']), 12)
        self.assertEqual(len(pace['monthly']), 12)
        self.assertEqual(week_of_syllabus['syllabus'], 2)
        self.assertIsNone(week_of_syllabus['module'])
        self.assertEqual(week_of_modules['module'], 14)
        self.assertEqual(october['syllabus'], 2)
        self.assertEqual(october['module'], 14)
        self.assertIsNone(october['assessment'])
        self.assertEqual(pace['average']['weekly']['module'], 14)
        self.assertIsNone(pace['average']['monthly']['grading'])
        rendered = str(pace)
        self.assertNotIn('student', rendered)
        self.assertNotIn('faculty', rendered.lower())


class FacultyProductivityViewTests(SimpleTestCase):
    def test_faculty_cannot_view_productivity(self):
        request = APIRequestFactory().get('/api/academics/faculty-productivity/')
        request.user = SimpleNamespace(
            is_authenticated=True,
            role='faculty',
            institution=SimpleNamespace(),
        )
        force_authenticate(request, user=request.user)

        response = FacultyProductivityView.as_view()(request)

        self.assertEqual(response.status_code, 403)

    def test_admin_receives_institution_payload(self):
        institution = SimpleNamespace(name='Lipa')
        request = APIRequestFactory().get('/api/academics/faculty-productivity/')
        request.user = SimpleNamespace(
            is_authenticated=True,
            role='admin',
            institution=institution,
        )
        force_authenticate(request, user=request.user)
        payload = {'totals': {'syllabi': 0, 'modules': 0, 'assessments': 0, 'source_files': 0}}

        with patch(
            'apps.academics.views.faculty_productivity_for_institution',
            return_value=payload,
        ) as builder:
            response = FacultyProductivityView.as_view()(request)

        builder.assert_called_once_with(institution)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, payload)
