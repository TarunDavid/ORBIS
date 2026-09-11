from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    StudentViewSet, GradeViewSet, SubjectViewSet, ChapterViewSet,
    ChatSessionViewSet, FlashcardSetViewSet,
    QuizAttemptViewSet, LearningProgressViewSet,
)
from .sync_views import export_sync, import_sync, scan_media
from . import chunk_views

router = DefaultRouter()
router.register(r'students', StudentViewSet)
router.register(r'grades', GradeViewSet)
router.register(r'subjects', SubjectViewSet)
router.register(r'chapters', ChapterViewSet)
router.register(r'chat-sessions', ChatSessionViewSet, basename='chatsession')
router.register(r'flashcard-sets', FlashcardSetViewSet, basename='flashcardset')
router.register(r'quiz-attempts', QuizAttemptViewSet, basename='quizattempt')
router.register(r'progress', LearningProgressViewSet, basename='learningprogress')

urlpatterns = [
    path('', include(router.urls)),
    path('sync/export/', export_sync, name='sync_export'),
    path('sync/import/', import_sync, name='sync_import'),
    path('sync/scan-media/', scan_media, name='sync_scan_media'),
    # Chunked sync endpoints
    path('sync/manifest/', chunk_views.get_manifest, name='sync_manifest'),
    path('sync/diff/', chunk_views.compute_diff, name='sync_diff'),
    path('sync/chunk/<path:file_path>', chunk_views.serve_chunk, name='sync_chunk'),
    path('sync/file-manifest/<path:file_path>/', chunk_views.get_file_manifest, name='sync_file_manifest'),
    path('sync/regenerate/', chunk_views.regenerate_manifest, name='sync_regenerate'),
]
