from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.contrib.auth.hashers import check_password, make_password
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework import serializers
from rest_framework.test import APIClient
from rest_framework_simplejwt.settings import api_settings

from apps.integrations.models import UserProfile
from apps.users.serializers import (
    FacultyCreateSerializer,
    ProfileSettingsUpdateSerializer,
    UserAccountSerializer,
    UserProfileSerializer,
    UserProfileTokenRefreshSerializer,
)


class FacultyAssignmentSectionTests(SimpleTestCase):
    def _validate(self, assignments):
        serializer = FacultyCreateSerializer()
        serializer.context['request'] = SimpleNamespace(
            user=SimpleNamespace(institution=object()),
        )
        return serializer.validate_assignments(assignments)

    def test_assignments_can_be_omitted_entirely(self):
        self.assertEqual(self._validate([]), [])

    def test_blank_assignment_rows_are_ignored(self):
        result = self._validate([
            {'section': '', 'courses': [{'course_code': '', 'course_title': ''}]},
            {'section': 'BSIT 4101'},
        ])
        self.assertEqual(result, [])

    def test_courses_still_require_a_section(self):
        with self.assertRaises(serializers.ValidationError):
            self._validate([
                {'section': '', 'courses': [{'course_code': 'CS 101', 'course_title': 'Intro'}]},
            ])

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


class ProfileSettingsUpdateSerializerTests(SimpleTestCase):
    def setUp(self):
        self.user = SimpleNamespace(
            full_name='Previous Name',
            picture_url=None,
            password_hash=make_password('CurrentPassword9!'),
            save=Mock(),
        )

    def test_updates_display_name_and_image_url(self):
        serializer = ProfileSettingsUpdateSerializer(
            self.user,
            data={
                'full_name': 'Updated Name',
                'picture_url': 'https://images.example.com/profile.png',
            },
            partial=True,
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        self.assertEqual(self.user.full_name, 'Updated Name')
        self.assertEqual(self.user.picture_url, 'https://images.example.com/profile.png')
        self.user.save.assert_called_once_with(update_fields=['full_name', 'picture_url'])

    def test_password_change_requires_the_correct_current_password(self):
        serializer = ProfileSettingsUpdateSerializer(
            self.user,
            data={
                'current_password': 'incorrect-password',
                'new_password': 'NewPassword9!',
            },
            partial=True,
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn('current_password', serializer.errors)
        self.user.save.assert_not_called()

    def test_password_change_hashes_the_new_password(self):
        serializer = ProfileSettingsUpdateSerializer(
            self.user,
            data={
                'current_password': 'CurrentPassword9!',
                'new_password': 'NewPassword9!',
            },
            partial=True,
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        self.assertTrue(check_password('NewPassword9!', self.user.password_hash))
        self.user.save.assert_called_once_with(update_fields=['password_hash'])


class MeProfileUpdateApiTests(TestCase):
    def setUp(self):
        self.user = UserProfile.objects.create(
            email='profile-settings@example.com',
            full_name='Previous Name',
            password_hash=make_password('CurrentPassword9!'),
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_saved_display_name_is_returned_for_the_sidebar(self):
        response = self.client.patch(
            '/api/auth/me/',
            {
                'full_name': 'Updated Display Name',
                'picture_url': 'https://images.example.com/profile.png',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['full_name'], 'Updated Display Name')
        self.assertEqual(response.data['name'], 'Updated Display Name')
        self.assertEqual(response.data['picture_url'], 'https://images.example.com/profile.png')


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
