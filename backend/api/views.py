from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import (
    Student, Grade, Subject, Chapter,
    ChatSession, FlashcardSet, QuizAttempt, LearningProgress,
)
from .serializers import (
    StudentSerializer, GradeSerializer, SubjectSerializer, ChapterSerializer,
    ChatSessionSerializer, FlashcardSetSerializer,
    QuizAttemptSerializer, LearningProgressSerializer,
)


class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all()
    serializer_class = StudentSerializer


class GradeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Grade.objects.all()
    serializer_class = GradeSerializer


class SubjectViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer


class ChapterViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Chapter.objects.all()
    serializer_class = ChapterSerializer


class ChatSessionViewSet(viewsets.ReadOnlyModelViewSet):
    """List/retrieve chat sessions. Filter by student_id and chapter_id."""
    serializer_class = ChatSessionSerializer

    def get_queryset(self):
        qs = ChatSession.objects.all()
        student_id = self.request.query_params.get('student_id')
        chapter_id = self.request.query_params.get('chapter_id')
        if student_id:
            qs = qs.filter(student_id=student_id)
        if chapter_id:
            qs = qs.filter(chapter_id=chapter_id)
        return qs.order_by('-created_at')


class FlashcardSetViewSet(viewsets.ReadOnlyModelViewSet):
    """List/retrieve flashcard sets. Filter by student_id and chapter_id."""
    serializer_class = FlashcardSetSerializer

    def get_queryset(self):
        qs = FlashcardSet.objects.all()
        student_id = self.request.query_params.get('student_id')
        chapter_id = self.request.query_params.get('chapter_id')
        if student_id:
            qs = qs.filter(student_id=student_id)
        if chapter_id:
            qs = qs.filter(chapter_id=chapter_id)
        return qs.order_by('-created_at')


class QuizAttemptViewSet(viewsets.ReadOnlyModelViewSet):
    """List/retrieve quiz attempts. Filter by student_id and chapter_id."""
    serializer_class = QuizAttemptSerializer

    def get_queryset(self):
        qs = QuizAttempt.objects.all()
        student_id = self.request.query_params.get('student_id')
        chapter_id = self.request.query_params.get('chapter_id')
        if student_id:
            qs = qs.filter(student_id=student_id)
        if chapter_id:
            qs = qs.filter(chapter_id=chapter_id)
        return qs.order_by('-created_at')


class LearningProgressViewSet(viewsets.ModelViewSet):
    """List/retrieve/update learning progress. Filter by student_id."""
    serializer_class = LearningProgressSerializer

    def get_queryset(self):
        qs = LearningProgress.objects.all()
        student_id = self.request.query_params.get('student_id')
        if student_id:
            qs = qs.filter(student_id=student_id)
        return qs

    @action(detail=False, methods=['post'])
    def update_progress(self, request):
        student_id = request.data.get('student_id')
        chapter_id = request.data.get('chapter_id')
        
        if not student_id or not chapter_id:
            return Response({'error': 'student_id and chapter_id required'}, status=400)
            
        progress, _ = LearningProgress.objects.get_or_create(
            student_id=student_id,
            chapter_id=chapter_id
        )
        
        if 'video_watched' in request.data:
            progress.video_watched = request.data['video_watched']
        if 'notes_viewed' in request.data:
            progress.notes_viewed = request.data['notes_viewed']
        if 'summary_generated' in request.data:
            progress.summary_generated = request.data['summary_generated']
            
        progress.save()
        return Response(LearningProgressSerializer(progress).data)
