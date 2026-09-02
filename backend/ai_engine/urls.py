from django.urls import path
from .views import (
    SummarizeVideoView,
    ChatbotView,
    VoiceAssistantView,
    FlashcardGenerateView,
    QuizGenerateView,
    QuizSubmitView,
)

urlpatterns = [
    path('summarize/', SummarizeVideoView.as_view(), name='ai-summarize'),
    path('chat/', ChatbotView.as_view(), name='ai-chat'),
    path('voice/', VoiceAssistantView.as_view(), name='ai-voice'),
    path('flashcards/', FlashcardGenerateView.as_view(), name='ai-flashcards'),
    path('quiz/', QuizGenerateView.as_view(), name='ai-quiz'),
    path('quiz/submit/', QuizSubmitView.as_view(), name='ai-quiz-submit'),
]
