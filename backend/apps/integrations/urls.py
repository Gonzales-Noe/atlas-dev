from django.urls import path
from . import views

urlpatterns = [
    # Anthropic Claude API endpoints
    path('claude-test/', views.claude_api_test, name='claude_api_test'),
    
    # RAG document endpoints
    path('upload-rag-document/', views.upload_rag_document, name='upload_rag_document'),
    path('upload-global-rag-document/', views.upload_global_rag_document, name='upload_global_rag_document'),
    path('upload-course-rag-document/', views.upload_course_rag_document, name='upload_course_rag_document'),
    path('rag-documents/', views.list_rag_documents, name='list_rag_documents'),
    path('course-rag-documents/', views.list_course_rag_documents, name='list_course_rag_documents'),
    path('course-rag-documents/<uuid:records_id>/delete/', views.delete_course_rag_document, name='delete_course_rag_document'),
    path('semantic-search/', views.semantic_search, name='semantic_search'),
    path('llm-provider-status/', views.llm_provider_status, name='llm_provider_status'),
    # Billing / plans (simulated)
    path('plans/', views.list_plans, name='list_plans'),
    path('simulate-payment/', views.simulate_payment, name='simulate_payment'),
]
