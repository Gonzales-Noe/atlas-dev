from django.urls import path

from . import views

urlpatterns = [
    path('setup/status/', views.SetupStatusView.as_view(), name='academic_setup_status'),
    path('setup/complete/', views.CompleteSetupView.as_view(), name='academic_setup_complete'),
    path('setup/reset/', views.ResetSetupView.as_view(), name='academic_setup_reset'),
    path('structure/', views.AcademicStructureView.as_view(), name='academic_structure'),
    path('colleges/', views.CollegeListCreateView.as_view(), name='academic_college_list'),
    path('colleges/<uuid:college_id>/', views.CollegeDetailView.as_view(), name='academic_college_detail'),
    path('programs/', views.ProgramListCreateView.as_view(), name='academic_program_list'),
    path('programs/<uuid:program_id>/', views.ProgramDetailView.as_view(), name='academic_program_detail'),
    path('years/', views.YearLevelListCreateView.as_view(), name='academic_year_list'),
    path('years/<uuid:year_id>/', views.YearLevelDetailView.as_view(), name='academic_year_detail'),
    path('sections/', views.SectionListCreateView.as_view(), name='academic_section_list'),
    path('sections/<uuid:section_id>/', views.SectionDetailView.as_view(), name='academic_section_detail'),
    path('courses/', views.CourseListCreateView.as_view(), name='academic_course_list'),
    path('courses/<uuid:course_id>/', views.CourseDetailView.as_view(), name='academic_course_detail'),
]
