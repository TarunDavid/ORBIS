import os
import re
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

# Subject mapping: folder name -> (identifier, display_name)
SUBJECT_MAPPINGS = {
    'kannada': ('kannada', 'ಕನ್ನಡ'),
    'english': ('english', 'English'),
    'hindi': ('hindi', 'हिन्दी'),
    'maths': ('maths', 'Mathematics'),
    'mathematics': ('maths', 'Mathematics'),
    'math': ('maths', 'Mathematics'),
    'science': ('science', 'Science'),
    'social_science': ('social_science', 'Social Science'),
    'social science': ('social_science', 'Social Science'),
    'social-science': ('social_science', 'Social Science'),
}

VIDEO_EXTS = {'.mp4', '.mkv', '.webm', '.avi', '.mov'}
NOTES_EXTS = {'.pdf', '.doc', '.docx'}
PPT_EXTS = {'.ppt', '.pptx', '.odp', '.key'}
TRANSCRIPT_EXTS = {'.txt', '.srt', '.vtt'}


def clean_title_from_filename(filename: str) -> str:
    """Extract a clean, human-readable chapter title from a media filename."""
    name = os.path.splitext(filename)[0]
    # Remove parenthetical / bracketed info like (360p, h264), (Complete Chapter), [HD], etc.
    name = re.sub(r'\(.*?\)', '', name)
    name = re.sub(r'\[.*?\]', '', name)
    # Remove common YouTube / distributor suffixes
    name = re.sub(
        r'\s*-\s*(Learning Notebook|Genius Shiksha|Sadhana Academy|Magnet Brains|Khan Academy).*',
        '',
        name,
        flags=re.IGNORECASE
    )
    # Remove redundant class / grade / subject / chapter prefixes
    name = re.sub(r'^(Class|Grade|C)\s*\d+\s*', '', name, flags=re.IGNORECASE)
    name = re.sub(
        r'^(Maths|Mathematics|Science|English|Hindi|Social Science|Kannada)\s*',
        '',
        name,
        flags=re.IGNORECASE
    )
    name = re.sub(r'^(Chapter\s*\d*|Ch\s*\d*)\s*', '', name, flags=re.IGNORECASE)
    # Remove trailing Notes/Presentation markers if present in base title
    name = re.sub(r'\s+Notes$', '', name, flags=re.IGNORECASE)
    # Clean up punctuation and whitespace
    name = re.sub(r'[।|]+', ' - ', name)
    name = re.sub(r'\s+', ' ', name).strip(' -_')
    return name if name else os.path.splitext(filename)[0]


def normalize_grade(folder_name: str) -> str:
    """e.g. 'grade1' -> 'Grade 1', 'Grade 5' -> 'Grade 5'"""
    match = re.search(r'\d+', folder_name)
    if match:
        return f"Grade {match.group(0)}"
    return folder_name.strip().title()


def normalize_subject(folder_name: str):
    """Returns (identifier, display_name) for a subject folder."""
    key = folder_name.strip().lower().replace('-', '_')
    if key in SUBJECT_MAPPINGS:
        return SUBJECT_MAPPINGS[key]
    # Default fallback
    clean_id = re.sub(r'[^a-zA-Z0-9_]', '', key)
    display = folder_name.replace('_', ' ').replace('-', ' ').title()
    return clean_id, display


def parse_chapter_order(folder_name: str) -> int:
    """e.g. 'ch1' -> 1, 'chapter2' -> 2, '3' -> 3"""
    match = re.search(r'\d+', folder_name)
    if match:
        return int(match.group(0))
    return 1


