"""Audit-log helpers: scope filters, detail sanitization, and reason-gated views."""

from __future__ import annotations

from typing import Any

from django.db.models import Q, QuerySet

# Keys allowed in sanitized detail payloads returned after a justified view.
SAFE_DETAIL_KEYS = frozenset({
    'course_code',
    'course_title',
    'section',
    'brand_primary',
    'maintenance_enabled',
    'maintenance_notice_enabled',
    'maintenance_scheduled_for',
    'maintenance_scheduled_until',
    'changes',
    'override_count',
    'has_allocation_note',
    'role',
    'is_active',
    'application_status',
    'institution_name',
    'institution_deleted',
    'document_title',
    'file_name',
    'discipline',
    'program',
    'doc_type',
    'faculty_email',
    'faculty_name',
    'admin_email',
    'admin_name',
    'account_email',
    'account_name',
    'deleted_email',
    'deleted_name',
    'deleted_role',
    'reason',
    'viewed_action',
    'viewed_user',
})

# Free-text / sensitive keys never returned even if present in stored JSON.
BLOCKED_DETAIL_KEYS = frozenset({
    'allocation_note',
    'password',
    'password_hash',
    'token',
    'secret',
    'otp',
    'notes',
})

PLATFORM_SCOPE_Q = (
    Q(action_type__startswith='platform_')
    | Q(action_type__startswith='maintenance_')
    | Q(action_type__startswith='admin_account_')
    | Q(action_type__startswith='faculty_account_')
    | Q(action_type__startswith='account_')
    | Q(action_type__startswith='institution_')
    | Q(action_type='admin_document_upload')
    | Q(action_type='audit_log_viewed')
)

MAX_VIEW_REASON_LEN = 500


def normalize_audit_scope(raw: str | None) -> str:
    value = (raw or 'platform').strip().lower()
    return 'all' if value == 'all' else 'platform'


def apply_audit_scope(queryset: QuerySet, scope: str | None) -> QuerySet:
    if normalize_audit_scope(scope) == 'all':
        return queryset
    return queryset.filter(PLATFORM_SCOPE_Q)


def sanitize_audit_details(details: Any) -> dict:
    """Return allowlisted metadata only; drop free-text and unknown keys."""
    if not isinstance(details, dict):
        return {}
    cleaned: dict[str, Any] = {}
    for key, value in details.items():
        key_str = str(key)
        lowered = key_str.lower()
        if lowered in BLOCKED_DETAIL_KEYS:
            continue
        if lowered not in SAFE_DETAIL_KEYS and not lowered.endswith('_count'):
            continue
        if isinstance(value, (dict, list)):
            if lowered == 'changes' and isinstance(value, list):
                cleaned[key_str] = [str(item) for item in value[:20]]
            continue
        if isinstance(value, bool) or value is None:
            cleaned[key_str] = value
        elif isinstance(value, (int, float)):
            cleaned[key_str] = value
        else:
            text = str(value).strip()
            if text:
                cleaned[key_str] = text[:240]
    return cleaned


def parse_view_reason(payload: Any) -> tuple[str | None, str | None]:
    """Return (reason, error). error is set when the reason is missing/invalid."""
    if not isinstance(payload, dict):
        return None, 'A reason is required to view audit details.'
    reason = str(payload.get('reason') or '').strip()
    if not reason:
        return None, 'A reason is required to view audit details.'
    if len(reason) > MAX_VIEW_REASON_LEN:
        reason = reason[:MAX_VIEW_REASON_LEN]
    return reason, None


def scrub_allocation_notes(details: Any) -> tuple[Any, bool]:
    """Remove allocation_note from a details dict. Returns (details, changed)."""
    if not isinstance(details, dict) or 'allocation_note' not in details:
        return details, False
    next_details = dict(details)
    note = next_details.pop('allocation_note', None)
    if note and 'has_allocation_note' not in next_details:
        next_details['has_allocation_note'] = True
    return next_details, True
