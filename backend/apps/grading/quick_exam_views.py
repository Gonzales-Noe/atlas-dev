"""
Quick exams: bubble-sheet exams created on the mobile app that live in their
own tables and never touch course assessments, scores or reports.

Every row is owned by one faculty user; nobody else can read or change it.
"""

from django.db import transaction
from django.db.models import Avg, Count, Max, Q
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.grading.models import QuickExam, QuickExamScan, QuickExamSubject
from apps.integrations.models import Course
from apps.grading.services.bubble_sheet_scanner import (
    BubbleSheetScannerService,
    _truncate_flag_reason,
)

from apps.grading.services.omr_core import BONUS_KEY, is_correct
from .quick_exam_serializers import (
    QuickAnswerKeySerializer,
    QuickExamCreateSerializer,
    QuickExamUpdateSerializer,
    QuickScanCreateSerializer,
    QuickScanPatchSerializer,
    QuickSubjectSerializer,
    _validate_layout,
    _validate_parts,
    normalize_questions,
)
from .views import (
    _clean_student_id,
    _faculty_only_response,
    _get_faculty_profile,
    _is_faculty_user,
    _resolve_student_name,
)

QR_PREFIX = "QX:"
STRUCTURE_FIELDS = ("total_items", "num_choices", "num_id_columns", "layout_metadata")


def _bad(detail, code=status.HTTP_400_BAD_REQUEST, **extra):
    return Response({"success": False, "detail": detail, **extra}, status=code)


def _not_found(what):
    return _bad(f"{what} not found.", status.HTTP_404_NOT_FOUND)


def _faculty_or_error(request):
    """(faculty, None) for a faculty caller with a profile, else (None, error response)."""
    if not _is_faculty_user(request):
        return None, _faculty_only_response()
    faculty = _get_faculty_profile(request)
    if faculty is None:
        return None, _bad("Faculty profile not found.", status.HTTP_403_FORBIDDEN)
    return faculty, None


def _num(value):
    return float(value) if value is not None else None


def _subject_payload(s: QuickExamSubject, exam_count=None) -> dict:
    return {
        "subject_id": str(s.subject_id),
        "name": s.name,
        "exam_count": exam_count if exam_count is not None else s.exams.count(),
        "created_at": s.created_at,
    }


def _exam_payload(e: QuickExam, full=False, stats=None) -> dict:
    data = {
        "exam_id": str(e.exam_id),
        "qr_payload": f"{QR_PREFIX}{e.exam_id}",
        "subject_id": str(e.subject_id),
        "subject_name": e.subject.name,
        "name": e.name,
        "total_items": e.total_items,
        "num_choices": e.num_choices,
        "num_id_columns": e.num_id_columns,
        "parts": e.parts or [],
        "passing_score": _num(e.passing_score),
        "has_answer_key": bool(e.answer_key),
        "has_questions": bool(e.questions),
        "keyed_items": len(e.answer_key or {}),
        "created_at": e.created_at,
        "updated_at": e.updated_at,
    }
    if stats is not None:
        data.update(stats)
    if full:
        data["answer_key"] = e.answer_key or {}
        data["questions"] = e.questions or None
        data["layout_metadata"] = e.layout_metadata or {}
    return data


def _scan_payload(s: QuickExamScan, exam: QuickExam | None = None) -> dict:
    exam = exam or s.exam
    passing = float(exam.passing_score) if exam.passing_score is not None else 50.0
    pct = _num(s.score_percent)
    return {
        "scan_id": str(s.scan_id),
        "exam_id": str(s.exam_id),
        "exam_name": exam.name,
        "subject_id": str(exam.subject_id),
        "subject_name": exam.subject.name,
        "student_identifier": s.student_identifier,
        "student_name": s.student_name,
        "responses": s.responses or {},
        "score_raw": _num(s.score_raw),
        "score_percent": pct,
        "max_score": _num(s.max_score),
        "passed": pct is not None and pct >= passing,
        "is_flagged": s.is_flagged,
        "flag_reason": s.flag_reason,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }


def _clean_responses(raw: dict) -> dict:
    return {
        str(k): str(v).strip().upper()[:1]
        for k, v in (raw or {}).items()
        if v is not None and str(v).strip() and str(v).strip() != "?"
    }


