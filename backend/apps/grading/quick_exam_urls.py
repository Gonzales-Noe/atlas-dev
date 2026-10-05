from django.urls import path

from . import quick_exam_views as views

urlpatterns = [
    path("subjects/", views.quick_subjects, name="quick_subjects"),
    path("subjects/<uuid:subject_id>/", views.quick_subject_detail, name="quick_subject_detail"),
    path("exams/", views.quick_exams, name="quick_exams"),
    path("exams/<uuid:exam_id>/", views.quick_exam_detail, name="quick_exam_detail"),
    path(
        "exams/<uuid:exam_id>/answer-key/",
        views.quick_exam_answer_key,
        name="quick_exam_answer_key",
    ),
    path("exams/<uuid:exam_id>/scans/", views.quick_exam_scans, name="quick_exam_scans"),
    path("scans/", views.quick_scans, name="quick_scans"),
    path("scans/<uuid:scan_id>/", views.quick_scan_detail, name="quick_scan_detail"),
    path("records/", views.quick_records, name="quick_records"),
]
