"""Public ATLAS Mobile APK metadata/download and superadmin publish."""

import logging
import os
import re
import threading

from django.core.files.move import file_move_safe
from django.core.files.uploadedfile import TemporaryUploadedFile
from django.db import close_old_connections
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations.models import MobileAppRelease, UserProfile
from apps.users.notify import notify_mobile_app_updated
from apps.users.serializers import normalize_role

logger = logging.getLogger(__name__)

APK_CONTENT_TYPE = 'application/vnd.android.package-archive'
MAX_APK_BYTES = 200 * 1024 * 1024
VERSION_NAME_RE = re.compile(r'^[0-9A-Za-z][0-9A-Za-z._+-]{0,39}$')
APK_STORAGE_NAME = 'mobile/atlas-mobile.apk'


def _notify_faculty_async(version_name, release_notes):
    """Faculty alerts after the APK is live — do not block the publish HTTP response."""
    close_old_connections()
    try:
        notify_mobile_app_updated(version_name, release_notes)
    except Exception:
        logger.exception('Faculty were not notified about the mobile app update')
    finally:
        close_old_connections()


def _store_apk(row, upload):
    """
    Put the uploaded APK into media storage.

    Large multipart uploads already land as TemporaryUploadedFile on disk; prefer a
    fast filesystem move/copy, then fall back to FileField.save if that fails.
    """
    import shutil

    if row.apk:
        try:
            row.apk.delete(save=False)
        except Exception:
            logger.debug('Previous APK could not be deleted', exc_info=True)

    if isinstance(upload, TemporaryUploadedFile):
        try:
            storage = row.apk.storage
            # Prefer the stable name; old file was deleted above.
            if storage.exists(APK_STORAGE_NAME):
                storage.delete(APK_STORAGE_NAME)
            dest_path = storage.path(APK_STORAGE_NAME)
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            src = upload.temporary_file_path()
            try:
                # Same-volume rename when possible.
                file_move_safe(src, dest_path, allow_overwrite=True)
                try:
                    upload.file.delete = False
                except Exception:
                    pass
            except OSError:
                # Cross-device or locked tempfile — copy while the upload handle is valid.
                shutil.copyfile(src, dest_path)
            row.apk.name = APK_STORAGE_NAME
            return
        except Exception:
            logger.exception('Fast APK place failed; falling back to FileField.save')

    row.apk.save('atlas-mobile.apk', upload, save=False)


def _is_superadmin(request):
    user = getattr(request, 'user', None)
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    return normalize_role(getattr(user, 'role', '')) == 'superadmin'


def _file_size_label(nbytes):
    try:
        size = int(nbytes or 0)
    except (TypeError, ValueError):
        size = 0
    if size <= 0:
        return ''
    if size < 1024:
        return f'{size} B'
    if size < 1024 * 1024:
        return f'{size / 1024:.1f} KB'
    return f'{size / (1024 * 1024):.0f} MB'


def _current_release():
    return MobileAppRelease.objects.filter(pk=1).first()


def release_payload(request, row=None):
    row = row if row is not None else _current_release()
    available = bool(row and row.apk and row.version_name)
    download_url = ''
    if available and request is not None:
        download_url = request.build_absolute_uri('/api/auth/mobile-app/download/')
    return {
        'available': available,
        'version_name': (row.version_name if row else '') or '',
        'version_code': int(row.version_code) if row else 0,
        'release_notes': (row.release_notes if row else '') or '',
        'file_size_bytes': int(row.file_size_bytes) if row else 0,
        'file_size_label': _file_size_label(row.file_size_bytes if row else 0),
        'published_at': row.published_at.isoformat() if row and row.published_at else None,
        'download_url': download_url,
    }


