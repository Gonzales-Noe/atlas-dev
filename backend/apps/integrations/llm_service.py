"""
Online open-source/open-weight LLMs on free tiers, behind one fallback chain.

Every hosted provider speaks the OpenAI chat-completions API. Requests walk
the chain (LLM_PROVIDER_CHAIN) until one succeeds; a provider that is rate
limited, out of credits or rejecting the key is put on a cooldown so later
requests skip it instead of waiting on it again. Providers without an API
key are skipped. Ollama (self-hosted) is used only when explicitly chosen.
"""

import logging
import os
import time
from dataclasses import dataclass, field

import requests
from django.core.cache import cache

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProviderSpec:
    label: str
    base_url: str
    key_envs: tuple
    model_env: str
    default_model: str
    # Prompt + completion tokens one request may use (free-tier per-minute caps).
    max_request_tokens: int = 0
    fallback_models_env: str = ''
    default_fallback_models: tuple = field(default_factory=tuple)


PROVIDER_SPECS = {
    'groq': ProviderSpec(
        label='Groq',
        base_url='https://api.groq.com/openai/v1',
        key_envs=('GROQ_API_KEY',),
        model_env='GROQ_MODEL',
        default_model='openai/gpt-oss-120b',
        max_request_tokens=7800,
    ),
    'nvidia': ProviderSpec(
        label='NVIDIA NIM',
        base_url='https://integrate.api.nvidia.com/v1',
        key_envs=('NVIDIA_API_KEY',),
        model_env='NVIDIA_MODEL',
        default_model='nvidia/nemotron-3-super-120b-a12b',
    ),
    'mistral': ProviderSpec(
        label='Mistral',
        base_url='https://api.mistral.ai/v1',
        key_envs=('MISTRAL_API_KEY',),
        model_env='MISTRAL_MODEL',
        default_model='mistral-small-latest',
    ),
    'gemma': ProviderSpec(
        label='Google AI Studio (Gemma)',
        base_url='https://generativelanguage.googleapis.com/v1beta/openai',
        key_envs=('GEMINI_API_KEY',),
        model_env='GEMMA_MODEL',
        default_model='gemma-4-31b-it',
    ),
    'cloudflare': ProviderSpec(
        label='Cloudflare Workers AI',
        base_url='https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1',
        key_envs=('CLOUDFLARE_API_TOKEN',),
        model_env='CLOUDFLARE_MODEL',
        default_model='@cf/openai/gpt-oss-120b',
    ),
    'openrouter': ProviderSpec(
        label='OpenRouter',
        base_url='https://openrouter.ai/api/v1',
        key_envs=('OPENROUTER_API_KEY',),
        model_env='OPENROUTER_MODEL',
        default_model='nvidia/nemotron-3-super-120b-a12b:free',
        fallback_models_env='OPENROUTER_FALLBACK_MODELS',
        default_fallback_models=('google/gemma-4-31b-it:free', 'qwen/qwen3.8-27b:free'),
    ),
    'huggingface': ProviderSpec(
        label='Hugging Face',
        base_url='https://router.huggingface.co/v1',
        key_envs=('HF_TOKEN',),
        model_env='HF_LLM_MODEL',
        default_model='openai/gpt-oss-120b',
    ),
}

DEFAULT_CHAIN = ['groq', 'nvidia', 'mistral', 'gemma', 'cloudflare', 'openrouter', 'huggingface']
DEFAULT_GROQ_MODEL = PROVIDER_SPECS['groq'].default_model
DEFAULT_OPENROUTER_MODEL = PROVIDER_SPECS['openrouter'].default_model

# Older clients and saved settings may still send these names; they are served
# by the open-source OpenRouter model instead of a proprietary one.
LEGACY_PROVIDER_ALIASES = {
    'gemini': 'openrouter',
    'gpt': 'openrouter',
    'anthropic': 'openrouter',
}

PROVIDERS = list(PROVIDER_SPECS) + ['ollama']
# "auto" means: start with DEFAULT_LLM_PROVIDER and walk the chain.
ACCEPTED_PROVIDER_CHOICES = ['auto'] + PROVIDERS + list(LEGACY_PROVIDER_ALIASES)

