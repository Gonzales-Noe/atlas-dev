from unittest import mock

from django.test import SimpleTestCase

from apps.integrations import pii_masking, rag_service


class RetrievalPiiRecheckTests(SimpleTestCase):
    def test_clean_text_is_returned_unchanged(self):
        text = 'Newton formulated three laws of motion. Week 3 Topic: Kinematics.'
        self.assertEqual(pii_masking.recheck_retrieved_text(text), text)

    def test_pii_that_slipped_into_the_index_is_masked_at_retrieval(self):
        text = 'Consult juan.delacruz@example.com or call 0917 123 4567 for the rubric.'
        out = pii_masking.recheck_retrieved_text(text)
        self.assertNotIn('juan.delacruz@example.com', out)
        self.assertNotIn('123 4567', out)
        self.assertIn(pii_masking.EMAIL_PLACEHOLDER, out)
        self.assertIn(pii_masking.PHONE_PLACEHOLDER, out)

    def test_chunk_is_dropped_if_high_confidence_pii_survives_masking(self):
        text = 'Email me at someone@example.com'
        unmasked = mock.Mock(text=text)
        with mock.patch.object(pii_masking, 'mask_pii', return_value=unmasked):
            self.assertEqual(pii_masking.recheck_retrieved_text(text), '')

    def test_results_are_cleaned_before_reaching_the_llm_context(self):
        results = [
            {'text': 'Reach me: a.b@school.edu', 'parent_text': 'Section on OBE', 'document_title': 'syl.pdf', 'score': 0.9},
            {'text': 'Plain passage on OBE', 'parent_text': '', 'document_title': 'ok.pdf', 'score': 0.8},
        ]
        cleaned = rag_service._recheck_results_for_pii(results, ('text', 'parent_text'))
        self.assertEqual(len(cleaned), 2)
        self.assertNotIn('a.b@school.edu', cleaned[0]['text'])
        self.assertEqual(cleaned[0]['score'], 0.9)
        self.assertEqual(cleaned[1]['text'], 'Plain passage on OBE')
        # the input list is not mutated
        self.assertIn('a.b@school.edu', results[0]['text'])

    def test_unmaskable_chunk_is_dropped_from_results(self):
        results = [{'text': 'x@y.com', 'document_title': 'bad.pdf', 'score': 0.9}]
        with mock.patch.object(rag_service, 'recheck_retrieved_text', return_value=''):
            self.assertEqual(rag_service._recheck_results_for_pii(results), [])
