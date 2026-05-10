from django.urls import path
from . import views

urlpatterns = [
    path("faculty-courses/", views.faculty_courses, name="faculty_courses"),
    path("faculty-course-workspace/<uuid:course_id>/", views.faculty_course_workspace, name="faculty_course_workspace"),
    path("syllabus-content/<uuid:course_id>/", views.save_syllabus_content, name="save_syllabus_content"),
    path("generate-syllabus/", views.generate_syllabus, name="generate_syllabus"),
    path("generate-module/", views.generate_module, name="generate_module"),
]
