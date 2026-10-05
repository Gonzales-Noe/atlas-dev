from django.urls import path

from . import course_exam_views as views

urlpatterns = [
    path("", views.course_exams, name="course-exams"),
]
