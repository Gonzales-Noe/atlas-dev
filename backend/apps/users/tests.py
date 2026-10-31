from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db.utils import OperationalError
from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings
from rest_framework import serializers
from rest_framework.test import APIClient
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import AccessToken

from apps.users.middleware import DatabaseReconnectMiddleware

from apps.integrations.models import UserProfile, UserRole
from apps.users.serializers import (
    ContactFormSerializer,
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


class InvalidAccessTokenTests(SimpleTestCase):
    @override_settings(ALLOWED_HOSTS=['testserver'], SECURE_SSL_REDIRECT=False)
    @patch('apps.users.authentication.UserProfile.objects')
    def test_malformed_user_id_is_unauthorized(self, objects):
        objects.select_related.return_value.get.side_effect = ValidationError('bad uuid')
        access = AccessToken()
        access['user_id'] = 'not-a-uuid'

        response = APIClient().get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f'Bearer {access}',
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data['detail'], 'User not found or inactive.')


class DatabaseReconnectMiddlewareTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def test_login_retries_once_after_idle_disconnect(self):
        calls = {'count': 0}

        def get_response(request):
            calls['count'] += 1
            return HttpResponse('ok')

        middleware = DatabaseReconnectMiddleware(get_response)
        request = self.factory.post('/api/auth/token/')
        disconnect = OperationalError('server closed the connection unexpectedly')
        response = middleware.process_exception(request, disconnect)
        second = middleware.process_exception(request, disconnect)

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(second)
        self.assertEqual(calls['count'], 1)
        self.assertTrue(request._atlas_db_retried)

    def test_non_auth_post_is_not_retried(self):
        def get_response(request):
            raise AssertionError('unsafe request was retried')

        middleware = DatabaseReconnectMiddleware(get_response)
        request = self.factory.post('/api/curriculum/generate/')
        response = middleware.process_exception(
            request,
            OperationalError('server closed the connection unexpectedly'),
        )

        self.assertIsNone(response)


class InstitutionCustomizationSaveTests(SimpleTestCase):
    def _patch(self, data):
        from apps.users.views import InstitutionCustomizationView

        customization = SimpleNamespace(
            institution=None,
            syllabus_sections=[],
            syllabus_field_map={'sections': [], 'click_log': []},
            save=Mock(),
        )
        request = SimpleNamespace(
            data=data,
            user=SimpleNamespace(role='admin', institution=object()),
        )
        view = InstitutionCustomizationView()
        with patch(
            'apps.users.views.InstitutionCustomization.objects.get_or_create',
            return_value=(customization, False),
        ), patch.object(
            InstitutionCustomizationView,
            'get',
            return_value=SimpleNamespace(data={'syllabus_sections': customization.syllabus_sections}),
        ), patch('apps.users.views.publish_fixed_syllabus') as publish:
            view.patch(request)
            self.published_sections = publish.call_args.args[0] if publish.called else None
        return customization

    def test_framework_table_cells_survive_when_field_map_is_echoed(self):
        sections = [{
            'key': 'framework-mapping',
            'label': 'Framework Mapping',
            'enabled': True,
            'blueprint_tables': {
                'iga-table': {
                    'columns': ['IGA', 'Institutional Graduate Attributes (IGA) Statements'],
                    'rows': [['IGA1', 'Communicates effectively in writing.']],
                    'rowLabels': [],
                },
            },
        }]
        customization = self._patch({
            'syllabus_sections': sections,
            'syllabus_field_map': {'sections': [], 'click_log': []},
        })

        self.assertEqual(
            customization.syllabus_sections[0]['blueprint_tables']['iga-table']['rows'][0][1],
            'Communicates effectively in writing.',
        )
        self.assertEqual(
            self.published_sections[0]['blueprint_tables']['iga-table']['rows'][0][1],
            'Communicates effectively in writing.',
        )
        customization.save.assert_called_once()

    def test_field_map_only_update_still_derives_sections(self):
        customization = self._patch({
            'syllabus_field_map': {
                'sections': [{'label': 'Course Policies', 'key': 'course-policies'}],
                'click_log': [],
            },
        })

        self.assertEqual(customization.syllabus_sections[0]['label'], 'Course Policies')