def scan_and_sync_media(media_root: str = None, verbose: bool = False) -> dict:
    """
    Universally scans the media root directory and creates/updates
    Grade, Subject, Chapter, and ChapterResource models in the database.
    """
    from .models import Grade, Subject, Chapter, ChapterResource

    if not media_root:
        media_root = getattr(settings, 'MEDIA_ROOT', '')

    if not media_root or not os.path.exists(media_root):
        logger.warning(f"Media root does not exist: {media_root}")
        return {'status': 'media_root_missing', 'grades': 0, 'subjects': 0, 'chapters': 0, 'resources': 0}

    stats = {
        'grades_created': 0,
        'subjects_created': 0,
        'chapters_created': 0,
        'resources_created': 0,
        'resources_updated': 0,
    }

    # Find grade directories (e.g. grade1, grade2, ..., grade5)
    grade_dirs = []
    for item in sorted(os.listdir(media_root)):
        if item.startswith('.') or item == 'ai_summaries' or item == 'profile_pics':
            continue
        full_p = os.path.join(media_root, item)
        if os.path.isdir(full_p) and ('grade' in item.lower() or re.match(r'^[1-9]$', item)):
            grade_dirs.append((item, full_p))

    for g_folder, g_path in grade_dirs:
        grade_identifier = normalize_grade(g_folder)
        grade, g_created = Grade.objects.get_or_create(identifier=grade_identifier)
        if g_created:
            stats['grades_created'] += 1

        # Scan subjects in grade
        for s_folder in sorted(os.listdir(g_path)):
            if s_folder.startswith('.'):
                continue
            s_path = os.path.join(g_path, s_folder)
            if not os.path.isdir(s_path):
                continue

            subj_ident, subj_display = normalize_subject(s_folder)
            
            # Find subject or merge duplicates (e.g. 'mathematics' vs 'maths')
            possible_idents = [subj_ident]
            if subj_ident == 'maths':
                possible_idents.append('mathematics')
            matching_subjects = list(Subject.objects.filter(grade=grade, identifier__in=possible_idents))
            if not matching_subjects:
                matching_subjects = list(Subject.objects.filter(grade=grade, display_name__iexact=subj_display))

            if matching_subjects:
                subject = matching_subjects[0]
                for dup in matching_subjects[1:]:
                    for ch in dup.chapters.all():
                        ch.subject = subject
                        ch.save()
                    dup.delete()
                subject.identifier = subj_ident
                subject.display_name = subj_display
                subject.save(update_fields=['identifier', 'display_name'])
            else:
                subject = Subject.objects.create(
                    identifier=subj_ident,
                    grade=grade,
                    display_name=subj_display
                )
                stats['subjects_created'] += 1

            # Scan chapters in subject
            scanned_orders = set()
            for ch_folder in sorted(os.listdir(s_path)):
                if ch_folder.startswith('.'):
                    continue
                ch_path = os.path.join(s_path, ch_folder)
                if not os.path.isdir(ch_path):
                    continue

                order = parse_chapter_order(ch_folder)
                scanned_orders.add(order)
                chapter_ident = f"{subj_ident}_ch{order}"

                # Inspect media files inside this chapter directory
                clean_files = [f for f in os.listdir(ch_path) if not f.startswith('.')]
                video_files = [f for f in clean_files if os.path.splitext(f)[1].lower() in VIDEO_EXTS]
                notes_files = [f for f in clean_files if os.path.splitext(f)[1].lower() in NOTES_EXTS]
                ppt_files = [f for f in clean_files if os.path.splitext(f)[1].lower() in PPT_EXTS]

                # Determine best human-readable chapter title
                chapter_title = ""
                if video_files:
                    chapter_title = clean_title_from_filename(video_files[0])
                elif notes_files:
                    chapter_title = clean_title_from_filename(notes_files[0])
                elif ppt_files:
                    chapter_title = clean_title_from_filename(ppt_files[0])
                
                if not chapter_title or chapter_title.lower() in ['video', 'notes', 'chapter', 'presentation']:
                    chapter_title = f"{subj_display} Chapter {order}"

                # Match by order within subject to prevent duplicate chapters
                matching_chapters = list(Chapter.objects.filter(subject=subject, order=order))
                if not matching_chapters:
                    matching_chapters = list(Chapter.objects.filter(subject=subject, identifier=chapter_ident))

                if matching_chapters:
                    chapter = matching_chapters[0]
                    for dup in matching_chapters[1:]:
                        for res in dup.resources.all():
                            res.chapter = chapter
                            res.save()
                        dup.chat_sessions.all().update(chapter=chapter)
                        dup.quiz_attempts.all().update(chapter=chapter)
                        dup.progress.all().update(chapter=chapter)
                        dup.flashcard_sets.all().update(chapter=chapter)
                        dup.delete()

                    # Preserve native titles if they were already translated
                    if subj_ident in ['hindi', 'kannada']:
                        has_native = any('\u0c80' <= char <= '\u0cff' or '\u0900' <= char <= '\u097f' for char in chapter.title)
                        if has_native:
                            chapter_title = chapter.title
                            
                    chapter.identifier = chapter_ident
                    chapter.title = chapter_title
                    chapter.order = order
                    chapter.save(update_fields=['identifier', 'title', 'order'])
                else:
                    chapter = Chapter.objects.create(
                        identifier=chapter_ident,
                        subject=subject,
                        title=chapter_title,
                        order=order
                    )
                    stats['chapters_created'] += 1

                # Helper to register or deduplicate a resource
                def _register_resource(r_type, url):
                    matches = list(ChapterResource.objects.filter(chapter=chapter, resource_type=r_type, file_path=url))
                    if not matches:
                        ChapterResource.objects.create(chapter=chapter, resource_type=r_type, file_path=url)
                        return True
                    elif len(matches) > 1:
                        for dup in matches[1:]:
                            dup.delete()
                    return False

                # Register Videos
                for vf in video_files:
                    rel_url = f"/media/{g_folder}/{s_folder}/{ch_folder}/{vf}"
                    if _register_resource('video', rel_url):
                        stats['resources_created'] += 1

                # Register Notes
                for nf in notes_files:
                    res_type = 'textbook' if 'textbook' in nf.lower() else 'notes'
                    rel_url = f"/media/{g_folder}/{s_folder}/{ch_folder}/{nf}"
                    if _register_resource(res_type, rel_url):
                        stats['resources_created'] += 1

                # Register PPTs / Presentations
                for pf in ppt_files:
                    rel_url = f"/media/{g_folder}/{s_folder}/{ch_folder}/{pf}"
                    if _register_resource('ppt', rel_url):
                        stats['resources_created'] += 1

            # Remove any extra chapters not present on disk
            subject.chapters.exclude(order__in=scanned_orders).delete()

    return stats


