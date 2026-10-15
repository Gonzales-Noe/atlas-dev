import json
import os
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.integrations import indexing, llm_service, rag_service, syllabus_structure
from apps.integrations.cot_prompt_builder import CoTPromptBuilder
from apps.integrations.llm_service import LLMService
from apps.integrations.models import GlobalDocument
from apps.integrations.views import (
    list_audit_logs,
    list_rag_documents,
    upload_course_rag_document,
    upload_global_rag_document,
)


def _service(*configured):
    """LLMService with only the given providers configured, independent of .env."""
    service = LLMService()
    service.configured = {name: name in configured for name in service.configured}
    service.chain = ['groq', 'nvidia', 'mistral', 'gemma', 'cloudflare', 'openrouter', 'huggingface']
    return service


class LLMProviderFallbackTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_returns_generated_text_by_default(self):
        service = _service('groq')
        service.default_provider = 'groq'

        with patch.object(service, 'generate_response', return_value='Draft text'):
            generated_text = service.generate_response_with_fallback(
                messages=[{'role': 'user', 'content': 'Write a draft'}],
            )

        self.assertEqual(generated_text, 'Draft text')

    def test_walks_the_chain_until_a_provider_succeeds(self):
        service = _service('openrouter', 'groq', 'nvidia')
        service.default_provider = 'openrouter'

        with patch.object(
            service,
            'generate_response',
            side_effect=[ValueError('OpenRouter insufficient credits'), ValueError('rate limited'), 'Draft text'],
        ) as generate_response:
            generated_text, provider_used = service.generate_response_with_fallback(
                messages=[{'role': 'user', 'content': 'Write a draft'}],
                max_tokens=1500,
                return_provider=True,
            )

        self.assertEqual(generated_text, 'Draft text')
        self.assertEqual(provider_used, 'nvidia')
        self.assertEqual(
            [call.kwargs['provider_choice'] for call in generate_response.call_args_list],
            ['openrouter', 'groq', 'nvidia'],
        )

    def test_legacy_and_auto_provider_names(self):
        service = _service('openrouter', 'groq')

        for legacy in ('gemini', 'gpt', 'anthropic'):
            self.assertEqual(
                service.get_provider_and_model(legacy),
                ('openrouter', service.openrouter_model),
            )
        self.assertEqual(service.get_provider_and_model('groq'), ('groq', service.groq_model))
        service.default_provider = 'groq'
        self.assertEqual(service.get_provider_and_model('auto'), ('groq', service.groq_model))

    def test_legacy_alias_does_not_retry_openrouter_twice(self):
        service = _service('openrouter')

        with patch.object(
            service,
            'generate_response',
            side_effect=ValueError('OpenRouter insufficient credits'),
        ) as generate_response:
            with self.assertRaisesRegex(ValueError, 'all available providers'):
                service.generate_response_with_fallback(
                    messages=[{'role': 'user', 'content': 'Write a draft'}],
                    preferred_provider='gemini',
                    max_tokens=1500,
                )

        self.assertEqual(generate_response.call_count, 1)

    def test_rate_limited_provider_is_paused_for_later_requests(self):
        service = _service('groq', 'nvidia')
        service.api_keys = {name: 'key' for name in service.api_keys}
        rate_limited = MagicMock(ok=False, status_code=429, text='Rate limit reached', headers={'retry-after': '30'})
        success = MagicMock(ok=True, status_code=200, headers={})
        success.json.return_value = {'choices': [{'message': {'content': 'Draft text'}}]}

        with patch('apps.integrations.llm_service.requests.post', side_effect=[rate_limited, success, success]) as post:
            first = service.generate_response_with_fallback([{'role': 'user', 'content': 'Hi'}], return_provider=True)
            second = service.generate_response_with_fallback([{'role': 'user', 'content': 'Hi'}], return_provider=True)

        self.assertEqual(first, ('Draft text', 'nvidia'))
        self.assertEqual(second, ('Draft text', 'nvidia'))
        self.assertEqual(post.call_count, 3)
        self.assertGreater(llm_service.provider_cooldown_remaining('groq'), 0)

    def test_large_prompt_skips_groq_and_caps_its_completion_budget(self):
        service = _service('groq', 'nvidia')
        big_prompt = 'x' * 4 * 9000

        with patch.object(service, 'generate_response', return_value='Draft text') as generate_response:
            _, provider_used = service.generate_response_with_fallback(
                [{'role': 'user', 'content': big_prompt}], max_tokens=4096, return_provider=True,
            )

        self.assertEqual(provider_used, 'nvidia')
        self.assertEqual(generate_response.call_count, 1)
        self.assertEqual(service._completion_budget('groq', 5000, 8192), 2800)


