from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations.models import (
    Course,
    CourseLoad,
    GlobalDocument,
    InstitutionCustomization,
    Section,
    UserProfile,
    UserRole,
)

from .serializers import (
    CompleteSetupSerializer,
    CourseSerializer,
    SectionSerializer,
    SetupStatusSerializer,
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
            }
            return Response(SetupStatusSerializer(payload).data)

        payload = {
            'setup_completed': institution.setup_completed,
            'setup_completed_at': institution.setup_completed_at,
        }
        include_counts = request.query_params.get('include_counts', 'true').lower()
        if include_counts in {'false', '0', 'no'}:
            return Response(SetupStatusSerializer(payload).data)

        sections = Section.objects.filter(
            Q(institution=institution) | Q(program__institution=institution),
        ).distinct()
        courses = Course.objects.filter(institution=institution, is_active=True)
        faculty = UserProfile.objects.filter(
            institution=institution,
            role=UserRole.FACULTY,
            is_active=True,
        )
        documents = GlobalDocument.objects.filter(
            institution=institution,
            status=GlobalDocument.IndexStatus.READY,
        )

        payload.update({
            'section_count': sections.count(),
            'course_count': courses.count(),
            'faculty_count': faculty.count(),
            'knowledge_base_count': documents.count(),
        })
        return Response(SetupStatusSerializer(payload).data)


class AcademicStructureView(AcademicBaseView):
    """Return the institution's manageable courses and sections."""

    def get(self, request):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)

        sections = (
            Section.objects.filter(
                Q(institution=institution) | Q(program__institution=institution),
            )
            .distinct()
            .order_by('code')
        )
        courses = (
            Course.objects.filter(institution=institution)
            .select_related('section')
            .order_by('course_code')
        )

        return Response({
            'sections': SectionSerializer(sections, many=True).data,
            'courses': CourseSerializer(courses, many=True).data,
        })


class SectionListCreateView(AcademicBaseView):
    def post(self, request):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        serializer = SectionSerializer(data=request.data, context={'institution': institution})
        serializer.is_valid(raise_exception=True)
        section = serializer.save(institution=institution)
        return Response(SectionSerializer(section).data, status=status.HTTP_201_CREATED)


class SectionDetailView(AcademicBaseView):
    def delete(self, request, section_id):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        section = get_object_or_404(
            Section.objects.filter(
                Q(institution=institution) | Q(program__institution=institution),
            ).distinct(),
            section_id=section_id,
        )
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
