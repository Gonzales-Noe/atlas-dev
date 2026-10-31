"""Inbox and browser push subscription for the signed-in user."""

import logging

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations.models import Notification, PushSubscription
from apps.users.notify import vapid_public_key

logger = logging.getLogger(__name__)


def _serialize(row):
    return {
        'id': str(row.notification_id),
        'kind': row.kind,
        'title': row.title,
        'body': row.body,
        'href': row.href or '',
        'read': row.read_at is not None,
        'created_at': row.created_at.isoformat() if row.created_at else None,
    }


class NotificationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        rows = list(
            Notification.objects.filter(recipient=request.user).order_by('-created_at')[:50]
        )
        unread = Notification.objects.filter(recipient=request.user, read_at__isnull=True).count()
        return Response({
            'unread_count': unread,
            'notifications': [_serialize(row) for row in rows],
        })


class NotificationReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from django.utils import timezone

        mark_all = bool(request.data.get('all'))
        raw_ids = request.data.get('ids') or []
        queryset = Notification.objects.filter(recipient=request.user, read_at__isnull=True)
        if not mark_all:
            if not isinstance(raw_ids, list) or not raw_ids:
                return Response({'detail': 'Send ids or all: true.'}, status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(notification_id__in=raw_ids[:50])
        updated = queryset.update(read_at=timezone.now())
        unread = Notification.objects.filter(recipient=request.user, read_at__isnull=True).count()
        return Response({'updated': updated, 'unread_count': unread})


class PushKeyView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            row = vapid_public_key()
        except Exception:
            logger.exception('Push key could not be prepared')
            return Response(
                {'detail': 'Desktop alerts are not available on this server yet.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({'public_key': row.public_key})


class PushSubscribeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        endpoint = str(request.data.get('endpoint') or '').strip()
        keys = request.data.get('keys') if isinstance(request.data.get('keys'), dict) else {}
        p256dh = str(keys.get('p256dh') or '').strip()
        auth = str(keys.get('auth') or '').strip()
        if not endpoint or not p256dh or not auth:
            return Response(
                {'detail': 'A push subscription needs an endpoint and keys.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(endpoint) > 2000 or len(p256dh) > 255 or len(auth) > 255:
            return Response({'detail': 'That push subscription is not valid.'}, status=status.HTTP_400_BAD_REQUEST)
        agent = str(request.META.get('HTTP_USER_AGENT') or '')[:300]
        PushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={
                'user': request.user,
                'p256dh': p256dh,
                'auth': auth,
                'user_agent': agent,
            },
        )
        return Response({'subscribed': True})

    def delete(self, request):
        endpoint = str(request.data.get('endpoint') or '').strip()
        queryset = PushSubscription.objects.filter(user=request.user)
        if endpoint:
            queryset = queryset.filter(endpoint=endpoint)
        deleted, _details = queryset.delete()
        return Response({'removed': deleted})
