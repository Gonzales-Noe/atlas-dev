from rest_framework import serializers


class GoogleSheetsIngestSerializer(serializers.Serializer):
    """Serializer for Google Sheets data ingestion requests."""
    sheet_id = serializers.CharField(
        max_length=255,
        help_text="Google Sheets document ID"
    )
    range = serializers.CharField(
        max_length=255,
        help_text="Cell range (e.g., 'Sheet1!A1:F30')",
        required=False,
        default="Sheet1!A1:Z1000"
    )

    def validate_sheet_id(self, value):
        """Ensure sheet_id is not empty."""
        if not value.strip():
            raise serializers.ValidationError("sheet_id cannot be empty.")
        return value

    def validate_range(self, value):
        """Ensure range is in valid format."""
        if not value or '!' not in value:
            raise serializers.ValidationError(
                "range must be in format 'Sheet1!A1:F30'"
            )
        return value


class PrescriptiveAnalyticsSerializer(serializers.Serializer):
    """Serializer for prescriptive analytics request."""
    sheet_id = serializers.CharField(max_length=255)
    range = serializers.CharField(max_length=255)
    ilo_mapping = serializers.DictField(
        child=serializers.CharField(),
        help_text="Mapping of column index to ILO description. (e.g. {'0': 'ILO 1', '1': 'ILO 3'})"
    )

    def validate_sheet_id(self, value):
        if not value.strip():
            raise serializers.ValidationError("sheet_id cannot be empty.")
        return value

    def validate_range(self, value):
        if not value or '!' not in value:
            raise serializers.ValidationError("range must be in format 'Sheet1!A1:F30'")
        return value


class FacultySheetAnalysisSerializer(serializers.Serializer):
    """Serializer for faculty sheet ingestion, persistence, and analysis."""

    course_id = serializers.UUIDField(help_text="Course UUID that owns the uploaded grade sheet")
    sheet_id = serializers.CharField(max_length=255)
    range = serializers.CharField(max_length=255)
    weighting_schema = serializers.JSONField(required=False)
    term = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")

    def validate_sheet_id(self, value):
        if not value.strip():
            raise serializers.ValidationError("sheet_id cannot be empty.")
        return value

    def validate_range(self, value):
        if not value or '!' not in value:
            raise serializers.ValidationError("range must be in format 'Sheet1!A1:F30'")
        return value
