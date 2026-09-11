from django.db import models


class Student(models.Model):
    name = models.CharField(max_length=255)
    age = models.IntegerField()
    school_name = models.CharField(max_length=255)
    grade = models.CharField(max_length=50)
    mentor_name = models.CharField(max_length=255)
    profile_picture = models.ImageField(upload_to='profile_pics/', null=True, blank=True)
    registration_timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Grade(models.Model):
    identifier = models.CharField(max_length=50, unique=True)  # e.g. "Grade 5"

    def __str__(self):
        return self.identifier


class Subject(models.Model):
    identifier = models.CharField(max_length=100)
    display_name = models.CharField(max_length=100)
    grade = models.ForeignKey(Grade, on_delete=models.CASCADE, related_name='subjects')

    def __str__(self):
        return f"{self.display_name} ({self.grade.identifier})"


class Chapter(models.Model):
    identifier = models.CharField(max_length=100)
    title = models.CharField(max_length=255)
    order = models.IntegerField()
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='chapters')

    def __str__(self):
        return f"{self.title} - {self.subject.display_name}"


class ChapterResource(models.Model):
    RESOURCE_TYPES = [
        ('video', 'Video (MP4)'),
        ('notes', 'Notes (PDF)'),
        ('textbook', 'Textbook Excerpt (PDF)'),
        ('ppt', 'Presentation (PPT)'),
    ]
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name='resources')
    resource_type = models.CharField(max_length=20, choices=RESOURCE_TYPES)
    file_path = models.CharField(max_length=500)  # Local path or URL
    
    def __str__(self):
        return f"{self.resource_type} for {self.chapter.title}"


# ==========================================================================
# Learning State Models (Mihir's ownership)
# ==========================================================================

class ChatSession(models.Model):
    """A chat conversation tied to a specific chapter and student."""
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE,
        related_name='chat_sessions', null=True, blank=True,
    )
    chapter = models.ForeignKey(
        Chapter, on_delete=models.CASCADE,
        related_name='chat_sessions',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        student_name = self.student.name if self.student else 'Anonymous'
        return f"Chat: {student_name} - {self.chapter.title}"


class ChatMessage(models.Model):
    """Individual message in a chat session."""
    ROLE_CHOICES = [
        ('user', 'User'),
        ('assistant', 'Assistant'),
    ]
    session = models.ForeignKey(
        ChatSession, on_delete=models.CASCADE,
        related_name='messages',
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f"{self.role}: {self.content[:50]}"


class FlashcardSet(models.Model):
    """A set of AI-generated flashcards for a chapter."""
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE,
        related_name='flashcard_sets', null=True, blank=True,
    )
    chapter = models.ForeignKey(
        Chapter, on_delete=models.CASCADE,
        related_name='flashcard_sets',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Flashcards: {self.chapter.title}"


class Flashcard(models.Model):
    """Individual flashcard with front (question/term) and back (answer/definition)."""
    flashcard_set = models.ForeignKey(
        FlashcardSet, on_delete=models.CASCADE,
        related_name='cards',
    )
    front = models.TextField()  # question or term
    back = models.TextField()   # answer or definition
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"Card: {self.front[:40]}"


class ChapterQuizQuestion(models.Model):
    """Pre-generated quiz questions with hints for offline content pipeline."""
    REVIEW_STATUS_CHOICES = [
        ('pending', 'Pending Review'),
        ('approved', 'Approved'),
        ('needs_rework', 'Needs Rework'),
    ]
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name='quiz_questions')
    question_text = models.TextField()
    options = models.JSONField(default=list)  # list of option strings
    correct_answer = models.CharField(max_length=255)
    hint_text = models.TextField(blank=True)
    hint_review_status = models.CharField(max_length=20, choices=REVIEW_STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Q for {self.chapter.title}: {self.question_text[:40]}"


class QuizAttempt(models.Model):
    """A quiz attempt by a student for a chapter."""
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE,
        related_name='quiz_attempts', null=True, blank=True,
    )
    chapter = models.ForeignKey(
        Chapter, on_delete=models.CASCADE,
        related_name='quiz_attempts',
    )
    score = models.IntegerField(null=True, blank=True)
    total_questions = models.IntegerField(default=0)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        status = f"{self.score}/{self.total_questions}" if self.score is not None else "In Progress"
        return f"Quiz: {self.chapter.title} ({status})"


class QuizQuestion(models.Model):
    """Individual quiz question within an attempt."""
    attempt = models.ForeignKey(
        QuizAttempt, on_delete=models.CASCADE,
        related_name='questions',
    )
    source_question = models.ForeignKey(
        ChapterQuizQuestion, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='attempts'
    )
    question_text = models.TextField()
    options = models.JSONField(default=list)  # list of option strings
    correct_answer = models.CharField(max_length=255)
    student_answer = models.CharField(max_length=255, null=True, blank=True)
    hint_used = models.BooleanField(default=False)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"Q{self.order}: {self.question_text[:40]}"


class LearningProgress(models.Model):
    """Tracks a student's engagement with a chapter."""
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE,
        related_name='progress',
    )
    chapter = models.ForeignKey(
        Chapter, on_delete=models.CASCADE,
        related_name='progress',
    )
    video_watched = models.BooleanField(default=False)
    notes_viewed = models.BooleanField(default=False)
    summary_generated = models.BooleanField(default=False)
    last_accessed = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['student', 'chapter']

    def __str__(self):
        return f"Progress: {self.student.name} - {self.chapter.title}"


