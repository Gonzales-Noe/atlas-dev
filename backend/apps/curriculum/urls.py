from django.urls import path
from . import views

urlpatterns = [
    path("generate-syllabus/", views.generate_syllabus, name="generate_syllabus"),
    path("generate-module/", views.generate_module, name="generate_module"),
]
