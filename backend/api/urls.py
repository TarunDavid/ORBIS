from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    StudentViewSet, GradeViewSet, SubjectViewSet, ChapterViewSet,
    ChatSessionViewSet, FlashcardSetViewSet,
    QuizAttemptViewSet, LearningProgressViewSet,
)
from .sync_views import (
    export_sync, import_sync, scan_media,
    sync_manifest_version, sync_full_manifest, sync_device_checkin,
)
from .teacher_views import (
    teacher_login, teacher_logout, teacher_me,
    teacher_dashboard, teacher_content_upload, teacher_content_list,
    teacher_content_delete, teacher_content_restore,
    teacher_activity_feed, teacher_subjects_chapters,
)
from . import chunk_views

router = DefaultRouter()
router.register(r'students', StudentViewSet)
router.register(r'grades', GradeViewSet)
router.register(r'subjects', SubjectViewSet)
router.register(r'chapters', ChapterViewSet)
router.register(r'chat', ChatSessionViewSet, basename='chat')
router.register(r'flashcards', FlashcardSetViewSet, basename='flashcards')
router.register(r'quizzes', QuizAttemptViewSet, basename='quizzes')
router.register(r'progress', LearningProgressViewSet, basename='progress')

urlpatterns = [
    path('', include(router.urls)),
    
    # Existing Sync endpoints
    path('sync/export/', export_sync, name='sync_export'),
    path('sync/import/', import_sync, name='sync_import'),
    path('sync/scan-media/', scan_media, name='sync_scan_media'),
    
    # Chunked sync endpoints
    path('sync/manifest/', chunk_views.get_manifest, name='sync_manifest'),
    path('sync/diff/', chunk_views.compute_diff, name='sync_diff'),
    path('sync/chunk/<path:file_path>', chunk_views.serve_chunk, name='sync_chunk'),
    path('sync/file-manifest/<path:file_path>/', chunk_views.get_file_manifest, name='sync_file_manifest'),
    path('sync/regenerate/', chunk_views.regenerate_manifest, name='sync_regenerate'),

    # Teacher Portal endpoints
    path('sync/manifest/version/', sync_manifest_version, name='sync_manifest_version'),
    path('sync/manifest/full/', sync_full_manifest, name='sync_full_manifest'),
    path('sync/device-checkin/', sync_device_checkin, name='sync_device_checkin'),

    path('teacher/login/', teacher_login, name='teacher_login'),
    path('teacher/logout/', teacher_logout, name='teacher_logout'),
    path('teacher/me/', teacher_me, name='teacher_me'),
    path('teacher/dashboard/', teacher_dashboard, name='teacher_dashboard'),
    path('teacher/content/upload/', teacher_content_upload, name='teacher_content_upload'),
    path('teacher/content/', teacher_content_list, name='teacher_content_list'),
    path('teacher/content/<int:pk>/', teacher_content_delete, name='teacher_content_delete'),
    path('teacher/content/<int:pk>/restore/', teacher_content_restore, name='teacher_content_restore'),
    path('teacher/activity/', teacher_activity_feed, name='teacher_activity_feed'),
    path('teacher/subjects-chapters/', teacher_subjects_chapters, name='teacher_subjects_chapters'),
]