class QuestionExplanation(models.Model):
    """AI-generated explanation for an incorrect quiz question."""
    question = models.OneToOneField(
        QuizQuestion, on_delete=models.CASCADE, related_name='explanation'
    )
    explanation_text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Explanation for Q{self.question.order} (Attempt {self.question.attempt_id})"


class WeakConcept(models.Model):
    """An AI-identified weak concept across multiple incorrect questions."""
    attempt = models.ForeignKey(
        QuizAttempt, on_delete=models.CASCADE, related_name='weak_concepts'
    )
    concept_name = models.CharField(max_length=255)
    explanation = models.TextField()
    related_questions = models.ManyToManyField(
        QuizQuestion, related_name='weak_concepts_linked'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Weak Concept: {self.concept_name} (Attempt {self.attempt_id})"


class ActivityEvent(models.Model):
    """Logs student activity for the progress heatmap."""
    EVENT_TYPES = [
        ('login', 'Login'),
        ('chapter_view', 'Chapter View'),
        ('quiz_attempt', 'Quiz Attempt'),
    ]
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name='activity_events'
    )
    event_type = models.CharField(max_length=20, choices=EVENT_TYPES)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.event_type} - {self.student.name} at {self.timestamp}"


class ContentChunk(models.Model):
    """Stores text chunks from chapter resources for vector semantic search."""
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name='content_chunks')
    resource_type = models.CharField(max_length=50) # e.g. 'notes', 'transcript', 'textbook'
    text = models.TextField()
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['chapter', 'resource_type', 'order']

    def __str__(self):
        return f"Chunk {self.order} for {self.chapter.title} ({self.resource_type})"


# ==========================================================================
# Teacher Portal Models
# ==========================================================================

class TeacherProfile(models.Model):
    """Teacher profile linked to Django's built-in User model."""
    user = models.OneToOneField(
        'auth.User', on_delete=models.CASCADE, related_name='teacher_profile'
    )
    display_name = models.CharField(max_length=255)
    assigned_subjects = models.ManyToManyField(Subject, blank=True, related_name='assigned_teachers')
    is_admin = models.BooleanField(default=False, help_text='Admins can manage all subjects')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Teacher: {self.display_name}"

    def can_manage_subject(self, subject):
        """Check if teacher can manage a given subject (admin can manage all)."""
        if self.is_admin:
            return True
        return self.assigned_subjects.filter(pk=subject.pk).exists()


class ContentAsset(models.Model):
    """Tracks every uploaded content file with hash, version, and soft-delete status."""
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('soft_deleted', 'Soft Deleted'),
        ('purged', 'Purged'),
    ]
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='content_assets')
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name='content_assets')
    content_type = models.CharField(max_length=20)  # video, notes, ppt, textbook
    filename = models.CharField(max_length=500)
    file_path = models.CharField(max_length=1000)  # relative to MEDIA_ROOT
    size_bytes = models.BigIntegerField()
    sha256 = models.CharField(max_length=64, blank=True, default='')
    version = models.IntegerField(default=1)
    uploaded_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='uploaded_assets'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    deleted_at = models.DateTimeField(null=True, blank=True)
    deletion_reason = models.TextField(blank=True, default='')
    chapter_resource = models.OneToOneField(
        ChapterResource, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='content_asset',
        help_text='Links to the existing ChapterResource record'
    )

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.content_type}: {self.filename} ({self.status})"


class SyncManifestVersion(models.Model):
    """Tracks the current manifest version for lightweight sync checks."""
    version_number = models.IntegerField(unique=True)
    generated_at = models.DateTimeField(auto_now_add=True)
    manifest_checksum = models.CharField(max_length=64, blank=True, default='')
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-version_number']

    def __str__(self):
        return f"Manifest v{self.version_number}"


class DeviceSyncStatus(models.Model):
    """Tracks which manifest version each student device has synced to."""
    device_id = models.CharField(max_length=255, unique=True)
    device_name = models.CharField(max_length=255, blank=True, default='')
    last_synced_manifest_version = models.IntegerField(default=0)
    last_synced_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Device {self.device_id} @ v{self.last_synced_manifest_version}"


class TeacherActivityLog(models.Model):
    """Audit trail for all teacher content management actions."""
    ACTION_CHOICES = [
        ('upload', 'Upload'),
        ('remove', 'Remove'),
        ('restore', 'Restore'),
        ('hard_delete', 'Hard Delete'),
    ]
    teacher = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, related_name='teacher_activity_logs'
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    content_asset = models.ForeignKey(
        ContentAsset, on_delete=models.SET_NULL, null=True, blank=True, related_name='activity_logs'
    )
    asset_filename = models.CharField(max_length=500, default='')  # denormalized for readability
    subject_name = models.CharField(max_length=100, default='')
    chapter_title = models.CharField(max_length=255, default='')
    timestamp = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.action}: {self.asset_filename} by {self.teacher}"