class MobileAppView(APIView):
    """GET: public metadata. POST: publish APK. PATCH: edit What’s New text only."""

    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        if self.request.method == 'GET':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get(self, request):
        return Response(release_payload(request))

    def patch(self, request):
        """Update release notes for the current build without replacing the APK."""
        if not _is_superadmin(request):
            return Response({'detail': 'Only the IT superadmin can edit ATLAS Mobile.'}, status=status.HTTP_403_FORBIDDEN)

        row = _current_release()
        if not row or not row.apk or not row.version_name:
            return Response(
                {'detail': 'Publish an APK first. What’s New can be edited after a build is live.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if 'release_notes' not in request.data:
            return Response({'detail': 'Send release_notes to update What’s New.'}, status=status.HTTP_400_BAD_REQUEST)

        row.release_notes = str(request.data.get('release_notes') or '').strip()[:2000]
        row.save(update_fields=['release_notes'])
        return Response(release_payload(request, row), status=status.HTTP_200_OK)

    def post(self, request):
        if not _is_superadmin(request):
            return Response({'detail': 'Only the IT superadmin can publish ATLAS Mobile.'}, status=status.HTTP_403_FORBIDDEN)

        upload = request.FILES.get('apk')
        if upload is None:
            return Response({'detail': 'Choose an APK file to publish.'}, status=status.HTTP_400_BAD_REQUEST)

        name = (getattr(upload, 'name', '') or '').lower()
        content_type = (getattr(upload, 'content_type', '') or '').lower()
        if not (name.endswith('.apk') or content_type in {
            APK_CONTENT_TYPE,
            'application/octet-stream',
            'application/java-archive',
        }):
            return Response({'detail': 'Upload a .apk file.'}, status=status.HTTP_400_BAD_REQUEST)

        size = int(getattr(upload, 'size', 0) or 0)
        if size <= 0:
            return Response({'detail': 'The APK file is empty.'}, status=status.HTTP_400_BAD_REQUEST)
        if size > MAX_APK_BYTES:
            return Response(
                {'detail': f'The APK is too large (max {_file_size_label(MAX_APK_BYTES)}).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        version_name = str(request.data.get('version_name') or '').strip()
        if not version_name or not VERSION_NAME_RE.match(version_name):
            return Response(
                {'detail': 'Enter a version like 1.0.0 (letters, numbers, dots, dashes).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            version_code = int(str(request.data.get('version_code') or '0').strip() or '0')
        except (TypeError, ValueError):
            return Response({'detail': 'Version code must be a whole number.'}, status=status.HTTP_400_BAD_REQUEST)
        if version_code < 1:
            return Response({'detail': 'Version code must be 1 or higher.'}, status=status.HTTP_400_BAD_REQUEST)

        release_notes = str(request.data.get('release_notes') or '').strip()[:2000]

        row, _created = MobileAppRelease.objects.get_or_create(pk=1)
        try:
            _store_apk(row, upload)
            row.version_name = version_name
            row.version_code = version_code
            row.release_notes = release_notes
            row.file_size_bytes = size
            row.published_at = timezone.now()
            profile = UserProfile.objects.filter(pk=getattr(request.user, 'pk', None)).first()
            row.published_by = profile
            row.save()
        except Exception:
            logger.exception('ATLAS Mobile APK publish failed while saving')
            return Response(
                {
                    'detail': (
                        'The server could not save the APK. '
                        'Check VPS disk space under /opt/atlas media, then try again.'
                    ),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Respond as soon as the APK is on disk; faculty alerts run in the background.
        threading.Thread(
            target=_notify_faculty_async,
            args=(version_name, release_notes),
            daemon=True,
        ).start()

        return Response(release_payload(request, row), status=status.HTTP_200_OK)


class MobileAppDownloadView(APIView):
    """Public APK download for QR scans and the Download button."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        row = _current_release()
        if not row or not row.apk:
            raise Http404('ATLAS Mobile is not available yet.')
        path = row.apk.path
        if not path or not os.path.isfile(path):
            raise Http404('ATLAS Mobile is not available yet.')
        handle = open(path, 'rb')
        response = FileResponse(
            handle,
            as_attachment=True,
            filename='ATLAS-Mobile.apk',
            content_type=APK_CONTENT_TYPE,
        )
        response['Content-Length'] = str(row.file_size_bytes or os.path.getsize(path))
        response['Cache-Control'] = 'private, max-age=300'
        return response
