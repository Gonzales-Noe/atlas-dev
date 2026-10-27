from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.curriculum.views import (
    _align_generated_section_to_blueprint,
    _build_sectioned_assessment_payload,
    _materialize_tos_exam,
    create_course,
)
from apps.integrations.syllabus_tab_split import split_markdown_into_tabs


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


class TosFormulaTests(SimpleTestCase):
    def test_hours_split_points_minutes_and_bloom_counts_exactly(self):
        exam = _materialize_tos_exam({
            'totalTestItems': 10,
            'totalExamMinutes': 100,
            'topics': [
                {
                    'topic': 'Hardware',
                    'hours_class': 1,
                    'bloom_pct': {'remember': 50, 'understand': 50},
                },
                {
                    'topic': 'Operating systems',
                    'hours_class': 1,
                    'bloom_pct': {'apply': 100},
                },
                {
                    'topic': 'Access control',
                    'hours_class': 2,
                    'bloom_pct': {'analyze': 100},
                },
            ],
        })

        topics = exam['topics']
        self.assertEqual([topic['total_points'] for topic in topics], [3, 2, 5])
        self.assertEqual([topic['hours_min'] for topic in topics], [25, 25, 50])
        self.assertEqual(topics[0]['bloom_items']['remember'], 2)
        self.assertEqual(topics[0]['bloom_items']['understand'], 1)
        self.assertEqual(topics[0]['bloom_items']['apply'], 0)
        self.assertEqual(topics[1]['bloom_items']['apply'], 2)
        self.assertEqual(topics[2]['bloom_items']['analyze'], 5)
        self.assertEqual(sum(topic['total_points'] for topic in topics), 10)
        self.assertEqual(sum(topic['hours_min'] for topic in topics), 100)

    def test_assessment_items_keep_tos_bloom_counts(self):
        exam = _materialize_tos_exam({
            'totalTestItems': 10,
            'topics': [
                {
                    'topic': 'Hardware',
                    'hours_class': 1,
                    'bloom_pct': {'remember': 50, 'understand': 50},
                },
                {
                    'topic': 'Operating systems',
                    'hours_class': 1,
                    'bloom_pct': {'apply': 100},
                },
            ],
        })
        sections = _build_sectioned_assessment_payload(
            exam['topics'],
            'major examination',
            99,
            assessment_label='Prelim',
        )
        counts = {}
        for section in sections:
            for item in section['items']:
                key = (section['section_title'], item['bloom_level'])
                counts[key] = counts.get(key, 0) + 1

        self.assertEqual(sum(len(section['items']) for section in sections), 10)
        self.assertEqual(counts[('Hardware', 'Remember')], 3)
        self.assertEqual(counts[('Hardware', 'Understand')], 2)
        self.assertEqual(counts[('Operating systems', 'Apply')], 5)
        self.assertNotIn(('Hardware', 'Apply'), counts)
        self.assertNotIn(('Hardware', 'Create'), counts)

    def test_generated_items_are_forced_back_to_blueprint_blooms(self):
        blueprint = {
            'section_title': 'Hardware',
            'exam_label': 'Prelim',
            'bloom_distribution': {'Remember': 2, 'Apply': 1},
            'items': [
                {'item_number': 1, 'bloom_level': 'Remember', 'bloom_verb': 'list', 'ilo_refs': ['ILO1'], 'question_text': 'slot 1'},
                {'item_number': 2, 'bloom_level': 'Remember', 'bloom_verb': 'list', 'ilo_refs': ['ILO1'], 'question_text': 'slot 2'},
                {'item_number': 3, 'bloom_level': 'Apply', 'bloom_verb': 'use', 'ilo_refs': ['ILO2'], 'question_text': 'slot 3'},
            ],
        }
        generated = {
            'section_title': 'Hardware',
            'items': [
                {'item_number': 1, 'bloom_level': 'Create', 'question_text': 'Question one', 'choices': ['A. a', 'B. b', 'C. c', 'D. d'], 'correct_answer': 'B'},
                {'item_number': 2, 'bloom_level': 'Evaluate', 'question_text': 'Question two', 'choices': ['A. a', 'B. b', 'C. c', 'D. d'], 'correct_answer': 'C'},
                {'item_number': 3, 'bloom_level': 'Analyze', 'question_text': 'Question three', 'choices': ['A. a', 'B. b', 'C. c', 'D. d'], 'correct_answer': 'A'},
            ],
        }

        aligned = _align_generated_section_to_blueprint(generated, blueprint)
        self.assertEqual([item['bloom_level'] for item in aligned['items']], ['Remember', 'Remember', 'Apply'])
        self.assertEqual([item['question_text'] for item in aligned['items']], ['Question one', 'Question two', 'Question three'])
        self.assertEqual(aligned['allocated_items'], 3)


class SyllabusTabSplitTests(SimpleTestCase):
    def test_headings_and_table_rows_stay_with_their_tab(self):
        markdown = """
Batangas State University
College of Informatics and Computing Sciences

# University Vision
A premier national university.

# Course Description
This course covers systems administration.

# Intended Learning Outcomes
1. Install an operating system.

# Table of Specifications
| Topic | Hours | Remember |
| Introduction | 2 | 40 |
| Storage | 4 | 10 |

# Course Policies
Attendance is required.
"""
        tabs = {tab['key']: tab['text'] for tab in split_markdown_into_tabs(markdown)}
        self.assertIn('premier national university', tabs['basic'].lower())
        self.assertIn('systems administration', tabs['details'].lower())
        self.assertIn('install an operating system', tabs['iloat'].lower())
        self.assertIn('Introduction | 2 | 40', tabs['tos'])
        self.assertIn('Attendance is required', tabs['policies'])
        self.assertNotIn('Introduction | 2 | 40', tabs.get('schedule', ''))
