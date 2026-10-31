"""Create in-app alerts and deliver them with Web Push when a browser is subscribed."""

import base64
import json
import logging
import sys
import threading

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.integrations.models import (
    CourseFile,
    GlobalDocument,
    Notification,
    PushSubscription,
    UserProfile,
    UserRole,
    WebPushConfig,
)

logger = logging.getLogger(__name__)

FACULTY_HOME = '/faculty/dashboard'
ADMIN_HOME = '/admin/dashboard'
ADMIN_STRUCTURE = '/admin/academic-structure'
ADMIN_KNOWLEDGE = '/admin/knowledge-base'
ADMIN_AUDIT = '/admin/audit-logs'
SUPERADMIN_HEALTH = '/superadmin/system-management'

MAINTENANCE_LINKS = {
    UserRole.SUPERADMIN: SUPERADMIN_HEALTH,
    'superadmin': SUPERADMIN_HEALTH,
    'super_admin': SUPERADMIN_HEALTH,
    UserRole.ADMIN: ADMIN_HOME,
    UserRole.FACULTY: FACULTY_HOME,
}

PLATFORM_ROLES = (
    UserRole.FACULTY,
    UserRole.ADMIN,
    UserRole.SUPERADMIN,
    'superadmin',
    'super_admin',
)


def format_when(value):
    if value is None:
        return ''
    local = timezone.localtime(value)
    hour = local.strftime('%I').lstrip('0') or '12'
    return f"{local.strftime('%b')} {local.day}, {local.year} {hour}:{local.strftime('%M %p')}"


def active_people():
    return list(UserProfile.objects.filter(is_active=True, role__in=PLATFORM_ROLES))


def institution_people(institution_id, roles):
    if not institution_id:
        return []
    return list(
        UserProfile.objects.filter(
            is_active=True,
            institution_id=institution_id,
            role__in=roles,
        )
    )


def notify_users(recipients, *, kind, title, body, href='', href_for_role=None, dedupe_key=''):
    """Save one alert per person. Failures stay inside this call so the main action still succeeds."""
    try:
        with transaction.atomic():
            created = _create_rows(
                recipients,
                kind=kind,
                title=title,
                body=body,
                href=href,
                href_for_role=href_for_role,
                dedupe_key=dedupe_key,
            )
        ids = [row.pk for row in created if row.pk]
        if ids:
            transaction.on_commit(lambda: _deliver(ids))
        return created
    except Exception:
        logger.exception('Could not save notifications')
        return []


def _create_rows(recipients, *, kind, title, body, href, href_for_role, dedupe_key):
    seen = set()
    users = []
    for user in recipients:
        if user is None or not getattr(user, 'is_active', True) or not getattr(user, 'pk', None):
            continue
        if user.pk in seen:
            continue
        seen.add(user.pk)
        users.append(user)
    if not users:
        return []

    title = (title or 'ATLAS')[:180]
    body = (body or '')[:2000]
    href = (href or '')[:300]
    dedupe_key = (dedupe_key or '')[:180]
    kind = (kind or 'notice')[:40]

    if dedupe_key:
        already = set(
            Notification.objects.filter(recipient_id__in=seen, dedupe_key=dedupe_key)
            .values_list('recipient_id', flat=True)
        )
        users = [user for user in users if user.pk not in already]
    if not users:
        return []

    created = []
    for user in users:
        link = href
        if href_for_role:
            link = (href_for_role.get(user.role) or href or '')[:300]
        row = Notification(
            recipient=user,
            kind=kind,
            title=title,
            body=body,
            href=link,
            dedupe_key=dedupe_key,
        )
        try:
            with transaction.atomic():
                row.save()
        except IntegrityError:
            continue
        created.append(row)
    return created


def _should_push():
    if 'test' in sys.argv:
        return False
    return not getattr(settings, 'NOTIFICATIONS_PUSH_DISABLED', False)


def _deliver(ids):
    if not ids or not _should_push():
        return
    threading.Thread(target=_push_ids, args=(list(ids),), daemon=True).start()


def _push_subject():
    email = (getattr(settings, 'DEFAULT_FROM_EMAIL', '') or '').strip()
    if '@' in email:
        address = email.split('<')[-1].split('>')[0].strip()
        if '@' in address:
            return f'mailto:{address}'
    return 'mailto:no-reply@atlas.local'