REQUEST_TIMEOUT = 120
MIN_COMPLETION_TOKENS = 1024
COOLDOWN_SECONDS = {
    'rate_limited': 60,
    'quota': 3600,
    'auth': 3600,
    'unavailable': 30,
}


def normalize_provider(choice):
    choice = (choice or '').strip().lower()
    if choice == 'auto':
        return ''
    return LEGACY_PROVIDER_ALIASES.get(choice, choice)


def estimate_tokens(*texts):
    return sum(len(text or '') for text in texts) // 4


class ProviderError(ValueError):
    """A provider call failed; `kind` decides whether it cools down."""

    def __init__(self, provider, message, kind='error', retry_after=None, status_code=None):
        super().__init__(f'{provider}: {message}')
        self.provider = provider
        self.kind = kind
        self.retry_after = retry_after
        self.status_code = status_code


def _cooldown_key(provider):
    return f'llm:cooldown:{provider}'


def provider_cooldown_remaining(provider):
    until = cache.get(_cooldown_key(provider))
    return max(0, int(until - time.time())) if until else 0


def _start_cooldown(provider, seconds, reason):
    cache.set(_cooldown_key(provider), time.time() + seconds, timeout=seconds)
    logger.warning("LLM provider '%s' paused for %ss: %s", provider, seconds, reason)


def _classify_http_error(status_code, body):
    text = (body or '').lower()
    if status_code == 402 or 'insufficient' in text or 'credit' in text or 'quota' in text:
        return 'quota'
    if status_code == 429:
        return 'rate_limited'
    if status_code in (401, 403):
        return 'auth'
    if status_code == 413 or 'too large' in text or 'context length' in text:
        return 'too_large'
    if status_code >= 500:
        return 'unavailable'
    return 'error'


