import datetime
import logging
import uuid
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.integrations.models import (
    Assessment,
    AssessmentItem,
    AssessmentScoreResult,
    Block,
    Course,
    CourseLoad,
    Section,
    StudentData,
    UserProfile,
    UserRole,
)
from apps.grading.models import (
    BubbleSheetScan,
    BubbleSheetTemplate,
    OmrGradingJob,
    OmrJobResult,
    OmrJobStatus,
    OmrTemplateProfile,
)
from apps.grading.services import analytics
from apps.grading.services.mapper import OmrMapperService

from .serializers import (
    BubbleAnswerKeySerializer,
    BubbleScanPatchSerializer,
    BubbleSheetScanSerializer,
    BubbleSheetTemplateCreateSerializer,
    BubbleSheetTemplateUpdateSerializer,
    OmrFinalizeImportSerializer,
    OmrJobCreateSerializer,
    OmrJobResultPatchSerializer,
    OmrTemplateCreateSerializer,
    OmrTemplateUpdateSerializer,
)

logger = logging.getLogger(__name__)


def _is_faculty_user(request) -> bool:
    return bool(request.user and getattr(request.user, "role", None) == UserRole.FACULTY)


def _faculty_only_response():
    return Response(
        {"success": False, "detail": "Not permitted. This endpoint is for faculty users only."},
        status=status.HTTP_403_FORBIDDEN,
    )


def _get_faculty_profile(request):
    email = (getattr(request.user, "email", "") or "").strip()
    username = (getattr(request.user, "username", "") or "").strip()
    identifiers = [x for x in [email, username] if x]
    for identifier in identifiers:
        profile = UserProfile.objects.filter(email__iexact=identifier).first()
        if profile:
            return profile
    return None


def _faculty_can_access_course(faculty_profile, course_id) -> bool:
    if not faculty_profile:
        return False
    if faculty_profile.role in (UserRole.ADMIN, UserRole.SUPERADMIN):
        return True
    return CourseLoad.objects.filter(course_id=course_id, faculty_id=faculty_profile.user_id).exists()


def _save_upload(file_obj, category: str, course_id: str):
    media_root = Path(settings.MEDIA_ROOT)
    extension = Path(file_obj.name).suffix.lower()
    safe_name = Path(file_obj.name).name
    file_name = f"{uuid.uuid4().hex}_{safe_name}"
    relative_path = Path("omr") / category / str(course_id) / file_name
    absolute_path = media_root / relative_path
    absolute_path.parent.mkdir(parents=True, exist_ok=True)

    with absolute_path.open("wb+") as destination:
        for chunk in file_obj.chunks():
            destination.write(chunk)

    return str(relative_path).replace("\\", "/"), extension


def _to_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _template_payload(template: OmrTemplateProfile):
    return {
        "template_id": str(template.template_id),
        "course_id": str(template.course_id),
        "name": template.name,
        "form_code": template.form_code,
        "total_items": template.total_items,
        "passing_score": template.passing_score,
        "confidence_threshold": template.confidence_threshold,
        "is_active": template.is_active,
        "template_json_path": template.template_json_path,
        "evaluation_json_path": template.evaluation_json_path,
        "created_by": str(template.created_by_id) if template.created_by_id else None,
        "created_at": template.created_at,
        "updated_at": template.updated_at,
    }


def _job_payload(job: OmrGradingJob):
    return {
        "job_id": str(job.job_id),
        "course_id": str(job.course_id),
        "assessment_id": str(job.assessment_id),
        "template_id": str(job.template_id),
        "status": job.status,
        "progress_pct": job.progress_pct,
        "input_bundle_path": job.input_bundle_path,
        "output_bundle_path": job.output_bundle_path,
        "total_sheets": job.total_sheets,
        "processed_sheets": job.processed_sheets,
        "flagged_sheets": job.flagged_sheets,
        "error_message": job.error_message,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
    }


def _result_payload(result: OmrJobResult):
    return {
        "result_id": str(result.result_id),
        "job_id": str(result.job_id),
        "sheet_filename": result.sheet_filename,
        "student_identifier_raw": result.student_identifier_raw,
        "student_identifier_normalized": result.student_identifier_normalized,
        "score_raw": result.score_raw,
        "score_percent": result.score_percent,
        "max_score": result.max_score,
        "confidence": result.confidence,
        "is_flagged": result.is_flagged,
        "flag_reason": result.flag_reason,
        "responses_json": result.responses_json,
        "omr_metrics_json": result.omr_metrics_json,
        "mapped_assessment_result_id": str(result.mapped_assessment_result_id)
        if result.mapped_assessment_result_id
        else None,
        "created_at": result.created_at,
        "updated_at": result.updated_at,
    }