def _generate_vapid_keys():
    """Build a VAPID key pair. py_vapid's generator breaks on current cryptography."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    private_key = ec.generate_private_key(ec.SECP256R1())
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode('utf-8')
    raw = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    public = base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')
    return public, private_pem


def _vapid_signer(private_pem):
    from py_vapid import Vapid

    pem = private_pem if isinstance(private_pem, bytes) else private_pem.encode('utf-8')
    return Vapid.from_pem(pem)


def vapid_public_key():
    row = WebPushConfig.objects.filter(pk=1).first()
    if row and row.public_key and row.private_key:
        return row
    public, private = _generate_vapid_keys()
    row, _created = WebPushConfig.objects.update_or_create(
        pk=1,
        defaults={
            'public_key': public,
            'private_key': private,
            'subject': _push_subject(),
        },
    )
    return row


def _push_ids(ids):
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning('pywebpush is not installed; in-app alerts were saved without browser delivery')
        return
    try:
        config = vapid_public_key()
    except Exception:
        logger.exception('Web Push keys are not available')
        return

    rows = list(Notification.objects.filter(pk__in=ids).select_related('recipient'))
    if not rows:
        return
    recipient_ids = {row.recipient_id for row in rows}
    subscriptions = list(PushSubscription.objects.filter(user_id__in=recipient_ids))
    by_user = {}
    for subscription in subscriptions:
        by_user.setdefault(subscription.user_id, []).append(subscription)

    for row in rows:
        payload = json.dumps({
            'title': row.title,
            'body': row.body,
            'url': row.href or '/',
            'tag': str(row.notification_id),
        })
        for subscription in by_user.get(row.recipient_id, []):
            _send_one(webpush, WebPushException, config, subscription, payload)


def _send_one(webpush, web_push_exception, config, subscription, payload):
    info = {
        'endpoint': subscription.endpoint,
        'keys': {'p256dh': subscription.p256dh, 'auth': subscription.auth},
    }
    kwargs = {
        'subscription_info': info,
        'data': payload,
        'vapid_private_key': _vapid_signer(config.private_key),
        'vapid_claims': {'sub': config.subject or _push_subject()},
        'ttl': 60 * 60 * 12,
        'timeout': 8,
    }
    try:
        try:
            webpush(**kwargs)
        except TypeError:
            kwargs.pop('timeout', None)
            webpush(**kwargs)
    except web_push_exception as exc:
        status_code = getattr(getattr(exc, 'response', None), 'status_code', None)
        if status_code in (404, 410):
            PushSubscription.objects.filter(pk=subscription.pk).delete()
        else:
            logger.warning('Web push failed for %s: %s', subscription.pk, exc)
    except Exception:
        logger.exception('Web push failed')


def notify_maintenance_scheduled(start, end, message='', dedupe_suffix=''):
    body = (
        f'ATLAS will pause from {format_when(start)} until {format_when(end)}. '
        'Save your work before then.'
    )
    extra = (message or '').strip()
    if extra:
        body = f'{body} {extra}'
    suffix = dedupe_suffix or f'{start.isoformat()}:{end.isoformat()}'
    notify_users(
        active_people(),
        kind='maintenance_scheduled',
        title='Maintenance is scheduled',
        body=body,
        href_for_role=MAINTENANCE_LINKS,
        dedupe_key=f'maintenance-scheduled:{suffix}'[:180],
    )


def notify_maintenance_started(message='', start=None, end=None):
    text = (message or '').strip() or 'ATLAS is briefly unavailable while the IT team performs maintenance.'
    if start and end:
        text = f'Maintenance is underway until {format_when(end)}. {text}'
        dedupe = f'maintenance-started:{start.isoformat()}:{end.isoformat()}'
    else:
        text = f'Maintenance is underway. {text}'
        dedupe = f'maintenance-manual-on:{timezone.now().isoformat()}'
    notify_users(
        active_people(),
        kind='maintenance_started',
        title='Maintenance is underway',
        body=text,
        href_for_role=MAINTENANCE_LINKS,
        dedupe_key=dedupe[:180],
    )


def notify_maintenance_ended():
    notify_users(
        active_people(),
        kind='maintenance_ended',
        title='Maintenance is finished',
        body='ATLAS is available again. You can continue where you left off.',
        href_for_role=MAINTENANCE_LINKS,
        dedupe_key=f'maintenance-ended:{timezone.now().isoformat()}',
    )


def notify_maintenance_cancelled(start, end):
    notify_users(
        active_people(),
        kind='maintenance_cancelled',
        title='Scheduled maintenance was cancelled',
        body=f'The maintenance window from {format_when(start)} until {format_when(end)} was cancelled.',
        href_for_role=MAINTENANCE_LINKS,
        dedupe_key=f'maintenance-cancelled:{start.isoformat()}:{end.isoformat()}'[:180],
    )


def notify_course_request_submitted(course_request):
    who = course_request.requested_by.name if course_request.requested_by_id else 'A faculty member'
    notify_users(
        institution_people(course_request.institution_id, [UserRole.ADMIN]),
        kind='course_request_submitted',
        title='New course request',
        body=f'{who} asked to add {course_request.course_code} — {course_request.course_title}.',
        href=ADMIN_STRUCTURE,
        dedupe_key=f'course-request:{course_request.request_id}:submitted',
    )


def notify_course_request_approved(course_request, course):
    note = (course_request.admin_note or '').strip()
    body = f'{course.course_code} — {course.course_title} is now in your workspace.'
    if note:
        body = f'{body} Note: {note}'
    notify_users(
        [course_request.requested_by],
        kind='course_request_approved',
        title='Course request approved',
        body=body,
        href=FACULTY_HOME,
        dedupe_key=f'course-request:{course_request.request_id}:approved',
    )


def notify_course_request_rejected(course_request):
    note = (course_request.admin_note or '').strip()
    body = f'{course_request.course_code} — {course_request.course_title} was sent back.'
    if note:
        body = f'{body} {note}'
    notify_users(
        [course_request.requested_by],
        kind='course_request_rejected',
        title='Course request needs changes',
        body=body,
        href=FACULTY_HOME,
        dedupe_key=f'course-request:{course_request.request_id}:rejected',
    )


def notify_course_assigned(faculty, course, section_name=''):
    section = (section_name or '').strip()
    body = f'You now handle {course.course_code} — {course.course_title}.'
    if section:
        body = f'{body} Section {section}.'
    notify_users(
        [faculty],
        kind='course_assigned',
        title='Course assigned',
        body=body,
        href=FACULTY_HOME,
        dedupe_key=f'course-assigned:{course.course_id}:{faculty.pk}:{section}:{timezone.now().isoformat()}'[:180],
    )


def notify_course_unassigned(faculty, course_code, course_title, section_name=''):
    section = (section_name or '').strip()
    body = f'{course_code} — {course_title} was removed from your load.'
    if section:
        body = f'{course_code} — {course_title} ({section}) was removed from your load.'
    notify_users(
        [faculty],
        kind='course_unassigned',
        title='Course removed from your load',
        body=body,
        href=FACULTY_HOME,
        dedupe_key=f'course-unassigned:{course_code}:{faculty.pk}:{section}:{timezone.now().isoformat()}',
    )


def notify_syllabus_owner(faculty, course):
    notify_users(
        [faculty],
        kind='syllabus_owner_assigned',
        title='You maintain this syllabus',
        body=f'You are the syllabus owner for {course.course_code} — {course.course_title}.',
        href=FACULTY_HOME,
        dedupe_key=f'syllabus-owner:{course.course_id}:{faculty.pk}',
    )


def notify_syllabus_owner_cleared(faculty, course):
    notify_users(
        [faculty],
        kind='syllabus_owner_cleared',
        title='Syllabus ownership cleared',
        body=f'You no longer maintain the {course.course_code} syllabus.',
        href=FACULTY_HOME,
        dedupe_key=f'syllabus-owner-cleared:{course.course_id}:{faculty.pk}:{timezone.now().isoformat()}',
    )


def notify_account_ready(profile):
    notify_users(
        [profile],
        kind='account_ready',
        title='Your ATLAS account is ready',
        body='An administrator created your account. Sign in to see your courses.',
        href=FACULTY_HOME,
        dedupe_key=f'account-ready:{profile.pk}',
    )


def notify_account_reactivated(profile):
    notify_users(
        [profile],
        kind='account_reactivated',
        title='Your account is active again',
        body='You can sign in to ATLAS.',
        href=FACULTY_HOME if profile.role == UserRole.FACULTY else ADMIN_HOME,
        dedupe_key=f'account-reactivated:{profile.pk}:{timezone.now().isoformat()}',
    )


def notify_role_changed(profile):
    labels = {
        UserRole.FACULTY: 'Faculty',
        UserRole.ADMIN: 'Admin',
        UserRole.SUPERADMIN: 'Super Admin',
        'superadmin': 'Super Admin',
    }
    label = labels.get(profile.role, 'a new role')
    homes = {
        UserRole.FACULTY: FACULTY_HOME,
        UserRole.ADMIN: ADMIN_HOME,
        UserRole.SUPERADMIN: '/superadmin/dashboard',
    }
    notify_users(
        [profile],
        kind='role_changed',
        title='Your role changed',
        body=f'Your ATLAS role is now {label}.',
        href=homes.get(profile.role, FACULTY_HOME),
        dedupe_key=f'role-changed:{profile.pk}:{profile.role}:{timezone.now().isoformat()}',
    )


def notify_institution_status(institution, *, active):
    people = institution_people(institution.institution_id, [UserRole.ADMIN, UserRole.FACULTY])
    if active:
        notify_users(
            people,
            kind='institution_active',
            title='Your institution is active',
            body=f'{institution.name} can use ATLAS again.',
            href_for_role={UserRole.ADMIN: ADMIN_HOME, UserRole.FACULTY: FACULTY_HOME},
            dedupe_key=f'institution-active:{institution.institution_id}:{timezone.now().isoformat()}',
        )
        return
    notify_users(
        people,
        kind='institution_paused',
        title='Your institution was paused',
        body=f'{institution.name} cannot use ATLAS until it is turned back on.',
        href_for_role={UserRole.ADMIN: ADMIN_HOME, UserRole.FACULTY: FACULTY_HOME},
        dedupe_key=f'institution-paused:{institution.institution_id}:{timezone.now().isoformat()}',
    )


def notify_subscription_paid(institution, event_id=''):
    when = ''
    if institution.subscription_ends_at:
        when = f' It runs through {format_when(institution.subscription_ends_at)}.'
    suffix = event_id or str(institution.institution_id)
    notify_users(
        institution_people(institution.institution_id, [UserRole.ADMIN]),
        kind='subscription_paid',
        title='Subscription is active',
        body=f'{institution.name} is paid and active.{when}',
        href=ADMIN_HOME,
        dedupe_key=f'subscription-paid:{suffix}'[:180],
    )


def notify_assessment_approved(assessment, approver):
    course = getattr(assessment, 'course', None)
    code = course.course_code if course is not None else 'a course'
    who = approver.name if approver is not None else 'Faculty'
    notify_users(
        institution_people(getattr(course, 'institution_id', None), [UserRole.ADMIN]),
        kind='assessment_approved',
        title='Assessment approved',
        body=f'{who} approved {assessment.title} for {code}.',
        href=ADMIN_AUDIT,
        dedupe_key=f'assessment-approved:{assessment.assessment_id}',
    )


def notify_contact_message(name, institution):
    notify_users(
        list(UserProfile.objects.filter(is_active=True, role__in=[UserRole.SUPERADMIN, 'superadmin', 'super_admin'])),
        kind='contact_message',
        title='New contact message',
        body=f'{name} from {institution} sent a message from the website.',
        href='/superadmin/dashboard',
        dedupe_key=f'contact:{timezone.now().isoformat()}',
    )


def _file_label(path, fallback='A file'):
    name = str(path or '').replace('\\', '/').rsplit('/', 1)[-1].strip()
    return name or fallback


def notify_course_file_ready(records_id):
    row = CourseFile.objects.select_related('uploader', 'course').filter(records_id=records_id).first()
    if row is None or row.uploader_id is None:
        return
    code = row.course.course_code if row.course_id else 'your course'
    notify_users(
        [row.uploader],
        kind='course_file_ready',
        title='Course file is ready',
        body=f'{_file_label(row.storage_path)} is indexed for {code}.',
        href=FACULTY_HOME,
        dedupe_key=f'course-file:{records_id}:ready',
    )


def notify_course_file_failed(records_id):
    row = CourseFile.objects.select_related('uploader', 'course').filter(records_id=records_id).first()
    if row is None or row.uploader_id is None:
        return
    notify_users(
        [row.uploader],
        kind='course_file_failed',
        title='Course file could not be indexed',
        body=f'{_file_label(row.storage_path)} did not finish indexing. Try uploading it again.',
        href=FACULTY_HOME,
        dedupe_key=f'course-file:{records_id}:failed',
    )


def notify_knowledge_document(document_id, *, ready):
    document = GlobalDocument.objects.filter(document_id=document_id).first()
    if document is None or not document.institution_id:
        return
    if ready:
        notify_users(
            institution_people(document.institution_id, [UserRole.ADMIN]),
            kind='knowledge_ready',
            title='Knowledge base document is ready',
            body=f'{document.title} is indexed and available.',
            href=ADMIN_KNOWLEDGE,
            dedupe_key=f'knowledge:{document_id}:ready',
        )
        return
    notify_users(
        institution_people(document.institution_id, [UserRole.ADMIN]),
        kind='knowledge_failed',
        title='Knowledge base document failed',
        body=f'{document.title} could not be indexed. Try uploading it again.',
        href=ADMIN_KNOWLEDGE,
        dedupe_key=f'knowledge:{document_id}:failed',
    )
