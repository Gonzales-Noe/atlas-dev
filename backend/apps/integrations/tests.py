from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.integrations.cot_prompt_builder import CoTPromptBuilder
from apps.integrations.llm_service import LLMService
from apps.integrations.views import list_audit_logs, list_rag_documents


class LLMProviderFallbackTests(SimpleTestCase):
    def test_returns_generated_text_by_default(self):
        service = LLMService()
        service.default_provider = 'anthropic'

        with patch.object(service, 'generate_response', return_value='Draft text'):
            generated_text = service.generate_response_with_fallback(
                messages=[{'role': 'user', 'content': 'Write a draft'}],
            )

        self.assertEqual(generated_text, 'Draft text')

    def test_uses_another_provider_when_default_provider_fails(self):
        service = LLMService()
        service.default_provider = 'gemini'
        service.openrouter_configured = True
        service.groq_configured = True

        with patch.object(
            service,
            'generate_response',
            side_effect=[ValueError('OpenRouter insufficient credits'), 'Draft text'],
        ) as generate_response:
            generated_text, provider_used = service.generate_response_with_fallback(
                messages=[{'role': 'user', 'content': 'Write a draft'}],
                max_tokens=1500,
                return_provider=True,
            )

        self.assertEqual(generated_text, 'Draft text')
        self.assertEqual(provider_used, 'groq')
        self.assertEqual(
            [call.kwargs['provider_choice'] for call in generate_response.call_args_list],
            ['gemini', 'groq'],
        )

    def test_does_not_retry_same_openrouter_account_through_an_alias(self):
        service = LLMService()
        service.default_provider = 'gemini'
        service.openrouter_configured = True

        with patch.object(
            service,
            'generate_response',
            side_effect=ValueError('OpenRouter insufficient credits'),
        ) as generate_response:
            with self.assertRaisesRegex(ValueError, 'all available providers'):
                service.generate_response_with_fallback(
                    messages=[{'role': 'user', 'content': 'Write a draft'}],
                    max_tokens=1500,
                )

        attempted_providers = [
            call.kwargs['provider_choice'] for call in generate_response.call_args_list
        ]
        self.assertEqual(attempted_providers.count('gemini'), 1)
        self.assertNotIn('gpt', attempted_providers)


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
