from rest_framework import serializers
from .models import (
    Student, Grade, Subject, Chapter, ChapterResource,
    ChatSession, ChatMessage,
    FlashcardSet, Flashcard,
    QuizAttempt, QuizQuestion,
    LearningProgress, ActivityEvent
)


class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = '__all__'


class ChapterResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChapterResource
        fields = ['id', 'resource_type', 'file_path']


class ChapterSerializer(serializers.ModelSerializer):
    resources = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source='subject.display_name', read_only=True)
    subject_identifier = serializers.CharField(source='subject.identifier', read_only=True)

    class Meta:
        model = Chapter
        fields = ['id', 'identifier', 'title', 'order', 'resources', 'subject_name', 'subject_identifier']

    def get_resources(self, obj):
        resources = obj.resources.all()
        if not resources.exists():
            from .media_scanner import discover_chapter_resources
            resources = discover_chapter_resources(obj)
        return ChapterResourceSerializer(resources, many=True).data


class SubjectSerializer(serializers.ModelSerializer):
    chapters = ChapterSerializer(many=True, read_only=True)

    class Meta:
        model = Subject
        fields = ['id', 'identifier', 'display_name', 'chapters']


class GradeSerializer(serializers.ModelSerializer):
    subjects = SubjectSerializer(many=True, read_only=True)

    class Meta:
        model = Grade
        fields = ['id', 'identifier', 'subjects']


# ==========================================================================
# Learning State Serializers
# ==========================================================================

class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ['id', 'role', 'content', 'timestamp']


class ChatSessionSerializer(serializers.ModelSerializer):
    messages = ChatMessageSerializer(many=True, read_only=True)

    class Meta:
        model = ChatSession
        fields = ['id', 'student', 'chapter', 'created_at', 'messages']


class FlashcardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Flashcard
        fields = ['id', 'front', 'back', 'order']


class FlashcardSetSerializer(serializers.ModelSerializer):
    cards = FlashcardSerializer(many=True, read_only=True)

    class Meta:
        model = FlashcardSet
        fields = ['id', 'student', 'chapter', 'created_at', 'cards']


class QuizQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizQuestion
        fields = ['id', 'question_text', 'options', 'correct_answer', 'student_answer', 'order']


class QuizAttemptSerializer(serializers.ModelSerializer):
    questions = QuizQuestionSerializer(many=True, read_only=True)
    chapter_title = serializers.CharField(source='chapter.title', read_only=True)
    subject_name = serializers.CharField(source='chapter.subject.display_name', read_only=True)

    class Meta:
        model = QuizAttempt
        fields = [
            'id', 'student', 'chapter', 'chapter_title', 'subject_name', 'score',
            'total_questions', 'completed_at', 'created_at', 'questions',
        ]


class ActivityEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityEvent
        fields = '__all__'


class LearningProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = LearningProgress
        fields = [
            'id', 'student', 'chapter', 'video_watched',
            'notes_viewed', 'summary_generated', 'last_accessed',
        ]
