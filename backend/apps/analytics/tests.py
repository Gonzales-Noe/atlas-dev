import json
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient

from apps.integrations.models import Course, CourseLoad, Ilo, UserProfile, UserRole


class FacultySheetAnalysisTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.auth_user = User.objects.create_user(
            username='faculty_user',
            email='faculty@example.com',
            password='password123',
        )
        self.client.force_authenticate(user=self.auth_user)

        self.profile = UserProfile.objects.create(
            email='faculty@example.com',
            password_hash='hash',
            role=UserRole.FACULTY,
        )
        self.course = Course.objects.create(
            course_code='IT301',
            course_title='Information Technology Fundamentals',
        )
        CourseLoad.objects.create(course=self.course, faculty=self.profile)
        Ilo.objects.create(course=self.course, ilo_code='ILO1', ilo_description='Analyze performance trends')
        Ilo.objects.create(course=self.course, ilo_code='ILO2', ilo_description='Recommend remediation actions')

    def test_faculty_sheet_analysis_persists_mapping_and_returns_metrics(self):
        raw_data = {
            'range': 'Assessment 1 Scores!B1:C3',
            'values': [
                ['Student', 'Quiz 1', 'Quiz 2'],
                ['S1', '80', '90'],
                ['S2', '70', '85'],
            ],
        }

        with patch('apps.analytics.views.GoogleSheetsAPIKeyService') as sheets_service_class, patch(
            'apps.analytics.views.PrescriptiveAnalyticsService.generate_recommendations',
            return_value='Add a review session before the next assessment.',
        ):
            sheets_service = sheets_service_class.return_value
            sheets_service.api_key = 'test-api-key'
            sheets_service.get_sheet_data.return_value = raw_data

            response = self.client.post(
                '/api/analytics/faculty-sheet-analysis/',
                {
                    'course_id': str(self.course.course_id),
                    'sheet_id': '12sKoxZ1n6Vv_Uu-R9IcQWscfi2P9OftN7Jv9kBmArrw',
                    'range': 'Assessment 1 Scores!B1:C21',
                },
                format='json',
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload['success'])
        self.assertEqual(payload['mapping']['course_id'], str(self.course.course_id))
        self.assertEqual(payload['mapping']['sheet_id'], '12sKoxZ1n6Vv_Uu-R9IcQWscfi2P9OftN7Jv9kBmArrw')
        self.assertEqual(payload['sheet_info']['total_records'], 2)
        self.assertEqual(payload['analytics']['computed_means']['1'], 75.0)
        self.assertEqual(payload['analytics']['computed_means']['2'], 87.5)
        self.assertIn('1', payload['analytics']['ilo_mapping'])
        self.assertEqual(
            payload['analytics']['recommendations'],
            'Add a review session before the next assessment.',
        )

        with connection.cursor() as cursor:
            columns = {
                column.name
                for column in connection.introspection.get_table_description(cursor, 'grade_sheet_mappings')
            }
            if {'sheets_document_id', 'sheet_range'}.issubset(columns):
                cursor.execute(
                    'SELECT course_id::text, sheets_document_id, sheet_range FROM grade_sheet_mappings WHERE course_id = %s',
                    [str(self.course.course_id)],
                )
                saved_course_id, saved_sheet_id, saved_range = cursor.fetchone()
                self.assertEqual(saved_course_id, str(self.course.course_id))
                self.assertEqual(saved_sheet_id, '12sKoxZ1n6Vv_Uu-R9IcQWscfi2P9OftN7Jv9kBmArrw')
                self.assertEqual(saved_range, 'Assessment 1 Scores!B1:C21')
            else:
                cursor.execute(
                    'SELECT course_id::text, google_sheet_url, weighting_schema FROM grade_sheet_mappings WHERE course_id = %s',
                    [str(self.course.course_id)],
                )
                saved_course_id, saved_url, saved_weighting_schema = cursor.fetchone()
                self.assertEqual(saved_course_id, str(self.course.course_id))
                self.assertIn('12sKoxZ1n6Vv_Uu-R9IcQWscfi2P9OftN7Jv9kBmArrw', saved_url)
                if isinstance(saved_weighting_schema, str):
                    saved_weighting_schema = json.loads(saved_weighting_schema)
                self.assertEqual(saved_weighting_schema['sheet_id'], '12sKoxZ1n6Vv_Uu-R9IcQWscfi2P9OftN7Jv9kBmArrw')
                self.assertEqual(saved_weighting_schema['range'], 'Assessment 1 Scores!B1:C21')

    def test_faculty_sheet_analysis_rejects_unassigned_course(self):
        other_course = Course.objects.create(course_code='IT302', course_title='Networks')

        response = self.client.post(
            '/api/analytics/faculty-sheet-analysis/',
            {
                'course_id': str(other_course.course_id),
                'sheet_id': '12sKoxZ1n6Vv_Uu-R9IcQWscfi2P9OftN7Jv9kBmArrw',
                'range': 'Assessment 1 Scores!B1:C21',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['success'], False)