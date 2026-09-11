from django.core.management.base import BaseCommand
from api.models import Chapter, ChapterFormulaSheet, ContentChunk
import sys
import os

class Command(BaseCommand):
    help = "Generate Formula Sheets for Maths and Science chapters using local AI."

    def handle(self, *args, **options):
        # We only generate formulas for Math/Science related subjects
        target_subjects = ['Mathematics', 'Science', 'Physics', 'Chemistry']
        chapters = Chapter.objects.filter(subject__display_name__in=target_subjects)

        if not chapters.exists():
            self.stdout.write(self.style.WARNING("No Mathematics or Science chapters found."))
            return

        # Try to import LLMService. We assume Django settings are loaded.
        try:
            from ai_engine.services import LLMService
        except ImportError:
            # Maybe path issue, let's fix sys.path
            sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), 'ai_engine'))
            try:
                from ai_engine.services import LLMService
            except ImportError:
                self.stdout.write(self.style.ERROR("ai_engine services could not be imported."))
                return

        for chapter in chapters:
            self.stdout.write(self.style.NOTICE(f"Processing chapter: {chapter.title}..."))
            
            # Check if formula sheet already exists
            if hasattr(chapter, 'formula_sheet'):
                self.stdout.write(self.style.SUCCESS(f"  -> Formula sheet already exists. Skipping."))
                continue

            chunks = ContentChunk.objects.filter(chapter=chapter).order_by('order')
            if not chunks.exists():
                self.stdout.write(self.style.WARNING(f"  -> No content chunks found. Skipping."))
                continue

            # Concatenate up to ~10,000 characters of text to fit inside the prompt context safely
            full_text = "\n\n".join(c.text for c in chunks)
            if len(full_text) > 10000:
                full_text = full_text[:10000] + "\n...[truncated]"

            prompt_messages = [
                {
                    "role": "system",
                    "content": (
                        "You are an expert Math and Science teacher. Your job is to extract any mathematical, "
                        "physical, or chemical formulas, equations, or key mathematical definitions from the text provided. "
                        "Format the output strictly as beautifully structured Markdown. "
                        "Use block LaTeX (starting and ending with $$) for all formulas. "
                        "If there are NO formulas in the text, return exactly the string 'NO_FORMULAS'. "
                        "Do not include any pleasantries or conversational text, just the markdown formula sheet."
                    )
                },
                {
                    "role": "user",
                    "content": f"Extract the formula sheet from the following textbook chapter text:\n\n{full_text}"
                }
            ]

            try:
                self.stdout.write(f"  -> Requesting AI generation...")
                response = LLMService.chat(prompt_messages, max_tokens=2048)
                output_text = response['choices'][0]['message']['content'].strip()

                if output_text == 'NO_FORMULAS' or not output_text or len(output_text) < 10:
                    self.stdout.write(self.style.WARNING(f"  -> No formulas detected by AI."))
                    continue
                
                ChapterFormulaSheet.objects.create(
                    chapter=chapter,
                    content=output_text
                )
                self.stdout.write(self.style.SUCCESS(f"  -> Generated and saved formula sheet!"))
                
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  -> Failed to generate: {e}"))

        self.stdout.write(self.style.SUCCESS("Finished formula generation pass."))
