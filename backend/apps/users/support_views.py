"""Faculty problem reports: campus admin first, then the ATLAS team if the admin sends it on."""

import logging
import mimetypes

from datetime import timedelta

from django.core.files.base import ContentFile
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations.encryption import decrypt_bytes, encrypt_bytes, is_encrypted_bytes
from apps.integrations.models import SupportReport, UserProfile, UserRole
from apps.users.notify import institution_people, notify_users
from apps.users.serializers import normalize_role

logger = logging.getLogger(__name__)

ADMIN_REPORTS = '/admin/issue-reports'
SUPERADMIN_REPORTS = '/superadmin/issue-reports'
EDIT_WINDOW = timedelta(hours=24)

ALLOWED_IMAGE_TYPES = {
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
}
MAX_IMAGE_BYTES = 5 * 1024 * 1024

RESOLUTION_CATEGORIES = {
    'fixed': 'Fixed',
    'workaround': 'Workaround provided',
    'maintenance_planned': 'Maintenance update planned',
    'cannot_reproduce': 'Could not reproduce',
    'duplicate': 'Duplicate',
    'by_design': 'Working as designed',
    'other': 'Other',
}


def _person(user):
    name = (getattr(user, 'name', None) or '').strip()
    return name or user.email or 'A faculty member'


def _has_image(row):
    if row.image_blob is not None:
        try:
            if len(bytes(row.image_blob)) >= 32:
                return True
        except Exception:
            pass
    return bool(row.image)


def _can_edit_report(report):
    if report.is_resolved or not report.created_at:
        return False
    return timezone.now() <= report.created_at + EDIT_WINDOW


def _serialize(row):
    reporter = row.reporter
    return {
        'id': str(row.report_id),
        'message': row.message,
        'phone_note': row.phone_note or '',
        'has_image': _has_image(row),
        'status': row.status,
        'is_resolved': bool(row.is_resolved),
        'resolved_at': row.resolved_at.isoformat() if row.resolved_at else None,
        'resolution_category': row.resolution_category or '',
        'resolution_category_label': RESOLUTION_CATEGORIES.get(row.resolution_category or '', ''),
        'resolution_summary': row.resolution_summary or '',
        'resolution_details': row.resolution_details or '',
        'resolution_follow_up': row.resolution_follow_up or '',
        'can_edit': _can_edit_report(row),
        'faculty_name': _person(reporter) if reporter else 'A faculty member',
        'faculty_email': reporter.email if reporter else '',
        'campus': row.institution.name if row.institution_id and row.institution else '',
        'created_at': row.created_at.isoformat() if row.created_at else None,
        'updated_at': row.updated_at.isoformat() if getattr(row, 'updated_at', None) else None,
        'forwarded_at': row.forwarded_at.isoformat() if row.forwarded_at else None,
    }


def _can_view_report(user, report):
    role = normalize_role(user.role)
    if role == 'admin':
        return bool(user.institution_id and report.institution_id == user.institution_id)
    if role == 'superadmin':
        return report.status == SupportReport.STATUS_WITH_SUPERADMIN
    if role == 'faculty':
        return report.reporter_id == getattr(user, 'user_id', None) or report.reporter_id == user.pk
    return False


def _can_resolve_report(user, report):
    role = normalize_role(user.role)
    if role == 'superadmin':
        return report.status == SupportReport.STATUS_WITH_SUPERADMIN
    return False


def _open_queryset_for(user):
    role = normalize_role(user.role)
    if role == 'admin':
        if not user.institution_id:
            return SupportReport.objects.none()
        return SupportReport.objects.filter(
            institution_id=user.institution_id,
            is_resolved=False,
        )
    if role == 'superadmin':
        return SupportReport.objects.filter(
            status=SupportReport.STATUS_WITH_SUPERADMIN,
            is_resolved=False,
        )
    return SupportReport.objects.none()


def _validate_image(upload):
    if not upload:
        return 'Add a screenshot of the issue.'
    content_type = (getattr(upload, 'content_type', None) or '').lower().strip()
    name = (getattr(upload, 'name', None) or '').lower()
    if content_type not in ALLOWED_IMAGE_TYPES and not name.endswith(('.jpg', '.jpeg', '.png', '.webp')):
        return 'Use a JPEG, PNG, or WebP image.'
    size = getattr(upload, 'size', None)
    if size is not None and size > MAX_IMAGE_BYTES:
        return 'Keep the screenshot under 5 MB.'
    return ''


