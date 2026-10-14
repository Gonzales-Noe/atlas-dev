from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.settings import api_settings

from apps.integrations.models import UserProfile
from apps.users.serializers import (
    FacultyCreateSerializer,
    UserAccountSerializer,
    UserProfileSerializer,
    UserProfileTokenRefreshSerializer,
)


class FacultyAssignmentSectionTests(SimpleTestCase):
    @patch('apps.users.serializers.Section.objects.filter')
    @patch('apps.users.serializers.Section.objects.create')
    def test_assignment_section_name_is_resolved_to_section_instance(
        self,
        create_section,
        filter_sections,
    ):
        institution = object()
        section = object()
        filter_sections.return_value.first.return_value = None
        create_section.return_value = section

        resolved = FacultyCreateSerializer._get_assignment_section(
            institution,
            'BSIT 4101',
        )

        self.assertIs(resolved, section)
        filter_sections.assert_called_once_with(
            institution=institution,
            code__iexact='BSIT 4101',
        )
        create_section.assert_called_once_with(
            institution=institution,
            code='BSIT 4101',
        )

    @patch('apps.users.serializers.Section.objects.filter')
    @patch('apps.users.serializers.Section.objects.create')
    def test_assignment_reuses_existing_section_case_insensitively(
        self,
        create_section,
        filter_sections,
    ):
        institution = object()
        section = object()
        filter_sections.return_value.first.return_value = section

        resolved = FacultyCreateSerializer._get_assignment_section(
            institution,
            'bsit 4101',
        )

        self.assertIs(resolved, section)
        create_section.assert_not_called()


class AcademicHierarchyApiFieldTests(SimpleTestCase):
    def test_account_serializers_do_not_expose_legacy_college_fields(self):
        for serializer_class in (UserAccountSerializer, UserProfileSerializer):
            with self.subTest(serializer=serializer_class.__name__):
                fields = serializer_class().fields
                self.assertNotIn('college_id', fields)
                self.assertNotIn('college_name', fields)
                self.assertNotIn('college_code', fields)

    def test_faculty_creation_does_not_accept_college_assignment(self):
        self.assertNotIn('college_id', FacultyCreateSerializer().fields)


class UserProfileTokenRefreshTests(SimpleTestCase):
    def test_deleted_profile_refresh_token_returns_unauthorized(self):
        refresh = Mock()
        refresh.payload = {api_settings.USER_ID_CLAIM: 'deleted-profile'}

        with (
            patch.object(UserProfileTokenRefreshSerializer, 'token_class', return_value=refresh),
            patch(
                'apps.users.serializers.UserProfile.objects.get',
                side_effect=UserProfile.DoesNotExist,
            ),
        ):
            response = APIClient().post(
                '/api/auth/token/refresh/',
                {'refresh': 'refresh-token'},
                format='json',
            )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(
            response.data['detail'],
            'No active account found with the given credentials.',
        )


@override_settings(
    PAYMONGO_SECRET_KEY='sk_test_example',
    PAYMONGO_API_BASE='https://api.paymongo.com',
    PAYMONGO_SUCCESS_URL='https://atlas.example/billing/success',
    PAYMONGO_CANCEL_URL='https://atlas.example/billing/cancel',
)
class BillingCheckoutTests(SimpleTestCase):
    @patch('apps.users.views.requests.post')
    def test_checkout_saves_blank_reference_when_paymongo_returns_null(self, post):
        institution = Mock()
        institution.name = 'Test Institution'
        institution.selected_plan = ''
        user = SimpleNamespace(
            role='admin',
            institution=institution,
            email='admin@example.com',
            is_authenticated=True,
        )
        post.return_value.status_code = 201
        post.return_value.json.return_value = {
            'data': {
                'id': 'cs_test_session',
                'attributes': {
                    'checkout_url': 'https://checkout.paymongo.com/test',
                    'reference_number': None,
                },
            },
        }
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.post(
            '/api/auth/billing/checkout/',
            {'selected_plan': 'Starter'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(institution.paymongo_reference_number, '')
        institution.save.assert_called_once()

    @patch('apps.users.views.requests.post')
    def test_checkout_saves_blank_reference_when_paymongo_omits_it(self, post):
        institution = Mock()
        institution.name = 'Test Institution'
        institution.selected_plan = ''
        user = SimpleNamespace(
            role='admin',
            institution=institution,
            email='admin@example.com',
            is_authenticated=True,
        )
        post.return_value.status_code = 201
        post.return_value.json.return_value = {
            'data': {
                'id': 'cs_test_session',
                'attributes': {
                    'checkout_url': 'https://checkout.paymongo.com/test',
                },
            },
        }
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.post(
            '/api/auth/billing/checkout/',
            {'selected_plan': 'Starter'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(institution.paymongo_reference_number, '')
        institution.save.assert_called_once()
