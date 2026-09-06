import os
import re
import urllib.parse
import markdown
from xhtml2pdf import pisa
from django.core.management.base import BaseCommand
from django.conf import settings
from api.models import Chapter, ChapterResource, Grade
from ai_engine.context import _load_transcript
from ai_engine.services import LLMService

PROMPT_TEMPLATE = """You are an expert school textbook author and curriculum specialist creating comprehensive chapter revision notes for Grade 5 students.

Based on the chapter title and video lecture transcript below, write an EXTENSIVE, comprehensive, and detailed set of chapter notes.
Chapter Title: {title}
Subject: {subject} ({grade})

Guidelines:
- The notes MUST be detailed, educational, and comprehensive (long enough to span 4+ pages).
- Expand on every concept, provide multiple concrete examples, deep-dive into the subject matter, and include review questions and summaries.
- Use clean Markdown formatting: clear headings (# Title, ## Section, ### Subtopics), rich bullet points, bold key terms, tables, callouts, and numbered lists.
- Include 5 practice review questions with answers/explanations at the end for exam preparation.
- Do NOT include any conversational filler (e.g. "Here are your notes:"). Output ONLY the raw Markdown.
- Do NOT wrap the entire response in a markdown code fence.

Content / Transcript:
{transcript}
"""

def generate_pdf_from_md(md_text: str, output_path: str) -> bool:
    """Renders markdown content to a styled PDF using xhtml2pdf."""
    clean_md = re.sub(r'^```(?:markdown)?\s*\n', '', md_text.strip(), flags=re.IGNORECASE)
    clean_md = re.sub(r'\n```\s*$', '', clean_md.strip())

    html_body = markdown.markdown(clean_md, extensions=['extra', 'tables', 'nl2br'])

    font_path = "/Library/Fonts/Arial Unicode.ttf"
    if not os.path.exists(font_path):
        font_path = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"

    font_face_css = ""
    font_family_css = "Helvetica, Arial, sans-serif"
    if os.path.exists(font_path):
        font_face_css = f"""
        @font-face {{
            font-family: 'ArialUnicode';
            src: url('{font_path}');
        }}
        """
        font_family_css = "'ArialUnicode', Helvetica, Arial, sans-serif"

    html_content = f"""
    <html>
    <head>
    <meta charset="utf-8">
    <style>
        @page {{
            size: A4;
            margin: 1.5cm;
        }}
        {font_face_css}
        body {{
            font-family: {font_family_css};
            font-size: 10.5pt;
            line-height: 1.5;
            color: #2D3748;
        }}
        h1 {{
            color: #1A365D;
            font-size: 20pt;
            margin-bottom: 14px;
            border-bottom: 2px solid #3182CE;
            padding-bottom: 6px;
        }}
        h2 {{
            color: #2B6CB0;
            font-size: 15pt;
            margin-top: 18px;
            margin-bottom: 8px;
            border-bottom: 1px solid #E2E8F0;
            padding-bottom: 4px;
        }}
        h3 {{
            color: #4A5568;
            font-size: 12pt;
            margin-top: 12px;
            margin-bottom: 4px;
        }}
        p {{
            margin-bottom: 10px;
        }}
        ul, ol {{
            margin-bottom: 12px;
            padding-left: 20px;
        }}
        li {{
            margin-bottom: 4px;
        }}
        strong {{
            color: #1A202C;
        }}
        blockquote {{
            background: #EDF2F7;
            border-left: 4px solid #3182CE;
            padding: 8px 14px;
            margin: 10px 0;
            font-style: italic;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
        }}
        th, td {{
            border: 1px solid #CBD5E0;
            padding: 6px 10px;
            text-align: left;
        }}
        th {{
            background-color: #E2E8F0;
            color: #2D3748;
            font-weight: bold;
        }}
    </style>
    </head>
    <body>
    {html_body}
    </body>
    </html>
    """

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w+b") as result_file:
        pisa_status = pisa.CreatePDF(html_content, dest=result_file)
        return not pisa_status.err