class SyllabusFieldPromptTests(SimpleTestCase):
    def test_includes_extra_instructions_in_generated_field_prompt(self):
        _, user_prompt = CoTPromptBuilder.build_syllabus_field_prompt(
            course_name='Computer Programming',
            course_code='CS101',
            field_label='Course Outcomes table',
            section='custom',
            existing_content='',
            mode='generate',
            context_chunks=[],
            extra_instructions='Return five rows as a JSON array.',
        )

        self.assertIn('Return five rows as a JSON array.', user_prompt)


class InstitutionScopedAdminDataTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = SimpleNamespace(
            is_authenticated=True,
            institution_id='institution-a',
        )

    @patch('apps.integrations.views._is_admin_user', return_value=True)
    @patch('apps.integrations.views.GlobalDocument.objects.filter')
    def test_knowledge_base_list_only_queries_admin_institution(
        self,
        filter_documents,
        _is_admin,
    ):
        filter_documents.return_value.order_by.return_value = []
        request = self.factory.get('/api/integrations/rag-documents/')
        force_authenticate(request, user=self.admin)

        response = list_rag_documents(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['documents'], [])
        filter_documents.assert_called_once_with(institution_id='institution-a')
        self.assertTrue(_is_admin.called)

    @patch('apps.integrations.views._is_admin_user', return_value=True)
    @patch('apps.integrations.views.AuditLog.objects.select_related')
    def test_audit_log_list_only_queries_admin_institution(
        self,
        select_related,
        _is_admin,
    ):
        select_related.return_value.filter.return_value.order_by.return_value = []
        request = self.factory.get('/api/integrations/audit-logs/')
        force_authenticate(request, user=self.admin)

        response = list_audit_logs(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['logs'], [])
        select_related.assert_called_once_with('user')
        select_related.return_value.filter.assert_called_once_with(
            user__institution_id='institution-a',
        )
        self.assertTrue(_is_admin.called)


class BackgroundIndexingTests(SimpleTestCase):
    @patch('apps.integrations.views.transaction.on_commit', side_effect=lambda callback: callback())
    @patch('apps.integrations.views.indexing.enqueue_global_document')
    @patch('apps.integrations.views.GlobalDocument.objects.create')
    @patch('apps.integrations.views._is_admin_user', return_value=True)
    def test_upload_returns_202_and_queues_indexing(self, _is_admin, create_document, enqueue, _on_commit):
        create_document.return_value = SimpleNamespace(
            document_id='doc-1', status=GlobalDocument.IndexStatus.PROCESSING,
        )
        user = SimpleNamespace(
            is_authenticated=True, institution_id='institution-a', institution='inst',
        )
        upload = SimpleUploadedFile('syllabus.pdf', b'%PDF-1.4 test', content_type='application/pdf')
        request = APIRequestFactory().post(
            '/api/integrations/upload-global-rag-document/',
            {'file': upload, 'file_type': 'pdf', 'doc_type': 'Syllabus'},
            format='multipart',
        )
        force_authenticate(request, user=user)

        response = upload_global_rag_document(request)

        self.assertEqual(response.status_code, 202, response.data)
        self.assertEqual(response.data['status'], 'PROCESSING')
        self.assertEqual(
            create_document.call_args.kwargs['status'], GlobalDocument.IndexStatus.PROCESSING,
        )
        enqueue.assert_called_once_with('doc-1', b'%PDF-1.4 test', 'pdf', 'syllabus.pdf')

    @patch('apps.integrations.views.transaction.on_commit', side_effect=lambda callback: callback())
    @patch('apps.integrations.views.indexing.enqueue_course_file')
    @patch('apps.integrations.views.CourseFile.objects.create')
    @patch('apps.integrations.views._get_faculty_course_or_403')
    @patch('apps.integrations.views._is_faculty_user', return_value=True)
    def test_course_upload_returns_202_and_queues_indexing(
        self, _is_faculty, get_course, create_file, enqueue, _on_commit,
    ):
        get_course.return_value = (SimpleNamespace(course_id='course-1', course_code='GE4'), None)
        create_file.return_value = SimpleNamespace(records_id='rec-1', rag_status='PROCESSING')
        upload = SimpleUploadedFile('module.pdf', b'%PDF-1.4 test', content_type='application/pdf')
        request = APIRequestFactory().post(
            '/api/integrations/upload-course-rag-document/',
            {
                'file': upload, 'file_type': 'pdf',
                'course_id': '6f1c1f5e-8a8e-4c55-9d43-0d6b6d2f5a11', 'module_tag': 'M1',
            },
            format='multipart',
        )
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True))

        response = upload_course_rag_document(request)

        self.assertEqual(response.status_code, 202, response.data)
        self.assertEqual(response.data['rag_status'], 'PROCESSING')
        enqueue.assert_called_once_with('rec-1', b'%PDF-1.4 test', 'pdf', 'module.pdf', 'M1', None)

    @patch('apps.integrations.indexing.close_old_connections')
    @patch('apps.integrations.indexing.GlobalDocument.objects.filter')
    @patch(
        'apps.integrations.indexing.index_global_document',
        side_effect=ValueError('No text could be extracted from the file.'),
    )
    def test_failed_indexing_marks_document_failed(self, _index, filter_documents, _close):
        indexing._run_index_job('doc-1', b'', 'pdf', 'empty.pdf')

        filter_documents.assert_called_once_with(document_id='doc-1')
        filter_documents.return_value.update.assert_called_once_with(
            status=GlobalDocument.IndexStatus.FAILED,
            error_message='No text could be extracted from the file.',
        )


