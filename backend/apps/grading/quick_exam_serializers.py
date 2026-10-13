from rest_framework import serializers

from .serializers import BubblePartSerializer

MIN_ITEMS = 50
MAX_ITEMS = 100


class QuickSubjectSerializer(serializers.Serializer):
    course_id = serializers.UUIDField()


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


class QuickQuestionSerializer(serializers.Serializer):
    question_text = serializers.CharField(allow_blank=True, max_length=5000, required=False, default="")
    choices = serializers.ListField(
        child=serializers.CharField(allow_blank=True, max_length=1000),
        required=False,
        default=list,
        max_length=4,
    )


def normalize_questions(questions, total):
    """Numbered question list, or None when nothing was actually written."""
    if not questions:
        return None
    if len(questions) != total:
        raise serializers.ValidationError(
            f"{len(questions)} questions were sent but the exam has {total} items."
        )
    out = [
        {
            "item_number": i,
            "question_text": (q.get("question_text") or "").strip(),
            "choices": [c.strip() for c in q.get("choices") or []],
        }
        for i, q in enumerate(questions, start=1)
    ]
    if not any(q["question_text"] or any(q["choices"]) for q in out):
        return None
    return out


class QuickExamCreateSerializer(serializers.Serializer):
    subject_id = serializers.UUIDField(required=False, allow_null=True)
    course_id = serializers.UUIDField(required=False, allow_null=True)
    name = serializers.CharField(max_length=150)
    total_items = serializers.IntegerField(min_value=MIN_ITEMS, max_value=MAX_ITEMS)
    num_choices = serializers.IntegerField(required=False, default=4, min_value=2, max_value=4)
    num_id_columns = serializers.IntegerField(required=False, default=8, min_value=4, max_value=8)
    parts = BubblePartSerializer(many=True, required=False, default=list)
    passing_score = serializers.DecimalField(
        required=False, allow_null=True, max_digits=5, decimal_places=2, min_value=0, max_value=100
    )
    layout_metadata = serializers.DictField()
    questions = QuickQuestionSerializer(many=True, required=False, allow_null=True)

    def validate(self, data):
        if not data.get("subject_id") and not data.get("course_id"):
            raise serializers.ValidationError("Choose one of your assigned courses.")
        total = data["total_items"]
        if data.get("parts"):
            _validate_parts(data["parts"], total)
        _validate_layout(data["layout_metadata"], total)
        data["questions"] = normalize_questions(data.get("questions"), total)
        return data


class QuickExamUpdateSerializer(serializers.Serializer):
    subject_id = serializers.UUIDField(required=False)
    course_id = serializers.UUIDField(required=False)
    name = serializers.CharField(required=False, max_length=150)
    total_items = serializers.IntegerField(required=False, min_value=MIN_ITEMS, max_value=MAX_ITEMS)
    num_choices = serializers.IntegerField(required=False, min_value=2, max_value=4)
    num_id_columns = serializers.IntegerField(required=False, min_value=4, max_value=8)
    parts = BubblePartSerializer(many=True, required=False)
    passing_score = serializers.DecimalField(
        required=False, allow_null=True, max_digits=5, decimal_places=2, min_value=0, max_value=100
    )
    layout_metadata = serializers.DictField(required=False)
    questions = QuickQuestionSerializer(many=True, required=False, allow_null=True)


class QuickAnswerKeySerializer(serializers.Serializer):
    """{ "1": "A", "2": "C", ... } — items left out have no key yet."""

    answer_key = serializers.DictField(child=serializers.CharField(max_length=1))

    def validate_answer_key(self, value):
        out = {}
        for item_no, ans in value.items():
            if not str(item_no).isdigit():
                raise serializers.ValidationError(f"Key must be a digit string, got '{item_no}'.")
            letter = str(ans).strip().upper()
            if letter not in ("A", "B", "C", "D", "*"):
                raise serializers.ValidationError(
                    f"Answer for item {item_no} must be A–D or * (bonus), got '{ans}'."
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
