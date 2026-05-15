import logging
import os

import requests

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
            # Keep default on a currently supported Groq model.
            return 'groq', 'llama-3.3-70b-versatile'
        elif choice == 'anthropic':
            return 'anthropic', 'claude-haiku-4-5-20251001'
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
            if not self.openrouter_key:
                raise ValueError("OpenRouter not configured.")

            payload_messages = []
            if system:
                payload_messages.append({"role": "system", "content": system})
            payload_messages.extend(messages)

            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.openrouter_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": payload_messages,
                    "max_tokens": max_tokens,
                },
                timeout=90,
            )
            if response.status_code == 402:
                err = response.json().get("error", {})
                raise ValueError(f"OpenRouter insufficient credits: {err.get('message', response.text)}")
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
            
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
            
            # extract text (content blocks are dicts: {"type": "text", "text": "..."})
            for block in response.get('content', []):
                if block.get('type') == 'text' and block.get('text'):
                    return block['text']
            return ""

    def generate_response_with_fallback(
        self, messages, preferred_provider=None, system=None, max_tokens=2048
    ):
        """
        Try providers in fallback order when the preferred one fails.
        Fallback chain: preferred → gemini → groq → anthropic → gpt
        """
        fallback_order = ['gemini', 'groq', 'anthropic', 'gpt']
        providers_to_try: list = []
        if preferred_provider and preferred_provider.lower() not in fallback_order:
            providers_to_try.append(preferred_provider)
        if preferred_provider:
            choice = preferred_provider.lower()
            if choice in fallback_order:
                providers_to_try.append(choice)
        for p in fallback_order:
            if p not in providers_to_try:
                providers_to_try.append(p)

        last_error = None
        for provider in providers_to_try:
            try:
                result = self.generate_response(
                    messages,
                    provider_choice=provider,
                    system=system,
                    max_tokens=max_tokens,
                )
                if result:
                    return result
            except Exception as exc:
                logger.warning("LLM provider '%s' failed: %s", provider, exc)
                last_error = exc
                continue

        raise ValueError(f"All LLM providers failed. Last error: {last_error}")

