import json
from django.core.management.base import BaseCommand
from api.models import Chapter, ChapterQuizQuestion
from ai_engine.context import get_chapter_context
from ai_engine.services import LLMService
from ai_engine.prompts import GENERATE_OFFLINE_QUIZ_WITH_HINTS, build_messages

class Command(BaseCommand):
    help = 'Pre-generates quiz questions and hints for chapters using LLM.'

    def add_arguments(self, parser):
        parser.add_argument('--chapter-id', type=int, default=None, help='Target a specific chapter ID')
        parser.add_argument('--count', type=int, default=10, help='Number of questions to generate per chapter')
        parser.add_argument('--clear', action='store_true', default=False, help='Clear existing generated questions for the chapter')

    def handle(self, *args, **options):
        target_ch_id = options.get('chapter_id')
        count = options.get('count')
        clear = options.get('clear')

        qs = Chapter.objects.all()
        if target_ch_id:
            qs = qs.filter(id=target_ch_id)

        for chapter in qs:
            self.stdout.write(self.style.SUCCESS(f"Processing Chapter {chapter.id}: {chapter.title}"))
            
            if clear:
                deleted, _ = ChapterQuizQuestion.objects.filter(chapter=chapter).delete()
                self.stdout.write(f"Cleared {deleted} existing questions.")

            # Get chapter context
            context = get_chapter_context(chapter.id)
            if not context or "No extracted context available" in context:
                self.stdout.write(self.style.WARNING(f"Skipping {chapter.title} - no context found."))
                continue

            self.stdout.write("Generating questions with Qwen2.5...")
            messages = build_messages(
                GENERATE_OFFLINE_QUIZ_WITH_HINTS.format(chapter_context=context, count=count)
            )

            try:
                quiz_data = LLMService.generate_json(messages, max_tokens=1500, retries=1)
                
                if not quiz_data or 'questions' not in quiz_data:
                    self.stdout.write(self.style.ERROR("Failed to parse JSON response."))
                    continue
                
                questions = quiz_data.get('questions', [])
                self.stdout.write(f"Parsed {len(questions)} questions.")

                for q_data in questions:
                    q_text = q_data.get('question', '')
                    options = q_data.get('options', [])
                    correct_letter = q_data.get('correct_answer', 'A')
                    hint_text = q_data.get('hint', '')

                    # Map letter to exact option text for overlap checking
                    correct_option_text = ""
                    for opt in options:
                        if opt.startswith(correct_letter):
                            # Remove the "A) " or "A." part
                            parts = opt.split(' ', 1)
                            if len(parts) > 1:
                                correct_option_text = parts[1].strip()
                            else:
                                correct_option_text = opt
                            break
                    
                    status = 'pending'
                    # Lightweight overlap check (FR-5 proxy)
                    if correct_option_text and correct_option_text.lower() in hint_text.lower():
                        status = 'needs_rework'
                        self.stdout.write(self.style.WARNING(f"Flagged hint for Q: {q_text[:30]}... (overlap detected)"))

                    ChapterQuizQuestion.objects.create(
                        chapter=chapter,
                        question_text=q_text,
                        options=options,
                        correct_answer=correct_letter,
                        hint_text=hint_text,
                        hint_review_status=status
                    )
                
                self.stdout.write(self.style.SUCCESS(f"Successfully saved {len(questions)} questions for chapter {chapter.id}."))

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error generating quiz for chapter {chapter.id}: {e}"))
