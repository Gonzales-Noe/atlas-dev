from django.urls import path
from . import views

urlpatterns = [
    path("faculty-courses/", views.faculty_courses, name="faculty_courses"),
    path("faculty-course-workspace/<uuid:course_id>/", views.faculty_course_workspace, name="faculty_course_workspace"),
    path("syllabus-content/<uuid:course_id>/", views.save_syllabus_content, name="save_syllabus_content"),
    path("generate-syllabus/", views.generate_syllabus, name="generate_syllabus"),
    path("generate-module/", views.generate_module, name="generate_module"),
    path("courses/", views.create_course, name="create_course"),
    path("generate-syllabus-field/", views.generate_syllabus_field, name="generate_syllabus_field"),
    path("parse-syllabus-upload/", views.parse_syllabus_upload, name="parse_syllabus_upload"),
    path("quality-metrics/", views.compute_curriculum_metrics, name="compute_curriculum_metrics"),
]
