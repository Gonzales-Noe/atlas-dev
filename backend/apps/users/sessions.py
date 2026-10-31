"""One active ATLAS sign-in per account.

The browser keeps tokens only for the open tab. The server is the authority
for the other two rules:

- 30 minutes without a heartbeat from the open page ends the session.
- A new sign-in replaces the previous one, on this browser or another device.

The refresh token itself expires 12 hours after sign-in (SIMPLE_JWT).
Keep the 30-minute idle window equal to IDLE_MS in frontend/src/config/session.js.
"""

import secrets
from datetime import timedelta

from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed

from apps.integrations.models import UserProfile

# Two extra minutes cover a heartbeat that landed just before the last click,
# so the open page can show its own 30-minute warning before the server refuses.
IDLE_TIMEOUT = timedelta(minutes=32)
HEARTBEAT_INTERVAL_SECONDS = 60

SESSION_IDLE = 'session_idle'
SESSION_SUPERSEDED = 'session_superseded'
SESSION_ENDED = 'session_ended'

IDLE_MESSAGE = 'You were signed out after 30 minutes of inactivity. Sign in again.'
SUPERSEDED_MESSAGE = 'You were signed out because this account signed in on another device.'
ENDED_MESSAGE = 'Your session has ended. Sign in again.'


class CodedAuthenticationFailed(AuthenticationFailed):
    def __init__(self, detail, code):
        super().__init__(detail, code)
        self.detail = {'detail': detail, 'code': code}


def start_session(profile):
    """Replace whatever session this account had. Returns the new session id."""
    session_id = secrets.token_urlsafe(32)
    now = timezone.now()
    profile.auth_session_id = session_id
    profile.auth_session_seen_at = now
    profile.save(update_fields=['auth_session_id', 'auth_session_seen_at'])
    return session_id


def end_session(user_id, session_id):
    """Clear the session only when the id still matches, so a late sign-out cannot kill a newer login."""
    if not user_id or not session_id:
        return
    UserProfile.objects.filter(
        user_id=user_id,
        auth_session_id=session_id,
    ).update(auth_session_id='', auth_session_seen_at=None)


def touch_session(profile):
    """Record that a person is still at the page. Ignores calls inside the heartbeat interval."""
    session_id = profile.auth_session_id or ''
    if not session_id:
        return
    now = timezone.now()
    seen = profile.auth_session_seen_at
    if seen is not None and (now - seen).total_seconds() < HEARTBEAT_INTERVAL_SECONDS:
        return
    updated = UserProfile.objects.filter(
        user_id=profile.user_id,
        auth_session_id=session_id,
    ).update(auth_session_seen_at=now)
    if updated:
        profile.auth_session_seen_at = now


def reject_if_session_invalid(profile, session_id):
    current = profile.auth_session_id or ''
    if not session_id or session_id != current:
        if session_id and current:
            raise CodedAuthenticationFailed(SUPERSEDED_MESSAGE, SESSION_SUPERSEDED)
        raise CodedAuthenticationFailed(ENDED_MESSAGE, SESSION_ENDED)

    seen = profile.auth_session_seen_at
    if seen is None or timezone.now() - seen > IDLE_TIMEOUT:
        end_session(profile.user_id, session_id)
        raise CodedAuthenticationFailed(IDLE_MESSAGE, SESSION_IDLE)
