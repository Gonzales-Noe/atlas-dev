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
    # Optional document metadata for filtered retrieval
    discipline = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        default='',
        help_text="Discipline category, e.g. 'Engineering', 'Education'",
    )
    program = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        default='',
        help_text="Academic program, e.g. 'BSCS', 'BSED'",
    )
    doc_type = serializers.CharField(
        max_length=50,
        required=False,
        allow_blank=True,
        default='',
        help_text="Document type, e.g. 'CHED_Handbook', 'Syllabus_Template'",
    )
    # Legacy field kept for backward compatibility
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


class CourseRagUploadSerializer(serializers.Serializer):
    """Serializer for faculty course-level RAG uploads."""

    file = serializers.FileField(required=True)
    file_type = serializers.ChoiceField(choices=['pdf', 'docx'], required=True)
    course_id = serializers.UUIDField(required=True)
    module_tag = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    term_tag = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')


class SemanticSearchSerializer(serializers.Serializer):
    """Serializer for semantic search requests."""

    query = serializers.CharField(required=True, max_length=4000)
    top_k = serializers.IntegerField(required=False, default=5, min_value=1, max_value=20)
    # Optional metadata pre-filters (passed through to rag_service.semantic_search)
    discipline = serializers.CharField(required=False, allow_blank=True, default='')
    program = serializers.CharField(required=False, allow_blank=True, default='')
    doc_type = serializers.CharField(required=False, allow_blank=True, default='')
