from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations.models import (
    AuditLog,
    Course,
    CourseLoad,
    CourseRequest,
    CourseRequestStatus,
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
            .select_related('year_level')
            .distinct()
            .order_by('code')
        )
        courses = (
            Course.objects.filter(institution=institution)
            .select_related('section', 'section__year_level')
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
    def _get_section(self, request, section_id):
        institution = self.institution(request)
        return get_object_or_404(
            Section.objects.filter(
                Q(institution=institution) | Q(program__institution=institution),
            ).distinct(),
            section_id=section_id,
        )

    def patch(self, request, section_id):
        denied = _require_admin(request)
        if denied:
            return denied
        section = self._get_section(request, section_id)
        serializer = SectionSerializer(
            section, data=request.data, partial=True,
            context={'institution': self.institution(request)},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, section_id):
        denied = _require_admin(request)
        if denied:
            return denied
        section = self._get_section(request, section_id)
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
            .select_related('program', 'program__college', 'year_level', 'section', 'section__year_level')
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


def _serialize_course_request(item):
    return {
        "request_id": str(item.request_id),
        "course_code": item.course_code,
        "course_title": item.course_title,
        "description": item.description,
        "category": item.category,
        "units": str(item.units) if item.units is not None else None,
        "section": str(item.section_id) if item.section_id else None,
        "section_code": item.section.code if item.section_id and item.section else None,
        "justification": item.justification,
        "status": item.status,
        "admin_note": item.admin_note,
        "requested_by": str(item.requested_by_id),
        "requested_by_name": getattr(item.requested_by, "full_name", "") or "",
        "requested_by_email": getattr(item.requested_by, "email", "") or "",
        "reviewed_by_name": getattr(item.reviewed_by, "full_name", "") if item.reviewed_by_id else None,
        "reviewed_at": item.reviewed_at.isoformat() if item.reviewed_at else None,
        "created_course_id": str(item.created_course_id) if item.created_course_id else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


class CourseRequestListView(AcademicBaseView):
    """Admin inbox for faculty course proposals."""

    def get(self, request):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        queryset = (
            CourseRequest.objects.filter(institution=institution)
            .select_related("section", "requested_by", "reviewed_by", "created_course")
            .order_by("-created_at")
        )
        status_filter = (request.query_params.get("status") or "").strip().lower()
        if status_filter in {"pending", "approved", "rejected"}:
            queryset = queryset.filter(status=status_filter)
        return Response({"requests": [_serialize_course_request(item) for item in queryset]})


class CourseRequestReviewView(AcademicBaseView):
    """Approve or reject one faculty course proposal."""

    @transaction.atomic
    def post(self, request, request_id):
        denied = _require_admin(request)
        if denied:
            return denied
        institution = self.institution(request)
        course_request = get_object_or_404(
            CourseRequest.objects.select_related("section", "requested_by"),
            request_id=request_id,
            institution=institution,
        )
        action = (request.data.get("action") or "").strip().lower()
        admin_note = (request.data.get("admin_note") or "").strip()
        if action not in {"approve", "reject"}:
            return Response(
                {"detail": "Action must be 'approve' or 'reject'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if course_request.status != CourseRequestStatus.PENDING:
            return Response(
                {"detail": f"This request was already {course_request.status}."},
                status=status.HTTP_409_CONFLICT,
            )
        if action == "reject":
            if not admin_note:
                return Response(
                    {"detail": "Please add a short note so faculty knows what to fix."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            course_request.status = CourseRequestStatus.REJECTED
            course_request.admin_note = admin_note
            course_request.reviewed_by = request.user
            course_request.reviewed_at = timezone.now()
            course_request.save(
                update_fields=["status", "admin_note", "reviewed_by", "reviewed_at", "updated_at"]
            )
            return Response(_serialize_course_request(course_request))
        return self._approve(request, institution, course_request, admin_note)

    def _approve(self, request, institution, course_request, admin_note):
        course_code = (request.data.get("course_code") or course_request.course_code).strip().upper()
        course_title = (request.data.get("course_title") or course_request.course_title).strip()
        description = request.data.get("description", course_request.description)
        description = (description or "").strip() or None
        category = (request.data.get("category") or course_request.category or "professional").strip().lower()
        valid_categories = {choice for choice, _ in CourseRequest._meta.get_field("category").choices}
        if category not in valid_categories:
            category = "professional"
        units_raw = request.data.get("units", course_request.units)
        units = None
        if units_raw not in (None, ""):
            try:
                units = float(units_raw)
            except (TypeError, ValueError):
                return Response(
                    {"detail": "Units must be a number."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if not course_code or not course_title:
            return Response(
                {"detail": "Course code and title are required to approve."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if Course.objects.filter(institution=institution, course_code__iexact=course_code).exists():
            return Response(
                {"detail": f"A course with code '{course_code}' already exists."},
                status=status.HTTP_409_CONFLICT,
            )
        course = Course.objects.create(
            institution=institution,
            course_code=course_code,
            course_title=course_title,
            description=description,
            category=category,
            units=units,
            section=course_request.section,
        )
        CourseLoad.objects.get_or_create(course=course, faculty=course_request.requested_by)
        course_request.status = CourseRequestStatus.APPROVED
        course_request.admin_note = admin_note or None
        course_request.reviewed_by = request.user
        course_request.reviewed_at = timezone.now()
        course_request.created_course = course
        course_request.save(
            update_fields=[
                "status", "admin_note", "reviewed_by", "reviewed_at",
                "created_course", "updated_at",
            ]
        )
        try:
            AuditLog.objects.create(
                user=request.user,
                action_type="course_request_approved",
                resource_type="course",
                resource_id=course.course_id,
                details={
                    "course_code": course.course_code,
                    "request_id": str(course_request.request_id),
                    "faculty_id": str(course_request.requested_by_id),
                },
            )
        except Exception:
            pass
        payload = _serialize_course_request(course_request)
        payload["course_id"] = str(course.course_id)
        return Response(payload, status=status.HTTP_201_CREATED)


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
