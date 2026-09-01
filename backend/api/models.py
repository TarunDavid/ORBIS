from django.db import models

class Student(models.Model):
    name = models.CharField(max_length=255)
    age = models.IntegerField()
    school_name = models.CharField(max_length=255)
    grade = models.CharField(max_length=50) # Assuming string for simplicity, or could be a foreign key to Grade model
    mentor_name = models.CharField(max_length=255)
    registration_timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class Grade(models.Model):
    identifier = models.CharField(max_length=50, unique=True) # e.g. "Grade 5"

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
    file_path = models.CharField(max_length=500) # Local path or URL
    
    def __str__(self):
        return f"{self.resource_type} for {self.chapter.title}"
