from django.urls import path
from . import views

urlpatterns = [
    path("generate-assessment/", views.generate_assessment, name="generate_assessment"),
]
