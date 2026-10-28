from django.urls import path
from . import views

urlpatterns = [
    # RAG document endpoints
    path('upload-rag-document/', views.upload_rag_document, name='upload_rag_document'),
    path('upload-global-rag-document/', views.upload_global_rag_document, name='upload_global_rag_document'),
    path('upload-course-rag-document/', views.upload_course_rag_document, name='upload_course_rag_document'),
    path('rag-documents/', views.list_rag_documents, name='list_rag_documents'),
    path('rag-documents/<uuid:document_id>/delete/', views.delete_global_rag_document, name='delete_global_rag_document'),
    path('audit-logs/', views.list_audit_logs, name='list_audit_logs'),
    path('course-rag-documents/', views.list_course_rag_documents, name='list_course_rag_documents'),
    path('course-rag-documents/<uuid:records_id>/delete/', views.delete_course_rag_document, name='delete_course_rag_document'),
    path('semantic-search/', views.semantic_search, name='semantic_search'),
    path('llm-provider-status/', views.llm_provider_status, name='llm_provider_status'),
    path('llm-health/', views.llm_health, name='llm_health'),
    path('traffic/', views.traffic_status, name='traffic_status'),
]