def discover_chapter_resources(chapter) -> list:
    """
    On-the-fly resource discovery for a single chapter.
    Looks on disk in the media folder corresponding to chapter's Grade and Subject.
    If resources are missing in DB, creates and returns them.
    """
    from .models import ChapterResource

    existing = list(chapter.resources.all())
    if existing:
        return existing

    media_root = getattr(settings, 'MEDIA_ROOT', '')
    if not media_root or not os.path.exists(media_root):
        return existing

    # Find matching grade folder
    grade_name = chapter.subject.grade.identifier.lower().replace(' ', '')
    grade_dirs = [
        d for d in os.listdir(media_root)
        if not d.startswith('.')
        and os.path.isdir(os.path.join(media_root, d))
        and (d.lower().replace(' ', '') == grade_name or grade_name in d.lower())
    ]
    if not grade_dirs:
        return existing

    g_path = os.path.join(media_root, grade_dirs[0])
    subj_dirs = [
        d for d in os.listdir(g_path)
        if not d.startswith('.')
        and os.path.isdir(os.path.join(g_path, d))
        and chapter.subject.identifier in d.lower()
    ]
    if not subj_dirs:
        return existing

    s_path = os.path.join(g_path, subj_dirs[0])
    ch_target = f"ch{chapter.order}"
    ch_dirs = [
        d for d in os.listdir(s_path)
        if not d.startswith('.')
        and os.path.isdir(os.path.join(s_path, d))
        and (d.lower() == ch_target or f"chapter{chapter.order}" in d.lower() or d == str(chapter.order))
    ]
    if not ch_dirs:
        return existing

    ch_path = os.path.join(s_path, ch_dirs[0])
    clean_files = [f for f in os.listdir(ch_path) if not f.startswith('.')]

    new_resources = []
    for f in clean_files:
        ext = os.path.splitext(f)[1].lower()
        res_type = None
        if ext in VIDEO_EXTS:
            res_type = 'video'
        elif ext in PPT_EXTS:
            res_type = 'ppt'
        elif ext in NOTES_EXTS:
            res_type = 'textbook' if 'textbook' in f.lower() else 'notes'

        if res_type:
            rel_url = f"/media/{grade_dirs[0]}/{subj_dirs[0]}/{ch_dirs[0]}/{f}"
            matches = list(ChapterResource.objects.filter(chapter=chapter, resource_type=res_type, file_path=rel_url))
            if not matches:
                res = ChapterResource.objects.create(chapter=chapter, resource_type=res_type, file_path=rel_url)
                new_resources.append(res)
            else:
                new_resources.append(matches[0])
                for dup in matches[1:]:
                    dup.delete()

    return new_resources
