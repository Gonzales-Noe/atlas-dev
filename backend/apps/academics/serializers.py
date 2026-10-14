from rest_framework import serializers

from apps.integrations.models import Course, Section


class SectionSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = ['section_id', 'code', 'name', 'display_name']
        read_only_fields = ['section_id', 'display_name']

    def get_display_name(self, obj):
        return obj.name or obj.code

    def validate_code(self, value):
        return value.strip()

    def validate(self, attrs):
        institution = self.context.get('institution')
        code = attrs.get('code', getattr(self.instance, 'code', None))
        if institution and code:
            queryset = Section.objects.filter(
                institution=institution,
                code__iexact=code,
            )
            if self.instance:
                queryset = queryset.exclude(section_id=self.instance.section_id)
            if queryset.exists():
                raise serializers.ValidationError({'code': 'A section with this code already exists.'})
        return attrs

    def create(self, validated_data):
        validated_data['institution'] = self.context['institution']
        return super().create(validated_data)


class CourseSerializer(serializers.ModelSerializer):
    section_code = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            'course_id', 'section', 'section_code', 'course_code', 'course_title',
            'description', 'category', 'units', 'is_active',
        ]
        read_only_fields = ['course_id', 'section_code']

    def get_section_code(self, obj):
        return obj.section.code if obj.section_id else None

    def validate_course_code(self, value):
        return value.strip().upper()

    def validate_section(self, value):
        if value is None:
            return value
        institution = self.context.get('institution')
        if institution and value.institution_id != institution.institution_id:
            if not value.program_id or value.program.institution_id != institution.institution_id:
                raise serializers.ValidationError('That section does not belong to your institution.')
        return value

    def validate(self, attrs):
        institution = self.context.get('institution')
        code = attrs.get('course_code', getattr(self.instance, 'course_code', None))
        if institution and code:
            queryset = Course.objects.filter(institution=institution, course_code__iexact=code)
            if self.instance:
                queryset = queryset.exclude(course_id=self.instance.course_id)
            if queryset.exists():
                raise serializers.ValidationError({
                    'course_code': 'A course with this code already exists in your institution.',
                })
        return attrs


class SetupStatusSerializer(serializers.Serializer):
    setup_completed = serializers.BooleanField()
    setup_completed_at = serializers.DateTimeField(allow_null=True)
    section_count = serializers.IntegerField(required=False)
    course_count = serializers.IntegerField(required=False)
    faculty_count = serializers.IntegerField(required=False)
    knowledge_base_count = serializers.IntegerField(required=False)


class CompleteSetupSerializer(serializers.Serializer):
    skip_knowledge_base = serializers.BooleanField(required=False, default=True)