class LLMService:
    """Generate text with free online open-weight models, failing over between providers."""

    def __init__(self):
        self.default_provider = normalize_provider(os.environ.get('DEFAULT_LLM_PROVIDER') or 'groq')
        chain = os.environ.get('LLM_PROVIDER_CHAIN')
        self.chain = [
            normalize_provider(name) for name in (chain.split(',') if chain else DEFAULT_CHAIN)
            if normalize_provider(name) in PROVIDER_SPECS
        ]
        self.models = {
            name: os.environ.get(spec.model_env) or spec.default_model
            for name, spec in PROVIDER_SPECS.items()
        }
        self.api_keys = {
            name: next((os.environ[env] for env in spec.key_envs if os.environ.get(env)), '')
            for name, spec in PROVIDER_SPECS.items()
        }
        self.configured = {
            name: bool(self.api_keys[name]) and self._base_url(name) is not None
            for name in PROVIDER_SPECS
        }
        self.groq_model = self.models['groq']
        self.openrouter_model = self.models['openrouter']

        self.ollama_base_url = os.environ.get('OLLAMA_BASE_URL')
        self.ollama_default_model = os.environ.get('OLLAMA_DEFAULT_MODEL')
        self.ollama_configured = bool(self.ollama_base_url and self.ollama_default_model)
        self._ollama_available = None

    # Kept for callers and tests that toggle individual providers.
    @property
    def groq_configured(self):
        return self.configured['groq']

    @groq_configured.setter
    def groq_configured(self, value):
        self.configured['groq'] = bool(value)

    @property
    def openrouter_configured(self):
        return self.configured['openrouter']

    @openrouter_configured.setter
    def openrouter_configured(self, value):
        self.configured['openrouter'] = bool(value)

    def _base_url(self, provider):
        base_url = PROVIDER_SPECS[provider].base_url
        if '{CLOUDFLARE_ACCOUNT_ID}' in base_url:
            account_id = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
            if not account_id:
                return None
            base_url = base_url.replace('{CLOUDFLARE_ACCOUNT_ID}', account_id)
        return base_url

    def provider_status(self):
        """Per-provider configuration, model and cooldown, for the status endpoint."""
        return {
            name: {
                'label': spec.label,
                'configured': self.configured[name],
                'model': self.models[name],
                'cooldown_seconds': provider_cooldown_remaining(name),
            }
            for name, spec in PROVIDER_SPECS.items()
        }

    def _check_ollama_availability(self):
        if not self.ollama_base_url:
            return False

        try:
            # Native Ollama API: GET /api/tags lists installed models.
            url = f"{self.ollama_base_url.rstrip('/')}/api/tags"
            response = requests.get(url, timeout=5)
            return response.ok
        except requests.exceptions.RequestException as exc:
            logger.warning("Ollama service unavailable at %s: %s", self.ollama_base_url, exc)
            return False

    def is_ollama_available(self):
        # Re-check each time so starting Ollama after Django still works.
        return self.ollama_configured and self._check_ollama_availability()

    def get_provider_and_model(self, provider_choice=None):
        choice = normalize_provider(provider_choice) or self.default_provider

        if choice in PROVIDER_SPECS:
            if not self.configured[choice]:
                spec = PROVIDER_SPECS[choice]
                raise ValueError(f"{spec.label} is not configured. Set {' or '.join(spec.key_envs)}.")
            return choice, self.models[choice]
        if choice == 'ollama':
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
        raise ValueError(
            f"Unsupported provider choice: {choice}. Supported providers are {', '.join(PROVIDERS)}."
        )

    def _completion_budget(self, provider, prompt_tokens, max_tokens):
        """Completion tokens to request, or None when the prompt cannot fit."""
        limit = PROVIDER_SPECS[provider].max_request_tokens if provider in PROVIDER_SPECS else 0
        if not limit:
            return max_tokens
        room = limit - prompt_tokens
        if room < min(MIN_COMPLETION_TOKENS, max_tokens):
            return None
        return min(max_tokens, room)

    def _chat_completion(self, provider, model, payload_messages, max_tokens):
        spec = PROVIDER_SPECS[provider]
        body = {'model': model, 'messages': payload_messages, 'max_tokens': max_tokens}
        if 'gpt-oss' in model:
            # Reasoning tokens count toward max_tokens; keep them small.
            body['reasoning_effort'] = 'low'
        if provider == 'openrouter':
            fallbacks = os.environ.get(spec.fallback_models_env)
            fallback_models = (
                [m.strip() for m in fallbacks.split(',') if m.strip()]
                if fallbacks is not None else list(spec.default_fallback_models)
            )
            if fallback_models:
                body['models'] = [model] + [m for m in fallback_models if m != model]

        try:
            response = requests.post(
                f"{self._base_url(provider)}/chat/completions",
                headers={
                    'Authorization': f'Bearer {self.api_keys[provider]}',
                    'Content-Type': 'application/json',
                },
                json=body,
                timeout=REQUEST_TIMEOUT,
            )
        except requests.exceptions.RequestException as exc:
            raise ProviderError(provider, f'request failed: {exc}', kind='unavailable') from exc

        if not response.ok:
            retry_after = response.headers.get('retry-after')
            raise ProviderError(
                provider,
                f'HTTP {response.status_code}: {response.text[:300]}',
                kind=_classify_http_error(response.status_code, response.text),
                retry_after=int(float(retry_after)) if retry_after and retry_after.replace('.', '', 1).isdigit() else None,
                status_code=response.status_code,
            )
        try:
            content = response.json()['choices'][0]['message'].get('content')
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError(provider, f'unexpected response: {response.text[:300]}') from exc
        if not content or not content.strip():
            raise ProviderError(provider, 'returned an empty response')
        return content

    def _ollama_completion(self, model, payload_messages, max_tokens):
        # Native Ollama chat API: POST /api/chat with stream=false.
        try:
            response = requests.post(
                f"{self.ollama_base_url.rstrip('/')}/api/chat",
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
        except requests.exceptions.ConnectionError as exc:
            logger.error("Ollama connection failed: %s", exc)
            raise ProviderError(
                'ollama',
                f"Failed to connect to Ollama at {self.ollama_base_url}. "
                "Ensure the Ollama server is running and reachable.",
                kind='unavailable',
            ) from exc
        except requests.exceptions.RequestException as exc:
            logger.error("Ollama request failed: %s", exc)
            status = getattr(getattr(exc, 'response', None), 'status_code', None)
            raise ProviderError(
                'ollama',
                f"Ollama request failed: {exc}",
                kind=_classify_http_error(status or 500, str(exc)),
                status_code=status,
            ) from exc
        data = response.json()
        if isinstance(data, dict) and isinstance(data.get('message'), dict):
            content = data['message'].get('content') or ''
            if content.strip():
                return content
        if isinstance(data, dict) and 'choices' in data and data['choices']:
            choice = data['choices'][0]
            if isinstance(choice, dict) and isinstance(choice.get('message'), dict):
                content = choice['message'].get('content') or ''
                if content.strip():
                    return content
        raise ProviderError('ollama', f'unexpected response: {str(data)[:300]}')

    def generate_response(self, messages, provider_choice=None, system=None, max_tokens=1024):
        """
        Call one provider. messages: [{"role": "user", "content": "hello"}]
        """
        provider, model = self.get_provider_and_model(provider_choice)
        payload_messages = ([{'role': 'system', 'content': system}] if system else []) + list(messages)

        if provider == 'ollama':
            return self._ollama_completion(model, payload_messages, max_tokens)

        prompt_tokens = estimate_tokens(system, *(m.get('content', '') for m in messages))
        budget = self._completion_budget(provider, prompt_tokens, max_tokens)
        if budget is None:
            raise ProviderError(
                provider,
                f'prompt (~{prompt_tokens} tokens) exceeds the free-tier request size',
                kind='too_large',
            )
        try:
            return self._chat_completion(provider, model, payload_messages, budget)
        except ProviderError as exc:
            if exc.kind in COOLDOWN_SECONDS:
                _start_cooldown(provider, exc.retry_after or COOLDOWN_SECONDS[exc.kind], exc)
            raise

    def generate_response_with_fallback(
        self, messages, preferred_provider=None, system=None, max_tokens=2048,
        return_provider=False,
    ):
        """
        Try the preferred provider, then every other configured provider in the
        chain. Providers on cooldown or too small for the prompt are skipped.
        """
        primary_provider = normalize_provider(preferred_provider) or self.default_provider
        providers_to_try = list(dict.fromkeys([primary_provider, *self.chain]))
        # Local Ollama is last-resort fallback when free online providers fail.
        if self.ollama_configured and 'ollama' not in providers_to_try:
            providers_to_try.append('ollama')
        prompt_tokens = estimate_tokens(system, *(m.get('content', '') for m in messages))
        failures = []

        for provider_choice in providers_to_try:
            if provider_choice in PROVIDER_SPECS:
                if not self.configured[provider_choice]:
                    continue
                remaining = provider_cooldown_remaining(provider_choice)
                if remaining:
                    failures.append(f'{provider_choice}: paused for {remaining}s after an earlier failure')
                    continue
                if self._completion_budget(provider_choice, prompt_tokens, max_tokens) is None:
                    failures.append(f'{provider_choice}: prompt too large for its free tier')
                    continue
            elif provider_choice == 'ollama':
                if not self.is_ollama_available():
                    failures.append('ollama: server not reachable')
                    continue
            try:
                result = self.generate_response(
                    messages,
                    provider_choice=provider_choice,
                    system=system,
                    max_tokens=max_tokens,
                )
                if not result:
                    raise ValueError(f"Provider '{provider_choice}' returned an empty response.")
                if provider_choice != primary_provider:
                    logger.warning(
                        "LLM provider '%s' failed over to '%s'",
                        primary_provider,
                        provider_choice,
                    )
                if return_provider:
                    return result, provider_choice
                return result
            except Exception as exc:
                logger.warning("LLM provider '%s' failed: %s", provider_choice, exc)
                failures.append(f"{provider_choice}: {exc}")

        raise ValueError(
            "AI generation failed with all available providers. "
            + ("; ".join(failures) if failures else
               "No providers are configured. Add at least one free API key (e.g. GROQ_API_KEY, NVIDIA_API_KEY).")
        )
