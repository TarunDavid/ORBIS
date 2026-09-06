import os
from django.core.management.base import BaseCommand
from api.models import Chapter, ChapterResource
from faster_whisper import WhisperModel
import time

class Command(BaseCommand):
    help = 'Transcribes videos lacking a transcript in the media folder and translates them to English.'

    def add_arguments(self, parser):
        parser.add_argument('--grade', type=str, default=None, help='Filter by grade (e.g. 4, Grade 4)')
        parser.add_argument('--chapter-id', type=int, default=None, help='Filter by specific chapter ID')

    def handle(self, *args, **options):
        grade_arg = options.get('grade')
        chapter_id_arg = options.get('chapter_id')

        self.stdout.write(self.style.SUCCESS("Initializing Faster-Whisper Model..."))
        
        # Load whisper on CPU with int8 precision
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        self.stdout.write(self.style.SUCCESS("Model loaded successfully."))

        # Find all videos
        video_resources = ChapterResource.objects.select_related('chapter', 'chapter__subject', 'chapter__subject__grade').filter(resource_type='video')
        if chapter_id_arg:
            video_resources = video_resources.filter(chapter_id=chapter_id_arg)
        elif grade_arg:
            video_resources = video_resources.filter(chapter__subject__grade__identifier__icontains=grade_arg)
        
        processed_count = 0
        total_count = video_resources.count()
        
        for i, v in enumerate(video_resources, 1):
            # Locate the video file locally
            if '/media/' in v.file_path:
                relative_path = v.file_path.split('/media/', 1)[1]
                backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
                local_video_path = os.path.join(backend_dir, 'media', relative_path)
            else:
                local_video_path = v.file_path
            
            if not os.path.exists(local_video_path):
                self.stdout.write(self.style.WARNING(f"[{i}/{total_count}] Video file missing: {local_video_path}"))
                continue
                
            transcript_path = os.path.splitext(local_video_path)[0] + '.txt'
            
            # Skip if transcript already exists
            if os.path.exists(transcript_path):
                self.stdout.write(self.style.NOTICE(f"[{i}/{total_count}] Transcript already exists for {v.chapter.title}. Skipping."))
                continue
                
            self.stdout.write(self.style.NOTICE(f"[{i}/{total_count}] Transcribing and translating {v.chapter.title}..."))
            
            start_time = time.time()
            try:
                # Transcribe with translate task to enforce English
                segments, info = model.transcribe(local_video_path, task="translate")
                
                # We need to exhaust the generator to perform transcription
                transcript_text = " ".join([segment.text for segment in segments])
                
                # Save to txt
                with open(transcript_path, 'w', encoding='utf-8') as f:
                    f.write(transcript_text.strip())
                    
                elapsed = time.time() - start_time
                self.stdout.write(self.style.SUCCESS(f"[{i}/{total_count}] Done in {elapsed:.2f}s! Saved to {transcript_path}"))
                processed_count += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"[{i}/{total_count}] Error processing {v.chapter.title}: {str(e)}"))

        self.stdout.write(self.style.SUCCESS(f"Finished bulk transcription! Transcribed {processed_count} videos."))