@override_settings(
    SECURE_SSL_REDIRECT=False,
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'contact-form-tests',
        },
    },
)
class ContactFormSecurityTests(SimpleTestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()

    def test_message_html_and_control_characters_are_stripped(self):
        serializer = ContactFormSerializer(data={
            'name': 'Ann\r\nBcc: spam@example.com',
            'email': 'Ann@School.edu',
            'institution': 'State U<script>',
            'message': 'Hello <img src=x onerror="alert(1)">\n\nThanks',
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertNotIn('\n', serializer.validated_data['name'])
        self.assertNotIn('<', serializer.validated_data['name'])
        self.assertNotIn('<', serializer.validated_data['institution'])
        self.assertNotIn('<', serializer.validated_data['message'])
        self.assertEqual(serializer.validated_data['email'], 'ann@school.edu')

    def test_long_message_and_link_spam_are_rejected(self):
        too_long = ContactFormSerializer(data={
            'name': 'Ann',
            'email': 'ann@school.edu',
            'institution': 'State U',
            'message': 'a' * 2001,
        })
        self.assertFalse(too_long.is_valid())
        links = ContactFormSerializer(data={
            'name': 'Ann',
            'email': 'ann@school.edu',
            'institution': 'State U',
            'message': ' '.join(f'https://spam.example/{i}' for i in range(6)),
        })
        self.assertFalse(links.is_valid())

    def _post(self, **extra):
        client = APIClient()
        payload = {
            'name': 'Ann',
            'email': 'ann@school.edu',
            'institution': 'State U',
            'message': 'We would like a demo.',
        }
        payload.update(extra.pop('payload', {}))
        return client.post('/api/users/contact/', payload, format='json', **extra)

    @patch('apps.users.email_service.send_contact_notification', return_value=True)
    def test_honeypot_accepts_without_sending(self, notify):
        response = self._post(payload={'leave_blank': 'https://spam.example'})
        self.assertEqual(response.status_code, 201)
        notify.assert_not_called()

    @patch('apps.users.email_service.send_contact_notification', return_value=True)
    def test_foreign_origin_is_rejected(self, _notify):
        response = self._post(HTTP_ORIGIN='https://evil.example')
        self.assertEqual(response.status_code, 403)

    @patch('apps.users.email_service.send_contact_notification', return_value=True)
    def test_spoofed_loopback_origin_is_rejected(self, _notify):
        response = self._post(HTTP_ORIGIN='http://127.0.0.1', REMOTE_ADDR='203.0.113.8')
        self.assertEqual(response.status_code, 403)

    def test_form_encoded_post_is_rejected(self):
        response = APIClient().post(
            '/api/users/contact/',
            {'name': 'Ann', 'email': 'ann@school.edu', 'institution': 'State U', 'message': 'Hi'},
            format='multipart',
        )
        self.assertEqual(response.status_code, 415)

    @patch('apps.users.email_service.send_contact_notification', return_value=True)
    @patch('apps.users.email_service.send_contact_confirmation', return_value=True)
    def test_sixth_send_from_one_address_is_limited(self, confirm, notify):
        for index in range(5):
            response = self._post(payload={'email': f'person{index}@school.edu', 'message': f'Demo {index}'})
            self.assertEqual(response.status_code, 201, response.content)
        blocked = self._post(payload={'email': 'person6@school.edu', 'message': 'Demo 6'})
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(notify.call_count, 5)
        self.assertEqual(confirm.call_count, 5)

    @patch('apps.users.middleware.cache.add', side_effect=RuntimeError('cache down'))
    def test_contact_is_refused_when_the_limiter_is_down(self, _add):
        response = self._post()
        self.assertEqual(response.status_code, 429)


@override_settings(ALLOWED_HOSTS=['testserver'], SECURE_SSL_REDIRECT=False)
class AuthSessionTests(TestCase):
    def setUp(self):
        self.user = UserProfile.objects.create(
            email='faculty.session@atlas.test',
            password_hash=make_password('SessionPass9!'),
            role=UserRole.FACULTY,
            is_active=True,
        )
        self.client = APIClient()

    def _login(self):
        response = self.client.post(
            '/api/auth/token/',
            {'email': self.user.email, 'password': 'SessionPass9!'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.data

    def test_second_login_signs_out_the_first_device(self):
        first = self._login()
        second = self._login()

        stale = self.client.post(
            '/api/auth/token/refresh/',
            {'refresh': first['refresh']},
            format='json',
        )
        self.assertEqual(stale.status_code, 401)
        self.assertEqual(stale.data['code'], 'session_superseded')

        current = self.client.post(
            '/api/auth/token/refresh/',
            {'refresh': second['refresh']},
            format='json',
        )
        self.assertEqual(current.status_code, 200)
        me = self.client.get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f"Bearer {second['access']}",
        )
        self.assertEqual(me.status_code, 200)

    def test_idle_session_must_sign_in_again(self):
        data = self._login()
        self.user.refresh_from_db()
        self.user.auth_session_seen_at = timezone.now() - timedelta(minutes=33)
        self.user.save(update_fields=['auth_session_seen_at'])

        response = self.client.get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f"Bearer {data['access']}",
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data['code'], 'session_idle')

        reused = self.client.post(
            '/api/auth/token/refresh/',
            {'refresh': data['refresh']},
            format='json',
        )
        self.assertEqual(reused.status_code, 401)
        self.assertEqual(reused.data['code'], 'session_ended')

    def test_activity_extends_the_idle_window(self):
        data = self._login()
        self.user.refresh_from_db()
        self.user.auth_session_seen_at = timezone.now() - timedelta(minutes=20)
        self.user.save(update_fields=['auth_session_seen_at'])

        touched = self.client.post(
            '/api/auth/activity/',
            HTTP_AUTHORIZATION=f"Bearer {data['access']}",
        )
        self.assertEqual(touched.status_code, 200, touched.content)
        self.user.refresh_from_db()
        self.assertLess(timezone.now() - self.user.auth_session_seen_at, timedelta(minutes=1))

    def test_logout_ends_only_this_session(self):
        data = self._login()
        gone = self.client.post(
            '/api/auth/logout/',
            {'refresh': data['refresh']},
            format='json',
        )
        self.assertEqual(gone.status_code, 200)

        me = self.client.get(
            '/api/auth/me/',
            HTTP_AUTHORIZATION=f"Bearer {data['access']}",
        )
        self.assertEqual(me.status_code, 401)
        self.assertEqual(me.data['code'], 'session_ended')
