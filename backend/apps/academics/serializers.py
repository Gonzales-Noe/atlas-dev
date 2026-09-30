from rest_framework import serializers

from apps.integrations.models import (
    College,
    Course,
    Program,
    Section,
    YearLevel,
)


class CollegeSerializer(serializers.ModelSerializer):
    program_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = College
        fields = ['college_id', 'code', 'name', 'description', 'is_active', 'program_count']
        read_only_fields = ['college_id']

    def validate_code(self, value):
        return value.strip().upper()

    def validate(self, attrs):
        institution = self.context.get('institution')
        if institution is None:
            return attrs
        queryset = College.objects.filter(institution=institution)
        if self.instance:
            queryset = queryset.exclude(college_id=self.instance.college_id)
        code = attrs.get('code', getattr(self.instance, 'code', None))
        if code and queryset.filter(code__iexact=code).exists():
            raise serializers.ValidationError({'code': 'A college with this code already exists.'})
        name = attrs.get('name', getattr(self.instance, 'name', None))
        if name and queryset.filter(name__iexact=name).exists():
            raise serializers.ValidationError({'name': 'A college with this name already exists.'})
        return attrs


class ProgramSerializer(serializers.ModelSerializer):
    college_name = serializers.CharField(source='college.name', read_only=True)
    college_code = serializers.CharField(source='college.code', read_only=True)

    class Meta:
        model = Program
        fields = [
            'program_id', 'college', 'college_name', 'college_code',
            'code', 'name', 'description', 'is_active',
        ]
        read_only_fields = ['program_id']

    def validate_code(self, value):
        return value.strip().upper()

    def validate_college(self, value):
        institution = self.context.get('institution')
        if institution and value.institution_id != institution.institution_id:
            raise serializers.ValidationError('That college does not belong to your institution.')
        return value

    def validate(self, attrs):
        institution = self.context.get('institution')
        if institution is None:
            return attrs
        queryset = Program.objects.filter(institution=institution)
        if self.instance:
            queryset = queryset.exclude(program_id=self.instance.program_id)
        code = attrs.get('code', getattr(self.instance, 'code', None))
        if code and queryset.filter(code__iexact=code).exists():
            raise serializers.ValidationError({'code': 'A program with this code already exists.'})
        college = attrs.get('college', getattr(self.instance, 'college', None))
        name = attrs.get('name', getattr(self.instance, 'name', None))
        if college and name:
            duplicates = Program.objects.filter(college=college, name__iexact=name)
            if self.instance:
                duplicates = duplicates.exclude(program_id=self.instance.program_id)
            if duplicates.exists():
                raise serializers.ValidationError({'name': 'This college already has a program with that name.'})
        return attrs


class YearLevelSerializer(serializers.ModelSerializer):
    program = serializers.PrimaryKeyRelatedField(queryset=Program.objects.all())

    class Meta:
        model = YearLevel
        fields = ['year_id', 'program', 'year_number', 'label']
        read_only_fields = ['year_id']

    def validate_program(self, value):
        institution = self.context.get('institution')
        if institution and value.institution_id != institution.institution_id:
            raise serializers.ValidationError('That program does not belong to your institution.')
        return value

    def validate(self, attrs):
        program = attrs.get('program', getattr(self.instance, 'program', None))
        year_number = attrs.get('year_number', getattr(self.instance, 'year_number', None))
        if program is None:
            return attrs
        if not year_number or year_number < 1:
            raise serializers.ValidationError({'year_number': 'Year number must be 1 or greater.'})
        queryset = YearLevel.objects.filter(program=program, year_number=year_number)
        if self.instance:
            queryset = queryset.exclude(year_id=self.instance.year_id)
        if queryset.exists():
            raise serializers.ValidationError({'year_number': 'That year already exists for this program.'})
        return attrs