def _read_upload_bytes(upload):
    upload.seek(0)
    data = upload.read()
    if isinstance(data, memoryview):
        data = data.tobytes()
    elif isinstance(data, bytearray):
        data = bytes(data)
    return data or b''


def _resolve_image_mime(upload):
    mime = (getattr(upload, 'content_type', None) or '').lower().strip()
    if mime in ALLOWED_IMAGE_TYPES:
        return 'image/jpeg' if mime == 'image/jpg' else mime
    name = (getattr(upload, 'name', None) or '').lower()
    if name.endswith('.png'):
        return 'image/png'
    if name.endswith('.webp'):
        return 'image/webp'
    return 'image/jpeg'


def _image_filename(mime, upload_name=''):
    name = (upload_name or '').replace('\\', '/').split('/')[-1].strip()
    lower = name.lower()
    if lower.endswith(('.jpg', '.jpeg', '.png', '.webp')) and name:
        return name[:80]
    if mime == 'image/png':
        return 'screenshot.png'
    if mime == 'image/webp':
        return 'screenshot.webp'
    return 'screenshot.jpg'


def _attach_screenshot(report, raw, mime, upload_name=''):
    """Store screenshot in DB blob and on disk so either serve path can recover it.

    image_blob is stored as plaintext image bytes (endpoint is auth-gated).
    Sealed ATLASENC1 blobs are still accepted on read for older rows.
    Disk copy goes through EncryptedFileSystemStorage.
    """
    report.image_blob = bytes(raw)
    report.image_mime = mime
    filename = _image_filename(mime, upload_name)
    try:
        report.image.save(filename, ContentFile(raw), save=False)
    except Exception:
        logger.exception(
            'Could not save support report screenshot to disk; DB blob was still stored',
        )


def _decode_image_blob(raw):
    """Return plaintext image bytes from a DB blob, or None."""
    if not raw:
        return None
    data = bytes(raw)
    if len(data) < 32:
        return None
    if is_encrypted_bytes(data):
        try:
            return decrypt_bytes(data)
        except Exception:
            logger.exception('Could not decrypt support report image blob')
            return None
    # Plain JPEG/PNG/WebP (or other image bytes) stored after the plaintext fix.
    return data


def _image_payload(report):
    """Return (bytes, content_type) for a report screenshot, or (None, '')."""
    if report.image_blob:
        data = _decode_image_blob(report.image_blob)
        if data:
            mime = (report.image_mime or '').strip() or 'image/jpeg'
            return data, mime
        logger.warning(
            'Support report %s has image_blob but it could not be decoded (%s bytes)',
            report.report_id,
            len(bytes(report.image_blob)) if report.image_blob is not None else 0,
        )

    if report.image:
        try:
            report.image.open('rb')
            data = report.image.read()
            report.image.close()
        except Exception:
            logger.exception('Could not read support report image file %s', report.report_id)
            data = None
        if data and len(data) >= 32:
            # Disk storage may still hold sealed ATLASENC1 bytes if read bypassed decrypt.
            if is_encrypted_bytes(data):
                try:
                    data = decrypt_bytes(data)
                except Exception:
                    logger.exception(
                        'Could not decrypt support report image file bytes %s',
                        report.report_id,
                    )
                    data = None
            if data:
                mime = (
                    (report.image_mime or '').strip()
                    or mimetypes.guess_type(report.image.name)[0]
                    or 'image/jpeg'
                )
                return data, mime
    return None, ''


