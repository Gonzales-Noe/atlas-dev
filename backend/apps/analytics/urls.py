from django.urls import path
from . import views

urlpatterns = [
    path('faculty-sheet-analysis/', views.faculty_sheet_analysis, name='faculty_sheet_analysis'),
    # Google Sheets data ingestion endpoint
    path('ingest/', views.ingest_google_sheets, name='ingest_google_sheets'),
    # Google Sheets data ingestion endpoint using Browser API Key
    path('ingest-apikey/', views.ingest_google_sheets_api_key, name='ingest_google_sheets_api_key'),
    # Prescriptive recommendations
    path('prescriptive-recommendations/', views.prescriptive_recommendations, name='prescriptive_recommendations'),
    path('bloom-item-analysis/', views.bloom_item_analysis, name='bloom_item_analysis'),
]
