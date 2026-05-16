from rest_framework import serializers

PROVIDER_CHOICES = ["gemini", "gpt", "groq", "anthropic", "openrouter"]


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
