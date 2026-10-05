from rest_framework import serializers

from .serializers import BubblePartSerializer

MAX_ITEMS = 100


class QuickSubjectSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150, trim_whitespace=True)


def _validate_parts(parts, total):
    covered = set()
    for p in parts:
        if p["end_item"] > total:
            raise serializers.ValidationError(
                f"Part '{p['label']}' ends at {p['end_item']} but the exam has {total} items."
            )
        for i in range(p["start_item"], p["end_item"] + 1):
            if i in covered:
                raise serializers.ValidationError(f"Item {i} appears in more than one part.")
            covered.add(i)
    missing = set(range(1, total + 1)) - covered
    if missing:
        raise serializers.ValidationError(f"Parts do not cover items: {sorted(missing)[:10]}")


def _validate_layout(layout, total):
    items = layout.get("items") if isinstance(layout, dict) else None
    if not isinstance(items, dict) or len(items) != total:
        raise serializers.ValidationError("layout_metadata.items must list every item.")


class QuickExamCreateSerializer(serializers.Serializer):
    subject_id = serializers.UUIDField(required=False, allow_null=True)
    subject_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    name = serializers.CharField(max_length=150)
    total_items = serializers.IntegerField(min_value=1, max_value=MAX_ITEMS)
    num_choices = serializers.IntegerField(required=False, default=4, min_value=2, max_value=4)
    num_id_columns = serializers.IntegerField(required=False, default=8, min_value=4, max_value=8)
    parts = BubblePartSerializer(many=True, required=False, default=list)
    passing_score = serializers.DecimalField(
        required=False, allow_null=True, max_digits=5, decimal_places=2, min_value=0, max_value=100
    )
    layout_metadata = serializers.DictField()

    def validate(self, data):
        if not data.get("subject_id") and not (data.get("subject_name") or "").strip():
            raise serializers.ValidationError("Choose a subject or enter a new one.")
        total = data["total_items"]
        if data.get("parts"):
            _validate_parts(data["parts"], total)
        _validate_layout(data["layout_metadata"], total)
        return data


class QuickExamUpdateSerializer(serializers.Serializer):
    subject_id = serializers.UUIDField(required=False)
    subject_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    name = serializers.CharField(required=False, max_length=150)
    total_items = serializers.IntegerField(required=False, min_value=1, max_value=MAX_ITEMS)
    num_choices = serializers.IntegerField(required=False, min_value=2, max_value=4)
    num_id_columns = serializers.IntegerField(required=False, min_value=4, max_value=8)
    parts = BubblePartSerializer(many=True, required=False)
    passing_score = serializers.DecimalField(
        required=False, allow_null=True, max_digits=5, decimal_places=2, min_value=0, max_value=100
    )
    layout_metadata = serializers.DictField(required=False)


class QuickAnswerKeySerializer(serializers.Serializer):
    """{ "1": "A", "2": "C", ... } — items left out have no key yet."""

    answer_key = serializers.DictField(child=serializers.CharField(max_length=1))

    def validate_answer_key(self, value):
        out = {}
        for item_no, ans in value.items():
            if not str(item_no).isdigit():
                raise serializers.ValidationError(f"Key must be a digit string, got '{item_no}'.")
            letter = str(ans).strip().upper()
            if letter not in ("A", "B", "C", "D"):
                raise serializers.ValidationError(
                    f"Answer for item {item_no} must be A–D, got '{ans}'."
                )
            out[str(int(item_no))] = letter
        return out


class QuickScanCreateSerializer(serializers.Serializer):
    exam_id = serializers.UUIDField()
    student_identifier = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=64
    )
    student_name = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=150
    )
    responses = serializers.DictField(child=serializers.CharField(allow_blank=True, max_length=4))
    is_flagged = serializers.BooleanField(required=False, default=False)
    flag_reason = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=255
    )


class QuickScanPatchSerializer(serializers.Serializer):
    student_identifier = serializers.CharField(required=False, allow_blank=True, max_length=64)
    student_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    responses = serializers.DictField(
        child=serializers.CharField(allow_blank=True, max_length=4), required=False
    )
    is_flagged = serializers.BooleanField(required=False)
    flag_reason = serializers.CharField(required=False, allow_blank=True, max_length=255)