class SupportReportListView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        role = normalize_role(request.user.role)
        if role == 'admin':
            if not request.user.institution_id:
                return Response({'reports': [], 'open_count': 0})
            rows = SupportReport.objects.filter(
                institution_id=request.user.institution_id,
            ).select_related('reporter', 'institution')
        elif role == 'superadmin':
            rows = SupportReport.objects.filter(
                status=SupportReport.STATUS_WITH_SUPERADMIN,
            ).select_related('reporter', 'institution')
        elif role == 'faculty':
            rows = SupportReport.objects.filter(
                reporter=request.user,
            ).select_related('reporter', 'institution')
        else:
            return Response({'detail': 'Only a campus admin can open these reports.'}, status=status.HTTP_403_FORBIDDEN)
        reports = [_serialize(row) for row in rows[:100]]
        open_count = sum(1 for row in reports if not row['is_resolved'])
        if role in ('admin', 'superadmin'):
            open_count = _open_queryset_for(request.user).count()
        return Response({'reports': reports, 'open_count': open_count})

    def post(self, request):
        if normalize_role(request.user.role) != 'faculty':
            return Response(
                {'detail': 'Only a faculty account can send a report.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        message = str(request.data.get('message') or '').strip()
        if not message:
            return Response({'detail': 'Please tell us what happened.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(message) > 4000:
            message = message[:4000]
        phone_note = str(request.data.get('phone_note') or '').strip()[:300]
        image = request.FILES.get('image') or request.FILES.get('screenshot')
        image_error = _validate_image(image)
        if image_error:
            return Response({'detail': image_error}, status=status.HTTP_400_BAD_REQUEST)

        raw = _read_upload_bytes(image)
        if not raw:
            return Response({'detail': 'Add a screenshot of the issue.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(raw) > MAX_IMAGE_BYTES:
            return Response({'detail': 'Keep the screenshot under 5 MB.'}, status=status.HTTP_400_BAD_REQUEST)

        mime = _resolve_image_mime(image)
        report = SupportReport(
            reporter=request.user,
            institution_id=request.user.institution_id,
            message=message,
            phone_note=phone_note,
            status=SupportReport.STATUS_WITH_ADMIN,
        )
        _attach_screenshot(report, raw, mime, getattr(image, 'name', '') or '')
        report.save()
        admins = institution_people(request.user.institution_id, [UserRole.ADMIN])
        who = _person(request.user)
        preview = message if len(message) <= 180 else f'{message[:177]}...'
        if admins:
            notify_users(
                admins,
                kind='support_report',
                title='A faculty member reported a problem',
                body=f'{who}: {preview}',
                href=ADMIN_REPORTS,
                dedupe_key=f'support-report:{report.report_id}',
            )
        else:
            report.status = SupportReport.STATUS_WITH_SUPERADMIN
            report.forwarded_at = timezone.now()
            report.save(update_fields=['status', 'forwarded_at'])
            _notify_superadmins(report, who, preview, sent_by_campus=False)
        payload = _serialize(report)
        payload['delivered_to'] = 'admin' if admins else 'superadmin'
        return Response(payload, status=status.HTTP_201_CREATED)


class SupportReportSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        role = normalize_role(request.user.role)
        if role not in ('admin', 'superadmin'):
            return Response({'open_count': 0})
        return Response({'open_count': _open_queryset_for(request.user).count()})


class SupportReportImageView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, report_id):
        try:
            report = SupportReport.objects.select_related('reporter', 'institution').get(report_id=report_id)
        except SupportReport.DoesNotExist:
            return Response({'detail': 'That report was not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not _can_view_report(request.user, report):
            return Response({'detail': 'That report was not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not _has_image(report):
            return Response({'detail': 'This report has no screenshot.'}, status=status.HTTP_404_NOT_FOUND)

        data, content_type = _image_payload(report)
        if not data:
            return Response(
                {'detail': 'This screenshot file is missing. Ask the faculty member to send the report again.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        response = HttpResponse(data, content_type=content_type or 'image/jpeg')
        response['Content-Length'] = str(len(data))
        response['Cache-Control'] = 'private, max-age=300'
        response['Content-Disposition'] = 'inline'
        return response


class SupportReportDetailView(APIView):
    """Faculty can patch their own report within 24 hours (even if escalated)."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request, report_id):
        if normalize_role(request.user.role) != 'faculty':
            return Response({'detail': 'Only the faculty who sent this report can edit it.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            report = SupportReport.objects.select_related('reporter', 'institution').get(
                report_id=report_id,
                reporter=request.user,
            )
        except SupportReport.DoesNotExist:
            return Response({'detail': 'That report was not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not _can_edit_report(report):
            return Response(
                {'detail': 'This report can only be edited within 24 hours, and not after it is resolved.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        message = request.data.get('message', None)
        if message is not None:
            message = str(message).strip()
            if not message:
                return Response({'detail': 'Please tell us what happened.'}, status=status.HTTP_400_BAD_REQUEST)
            if len(message) > 4000:
                message = message[:4000]
            report.message = message

        if 'phone_note' in request.data:
            report.phone_note = str(request.data.get('phone_note') or '').strip()[:300]

        image = request.FILES.get('image') or request.FILES.get('screenshot')
        if image is not None:
            image_error = _validate_image(image)
            if image_error:
                return Response({'detail': image_error}, status=status.HTTP_400_BAD_REQUEST)
            raw = _read_upload_bytes(image)
            if not raw:
                return Response({'detail': 'Add a screenshot of the issue.'}, status=status.HTTP_400_BAD_REQUEST)
            if len(raw) > MAX_IMAGE_BYTES:
                return Response({'detail': 'Keep the screenshot under 5 MB.'}, status=status.HTTP_400_BAD_REQUEST)
            mime = _resolve_image_mime(image)
            _attach_screenshot(report, raw, mime, getattr(image, 'name', '') or '')

        report.save()
        return Response(_serialize(report))


class SupportReportResolveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, report_id):
        try:
            report = SupportReport.objects.select_related('reporter', 'institution').get(report_id=report_id)
        except SupportReport.DoesNotExist:
            return Response({'detail': 'That report was not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not _can_resolve_report(request.user, report):
            return Response({'detail': 'That report was not found.'}, status=status.HTTP_404_NOT_FOUND)

        resolved_raw = request.data.get('resolved', True)
        if isinstance(resolved_raw, str):
            resolved = resolved_raw.strip().lower() in ('1', 'true', 'yes', 'on')
        else:
            resolved = bool(resolved_raw)

        if resolved and not report.is_resolved:
            category = str(request.data.get('resolution_category') or '').strip()
            summary = str(request.data.get('resolution_summary') or '').strip()
            details = str(request.data.get('resolution_details') or '').strip()
            follow_up = str(request.data.get('resolution_follow_up') or '').strip()
            if category not in RESOLUTION_CATEGORIES:
                return Response(
                    {'detail': 'Choose how this issue was resolved (for example Fixed or Maintenance update planned).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not summary:
                return Response(
                    {'detail': 'Add a short resolution summary.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            report.is_resolved = True
            report.resolved_at = timezone.now()
            report.resolved_by = request.user
            report.resolution_category = category
            report.resolution_summary = summary[:300]
            report.resolution_details = details[:4000]
            report.resolution_follow_up = follow_up[:300]
            report.save(update_fields=[
                'is_resolved', 'resolved_at', 'resolved_by',
                'resolution_category', 'resolution_summary', 'resolution_details', 'resolution_follow_up',
            ])
            preview = summary if len(summary) <= 160 else f'{summary[:157]}...'
            if report.reporter_id:
                notify_users(
                    [report.reporter],
                    kind='support_report_resolved',
                    title='Your issue report was marked resolved',
                    body=preview,
                    href='',
                    dedupe_key=f'support-report-resolved:{report.report_id}',
                )
        elif not resolved and report.is_resolved:
            report.is_resolved = False
            report.resolved_at = None
            report.resolved_by = None
            report.resolution_category = ''
            report.resolution_summary = ''
            report.resolution_details = ''
            report.resolution_follow_up = ''
            report.save(update_fields=[
                'is_resolved', 'resolved_at', 'resolved_by',
                'resolution_category', 'resolution_summary', 'resolution_details', 'resolution_follow_up',
            ])
            if report.reporter_id:
                notify_users(
                    [report.reporter],
                    kind='support_report_reopened',
                    title='Your issue report was reopened',
                    body='Campus support marked your report as open again.',
                    href='',
                    dedupe_key=f'support-report-reopened:{report.report_id}:{int(timezone.now().timestamp())}',
                )

        return Response(_serialize(report))


class SupportReportForwardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, report_id):
        if normalize_role(request.user.role) != 'admin':
            return Response(
                {'detail': 'Only a campus admin can send a report to the ATLAS team.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            report = SupportReport.objects.select_related('reporter', 'institution').get(
                report_id=report_id,
                institution_id=request.user.institution_id,
            )
        except SupportReport.DoesNotExist:
            return Response({'detail': 'That report was not found.'}, status=status.HTTP_404_NOT_FOUND)
        if report.status == SupportReport.STATUS_WITH_SUPERADMIN:
            return Response(_serialize(report))
        report.status = SupportReport.STATUS_WITH_SUPERADMIN
        report.forwarded_at = timezone.now()
        report.forwarded_by = request.user
        report.save(update_fields=['status', 'forwarded_at', 'forwarded_by'])
        who = _person(report.reporter) if report.reporter_id else 'A faculty member'
        preview = report.message if len(report.message) <= 180 else f'{report.message[:177]}...'
        _notify_superadmins(report, who, preview, sent_by_campus=True)
        return Response(_serialize(report))


def _notify_superadmins(report, faculty_name, preview, *, sent_by_campus):
    people = list(UserProfile.objects.filter(is_active=True, role=UserRole.SUPERADMIN))
    title = (
        'A campus admin sent you a faculty report'
        if sent_by_campus
        else 'A faculty member reported a problem'
    )
    notify_users(
        people,
        kind='support_report',
        title=title,
        body=f'{faculty_name}: {preview}',
        href=SUPERADMIN_REPORTS,
        dedupe_key=f'support-report-up:{report.report_id}',
    )
