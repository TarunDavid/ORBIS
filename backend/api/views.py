from datetime import datetime, timedelta
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.http import HttpResponse
from django.template.loader import get_template
from xhtml2pdf import pisa

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .models import (
    Student, Grade, Subject, Chapter,
    ChatSession, FlashcardSet, QuizAttempt, LearningProgress,
    ActivityEvent,
)
from .serializers import (
    StudentSerializer, GradeSerializer, SubjectSerializer, ChapterSerializer,
    ChatSessionSerializer, FlashcardSetSerializer,
    QuizAttemptSerializer, LearningProgressSerializer,
    ActivityEventSerializer,
)


class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    @action(detail=True, methods=['post'], url_path='upload-profile-picture')
    def upload_profile_picture(self, request, pk=None):
        student = self.get_object()
        file = request.FILES.get('profile_picture')
        if not file:
            return Response({'error': 'No file provided'}, status=400)

        # Delete old picture file if it exists
        if student.profile_picture:
            student.profile_picture.delete(save=False)

        student.profile_picture = file
        student.save()
        return Response(StudentSerializer(student).data)

    @action(detail=True, methods=['post'])
    def log_activity(self, request, pk=None):
        student = self.get_object()
        event_type = request.data.get('event_type')
        if event_type not in [choice[0] for choice in ActivityEvent.EVENT_TYPES]:
            return Response({'error': 'Invalid event_type'}, status=400)
        
        # Prevent spamming: only log if no similar event in the last hour
        one_hour_ago = datetime.now() - timedelta(hours=1)
        recent_event = ActivityEvent.objects.filter(
            student=student, event_type=event_type, timestamp__gte=one_hour_ago
        ).exists()

        if not recent_event:
            ActivityEvent.objects.create(student=student, event_type=event_type)
        return Response({'status': 'logged'})

    @action(detail=True, methods=['get'])
    def activity(self, request, pk=None):
        student = self.get_object()
        # Get activity counts per day for the last 90 days
        start_date = datetime.now() - timedelta(days=90)
        activity_data = ActivityEvent.objects.filter(
            student=student, timestamp__gte=start_date
        ).annotate(date=TruncDate('timestamp')).values('date').annotate(count=Count('id')).order_by('date')
        
        return Response([
            {'date': item['date'].strftime('%Y-%m-%d'), 'count': item['count']}
            for item in activity_data
        ])

    @action(detail=True, methods=['get'], url_path='progress-summary')
    def progress_summary(self, request, pk=None):
        student = self.get_object()
        # Find subjects for the student's grade
        subjects = Subject.objects.filter(grade__identifier__icontains=student.grade)
        
        summary = []
        for subject in subjects:
            total_chapters = subject.chapters.count()
            if total_chapters == 0:
                continue
            
            # Count chapters where video_watched is true
            completed_chapters = LearningProgress.objects.filter(
                student=student,
                chapter__subject=subject,
                video_watched=True
            ).count()
            
            summary.append({
                'subject_id': subject.id,
                'subject_name': subject.display_name,
                'total_chapters': total_chapters,
                'completed_chapters': completed_chapters,
                'completion_percentage': int((completed_chapters / total_chapters) * 100)
            })
            
        return Response(summary)

    @action(detail=True, methods=['get'], url_path='report-card')
    def report_card(self, request, pk=None):
        student = self.get_object()
        
        # Gather progress data
        subjects = Subject.objects.filter(grade__identifier__icontains=student.grade)
        progress_data = []
        for subject in subjects:
            total = subject.chapters.count()
            if total > 0:
                completed = LearningProgress.objects.filter(
                    student=student, chapter__subject=subject, video_watched=True
                ).count()
                progress_data.append({
                    'name': subject.display_name,
                    'completed': completed,
                    'total': total,
                    'pct': int((completed / total) * 100)
                })
        
        # Gather quiz data
        quizzes = QuizAttempt.objects.filter(student=student).order_by('-created_at')[:10]
        
        # Activity stats
        active_days = ActivityEvent.objects.filter(student=student).annotate(
            date=TruncDate('timestamp')
        ).values('date').distinct().count()
        
        from django.conf import settings
        context = {
            'student': student,
            'progress': progress_data,
            'quizzes': quizzes,
            'active_days': active_days,
            'generated_date': datetime.now().strftime('%B %d, %Y'),
            'base_dir': settings.BASE_DIR,
        }
        
        # Render template
        template = get_template('report_card.html')
        html = template.render(context)
        
        # Generate PDF
        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="ReportCard_{student.name.replace(" ", "")}.pdf"'
        
        pisa_status = pisa.CreatePDF(html, dest=response)
        if pisa_status.err:
            return Response({'error': 'PDF generation failed'}, status=500)
            
        return response


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
