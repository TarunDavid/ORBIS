from django.contrib import admin
from .models import ChapterQuizQuestion

@admin.register(ChapterQuizQuestion)
class ChapterQuizQuestionAdmin(admin.ModelAdmin):
    list_display = ('chapter', 'question_text', 'hint_review_status', 'created_at')
    list_filter = ('hint_review_status', 'chapter')
    search_fields = ('question_text', 'hint_text')
