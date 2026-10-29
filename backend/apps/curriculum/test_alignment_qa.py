from django.test import SimpleTestCase

from apps.curriculum.assessment_qa import (
    SOURCE_CHECK_PACK,
    apply_source_results,
    approval_blockers,
    check_against_blueprint,
    grouped_source_check_prompt,
    pack_source_batches,
    parse_source_results,
    run_grouped_source_checks,
    source_check_max_tokens,
    source_check_prompt,
    verdicts_without_passages,
)
from apps.curriculum.consistency_checker import (
    apply_topic_judgments,
    check_consistency,
    lecture_weeks,
    lock_module_outline,
    parse_topics_cell,
    stamp_module_ilos,
)


SYLLABUS = {
    'ilos': ['Explain the history of computing.', 'Apply a classification model.'],
    'ilo_bloom': [
        {'level': 'Understand', 'verb': 'Explain'},
        {'level': 'Apply', 'verb': 'Apply'},
    ],
    'tla_chapters': [
        {
            'chapter': '1',
            'weeks': '1',
            'delivery': 'Lecture/Discussion',
            'ilo': '1',
            'outcomes': 'Explain early computing devices.',
            'topics': (
                'Evolution of Computing\n'
                '     Brief History of Electronic Computing\n'
                '     Fourth Industrial Revolution\n'
                'Written Assessment #1\n'
                'References\n'
                'Stallings, William.'
            ),
        },
        {
            'chapter': '2',
            'weeks': '2',
            'delivery': 'Lecture/Discussion',
            'ilo': '2',
            'outcomes': 'Apply a classifier to a customer record.',
            'topics': 'Customer Analytics\n     Decision Trees\nLab 1',
        },
        {
            'chapter': '3',
            'weeks': '3',
            'delivery': 'Examination',
            'topics': 'Midterm Examination',
        },
    ],
}


