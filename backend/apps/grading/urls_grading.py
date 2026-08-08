from django.urls import path

from . import views

urlpatterns = [
    path("student-scores/", views.student_scores, name="grading_student_scores"),
]
