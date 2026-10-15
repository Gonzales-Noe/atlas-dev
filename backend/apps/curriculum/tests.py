from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.curriculum.views import create_course


class FacultyCourseInstitutionScopeTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    @patch('apps.curriculum.views._is_faculty_user', return_value=True)
    @patch('apps.curriculum.views.Course.objects.filter')
    @patch('apps.curriculum.views.Course.objects.create')
    @patch('apps.curriculum.views.CourseLoad.objects.create')
    def test_created_course_and_assignment_belong_to_faculty_institution(
        self,
        create_assignment,
        create_course_record,
        filter_courses,
        _is_faculty,
    ):
        user = SimpleNamespace(
            is_authenticated=True,
            institution_id='institution-a',
            email='faculty@example.com',
        )
        course = SimpleNamespace(
            course_id='course-a',
            course_code='CS101',
            course_title='Computer Science',
            description=None,
        )
        filter_courses.return_value.exists.return_value = False
        create_course_record.return_value = course
        request = self.factory.post(
            '/api/curriculum/courses/',
            {'course_code': 'CS101', 'course_title': 'Computer Science'},
            format='json',
        )
        force_authenticate(request, user=user)

        response = create_course(request)

        self.assertEqual(response.status_code, 201)
        filter_courses.assert_called_once_with(
            course_code='CS101',
            institution_id='institution-a',
        )
        create_course_record.assert_called_once_with(
            institution_id='institution-a',
            course_code='CS101',
            course_title='Computer Science',
            description=None,
        )
        create_assignment.assert_called_once_with(course=course, faculty=user)
        self.assertTrue(_is_faculty.called)

    @patch('apps.curriculum.views._is_faculty_user', return_value=True)
    @patch('apps.curriculum.views.Course.objects.filter')
    @patch('apps.curriculum.views.Course.objects.create')
    def test_course_creation_requires_an_institution(
        self,
        create_course_record,
        filter_courses,
        _is_faculty,
    ):
        user = SimpleNamespace(
            is_authenticated=True,
            institution_id=None,
            email='faculty@example.com',
        )
        request = self.factory.post(
            '/api/curriculum/courses/',
            {'course_code': 'CS101', 'course_title': 'Computer Science'},
            format='json',
        )
        force_authenticate(request, user=user)

        response = create_course(request)

        self.assertEqual(response.status_code, 400)
        filter_courses.assert_not_called()
        create_course_record.assert_not_called()
        self.assertTrue(_is_faculty.called)
