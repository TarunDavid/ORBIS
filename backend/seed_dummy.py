import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'educarnival.settings')
django.setup()

from api.models import Grade, Subject, Chapter, ChapterResource

# 1. Create Grade
grade, _ = Grade.objects.get_or_create(identifier='Grade 5')
print(f"Grade: {grade}")

# 2. Create Subjects
subjects_data = [
    ('maths', 'Mathematics'),
    ('science', 'Science'),
    ('english', 'English'),
]

for sid, name in subjects_data:
    subj, _ = Subject.objects.get_or_create(identifier=sid, grade=grade, defaults={'display_name': name})
    print(f"  Subject: {subj}")

    # 3. Create 3 chapters per subject
    for i in range(1, 4):
        ch, _ = Chapter.objects.get_or_create(
            identifier=f'{sid}_ch{i}',
            subject=subj,
            defaults={'title': f'{name} - Chapter {i}', 'order': i}
        )
        print(f"    Chapter: {ch}")

        # 4. Add dummy resources (no actual files, just paths)
        ChapterResource.objects.get_or_create(
            chapter=ch, resource_type='video',
            defaults={'file_path': f'/media/content/{sid}/ch{i}/video.mp4'}
        )
        ChapterResource.objects.get_or_create(
            chapter=ch, resource_type='notes',
            defaults={'file_path': f'/media/content/{sid}/ch{i}/notes.pdf'}
        )
        ChapterResource.objects.get_or_create(
            chapter=ch, resource_type='textbook',
            defaults={'file_path': f'/media/content/{sid}/ch{i}/textbook.pdf'}
        )

print("\n✅ Dummy data seeded successfully!")
