from django.urls import path

from . import views


urlpatterns = [
    # ── OMR (legacy file-based grading) ──────────────────────────────────────
    path("templates/", views.omr_templates, name="omr_templates"),
    path("templates/<uuid:template_id>/", views.omr_template_detail, name="omr_template_detail"),
    path(
        "templates/<uuid:template_id>/validate/",
        views.omr_template_validate,
        name="omr_template_validate",
    ),
    path("jobs/", views.omr_jobs, name="omr_jobs"),
    path("jobs/<uuid:job_id>/", views.omr_job_detail, name="omr_job_detail"),
    path("jobs/<uuid:job_id>/cancel/", views.omr_job_cancel, name="omr_job_cancel"),
    path("jobs/<uuid:job_id>/results/", views.omr_job_results, name="omr_job_results"),
    path(
        "jobs/<uuid:job_id>/results/<uuid:result_id>/",
        views.omr_job_result_detail,
        name="omr_job_result_detail",
    ),
    path("jobs/<uuid:job_id>/auto-map/", views.omr_job_auto_map, name="omr_job_auto_map"),
    path(
        "jobs/<uuid:job_id>/finalize-import/",
        views.omr_job_finalize_import,
        name="omr_job_finalize_import",
    ),
    path(
        "jobs/<uuid:job_id>/import-summary/",
        views.omr_job_import_summary,
        name="omr_job_import_summary",
    ),
]
