from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from apps.integrations.fixed_syllabus import apply_fixed_content, publish_fixed_syllabus


def framework_sections():
    return [{
        'key': 'framework-mapping',
        'enabled': True,
        'fields': [{
            'key': 'igas',
            'fixed': True,
            'content': 'should not map, this field is a repeat list',
        }],
        'blueprint_tables': {
            'iga-table': {
                'columns': ['IGA', 'Institutional Graduate Attributes (IGA) Statements'],
                'rows': [
                    ['IGA1', 'Communicates effectively in writing.'],
                    ['IGA2', ''],
                ],
            },
            'so-table': {
                'columns': ['SO', 'Student Outcomes (SO) Statements'],
                'rows': [['SO1', 'Solves engineering problems.']],
            },
        },
    }, {
        'key': 'university-information',
        'enabled': True,
        'is_static': False,
        'fields': [{
            'key': 'vision',
            'fixed': True,
            'content': 'A leading university.',
        }, {
            'key': 'mission',
            'fixed': False,
            'content': 'This mission is not fixed.',
        }],
    }]


class FixedSyllabusSeedTests(SimpleTestCase):
    def test_publish_copies_the_format_onto_every_institution_and_course(self):
        sections = [{
            'key': 'university-information',
            'enabled': True,
            'fields': [{'key': 'vision', 'fixed': True, 'content': 'Shared vision'}],
        }]
        institutions = [SimpleNamespace(pk=1), SimpleNamespace(pk=2)]
        courses = [SimpleNamespace(pk='course')]
        saved = []

        class Customization:
            def __init__(self):
                self.syllabus_sections = []

            def save(self, update_fields=None):
                saved.append(list(self.syllabus_sections))

        customization = Customization()

        with patch('apps.integrations.fixed_syllabus.Institution.objects.all') as institutions_all, \
                patch('apps.integrations.fixed_syllabus.InstitutionCustomization.objects.get_or_create', return_value=(customization, False)), \
                patch('apps.integrations.fixed_syllabus.Course.objects.all') as courses_all, \
                patch('apps.integrations.fixed_syllabus.seed_course_syllabi', return_value=1) as seed:
            institutions_all.return_value.iterator.return_value = iter(institutions)
            courses_all.return_value.iterator.return_value = iter(courses)
            updated = publish_fixed_syllabus(sections)

        self.assertEqual(updated, 1)
        self.assertEqual(customization.syllabus_sections, sections)
        self.assertEqual(len(saved), 1)
        seed.assert_called_once_with(courses[0], sections)
    def test_fixed_tables_and_fields_seed_without_wiping_other_content(self):
        seeded = apply_fixed_content({
            'course_title': 'Database Systems',
            'course_code': 'IT 312',
            'igas': [{'code': 'IGA1', 'title': '', 'description': 'old faculty text'}],
            'mission': 'Faculty mission stays',
            'custom_subsections': {'course-policies': {'local-note': 'keep me'}},
        }, framework_sections())

        self.assertEqual(seeded['course_title'], 'Database Systems')
        self.assertEqual(seeded['course_code'], 'IT 312')
        self.assertEqual(seeded['mission'], 'Faculty mission stays')
        self.assertEqual(seeded['vision'], 'A leading university.')
        self.assertEqual(seeded['igas'][0]['description'], 'Communicates effectively in writing.')
        self.assertEqual(seeded['igas'][1]['code'], 'IGA2')
        self.assertEqual(seeded['student_outcomes'][0]['description'], 'Solves engineering problems.')
        self.assertEqual(seeded['custom_subsections']['course-policies']['local-note'], 'keep me')

    def test_table_with_fixed_off_does_not_replace_faculty_rows(self):
        seeded = apply_fixed_content(
            {'igas': [{'code': 'IGA1', 'title': '', 'description': 'Faculty wording'}]},
            [{
                'key': 'framework-mapping',
                'enabled': True,
                'blueprint_tables': {
                    'iga-table': {
                        'fixed': False,
                        'columns': ['IGA', 'Institutional Graduate Attributes (IGA) Statements'],
                        'rows': [['IGA1', 'Admin draft that is not locked.']],
                    },
                },
            }],
        )
        self.assertEqual(seeded['igas'][0]['description'], 'Faculty wording')

    def test_blank_fixed_field_does_not_erase_faculty_text(self):
        seeded = apply_fixed_content(
            {'vision': 'Faculty vision'},
            [{
                'key': 'university-information',
                'enabled': True,
                'fields': [{'key': 'vision', 'fixed': True, 'content': '   '}],
            }],
        )
        self.assertEqual(seeded['vision'], 'Faculty vision')

    def test_new_course_content_is_only_the_fixed_values(self):
        seeded = apply_fixed_content({}, framework_sections())
        self.assertEqual(seeded['igas'][0]['code'], 'IGA1')
        self.assertEqual(seeded['vision'], 'A leading university.')
        self.assertNotIn('mission', seeded)

    def test_static_subsection_merges_beside_existing_answers(self):
        seeded = apply_fixed_content(
            {'custom_subsections': {'extras': {'faculty-note': 'kept'}}},
            [{
                'key': 'extras',
                'enabled': True,
                'subsections': [{
                    'key': 'honor-code',
                    'is_static': True,
                    'static_content': 'Honesty is required.',
                }],
            }],
        )
        self.assertEqual(seeded['custom_subsections']['extras']['faculty-note'], 'kept')
        self.assertEqual(seeded['custom_subsections']['extras']['honor-code'], 'Honesty is required.')
