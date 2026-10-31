from django.urls import path

from . import views

urlpatterns = [
    path('setup/status/', views.SetupStatusView.as_view(), name='academic_setup_status'),
    path('faculty-productivity/', views.FacultyProductivityView.as_view(), name='academic_faculty_productivity'),
    path('setup/complete/', views.CompleteSetupView.as_view(), name='academic_setup_complete'),
    path('setup/reset/', views.ResetSetupView.as_view(), name='academic_setup_reset'),
    path('structure/', views.AcademicStructureView.as_view(), name='academic_structure'),
    path('sections/', views.SectionListCreateView.as_view(), name='academic_section_list'),
    path('sections/<uuid:section_id>/', views.SectionDetailView.as_view(), name='academic_section_detail'),
    path('courses/', views.CourseListCreateView.as_view(), name='academic_course_list'),
    path('courses/<uuid:course_id>/', views.CourseDetailView.as_view(), name='academic_course_detail'),
    path('course-requests/', views.CourseRequestListView.as_view(), name='academic_course_request_list'),
    path('course-requests/<uuid:request_id>/review/', views.CourseRequestReviewView.as_view(), name='academic_course_request_review'),
]