class ConsistencyCheckerTests(SimpleTestCase):
    def test_topics_cell_splits_title_subtopics_and_activity(self):
        parsed = parse_topics_cell(SYLLABUS['tla_chapters'][0]['topics'])
        self.assertEqual(parsed['title'], 'Evolution of Computing')
        self.assertEqual(parsed['subtopics'], [
            'Brief History of Electronic Computing',
            'Fourth Industrial Revolution',
        ])
        self.assertEqual(parsed['activity'], 'Written Assessment #1')
        self.assertNotIn('Stallings, William.', parsed['lines'])

    def test_aligned_module_passes_timeline_topic_and_competency(self):
        report = check_consistency(SYLLABUS, [
            {
                'module_id': 'mod-1',
                'week_number': 1,
                'module_title': 'Evolution of Computing',
                'module_content': {
                    'ilo_refs': [1],
                    'learning_objectives': ['Explain how electronic computing developed.'],
                    'subtopics': [
                        {'title': 'Brief History of Electronic Computing'},
                        {'title': 'Fourth Industrial Revolution'},
                    ],
                    'short_activity': {'title': 'Written Assessment #1'},
                },
            },
            {
                'module_id': 'mod-2',
                'week_number': 2,
                'module_title': 'Customer Analytics',
                'module_content': {
                    'ilo_refs': [2],
                    'learning_objectives': ['Apply a decision tree to customer data.'],
                    'subtopics': [{'title': 'Decision Trees'}],
                    'short_activity': {'title': 'Lab 1'},
                },
            },
        ])
        self.assertEqual(report['summary']['aligned'], 2)
        self.assertEqual(report['summary']['issues'], 0)
        self.assertEqual(report['orphans'], [])

    def test_missing_module_and_wrong_bloom_verb_are_issues(self):
        report = check_consistency(SYLLABUS, [
            {
                'module_id': 'mod-2',
                'week_number': 2,
                'module_title': 'Networks',
                'module_content': {
                    'ilo_refs': [1],
                    'learning_objectives': ['Design a campus network.'],
                    'subtopics': [],
                    'short_activity': {'title': 'Essay'},
                },
            },
        ])
        by_week = {row['week']: row for row in report['rows']}
        self.assertEqual(by_week[1]['status'], 'missing')
        self.assertEqual(by_week[2]['status'], 'issues')
        competency = next(check for check in by_week[2]['checks'] if check['code'] == 'competency')
        self.assertFalse(competency['ok'])
        self.assertEqual(len(report['rows']), 2)

    def test_topic_review_can_clear_a_close_title(self):
        report = check_consistency(SYLLABUS, [
            {
                'module_id': 'mod-1',
                'week_number': 1,
                'module_title': 'Computing Timeline',
                'module_content': {
                    'ilo_refs': [1],
                    'learning_objectives': ['Explain how electronic computing developed.'],
                    'subtopics': [
                        {'title': 'Brief History of Electronic Computing'},
                        {'title': 'Fourth Industrial Revolution'},
                    ],
                    'short_activity': {'title': 'Written Assessment #1'},
                },
            },
        ])
        week_one = next(row for row in report['rows'] if row['week'] == 1)
        self.assertTrue(week_one['needs_topic_review'])
        updated = apply_topic_judgments(report, [{
            'week': 1,
            'aligned': True,
            'reason': 'Both titles name the computing timeline.',
        }])
        week_one = next(row for row in updated['rows'] if row['week'] == 1)
        self.assertEqual(week_one['status'], 'aligned')
        self.assertFalse(week_one['needs_topic_review'])

    def test_topic_rows_ignore_delivery_and_skip_orientation_and_exams(self):
        weeks = lecture_weeks({
            'tla_chapters': [
                {
                    'chapter': '1',
                    'delivery': 'Lecture/Discussion',
                    'topics': 'Class Orientation',
                    'ilo': '1',
                },
                {
                    'chapter': '2',
                    'delivery': 'Laboratory',
                    'topics': 'Networks\n     Addressing\nLab 2',
                    'ilo': '1',
                },
                {
                    'chapter': '3',
                    'delivery': 'Lecture/Discussion',
                    'topics': 'Final Examination and Submission of Requirements',
                    'ilo': '1',
                },
            ],
        })
        self.assertEqual([row['week'] for row in weeks], [2])
        self.assertEqual(weeks[0]['title'], 'Networks')
        self.assertEqual(weeks[0]['subtopics'], ['Addressing'])
        self.assertEqual(weeks[0]['activity'], 'Lab 2')
        self.assertNotIn('Lab 2', weeks[0]['topic'])

    def test_outline_lock_keeps_the_syllabus_activity(self):
        locked = lock_module_outline(
            {
                'subtopics': [{'title': 'Other name', 'content': 'Expanded notes.'}],
                'short_activity': {
                    'title': 'Mapping Global Information Flows',
                    'description': 'Students map the flows.',
                },
            },
            title='Globalization and Communication',
            subtopics=['Digital media networks'],
            activity='Case Study Presentation',
        )
        self.assertEqual(locked['module_title'], 'Globalization and Communication')
        self.assertEqual(locked['subtopics'][0]['title'], 'Digital media networks')
        self.assertEqual(locked['subtopics'][0]['content'], 'Expanded notes.')
        self.assertEqual(locked['short_activity']['title'], 'Case Study Presentation')
        self.assertEqual(locked['short_activity']['description'], 'Students map the flows.')

    def test_stamp_copies_week_ilo_codes(self):
        stamped = stamp_module_ilos({'learning_objectives': ['Explain.']}, SYLLABUS, 1)
        self.assertEqual(stamped['ilo_refs'], [1])


