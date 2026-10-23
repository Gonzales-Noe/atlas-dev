from django.urls import path
from . import views

urlpatterns = [
    path("faculty-courses/", views.faculty_courses, name="faculty_courses"),
    path("faculty-course-workspace/<uuid:course_id>/", views.faculty_course_workspace, name="faculty_course_workspace"),
    path("course-students/<uuid:course_id>/", views.course_students, name="course_students"),
    path("syllabus-content/<uuid:course_id>/", views.save_syllabus_content, name="save_syllabus_content"),
    path("generate-syllabus/", views.generate_syllabus, name="generate_syllabus"),
    path("generate-module/", views.generate_module, name="generate_module"),
    path("generate-assessment/", views.generate_assessment, name="generate_assessment"),
    path("assessment/<uuid:assessment_id>/", views.get_assessment_detail, name="get_assessment_detail"),
    path("assessment-item/<uuid:item_id>/", views.update_assessment_item, name="update_assessment_item"),
    path("module/<uuid:module_id>/", views.get_module_detail, name="get_module_detail"),
    path("module/<uuid:module_id>/save/", views.save_module_content, name="save_module_content"),
    path("generate-subtopic-content/", views.generate_subtopic_content, name="generate_subtopic_content"),
    path("module-ai-assist/", views.module_ai_assist, name="module_ai_assist"),
    path("courses/", views.create_course, name="create_course"),
    path("course-requests/mine/", views.course_requests_mine, name="course_requests_mine"),
    path("generate-syllabus-field/", views.generate_syllabus_field, name="generate_syllabus_field"),
    path("parse-syllabus-upload/", views.parse_syllabus_upload, name="parse_syllabus_upload"),
    path("segment-syllabus-upload/", views.segment_syllabus_upload, name="segment_syllabus_upload"),
    path("parse-syllabus-segment/", views.parse_syllabus_segment, name="parse_syllabus_segment"),
    path("export-syllabus-docx/", views.export_syllabus_docx, name="export_syllabus_docx"),
path("export-tos-docx/", views.export_tos_docx, name="export_tos_docx"),
    path("export-module-docx/", views.export_module_docx, name="export_module_docx"),
    path("export-assessment-docx/", views.export_assessment_docx, name="export_assessment_docx"),
    path("quality-metrics/", views.compute_curriculum_metrics, name="compute_curriculum_metrics"),
]
