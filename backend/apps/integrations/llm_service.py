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
    """Service for interacting with various LLM providers (Ollama, OpenRouter, Groq, Anthropic)."""
    
    def __init__(self):
        self.default_provider = os.environ.get('DEFAULT_LLM_PROVIDER', 'gemini').lower()
        
        # OpenRouter setup (using OpenAI SDK format)
        self.openrouter_key = os.environ.get('OPENROUTER_API_KEY')
        self.openrouter_client = None
        self.openrouter_configured = bool(self.openrouter_key and OPENAI_AVAILABLE)
        if self.openrouter_configured:
            self.openrouter_client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=self.openrouter_key,
            )

        # Ollama setup
        self.ollama_base_url = os.environ.get('OLLAMA_BASE_URL')
        self.ollama_default_model = os.environ.get('OLLAMA_DEFAULT_MODEL')
        self.ollama_configured = bool(self.ollama_base_url and self.ollama_default_model)
        self._ollama_available = None

        # Groq setup
        self.groq_key = os.environ.get('GROQ_API_KEY')
        self.groq_configured = bool(GROQ_AVAILABLE and self.groq_key)
        if self.groq_configured:
            self.groq_client = Groq(api_key=self.groq_key)
        else:
            self.groq_client = None
            
        # Anthropic setup
        self.anthropic_service = AnthropicService()

    def _check_ollama_availability(self):
        if not self.ollama_base_url:
            return False

        try:
            url = f"{self.ollama_base_url.rstrip('/')}/api/models"
            response = requests.get(url, timeout=5)
            return response.ok
        except requests.exceptions.RequestException as exc:
            logger.warning("Ollama service unavailable at %s: %s", self.ollama_base_url, exc)
            return False

    def is_ollama_available(self):
        if self._ollama_available is not None:
            return self._ollama_available
        self._ollama_available = self.ollama_configured and self._check_ollama_availability()
        return self._ollama_available

    def get_provider_and_model(self, provider_choice=None):
        choice = (provider_choice or self.default_provider).lower()
        
        if choice == 'gemini':
            if not self.openrouter_configured:
                raise ValueError(
                    "Gemini requires OpenRouter. Set OPENROUTER_API_KEY or choose ollama, groq, anthropic, or openrouter."
                )
            return 'openrouter', 'google/gemini-2.5-flash'
        elif choice == 'gpt':
            if not self.openrouter_configured:
                raise ValueError(
                    "GPT requires OpenRouter. Set OPENROUTER_API_KEY or choose ollama, groq, anthropic, or openrouter."
                )
            return 'openrouter', 'openai/gpt-4o'
        elif choice == 'groq':
            if not self.groq_configured:
                raise ValueError(
                    "Groq requires GROQ_API_KEY configuration. Set GROQ_API_KEY or choose ollama, anthropic, or openrouter."
                )
            return 'groq', 'llama-3.3-70b-versatile'
        elif choice == 'anthropic':
            return 'anthropic', 'claude-haiku-4-5-20251001'
        elif choice == 'openrouter':
            if not self.openrouter_configured:
                raise ValueError(
                    "OpenRouter is not configured. Set OPENROUTER_API_KEY or choose ollama, groq, or anthropic."
                )
            return 'openrouter', 'meta-llama/llama-3-70b-instruct' # Generic openrouter fallback if just 'openrouter' is specified
        elif choice == 'ollama':
            if not self.ollama_configured:
                raise ValueError(
                    "Ollama is not configured. Set OLLAMA_BASE_URL and OLLAMA_DEFAULT_MODEL environment variables."
                )
            if not self.is_ollama_available():
                raise ValueError(
                    f"Ollama server at {self.ollama_base_url} is not reachable. "
                    "Start Ollama or update OLLAMA_BASE_URL."
                )
            return 'ollama', self.ollama_default_model
        else:
            raise ValueError(
                f"Unsupported provider choice: {choice}. Supported providers are ollama, gemini, gpt, groq, anthropic, openrouter."
            )
            
    def generate_response(self, messages, provider_choice=None, system=None, max_tokens=1024):
        """
        messages: [{"role": "user", "content": "hello"}]
        """
        provider, model = self.get_provider_and_model(provider_choice)
        
        if provider == 'openrouter':
            if not self.openrouter_configured:
                raise ValueError(
                    "OpenRouter is not configured. Set OPENROUTER_API_KEY or choose ollama, groq, or anthropic."
                )

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
            
        elif provider == 'ollama':
            if not self.ollama_configured:
                raise ValueError(
                    "Ollama is not configured. Set OLLAMA_BASE_URL and OLLAMA_DEFAULT_MODEL environment variables."
                )
            if not self.is_ollama_available():
                raise ValueError(
                    f"Ollama server at {self.ollama_base_url} is not reachable. "
                    "Start Ollama or update OLLAMA_BASE_URL."
                )

            payload_messages = []
            if system:
                payload_messages.append({"role": "system", "content": system})
            payload_messages.extend(messages)

            try:
                response = requests.post(
                    f"{self.ollama_base_url.rstrip('/')}/api/chat?model={model}",
                    headers={"Content-Type": "application/json"},
                    json={"messages": payload_messages, "max_tokens": max_tokens},
                    timeout=90,
                )
                response.raise_for_status()
            except requests.exceptions.ConnectionError as exc:
                logger.error("Ollama connection failed: %s", exc)
                raise ValueError(
                    f"Failed to connect to Ollama at {self.ollama_base_url}. "
                    "Ensure the Ollama server is running and reachable."
                )
            except requests.exceptions.RequestException as exc:
                logger.error("Ollama request failed: %s", exc)
                raise ValueError(
                    f"Ollama request failed: {exc}. "
                    "Check Ollama logs and connection settings."
                )
            data = response.json()
            if isinstance(data, dict) and 'choices' in data and len(data['choices']) > 0:
                choice = data['choices'][0]
                if isinstance(choice, dict):
                    if 'message' in choice and isinstance(choice['message'], dict):
                        return choice['message'].get('content', '')
                    if 'text' in choice:
                        return choice.get('text', '')
                return str(choice)
            if isinstance(data, dict) and data.get('result'):
                return data['result']
            return response.text

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

