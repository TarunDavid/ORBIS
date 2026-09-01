from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import StudentViewSet, GradeViewSet, SubjectViewSet, ChapterViewSet

router = DefaultRouter()
router.register(r'students', StudentViewSet)
router.register(r'grades', GradeViewSet)
router.register(r'subjects', SubjectViewSet)
router.register(r'chapters', ChapterViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
