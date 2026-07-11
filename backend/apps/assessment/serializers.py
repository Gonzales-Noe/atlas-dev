from rest_framework import serializers

PROVIDER_CHOICES = ["ollama", "gemini", "gpt", "groq", "anthropic", "openrouter"]

ASSESSMENT_TYPE_CHOICES = [
    "quiz",
    "long quiz",
    "midterm exam",
    "final exam",
    "assignment",
    "project",
    "activity",
    "performance task",
]


class GenerateAssessmentSerializer(serializers.Serializer):
    course_name = serializers.CharField(required=True, max_length=255)
    assessment_type = serializers.ChoiceField(choices=ASSESSMENT_TYPE_CHOICES, required=True)
    num_items = serializers.IntegerField(required=False, default=20, min_value=5, max_value=100)
    # Optional list of CLO strings to include in the prompt
    clos = serializers.ListField(
        child=serializers.CharField(max_length=500),
        required=False,
        default=list,
        max_length=10,
    )
    provider = serializers.ChoiceField(
        choices=PROVIDER_CHOICES, required=False, allow_null=True, default=None
    )
    top_k = serializers.IntegerField(required=False, default=5, min_value=1, max_value=20)
    search_query = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")
    extra_instructions = serializers.CharField(
        required=False, allow_blank=True, max_length=1000, default=""
    )
