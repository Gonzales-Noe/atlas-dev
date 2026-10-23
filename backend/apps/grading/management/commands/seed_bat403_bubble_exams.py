"""Seed BAT 403 Midterm + Final assessments and bubble-sheet templates.

IDs match generate_bat403_shaded_sheets.py so printed QR codes resolve.

  python manage.py seed_bat403_bubble_exams
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.grading.models import BubbleSheetTemplate
from apps.grading.services.bubble_sheet_generator import BubbleSheetGeneratorService
from apps.integrations.models import Assessment, Course

COURSE_ID = "77aad1cf-b19f-4912-acbe-c4ab64e31d89"
FACULTY_ID = "a413c9c9-6153-41e8-ab00-ffdc1c053d85"

MIDTERM_ASSESSMENT_ID = "a4031111-1111-4111-a111-111111111111"
FINAL_ASSESSMENT_ID = "a4032222-2222-4222-a222-222222222222"
MIDTERM_TEMPLATE_ID = "b4031111-1111-4111-b111-111111111111"
FINAL_TEMPLATE_ID = "b4032222-2222-4222-b222-222222222222"

TOTAL_ITEMS = 60
NUM_CHOICES = 4
TERM = "Second Semester & A.Y 2025-2026"
CHOICES = "ABCD"

MIDTERM_KEY = {
    "1": "B", "2": "D", "3": "A", "4": "D", "5": "A",
    "6": "C", "7": "A", "8": "C", "9": "D", "10": "A",
    "11": "A", "12": "C", "13": "C", "14": "A", "15": "D",
    "16": "B", "17": "D", "18": "D", "19": "C", "20": "C",
    "21": "A", "22": "C", "23": "D", "24": "C", "25": "A",
    "26": "B", "27": "C", "28": "D", "29": "A", "30": "A",
    "31": "A", "32": "C", "33": "B", "34": "A", "35": "A",
    "36": "D", "37": "A", "38": "A", "39": "B", "40": "A",
    "41": "C", "42": "A", "43": "B", "44": "A", "45": "A",
    "46": "A", "47": "A", "48": "A", "49": "A", "50": "D",
    "51": "A", "52": "A", "53": "B", "54": "D", "55": "C",
    "56": "A", "57": "A", "58": "C", "59": "C", "60": "A",
}
FINAL_KEY = {
    str(i): CHOICES[(CHOICES.index(MIDTERM_KEY[str(i)]) + 1) % len(CHOICES)]
    for i in range(1, TOTAL_ITEMS + 1)
}


class Command(BaseCommand):
    help = "Seed BAT 403 midterm/final assessments + bubble templates for OMR testing."

    @transaction.atomic
    def handle(self, *args, **options):
        course, created = Course.objects.get_or_create(
            course_id=COURSE_ID,
            defaults={
                "course_code": "BAT 403",
                "course_title": "Fundamentals on EDM",
            },
        )
        self.stdout.write(
            f"Course BAT 403 {'created' if created else 'found'}: {course.course_id}"
        )

        exams = [
            (
                MIDTERM_ASSESSMENT_ID,
                MIDTERM_TEMPLATE_ID,
                "BAT 403 Midterm Examination",
                "midterm exam",
                MIDTERM_KEY,
            ),
            (
                FINAL_ASSESSMENT_ID,
                FINAL_TEMPLATE_ID,
                "BAT 403 Final Examination",
                "final exam",
                FINAL_KEY,
            ),
        ]

        gen = BubbleSheetGeneratorService()
        for aid, tid, title, atype, key in exams:
            assessment, a_created = Assessment.objects.update_or_create(
                assessment_id=aid,
                defaults={
                    "course": course,
                    "title": title,
                    "assessment_type": atype,
                    "term": TERM,
                    "status": "Generated",
                    "generated_at": timezone.now(),
                },
            )
            self.stdout.write(
                f"  Assessment {title}: {'created' if a_created else 'updated'} ({assessment.assessment_id})"
            )

            defaults = {
                "course": course,
                "assessment": assessment,
                "name": f"{title} Answer Sheet",
                "total_items": TOTAL_ITEMS,
                "num_choices": NUM_CHOICES,
                "parts": [{"label": "Part I", "start_item": 1, "end_item": TOTAL_ITEMS}],
                "has_essay": False,
                "essay_lines": 0,
                "answer_key": key,
                "layout_metadata": {"num_id_columns": 8},
            }
            from apps.integrations.models import UserProfile

            if UserProfile.objects.filter(pk=FACULTY_ID).exists():
                defaults["created_by_id"] = FACULTY_ID

            template, t_created = BubbleSheetTemplate.objects.update_or_create(
                template_id=tid,
                defaults=defaults,
            )
            # Bake layout positions from a blank generate pass.
            _pdf, layout = gen.generate(template)
            template.layout_metadata = layout
            template.answer_key = key
            template.save(update_fields=["layout_metadata", "answer_key", "updated_at"])
            self.stdout.write(
                f"  Template {template.name}: {'created' if t_created else 'updated'} "
                f"({template.template_id}, keyed={len(key)})"
            )

        self.stdout.write(self.style.SUCCESS("BAT 403 midterm + final bubble exams ready."))
