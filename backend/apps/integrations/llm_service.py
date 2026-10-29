"""
Online open-source/open-weight LLMs on free tiers, behind one fallback chain.

Every hosted provider speaks the OpenAI chat-completions API. Requests walk
the chain (LLM_PROVIDER_CHAIN) until one succeeds; a provider that is rate
limited, out of credits or rejecting the key is put on a cooldown so later
requests skip it instead of waiting on it again. Providers without an API
key are skipped. Ollama (self-hosted) is used only when explicitly chosen.
"""

import hashlib
import logging
import os
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

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
        default_model='nvidia/nemotron-3-ultra-550b-a55b:free',
        fallback_models_env='OPENROUTER_FALLBACK_MODELS',
        default_fallback_models=(
            'nvidia/nemotron-3.5-lightning:free',
            'google/gemma-4-31b-it:free',
            'google/gemma-4-26b-a4b-it:free',
        ),
    ),
}

DEFAULT_CHAIN = ['groq', 'gemma', 'cloudflare', 'openrouter']
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


def visible_text(message):
    """Answer text from a chat message. Reasoning is not an answer."""
    if not isinstance(message, dict):
        return ''

    content = message.get('content')
    if isinstance(content, str) and content.strip():
        return content.strip()
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, str) and part.strip():
                parts.append(part)
            elif isinstance(part, dict):
                text = part.get('text') or part.get('content') or ''
                if str(text).strip():
                    parts.append(str(text))
        return '\n'.join(parts).strip()
    return ''


def message_text(message):
    """Assistant text from a chat message.

    Reasoning models sometimes leave content empty and put a finished answer
    in reasoning. Use that text only when content itself is empty.
    """
    text = visible_text(message)
    if text:
        return text
    if not isinstance(message, dict):
        return ''
    for key in ('reasoning', 'reasoning_content'):
        reasoning = message.get(key)
        if isinstance(reasoning, str) and reasoning.strip():
            return reasoning
    return ''


def completion_text(choice):
    """Answer text, or None when the reply stopped before an answer was written."""
    if not isinstance(choice, dict):
        return ''
    message = choice.get('message') if isinstance(choice.get('message'), dict) else {}
    content = visible_text(message)
    if content:
        return content
    if choice.get('finish_reason') == 'length':
        return None
    return message_text(message)


def _move_ollama_next(providers, failed_index):
    """Put Ollama immediately after the provider whose reply stopped."""
    tail = providers[failed_index + 1:]
    if 'ollama' not in tail:
        return providers
    rest = [name for name in tail if name != 'ollama']
    return providers[:failed_index + 1] + ['ollama'] + rest


def normalize_provider(choice):
    choice = (choice or '').strip().lower()
    if choice == 'auto':
        return ''
    return LEGACY_PROVIDER_ALIASES.get(choice, choice)


def estimate_tokens(*texts):
    return sum(len(text or '') for text in texts) // 4


_QUOTA_CACHE_SECONDS = 6 * 3600
_RESET_DELAY = re.compile(r'(\d+(?:\.\d+)?)(ms|h|m|s)')


def _quota_cache_key(provider):
    return f'llm:quota:{provider}'


def parse_reset_delay(value):
    """Seconds until a limit returns. Accepts Groq durations and unix timestamps."""
    if value is None or value == '':
        return None
    text = str(value).strip()
    if re.fullmatch(r'\d+(?:\.\d+)?', text):
        number = float(text)
        if number > 1_000_000_000_000:
            return max(0.0, number / 1000 - time.time())
        if number > 1_000_000_000:
            return max(0.0, number - time.time())
        return number
    total = 0.0
    found = False
    for amount, unit in _RESET_DELAY.findall(text):
        found = True
        number = float(amount)
        total += {'ms': number / 1000, 'h': number * 3600, 'm': number * 60, 's': number}[unit]
    return total if found else None


def _header(headers, name):
    if not headers:
        return None
    getter = getattr(headers, 'get', None)
    if not getter:
        return None
    return getter(name)


def _as_int(value):
    if value is None or value == '':
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _iso_after(seconds):
    if seconds is None:
        return None
    return (datetime.now(timezone.utc) + timedelta(seconds=max(0, seconds))).isoformat()


