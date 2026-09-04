import os
import sys
import django
import argparse

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'educarnival.settings')
django.setup()

from ai_engine.services import STTService
from api.models import ChapterResource
from ai_engine.context import _resolve_local_path, invalidate_cache

def transcribe_videos(chapter_id=None):
    print("Initializing Whisper STT...")
    stt = STTService.get_instance()
    
    if chapter_id:
        videos = ChapterResource.objects.filter(resource_type='video', chapter_id=chapter_id)
    else:
        videos = ChapterResource.objects.filter(resource_type='video')
        
    for v in videos:
        local_path = _resolve_local_path(v.file_path)
        
        if not local_path or not os.path.exists(local_path):
            print(f"File not found: {local_path}")
            continue
            
        video_dir = os.path.dirname(local_path)
        video_name = os.path.splitext(os.path.basename(local_path))[0]
        transcript_path = os.path.join(video_dir, f"{video_name}.txt")
        
        if os.path.exists(transcript_path):
            print(f"Transcript already exists for {video_name}")
            continue
            
        print(f"Transcribing {video_name}...")
        try:
            # We use smaller beam size or fp16 if possible to speed up, but base settings are fine
            # We use task="translate" to automatically translate Hindi/Kannada to English
            segments, info = stt.transcribe(local_path, beam_size=5, task="translate")
            transcript_text = "".join([segment.text for segment in segments]).strip()
            
            with open(transcript_path, 'w', encoding='utf-8') as f:
                f.write(transcript_text)
            print(f"Saved transcript to {transcript_path}")
            
            invalidate_cache(v.chapter.id)
            
        except Exception as e:
            print(f"Failed to transcribe {local_path}: {e}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--chapter_id', type=int, help='Only transcribe a specific chapter ID')
    args = parser.parse_args()
    
    transcribe_videos(chapter_id=args.chapter_id)
