import os
import sys
import shutil
import re
import django

# Setup Django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'educarnival.settings')
django.setup()

from api.models import Grade, Subject, Chapter, ChapterResource

def import_media(source_dir):
    if not os.path.exists(source_dir):
        print(f"Error: Source directory '{source_dir}' does not exist.")
        return

    media_dir = os.path.join(os.path.dirname(__file__), 'media')
    
    # Regex to match formats like "G5 MATH C1.mp4" or "G5 MATH C1 Notes.pdf"
    pattern = re.compile(r'^G(\d+)[\s_]+([A-Za-z]+)[\s_]+C(\d+).*?\.(mp4|pdf)$', re.IGNORECASE)

    for filename in os.listdir(source_dir):
        match = pattern.match(filename)
        if match:
            grade_num = match.group(1)
            subject_name = match.group(2).lower()
            chapter_num = match.group(3)
            ext = match.group(4).lower()

            # Map extensions to resource types
            resource_type = "video" if ext == "mp4" else "notes"

            # Create or get DB models
            grade_ident = f"Grade {grade_num}"
            grade_obj, _ = Grade.objects.get_or_create(identifier=grade_ident)
            
            # Use capitalized string for display, lower for identifier
            subj_display = subject_name.capitalize()
            subject_obj, _ = Subject.objects.get_or_create(
                identifier=subject_name,
                defaults={'display_name': subj_display, 'grade': grade_obj}
            )

            chap_ident = f"ch{chapter_num}"
            chap_title = f"Chapter {chapter_num}"
            chapter_obj, _ = Chapter.objects.get_or_create(
                identifier=chap_ident,
                subject=subject_obj,
                defaults={'title': chap_title, 'order': int(chapter_num)}
            )

            # Define destination path
            dest_folder = os.path.join(media_dir, f"grade{grade_num}", subject_name, chap_ident)
            os.makedirs(dest_folder, exist_ok=True)
            
            dest_filename = f"{resource_type}.{ext}"
            dest_path = os.path.join(dest_folder, dest_filename)

            # Copy file
            src_path = os.path.join(source_dir, filename)
            print(f"Copying {filename} -> {dest_path}")
            shutil.copy2(src_path, dest_path)

            # Update DB resource
            file_url = f"http://localhost:8080/media/grade{grade_num}/{subject_name}/{chap_ident}/{dest_filename}"
            
            # Delete existing resource of this type for this chapter to avoid duplicates
            ChapterResource.objects.filter(chapter=chapter_obj, resource_type=resource_type).delete()
            
            ChapterResource.objects.create(
                chapter=chapter_obj,
                resource_type=resource_type,
                file_path=file_url
            )
            print(f"Added {resource_type} to {grade_ident} {subj_display} Chapter {chapter_num}")
        else:
            print(f"Skipping {filename} (Did not match naming convention G# SUBJECT C#)")

    print("\nImport complete!")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python import_media.py <path_to_folder_with_videos_and_pdfs>")
        sys.exit(1)
    
    import_media(sys.argv[1])
