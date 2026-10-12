from django.db import transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations.models import (
    College,
    Course,
    CourseLoad,
    GlobalDocument,
    InstitutionCustomization,
    Program,
    Section,
    UserRole,
    YearLevel,
)

from .serializers import (
    CollegeSerializer,
    CompleteSetupSerializer,
    CourseSerializer,
    ProgramSerializer,
    SectionSerializer,
    SetupStatusSerializer,
    YearLevelSerializer,
)


def _require_admin(request):
    """Return an error Response when the caller is not an institution admin."""
    role = getattr(request.user, 'role', None)
    if role not in {UserRole.ADMIN, UserRole.SUPERADMIN}:
        return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
    institution = getattr(request.user, 'institution', None)
    if institution is None:
        return Response(
            {'detail': 'Your account is not linked to an institution.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


class AcademicBaseView(APIView):
    def institution(self, request):
        return request.user.institution


class SetupStatusView(APIView):
    """Reports whether the admin has finished the first-time setup wizard."""

    def get(self, request):
        institution = getattr(request.user, 'institution', None)
        if institution is None:
            payload = {
                'setup_completed': False,
                'setup_completed_at': None,
                'college_count': 0,
                'program_count': 0,
                'year_count': 0,
                'section_count': 0,
                'course_count': 0,
                'knowledge_base_count': 0,
            }
            return Response(SetupStatusSerializer(payload).data)

        colleges = College.objects.filter(institution=institution)
        programs = Program.objects.filter(institution=institution)
        years = YearLevel.objects.filter(program__institution=institution)
        sections = Section.objects.filter(program__institution=institution)
        courses = Course.objects.filter(institution=institution)

        payload = {
            'setup_completed': institution.setup_completed,
            'setup_completed_at': institution.setup_completed_at,
            'college_count': colleges.count(),
            'program_count': programs.count(),
            'year_count': years.count(),
            'section_count': sections.count(),
            'course_count': courses.count(),
            'knowledge_base_count': GlobalDocument.objects.count(),
        }
        return Response(SetupStatusSerializer(payload).data)


class AcademicStructureView(AcademicBaseView):
    """Full academic tree for the caller's institution."""

    def get(self, request):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)

        colleges = (
            College.objects.filter(institution=institution)
            .annotate(program_count=Count('programs', distinct=True))
            .order_by('name')
        )
        programs = Program.objects.filter(institution=institution).order_by('name')
        years = YearLevel.objects.filter(program__institution=institution).order_by('program__name', 'year_number')
        sections = (
            Section.objects.filter(program__institution=institution)
            .select_related('program')
            .order_by('program__name', 'year_level__year_number', 'code')
        )
        courses = (
            Course.objects.filter(institution=institution)
            .select_related('program', 'program__college', 'year_level', 'section')
            .order_by('course_code')
        )

        return Response({
            'colleges': CollegeSerializer(colleges, many=True).data,
            'programs': ProgramSerializer(programs, many=True).data,
            'year_levels': YearLevelSerializer(years, many=True).data,
            'sections': SectionSerializer(sections, many=True).data,
            'courses': CourseSerializer(courses, many=True).data,
        })


class CollegeListCreateView(AcademicBaseView):
    def get(self, request):
        denied = _require_admin(request)
        if denied:
            return denied
        colleges = (
            College.objects.filter(institution=self.institution(request))
            .annotate(program_count=Count('programs', distinct=True))
            .order_by('name')
        )
        return Response(CollegeSerializer(colleges, many=True).data)

    def post(self, request):
        denied = _require_admin(request)
        if denied:
            return denied
        serializer = CollegeSerializer(data=request.data, context={'institution': self.institution(request)})
        serializer.is_valid(raise_exception=True)
        college = serializer.save(institution=self.institution(request))
        return Response(CollegeSerializer(college).data, status=status.HTTP_201_CREATED)


class CollegeDetailView(AcademicBaseView):
    def put(self, request, college_id):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        college = get_object_or_404(College, college_id=college_id, institution=institution)
        serializer = CollegeSerializer(college, data=request.data, context={'institution': institution})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, college_id):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        college = get_object_or_404(College, college_id=college_id, institution=institution)
        college.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProgramListCreateView(AcademicBaseView):
    def get(self, request):
        denied = _require_admin(request)
        if denied:
            return denied
        programs = Program.objects.filter(institution=self.institution(request)).order_by('name')
        return Response(ProgramSerializer(programs, many=True).data)

    def post(self, request):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        serializer = ProgramSerializer(data=request.data, context={'institution': institution})
        serializer.is_valid(raise_exception=True)
        program = serializer.save(institution=institution)
        return Response(ProgramSerializer(program).data, status=status.HTTP_201_CREATED)


