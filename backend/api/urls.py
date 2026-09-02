from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    StudentViewSet, GradeViewSet, SubjectViewSet, ChapterViewSet,
    ChatSessionViewSet, FlashcardSetViewSet,
    QuizAttemptViewSet, LearningProgressViewSet,
)

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
]
