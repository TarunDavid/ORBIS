from django.db import models


class Student(models.Model):
    name = models.CharField(max_length=255)
    age = models.IntegerField()
    school_name = models.CharField(max_length=255)
    grade = models.CharField(max_length=50)
    mentor_name = models.CharField(max_length=255)
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
    question_text = models.TextField()
    options = models.JSONField(default=list)  # list of option strings
    correct_answer = models.CharField(max_length=255)
    student_answer = models.CharField(max_length=255, null=True, blank=True)
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
