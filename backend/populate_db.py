import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'educarnival.settings')
django.setup()

from api.models import Grade, Subject, Chapter, ChapterResource

def run():
    print("Populating database...")
    grade5, _ = Grade.objects.get_or_create(identifier="Grade 5")
    
    science, _ = Subject.objects.get_or_create(identifier="science", display_name="Science", grade=grade5)
    maths, _ = Subject.objects.get_or_create(identifier="maths", display_name="Mathematics", grade=grade5)

    chap1, _ = Chapter.objects.get_or_create(identifier="ch1", title="Plant Life", order=1, subject=science)
    chap2, _ = Chapter.objects.get_or_create(identifier="ch2", title="Animal World", order=2, subject=science)

    ChapterResource.objects.filter(chapter=chap1).delete()

    ChapterResource.objects.get_or_create(chapter=chap1, resource_type="video", file_path="http://localhost:8080/media/grade5/science/ch1/video.mp4")
    ChapterResource.objects.get_or_create(chapter=chap1, resource_type="notes", file_path="http://localhost:8080/media/grade5/science/ch1/notes.pdf")
    
    print("Done!")

if __name__ == '__main__':
    run()
