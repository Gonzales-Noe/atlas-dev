"""Superadmin controls for brand color, maintenance, host health, and platform audit."""

import logging
from datetime import timedelta

from django.core.cache import cache
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations.models import AuditLog, PlatformSettings
from apps.users.brand import (
    DEFAULT_MAINTENANCE_MESSAGE,
    cached_maintenance,
    normalize_hex,
    remember_maintenance,
    theme_payload,
)
from apps.users.serializers import normalize_role
from apps.users.system_health import activity_by_day, collect_snapshot

logger = logging.getLogger(__name__)


def _is_superadmin(request):
    user = getattr(request, 'user', None)
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    return normalize_role(getattr(user, 'role', '')) == 'superadmin'


def parse_scheduled_start(value):
    """A coming-soon notice has to start on a later calendar day, never today."""
    if value in (None, ''):
        return None
    if hasattr(value, 'tzinfo'):
        parsed = value
    else:
        parsed = parse_datetime(str(value).replace('Z', '+00:00'))
        if parsed is None:
            raise ValueError('Enter a valid date and time.')
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    if timezone.localtime(parsed).date() <= timezone.localdate():
        raise ValueError('Schedule the notice for a later day. It cannot start today.')
    return parsed


def _settings_row():
    try:
        return PlatformSettings.objects.filter(pk=1).first()
    except Exception:
        logger.warning('Platform settings could not be read', exc_info=True)
        return None


