import os
import sys
import django
import glob

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'educarnival.settings')
django.setup()

from api.models import Grade, Subject, Chapter, ChapterResource

def run():
    print("Populating database with grades, subjects, and chapters...")
    grades = ['grade1', 'grade2', 'grade3', 'grade4', 'grade5']
    subjects_data = [
        ('english', 'English'),
        ('hindi', 'Hindi'),
        ('kannada', 'Kannada'),
        ('maths', 'Mathematics'),
        ('science', 'Science'),
        ('social_science', 'Social Science')
    ]
    
    media_base_dir = os.path.join(os.path.dirname(__file__), 'media')
    
    for grade_id in grades:
        grade_num = grade_id.replace('grade', '')
        grade_obj, _ = Grade.objects.get_or_create(identifier=f"Grade {grade_num}")
        print(f"Processing {grade_obj.identifier}")
        
        for subj_id, subj_name in subjects_data:
            subj_obj, _ = Subject.objects.get_or_create(
                identifier=subj_id, 
                grade=grade_obj,
                defaults={'display_name': subj_name}
            )
            
            # Ensure subject directory exists
            subj_dir = os.path.join(media_base_dir, grade_id, subj_id)
            os.makedirs(subj_dir, exist_ok=True)
            
            for ch_num in range(1, 8):
                ch_ident = f"ch{ch_num}"
                ch_title = f"{subj_name} Chapter {ch_num}"
                
                chap_obj, _ = Chapter.objects.get_or_create(
                    identifier=ch_ident,
                    subject=subj_obj,
                    defaults={'title': ch_title, 'order': ch_num}
                )
                
                # Ensure chapter directory exists
                ch_dir = os.path.join(subj_dir, ch_ident)
                os.makedirs(ch_dir, exist_ok=True)
                
                # Look for video file
                video_files = glob.glob(os.path.join(ch_dir, '*.mp4'))
                
                # Delete existing video resources to avoid duplicates
                ChapterResource.objects.filter(chapter=chap_obj, resource_type='video').delete()
                
                if video_files:
                    # Take the first video found
                    video_file = video_files[0]
                    video_filename = os.path.basename(video_file)
                    
                    # Create DB resource
                    file_url = f"http://localhost:8080/media/{grade_id}/{subj_id}/{ch_ident}/{video_filename}"
                    ChapterResource.objects.create(
                        chapter=chap_obj,
                        resource_type="video",
                        file_path=file_url
                    )
                    print(f"  Linked video for {grade_id} {subj_id} {ch_ident}: {video_filename}")
                else:
                    # Optional: We just created the chapters but no video is present.
                    pass

    print("\nDatabase seeded and media linked successfully!")

if __name__ == '__main__':
    run()
