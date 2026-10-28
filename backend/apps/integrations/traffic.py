"""Concurrent users seen on authenticated API requests."""

import logging
import time

from django.core.cache import cache

logger = logging.getLogger(__name__)

WINDOW_SECONDS = 120
_CACHE_KEY = 'traffic:presence'

_ROLE_LABELS = {
    'super_admin': 'Super admin',
    'superadmin': 'Super admin',
    'admin': 'Admin',
    'faculty': 'Faculty',
    'student': 'Student',
}


def record_presence(user):
    """Remember this user as active. Failures must not block the request."""
    user_id = str(getattr(user, 'user_id', '') or getattr(user, 'pk', '') or '')
    if not user_id:
        return
    try:
        now = time.time()
        presence = _fresh(cache.get(_CACHE_KEY) or {}, now)
        presence[user_id] = {
            'seen': now,
            'role': str(getattr(user, 'role', '') or ''),
        }
        cache.set(_CACHE_KEY, presence, timeout=WINDOW_SECONDS)
    except Exception:
        logger.warning('Could not record concurrent-user presence', exc_info=True)


def concurrent_snapshot():
    """Users with an authenticated request inside the current window."""
    now = time.time()
    presence = _fresh(cache.get(_CACHE_KEY) or {}, now)
    counts = {}
    for item in presence.values():
        role = item.get('role') or 'unknown'
        counts[role] = counts.get(role, 0) + 1
    by_role = [
        {'role': role, 'label': _ROLE_LABELS.get(role, role.replace('_', ' ').title()), 'count': count}
        for role, count in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))
    ]
    return {
        'window_seconds': WINDOW_SECONDS,
        'concurrent_users': len(presence),
        'by_role': by_role,
    }


def _fresh(presence, now):
    cutoff = now - WINDOW_SECONDS
    return {
        user_id: item
        for user_id, item in presence.items()
        if isinstance(item, dict) and item.get('seen', 0) >= cutoff
    }