class PlatformThemeView(APIView):
    """Public read so sign-in and the landing page can use the institution color."""

    def get_permissions(self):
        if self.request.method == 'GET':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get(self, request):
        return Response(theme_payload(_settings_row()))

    def patch(self, request):
        if not _is_superadmin(request):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        row = _settings_row()
        if row is None:
            row = PlatformSettings(settings_id=1)
        changed = []

        if 'brand_primary' in request.data:
            try:
                row.brand_primary = normalize_hex(request.data.get('brand_primary'))
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            changed.append('brand')

        if 'maintenance_enabled' in request.data:
            row.maintenance_enabled = bool(request.data.get('maintenance_enabled'))
            changed.append('maintenance')

        if 'maintenance_message' in request.data:
            message = str(request.data.get('maintenance_message') or '').strip()
            if len(message) > 500:
                return Response(
                    {'detail': 'Maintenance message must be 500 characters or fewer.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            row.maintenance_message = message or DEFAULT_MAINTENANCE_MESSAGE
            changed.append('maintenance')

        if 'maintenance_notice_enabled' in request.data or 'maintenance_scheduled_for' in request.data:
            notice_on = bool(request.data.get(
                'maintenance_notice_enabled',
                getattr(row, 'maintenance_notice_enabled', False),
            ))
            if 'maintenance_scheduled_for' in request.data:
                try:
                    scheduled = parse_scheduled_start(request.data.get('maintenance_scheduled_for'))
                except ValueError as exc:
                    return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            else:
                scheduled = getattr(row, 'maintenance_scheduled_for', None)
            if notice_on:
                try:
                    scheduled = parse_scheduled_start(scheduled)
                except ValueError as exc:
                    return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
                if scheduled is None:
                    return Response(
                        {'detail': 'Choose a start time on a later day before showing the banner.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            row.maintenance_notice_enabled = notice_on
            row.maintenance_scheduled_for = scheduled
            changed.append('maintenance')

        if not changed:
            return Response(
                {'detail': 'Send a brand color or a maintenance change.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            row.save()
        except Exception:
            logger.exception('Platform settings could not be saved')
            return Response(
                {'detail': 'Settings could not be saved. Apply the latest database migration and try again.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        payload = theme_payload(row)
        remember_maintenance(payload)
        kinds = list(dict.fromkeys(changed))
        details = {'changes': kinds}
        if 'brand' in kinds:
            details['brand_primary'] = row.brand_primary
        if 'maintenance' in kinds:
            details['maintenance_enabled'] = row.maintenance_enabled
            details['maintenance_notice_enabled'] = row.maintenance_notice_enabled
            if row.maintenance_scheduled_for:
                details['maintenance_scheduled_for'] = row.maintenance_scheduled_for.isoformat()
        if kinds == ['brand']:
            action = 'platform_theme_updated'
        elif 'brand' not in kinds:
            action = 'maintenance_mode_changed'
        else:
            action = 'platform_settings_updated'
        AuditLog.objects.create(
            user=request.user,
            action_type=action,
            resource_type='Platform',
            details=details,
        )
        return Response(payload)


class SystemHealthView(APIView):
    def get(self, request):
        if not _is_superadmin(request):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        payload = collect_snapshot(measure_cpu=True)
        theme = theme_payload(_settings_row())
        payload['maintenance_enabled'] = theme['maintenance_enabled']
        payload['maintenance_message'] = theme['maintenance_message']
        payload['maintenance_notice_enabled'] = theme['maintenance_notice_enabled']
        payload['maintenance_scheduled_for'] = theme['maintenance_scheduled_for']
        payload['activity'] = activity_by_day(14)
        return Response(payload)


class PlatformAuditView(APIView):
    """Audit events for every institution. Institution admins keep their own scoped list."""

    def get(self, request):
        if not _is_superadmin(request):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        query = (request.query_params.get('q') or '').strip()[:120]
        action = (request.query_params.get('action') or '').strip()[:100]
        try:
            page = max(int(request.query_params.get('page') or 1), 1)
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.query_params.get('page_size') or 25)
        except (TypeError, ValueError):
            page_size = 25
        page_size = min(max(page_size, 1), 100)

        logs = AuditLog.objects.select_related('user', 'user__institution').order_by('-timestamp')
        if action:
            logs = logs.filter(action_type=action)
        if query:
            logs = logs.filter(
                Q(action_type__icontains=query)
                | Q(resource_type__icontains=query)
                | Q(user__email__icontains=query)
                | Q(user__full_name__icontains=query)
                | Q(user__institution__name__icontains=query)
            )

        total = logs.count()
        start = (page - 1) * page_size
        page_logs = logs[start:start + page_size]
        since = timezone.now() - timedelta(hours=24)
        actions = list(
            AuditLog.objects.values('action_type')
            .annotate(count=Count('log_id'))
            .order_by('-count')[:8]
        )
        return Response({
            'success': True,
            'count': total,
            'page': page,
            'page_size': page_size,
            'summary': {
                'total': AuditLog.objects.count(),
                'last_24h': AuditLog.objects.filter(timestamp__gte=since).count(),
            },
            'actions': [
                {'action': row['action_type'] or 'Unknown', 'count': row['count']}
                for row in actions
            ],
            'daily': activity_by_day(14),
            'logs': [_audit_row(log) for log in page_logs],
        })


def _role_label(user):
    if user is None:
        return 'Unknown'
    role = normalize_role(getattr(user, 'role', ''))
    return {
        'superadmin': 'Superadmin',
        'admin': 'Admin',
        'faculty': 'Faculty',
        'student': 'Student',
    }.get(role, 'Faculty')


def _audit_row(log):
    user = log.user if log.user_id else None
    institution = ''
    if user is not None and user.institution_id and user.institution:
        institution = user.institution.name
    return {
        'log_id': str(log.log_id),
        'timestamp': log.timestamp.isoformat() if log.timestamp else None,
        'user': (user.full_name or user.email) if user else 'Unknown user',
        'email': user.email if user else '',
        'role': _role_label(user),
        'institution': institution or 'Platform',
        'action': log.action_type,
        'resource_type': log.resource_type or '',
        'resource_id': str(log.resource_id) if log.resource_id else None,
        'details': log.details or {},
    }


def maintenance_state():
    cached = cached_maintenance()
    if cached is not None:
        return cached
    row = _settings_row()
    payload = theme_payload(row)
    state = {
        'enabled': payload['maintenance_enabled'],
        'message': payload['maintenance_message'],
    }
    try:
        remember_maintenance(payload)
    except Exception:
        cache.set('platform:maintenance', state, timeout=15)
    return state