def quota_from_headers(provider, headers, status_code=200):
    """Read unused tokens or requests from a provider response."""
    tokens_limit = _as_int(_header(headers, 'x-ratelimit-limit-tokens'))
    tokens_remaining = _as_int(_header(headers, 'x-ratelimit-remaining-tokens'))
    requests_limit = _as_int(_header(headers, 'x-ratelimit-limit-requests') or _header(headers, 'x-ratelimit-limit'))
    requests_remaining = _as_int(
        _header(headers, 'x-ratelimit-remaining-requests') or _header(headers, 'x-ratelimit-remaining')
    )
    token_reset = parse_reset_delay(_header(headers, 'x-ratelimit-reset-tokens'))
    request_reset = parse_reset_delay(
        _header(headers, 'x-ratelimit-reset-requests')
        or _header(headers, 'x-ratelimit-reset')
        or _header(headers, 'retry-after')
    )
    limited = status_code == 429 or tokens_remaining == 0 or requests_remaining == 0
    resets_at = None
    if tokens_remaining == 0 and token_reset is not None:
        resets_at = _iso_after(token_reset)
    elif (requests_remaining == 0 or status_code == 429) and request_reset is not None:
        resets_at = _iso_after(request_reset)
    elif token_reset is not None:
        resets_at = _iso_after(token_reset)
    quota_kind = 'tokens' if tokens_limit is not None or tokens_remaining is not None else (
        'requests' if requests_limit is not None or requests_remaining is not None else 'none'
    )
    if status_code in (401, 403):
        status_name = 'blocked'
        detail = 'Generation is blocked for this key. It does not return on a timer.'
    elif limited:
        status_name = 'limited'
        detail = 'The limit is reached.'
    elif status_code and status_code >= 500:
        status_name = 'unreachable'
        detail = 'The provider did not answer.'
    else:
        status_name = 'healthy'
        detail = '' if quota_kind != 'none' else 'This provider does not publish a token balance.'
    return {
        'provider': provider,
        'status': status_name,
        'quota_kind': quota_kind,
        'tokens_limit': tokens_limit,
        'tokens_remaining': tokens_remaining,
        'requests_limit': requests_limit,
        'requests_remaining': requests_remaining,
        'reset_in_seconds': token_reset if tokens_remaining == 0 and token_reset is not None else request_reset,
        'resets_at': resets_at,
        'detail': detail,
    }


def remember_provider_quota(provider, payload):
    stored = dict(payload)
    stored['checked_at'] = datetime.now(timezone.utc).isoformat()
    cache.set(_quota_cache_key(provider), stored, timeout=_QUOTA_CACHE_SECONDS)
    return stored


def stored_provider_quota(provider):
    return cache.get(_quota_cache_key(provider))


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


def collect_api_keys(env_names, environ=None):
    """Keys for one provider. Numbered vars and comma-separated values are extra accounts."""
    source = os.environ if environ is None else environ
    keys = []
    for env_name in env_names:
        raw = source.get(env_name) or ''
        for part in raw.split(','):
            part = part.strip().strip('"').strip("'")
            if part and part not in keys:
                keys.append(part)
        for index in range(2, 13):
            extra = (source.get(f'{env_name}_{index}') or '').strip().strip('"').strip("'")
            if extra and extra not in keys:
                keys.append(extra)
    return keys


def _key_slot(provider, api_key):
    digest = hashlib.sha256(api_key.encode()).hexdigest()[:12]
    return f'{provider}:{digest}'


def key_cooldown_remaining(provider, api_key):
    until = cache.get(f'llm:cooldown:key:{_key_slot(provider, api_key)}')
    return max(0, int(until - time.time())) if until else 0


def _start_key_cooldown(provider, api_key, seconds, reason):
    slot = _key_slot(provider, api_key)
    cache.set(f'llm:cooldown:key:{slot}', time.time() + seconds, timeout=seconds)
    logger.warning("LLM provider '%s' key %s paused for %ss: %s", provider, slot[-4:], seconds, reason)


def remember_key_quota(provider, api_key, payload):
    """Quota for one account. The provider cache keeps the latest account for older readers."""
    stored = dict(payload)
    stored['checked_at'] = datetime.now(timezone.utc).isoformat()
    cache.set(f'llm:quota:{_key_slot(provider, api_key)}', stored, timeout=_QUOTA_CACHE_SECONDS)
    remember_provider_quota(provider, stored)
    return stored


