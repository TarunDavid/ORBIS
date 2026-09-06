import os
import django
import re

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'educarnival.settings')
django.setup()

from api.models import Chapter
from ai_engine.services import LLMService

PROMPT_TEMPLATE = """You are an expert curriculum organizer. Your job is to extract the core educational topic from the following messy video title.
Rules:
1. Output ONLY the short, clean topic name (2-6 words).
2. Do not include words like 'Class X', 'Chapter X', 'Grade X', 'Part X'.
3. Strip out channel names, publisher names, video qualities like (360p, h264), and random punctuation (like dashes or pipes | ).
4. Do NOT output any conversational text, just the raw title.

Title: {title}
"""

def clean_fallback(title):
    # A basic regex fallback in case LLM fails
    title = re.sub(r'\(.*?\)', '', title) # remove things in parens
    title = re.sub(r'(?i)(class|grade)\s*\d+', '', title)
    title = title.split('-')[0].split('।')[0].strip()
    return title.strip()

def run():
    print("Starting AI chapter renaming process...")
    chapters = Chapter.objects.all()
    llm = LLMService.get_instance()
    
    total = chapters.count()
    success = 0
    
    for i, chapter in enumerate(chapters, 1):
        raw_title = chapter.title
        
        # Check if it already looks somewhat clean (less than 6 words and no weird characters)
        if len(raw_title.split()) < 6 and "(" not in raw_title and "-" not in raw_title and "Class" not in raw_title:
            print(f"[{i}/{total}] Skipping already clean title: {raw_title}")
            continue
            
        prompt = PROMPT_TEMPLATE.format(title=raw_title)
        print(f"[{i}/{total}] Processing: {raw_title}")
        
        try:
            output = llm.create_chat_completion(
                messages=[
                    {"role": "system", "content": "You are a professional educational curriculum designer."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=20, # Short titles only
                temperature=0.1
            )
            clean_title = output['choices'][0]['message']['content'].strip().strip('"').strip("'")
            
            # If the LLM goes rogue and outputs a long paragraph, fallback
            if len(clean_title) > 100 or '\n' in clean_title:
                clean_title = clean_fallback(raw_title)
                
            chapter.title = clean_title
            chapter.save()
            success += 1
            print(f"    -> Renamed to: {clean_title}")
            
        except Exception as e:
            print(f"    -> Error processing '{raw_title}': {e}")
            fallback_title = clean_fallback(raw_title)
            chapter.title = fallback_title
            chapter.save()
            print(f"    -> Fallback Renamed to: {fallback_title}")

    print(f"Done! Successfully renamed {success} chapters.")

if __name__ == '__main__':
    run()
