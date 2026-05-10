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
        self.default_provider = os.environ.get('DEFAULT_LLM_PROVIDER', 'ollama').lower()

        # Ollama setup (local, no credits)
        self.ollama_base_url = os.environ.get('OLLAMA_BASE_URL', 'http://127.0.0.1:11434').rstrip('/')
        self.ollama_default_model = os.environ.get('OLLAMA_DEFAULT_MODEL', 'deepseek-r1:8b').strip()
        
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

        if choice == 'ollama':
            return 'ollama', self.ollama_default_model
        
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
            return 'ollama', self.ollama_default_model

    def check_ollama_health(self):
        """Return local Ollama availability and model readiness."""
        health = {
            "provider": "ollama",
            "base_url": self.ollama_base_url,
            "model": self.ollama_default_model,
            "server_reachable": False,
            "model_available": False,
            "available_models": [],
            "error": None,
        }

        try:
            response = requests.get(f"{self.ollama_base_url}/api/tags", timeout=10)
            response.raise_for_status()
            data = response.json()
            models = data.get("models", [])

            available = []
            for item in models:
                name = item.get("name") or item.get("model")
                if name:
                    available.append(name)

            requested = self.ollama_default_model
            requested_base = requested.split(":", 1)[0]
            available_bases = {m.split(":", 1)[0] for m in available}

            health["server_reachable"] = True
            health["available_models"] = available
            health["model_available"] = requested in available or requested_base in available_bases
            return health
        except Exception as exc:  # noqa: BLE001 - health endpoint should capture runtime errors
            health["error"] = str(exc)
            return health
            
    def generate_response(self, messages, provider_choice=None, system=None, max_tokens=1024):
        """
        messages: [{"role": "user", "content": "hello"}]
        """
        provider, model = self.get_provider_and_model(provider_choice)

        if provider == 'ollama':
            payload_messages = []
            if system:
                payload_messages.append({"role": "system", "content": system})
            payload_messages.extend(messages)

            response = requests.post(
                f"{self.ollama_base_url}/api/chat",
                headers={"Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": payload_messages,
                    "stream": False,
                    "options": {"num_predict": max_tokens},
                },
                timeout=180,
            )
            response.raise_for_status()
            data = response.json()
            content = ((data.get("message") or {}).get("content") or "").strip()
            if not content:
                raise ValueError("Ollama returned an empty response.")
            return content
        
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