def _grade(scan: QuickExamScan, exam: QuickExam):
    score_raw, max_score, score_pct = BubbleSheetScannerService._grade(
        scan.responses or {}, exam.answer_key or {}
    )
    scan.score_raw, scan.max_score, scan.score_percent = score_raw, max_score, score_pct


def _assigned_courses(faculty):
    return Course.objects.filter(courseload__faculty=faculty).distinct().order_by("course_code")


def _course_subject_name(course: Course) -> str:
    code, title = (course.course_code or "").strip(), (course.course_title or "").strip()
    return (f"{code} – {title}" if code and title else code or title)[:150]


def _resolve_subject(faculty, subject_id=None, course_id=None):
    """Existing subject by id, or the subject for one of the faculty's assigned
    courses (created on first use). Returns (subject, error)."""
    if subject_id:
        subject = QuickExamSubject.objects.filter(pk=subject_id, faculty=faculty).first()
        return (subject, None) if subject else (None, _not_found("Subject"))
    course = _assigned_courses(faculty).filter(pk=course_id).first() if course_id else None
    if course is None:
        return None, _bad("Choose one of your assigned courses.", status.HTTP_403_FORBIDDEN)
    name = _course_subject_name(course)
    subject = QuickExamSubject.objects.filter(faculty=faculty, name__iexact=name).first()
    if subject is None:
        subject = QuickExamSubject.objects.create(faculty=faculty, name=name)
    return subject, None


def _exam_stats_map(exam_ids) -> dict:
    rows = (
        QuickExamScan.objects.filter(exam_id__in=exam_ids)
        .values("exam_id")
        .annotate(
            scan_count=Count("scan_id"),
            average_percent=Avg("score_percent"),
            highest_percent=Max("score_percent"),
            flagged_count=Count("scan_id", filter=Q(is_flagged=True)),
        )
    )
    return {
        r["exam_id"]: {
            "scan_count": r["scan_count"],
            "average_percent": round(float(r["average_percent"]), 2)
            if r["average_percent"] is not None else None,
            "highest_percent": _num(r["highest_percent"]),
            "flagged_count": r["flagged_count"],
        }
        for r in rows
    }


EMPTY_STATS = {
    "scan_count": 0, "average_percent": None, "highest_percent": None, "flagged_count": 0,
}