def stored_key_quota(provider, api_key):
    return cache.get(f'llm:quota:{_key_slot(provider, api_key)}')


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
            name: collect_api_keys(spec.key_envs)
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

    def keys_for(self, provider):
        """Account keys for one provider. A string value is the single-key form tests still set."""
        raw = self.api_keys.get(provider) or ''
        if isinstance(raw, (list, tuple)):
            return [str(key).strip() for key in raw if str(key).strip()]
        return [part.strip() for part in str(raw).split(',') if part.strip()]

    def provider_status(self):
        """Per-provider configuration, model and cooldown, for the status endpoint."""
        return {
            name: {
                'label': spec.label,
                'configured': self.configured[name],
                'model': self.models[name],
                'keys': len(self.keys_for(name)),
                'cooldown_seconds': provider_cooldown_remaining(name),
            }
            for name, spec in PROVIDER_SPECS.items()
        }

    def _blank_health(self, provider, status_name, detail):
        spec = PROVIDER_SPECS.get(provider)
        return {
            'id': provider,
            'label': spec.label if spec else 'Ollama',
            'model': self.models.get(provider) if provider in self.models else self.ollama_default_model,
            'configured': bool(self.configured.get(provider)) if provider in PROVIDER_SPECS else self.ollama_configured,
            'status': status_name,
            'quota_kind': 'none',
            'tokens_limit': None,
            'tokens_remaining': None,
            'requests_limit': None,
            'requests_remaining': None,
            'resets_at': None,
            'reset_in_seconds': None,
            'detail': detail,
            'checked_at': None,
            'cooldown_seconds': provider_cooldown_remaining(provider) if provider in PROVIDER_SPECS else 0,
        }

    def _apply_cooldown(self, row):
        remaining = row.get('cooldown_seconds') or 0
        if remaining and row['status'] == 'healthy':
            row['status'] = 'limited'
        if remaining and not row.get('resets_at'):
            row['resets_at'] = _iso_after(remaining)
            row['reset_in_seconds'] = remaining
        return row

    def _probe_one_key(self, provider, api_key):
        """One short call on this account so its rate-limit headers can be read."""
        try:
            self._chat_completion(
                provider,
                self.models[provider],
                [{'role': 'user', 'content': 'Reply with OK.'}],
                16,
                api_key=api_key,
            )
        except ProviderError as exc:
            if exc.kind in COOLDOWN_SECONDS:
                _start_key_cooldown(
                    provider, api_key, exc.retry_after or COOLDOWN_SECONDS[exc.kind], exc,
                )
            if exc.kind == 'unavailable' and not stored_key_quota(provider, api_key):
                return {
                    'status': 'unreachable',
                    'quota_kind': 'none',
                    'detail': 'The provider did not answer.',
                }
        except Exception as exc:
            logger.warning("LLM health probe for '%s' failed: %s", provider, exc)
        return stored_key_quota(provider, api_key)

    def _read_openrouter_key(self, api_key):
        """Daily free-model balance for one OpenRouter account."""
        try:
            response = requests.get(
                'https://openrouter.ai/api/v1/key',
                headers={'Authorization': f'Bearer {api_key}'},
                timeout=20,
            )
        except requests.exceptions.RequestException as exc:
            return {
                'status': 'unreachable',
                'quota_kind': 'none',
                'detail': f'Could not read the key quota: {exc.__class__.__name__}',
            }
        if not response.ok:
            snapshot = quota_from_headers('openrouter', response.headers, response.status_code)
            snapshot['detail'] = 'The key quota could not be read.'
            remember_key_quota('openrouter', api_key, snapshot)
            if snapshot['status'] in ('limited', 'blocked'):
                kind = 'auth' if snapshot['status'] == 'blocked' else 'rate_limited'
                _start_key_cooldown('openrouter', api_key, COOLDOWN_SECONDS[kind], snapshot['detail'])
            return snapshot
        daily = (response.json().get('data') or {}).get('free_model_daily_requests') or {}
        remaining = _as_int(daily.get('remaining'))
        limit = _as_int(daily.get('limit'))
        snapshot = {
            'provider': 'openrouter',
            'status': 'limited' if remaining == 0 else 'healthy',
            'quota_kind': 'requests',
            'tokens_limit': None,
            'tokens_remaining': None,
            'requests_limit': limit,
            'requests_remaining': remaining,
            'reset_in_seconds': None,
            'resets_at': None,
            'detail': 'Daily free-model requests. This key does not publish a token balance.',
        }
        if remaining == 0:
            tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).replace(
                hour=0, minute=0, second=0, microsecond=0,
            )
            snapshot['resets_at'] = tomorrow.isoformat()
            snapshot['reset_in_seconds'] = max(0, int((tomorrow - datetime.now(timezone.utc)).total_seconds()))
            _start_key_cooldown(
                'openrouter', api_key,
                snapshot['reset_in_seconds'] or COOLDOWN_SECONDS['quota'],
                'daily free-model requests are used up',
            )
        remember_key_quota('openrouter', api_key, snapshot)
        return snapshot

    def _account_health(self, name, api_key, index, total, refresh):
        """Health for one API key. Several keys on a provider are separate accounts."""
        cooling = key_cooldown_remaining(name, api_key)
        cached = stored_key_quota(name, api_key)
        if cached is None and total == 1:
            cached = stored_provider_quota(name)
        if (refresh or not cached) and not cooling:
            if name == 'openrouter':
                cached = self._read_openrouter_key(api_key) or cached
            else:
                cached = self._probe_one_key(name, api_key) or cached
        if not cached:
            detail = 'This account is paused.' if cooling else 'No token balance has been published yet.'
            row = self._blank_health(name, 'limited' if cooling else 'healthy', detail)
        else:
            row = self._blank_health(name, cached.get('status') or 'healthy', cached.get('detail') or '')
            for field in (
                'status', 'quota_kind', 'tokens_limit', 'tokens_remaining',
                'requests_limit', 'requests_remaining', 'resets_at', 'reset_in_seconds',
                'detail', 'checked_at',
            ):
                if field in cached:
                    row[field] = cached[field]
        spec = PROVIDER_SPECS[name]
        row['id'] = name if total == 1 else f'{name}-{index}'
        row['instance'] = index
        row['instances'] = total
        row['label'] = spec.label
        row['model'] = self.models[name]
        row['configured'] = True
        row['key_hint'] = api_key[-4:] if api_key else ''
        row['cooldown_seconds'] = max(key_cooldown_remaining(name, api_key), provider_cooldown_remaining(name))
        return self._apply_cooldown(row)

    def _ollama_health(self):
        row = self._blank_health('ollama', 'unreachable', '')
        row['label'] = 'Ollama'
        row['model'] = self.ollama_default_model or ''
        row['configured'] = self.ollama_configured
        row['quota_kind'] = 'none'
        row['detail'] = 'Local model on the server. No token limit.'
        if not self.ollama_configured:
            row['status'] = 'not_configured'
            row['detail'] = 'OLLAMA_BASE_URL is not set.'
            return row
        try:
            response = requests.get(f"{self.ollama_base_url.rstrip('/')}/api/tags", timeout=5)
        except requests.exceptions.RequestException:
            row['status'] = 'unreachable'
            row['detail'] = 'The server container cannot be reached from this backend.'
            return row
        if not response.ok:
            row['status'] = 'unreachable'
            row['detail'] = f'The model list returned HTTP {response.status_code}.'
            return row
        names = [item.get('name') or '' for item in (response.json().get('models') or [])]
        wanted = self.ollama_default_model or ''
        installed = wanted in names or any(name.split(':', 1)[0] == wanted.split(':', 1)[0] for name in names if wanted)
        row['status'] = 'healthy' if installed else 'unavailable'
        if not installed:
            row['detail'] = f'{wanted} is not installed in the server container.'
        row['checked_at'] = datetime.now(timezone.utc).isoformat()
        return row

    def llm_health(self, refresh=False):
        """Health, unused quota, and the time a reached limit returns.

        Each API key is its own account, so a provider with several keys
        is listed once per account.
        """
        rows = []
        for name in list(PROVIDER_SPECS) + ['ollama']:
            if name == 'ollama':
                row = self._ollama_health()
                row['instance'] = 1
                row['instances'] = 1
                rows.append(row)
                continue
            keys = self.keys_for(name) if self.configured.get(name) else []
            if not keys:
                row = self._blank_health(name, 'not_configured', 'API key is not set.')
                row['instance'] = 1
                row['instances'] = 0
                rows.append(row)
                continue
            total = len(keys)
            for index, api_key in enumerate(keys, start=1):
                rows.append(self._account_health(name, api_key, index, total, refresh))
        return rows

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

    def _later_online_can_fit(self, providers, prompt_tokens, max_tokens):
        """True when a later online provider still has room for this prompt."""
        for name in providers:
            if name not in PROVIDER_SPECS or not self.configured.get(name):
                continue
            if self._completion_budget(name, prompt_tokens, max_tokens) is not None:
                return True
        return False

    def _candidate_models(self, provider, model):
        """The configured model followed by the provider's fallback models."""
        spec = PROVIDER_SPECS[provider]
        if not spec.fallback_models_env:
            return [model]
        fallbacks = os.environ.get(spec.fallback_models_env)
        fallback_models = (
            [m.strip() for m in fallbacks.split(',') if m.strip()]
            if fallbacks is not None else list(spec.default_fallback_models)
        )
        return list(dict.fromkeys([model, *fallback_models]))

    def _chat_completion_any_model(self, provider, model, payload_messages, max_tokens, api_key=None, extra_body=None):
        """
        Try each candidate model in turn. Free OpenRouter models disappear
        (404) or get rate limited upstream (429) independently of each other,
        and OpenRouter's own `models` fallback does not cover every such error.
        """
        last_error = None
        for candidate in self._candidate_models(provider, model):
            try:
                return self._chat_completion(
                    provider, candidate, payload_messages, max_tokens,
                    extra_body=extra_body, api_key=api_key,
                )
            except ProviderError as exc:
                if exc.kind in ('auth', 'quota', 'incomplete'):
                    raise
                logger.warning("LLM provider '%s' model '%s' failed: %s", provider, candidate, exc)
                last_error = exc
        raise last_error

    def _complete_with_keys(self, provider, model, payload_messages, max_tokens, extra_body=None, rotate_models=True):
        """Try each account key. A paused or rejected key does not block the next account."""
        keys = self.keys_for(provider)
        if not keys:
            raise ProviderError(provider, 'API key is not set.', kind='auth')
        cooling = [key_cooldown_remaining(provider, key) for key in keys]
        if all(cooling):
            raise ProviderError(
                provider,
                'every API key is paused',
                kind='rate_limited',
                retry_after=min(cooling),
            )
        last_error = None
        for index, api_key in enumerate(keys, start=1):
            if key_cooldown_remaining(provider, api_key):
                continue
            try:
                if rotate_models:
                    return self._chat_completion_any_model(
                        provider, model, payload_messages, max_tokens,
                        api_key=api_key, extra_body=extra_body,
                    )
                return self._chat_completion(
                    provider, model, payload_messages, max_tokens,
                    extra_body=extra_body, api_key=api_key,
                )
            except ProviderError as exc:
                last_error = exc
                if exc.kind in ('too_large', 'incomplete'):
                    raise
                if exc.kind in COOLDOWN_SECONDS:
                    _start_key_cooldown(
                        provider, api_key, exc.retry_after or COOLDOWN_SECONDS[exc.kind], exc,
                    )
                logger.warning(
                    "LLM provider '%s' key %s/%s failed: %s",
                    provider, index, len(keys), exc,
                )
        self._pause_provider_if_every_key_is_cooling(provider)
        raise last_error or ProviderError(provider, 'every API key failed')

    def _pause_provider_if_every_key_is_cooling(self, provider):
        keys = self.keys_for(provider)
        remaining = [key_cooldown_remaining(provider, key) for key in keys]
        if keys and remaining and all(remaining):
            _start_cooldown(provider, min(remaining), 'every API key is paused')

    def _chat_completion(self, provider, model, payload_messages, max_tokens, extra_body=None, api_key=None):
        body = {'model': model, 'messages': payload_messages, 'max_tokens': max_tokens}
        if extra_body:
            body.update(extra_body)
        elif 'gpt-oss' in model:
            # Reasoning tokens count toward max_tokens; keep them small.
            body['reasoning_effort'] = 'low'
        token = api_key or (self.keys_for(provider) or [''])[0]

        try:
            response = requests.post(
                f"{self._base_url(provider)}/chat/completions",
                headers={
                    'Authorization': f'Bearer {token}',
                    'Content-Type': 'application/json',
                },
                json=body,
                timeout=REQUEST_TIMEOUT,
            )
        except requests.exceptions.RequestException as exc:
            raise ProviderError(provider, f'request failed: {exc}', kind='unavailable') from exc

        snapshot = quota_from_headers(provider, response.headers, response.status_code)
        if api_key:
            remember_key_quota(provider, api_key, snapshot)
        else:
            remember_provider_quota(provider, snapshot)

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
            content = completion_text(response.json()['choices'][0])
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError(provider, f'unexpected response: {response.text[:300]}') from exc
        if content is None or not str(content).strip():
            raise ProviderError(
                provider,
                'reply stopped before the answer was written',
                kind='incomplete',
            )
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
            content = message_text(data['message'])
            if content.strip():
                return content
        if isinstance(data, dict) and 'choices' in data and data['choices']:
            choice = data['choices'][0]
            if isinstance(choice, dict) and isinstance(choice.get('message'), dict):
                content = message_text(choice['message'])
                if content.strip():
                    return content
        raise ProviderError('ollama', f'unexpected response: {str(data)[:300]}')

    def generate_quick_json(self, messages, system=None, max_tokens=1024):
        """One Groq call that does not reason and does not fall through to Ollama.

        Used for short verdicts. The primary model answers directly. If that
        model is rejected, GPT-OSS 20B runs once with low reasoning.
        """
        if not self.configured.get('groq'):
            raise ValueError('Groq is not configured.')
        payload_messages = ([{'role': 'system', 'content': system}] if system else []) + list(messages)
        primary = (os.environ.get('QA_GROQ_MODEL') or 'qwen/qwen3.8-27b').strip()
        models = [primary]
        if 'openai/gpt-oss-20b' not in models:
            models.append('openai/gpt-oss-20b')
        last_error = None
        for model in models:
            extra = {
                'temperature': 0,
                'response_format': {'type': 'json_object'},
            }
            tokens = max_tokens
            if model.startswith('qwen/'):
                extra['reasoning_effort'] = 'none'
            elif 'gpt-oss' in model:
                extra['reasoning_effort'] = 'low'
                extra['include_reasoning'] = False
                tokens = max(max_tokens, 1024)
            try:
                return self._complete_with_keys(
                    'groq', model, payload_messages, tokens,
                    extra_body=extra, rotate_models=False,
                )
            except ProviderError as exc:
                last_error = exc
                if exc.kind in ('auth', 'quota'):
                    raise
                logger.warning('Quick Groq model %s failed: %s', model, exc)
        raise last_error or ValueError('Groq did not return a verdict.')

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
        return self._complete_with_keys(provider, model, payload_messages, budget)

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
        # Ollama stays last until a reply stops, or until every online provider
        # lacks room for this prompt. Then Ollama takes the same request next.
        if self.ollama_configured and 'ollama' not in providers_to_try:
            providers_to_try.append('ollama')
        prompt_tokens = estimate_tokens(system, *(m.get('content', '') for m in messages))
        failures = []

        index = 0
        while index < len(providers_to_try):
            provider_choice = providers_to_try[index]
            if provider_choice in PROVIDER_SPECS:
                if not self.configured[provider_choice]:
                    index += 1
                    continue
                remaining = provider_cooldown_remaining(provider_choice)
                if remaining:
                    failures.append(f'{provider_choice}: paused for {remaining}s after an earlier failure')
                    index += 1
                    continue
                if self._completion_budget(provider_choice, prompt_tokens, max_tokens) is None:
                    failures.append(f'{provider_choice}: prompt too large for its free tier')
                    if not self._later_online_can_fit(providers_to_try[index + 1:], prompt_tokens, max_tokens):
                        providers_to_try = _move_ollama_next(providers_to_try, index)
                        logger.warning(
                            "Online providers lack tokens for this prompt; Ollama takes over when it is reachable",
                        )
                    index += 1
                    continue
            elif provider_choice == 'ollama':
                if not self.is_ollama_available():
                    failures.append('ollama: server not reachable')
                    index += 1
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
                if getattr(exc, 'kind', None) == 'incomplete':
                    providers_to_try = _move_ollama_next(providers_to_try, index)
                    logger.warning(
                        "LLM provider '%s' reply stopped; Ollama takes over when it is reachable",
                        provider_choice,
                    )
            index += 1

        raise ValueError(
            "AI generation failed with all available providers. "
            + ("; ".join(failures) if failures else
               "No providers are configured. Add at least one free API key (e.g. GROQ_API_KEY).")
        )
