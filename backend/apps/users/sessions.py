"""Concurrent ATLAS sign-ins.

Each device keeps its own session. Signing in on the phone does not end the
website session, and signing in on the website does not end the phone session.

The website still ends after 15 minutes without a heartbeat from the open page.
The phone stays signed in until the person signs out or the refresh token
expires (12 hours, SIMPLE_JWT). A sign-out ends only that device.

Keep the 15-minute idle window equal to IDLE_MS in frontend/src/config/session.js.
"""

import secrets
from datetime import timedelta

from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.settings import api_settings

from apps.integrations.models import AuthSession

# Two extra minutes cover a heartbeat that landed just before the last click,
# so the open page can show its own 15-minute warning before the server refuses.
IDLE_TIMEOUT = timedelta(minutes=17)
HEARTBEAT_INTERVAL_SECONDS = 60
# Enough for the website, the phone, and a few extra browsers.
MAX_SESSIONS = 8

SESSION_IDLE = 'session_idle'
SESSION_SUPERSEDED = 'session_superseded'
SESSION_ENDED = 'session_ended'

IDLE_MESSAGE = 'You were signed out after 15 minutes of inactivity. Sign in again.'
SUPERSEDED_MESSAGE = 'You were signed out because this account signed in on another device.'
ENDED_MESSAGE = 'Your session has ended. Sign in again.'


class CodedAuthenticationFailed(AuthenticationFailed):
    def __init__(self, detail, code):
        super().__init__(detail, code)
        self.detail = {'detail': detail, 'code': code}


def session_kind(request, explicit=''):
    """Phone sign-ins skip the website idle clock. Everything else is a web session."""
    value = str(explicit or '').strip().lower()
    if value == AuthSession.KIND_MOBILE:
        return AuthSession.KIND_MOBILE
    if request is not None:
        user_agent = request.META.get('HTTP_USER_AGENT') or ''
        # The installed app uses Dio, which sends this agent, and does not
        # send a client flag until a newer build.
        if user_agent.startswith('Dart/'):
            return AuthSession.KIND_MOBILE
    return AuthSession.KIND_WEB


def _prune_sessions(user_id, now):
    """Drop sessions whose refresh token has already expired. Leave live devices alone."""
    refresh_lifetime = api_settings.REFRESH_TOKEN_LIFETIME
    if not isinstance(refresh_lifetime, timedelta):
        refresh_lifetime = timedelta(hours=12)
    AuthSession.objects.filter(
        user_id=user_id,
        created_at__lt=now - refresh_lifetime,
    ).delete()


def start_session(profile, kind=AuthSession.KIND_WEB):
    """Open another sign-in for this account. Other devices stay signed in."""
    if kind not in {AuthSession.KIND_WEB, AuthSession.KIND_MOBILE}:
        kind = AuthSession.KIND_WEB
    session_id = secrets.token_urlsafe(32)
    now = timezone.now()
    _prune_sessions(profile.user_id, now)
    AuthSession.objects.create(
        session_id=session_id,
        user_id=profile.user_id,
        seen_at=now,
        kind=kind,
    )
    stale_ids = list(
        AuthSession.objects.filter(user_id=profile.user_id)
        .order_by('-seen_at', '-created_at')
        .values_list('session_id', flat=True)
    )[MAX_SESSIONS:]
    if stale_ids:
        AuthSession.objects.filter(session_id__in=stale_ids).delete()
    return session_id


def end_session(user_id, session_id):
    """End this device only. A late sign-out cannot remove a different device."""
    if not user_id or not session_id:
        return
    AuthSession.objects.filter(user_id=user_id, session_id=session_id).delete()


def touch_session(profile, session_id):
    """Record that a person is still at the page. Ignores calls inside the heartbeat interval."""
    if not session_id:
        return
    now = timezone.now()
    seen = AuthSession.objects.filter(
        user_id=profile.user_id,
        session_id=session_id,
    ).values_list('seen_at', flat=True).first()
    if seen is None:
        return
    if (now - seen).total_seconds() < HEARTBEAT_INTERVAL_SECONDS:
        return
    AuthSession.objects.filter(
        user_id=profile.user_id,
        session_id=session_id,
    ).update(seen_at=now)


def reject_if_session_invalid(profile, session_id):
    if not session_id:
        raise CodedAuthenticationFailed(ENDED_MESSAGE, SESSION_ENDED)

    session = AuthSession.objects.filter(
        user_id=profile.user_id,
        session_id=session_id,
    ).only('seen_at', 'kind').first()
    if session is None:
        raise CodedAuthenticationFailed(ENDED_MESSAGE, SESSION_ENDED)

    if session.kind == AuthSession.KIND_MOBILE:
        return

    seen = session.seen_at
    if seen is None or timezone.now() - seen > IDLE_TIMEOUT:
        end_session(profile.user_id, session_id)
        raise CodedAuthenticationFailed(IDLE_MESSAGE, SESSION_IDLE)
