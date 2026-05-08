from django.urls import path
from . import views

urlpatterns = [
    # Anthropic Claude API endpoints
    path('claude-test/', views.claude_api_test, name='claude_api_test'),
    
    # RAG document endpoints
    path('upload-rag-document/', views.upload_rag_document, name='upload_rag_document'),
    path('rag-documents/', views.list_rag_documents, name='list_rag_documents'),
    path('semantic-search/', views.semantic_search, name='semantic_search'),
]
