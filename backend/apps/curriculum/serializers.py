from rest_framework import serializers

PROVIDER_CHOICES = ["ollama", "gemini", "gpt", "groq", "anthropic", "openrouter"]


class GenerateSyllabusSerializer(serializers.Serializer):
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
