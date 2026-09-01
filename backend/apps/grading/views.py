import uuid
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.integrations.models import Assessment, AssessmentItem, Course, CourseLoad, StudentData, UserProfile, UserRole
from apps.grading.models import (
    BubbleSheetScan,
    BubbleSheetTemplate,
    OmrGradingJob,
    OmrJobResult,
    OmrJobStatus,
    OmrTemplateProfile,
)
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

        scan_bundle_path, scan_ext = _save_upload(
            serializer.validated_data["scan_bundle"], "inputs", str(course_id)
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
        except Exception as exc:  # pragma: no cover - depends on worker/broker availability
            queue_warning = str(exc)

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
        if ans in "ABCDE":
            key[str(idx)] = ans
    return key


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


def _resolve_student_name(student_identifier: str | None) -> str | None:
    """Look up a student's name by matching their SR Code against StudentData."""
    if not student_identifier:
        return None
    student_data = (
        StudentData.objects
        .select_related("user")
        .filter(sr_code=student_identifier)
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

    rows: list[dict] = []

    # 1. AssessmentScoreResult rows
    from apps.integrations.models import AssessmentScoreResult
    score_results = AssessmentScoreResult.objects.filter(
        assessment_id=assessment_id
    ).order_by("student_identifier")
    for r in score_results:
        rows.append({
            "student_id": r.student_identifier,
            "score": float(r.score) if r.score else 0,
            "max_score": None,
            "percent": None,
            "source": "grade_sheet",
            "flagged": False,
        })

    # 2. BubbleSheetScan rows (via BubbleSheetTemplate linked to this assessment)
    templates = BubbleSheetTemplate.objects.filter(assessment_id=assessment_id)
    for tpl in templates:
        scans = BubbleSheetScan.objects.filter(template=tpl).order_by("student_identifier")
        for s in scans:
            # Avoid dupes if same student exists in both
            exists = any(str(r["student_id"]) == str(s.student_identifier) for r in rows)
            if not exists:
                student_name = _resolve_student_name(s.student_identifier)
                rows.append({
                    "student_id": s.student_identifier,
                    "student_name": student_name,
                    "score": float(s.score_raw) if s.score_raw else 0,
                    "max_score": float(s.max_score) if s.max_score else None,
                    "percent": float(s.score_percent) if s.score_percent else None,
                    "source": "bubble_sheet",
                    "flagged": s.is_flagged,
                })

    rows.sort(key=lambda r: r["student_id"])

    return Response(
        {
            "success": True,
            "course_id": course_id,
            "assessment_id": assessment_id,
            "assessment_title": assessment.title,
            "total_students": len(rows),
            "students": rows,
        },
        status=status.HTTP_200_OK,
    )


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
        course_id = request.query_params.get("course_id")
        if not course_id:
            return Response({"success": False, "detail": "course_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not _faculty_can_access_course(faculty, course_id):
            return Response({"success": False, "detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        qs = BubbleSheetTemplate.objects.filter(course_id=course_id).order_by("-created_at")
        return Response({"success": True, "templates": [_bs_template_payload(t) for t in qs]})

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

    t.answer_key = answer_key
    t.save(update_fields=["answer_key", "updated_at"])
    return Response({"success": True, "detail": "Answer key saved.", "total_keyed_items": len(answer_key)})


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
    t.answer_key = answer_key
    t.save(update_fields=["answer_key", "updated_at"])
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
        return Response({"success": False, "detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    # Persist layout so the scanner can use it later
    t.layout_metadata = layout_metadata
    t.save(update_fields=["layout_metadata", "updated_at"])

    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    safe_name = t.name.replace(" ", "_")[:60]
    response["Content-Disposition"] = f'attachment; filename="bubble_sheet_{safe_name}.pdf"'
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
        return Response({"success": False, "detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    return HttpResponse(png_bytes, content_type="image/png")


# ── Bubble Sheet Scanning ─────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bubble_sheet_scan(request):
    """
    POST /api/grading/bubble/scans/
    Multipart: template_id (UUID), image (file)
    Runs the scanner, grades against the answer key, saves the result.
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

    try:
        from apps.grading.services.bubble_sheet_scanner import (
            BubbleSheetScannerService,
            _truncate_flag_reason,
        )
        result = BubbleSheetScannerService().scan(image_path_abs, t)
    except RuntimeError as exc:
        return Response({"success": False, "detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

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
        {"success": True, "scan": _bs_scan_payload(scan)},
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