class SectionSerializer(serializers.ModelSerializer):
    year_level = serializers.PrimaryKeyRelatedField(queryset=YearLevel.objects.all())
    program = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = ['section_id', 'program', 'year_level', 'code', 'name', 'display_name']
        read_only_fields = ['section_id', 'program', 'display_name']

    def get_program(self, obj):
        return str(obj.program_id)

    def get_display_name(self, obj):
        return f'{obj.program.code} {obj.code}'

    def validate_code(self, value):
        return value.strip().upper()

    def validate_year_level(self, value):
        institution = self.context.get('institution')
        if institution and value.program.institution_id != institution.institution_id:
            raise serializers.ValidationError('That year level does not belong to your institution.')
        return value

    def validate(self, attrs):
        year_level = attrs.get('year_level', getattr(self.instance, 'year_level', None))
        code = attrs.get('code', getattr(self.instance, 'code', None))
        if year_level and code:
            queryset = Section.objects.filter(year_level=year_level, code__iexact=code)
            if self.instance:
                queryset = queryset.exclude(section_id=self.instance.section_id)
            if queryset.exists():
                raise serializers.ValidationError({'code': 'That section code already exists for this year.'})
        return attrs

    def create(self, validated_data):
        year_level = validated_data['year_level']
        validated_data['program'] = year_level.program
        validated_data['institution'] = year_level.program.institution
        return super().create(validated_data)


class CourseSerializer(serializers.ModelSerializer):
    program_name = serializers.CharField(source='program.name', read_only=True, allow_null=True)
    college_name = serializers.SerializerMethodField()
    year_label = serializers.SerializerMethodField()
    section_code = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            'course_id', 'program', 'program_name', 'college_name',
            'year_level', 'year_label', 'section', 'section_code',
            'course_code', 'course_title', 'description', 'category',
            'units', 'is_active',
        ]
        read_only_fields = ['course_id']

    def get_college_name(self, obj):
        return obj.program.college.name if obj.program_id else None

    def get_year_label(self, obj):
        return obj.year_level.display_name if obj.year_level_id else None

    def get_section_code(self, obj):
        return obj.section.code if obj.section_id else None

    def validate_course_code(self, value):
        return value.strip().upper()

    def validate_program(self, value):
        institution = self.context.get('institution')
        if institution and value.institution_id != institution.institution_id:
            raise serializers.ValidationError('That program does not belong to your institution.')
        return value

    def validate_year_level(self, value):
        if value is None:
            return value
        institution = self.context.get('institution')
        if institution and value.program.institution_id != institution.institution_id:
            raise serializers.ValidationError('That year level does not belong to your institution.')
        return value

    def validate_section(self, value):
        if value is None:
            return value
        institution = self.context.get('institution')
        if institution and value.program.institution_id != institution.institution_id:
            raise serializers.ValidationError('That section does not belong to your institution.')
        return value

    def validate(self, attrs):
        institution = self.context.get('institution')
        program = attrs.get('program', getattr(self.instance, 'program', None))
        year_level = attrs.get('year_level', getattr(self.instance, 'year_level', None))
        section = attrs.get('section', getattr(self.instance, 'section', None))

        if year_level and program and year_level.program_id != program.program_id:
            raise serializers.ValidationError({'year_level': 'The year level does not belong to the selected program.'})
        if section and program and section.program_id != program.program_id:
            raise serializers.ValidationError({'section': 'The section does not belong to the selected program.'})
        if section and year_level and section.year_level_id != year_level.year_id:
            raise serializers.ValidationError({'section': 'The section does not belong to the selected year level.'})

        code = attrs.get('course_code', getattr(self.instance, 'course_code', None))
        if institution and code:
            queryset = Course.objects.filter(institution=institution, course_code__iexact=code)
            if self.instance:
                queryset = queryset.exclude(course_id=self.instance.course_id)
            if queryset.exists():
                raise serializers.ValidationError({'course_code': 'A course with this code already exists in your institution.'})
        return attrs


class SetupStatusSerializer(serializers.Serializer):
    setup_completed = serializers.BooleanField()
    setup_completed_at = serializers.DateTimeField(allow_null=True)
    college_count = serializers.IntegerField()
    program_count = serializers.IntegerField()
    year_count = serializers.IntegerField()
    section_count = serializers.IntegerField()
    course_count = serializers.IntegerField()
    knowledge_base_count = serializers.IntegerField()


class CompleteSetupSerializer(serializers.Serializer):
    skip_knowledge_base = serializers.BooleanField(required=False, default=True)