class ProgramDetailView(AcademicBaseView):
    def put(self, request, program_id):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        program = get_object_or_404(Program, program_id=program_id, institution=institution)
        serializer = ProgramSerializer(program, data=request.data, context={'institution': institution})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, program_id):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        program = get_object_or_404(Program, program_id=program_id, institution=institution)
        program.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class YearLevelListCreateView(AcademicBaseView):
    def post(self, request):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        serializer = YearLevelSerializer(data=request.data, context={'institution': institution})
        serializer.is_valid(raise_exception=True)
        year_level = serializer.save()
        return Response(YearLevelSerializer(year_level).data, status=status.HTTP_201_CREATED)


class YearLevelDetailView(AcademicBaseView):
    def delete(self, request, year_id):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        year_level = get_object_or_404(YearLevel, year_id=year_id, program__institution=institution)
        year_level.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SectionListCreateView(AcademicBaseView):
    def post(self, request):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        serializer = SectionSerializer(data=request.data, context={'institution': institution})
        serializer.is_valid(raise_exception=True)
        section = serializer.save()
        return Response(SectionSerializer(section).data, status=status.HTTP_201_CREATED)


class SectionDetailView(AcademicBaseView):
    def delete(self, request, section_id):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        section = get_object_or_404(Section, section_id=section_id, program__institution=institution)
        section.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CourseListCreateView(AcademicBaseView):
    """Courses power the faculty-assignment dropdown, so they are institution scoped."""

    def get(self, request):
        denied = _require_admin(request)
        if denied:
            return denied
        queryset = (
            Course.objects.filter(institution=self.institution(request))
            .select_related('program', 'program__college', 'year_level', 'section')
            .order_by('course_code')
        )
        return Response(CourseSerializer(queryset, many=True).data)

    def post(self, request):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        serializer = CourseSerializer(data=request.data, context={'institution': institution})
        serializer.is_valid(raise_exception=True)
        course = serializer.save(institution=institution)
        return Response(CourseSerializer(course).data, status=status.HTTP_201_CREATED)


class CourseDetailView(AcademicBaseView):
    def put(self, request, course_id):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        course = get_object_or_404(Course, course_id=course_id, institution=institution)
        serializer = CourseSerializer(course, data=request.data, context={'institution': institution})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, course_id):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        course = get_object_or_404(Course, course_id=course_id, institution=institution)
        course.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CompleteSetupView(AcademicBaseView):
    """Marks the first-time setup as done once the required structure exists."""

    @transaction.atomic
    def post(self, request):
        denied = _require_admin(request)
        if denied:
            return denied

        institution = self.institution(request)
        serializer = CompleteSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        skip_knowledge_base = serializer.validated_data['skip_knowledge_base']

        customization = InstitutionCustomization.objects.filter(institution=institution).first()
        syllabus_sections = customization.syllabus_sections if customization else []
        enabled_sections = [
            section for section in syllabus_sections
            if isinstance(section, dict)
            and section.get('enabled', True)
            and isinstance(section.get('label'), str)
            and section['label'].strip()
        ] if isinstance(syllabus_sections, list) else []
        faculty_assignments = CourseLoad.objects.filter(
            faculty__institution=institution,
            faculty__role=UserRole.FACULTY,
            course__institution=institution,
        )
        courses = Course.objects.filter(institution=institution).count()
        assigned_faculty_count = faculty_assignments.values('faculty_id').distinct().count()

        missing = []
        if not enabled_sections or any(
            section.get('is_static') and not str(section.get('static_content') or '').strip()
            for section in enabled_sections
        ):
            missing.append('at least one syllabus template section')
        if assigned_faculty_count < 1:
            missing.append('at least one faculty account with a course and section assignment')

        if missing:
            return Response(
                {
                    'detail': f'Complete the required setup first: add {", ".join(missing)}.',
                    'missing': missing,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        institution.setup_completed = True
        institution.setup_completed_at = timezone.now()
        institution.save(update_fields=['setup_completed', 'setup_completed_at'])

        return Response({
            'detail': 'Setup complete.',
            'setup_completed': True,
            'skip_knowledge_base': skip_knowledge_base,
            'counts': {
                'courses': courses,
                'assigned_faculty': assigned_faculty_count,
                'syllabus_sections': len(enabled_sections),
            },
        })


class ResetSetupView(AcademicBaseView):
    """Re-opens the setup wizard (structure is preserved)."""

    def post(self, request):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        if institution.setup_completed:
            return Response(
                {'detail': 'First-time setup has already been completed and cannot be reopened.'},
                status=status.HTTP_409_CONFLICT,
            )
        institution.setup_completed = False
        institution.setup_completed_at = None
        institution.save(update_fields=['setup_completed', 'setup_completed_at'])
        return Response({'setup_completed': False})