class Command(BaseCommand):
    help = 'Generates comprehensive PDF notes for chapters based on video transcripts.'

    def add_arguments(self, parser):
        parser.add_argument('--grade', type=str, default='5', help='Grade identifier (e.g. 5, Grade 5)')
        parser.add_argument('--chapter-id', type=int, default=None, help='Target a specific chapter ID')
        parser.add_argument('--replace-dummies', action='store_true', default=True, help='Replace dummy placeholders (<3KB)')
        parser.add_argument('--force', action='store_true', default=False, help='Force regeneration of all notes')

    def handle(self, *args, **options):
        grade_arg = options.get('grade')
        target_ch_id = options.get('chapter_id')
        replace_dummies = options.get('replace_dummies')
        force = options.get('force')

        self.stdout.write(self.style.SUCCESS(f"Starting notes generation (Grade: {grade_arg}, replace_dummies: {replace_dummies})..."))

        # Filter chapters
        qs = Chapter.objects.select_related('subject', 'subject__grade').all()
        if target_ch_id:
            qs = qs.filter(id=target_ch_id)
        elif grade_arg:
            qs = qs.filter(subject__grade__identifier__icontains=grade_arg)

        chapters = list(qs.order_by('id'))
        self.stdout.write(self.style.NOTICE(f"Found {len(chapters)} candidate chapters to inspect."))

        total_generated = 0
        total_skipped = 0

        for chapter in chapters:
            notes_resource = chapter.resources.filter(resource_type='notes').first()
            video_resource = chapter.resources.filter(resource_type='video').first()

            # Determine existing note path and size
            local_notes_path = None
            is_dummy = False

            if notes_resource:
                unquoted = urllib.parse.unquote(notes_resource.file_path)
                if '/media/' in unquoted:
                    rel_path = unquoted.split('/media/')[1]
                    local_notes_path = os.path.join(settings.MEDIA_ROOT, rel_path)
                else:
                    local_notes_path = unquoted

                if os.path.exists(local_notes_path):
                    size = os.path.getsize(local_notes_path)
                    if size < 2000:
                        is_dummy = True
                    elif not force:
                        self.stdout.write(self.style.WARNING(
                            f"Skipping Ch {chapter.id} ({chapter.title}): Real notes already exist ({size} bytes)."
                        ))
                        total_skipped += 1
                        continue
                else:
                    is_dummy = True
            else:
                is_dummy = True

            if not is_dummy and not force:
                total_skipped += 1
                continue

            # Load transcript if video exists
            transcript = ""
            if video_resource:
                transcript = _load_transcript(video_resource.file_path) or ""

            # Fallback for chapters without transcripts (e.g. 0-byte video)
            if not transcript or len(transcript.strip()) < 50:
                transcript = (
                    f"Chapter: {chapter.title}\n"
                    f"Subject: {chapter.subject.display_name}\n"
                    f"Grade: {chapter.subject.grade.identifier if chapter.subject.grade else 'Grade 5'}\n"
                    f"This chapter covers core syllabus concepts, detailed explanations, definitions, "
                    f"structural diagrams, classifications, real-world examples, and exam review."
                )

            self.stdout.write(self.style.NOTICE(
                f"Generating real notes for Ch {chapter.id}: {chapter.title} ({chapter.subject.display_name})..."
            ))

            prompt = PROMPT_TEMPLATE.format(
                title=chapter.title,
                subject=chapter.subject.display_name,
                grade=chapter.subject.grade.identifier if chapter.subject.grade else 'Grade 5',
                transcript=transcript[:10000]
            )

            try:
                res = LLMService.chat(
                    messages=[
                        {"role": "system", "content": "You are a professional educational curriculum author creating comprehensive textbook revision notes."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=1500,
                    temperature=0.3,
                )
                md_notes = res['choices'][0]['message']['content'].strip()

                # Determine PDF path to write
                if local_notes_path:
                    target_pdf_path = local_notes_path
                elif video_resource:
                    v_unquoted = urllib.parse.unquote(video_resource.file_path)
                    if '/media/' in v_unquoted:
                        v_rel = v_unquoted.split('/media/')[1]
                        v_dir = os.path.dirname(os.path.join(settings.MEDIA_ROOT, v_rel))
                    else:
                        v_dir = os.path.dirname(v_unquoted)
                    target_pdf_path = os.path.join(v_dir, 'Chapter_Notes.pdf')
                else:
                    target_pdf_path = os.path.join(settings.MEDIA_ROOT, f'ch_{chapter.id}_notes.pdf')

                success = generate_pdf_from_md(md_notes, target_pdf_path)

                if success:
                    pdf_size = os.path.getsize(target_pdf_path)

                    # Ensure ChapterResource is correctly tracked in DB
                    if not notes_resource and video_resource:
                        if '/media/' in video_resource.file_path:
                            base_url = video_resource.file_path.split('/media/')[0]
                            rel_dir = os.path.dirname(video_resource.file_path.split('/media/')[1])
                            db_path = f"{base_url}/media/{rel_dir}/Chapter_Notes.pdf"
                        else:
                            db_path = target_pdf_path

                        ChapterResource.objects.create(
                            chapter=chapter,
                            resource_type='notes',
                            file_path=db_path
                        )

                    self.stdout.write(self.style.SUCCESS(
                        f" Successfully generated notes for Ch {chapter.id} ({pdf_size} bytes, replaced placeholder)"
                    ))
                    total_generated += 1
                else:
                    self.stdout.write(self.style.ERROR(f"Failed to compile PDF for Chapter {chapter.id}"))

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error generating notes for Chapter {chapter.id}: {e}"))

        self.stdout.write(self.style.SUCCESS(
            f"\n=== Finished Generation Summary ===\n"
            f"Total Generated/Replaced: {total_generated}\n"
            f"Total Real Notes Preserved: {total_skipped}\n"
        ))