@api_view(["POST", "GET"])
@permission_classes([IsAuthenticated])
def omr_templates(request):
    if not _is_faculty_user(request):
        return _faculty_only_response()

    if request.method == "POST":
        serializer = OmrTemplateCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        faculty_profile = _get_faculty_profile(request)
        if not faculty_profile:
            return Response(
                {"success": False, "detail": "No faculty profile is linked to this account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        course_id = serializer.validated_data["course_id"]
        if not _faculty_can_access_course(faculty_profile, course_id):
            return Response(
                {"success": False, "detail": "Course not found in your teaching load."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            course = Course.objects.get(course_id=course_id)
        except Course.DoesNotExist:
            return Response(
                {"success": False, "detail": "Course does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )

        template_file = serializer.validated_data["template_file"]
        evaluation_file = serializer.validated_data["evaluation_file"]
        template_ext = Path(template_file.name).suffix.lower()
        evaluation_ext = Path(evaluation_file.name).suffix.lower()
        if template_ext != ".json" or evaluation_ext != ".json":
            return Response(
                {
                    "success": False,
                    "detail": "template_file and evaluation_file must both be JSON files.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        template_path, _ = _save_upload(template_file, "templates", str(course_id))
        evaluation_path, _ = _save_upload(evaluation_file, "evaluations", str(course_id))

        template = OmrTemplateProfile.objects.create(
            course=course,
            name=serializer.validated_data["name"],
            template_json_path=template_path,
            evaluation_json_path=evaluation_path,
            form_code=serializer.validated_data.get("form_code") or None,
            total_items=serializer.validated_data.get("total_items", 0),
            passing_score=serializer.validated_data.get("passing_score"),
            confidence_threshold=serializer.validated_data.get("confidence_threshold", 0.8500),
            is_active=serializer.validated_data.get("is_active", True),
            created_by=faculty_profile,
        )
        return Response(
            {"success": True, "template": _template_payload(template)},
            status=status.HTTP_201_CREATED,
        )

    course_id = request.query_params.get("course_id")
    queryset = OmrTemplateProfile.objects.all().order_by("-created_at")
    if course_id:
        queryset = queryset.filter(course_id=course_id)
    if faculty_profile := _get_faculty_profile(request):
        if faculty_profile.role == UserRole.FACULTY:
            queryset = queryset.filter(course__courseload__faculty=faculty_profile).distinct()

    items = [_template_payload(template) for template in queryset]
    return Response(
        {"success": True, "items": items},
        status=status.HTTP_200_OK,
    )


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def omr_template_detail(request, template_id):
    if not _is_faculty_user(request):
        return _faculty_only_response()

    try:
        template = OmrTemplateProfile.objects.select_related("course").get(template_id=template_id)
    except OmrTemplateProfile.DoesNotExist:
        return Response(
            {"success": False, "detail": "Template not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    faculty_profile = _get_faculty_profile(request)
    if not _faculty_can_access_course(faculty_profile, template.course_id):
        return Response(
            {"success": False, "detail": "Course not found in your teaching load."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "PUT":
        serializer = OmrTemplateUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        for field, value in serializer.validated_data.items():
            setattr(template, field, value)
        template.save()
        return Response({"success": True, "template": _template_payload(template)}, status=status.HTTP_200_OK)

    return Response(
        {"success": True, "template": _template_payload(template)},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def omr_template_validate(request, template_id):
    if not _is_faculty_user(request):
        return _faculty_only_response()
    return Response(
        {"success": True, "detail": "Template validate stub ready for implementation.", "template_id": str(template_id)},
        status=status.HTTP_501_NOT_IMPLEMENTED,
    )


@api_view(["POST", "GET"])
@permission_classes([IsAuthenticated])
def omr_jobs(request):
    if not _is_faculty_user(request):
        return _faculty_only_response()

    if request.method == "POST":
        serializer = OmrJobCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        faculty_profile = _get_faculty_profile(request)
        if not faculty_profile:
            return Response(
                {"success": False, "detail": "No faculty profile is linked to this account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        course_id = serializer.validated_data["course_id"]
        if not _faculty_can_access_course(faculty_profile, course_id):
            return Response(
                {"success": False, "detail": "Course not found in your teaching load."},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            course = Course.objects.get(course_id=course_id)
        except Course.DoesNotExist:
            return Response(
                {"success": False, "detail": "Course does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )

        assessment_id = serializer.validated_data["assessment_id"]
        template_id = serializer.validated_data["template_id"]

        try:
            assessment = Assessment.objects.get(assessment_id=assessment_id, course=course)
        except Assessment.DoesNotExist:
            return Response(
                {"success": False, "detail": "Assessment does not exist for the selected course."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            template = OmrTemplateProfile.objects.get(template_id=template_id, course=course)
        except OmrTemplateProfile.DoesNotExist:
            return Response(
                {"success": False, "detail": "Template does not exist for the selected course."},
                status=status.HTTP_404_NOT_FOUND,
            )

        scan_upload = serializer.validated_data["scan_bundle"]
        scan_name = (getattr(scan_upload, "name", "") or "").lower()
        scan_kind = scan_name.rsplit(".", 1)[-1] if "." in scan_name else ""
        from apps.integrations.document_processor import upload_type_error
        upload_error = upload_type_error(scan_upload, scan_kind)
        if upload_error:
            return Response({"success": False, "detail": upload_error}, status=status.HTTP_400_BAD_REQUEST)

        scan_bundle_path, scan_ext = _save_upload(
            scan_upload, "inputs", str(course_id)
        )
        allowed_scan_ext = {".zip", ".pdf", ".jpg", ".jpeg", ".png"}
        if scan_ext not in allowed_scan_ext:
            return Response(
                {
                    "success": False,
                    "detail": "scan_bundle must be one of: .zip, .pdf, .jpg, .jpeg, .png",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            job = OmrGradingJob.objects.create(
                course=course,
                assessment=assessment,
                template=template,
                submitted_by=faculty_profile,
                status=OmrJobStatus.QUEUED,
                progress_pct=0,
                input_bundle_path=scan_bundle_path,
            )

        queue_warning = None
        try:
            from apps.grading.tasks import run_omr_job
            if hasattr(run_omr_job, "delay"):
                run_omr_job.delay(str(job.job_id))
            else:
                run_omr_job(str(job.job_id))
        except Exception:  # pragma: no cover - depends on worker/broker availability
            logger.exception("OMR job %s could not be queued", job.job_id)
            queue_warning = "The scan was saved, but automatic grading did not start."

        return Response(
            {
                "success": True,
                "job": _job_payload(job),
                "queue_warning": queue_warning,
            },
            status=status.HTTP_201_CREATED,
        )

    course_id = request.query_params.get("course_id")
    assessment_id = request.query_params.get("assessment_id")
    queryset = OmrGradingJob.objects.select_related("course", "assessment", "template").order_by(
        "-created_at"
    )
    if course_id:
        queryset = queryset.filter(course_id=course_id)
    if assessment_id:
        queryset = queryset.filter(assessment_id=assessment_id)
    if faculty_profile := _get_faculty_profile(request):
        if faculty_profile.role == UserRole.FACULTY:
            queryset = queryset.filter(course__courseload__faculty=faculty_profile).distinct()

    items = [_job_payload(job) for job in queryset]
    return Response(
        {"success": True, "items": items},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def omr_job_detail(request, job_id):
    if not _is_faculty_user(request):
        return _faculty_only_response()
    try:
        job = OmrGradingJob.objects.select_related("course", "assessment", "template").get(job_id=job_id)
    except OmrGradingJob.DoesNotExist:
        return Response(
            {"success": False, "detail": "Job not found."},
            status=status.HTTP_404_NOT_FOUND,
        )
    faculty_profile = _get_faculty_profile(request)
    if not _faculty_can_access_course(faculty_profile, job.course_id):
        return Response(
            {"success": False, "detail": "Course not found in your teaching load."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(
        {"success": True, "job": _job_payload(job)},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def omr_job_cancel(request, job_id):
    if not _is_faculty_user(request):
        return _faculty_only_response()
    return Response(
        {"success": True, "detail": "Job cancel stub ready for implementation.", "job_id": str(job_id)},
        status=status.HTTP_501_NOT_IMPLEMENTED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def omr_job_results(request, job_id):
    if not _is_faculty_user(request):
        return _faculty_only_response()
    try:
        job = OmrGradingJob.objects.select_related("course").get(job_id=job_id)
    except OmrGradingJob.DoesNotExist:
        return Response(
            {"success": False, "detail": "Job not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    faculty_profile = _get_faculty_profile(request)
    if not _faculty_can_access_course(faculty_profile, job.course_id):
        return Response(
            {"success": False, "detail": "Course not found in your teaching load."},
            status=status.HTTP_404_NOT_FOUND,
        )

    queryset = OmrJobResult.objects.filter(job=job).order_by("sheet_filename", "created_at")
    flagged_param = request.query_params.get("flagged")
    if flagged_param is not None:
        flagged_value = flagged_param.lower() in ("1", "true", "yes")
        queryset = queryset.filter(is_flagged=flagged_value)

    search = (request.query_params.get("search") or "").strip()
    if search:
        queryset = queryset.filter(
            Q(student_identifier_raw__icontains=search)
            | Q(student_identifier_normalized__icontains=search)
            | Q(sheet_filename__icontains=search)
        )

    limit = min(max(_to_int(request.query_params.get("limit", 100), 100), 1), 500)
    offset = max(_to_int(request.query_params.get("offset", 0), 0), 0)
    total = queryset.count()
    items = [_result_payload(row) for row in queryset[offset : offset + limit]]

    return Response(
        {
            "success": True,
            "job_id": str(job_id),
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": items,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def omr_job_result_detail(request, job_id, result_id):
    if not _is_faculty_user(request):
        return _faculty_only_response()

    serializer = OmrJobResultPatchSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({"success": False, "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        {
            "success": True,
            "detail": "Job result patch stub ready for implementation.",
            "job_id": str(job_id),
            "result_id": str(result_id),
        },
        status=status.HTTP_501_NOT_IMPLEMENTED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def omr_job_auto_map(request, job_id):
    if not _is_faculty_user(request):
        return _faculty_only_response()
    try:
        job = OmrGradingJob.objects.select_related("course").get(job_id=job_id)
    except OmrGradingJob.DoesNotExist:
        return Response(
            {"success": False, "detail": "Job not found."},
            status=status.HTTP_404_NOT_FOUND,
        )
    faculty_profile = _get_faculty_profile(request)
    if not _faculty_can_access_course(faculty_profile, job.course_id):
        return Response(
            {"success": False, "detail": "Course not found in your teaching load."},
            status=status.HTTP_404_NOT_FOUND,
        )

    mapper = OmrMapperService()
    stats = mapper.apply_first_pass_mapping(job)
    job.flagged_sheets = stats["flagged_rows"]
    job.status = (
        OmrJobStatus.REVIEW_REQUIRED
        if job.flagged_sheets > 0
        else OmrJobStatus.READY_TO_IMPORT
    )
    job.save(update_fields=["flagged_sheets", "status"])
    return Response(
        {"success": True, "job_id": str(job_id), "mapping_stats": stats, "status": job.status},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def omr_job_finalize_import(request, job_id):
    if not _is_faculty_user(request):
        return _faculty_only_response()

    serializer = OmrFinalizeImportSerializer(data=request.data or {})
    if not serializer.is_valid():
        return Response({"success": False, "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        {
            "success": True,
            "detail": "Finalize import stub ready for implementation.",
            "job_id": str(job_id),
            "policy": serializer.validated_data["policy"],
        },
        status=status.HTTP_501_NOT_IMPLEMENTED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def omr_job_import_summary(request, job_id):
    if not _is_faculty_user(request):
        return _faculty_only_response()
    return Response(
        {"success": True, "detail": "Import summary stub ready for implementation.", "job_id": str(job_id)},
        status=status.HTTP_501_NOT_IMPLEMENTED,
    )


# ── Bubble Sheet helpers ──────────────────────────────────────────────────────

def _extract_answer_key_from_assessment(assessment, total_items: int) -> dict:
    """Extract correct_answer from each AssessmentItem rubric and build answer_key dict.

    Returns {"1":"A","2":"C",...} for items that have a correct_answer set.
    Items without correct_answer are omitted from the dict.
    """
    if not assessment:
        return {}
    items = AssessmentItem.objects.filter(assessment=assessment).order_by("item_id")
    key = {}
    for item in items:
        rubric = item.rubric or {}
        item_number = rubric.get("item_number")
        if item_number is None:
            continue
        try:
            idx = int(item_number)
        except (TypeError, ValueError):
            continue
        if not (1 <= idx <= total_items):
            continue
        ans = str(rubric.get("correct_answer", "")).strip().upper()
        if ans and ans in "ABCDE*":
            key[str(idx)] = ans
    return key


def regrade_template_scans(t: BubbleSheetTemplate) -> int:
    """Re-score every scan of [t] against its current answer key."""
    from apps.grading.services.bubble_sheet_scanner import BubbleSheetScannerService

    scans = list(BubbleSheetScan.objects.filter(template=t))
    for s in scans:
        s.score_raw, s.max_score, s.score_percent = BubbleSheetScannerService._grade(
            s.responses or {}, t.answer_key or {}
        )
    BubbleSheetScan.objects.bulk_update(scans, ["score_raw", "max_score", "score_percent"])
    return len(scans)


def _bs_template_payload(t: BubbleSheetTemplate) -> dict:
    return {
        "template_id": str(t.template_id),
        "course_id": str(t.course_id),
        "assessment_id": str(t.assessment_id) if t.assessment_id else None,
        "name": t.name,
        "total_items": t.total_items,
        "num_choices": t.num_choices,
        "parts": t.parts,
        "has_essay": t.has_essay,
        "essay_lines": t.essay_lines,
        "has_answer_key": bool(t.answer_key),
        "answer_key": t.answer_key or {},
        "passing_score": t.passing_score,
        "layout_metadata": t.layout_metadata or {},
        "created_by": str(t.created_by_id) if t.created_by_id else None,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


def _bs_scan_payload(s: BubbleSheetScan) -> dict:
    student_name = _resolve_student_name(s.student_identifier)
    return {
        "scan_id": str(s.scan_id),
        "template_id": str(s.template_id),
        "student_identifier": s.student_identifier,
        "student_name": student_name,
        "responses": s.responses,
        "score_raw": s.score_raw,
        "score_percent": s.score_percent,
        "max_score": s.max_score,
        "is_flagged": s.is_flagged,
        "flag_reason": s.flag_reason,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }


def _as_student_id(value) -> str:
    """Normalize mixed UUID / SR-code / None identifiers to a sortable string."""
    if value is None:
        return ""
    return str(value).strip()


def _to_float(value, default=None):
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _resolve_student_name(student_identifier: str | None) -> str | None:
    """Look up a student's name by SR code, then by user UUID if applicable."""
    sid = _as_student_id(student_identifier)
    if not sid:
        return None
    student_data = (
        StudentData.objects
        .select_related("user")
        .filter(sr_code=sid)
        .first()
    )
    if student_data is None:
        try:
            parsed = uuid.UUID(sid)
        except (ValueError, AttributeError, TypeError):
            parsed = None
        if parsed is not None:
            student_data = (
                StudentData.objects
                .select_related("user")
                .filter(user_id=parsed)
                .first()
            )
    if student_data and student_data.user:
        return student_data.user.name or student_data.user.email
    return None


def _save_bubble_image(file_obj, template_id: str) -> str:
    """Save uploaded image; return relative path under MEDIA_ROOT."""
    media_root = Path(settings.MEDIA_ROOT)
    suffix = Path(file_obj.name).suffix.lower() or ".jpg"
    file_name = f"{uuid.uuid4().hex}{suffix}"
    relative = Path("bubble_sheets") / "scans" / str(template_id) / file_name
    absolute = media_root / relative
    absolute.parent.mkdir(parents=True, exist_ok=True)
    with absolute.open("wb+") as fh:
        for chunk in file_obj.chunks():
            fh.write(chunk)
    return str(relative).replace("\\", "/")


# ── Student Scores ────────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def student_scores(request):
    """
    GET /api/grading/student-scores/?course_id=<uuid>&assessment_id=<uuid>
    Returns a list of students with their scores for a given assessment.
    Merges data from AssessmentScoreResult and BubbleSheetScan.
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    faculty = _get_faculty_profile(request)
    if not faculty:
        return Response(
            {"success": False, "detail": "No faculty profile linked."},
            status=status.HTTP_403_FORBIDDEN,
        )

    course_id = request.query_params.get("course_id", "").strip()
    assessment_id = request.query_params.get("assessment_id", "").strip()

    if not course_id or not assessment_id:
        return Response(
            {"success": False, "detail": "course_id and assessment_id are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        uuid.UUID(str(course_id))
        uuid.UUID(str(assessment_id))
    except (ValueError, AttributeError, TypeError):
        return Response(
            {"success": False, "detail": "course_id and assessment_id must be valid UUIDs."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not _faculty_can_access_course(faculty, course_id):
        return Response(
            {"success": False, "detail": "Access denied."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        assessment = Assessment.objects.get(assessment_id=assessment_id, course_id=course_id)
    except Assessment.DoesNotExist:
        return Response(
            {"success": False, "detail": "Assessment not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    templates = list(
        BubbleSheetTemplate.objects
        .filter(assessment_id=assessment_id)
        .select_related("course", "assessment")
    )
    total_items = max((t.total_items for t in templates), default=0)
    passing_percent = next(
        (_to_float(t.passing_score) for t in templates if t.passing_score is not None),
        analytics.DEFAULT_PASSING_PERCENT,
    )

    # Latest scan per student for this exam, joined to blocks for grade level/section.
    records = analytics.build_records(templates)
    scored_by_sid = {r["student_id"]: r for r in records if r["identified"]}

    course_sections = list(
        CourseLoad.objects.filter(course_id=course_id).values_list("section__code", flat=True)
    )
    roster = analytics.course_roster(course_id, extra_sections=course_sections)

    rows: list[dict] = []
    seen: set[str] = set()
    for student in roster:
        sid = student["student_id"]
        seen.add(sid)
        rec = scored_by_sid.get(sid)
        rows.append(_score_row(sid, student["grade_level"], student["section"], rec, total_items))

    for rec in records:
        if rec["student_id"] in seen:
            continue
        seen.add(rec["student_id"])
        rows.append(_score_row(
            rec["student_id"], rec["grade_level"], rec["section"], rec, total_items
        ))

    # Grade-sheet imports only fill students that have no bubble sheet score.
    try:
        by_sid = {r["student_id"]: r for r in rows if r["student_id"]}
        results = list(AssessmentScoreResult.objects.filter(assessment_id=assessment_id))
        extra_blocks = analytics.blocks_for(
            _as_student_id(r.student_identifier) for r in results
        )
        for result in results:
            sid = _as_student_id(result.student_identifier)
            row = by_sid.get(sid)
            if row is None:
                block = extra_blocks.get(sid)
                row = _score_row(
                    sid,
                    analytics.block_grade(block),
                    analytics.block_section(block),
                    None,
                    total_items,
                )
                rows.append(row)
                by_sid[sid] = row
            if row["score"] is None:
                row["score"] = _to_float(result.score, 0)
                row["source"] = "grade_sheet"
                if row["max_score"]:
                    row["percent"] = round(row["score"] / row["max_score"] * 100, 2)
                    row["passed"] = row["percent"] >= passing_percent
    except Exception:
        logger.exception(
            "Failed to load AssessmentScoreResult rows for assessment %s", assessment_id
        )

    names = {
        sd.sr_code: (sd.user.name or sd.user.email)
        for sd in StudentData.objects.select_related("user")
        .filter(sr_code__in=[r["student_id"] for r in rows if r["student_id"]])
        if sd.user
    }
    for r in rows:
        r["student_name"] = names.get(r["student_id"])

    rows.sort(key=lambda r: (
        r["section"] == analytics.UNASSIGNED, r["section"].lower(), r["student_id"] or "~"
    ))

    payload = {
        "success": True,
        "course_id": course_id,
        "assessment_id": assessment_id,
        "assessment_title": assessment.title,
        "total_items": total_items,
        "passing_percent": passing_percent,
        "total_students": len(rows),
        "scored_students": sum(1 for r in rows if r["score"] is not None),
        "grade_levels": analytics.sorted_options(r["grade_level"] for r in rows),
        "sections": analytics.sorted_options(r["section"] for r in rows),
        "students": rows,
        "rows": rows,  # alias used by older mobile clients
    }
    return Response(payload, status=status.HTTP_200_OK)


def _score_row(student_id, grade_level, section, record, total_items) -> dict:
    return {
        "student_id": student_id,
        "sr_code": student_id,
        "student_name": None,
        "grade_level": grade_level,
        "section": section,
        "score": record["score"] if record else None,
        "max_score": (record["max_score"] if record else None) or (total_items or None),
        "percent": record["percent"] if record else None,
        "passed": record["passed"] if record else None,
        "flagged": record["flagged"] if record else False,
        "source": "bubble_sheet" if record else None,
        "scanned_at": record["scanned_at"] if record else None,
    }


def _faculty_course_ids(faculty) -> list:
    if faculty and faculty.role in (UserRole.ADMIN, UserRole.SUPERADMIN):
        return list(Course.objects.values_list("course_id", flat=True))
    return list(
        CourseLoad.objects.filter(faculty=faculty)
        .values_list("course_id", flat=True)
        .distinct()
    )


def _valid_uuid(value) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


# ── Blocks (grade level / section roster) ─────────────────────────────────────


def _clean_student_id(value) -> str:
    sid = _as_student_id(value)
    if not sid or "?" in sid or sid.lower() == "unknown" or len(sid) > 64:
        return ""
    return sid


def _block_payload(b: Block) -> dict:
    return {
        "block_id": str(b.block_id),
        "student_id": b.student_id,
        "grade_level": b.grade_level,
        "section_id": str(b.section_id) if b.section_id else None,
        "section": b.section_name,
    }


def _sectioned_block(student_id) -> Block | None:
    sid = _clean_student_id(student_id)
    if not sid:
        return None
    return Block.objects.select_related("section").filter(
        student_id=sid, section__isnull=False
    ).first()


def _visible_sections(faculty):
    qs = Section.objects.prefetch_related("taken_courses")
    if faculty and faculty.institution_id:
        qs = qs.filter(
            Q(institution_id=faculty.institution_id)
            | Q(program__institution_id=faculty.institution_id)
        )
    return qs.order_by("code")


def _handled_sections(faculty, course_id=""):
    """Sections this faculty is assigned to teach, optionally for one course."""
    if not faculty:
        return Section.objects.none()
    loads = CourseLoad.objects.filter(section__isnull=False)
    if faculty.role not in (UserRole.ADMIN, UserRole.SUPERADMIN):
        loads = loads.filter(faculty=faculty)
    if course_id:
        loads = loads.filter(course_id=course_id)
    ids = set(loads.values_list("section_id", flat=True))
    if course_id and _valid_uuid(course_id):
        course_section_id = Course.objects.filter(pk=course_id).values_list("section_id", flat=True).first()
        if course_section_id:
            ids.add(course_section_id)
    return (
        Section.objects.filter(section_id__in=ids)
        .annotate(student_count=Count("blocks"))
        .order_by("code")
    )


def _split_student_ids(value):
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        parts = []
        for item in value:
            parts.extend(_split_student_ids(item))
        return parts
    text = str(value).replace(",", "\n").replace(";", "\n").replace("\t", "\n")
    return [part.strip() for part in text.splitlines() if part.strip()]


def _not_in_section_response(student_id):
    return Response(
        {
            "success": False,
            "code": "student_not_in_section",
            "student_id": _as_student_id(student_id) or None,
            "detail": (
                f"Student ID {student_id} is not yet on any section."
                if _as_student_id(student_id)
                else "Student ID could not be read, so it is not on any section."
            ),
        },
        status=status.HTTP_409_CONFLICT,
    )


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def grading_blocks(request):
    """
    GET  /api/grading/blocks/?student_id=&section_id=&course_id=
         Students on the sections this faculty handles.
    POST /api/grading/blocks/  {student_id | student_ids, section_id, grade_level?, course_id?}
         Add one student ID, or many IDs pasted as a list or as text split on
         lines, commas, or semicolons. A student already in another section is
         reported and left where they are.
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()
    faculty = _get_faculty_profile(request)

    if request.method == "GET":
        course_id = request.query_params.get("course_id", "").strip()
        if course_id and (not _valid_uuid(course_id) or not _faculty_can_access_course(faculty, course_id)):
            return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        handled = list(_handled_sections(faculty, course_id))
        handled_ids = [s.section_id for s in handled]
        qs = (
            Block.objects.select_related("section")
            .filter(section_id__in=handled_ids)
            .order_by("section__code", "student_id")
        )
        student_id = request.query_params.get("student_id", "").strip()
        section_id = request.query_params.get("section_id", "").strip()
        if student_id:
            qs = qs.filter(student_id=student_id)
        if section_id and _valid_uuid(section_id):
            qs = qs.filter(section_id=section_id)
        return Response({
            "success": True,
            "blocks": [_block_payload(b) for b in qs],
            "sections": [
                {
                    "section_id": str(s.section_id),
                    "section_name": s.section_name,
                    "student_count": s.student_count,
                }
                for s in handled
            ],
        })

    course_id = str(request.data.get("course_id") or "").strip()
    if course_id and (not _valid_uuid(course_id) or not _faculty_can_access_course(faculty, course_id)):
        return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

    section_id = str(request.data.get("section_id") or "").strip()
    section_name = str(request.data.get("section") or "").strip()[:50]
    grade_level = str(request.data.get("grade_level") or "").strip()[:100]
    handled = _handled_sections(faculty, course_id)
    if section_id:
        section = handled.filter(section_id=section_id).first() if _valid_uuid(section_id) else None
    elif section_name:
        section = handled.filter(code__iexact=section_name).first()
    else:
        section = None
    if section is None:
        return Response(
            {"success": False, "detail": "Choose a section you handle."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    raw_ids = request.data.get("student_ids")
    if raw_ids is None:
        raw_ids = request.data.get("student_id")
    cleaned = []
    invalid = []
    for raw in _split_student_ids(raw_ids):
        sid = _clean_student_id(raw)
        if not sid:
            invalid.append(raw)
        elif sid not in cleaned:
            cleaned.append(sid)
    if not cleaned:
        return Response(
            {"success": False, "detail": "Enter a complete student ID (no '?' characters).", "invalid": invalid},
            status=status.HTTP_400_BAD_REQUEST,
        )

    added = []
    already = []
    other = []
    with transaction.atomic():
        for sid in cleaned:
            block = Block.objects.select_related("section").filter(student_id=sid).first()
            if block and block.section_id and block.section_id != section.section_id:
                other.append({
                    "student_id": sid,
                    "section": block.section_name,
                    "detail": f"{sid} is already in section {block.section_name}.",
                })
                continue
            if block and block.section_id == section.section_id:
                already.append(sid)
                continue
            if block is None:
                block = Block(student_id=sid)
            block.section = section
            if grade_level or not block.grade_level:
                block.grade_level = grade_level
            block.save()
            added.append(_block_payload(block))
        if course_id and (added or already):
            section.taken_courses.add(course_id)
    single = request.data.get("student_ids") is None and len(cleaned) == 1 and not other
    if request.data.get("student_ids") is None and len(cleaned) == 1 and other:
        return Response(
            {
                "success": False,
                "code": "student_in_other_section",
                "detail": other[0]["detail"],
                "block": {
                    "student_id": other[0]["student_id"],
                    "section": other[0]["section"],
                },
            },
            status=status.HTTP_409_CONFLICT,
        )
    if single and added:
        return Response({"success": True, "block": added[0]}, status=status.HTTP_201_CREATED)
    return Response({
        "success": True,
        "added": added,
        "already_in_section": already,
        "in_other_section": other,
        "invalid": invalid,
    })


# ── Sections / Reports / Item analysis ────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def grading_sections(request):
    """
    GET /api/grading/sections/?course_id=<uuid>
    Distinct grade levels and sections (from `blocks`) of students scanned in the
    faculty's courses, optionally limited to one course.
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()
    faculty = _get_faculty_profile(request)
    course_ids = _faculty_course_ids(faculty)
    course_id = request.query_params.get("course_id", "").strip()
    if course_id:
        if not _valid_uuid(course_id) or not _faculty_can_access_course(faculty, course_id):
            return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        course_ids = [course_id]

    roster = []
    for cid in course_ids:
        sections = CourseLoad.objects.filter(course_id=cid).values_list("section__code", flat=True)
        roster.extend(analytics.course_roster(cid, extra_sections=sections))

    return Response({
        "success": True,
        "grade_levels": analytics.sorted_options(s["grade_level"] for s in roster),
        "sections": analytics.sorted_options(s["section"] for s in roster),
        "blocks": sorted(
            {(s["grade_level"], s["section"]) for s in roster},
            key=lambda gs: (gs[0].lower(), gs[1].lower()),
        ),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def bubble_sheet_item_analysis(request, template_id):
    """
    GET /api/grading/bubble/templates/<template_id>/item-analysis/?grade_level=&section=
    Automated upper/lower 27% item analysis for one exam.
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()
    faculty = _get_faculty_profile(request)
    t = (
        BubbleSheetTemplate.objects.select_related("course", "assessment")
        .filter(pk=template_id).first()
    )
    if not t:
        return Response({"success": False, "detail": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
    if not _faculty_can_access_course(faculty, t.course_id):
        return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

    records = analytics.filter_records(
        analytics.build_records([t]),
        grade_level=request.query_params.get("grade_level") or None,
        section=request.query_params.get("section") or None,
    )
    meta = analytics.item_metadata_by_assessment([t.assessment_id] if t.assessment_id else [])
    result = analytics.item_analysis(records, t, meta.get(str(t.assessment_id), {}))
    return Response({"success": True, **result})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def grading_reports(request):
    """
    GET /api/grading/reports/?course_id=&assessment_id=&grade_level=&section=
    Descriptive analytics: pass rates per section / subject / exam, score
    distribution, Bloom mastery, and item analysis (when one exam is in scope).
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()
    faculty = _get_faculty_profile(request)
    if not faculty:
        return Response({"success": False, "detail": "No faculty profile linked."}, status=status.HTTP_403_FORBIDDEN)

    course_ids = _faculty_course_ids(faculty)
    course_id = request.query_params.get("course_id", "").strip() or None
    assessment_id = request.query_params.get("assessment_id", "").strip() or None
    grade_level = request.query_params.get("grade_level", "").strip() or None
    section = request.query_params.get("section", "").strip() or None

    for value in (course_id, assessment_id):
        if value and not _valid_uuid(value):
            return Response({"success": False, "detail": "Invalid id."}, status=status.HTTP_400_BAD_REQUEST)
    if course_id and not _faculty_can_access_course(faculty, course_id):
        return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

    all_templates = (
        BubbleSheetTemplate.objects
        .filter(course_id__in=course_ids)
        .select_related("course", "assessment")
    )
    templates = all_templates
    if course_id:
        templates = templates.filter(course_id=course_id)
    if assessment_id:
        templates = templates.filter(assessment_id=assessment_id)
    templates = list(templates)

    course_rows = {}
    for t in all_templates:
        course_rows[str(t.course_id)] = {
            "course_id": str(t.course_id),
            "course_code": t.course.course_code,
            "course_title": t.course.course_title,
        }
    assessment_options = []
    seen_assessments = set()
    for t in all_templates:
        if course_id and str(t.course_id) != course_id:
            continue
        aid = str(t.assessment_id) if t.assessment_id else None
        if not aid or aid in seen_assessments:
            continue
        seen_assessments.add(aid)
        assessment_options.append({
            "assessment_id": aid,
            "title": t.assessment.title,
            "course_id": str(t.course_id),
            "course_code": t.course.course_code,
            "template_id": str(t.template_id),
            "total_items": t.total_items,
            "passing_percent": _to_float(t.passing_score),
        })

    scoped = analytics.build_records(templates)
    grade_options = analytics.sorted_options(r["grade_level"] for r in scoped)
    section_options = analytics.sorted_options(
        r["section"] for r in analytics.filter_records(scoped, grade_level=grade_level)
    )
    records = analytics.filter_records(scoped, grade_level=grade_level, section=section)

    assessment_ids = {t.assessment_id for t in templates if t.assessment_id}
    item_meta = analytics.item_metadata_by_assessment(assessment_ids)

    item_block = None
    exam_templates = {r["template"].template_id: r["template"] for r in records}
    if assessment_id or len(exam_templates) == 1:
        candidates = list(exam_templates.values()) or templates
        if candidates:
            target = max(
                candidates,
                key=lambda t: sum(1 for r in records if r["template"].template_id == t.template_id),
            )
            item_block = analytics.item_analysis(
                records, target, item_meta.get(str(target.assessment_id), {})
            )

    rosters = {}
    for t in templates:
        if t.course_id not in rosters:
            loads = CourseLoad.objects.filter(course_id=t.course_id).values_list("section__code", flat=True)
            rosters[t.course_id] = analytics.course_roster(t.course_id, extra_sections=loads)

    passing_values = {r["passing_percent"] for r in records}
    return Response({
        "coverage": analytics.scan_coverage(templates, records, rosters, grade_level, section),
        "success": True,
        "filters": {
            "course_id": course_id,
            "assessment_id": assessment_id,
            "grade_level": grade_level,
            "section": section,
        },
        "options": {
            "courses": sorted(course_rows.values(), key=lambda c: c["course_code"]),
            "assessments": assessment_options,
            "grade_levels": grade_options,
            "sections": section_options,
        },
        "passing_percent": passing_values.pop() if len(passing_values) == 1 else None,
        "summary": {
            **analytics.summarize(records),
            "identified_students": len({r["student_id"] for r in records if r["identified"]}),
            "unidentified_papers": sum(1 for r in records if not r["identified"]),
            "flagged_papers": sum(1 for r in records if r["flagged"]),
        },
        "distribution": analytics.score_distribution(records),
        "by_section": analytics.group_summaries(
            records, analytics._section_key, lambda r: r["section"],
            lambda r: {"grade_level": r["grade_level"]},
        ),
        "by_course": analytics.group_summaries(
            records, analytics._course_key, analytics._course_label,
            lambda r: {"course_title": r["template"].course.course_title},
        ),
        "by_assessment": analytics.group_summaries(
            records, analytics._assessment_key, analytics._assessment_label,
            lambda r: {"course_code": r["template"].course.course_code},
        ),
        "bloom": analytics.bloom_mastery(records, item_meta),
        "item_analysis": item_block,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def grading_recent_scans(request):
    """
    GET /api/grading/scans/recent/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&limit=
    Scans on the faculty's own courses, newest first. Dates are inclusive and
    interpreted in the server's timezone; both are optional.
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()
    faculty = _get_faculty_profile(request)
    if not faculty:
        return Response({"success": False, "detail": "No faculty profile linked."}, status=status.HTTP_403_FORBIDDEN)

    def parse_date(key):
        raw = (request.query_params.get(key) or "").strip()
        if not raw:
            return None
        try:
            return datetime.date.fromisoformat(raw)
        except ValueError:
            raise ValueError(key)

    try:
        date_from = parse_date("date_from")
        date_to = parse_date("date_to")
    except ValueError as exc:
        return Response({"success": False, "detail": f"Invalid {exc}; use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        limit = max(1, min(int(request.query_params.get("limit") or 500), 2000))
    except ValueError:
        limit = 500

    qs = (
        BubbleSheetScan.objects
        .filter(template__course_id__in=_faculty_course_ids(faculty))
        .select_related("template", "template__course", "template__assessment")
        .order_by("-created_at")
    )
    if date_from:
        qs = qs.filter(created_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(created_at__date__lte=date_to)
    scans = list(qs[:limit])

    ids = {
        analytics.normalize_student_id(s.student_identifier)
        for s in scans if analytics.is_valid_student_id(s.student_identifier)
    }
    blocks = analytics.blocks_for(ids)

    rows = []
    for s in scans:
        t = s.template
        sid = analytics.normalize_student_id(s.student_identifier) if s.student_identifier else None
        percent = _to_float(s.score_percent)
        passing = _to_float(t.passing_score)
        if passing is None:
            passing = analytics.DEFAULT_PASSING_PERCENT
        rows.append({
            "scan_id": str(s.scan_id),
            "student_id": sid,
            "section": analytics.block_section(blocks.get(sid)) if sid else analytics.UNASSIGNED,
            "template_id": str(t.template_id),
            "template_name": t.name,
            "assessment_title": t.assessment.title if t.assessment_id else t.name,
            "course_id": str(t.course_id),
            "course_code": t.course.course_code,
            "course_title": t.course.course_title,
            "score": _to_float(s.score_raw),
            "max_score": _to_float(s.max_score),
            "score_percent": percent,
            "passed": None if percent is None else percent >= passing,
            "is_flagged": s.is_flagged,
            "created_at": s.created_at.isoformat(),
        })
    return Response({"success": True, "scans": rows, "count": len(rows)})


# ── Bubble Sheet Template CRUD ────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def bubble_sheet_templates(request):
    """
    GET  /api/grading/bubble/templates/?course_id=<uuid>
    POST /api/grading/bubble/templates/
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    faculty = _get_faculty_profile(request)

    if request.method == "GET":
        course_id = request.query_params.get("course_id") or None
        assessment_id = request.query_params.get("assessment_id") or None
        if not course_id and not assessment_id:
            return Response({"success": False, "detail": "course_id or assessment_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        for value in (course_id, assessment_id):
            if value and not _valid_uuid(value):
                return Response({"success": False, "detail": "Invalid id."}, status=status.HTTP_400_BAD_REQUEST)
        if course_id and not _faculty_can_access_course(faculty, course_id):
            return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        qs = BubbleSheetTemplate.objects.all()
        if course_id:
            qs = qs.filter(course_id=course_id)
        if assessment_id:
            qs = qs.filter(assessment_id=assessment_id)
        templates = [
            t for t in qs.order_by("-created_at")
            if course_id or _faculty_can_access_course(faculty, t.course_id)
        ]
        return Response({"success": True, "templates": [_bs_template_payload(t) for t in templates]})

    # POST — create
    ser = BubbleSheetTemplateCreateSerializer(data=request.data)
    if not ser.is_valid():
        return Response({"success": False, "errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)

    d = ser.validated_data
    if not _faculty_can_access_course(faculty, d["course_id"]):
        return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

    course = Course.objects.filter(pk=d["course_id"]).first()
    if not course:
        return Response({"success": False, "detail": "Course not found."}, status=status.HTTP_404_NOT_FOUND)

    assessment = None
    if d.get("assessment_id"):
        assessment = Assessment.objects.filter(pk=d["assessment_id"], course=course).first()
        if not assessment:
            return Response({"success": False, "detail": "Assessment not found for this course."}, status=status.HTTP_404_NOT_FOUND)

    # Default single-part if none provided
    parts = d.get("parts") or [{"label": "Part I", "start_item": 1, "end_item": d["total_items"]}]

    # Auto-extract answer key from linked assessment items
    answer_key = _extract_answer_key_from_assessment(assessment, d["total_items"])

    template = BubbleSheetTemplate.objects.create(
        course=course,
        assessment=assessment,
        name=d["name"],
        total_items=d["total_items"],
        num_choices=d["num_choices"],
        parts=parts,
        has_essay=d["has_essay"],
        essay_lines=d["essay_lines"],
        passing_score=d.get("passing_score"),
        layout_metadata=d.get("layout_metadata") or {},
        answer_key=answer_key,
        created_by=faculty,
    )
    return Response({"success": True, "template": _bs_template_payload(template)}, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def bubble_sheet_template_detail(request, template_id):
    """
    GET    /api/grading/bubble/templates/<template_id>/
    PATCH  /api/grading/bubble/templates/<template_id>/
    DELETE /api/grading/bubble/templates/<template_id>/
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    faculty = _get_faculty_profile(request)
    t = BubbleSheetTemplate.objects.filter(pk=template_id).first()
    if not t:
        return Response({"success": False, "detail": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
    if not _faculty_can_access_course(faculty, t.course_id):
        return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        return Response({"success": True, "template": _bs_template_payload(t)})

    if request.method == "PATCH":
        ser = BubbleSheetTemplateUpdateSerializer(data=request.data)
        if not ser.is_valid():
            return Response({"success": False, "errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
        for field, val in ser.validated_data.items():
            setattr(t, field, val)
        t.save()
        return Response({"success": True, "template": _bs_template_payload(t)})

    # DELETE
    t.delete()
    return Response({"success": True, "detail": "Template deleted."})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bubble_sheet_set_answer_key(request, template_id):
    """
    POST /api/grading/bubble/templates/<template_id>/answer-key/
    Body: { "answer_key": { "1": "A", "2": "C", ... } }
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    faculty = _get_faculty_profile(request)
    t = BubbleSheetTemplate.objects.filter(pk=template_id).first()
    if not t:
        return Response({"success": False, "detail": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
    if not _faculty_can_access_course(faculty, t.course_id):
        return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

    ser = BubbleAnswerKeySerializer(data=request.data)
    if not ser.is_valid():
        return Response({"success": False, "errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)

    answer_key = ser.validated_data["answer_key"]
    # Validate item numbers are within range
    for item_no in answer_key:
        if not (1 <= int(item_no) <= t.total_items):
            return Response(
                {"success": False, "detail": f"Item {item_no} is out of range (1–{t.total_items})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    with transaction.atomic():
        t.answer_key = answer_key
        t.save(update_fields=["answer_key", "updated_at"])
        regraded = regrade_template_scans(t)
    return Response({
        "success": True,
        "detail": "Answer key saved.",
        "total_keyed_items": len(answer_key),
        "regraded_scans": regraded,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bubble_sheet_sync_key(request, template_id):
    """
    POST /api/grading/bubble/templates/<template_id>/sync-key/
    Re-extracts answer key from the linked assessment items.
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    faculty = _get_faculty_profile(request)
    t = BubbleSheetTemplate.objects.filter(pk=template_id).first()
    if not t:
        return Response({"success": False, "detail": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
    if not _faculty_can_access_course(faculty, t.course_id):
        return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
    if not t.assessment:
        return Response(
            {"success": False, "detail": "Template is not linked to an assessment."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    answer_key = _extract_answer_key_from_assessment(t.assessment, t.total_items)
    with transaction.atomic():
        t.answer_key = answer_key
        t.save(update_fields=["answer_key", "updated_at"])
        regrade_template_scans(t)
    return Response({
        "success": True,
        "detail": f"Answer key synced — {len(answer_key)} of {t.total_items} items have answers.",
        "total_keyed_items": len(answer_key),
        "template": _bs_template_payload(t),
    })


# ── PDF + QR code generation ──────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bubble_sheet_generate_pdf(request, template_id):
    """
    POST /api/grading/bubble/templates/<template_id>/generate-pdf/
    Returns the PDF as an attachment.
    Stores layout_metadata back on the template.
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    faculty = _get_faculty_profile(request)
    t = BubbleSheetTemplate.objects.filter(pk=template_id).first()
    if not t:
        return Response({"success": False, "detail": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
    if not _faculty_can_access_course(faculty, t.course_id):
        return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

    try:
        from apps.grading.services.bubble_sheet_generator import BubbleSheetGeneratorService
        svc = BubbleSheetGeneratorService()
        pdf_bytes, layout_metadata = svc.generate(t)
    except RuntimeError as exc:
        logger.exception("Grading request failed")
        return Response(
            {"success": False, "detail": "That request could not be completed."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    # Persist layout so the scanner can use it later
    t.layout_metadata = layout_metadata
    t.save(update_fields=["layout_metadata", "updated_at"])

    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    safe_name = t.name.replace(" ", "_")[:60]
    response["Content-Disposition"] = f'inline; filename="bubble_sheet_{safe_name}.pdf"'
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def bubble_sheet_student_qr(request, template_id):
    """
    GET /api/grading/bubble/templates/<template_id>/student-qr/?student_id=<id>
    Returns a PNG QR code for a single student identifier.
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    faculty = _get_faculty_profile(request)
    t = BubbleSheetTemplate.objects.filter(pk=template_id).first()
    if not t:
        return Response({"success": False, "detail": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
    if not _faculty_can_access_course(faculty, t.course_id):
        return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

    student_id = request.query_params.get("student_id", "").strip()
    if not student_id:
        return Response({"success": False, "detail": "student_id query param is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        from apps.grading.services.bubble_sheet_generator import BubbleSheetGeneratorService
        png_bytes = BubbleSheetGeneratorService.generate_student_qr(student_id)
    except RuntimeError as exc:
        logger.exception("Grading request failed")
        return Response(
            {"success": False, "detail": "That request could not be completed."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return HttpResponse(png_bytes, content_type="image/png")


# ── Bubble Sheet Scanning ─────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bubble_sheet_scan(request):
    """
    POST /api/grading/bubble/scans/
    Multipart: template_id (UUID), image (file)

    Optional client-graded fields (mobile on-device OMR):
      client_graded=true, student_identifier, responses (JSON),
      is_flagged, flag_reason
    When client_graded + responses are present, skip server OpenCV and
    persist the mobile grade so faculty web results see the row immediately.
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    faculty = _get_faculty_profile(request)
    ser = BubbleSheetScanSerializer(data=request.data)
    if not ser.is_valid():
        return Response({"success": False, "errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)

    d = ser.validated_data
    t = BubbleSheetTemplate.objects.filter(pk=d["template_id"]).first()
    if not t:
        return Response({"success": False, "detail": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
    if not _faculty_can_access_course(faculty, t.course_id):
        return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
    if not t.layout_metadata:
        return Response(
            {"success": False, "detail": "Generate the PDF first so layout_metadata is available for scanning."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    image_file = d["image"]
    image_path_rel = _save_bubble_image(image_file, str(t.template_id))
    image_path_abs = Path(settings.MEDIA_ROOT) / image_path_rel

    from apps.grading.services.bubble_sheet_scanner import (
        BubbleSheetScannerService,
        _truncate_flag_reason,
    )

    client_graded = bool(d.get("client_graded"))
    raw_responses = d.get("responses")

    # Normalise responses from JSON object or JSON string (multipart).
    responses = None
    if raw_responses is not None:
        if isinstance(raw_responses, str):
            import json
            try:
                raw_responses = json.loads(raw_responses)
            except json.JSONDecodeError:
                return Response(
                    {"success": False, "detail": "responses must be valid JSON."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if isinstance(raw_responses, dict):
            responses = {
                str(k): str(v).upper()[:1]
                for k, v in raw_responses.items()
                if v is not None and str(v).strip() and str(v).strip() != "?"
            }

    if client_graded and responses is not None:
        student_id = d.get("student_identifier") or None
        if isinstance(student_id, str) and not student_id.strip():
            student_id = None
        if _sectioned_block(student_id) is None:
            image_path_abs.unlink(missing_ok=True)
            return _not_in_section_response(student_id)
        student_id = _clean_student_id(student_id)
        score_raw, max_score, score_pct = BubbleSheetScannerService._grade(
            responses, t.answer_key or {}
        )
        is_flagged = bool(d.get("is_flagged", False))
        flag_reason = _truncate_flag_reason(d.get("flag_reason"))
        if not t.answer_key:
            is_flagged = True
            flag_reason = _truncate_flag_reason(
                (flag_reason + "; " if flag_reason else "") + "No answer key on template"
            )

        scan = BubbleSheetScan.objects.create(
            template=t,
            scanned_by=faculty,
            student_identifier=student_id,
            responses=responses,
            score_raw=score_raw,
            score_percent=score_pct,
            max_score=max_score,
            is_flagged=is_flagged,
            flag_reason=flag_reason,
        )
        return Response(
            {"success": True, "scan": _bs_scan_payload(scan), "source": "client_graded"},
            status=status.HTTP_201_CREATED,
        )

    # Legacy path: server-side OpenCV OMR
    try:
        result = BubbleSheetScannerService().scan(image_path_abs, t)
    except RuntimeError as exc:
        logger.exception("Grading request failed")
        return Response(
            {"success": False, "detail": "That request could not be completed."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    if _sectioned_block(result["student_identifier"]) is None:
        image_path_abs.unlink(missing_ok=True)
        return _not_in_section_response(result["student_identifier"])

    scan = BubbleSheetScan.objects.create(
        template=t,
        scanned_by=faculty,
        student_identifier=result["student_identifier"],
        responses=result["responses"],
        score_raw=result["score_raw"],
        score_percent=result["score_percent"],
        max_score=result["max_score"],
        is_flagged=result["is_flagged"],
        flag_reason=_truncate_flag_reason(result["flag_reason"]),
    )
    return Response(
        {"success": True, "scan": _bs_scan_payload(scan), "source": "server_omr"},
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def bubble_sheet_scans_list(request, template_id):
    """
    GET /api/grading/bubble/templates/<template_id>/scans/
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    faculty = _get_faculty_profile(request)
    t = BubbleSheetTemplate.objects.filter(pk=template_id).first()
    if not t:
        return Response({"success": False, "detail": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
    if not _faculty_can_access_course(faculty, t.course_id):
        return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

    scans = BubbleSheetScan.objects.filter(template=t).order_by("-created_at")
    flagged_only = request.query_params.get("flagged") == "1"
    if flagged_only:
        scans = scans.filter(is_flagged=True)

    return Response({"success": True, "scans": [_bs_scan_payload(s) for s in scans]})


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def bubble_sheet_scan_detail(request, scan_id):
    """
    GET    /api/grading/bubble/scans/<scan_id>/
    PATCH  /api/grading/bubble/scans/<scan_id>/  — manual correction
    DELETE /api/grading/bubble/scans/<scan_id>/
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    faculty = _get_faculty_profile(request)
    scan = BubbleSheetScan.objects.select_related("template").filter(pk=scan_id).first()
    if not scan:
        return Response({"success": False, "detail": "Scan not found."}, status=status.HTTP_404_NOT_FOUND)
    if not _faculty_can_access_course(faculty, scan.template.course_id):
        return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        return Response({"success": True, "scan": _bs_scan_payload(scan)})

    if request.method == "PATCH":
        ser = BubbleScanPatchSerializer(data=request.data)
        if not ser.is_valid():
            return Response({"success": False, "errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
        new_sid = ser.validated_data.get("student_identifier")
        if "student_identifier" in ser.validated_data and _sectioned_block(new_sid) is None:
            return _not_in_section_response(new_sid)
        for field, val in ser.validated_data.items():
            setattr(scan, field, val)
        # Re-grade if responses changed and answer key exists
        if "responses" in ser.validated_data and scan.template.answer_key:
            from apps.grading.services.bubble_sheet_scanner import BubbleSheetScannerService
            score_raw, max_score, score_pct = BubbleSheetScannerService._grade(
                scan.responses, scan.template.answer_key
            )
            scan.score_raw = score_raw
            scan.max_score = max_score
            scan.score_percent = score_pct
        scan.save()
        return Response({"success": True, "scan": _bs_scan_payload(scan)})

    # DELETE
    scan.delete()
    return Response({"success": True, "detail": "Scan deleted."})
