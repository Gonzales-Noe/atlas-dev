from django.core.management.base import BaseCommand, CommandError
import logging

from apps.integrations.llm_service import LLMService
from apps.integrations.models import GlobalDocument, GlobalDocumentChunk

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Test the open-source LLM providers (Groq / OpenRouter) and the RAG system'

    def add_arguments(self, parser):
        parser.add_argument(
            '--test-llm',
            action='store_true',
            help='Only test the LLM providers'
        )
        parser.add_argument(
            '--provider',
            type=str,
            default=None,
            help='Provider to test: groq or openrouter (default: DEFAULT_LLM_PROVIDER)'
        )
        parser.add_argument(
            '--message',
            type=str,
            default='Explain OBE (Outcome-Based Education) in 2 sentences.',
            help='Message to send to the model'
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('=== ATLAS Integration Testing ===\n'))

        if options['test_llm']:
            self.test_llm(options.get('message'), options.get('provider'))
        else:
            self.test_all(options.get('provider'))

    def test_llm(self, message, provider=None):
        """Send one message through the configured provider (with fallback)."""
        self.stdout.write(self.style.WARNING('\n▶ Testing LLM provider...'))

        llm = LLMService()
        try:
            text, provider_used = llm.generate_response_with_fallback(
                messages=[{"role": "user", "content": message}],
                preferred_provider=provider,
                max_tokens=512,
                return_provider=True,
            )
        except Exception as e:
            raise CommandError(f'LLM test failed: {e}')

        _, model = llm.get_provider_and_model(provider_used)
        self.stdout.write(self.style.SUCCESS(f'✓ {provider_used} responded ({model})'))
        self.stdout.write(f'\n  {text[:200]}...\n')

    def test_all(self, provider=None):
        """Test all systems."""
        self.test_llm('What is ATLAS?', provider)

        self.stdout.write(self.style.WARNING('\n▶ Checking RAG System Setup...'))

        try:
            total_docs = GlobalDocument.objects.count()
            total_segments = GlobalDocumentChunk.objects.count()

            self.stdout.write(self.style.SUCCESS('✓ RAG Database Tables Ready'))
            self.stdout.write(f'  Global documents: {total_docs}')
            self.stdout.write(f'  Global chunks: {total_segments}')

        except Exception:
            self.stdout.write(
                self.style.WARNING('⚠ RAG tables not created. Run: python manage.py migrate')
            )

        self.stdout.write(self.style.SUCCESS('\n=== All tests completed ==='))
