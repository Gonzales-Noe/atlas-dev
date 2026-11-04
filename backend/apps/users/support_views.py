"""Faculty problem reports: campus admin first, then the ATLAS team if the admin sends it on."""

import mimetypes

from django.http import FileResponse
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations.models import SupportReport, UserProfile, UserRole
from apps.users.notify import institution_people, notify_users
from apps.users.serializers import normalize_role

ADMIN_REPORTS = '/admin/issue-reports'
SUPERADMIN_REPORTS = '/superadmin/issue-reports'

ALLOWED_IMAGE_TYPES = {
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


def _person(user):
    name = (getattr(user, 'name', None) or '').strip()
    return name or user.email or 'A faculty member'


def _serialize(row):
    reporter = row.reporter
    return {
        'id': str(row.report_id),
        'message': row.message,
        'phone_note': row.phone_note or '',
        'has_image': bool(row.image),
        'status': row.status,
        'is_resolved': bool(row.is_resolved),
        'resolved_at': row.resolved_at.isoformat() if row.resolved_at else None,
        'faculty_name': _person(reporter) if reporter else 'A faculty member',
        'faculty_email': reporter.email if reporter else '',
        'campus': row.institution.name if row.institution_id and row.institution else '',
        'created_at': row.created_at.isoformat() if row.created_at else None,
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


class SupportReportListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

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
                {'detail': 'Only a faculty account can send a report from the app.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        message = str(request.data.get('message') or '').strip()
        if not message:
            return Response({'detail': 'Please tell us what happened.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(message) > 4000:
            message = message[:4000]
        phone_note = str(request.data.get('phone_note') or '').strip()[:300]
        image = request.FILES.get('image')
        image_error = _validate_image(image)
        if image_error:
            return Response({'detail': image_error}, status=status.HTTP_400_BAD_REQUEST)
        report = SupportReport.objects.create(
            reporter=request.user,
            institution_id=request.user.institution_id,
            message=message,
            phone_note=phone_note,
            image=image,
            status=SupportReport.STATUS_WITH_ADMIN,
        )
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
        if not report.image:
            return Response({'detail': 'This report has no screenshot.'}, status=status.HTTP_404_NOT_FOUND)
        content_type = mimetypes.guess_type(report.image.name)[0] or 'application/octet-stream'
        return FileResponse(report.image.open('rb'), content_type=content_type)


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
            report.is_resolved = True
            report.resolved_at = timezone.now()
            report.resolved_by = request.user
            report.save(update_fields=['is_resolved', 'resolved_at', 'resolved_by'])
            if report.reporter_id:
                notify_users(
                    [report.reporter],
                    kind='support_report_resolved',
                    title='Your issue report was marked resolved',
                    body='Campus support marked your report as resolved.',
                    href='',
                    dedupe_key=f'support-report-resolved:{report.report_id}',
                )
        elif not resolved and report.is_resolved:
            report.is_resolved = False
            report.resolved_at = None
            report.resolved_by = None
            report.save(update_fields=['is_resolved', 'resolved_at', 'resolved_by'])
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
