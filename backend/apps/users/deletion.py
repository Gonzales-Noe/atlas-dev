# Account + institution deletion rules live here so API views stay thin.
from django.db import models, transaction
from django.db.models import ProtectedError

from apps.integrations.models import (
    AuditLog,
    Block,
    Course,
    Institution,
    Section,
    UserProfile,
    UserRole,
)


class AccountDeletionError(Exception):
    pass


def _norm_role(role):
    if role in {UserRole.SUPERADMIN, 'super_admin', 'superadmin'}:
        return 'superadmin'
    if role == UserRole.ADMIN:
        return 'admin'
    if role == UserRole.STUDENT:
        return 'student'
    return 'faculty'


def _delete_institution_rows(institution):
    """Remove every row scoped to the institution, then the institution.

    This is explicit (not a single ORM .delete()) because the schema mixes
    CASCADE / SET_NULL / PROTECT:

    * OMR grading jobs point at templates with PROTECT, and QuickExam rows
      point at subjects with PROTECT — those chains are cleared first.
    * UserProfile.institution is SET_NULL, so members are deleted explicitly
      (which cascades to their CourseLoads/StudentData/Snapshots).
    * AuditLog has no institution FK — rows for removed users are purged.
    * Block.student_id is globally unique — rosters under removed sections
      are purged so the IDs can be re-used by a fresh institution.
    """
    from apps.grading.models import (
        BubbleSheetScan,
        BubbleSheetTemplate,
        OmrGradingJob,
        OmrJobResult,
        OmrReviewAction,
        OmrTemplateProfile,
        QuickExam,
        QuickExamScan,
        QuickExamSubject,
    )
    from apps.integrations.models import College, Program

    course_ids = list(
        Course.objects.filter(
            models.Q(institution=institution) | models.Q(program__institution=institution)
        ).values_list('course_id', flat=True)
    )
    member_ids = list(
        UserProfile.objects.filter(institution=institution).values_list('user_id', flat=True)
    )
    # Sections may be scoped directly (institution set) or via program /
    # year level with institution NULL — collect all of them so rosters
    # (Block.student_id is globally unique) are fully purged.
    section_ids = list(
        Section.objects.filter(
            models.Q(institution=institution)
            | models.Q(program__institution=institution)
            | models.Q(year_level__program__institution=institution)
        ).values_list('section_id', flat=True)
    )

    # 1. PROTECT chains first (would block cascades otherwise).
    OmrReviewAction.objects.filter(job__course_id__in=course_ids).delete()
    OmrJobResult.objects.filter(job__course_id__in=course_ids).delete()
    OmrGradingJob.objects.filter(course_id__in=course_ids).delete()
    OmrTemplateProfile.objects.filter(course_id__in=course_ids).delete()
    BubbleSheetScan.objects.filter(template__course_id__in=course_ids).delete()
    BubbleSheetTemplate.objects.filter(course_id__in=course_ids).delete()
    QuickExamScan.objects.filter(exam__faculty__institution=institution).delete()
    QuickExam.objects.filter(faculty__institution=institution).delete()
    QuickExamSubject.objects.filter(faculty__institution=institution).delete()

    # 2. Members (cascades to CourseLoads / StudentData / Snapshots).
    UserProfile.objects.filter(user_id__in=member_ids).delete()
    # AuditLog.user is SET_NULL with no institution link — purge leftovers.
    if member_ids:
        AuditLog.objects.filter(user_id__in=member_ids).delete()

    # 3. Rosters under this institution's sections (Block.section is
    # SET_NULL but student_id is globally unique — orphans would block
    # re-creating the same student IDs later).
    if section_ids:
        Block.objects.filter(section_id__in=section_ids).delete()

    # 4. Courses (cascades to loads/syllabi/modules/assessments/items/
    # mappings/TOS/scores/files/chunks).
    Course.objects.filter(course_id__in=course_ids).delete()

    # 5. Structure, then the institution itself (cascades to customization).
    Section.objects.filter(section_id__in=section_ids).delete()
    # Programs -> year levels -> sections cascade from here; colleges last.
    Program.objects.filter(institution=institution).delete()
    College.objects.filter(institution=institution).delete()
    institution.delete()


@transaction.atomic
def delete_user_account(target: UserProfile):
    """Delete one user. If the target is the last admin of its institution,
    delete the whole institution and all of its data, so a re-used email
    starts from a clean first-time setup.

    Returns dict(institution_deleted: bool, institution_id: str | None).
    """
    target = UserProfile.objects.select_for_update().select_related('institution').get(pk=target.pk)
    institution = target.institution
    role = _norm_role(target.role)

    if institution is None or role != 'admin':
        target.delete()
        return {'institution_deleted': False, 'institution_id': None}

    # Lock the institution row so two concurrent deletes can't orphan it.
    institution = Institution.objects.select_for_update().get(pk=institution.pk)
    remaining_admins = (
        UserProfile.objects.select_for_update()
        .filter(institution=institution, role=UserRole.ADMIN)
        .exclude(pk=target.pk)
        .count()
    )
    if remaining_admins > 0:
        target.delete()
        return {'institution_deleted': False, 'institution_id': str(institution.institution_id)}

    institution_id = str(institution.institution_id)
    try:
        _delete_institution_rows(institution)
    except ProtectedError as exc:
        raise AccountDeletionError(
            'This institution cannot be deleted because protected grading records '
            f'still reference it: {exc.protected_objects!r}.'
        )
    return {'institution_deleted': True, 'institution_id': institution_id}


@transaction.atomic
def delete_institution(institution: Institution):
    """Hard-delete an institution, its member accounts, and all data under it."""
    institution = Institution.objects.select_for_update().get(pk=institution.pk)
    institution_id = str(institution.institution_id)
    try:
        _delete_institution_rows(institution)
    except ProtectedError as exc:
        raise AccountDeletionError(
            'This institution cannot be deleted because protected grading records '
            f'still reference it: {exc.protected_objects!r}.'
        )
    return {'institution_deleted': True, 'institution_id': institution_id}