# ── Subjects ──────────────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def quick_subjects(request):
    """
    GET  /api/grading/quick/subjects/   subjects + the faculty's assigned courses
    POST /api/grading/quick/subjects/   { "course_id": "<uuid>" }
    """
    faculty, err = _faculty_or_error(request)
    if err:
        return err

    if request.method == "GET":
        subjects = list(
            QuickExamSubject.objects.filter(faculty=faculty)
            .annotate(n=Count("exams"))
            .order_by("name")
        )
        by_name = {s.name.lower(): s for s in subjects}
        courses = []
        for c in _assigned_courses(faculty):
            name = _course_subject_name(c)
            match = by_name.get(name.lower())
            courses.append({
                "course_id": str(c.course_id),
                "course_code": c.course_code,
                "course_title": c.course_title,
                "name": name,
                "subject_id": str(match.subject_id) if match else None,
            })
        return Response({
            "success": True,
            "subjects": [_subject_payload(s, s.n) for s in subjects],
            "courses": courses,
        })

    ser = QuickSubjectSerializer(data=request.data)
    if not ser.is_valid():
        return Response({"success": False, "errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
    subject, err = _resolve_subject(faculty, course_id=ser.validated_data["course_id"])
    if err:
        return err
    return Response(
        {"success": True, "subject": _subject_payload(subject)},
        status=status.HTTP_201_CREATED,
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def quick_subject_detail(request, subject_id):
    """
    DELETE /api/grading/quick/subjects/<id>/   (only when it has no exams)
    Subjects are named after assigned courses, so they are not renamed.
    """
    faculty, err = _faculty_or_error(request)
    if err:
        return err
    subject = QuickExamSubject.objects.filter(pk=subject_id, faculty=faculty).first()
    if not subject:
        return _not_found("Subject")

    if subject.exams.exists():
        return _bad(
            "Move or delete this subject's exams before deleting it.",
            status.HTTP_409_CONFLICT,
        )
    subject.delete()
    return Response({"success": True, "detail": "Subject deleted."})


# ── Exams ─────────────────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def quick_exams(request):
    """
    GET  /api/grading/quick/exams/?subject_id=<uuid>
    POST /api/grading/quick/exams/
    """
    faculty, err = _faculty_or_error(request)
    if err:
        return err

    if request.method == "GET":
        qs = QuickExam.objects.filter(faculty=faculty).select_related("subject")
        subject_id = request.query_params.get("subject_id")
        if subject_id:
            qs = qs.filter(subject_id=subject_id)
        exams = list(qs.order_by("-created_at"))
        stats = _exam_stats_map([e.exam_id for e in exams])
        return Response({
            "success": True,
            "exams": [_exam_payload(e, stats=stats.get(e.exam_id, EMPTY_STATS)) for e in exams],
        })

    ser = QuickExamCreateSerializer(data=request.data)
    if not ser.is_valid():
        return Response({"success": False, "errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
    d = ser.validated_data
    with transaction.atomic():
        subject, err = _resolve_subject(faculty, d.get("subject_id"), d.get("course_id"))
        if err:
            return err
        parts = d.get("parts") or [
            {"label": "Part I", "start_item": 1, "end_item": d["total_items"]}
        ]
        exam = QuickExam.objects.create(
            faculty=faculty,
            subject=subject,
            name=d["name"].strip(),
            total_items=d["total_items"],
            num_choices=d["num_choices"],
            num_id_columns=d["num_id_columns"],
            parts=parts,
            passing_score=d.get("passing_score"),
            layout_metadata=d["layout_metadata"],
            questions=d.get("questions"),
        )
    return Response(
        {"success": True, "exam": _exam_payload(exam, full=True, stats=EMPTY_STATS)},
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def quick_exam_detail(request, exam_id):
    """
    GET    /api/grading/quick/exams/<id>/   (includes answer_key + layout_metadata)
    PATCH  /api/grading/quick/exams/<id>/   (sheet layout is locked once scans exist)
    DELETE /api/grading/quick/exams/<id>/   (also deletes its scans)
    """
    faculty, err = _faculty_or_error(request)
    if err:
        return err
    exam = QuickExam.objects.select_related("subject").filter(pk=exam_id, faculty=faculty).first()
    if not exam:
        return _not_found("Exam")

    if request.method == "GET":
        stats = _exam_stats_map([exam.exam_id]).get(exam.exam_id, EMPTY_STATS)
        return Response({"success": True, "exam": _exam_payload(exam, full=True, stats=stats)})

    if request.method == "DELETE":
        exam.delete()
        return Response({"success": True, "detail": "Exam deleted."})

    ser = QuickExamUpdateSerializer(data=request.data)
    if not ser.is_valid():
        return Response({"success": False, "errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
    d = ser.validated_data

    changes_structure = any(
        f in d and d[f] != getattr(exam, f) for f in STRUCTURE_FIELDS
    )
    if changes_structure and exam.scans.exists():
        return _bad(
            "Sheets for this exam were already scanned, so its items, choices and "
            "ID columns can no longer change. Create a new exam instead.",
            status.HTTP_409_CONFLICT,
        )

    with transaction.atomic():
        if d.get("subject_id") or d.get("course_id"):
            subject, err = _resolve_subject(faculty, d.get("subject_id"), d.get("course_id"))
            if err:
                return err
            exam.subject = subject
        for field in ("name", "total_items", "num_choices", "num_id_columns",
                      "parts", "passing_score", "layout_metadata"):
            if field in d:
                setattr(exam, field, d[field])

        total = exam.total_items
        if "total_items" in d and "parts" not in d:
            exam.parts = [{"label": "Part I", "start_item": 1, "end_item": total}]
        try:
            _validate_parts(exam.parts, total)
            _validate_layout(exam.layout_metadata, total)
            if "questions" in d:
                exam.questions = normalize_questions(d["questions"], total)
        except serializers.ValidationError as exc:
            transaction.set_rollback(True)
            return _bad(" ".join(str(m) for m in exc.detail))
        # Drop keys and questions that no longer fit the sheet.
        if exam.questions:
            exam.questions = [q for q in exam.questions if q.get("item_number", 0) <= total] or None
        letters = "ABCD"[: exam.num_choices]
        exam.answer_key = {
            k: v for k, v in (exam.answer_key or {}).items()
            if int(k) <= total and (v in letters or v == BONUS_KEY)
        }
        exam.save()
    stats = _exam_stats_map([exam.exam_id]).get(exam.exam_id, EMPTY_STATS)
    return Response({"success": True, "exam": _exam_payload(exam, full=True, stats=stats)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def quick_exam_answer_key(request, exam_id):
    """
    POST /api/grading/quick/exams/<id>/answer-key/   { "answer_key": {"1": "A", ...} }
    Replaces the key and re-grades every scan of the exam.
    """
    faculty, err = _faculty_or_error(request)
    if err:
        return err
    exam = QuickExam.objects.select_related("subject").filter(pk=exam_id, faculty=faculty).first()
    if not exam:
        return _not_found("Exam")

    ser = QuickAnswerKeySerializer(data=request.data)
    if not ser.is_valid():
        return Response({"success": False, "errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
    key = ser.validated_data["answer_key"]
    letters = "ABCD"[: exam.num_choices]
    for item_no, ans in key.items():
        if not 1 <= int(item_no) <= exam.total_items:
            return _bad(f"Item {item_no} is out of range (1–{exam.total_items}).")
        if ans != BONUS_KEY and ans not in letters:
            return _bad(f"Item {item_no}: this exam only uses choices {letters[0]}–{letters[-1]}.")

    with transaction.atomic():
        exam.answer_key = key
        exam.save(update_fields=["answer_key", "updated_at"])
        scans = list(exam.scans.all())
        for scan in scans:
            _grade(scan, exam)
        QuickExamScan.objects.bulk_update(scans, ["score_raw", "max_score", "score_percent"])

    return Response({
        "success": True,
        "detail": "Answer key saved.",
        "regraded_scans": len(scans),
        "exam": _exam_payload(exam, full=True),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def quick_exam_scans(request, exam_id):
    """
    GET /api/grading/quick/exams/<id>/scans/
    Records for one exam with a summary and per-item analysis.
    """
    faculty, err = _faculty_or_error(request)
    if err:
        return err
    exam = QuickExam.objects.select_related("subject").filter(pk=exam_id, faculty=faculty).first()
    if not exam:
        return _not_found("Exam")

    scans = list(exam.scans.order_by("-created_at"))
    rows = [_scan_payload(s, exam) for s in scans]
    pcts = [r["score_percent"] for r in rows if r["score_percent"] is not None]

    key = exam.answer_key or {}
    items = []
    for i in range(1, exam.total_items + 1):
        k = str(i)
        answered = [s.responses.get(k) for s in scans if (s.responses or {}).get(k)]
        correct = key.get(k)
        n_correct = (
            len(scans) if correct == BONUS_KEY
            else sum(1 for a in answered if correct and is_correct(a, correct))
        )
        items.append({
            "item": i,
            "correct_answer": correct,
            "correct": n_correct,
            "answered": len(answered),
            "blank": len(scans) - len(answered),
            "percent_correct": round(n_correct / len(scans) * 100, 1) if scans and correct else None,
            "choice_counts": {c: answered.count(c) for c in "ABCD"[: exam.num_choices]},
        })

    return Response({
        "success": True,
        "exam": _exam_payload(exam),
        "summary": {
            "scan_count": len(rows),
            "average_percent": round(sum(pcts) / len(pcts), 2) if pcts else None,
            "highest_percent": max(pcts) if pcts else None,
            "lowest_percent": min(pcts) if pcts else None,
            "passed_count": sum(1 for r in rows if r["passed"]),
            "flagged_count": sum(1 for r in rows if r["is_flagged"]),
        },
        "scans": rows,
        "item_analysis": items,
    })


# ── Scans ─────────────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def quick_scans(request):
    """
    POST /api/grading/quick/scans/
    Saves one on-device graded sheet. A sheet for a student ID that is already
    recorded on the exam replaces the old record.
    """
    faculty, err = _faculty_or_error(request)
    if err:
        return err
    ser = QuickScanCreateSerializer(data=request.data)
    if not ser.is_valid():
        return Response({"success": False, "errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
    d = ser.validated_data
    exam = QuickExam.objects.select_related("subject").filter(pk=d["exam_id"], faculty=faculty).first()
    if not exam:
        return _not_found("Exam")

    student_id = _clean_student_id(d.get("student_identifier")) or None
    name = (d.get("student_name") or "").strip() or None
    flag_reason = _truncate_flag_reason(d.get("flag_reason") or None)
    is_flagged = bool(d.get("is_flagged"))
    if not exam.answer_key:
        is_flagged = True
        flag_reason = _truncate_flag_reason(
            (flag_reason + "; " if flag_reason else "") + "No answer key on exam"
        )

    with transaction.atomic():
        existing = (
            exam.scans.select_for_update().filter(student_identifier=student_id).first()
            if student_id else None
        )
        scan = existing or QuickExamScan(exam=exam)
        scan.scanned_by = faculty
        scan.student_identifier = student_id
        scan.student_name = name or (existing.student_name if existing else None) \
            or _resolve_student_name(student_id)
        scan.responses = _clean_responses(d["responses"])
        scan.is_flagged = is_flagged
        scan.flag_reason = flag_reason
        _grade(scan, exam)
        scan.save()

    return Response(
        {"success": True, "scan": _scan_payload(scan, exam), "replaced": existing is not None},
        status=status.HTTP_200_OK if existing else status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def quick_scan_detail(request, scan_id):
    """
    GET    /api/grading/quick/scans/<id>/
    PATCH  /api/grading/quick/scans/<id>/   (student, name, responses, flag)
    DELETE /api/grading/quick/scans/<id>/
    """
    faculty, err = _faculty_or_error(request)
    if err:
        return err
    scan = (
        QuickExamScan.objects.select_related("exam", "exam__subject")
        .filter(pk=scan_id, exam__faculty=faculty)
        .first()
    )
    if not scan:
        return _not_found("Scan")

    if request.method == "GET":
        return Response({"success": True, "scan": _scan_payload(scan)})

    if request.method == "DELETE":
        scan.delete()
        return Response({"success": True, "detail": "Scan deleted."})

    ser = QuickScanPatchSerializer(data=request.data)
    if not ser.is_valid():
        return Response({"success": False, "errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
    d = ser.validated_data
    if "student_identifier" in d:
        new_id = _clean_student_id(d["student_identifier"]) or None
        if new_id and scan.exam.scans.filter(student_identifier=new_id).exclude(pk=scan.pk).exists():
            return _bad(
                f"{new_id} already has a record on this exam.", status.HTTP_409_CONFLICT
            )
        scan.student_identifier = new_id
    if "student_name" in d:
        scan.student_name = d["student_name"].strip() or None
    if "responses" in d:
        scan.responses = _clean_responses(d["responses"])
        _grade(scan, scan.exam)
    if "is_flagged" in d:
        scan.is_flagged = d["is_flagged"]
    if "flag_reason" in d:
        scan.flag_reason = _truncate_flag_reason(d["flag_reason"] or None)
    scan.save()
    return Response({"success": True, "scan": _scan_payload(scan)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def quick_records(request):
    """
    GET /api/grading/quick/records/?subject_id=&exam_id=&q=&limit=
    Records across all of the faculty's quick exams, newest first.
    """
    faculty, err = _faculty_or_error(request)
    if err:
        return err
    qs = QuickExamScan.objects.select_related("exam", "exam__subject").filter(
        exam__faculty=faculty
    )
    subject_id = request.query_params.get("subject_id")
    exam_id = request.query_params.get("exam_id")
    q = (request.query_params.get("q") or "").strip()
    if subject_id:
        qs = qs.filter(exam__subject_id=subject_id)
    if exam_id:
        qs = qs.filter(exam_id=exam_id)
    if q:
        qs = qs.filter(Q(student_identifier__icontains=q) | Q(student_name__icontains=q))
    try:
        limit = max(1, min(int(request.query_params.get("limit", 300)), 1000))
    except ValueError:
        limit = 300
    total = qs.count()
    scans = list(qs.order_by("-created_at")[:limit])
    return Response({
        "success": True,
        "total": total,
        "scans": [_scan_payload(s) for s in scans],
    })
