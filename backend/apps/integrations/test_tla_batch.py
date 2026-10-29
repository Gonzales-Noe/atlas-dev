from types import SimpleNamespace
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from apps.integrations.course_brief import get_course_brief
from apps.integrations.cot_prompt_builder import CoTPromptBuilder
from apps.integrations.tla_generation import build_tla_rows_prompt, map_max_tokens, parse_tla_rows

LOCMEM = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "tla-brief-tests",
    }
}


class _BriefLLM:
    calls = 0

    def generate_response_with_fallback(self, **kwargs):
        type(self).calls += 1
        return (
            "IT 111 Introduction to Computing. Outcomes: explain computing ideas. "
            "Topics: hardware, software, networks. Assessment: quizzes and a project.",
            "groq",
        )


class TlaBatchTests(SimpleTestCase):
    def test_row_batch_sends_the_brief_and_only_the_neighbor_titles(self):
        _system, user = build_tla_rows_prompt(
            "Introduction to Computing",
            "IT 111",
            "Topics: hardware and software.",
            [{"weeks": "4", "title": "Networks", "span": 1}],
            [{"weeks": "3", "title": "Software"}, {"weeks": "5", "title": "The Internet"}],
        )
        self.assertIn("Course brief:", user)
        self.assertIn("hardware and software", user)
        self.assertIn("Software", user)
        self.assertIn("The Internet", user)
        self.assertIn("Networks", user)
        self.assertNotIn("syllabusData", user)

    def test_row_parser_keeps_order_and_drops_extra_rows(self):
        parsed = parse_tla_rows(
            '{"rows":[{"topics":"Networks\\n     Addressing","outcome":"Describe a network."},'
            '{"topics":"Extra","outcome":"Ignore me."}]}',
            1,
        )
        self.assertEqual(len(parsed), 1)
        self.assertIn("Addressing", parsed[0]["topics"])
        self.assertEqual(parsed[0]["outcome"], "Describe a network.")

    def test_module_prompt_uses_the_brief_and_neighbors_only(self):
        _system, user = CoTPromptBuilder.build_module_json_prompt(
            course_name="Introduction to HCI",
            module_title="HCI Foundations",
            week_number=1,
            module_number=1,
            context_chunks=[{"text": "raw passage that should stay out"}],
            syllabus_subtopics=["HCI History", "Core Concepts"],
            activity_title="Interface critique",
            course_brief="HCI covers history and interaction models.",
            neighbor_titles=["Software", "The Internet"],
        )
        self.assertIn("Course brief:", user)
        self.assertIn("HCI covers history", user)
        self.assertIn("Interface critique", user)
        self.assertIn("Software", user)
        self.assertNotIn("raw passage that should stay out", user)
        self.assertNotIn("REFERENCE MATERIAL FROM KNOWLEDGE BASE", user)

    def test_index_map_stays_a_small_token_cap(self):
        self.assertEqual(map_max_tokens(1), 16)
        self.assertEqual(map_max_tokens(18), 96)
        _system, user = CoTPromptBuilder.build_syllabus_field_prompt(
            course_name="Introduction to Computing",
            course_code="IT 111",
            field_label="ILO and SO mapping",
            section="topic_map",
            existing_content="",
            mode="generate",
            context_chunks=[],
            extra_instructions="Topics, in order:\n1. Networks",
        )
        self.assertNotIn("Course brief:", user)
        self.assertNotIn("REFERENCE MATERIAL", user)
        self.assertIn("1. Networks", user)

    @override_settings(CACHES=LOCMEM)
    @patch("apps.integrations.course_brief.document_stamp", return_value="doc-a")
    @patch("apps.integrations.course_brief.generation_reference")
    def test_second_brief_reuses_the_cache(self, reference, _stamp):
        cache.clear()
        _BriefLLM.calls = 0
        reference.return_value = {
            "source_chunks": [{"text": "hardware and software", "parent_text": ""}],
            "structure_summary": "",
        }
        course = SimpleNamespace(course_id="course-1", course_title="Introduction to Computing", course_code="IT 111")
        first, first_hit = get_course_brief(
            course, institution_id=None, selected_doc_ids=["doc-a"], llm=_BriefLLM(), provider=None,
        )
        second, second_hit = get_course_brief(
            course, institution_id=None, selected_doc_ids=["doc-a"], llm=_BriefLLM(), provider=None,
        )
        self.assertFalse(first_hit)
        self.assertTrue(second_hit)
        self.assertEqual(first, second)
        self.assertEqual(reference.call_count, 1)
        self.assertEqual(_BriefLLM.calls, 1)
