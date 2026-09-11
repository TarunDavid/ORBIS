import os
import sys
import glob
import django
import urllib.request
import ssl

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'educarnival.settings')
django.setup()

from api.models import Grade, Subject, Chapter, ChapterResource, Student

CURRICULUM_CHAPTERS = {
    'science': [
        "Plant Life and Photosynthesis",
        "The Animal Kingdom and Habitats",
        "Human Body and Organ Systems",
        "Matter: Solids, Liquids, and Gases",
        "Force, Work, and Energy",
        "Our Solar System and Planets",
        "Environment and Conservation"
    ],
    'maths': [
        "Large Numbers and Place Value",
        "Addition and Subtraction Mastery",
        "Multiplication and Division",
        "Fractions and Decimals",
        "Geometry, Angles, and Shapes",
        "Measurement: Length, Mass, and Capacity",
        "Data Handling and Bar Graphs"
    ],
    'english': [
        "The Magic Paintbrush — Reading Comprehension",
        "Nouns, Pronouns, and Adjectives",
        "Action Words and Verb Tenses",
        "Subject-Verb Agreement",
        "Creative Paragraph Writing",
        "Vocabulary, Synonyms, and Antonyms",
        "Punctuation and Capitalization"
    ],
    'social_science': [
        "Our Earth: Continents and Oceans",
        "Major Landforms and Water Bodies",
        "Climate and Weather Patterns",
        "India: Our Country and Heritage",
        "The Constitution and Fundamental Rights",
        "Community Living and Civic Sense",
        "Transport and Modern Communication"
    ],
    'hindi': [
        "वर्णमाला और शब्द रचना (Varnamala)",
        "संज्ञा और सर्वनाम (Nouns & Pronouns)",
        "क्रिया और काल (Verbs & Tenses)",
        "कहानी पठन: एकता में बल (Story Reading)",
        "विलोम और पर्यायवाची शब्द (Vocabulary)",
        "अनुच्छेद लेखन (Paragraph Writing)",
        "सामान्य बातचीत और शिष्टाचार"
    ],
    'kannada': [
        "ಕನ್ನಡ ವರ್ಣಮಾಲೆ ಮತ್ತು ಸರಳ ಪದಗಳು",
        "ನಾಮಪದ ಮತ್ತು ಸರ್ವನಾಮಗಳು",
        "ಕಥಾ ವಾಚನ: ಜಾಣ ಕಾಗೆ",
        "ಕ್ರಿಯಾಪದಗಳು ಮತ್ತು ವಾಕ್ಯ ರಚನೆ",
        "ಸಮಾನಾರ್ಥಕ ಮತ್ತು ವಿರುದ್ಧ ಪದಗಳು",
        "ಕನ್ನಡ ಗಾದೆಗಳು ಮತ್ತು ನಾಣ್ಣುಡಿಗಳು",
        "ಸರಳ ಸಂಭಾಷಣೆ ಮತ್ತು ಶಿಷ್ಟಾಚಾರ"
    ]
}

def download_sample_media(media_base_dir):
    try:
        ssl._create_default_https_context = ssl._create_unverified_context
        sample_dir = os.path.join(media_base_dir, 'grade5', 'science', 'ch1')
        os.makedirs(sample_dir, exist_ok=True)
        video_path = os.path.join(sample_dir, 'sample_video.mp4')
        if not os.path.exists(video_path):
            print("Downloading sample demonstration video...")
            urllib.request.urlretrieve("https://www.w3schools.com/html/mov_bbb.mp4", video_path)
            print(f"Sample video downloaded to {video_path}")
    except Exception as e:
        print(f"Note: Could not download sample video ({e}), continuing without it.")

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
    os.makedirs(media_base_dir, exist_ok=True)
    download_sample_media(media_base_dir)
    
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
            
            subj_dir = os.path.join(media_base_dir, grade_id, subj_id)
            os.makedirs(subj_dir, exist_ok=True)
            
            chapter_titles = CURRICULUM_CHAPTERS.get(subj_id, [])
            for ch_num in range(1, 8):
                ch_ident = f"ch{ch_num}"
                if ch_num - 1 < len(chapter_titles):
                    ch_title = chapter_titles[ch_num - 1]
                else:
                    ch_title = f"{subj_name} Chapter {ch_num}"
                
                chap_obj, _ = Chapter.objects.get_or_create(
                    identifier=ch_ident,
                    subject=subj_obj,
                    defaults={'title': ch_title, 'order': ch_num}
                )
                # Update title if it was a generic one
                if "Chapter" in chap_obj.title and ch_num - 1 < len(chapter_titles):
                    chap_obj.title = chapter_titles[ch_num - 1]
                    chap_obj.save()
                
                ch_dir = os.path.join(subj_dir, ch_ident)
                os.makedirs(ch_dir, exist_ok=True)
                
                # Check for video files in ch_dir or fallback to grade5 science ch1
                video_files = glob.glob(os.path.join(ch_dir, '*.mp4'))
                sample_vids = glob.glob(os.path.join(media_base_dir, 'grade5', 'science', 'ch1', '*.mp4'))
                
                ChapterResource.objects.filter(chapter=chap_obj, resource_type='video').delete()
                
                if video_files:
                    video_file = video_files[0]
                    video_filename = os.path.basename(video_file)
                    file_url = f"http://localhost:8000/media/{grade_id}/{subj_id}/{ch_ident}/{video_filename}"
                    ChapterResource.objects.create(
                        chapter=chap_obj,
                        resource_type="video",
                        file_path=file_url
                    )
                elif sample_vids and grade_id == 'grade5' and subj_id == 'science' and ch_num == 1:
                    video_filename = os.path.basename(sample_vids[0])
                    file_url = f"http://localhost:8000/media/grade5/science/ch1/{video_filename}"
                    ChapterResource.objects.create(
                        chapter=chap_obj,
                        resource_type="video",
                        file_path=file_url
                    )
                    print(f"  Linked sample video for Grade 5 Science Ch1")

    # Ensure demo student exists
    if not Student.objects.exists():
        Student.objects.create(
            name="Misriya Mehek",
            age=10,
            school_name="Government Primary School",
            grade="Grade 5",
            mentor_name="Ananya Sharma"
        )
        print("Created default demo student: Misriya Mehek (Grade 5)")

    print("\nDatabase successfully seeded with Grades, Subjects, and Chapters!")

if __name__ == '__main__':
    run()
