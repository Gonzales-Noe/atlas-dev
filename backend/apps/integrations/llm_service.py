import logging
import os

logger = logging.getLogger(__name__)

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    OpenAI = None

try:
    from groq import Groq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False
    Groq = None

from .anthropic_service import AnthropicService

class LLMService:
    """Service for interacting with various LLM providers (OpenRouter, Groq, Anthropic)."""
    
    def __init__(self):
        self.default_provider = os.environ.get('DEFAULT_LLM_PROVIDER', 'gemini').lower()
        
        # OpenRouter setup (using OpenAI SDK format)
        self.openrouter_key = os.environ.get('OPENROUTER_API_KEY')
        if OPENAI_AVAILABLE and self.openrouter_key:
            self.openrouter_client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=self.openrouter_key,
            )
        else:
            self.openrouter_client = None
            
        # Groq setup
        self.groq_key = os.environ.get('GROQ_API_KEY')
        if GROQ_AVAILABLE and self.groq_key:
            self.groq_client = Groq(api_key=self.groq_key)
        else:
            self.groq_client = None
            
        # Anthropic setup
        self.anthropic_service = AnthropicService()

    def get_provider_and_model(self, provider_choice=None):
        choice = (provider_choice or self.default_provider).lower()
        
        if choice == 'gemini':
            return 'openrouter', 'google/gemini-2.5-flash'
        elif choice == 'gpt':
            return 'openrouter', 'openai/gpt-4o'
        elif choice == 'groq':
            return 'groq', 'llama3-70b-8192' # Sample Groq model
        elif choice == 'anthropic':
            return 'anthropic', 'claude-3-5-sonnet-20241022'
        elif choice == 'openrouter':
             return 'openrouter', 'meta-llama/llama-3-70b-instruct' # Generic openrouter fallback if just 'openrouter' is specified
        else:
            # fallback
            return 'openrouter', 'google/gemini-2.5-flash'
            
    def generate_response(self, messages, provider_choice=None, system=None, max_tokens=1024):
        """
        messages: [{"role": "user", "content": "hello"}]
        """
        provider, model = self.get_provider_and_model(provider_choice)
        
        if provider == 'openrouter':
            if not self.openrouter_client:
                raise ValueError("OpenRouter not configured.")
            
            payload_messages = []
            if system:
                payload_messages.append({"role": "system", "content": system})
            payload_messages.extend(messages)
            
            response = self.openrouter_client.chat.completions.create(
                model=model,
                messages=payload_messages,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content
            
        elif provider == 'groq':
            if not self.groq_client:
                raise ValueError("Groq not configured.")
            
            payload_messages = []
            if system:
                payload_messages.append({"role": "system", "content": system})
            payload_messages.extend(messages)
            
            response = self.groq_client.chat.completions.create(
                model=model,
                messages=payload_messages,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content
            
        elif provider == 'anthropic':
            if not self.anthropic_service.is_configured():
                raise ValueError("Anthropic not configured.")
            
            if system:
                # anthropic handles system messages differently
                pass
            
            response = self.anthropic_service.send_message(
                messages=messages, 
                model=model, 
                max_tokens=max_tokens, 
                system=system
            )
            
            # extract text
            if 'content' in response and len(response['content']) > 0:
                return response['content'][0].text
            return ""

