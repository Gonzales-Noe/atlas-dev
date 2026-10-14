from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.academics.views import SetupStatusView


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
