from django.urls import path
from .views import SummarizeVideoView, ChatbotView, VoiceAssistantView

urlpatterns = [
    path('summarize/', SummarizeVideoView.as_view(), name='ai-summarize'),
    path('chat/', ChatbotView.as_view(), name='ai-chat'),
    path('voice/', VoiceAssistantView.as_view(), name='ai-voice'),
]
