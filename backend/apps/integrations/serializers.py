from rest_framework import serializers
from .models import CourseFile, ParentChunk, ChildChunk


class ChildChunkSerializer(serializers.ModelSerializer):
    """Serializer for child chunks."""
    
    class Meta:
        model = ChildChunk
        fields = [
            'child_id', 'parent', 'uploader', 
            'overlap_text', 'embedding_vector'
        ]

class ParentChunkSerializer(serializers.ModelSerializer):
    """Serializer for parent chunks."""
    
    children = ChildChunkSerializer(many=True, read_only=True)
    
    class Meta:
        model = ParentChunk
        fields = [
            'parent_id', 'records', 'uploader', 'module_tag',
            'term_tag', 'parent_content', 'children', 
        ]
        read_only_fields = ['parent_id']



class FileUploadSerializer(serializers.Serializer):
    """Serializer for file upload requests."""
    
    file = serializers.FileField(required=True)
    file_type = serializers.ChoiceField(
        choices=['pdf', 'docx'],
        required=True
    )
    course_id = serializers.CharField(
        max_length=50,
        required=False,
        allow_blank=True
    )
    course_name = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True
    )
    
    def validate_file(self, value):
        """Validate file."""
        if not value:
            raise serializers.ValidationError("File is required")
        return value


class AnthropicTestSerializer(serializers.Serializer):
    """Serializer for Anthropic API test requests."""
    
    user_message = serializers.CharField(
        required=True,
        help_text="Message to send to Claude API"
    )
    model = serializers.CharField(
        required=False,
        default="claude-3-5-sonnet-20241022",
        help_text="Claude model to use"
    )
    max_tokens = serializers.IntegerField(
        required=False,
        default=1024,
        min_value=1,
        max_value=4096
    )
    system_prompt = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Optional system prompt"
    )


class SemanticSearchSerializer(serializers.Serializer):
    """Serializer for semantic search requests."""

    query = serializers.CharField(required=True, max_length=4000)
    top_k = serializers.IntegerField(required=False, default=5, min_value=1, max_value=20)