class AssessmentQaTests(SimpleTestCase):
    def _sections(self):
        return [{
            'section_title': 'Customer Analytics',
            'items': [
                {
                    'item_number': 1,
                    'section_title': 'Customer Analytics',
                    'bloom_level': 'Apply',
                    'ilo_refs': ['2'],
                },
            ],
        }]

    def test_matching_item_passes_tos_and_bloom(self):
        report = check_against_blueprint(self._sections(), [
            {
                'item_id': 'item-1',
                'item_number': 1,
                'section_title': 'Customer Analytics',
                'bloom_level': 'Apply',
                'ilo_refs': ['2'],
                'question_text': 'Apply a decision tree to this customer record.',
            },
        ])
        record = report['items']['item-1']
        self.assertTrue(record['tos_ok'])
        self.assertTrue(record['bloom_ok'])
        self.assertTrue(report['allocation_ok'])

    def test_wrong_bloom_verb_fails_the_cell(self):
        report = check_against_blueprint(self._sections(), [
            {
                'item_id': 'item-1',
                'item_number': 1,
                'section_title': 'Customer Analytics',
                'bloom_level': 'Apply',
                'ilo_refs': ['2'],
                'question_text': 'Define the term customer analytics.',
            },
        ])
        record = report['items']['item-1']
        self.assertTrue(record['tos_ok'])
        self.assertFalse(record['bloom_ok'])

    def test_source_verdict_and_approval_override(self):
        structural = check_against_blueprint(self._sections(), [
            {
                'item_id': 'item-1',
                'item_number': 1,
                'section_title': 'Customer Analytics',
                'bloom_level': 'Apply',
                'ilo_refs': ['2'],
                'question_text': 'Apply a decision tree to this customer record.',
                'choices': ['A tree', 'A list', 'A queue', 'A stack'],
                'correct_answer': 'A',
                'answer_key': 'The passage names decision trees.',
            },
        ])
        parsed = parse_source_results(
            '{"results": [{"item_id": "item-1", "verdict": "supported", "evidence": "The text names decision trees."}]}'
        )
        report = apply_source_results(structural, parsed)
        self.assertTrue(report['items']['item-1']['passed'])
        self.assertTrue(report['ready_to_approve'])
        self.assertEqual(approval_blockers(report, {}), [])

        structural['items']['item-1']['question_text'] = 'Apply a decision tree to this customer record.'
        failed = apply_source_results(structural, [{
            'item_id': 'item-1',
            'verdict': 'unsupported',
            'evidence': 'The passages do not mention trees.',
        }])
        self.assertFalse(failed['ready_to_approve'])
        self.assertTrue(approval_blockers(failed, {}))
        self.assertEqual(approval_blockers(failed, {'item-1': 'Faculty kept the item.'}), [])

    def test_short_topics_share_one_model_call(self):
        batches = [
            {'topic': 'History', 'items': [{'item_id': '1', 'item_number': 1, 'question_text': 'Q1'}], 'passages': 'PASSAGE ONE'},
            {'topic': 'Trees', 'items': [{'item_id': '2', 'item_number': 2, 'question_text': 'Q2'}], 'passages': 'PASSAGE TWO'},
        ]
        groups = pack_source_batches(batches, size=8)
        self.assertEqual(len(groups), 1)
        _system, user = grouped_source_check_prompt(groups[0])
        self.assertLess(user.index('PASSAGE ONE'), user.index('Trees'))
        self.assertIn('PASSAGE TWO', user)
        calls = []

        def complete(group):
            calls.append([row['topic'] for row in group])
            return '{"results": [{"item_id": "1", "verdict": "supported", "evidence": "a"}, {"item_id": "2", "verdict": "supported", "evidence": "b"}]}'

        results, errors = run_grouped_source_checks(groups, complete, workers=1)
        self.assertEqual(calls, [['History', 'Trees']])
        wide = pack_source_batches([
            {'topic': 'A', 'items': [{'item_id': '1'}], 'passages': 'x' * 80},
            {'topic': 'B', 'items': [{'item_id': '2'}], 'passages': 'y' * 80},
        ], size=40, char_budget=200)
        self.assertEqual(len(wide), 2)
        self.assertEqual(errors, [])
        self.assertEqual({row['item_id'] for row in results}, {'1', '2'})

    def test_separate_groups_can_run_together(self):
        groups = [
            [{'topic': 'History', 'items': [{'item_id': '1'}], 'passages': 'one'}],
            [{'topic': 'Trees', 'items': [{'item_id': '2'}], 'passages': 'two'}],
        ]

        def complete(group):
            item_id = group[0]['items'][0]['item_id']
            return '{"results": [{"item_id": "%s", "verdict": "supported", "evidence": "ok"}]}' % item_id

        results, errors = run_grouped_source_checks(groups, complete, workers=2)
        self.assertEqual(errors, [])
        self.assertEqual({row['item_id'] for row in results}, {'1', '2'})

    def test_truncated_reply_keeps_finished_verdicts(self):
        raw = (
            '{"results": ['
            '{"item_id": "1", "verdict": "unsupported", "evidence": "Not in the text."},'
            '{"item_id": "2", "verdict": "supported", "evidence": "The text names it."}'
        )
        parsed = parse_source_results(raw)
        self.assertEqual([row['item_id'] for row in parsed], ['1', '2'])
        self.assertEqual(parsed[0]['verdict'], 'unsupported')

    def test_long_topic_is_split_so_each_item_can_get_a_verdict(self):
        batches = []
        for start in range(4):
            items = [{'item_id': str(start * 8 + offset)} for offset in range(8)]
            batches.append({'topic': 'Usability', 'items': items, 'passages': 'x' * 40})
        groups = pack_source_batches(batches, size=SOURCE_CHECK_PACK, char_budget=9000)
        self.assertEqual(len(groups), 4)
        self.assertGreaterEqual(source_check_max_tokens(8), 8 * 120)
        self.assertLessEqual(source_check_max_tokens(40), 2048)

    def test_missing_passages_skip_the_model(self):
        verdicts = verdicts_without_passages([{'item_id': 'item-9'}])
        self.assertEqual(verdicts[0]['verdict'], 'unsupported')
        system, user = source_check_prompt('History', [{'item_id': '1', 'question_text': 'Q'}], 'A passage.')
        self.assertIn('JSON only', system)
        self.assertIn('History', user)
        self.assertIn('A passage.', user)