def _hf_response(status_code, payload=None, text=''):
    response = MagicMock(status_code=status_code, text=text)
    response.json.return_value = payload
    return response


@patch.dict(os.environ, {'EMBEDDING_PROVIDER': 'huggingface', 'HF_TOKEN': 'hf_test'})
class HuggingFaceEmbeddingTests(SimpleTestCase):
    @patch('requests.post')
    def test_batches_and_normalizes(self, post):
        post.side_effect = lambda url, **kw: _hf_response(200, [[3.0, 4.0]] * len(kw['json']['inputs']))

        vectors = rag_service.embed_documents_batch([f'chunk {i}' for i in range(40)])

        self.assertEqual(len(vectors), 40)
        self.assertEqual(post.call_count, 2)
        self.assertAlmostEqual(vectors[0][0], 0.6)
        self.assertAlmostEqual(vectors[0][1], 0.8)
        self.assertIn('BAAI/bge-base-en-v1.5', post.call_args.args[0])
        self.assertEqual(post.call_args.kwargs['headers']['Authorization'], 'Bearer hf_test')

    @patch('apps.integrations.rag_service.time.sleep')
    @patch('requests.post')
    def test_retries_cold_start(self, post, _sleep):
        post.side_effect = [_hf_response(503, text='loading'), _hf_response(200, [[1.0, 0.0]])]

        self.assertEqual(rag_service.embed_query('outcomes'), [1.0, 0.0])
        self.assertEqual(post.call_count, 2)
        self.assertTrue(post.call_args.kwargs['json']['inputs'][0].startswith('Represent this sentence'))

    @patch('requests.post')
    def test_error_is_reported(self, post):
        post.return_value = _hf_response(401, text='Invalid credentials')

        with self.assertRaisesRegex(ValueError, '401'):
            rag_service.embed_documents_batch(['x'])

    def test_missing_token_is_reported(self):
        with patch.dict(os.environ, {'HF_TOKEN': ''}):
            with self.assertRaisesRegex(ValueError, 'HF_TOKEN'):
                rag_service.embed_documents_batch(['x'])


@patch.dict(os.environ, {
    'EMBEDDING_PROVIDER': 'cloudflare,huggingface',
    'CLOUDFLARE_ACCOUNT_ID': 'acct',
    'CLOUDFLARE_API_TOKEN': 'cf_test',
    'HF_TOKEN': 'hf_test',
})
class CloudflareEmbeddingTests(SimpleTestCase):
    @patch('requests.post')
    def test_uses_same_bge_model_on_cloudflare(self, post):
        post.side_effect = lambda url, **kw: _hf_response(
            200, {'result': {'data': [[3.0, 4.0]] * len(kw['json']['text'])}},
        )

        vectors = rag_service.embed_documents_batch([f'chunk {i}' for i in range(150)])

        self.assertEqual(len(vectors), 150)
        self.assertEqual(post.call_count, 2)
        self.assertAlmostEqual(vectors[0][1], 0.8)
        self.assertTrue(post.call_args.args[0].endswith('/accounts/acct/ai/run/@cf/baai/bge-base-en-v1.5'))

    @patch('requests.post')
    def test_falls_back_to_next_provider(self, post):
        post.side_effect = [
            _hf_response(401, text='Authentication error'),
            _hf_response(200, [[1.0, 0.0]]),
        ]

        self.assertEqual(rag_service.embed_documents_batch(['x']), [[1.0, 0.0]])
        self.assertIn('huggingface', post.call_args.args[0])

    @patch('requests.post')
    def test_reports_every_failure(self, post):
        post.side_effect = [
            _hf_response(401, text='Authentication error'),
            _hf_response(402, text='You have no remaining credits'),
        ]

        with self.assertRaisesRegex(ValueError, 'Cloudflare.*401.*Hugging Face.*402'):
            rag_service.embed_documents_batch(['x'])


