import ipaddress
import logging

from django.core.cache import cache
from django.db import connections
from django.http import JsonResponse

logger = logging.getLogger(__name__)

# POST path prefixes that accept anonymous credentials or mail.
_PREFIX_LIMITS = (
    # Longer prefixes first so refresh is not counted as a login.
    ('refresh', 30, 60, (
        '/api/auth/token/refresh/',
        '/api/users/token/refresh/',
        '/api/token/refresh/',
    )),
    ('login', 10, 60, (
        '/api/auth/token/',
        '/api/users/token/',
        '/api/token/',
    )),
    ('google', 10, 60, (
        '/api/auth/google/',
        '/api/users/google/',
    )),
    ('register', 10, 3600, (
        '/api/auth/register/',
        '/api/users/register/',
    )),
    ('reset-request', 5, 3600, (
        '/api/auth/password-reset/request/',
        '/api/users/password-reset/request/',
    )),
    ('reset-verify', 8, 600, (
        '/api/auth/password-reset/verify/',
        '/api/users/password-reset/verify/',
    )),
    ('reset-confirm', 10, 3600, (
        '/api/auth/password-reset/confirm/',
        '/api/users/password-reset/confirm/',
    )),
    ('contact', 5, 3600, (
        '/api/auth/contact/',
        '/api/users/contact/',
    )),
)

# Authenticated work that calls a model or parses an upload.
_GENERATION_MARKERS = (
    '/generate-',
    '/parse-syllabus',
    '/segment-syllabus',
    '/prepare-syllabus',
    '/import-syllabus',
    '/upload-rag',
    '/upload-global-rag',
    '/upload-course-rag',
    '/semantic-search',
)


def _is_trusted_proxy(peer):
    """Docker and loopback peers are nginx. A public peer must not supply the client IP."""
    try:
        ip = ipaddress.ip_address(peer)
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback


def _client_ip(request):
    # nginx overwrites X-Real-IP with the socket address. Trust it only from that proxy.
    peer = (request.META.get('REMOTE_ADDR') or '').strip()
    real_ip = (request.META.get('HTTP_X_REAL_IP') or '').strip()
    if real_ip and _is_trusted_proxy(peer):
        return real_ip[:64]
    return (peer or 'unknown')[:64]


def _rate_identity(request):
    header = request.META.get('HTTP_AUTHORIZATION') or ''
    if header.startswith('Bearer '):
        raw = header.split(' ', 1)[1].strip()
        try:
            from rest_framework_simplejwt.tokens import AccessToken
            token = AccessToken(raw)
            user_id = token.get('user_id')
            if user_id:
                return f'user:{user_id}'
        except Exception:
            pass
    return f'ip:{_client_ip(request)}'


def _limit_for(path, method):
    if method != 'POST':
        return None
    for name, limit, window, prefixes in _PREFIX_LIMITS:
        if any(path.startswith(prefix) for prefix in prefixes):
            return name, limit, window
    if any(marker in path for marker in _GENERATION_MARKERS):
        return 'generation', 240, 3600
    return None


def _within_limit(bucket, identity, limit, window, fail_closed=False):
    key = f'atlas:throttle:{bucket}:{identity}'
    try:
        if cache.add(key, 1, timeout=window):
            return True
        try:
            count = cache.incr(key)
        except ValueError:
            cache.set(key, 1, timeout=window)
            return True
        return count <= limit
    except Exception:
        logger.exception('Rate-limit cache is unavailable for %s.', bucket)
        return False if fail_closed else True


class SensitiveEndpointThrottleMiddleware:
    """Cap anonymous auth abuse and authenticated generation volume."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        rule = _limit_for(request.path, request.method)
        if rule is not None:
            name, limit, window = rule
            if not _within_limit(name, _rate_identity(request), limit, window, fail_closed=(name == 'contact')):
                return JsonResponse(
                    {'detail': 'Too many attempts. Please wait and try again.'},
                    status=429,
                )
        return self.get_response(request)

# Messages Postgres and Supavisor return after an idle connection is dropped.
_DISCONNECT_MARKERS = (
    'server closed the connection',
    'connection already closed',
    'connection not open',
    'ssl connection has been closed',
    'ssl syscall error',
    'consuming input failed',
    'terminating connection',
    'connection reset',
    'could not receive data',
    'admin shutdown',
)


def _is_database_disconnect(exception):
    message = str(exception).lower()
    return any(marker in message for marker in _DISCONNECT_MARKERS)


def _can_retry(request):
    if request.method in {'GET', 'HEAD', 'OPTIONS'}:
        return True
    # Login and refresh only read the user row, so one retry cannot double-write.
    return request.method == 'POST' and (
        request.path.startswith('/api/auth/token/')
        or request.path.startswith('/api/auth/google/')
    )


class DatabaseReconnectMiddleware:
    """Retry a request once when Supabase has closed an idle connection."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        if getattr(request, '_atlas_db_retried', False):
            return None
        if not _is_database_disconnect(exception) or not _can_retry(request):
            return None

        request._atlas_db_retried = True
        for connection in connections.all():
            connection.close()
        return self.get_response(request)
