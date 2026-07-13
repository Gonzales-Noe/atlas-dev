from rest_framework import serializers

from apps.grading.models import OmrJobStatus, OmrReviewActionType


class OmrTemplateCreateSerializer(serializers.Serializer):
    course_id = serializers.UUIDField(required=True)
    name = serializers.CharField(required=True, max_length=120)
    template_file = serializers.FileField(required=True)
    evaluation_file = serializers.FileField(required=True)
    form_code = serializers.CharField(required=False, allow_blank=True, max_length=50)
    total_items = serializers.IntegerField(required=False, min_value=0, default=0)
    passing_score = serializers.DecimalField(
        required=False, max_digits=7, decimal_places=2, allow_null=True
    )
    confidence_threshold = serializers.DecimalField(
        required=False, max_digits=5, decimal_places=4, min_value=0, max_value=1, default=0.8500
    )
    is_active = serializers.BooleanField(required=False, default=True)


class OmrTemplateUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, max_length=120)
    form_code = serializers.CharField(required=False, allow_blank=True, max_length=50)
    total_items = serializers.IntegerField(required=False, min_value=0)
    passing_score = serializers.DecimalField(
        required=False, max_digits=7, decimal_places=2, allow_null=True
    )
    confidence_threshold = serializers.DecimalField(
        required=False, max_digits=5, decimal_places=4, min_value=0, max_value=1
    )
    is_active = serializers.BooleanField(required=False)


class OmrJobCreateSerializer(serializers.Serializer):
    course_id = serializers.UUIDField(required=True)
    assessment_id = serializers.UUIDField(required=True)
    template_id = serializers.UUIDField(required=True)
    scan_bundle = serializers.FileField(required=True)
    confidence_threshold = serializers.DecimalField(
        required=False, max_digits=5, decimal_places=4, min_value=0, max_value=1
    )


class OmrJobResultPatchSerializer(serializers.Serializer):
    student_identifier_raw = serializers.CharField(required=False, max_length=255)
    student_identifier_normalized = serializers.CharField(required=False, max_length=255)
    score_raw = serializers.DecimalField(required=False, max_digits=7, decimal_places=2)
    score_percent = serializers.DecimalField(required=False, max_digits=5, decimal_places=2)
    max_score = serializers.DecimalField(required=False, max_digits=7, decimal_places=2)
    is_flagged = serializers.BooleanField(required=False)
    flag_reason = serializers.CharField(required=False, allow_blank=True, max_length=255)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class OmrFinalizeImportSerializer(serializers.Serializer):
    policy = serializers.ChoiceField(
        required=False,
        choices=["skip_existing", "overwrite_existing"],
        default="skip_existing",
    )


class OmrJobStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=OmrJobStatus.choices)


class OmrReviewActionSerializer(serializers.Serializer):
    action_type = serializers.ChoiceField(choices=OmrReviewActionType.choices)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=2000)


# ── Bubble Sheet Serializers ─────────────────────────────────────────────────

class BubblePartSerializer(serializers.Serializer):
    label = serializers.CharField(required=True, max_length=80)
    start_item = serializers.IntegerField(required=True, min_value=1)
    end_item = serializers.IntegerField(required=True, min_value=1)

    def validate(self, data):
        if data["end_item"] < data["start_item"]:
            raise serializers.ValidationError("end_item must be >= start_item.")
        return data


class BubbleSheetTemplateCreateSerializer(serializers.Serializer):
    course_id = serializers.UUIDField(required=True)
    assessment_id = serializers.UUIDField(required=False, allow_null=True)
    name = serializers.CharField(required=True, max_length=150)
    total_items = serializers.IntegerField(required=True, min_value=1, max_value=300)
    num_choices = serializers.IntegerField(required=False, default=4, min_value=2, max_value=5)
    parts = BubblePartSerializer(many=True, required=False, default=list)
    has_essay = serializers.BooleanField(required=False, default=False)
    essay_lines = serializers.IntegerField(required=False, default=10, min_value=0, max_value=50)
    passing_score = serializers.DecimalField(
        required=False, max_digits=7, decimal_places=2, allow_null=True
    )
    layout_metadata = serializers.DictField(required=False, default=dict)

    def validate(self, data):
        parts = data.get("parts", [])
        total = data["total_items"]
        if parts:
            # All items 1..total_items must be covered exactly once
            covered = set()
            for p in parts:
                for i in range(p["start_item"], p["end_item"] + 1):
                    if i in covered:
                        raise serializers.ValidationError(
                            f"Item {i} appears in more than one part."
                        )
                    covered.add(i)
            missing = set(range(1, total + 1)) - covered
            if missing:
                raise serializers.ValidationError(
                    f"Parts do not cover items: {sorted(missing)[:10]}"
                )
        return data


class BubbleSheetTemplateUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, max_length=150)
    passing_score = serializers.DecimalField(
        required=False, max_digits=7, decimal_places=2, allow_null=True
    )
    has_essay = serializers.BooleanField(required=False)
    essay_lines = serializers.IntegerField(required=False, min_value=0, max_value=50)
    layout_metadata = serializers.DictField(required=False)


class BubbleAnswerKeySerializer(serializers.Serializer):
    """{ "1": "A", "2": "C", ... }"""
    answer_key = serializers.DictField(
        child=serializers.CharField(max_length=1),
        required=True,
    )

    def validate_answer_key(self, value):
        for item_no, ans in value.items():
            if not str(item_no).isdigit():
                raise serializers.ValidationError(f"Key must be a digit string, got '{item_no}'.")
            if ans.upper() not in "ABCDE":
                raise serializers.ValidationError(
                    f"Answer for item {item_no} must be A–E, got '{ans}'."
                )
        return {str(k): v.upper() for k, v in value.items()}


class BubbleSheetScanSerializer(serializers.Serializer):
    template_id = serializers.UUIDField(required=True)
    image = serializers.ImageField(required=True)


class BubbleScanPatchSerializer(serializers.Serializer):
    student_identifier = serializers.CharField(required=False, max_length=100)
    responses = serializers.DictField(
        child=serializers.CharField(max_length=1), required=False
    )
    is_flagged = serializers.BooleanField(required=False)
    flag_reason = serializers.CharField(required=False, allow_blank=True, max_length=255)
