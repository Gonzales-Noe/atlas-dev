from django.test import SimpleTestCase

from apps.integrations.fixed_syllabus import apply_fixed_content


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
