from rest_framework import serializers

from apps.integrations.llm_service import ACCEPTED_PROVIDER_CHOICES as PROVIDER_CHOICES


class GenerateSyllabusSerializer(serializers.Serializer):
    course_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    course_name = serializers.CharField(required=True, max_length=255)
    course_code = serializers.CharField(required=False, allow_blank=True, max_length=50, default="")
    num_weeks = serializers.IntegerField(required=False, default=16, min_value=1, max_value=52)
    provider = serializers.ChoiceField(
        choices=PROVIDER_CHOICES, required=False, allow_null=True, default=None
    )
    top_k = serializers.IntegerField(required=False, default=5, min_value=1, max_value=20)
    # Optional override: if blank, auto-built from course_name
    search_query = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")
    extra_instructions = serializers.CharField(
        required=False, allow_blank=True, max_length=1000, default=""
    )
    selected_doc_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=True, default=list
    )


class GenerateModuleSerializer(serializers.Serializer):
    course_id = serializers.UUIDField(required=True)
    course_name = serializers.CharField(required=True, max_length=255)
    module_title = serializers.CharField(required=True, max_length=255)
    week_number = serializers.IntegerField(required=False, default=1, min_value=1, max_value=52)
    provider = serializers.ChoiceField(
        choices=PROVIDER_CHOICES, required=False, allow_null=True, default=None
    )
    top_k = serializers.IntegerField(required=False, default=5, min_value=1, max_value=20)
    search_query = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")
    extra_instructions = serializers.CharField(
        required=False, allow_blank=True, max_length=1000, default=""
    )
    selected_doc_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=True, default=list
    )
    # ── Where the topic came from (Syllabus section / subsection) ──────────
    # The frontend resolves the topic inside the selected syllabus section and
    # sends it along, so the model always grounds on the faculty's own text
    # instead of guessing from the week number alone.
    section_key = serializers.CharField(required=False, allow_blank=True, default="", max_length=120)
    section_label = serializers.CharField(required=False, allow_blank=True, default="", max_length=255)
    subsection_key = serializers.CharField(required=False, allow_blank=True, default="", max_length=120)
    subsection_label = serializers.CharField(required=False, allow_blank=True, default="", max_length=255)
    topic = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)
    subtopics = serializers.ListField(
        child=serializers.CharField(allow_blank=True, max_length=300),
        required=False,
        allow_empty=True,
        default=list,
    )
    activity_title = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=300
    )
    syllabus_context = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=8000
    )
    structuring_level = serializers.ChoiceField(
        choices=(
            ("standard", "Standard"),
            ("detailed", "Detailed"),
            ("concise", "Concise"),
            ("activity", "Activity-led"),
        ),
        required=False,
        allow_null=True,
        default="standard",
    )


class CurriculumMetricsSerializer(serializers.Serializer):
    """
    Accepts a syllabus_content JSON blob and returns curriculum quality metrics
    (IC, AM, CBI, SC, FA, CRI) computed by metrics.py — no DB required.

    Either pass an explicit syllabus_content dict, or pass a course_id to let
    the backend look up the latest saved syllabus automatically.
    """
    course_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    syllabus_content = serializers.DictField(
        child=serializers.JSONField(), required=False, allow_null=True, default=None
    )