SAMPLE_SYLLABUS_MD = """
# STATE UNIVERSITY

# Course Specifications

| Course Title | Analytics |
|---|---|
| Course Code | BAT 404 |
| Lab Hours | 3 |
| Consultation Hours | Mon 1-3 PM |

# University Direction

## Vision

A premier national university.

## Mission

A university committed to producing leaders.

# Weekly Schedule

| Chapter | Topics | Weeks | Delivery |
|---|---|---|---|
| 1 | Orientation | 1 | F2F |

# Course Policies

## Attendance

Be on time.

# Laboratory Requirements

| Activity | Tool | Deadline |
|---|---|---|
| LA 1 | Python | Week 3 |
"""


class SyllabusStructureTests(SimpleTestCase):
    def _by_label(self, sections):
        return {section['label']: section for section in sections}

    def test_outline_maps_headings_tables_and_builtin_editors(self):
        sections, source = syllabus_structure.extract_syllabus_structure(SAMPLE_SYLLABUS_MD, refine=False)
        by_label = self._by_label(sections)

        self.assertEqual(source, 'outline')
        self.assertEqual(
            list(by_label),
            ['Course Specifications', 'University Direction', 'Weekly Schedule',
             'Course Policies', 'Laboratory Requirements'],
        )
        specs = by_label['Course Specifications']
        self.assertEqual(specs['key'], 'basic')
        # Fields the built-in Basic Info editor renders are not duplicated.
        self.assertEqual([sub['label'] for sub in specs['subsections']], ['Lab Hours', 'Consultation Hours'])
        self.assertEqual(
            [sub['label'] for sub in by_label['University Direction']['subsections']],
            ['Vision', 'Mission'],
        )
        self.assertEqual(by_label['Weekly Schedule']['key'], 'schedule')
        self.assertFalse(by_label['Weekly Schedule']['table_enabled'])
        self.assertEqual(by_label['Course Policies']['key'], 'policies')
        self.assertEqual(by_label['Course Policies']['subsections'], [])
        lab = by_label['Laboratory Requirements']
        self.assertEqual(lab['key'], 'laboratory-requirements')
        self.assertTrue(lab['table_enabled'])
        self.assertEqual(lab['table_columns'], ['Activity', 'Tool', 'Deadline'])

    def test_refinement_drops_ungrounded_labels_and_copies_static_text(self):
        llm = MagicMock()
        llm.generate_response_with_fallback.return_value = json.dumps({'sections': [
            {'label': 'Course Specifications', 'editor': 'basic', 'is_static': False,
             'table_columns': ['Course Title', 'Course Code', 'Lab Hours', 'Consultation Hours'],
             'subsections': []},
            {'label': 'University Direction', 'editor': None, 'is_static': True,
             'table_columns': [], 'subsections': []},
            {'label': 'Learning Resources Overview', 'editor': None, 'is_static': False,
             'table_columns': [], 'subsections': []},
            {'label': 'Laboratory Requirements', 'editor': None, 'is_static': False,
             'table_columns': ['Activity', 'Tool', 'Invented Column'],
             'subsections': [{'label': 'Imaginary Field', 'table_columns': []}]},
        ]})

        sections, source = syllabus_structure.extract_syllabus_structure(SAMPLE_SYLLABUS_MD, llm=llm)
        by_label = self._by_label(sections)

        self.assertEqual(source, 'ai')
        self.assertNotIn('Learning Resources Overview', by_label)
        # Label/value labels returned as table columns become subsections.
        specs = by_label['Course Specifications']
        self.assertFalse(specs['table_enabled'])
        self.assertEqual([sub['label'] for sub in specs['subsections']], ['Lab Hours', 'Consultation Hours'])
        direction = by_label['University Direction']
        self.assertTrue(direction['is_static'])
        self.assertIn('A premier national university.', direction['static_content'])
        self.assertIn('Mission:', direction['static_content'])
        lab = by_label['Laboratory Requirements']
        self.assertEqual(lab['table_columns'], ['Activity', 'Tool'])
        self.assertEqual(lab['subsections'], [])

    def test_refinement_failure_falls_back_to_outline(self):
        llm = MagicMock()
        llm.generate_response_with_fallback.side_effect = ValueError('all providers failed')

        sections, source = syllabus_structure.extract_syllabus_structure(SAMPLE_SYLLABUS_MD, llm=llm)

        self.assertEqual(source, 'outline')
        self.assertEqual(sections[0]['label'], 'Course Specifications')
