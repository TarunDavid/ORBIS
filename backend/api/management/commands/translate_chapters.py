import time
from django.core.management.base import BaseCommand
from api.models import Chapter

class Command(BaseCommand):
    help = 'Translates Hindi and Kannada chapter titles into native script'

    def handle(self, *args, **options):
        try:
            from deep_translator import MyMemoryTranslator
        except ImportError:
            self.stdout.write(self.style.ERROR("deep_translator not installed."))
            return

        for subj_code, lang_code in [('hindi', 'hi-IN'), ('kannada', 'kn-IN')]:
            chapters = Chapter.objects.filter(subject__identifier=subj_code)
            for c in chapters:
                # Basic check to avoid re-translating if it already has native chars
                has_native = any('\u0c80' <= char <= '\u0cff' or '\u0900' <= char <= '\u097f' for char in c.title)
                if not has_native:
                    try:
                        translated = MyMemoryTranslator(source='en-US', target=lang_code).translate(c.title)
                        if translated:
                            self.stdout.write(f"Translated: {c.title} -> {translated}")
                            c.title = translated
                            c.save(update_fields=['title'])
                        time.sleep(1)  # avoid rate limits
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f"Error translating '{c.title}': {e}"))
        self.stdout.write(self.style.SUCCESS('Done translating chapters!'))
