"""
Unit tests for RAG helpers — no DB, no Django, no model downloads required.
Tests: BM25 tokenizer, preprocess_text, _format_context, token budget.
"""
import re
import sys
import os
import unittest

# Allow imports from the backend root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Inline BM25 helpers (mirror of rag_service.py) ───────────────────────────
_STOP_WORDS = frozenset([
    'a','an','the','and','or','but','in','on','at','to','for','of','with',
    'is','was','are','were','be','been','being','have','has','had','do','does',
    'did','will','would','could','should','may','might','can','shall','must',
    'that','this','these','those','it','its','he','she','they','we','you','i',
    'by','from','as','into','through','during','above','below','between','each',
    'if','then','than','so','yet','both','either','not','no','nor','only','own',
    'same','too','very','just','because','while','although',
])


def _tokenize_for_bm25(text: str) -> list:
    tokens = re.findall(r'[a-z]+', text.lower())
    return [t for t in tokens if t not in _STOP_WORDS and len(t) > 1]


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestBM25Tokenizer(unittest.TestCase):

    def test_stop_words_removed(self):
        tokens = _tokenize_for_bm25("The student will be able to analyze OBE frameworks")
        for stop in ("the", "will", "be", "to"):
            self.assertNotIn(stop, tokens)
        self.assertIn("analyze", tokens)
        self.assertIn("obe", tokens)
        self.assertIn("frameworks", tokens)

    def test_obe_terms_preserved(self):
        tokens = _tokenize_for_bm25("ILO PLO CLO outcomes syllabus assessment curriculum")
        for term in ("ilo", "plo", "clo", "outcomes", "syllabus", "assessment", "curriculum"):
            self.assertIn(term, tokens)

    def test_punctuation_stripped(self):
        tokens = _tokenize_for_bm25("Bloom's taxonomy: knowledge, comprehension!")
        self.assertIn("taxonomy", tokens)
        self.assertIn("knowledge", tokens)
        self.assertIn("comprehension", tokens)

    def test_single_char_filtered(self):
        tokens = _tokenize_for_bm25("a b c x y z word")
        for ch in ("a", "b", "c", "x", "y", "z"):
            self.assertNotIn(ch, tokens)
        self.assertIn("word", tokens)

    def test_empty_input(self):
        self.assertEqual(_tokenize_for_bm25(""), [])

    def test_duplicate_tokens_kept(self):
        tokens = _tokenize_for_bm25("outcome outcome outcome")
        self.assertEqual(tokens.count("outcome"), 3)


class TestPreprocessText(unittest.TestCase):

    def setUp(self):
        from apps.integrations.document_processor import DocumentProcessor
        self.pp = DocumentProcessor.preprocess_text

    def test_crlf_normalized(self):
        result = self.pp("Hello\r\nWorld\r\nTest")
        self.assertNotIn("\r", result)

    def test_whitespace_collapsed(self):
        result = self.pp("Hello    World\n\n\n\nNew paragraph")
        self.assertNotIn("    ", result)
        self.assertNotIn("\n\n\n", result)

    def test_decorative_lines_stripped(self):
        result = self.pp("Section Title\n-----------\nContent here\n===========\nMore")
        self.assertNotIn("-----------", result)
        self.assertNotIn("===========", result)
        self.assertIn("Section Title", result)
        self.assertIn("Content here", result)

    def test_page_numbers_stripped(self):
        result = self.pp("Some content\nPage 5\nMore content\n3\nAnother\nPAGE 12")
        self.assertNotIn("Page 5", result)
        self.assertNotIn("PAGE 12", result)
        self.assertIn("Some content", result)
        self.assertIn("More content", result)

    def test_content_preserved(self):
        text = "Students will analyze OBE frameworks and apply ILO design principles."
        result = self.pp(text)
        self.assertIn("OBE", result)
        self.assertIn("ILO", result)


class TestFormatContext(unittest.TestCase):

    def setUp(self):
        from apps.integrations.cot_prompt_builder import CoTPromptBuilder, _CONTEXT_TOKEN_BUDGET, _count_tokens
        self.fmt = CoTPromptBuilder._format_context
        self.budget = _CONTEXT_TOKEN_BUDGET
        self.count_tokens = _count_tokens
        self.chunks = [
            {"text": "OBE aligns learning outcomes with assessments.", "document_title": "CHED Handbook", "page_number": 5, "score": 0.92},
            {"text": "ILOs must use Bloom taxonomy action verbs.", "document_title": "CHED Handbook", "page_number": 12, "score": 0.87},
        ]

    def test_uses_summary_when_provided(self):
        result = self.fmt(self.chunks, context_summary="OBE is outcomes-based.")
        self.assertIn("[CURRICULUM CONTEXT SUMMARY]", result)
        self.assertIn("OBE is outcomes-based.", result)

    def test_formats_chunks_when_no_summary(self):
        result = self.fmt(self.chunks, context_summary="")
        self.assertIn("CHED Handbook", result)
        self.assertIn("Reference 1", result)

    def test_token_budget_enforced(self):
        big_text = "word " * 3000  # ~3750 tokens if uncapped
        big_chunks = [
            {"text": big_text, "document_title": "Doc", "page_number": 1, "score": 0.9},
            {"text": big_text, "document_title": "Doc2", "page_number": 2, "score": 0.8},
        ]
        result = self.fmt(big_chunks)
        self.assertLessEqual(self.count_tokens(result), self.budget + 50)

    def test_placeholder_when_empty(self):
        result = self.fmt([], context_summary="")
        self.assertIn("No reference material", result)

    def test_source_citation_in_output(self):
        result = self.fmt(self.chunks)
        self.assertIn("p. 5", result)
        self.assertIn("0.92", result)


if __name__ == "__main__":
    unittest.main(verbosity=2)
