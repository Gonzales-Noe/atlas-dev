from django.urls import path

from . import views

urlpatterns = [
    path("student-scores/", views.student_scores, name="grading_student_scores"),
    path("sections/", views.grading_sections, name="grading_sections"),
    path("blocks/", views.grading_blocks, name="grading_blocks"),
    path("reports/", views.grading_reports, name="grading_reports"),
    path(
        "bubble/templates/<uuid:template_id>/item-analysis/",
        views.bubble_sheet_item_analysis,
        name="bubble_sheet_item_analysis",
    ),
    path("bubble/templates/", views.bubble_sheet_templates, name="bubble_sheet_templates"),
    path(
        "bubble/templates/<uuid:template_id>/",
        views.bubble_sheet_template_detail,
        name="bubble_sheet_template_detail",
    ),
    path(
        "bubble/templates/<uuid:template_id>/answer-key/",
        views.bubble_sheet_set_answer_key,
        name="bubble_sheet_set_answer_key",
    ),
    path(
        "bubble/templates/<uuid:template_id>/sync-key/",
        views.bubble_sheet_sync_key,
        name="bubble_sheet_sync_key",
    ),
    path(
        "bubble/templates/<uuid:template_id>/generate-pdf/",
        views.bubble_sheet_generate_pdf,
        name="bubble_sheet_generate_pdf",
    ),
    path(
        "bubble/templates/<uuid:template_id>/student-qr/",
        views.bubble_sheet_student_qr,
        name="bubble_sheet_student_qr",
    ),
    path(
        "bubble/templates/<uuid:template_id>/scans/",
        views.bubble_sheet_scans_list,
        name="bubble_sheet_scans_list",
    ),
    path("bubble/scans/", views.bubble_sheet_scan, name="bubble_sheet_scan"),
    path(
        "bubble/scans/<uuid:scan_id>/",
        views.bubble_sheet_scan_detail,
        name="bubble_sheet_scan_detail",
    ),
]
