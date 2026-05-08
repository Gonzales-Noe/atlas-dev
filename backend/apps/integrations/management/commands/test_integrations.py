from django.core.management.base import BaseCommand, CommandError
import logging

from apps.integrations.anthropic_service import AnthropicService
from apps.integrations.models import GlobalDocument, GlobalDocumentChunk

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Test Anthropic Claude API connection and RAG system'

    def add_arguments(self, parser):
        parser.add_argument(
            '--test-anthropic',
            action='store_true',
            help='Test Anthropic API connection'
        )
        parser.add_argument(
            '--message',
            type=str,
            default='Explain OBE (Outcome-Based Education) in 2 sentences.',
            help='Message to send to Claude'
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('=== ATLAS Integration Testing ===\n'))

        if options['test_anthropic']:
            self.test_anthropic_api(options.get('message'))
        else:
            self.test_all()

    def test_anthropic_api(self, message):
        """Test Anthropic API connection."""
        self.stdout.write(self.style.WARNING('\n▶ Testing Anthropic Claude API...'))

        claude_service = AnthropicService()

        if not claude_service.is_configured():
            raise CommandError(
                'Anthropic API not configured. Set ANTHROPIC_API_KEY environment variable.'
            )

        try:
            response = claude_service.send_message(
                messages=[{"role": "user", "content": message}],
                max_tokens=1024
            )

            self.stdout.write(self.style.SUCCESS('✓ Claude API Connection Successful'))
            self.stdout.write(f'\nModel: {response["model"]}')
            self.stdout.write(f'Input tokens: {response["usage"]["input_tokens"]}')
            self.stdout.write(f'Output tokens: {response["usage"]["output_tokens"]}')
            self.stdout.write(f'\nResponse Content:')
            for block in response['content']:
                if block['type'] == 'text':
                    self.stdout.write(f'  {block["text"][:200]}...\n')

        except Exception as e:
            raise CommandError(f'Claude API test failed: {str(e)}')

    def test_all(self):
        """Test all systems."""
        self.test_anthropic_api('What is ATLAS?')
        
        self.stdout.write(self.style.WARNING('\n▶ Checking RAG System Setup...'))
        
        # Check if tables exist
        try:
            total_docs = GlobalDocument.objects.count()
            total_segments = GlobalDocumentChunk.objects.count()
            
            self.stdout.write(self.style.SUCCESS('✓ RAG Database Tables Ready'))
            self.stdout.write(f'  Global documents: {total_docs}')
            self.stdout.write(f'  Global chunks: {total_segments}')
            
        except Exception as e:
            self.stdout.write(
                self.style.WARNING(f'⚠ RAG tables not created. Run: python manage.py migrate')
            )

        self.stdout.write(self.style.SUCCESS('\n=== All tests completed ==='))
