"""
Course exams created from the mobile app (no syllabus/TOS needed).

Writes exactly the rows the web writes, so everything downstream is shared:
  * ``assessments`` + ``assessment_items`` (rubric shape of
    ``curriculum.generate_assessment``) — visible in the web workspace;
  * ``bubble_sheet_templates`` linked to the assessment, with the answer key
    and the web generator's ``layout_metadata`` — printed sheets carry the
    assessment QR, and scans land in ``bubble_sheet_scans`` as usual.

POST /api/grading/course-exams/
"""

from __future__ import annotations

import logging
import re

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.grading.models import BubbleSheetTemplate
from apps.integrations.models import Assessment, AssessmentItem, Course, Syllabus

from .views import (
    _bs_template_payload,
    _faculty_can_access_course,
    _faculty_only_response,
    _get_faculty_profile,
    _is_faculty_user,
)

logger = logging.getLogger(__name__)

# Generator capacity: two columns up to 72 items, three compact columns to 100.
MAX_ITEMS = 100
LETTERS = "ABCD"


class CourseExamItemSerializer(serializers.Serializer):
    question_text = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    choices = serializers.ListField(
        child=serializers.CharField(allow_blank=True, max_length=1000),
        required=False,
        default=list,
        max_length=4,
    )
    correct_answer = serializers.CharField(max_length=1)


class CourseExamCreateSerializer(serializers.Serializer):
    course_id = serializers.UUIDField()
    title = serializers.CharField(max_length=150)
    exam_type = serializers.CharField(max_length=100, required=False, default="Quiz")
    term = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    num_choices = serializers.IntegerField(min_value=2, max_value=4, required=False, default=4)
    num_id_columns = serializers.IntegerField(min_value=4, max_value=8, required=False, default=8)
    passing_score = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=0, max_value=100,
        required=False, allow_null=True,
    )
    items = CourseExamItemSerializer(many=True, allow_empty=False)

    def validate_items(self, items):
        if len(items) > MAX_ITEMS:
            raise serializers.ValidationError(
                f"A bubble sheet holds at most {MAX_ITEMS} items."
            )
        return items

    def validate(self, data):
        allowed = LETTERS[: data["num_choices"]]
        errors = []
        for n, item in enumerate(data["items"], start=1):
            ans = item["correct_answer"].strip().upper()
            if ans not in allowed:
                errors.append(f"Item {n}: answer must be one of {', '.join(allowed)}.")
                continue
            item["correct_answer"] = ans
            filled = [c.strip() for c in item.get("choices") or [] if c.strip()]
            if filled and len(filled) > data["num_choices"]:
                errors.append(f"Item {n}: has more than {data['num_choices']} choices.")
        if errors:
            raise serializers.ValidationError({"items": errors[:20]})
        return data


_CHOICE_LABEL = re.compile(r"^\(?[A-Da-d][\.\)]\s+")


def _labelled_choices(choices) -> list[str]:
    """``["A. …", "B. …"]`` — the label format the web stores and shows."""
    texts = [_CHOICE_LABEL.sub("", c.strip()) for c in choices if c and c.strip()]
    return [f"{LETTERS[i]}. {t}" for i, t in enumerate(texts[:4])]


def _default_term(course) -> str:
    syllabus = (
        Syllabus.objects.filter(course=course)
        .order_by("-generated_at", "-syllabus_id")
        .first()
    )
    if not syllabus:
        return ""
    content = syllabus.syllabus_content if isinstance(syllabus.syllabus_content, dict) else {}
    return str(content.get("semester_year") or syllabus.term or "").strip()[:100]


def _generate_layout(template) -> bool:
    """Run the web generator once so the sheet is scannable right away."""
    try:
        from apps.grading.services.bubble_sheet_generator import BubbleSheetGeneratorService

        _, layout = BubbleSheetGeneratorService().generate(template)
    except Exception:  # generator deps missing → mobile retries via generate-pdf
        logger.exception("Bubble sheet layout generation failed for %s", template.pk)
        return False
    template.layout_metadata = layout
    template.save(update_fields=["layout_metadata", "updated_at"])
    return True


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def course_exams(request):
    if not _is_faculty_user(request):
        return _faculty_only_response()

    ser = CourseExamCreateSerializer(data=request.data)
    if not ser.is_valid():
        return Response({"success": False, "errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
    d = ser.validated_data

    faculty = _get_faculty_profile(request)
    if not _faculty_can_access_course(faculty, d["course_id"]):
        return Response(
            {"success": False, "detail": "Course not found in your teaching load."},
            status=status.HTTP_403_FORBIDDEN,
        )
    course = Course.objects.filter(pk=d["course_id"]).first()
    if not course:
        return Response({"success": False, "detail": "Course not found."}, status=status.HTTP_404_NOT_FOUND)

    title = d["title"].strip()
    exam_type = (d.get("exam_type") or "Quiz").strip() or "Quiz"
    term = (d.get("term") or "").strip() or _default_term(course)
    items = d["items"]
    total = len(items)

    with transaction.atomic():
        assessment = Assessment.objects.create(
            course=course,
            title=title,
            assessment_type=exam_type.lower(),
            term=term,
            status="Generated",
            generated_at=timezone.now(),
        )
        AssessmentItem.objects.bulk_create([
            AssessmentItem(
                assessment=assessment,
                module=None,
                question_text=(item.get("question_text") or "").strip() or f"Item {n}",
                item_type=exam_type.lower(),
                difficulty="",
                rubric={
                    "item_number": n,
                    "section_title": "General Section",
                    "exam_label": exam_type,
                    "bloom_level": "",
                    "bloom_verb": "",
                    "ilo_refs": [],
                    "choices": _labelled_choices(item.get("choices") or []),
                    "correct_answer": item["correct_answer"],
                    "answer_key": "",
                    "points": 1,
                    "assessment_name": title,
                    "assessment_code": "",
                    "assessment_task_label": exam_type,
                    "assessment_total_items": total,
                    "matched_module_id": None,
                    "matched_module_title": "",
                    "matched_module_week": None,
                    "created_via": "mobile",
                },
            )
            for n, item in enumerate(items, start=1)
        ])
        template = BubbleSheetTemplate.objects.create(
            course=course,
            assessment=assessment,
            name=title[:150],
            total_items=total,
            num_choices=d["num_choices"],
            parts=[{"label": "Part I", "start_item": 1, "end_item": total}],
            has_essay=False,
            essay_lines=0,
            passing_score=d.get("passing_score"),
            layout_metadata={"num_id_columns": d["num_id_columns"]},
            answer_key={str(n): item["correct_answer"] for n, item in enumerate(items, start=1)},
            created_by=faculty,
        )

    layout_ready = _generate_layout(template)

    return Response(
        {
            "success": True,
            "assessment": {
                "assessment_id": str(assessment.assessment_id),
                "title": assessment.title,
                "assessment_type": assessment.assessment_type,
                "term": assessment.term,
                "status": assessment.status,
                "generated_at": assessment.generated_at,
                "total_items": total,
            },
            "template": _bs_template_payload(template),
            "layout_ready": layout_ready,
        },
        status=status.HTTP_201_CREATED,
    )
