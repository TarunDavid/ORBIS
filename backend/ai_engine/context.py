"""
Chapter context extraction service.

Extracts text from chapter resources (PDFs, transcripts) and caches
the result so the LLM gets real chapter content instead of hardcoded stubs.

Mihir owns: context construction, caching, integration with LLM layer.
Rohan owns: RAG/FAISS retrieval (Phase 3 will augment this with RAG contexts).
"""

import os
import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

# Max characters of context to send to the LLM to stay within token budget
MAX_CONTEXT_CHARS = 60000


def _extract_pdf_text(file_path: str) -> str:
    """
    Extract text from a PDF file.
    
    Tries PyMuPDF (fitz) first for speed, falls back to pdfplumber.
    If neither is available, returns empty string.
    """
    # Resolve local file path from URL if needed
    local_path = _resolve_local_path(file_path)
    if not local_path or not os.path.exists(local_path):
        logger.warning(f"PDF not found at: {local_path} (from {file_path})")
        return ""

    # Try PyMuPDF first (faster)
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(local_path)
        text_parts = []
        for page in doc:
            text_parts.append(page.get_text())
        doc.close()
        return "\n".join(text_parts).strip()
    except ImportError:
        pass
    except Exception as e:
        logger.error(f"PyMuPDF extraction failed for {local_path}: {e}")

    # Fallback to pdfplumber
    try:
        import pdfplumber
        text_parts = []
        with pdfplumber.open(local_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        return "\n".join(text_parts).strip()
    except ImportError:
        logger.warning("Neither PyMuPDF nor pdfplumber installed. Cannot extract PDF text.")
    except Exception as e:
        logger.error(f"pdfplumber extraction failed for {local_path}: {e}")

    return ""


def _load_transcript(file_path: str) -> str:
    """
    Load a video transcript from an associated .txt or .srt file.
    
    Looks for a transcript file alongside the video file:
    - video.mp4 → video.txt or video.srt or transcript.txt
    """
    local_path = _resolve_local_path(file_path)
    if not local_path:
        return ""
    
    video_dir = os.path.dirname(local_path)
    video_name = os.path.splitext(os.path.basename(local_path))[0]
    
    # Check for transcript files in priority order
    transcript_candidates = [
        os.path.join(video_dir, f"{video_name}.txt"),
        os.path.join(video_dir, "transcript.txt"),
        os.path.join(video_dir, f"{video_name}.srt"),
    ]
    
    for transcript_path in transcript_candidates:
        if os.path.exists(transcript_path):
            try:
                with open(transcript_path, 'r', encoding='utf-8') as f:
                    text = f.read().strip()
                logger.info(f"Loaded transcript from {transcript_path}")
                return text
            except Exception as e:
                logger.error(f"Failed to read transcript {transcript_path}: {e}")
    
    return ""


def _resolve_local_path(url_or_path: str) -> str:
    """
    Convert a media URL (e.g. http://localhost:8080/media/grade5/science/ch1/video.mp4)
    to a local filesystem path relative to the backend's media directory.
    
    Also handles already-local paths.
    """
    if not url_or_path:
        return ""
    
    # If it's already a local path that exists, use it directly
    if os.path.exists(url_or_path):
        return url_or_path
    
    # Extract the path after /media/
    if '/media/' in url_or_path:
        relative = url_or_path.split('/media/', 1)[1]
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        local_path = os.path.join(backend_dir, 'media', relative)
        return local_path
    
    return url_or_path


@lru_cache(maxsize=64)
def get_chapter_context(chapter_id: int) -> str:
    """
    Extract and return combined text context for a chapter.
    
    Gathers text from:
    1. PDF notes
    2. PDF textbook excerpts  
    3. Video transcripts
    
    Results are cached per chapter_id to avoid re-processing.
    
    In Phase 3, this will be augmented/replaced by Rohan's RAG retrieval.
    """
    # Import here to avoid circular imports with Django models
    from api.models import ChapterResource
    
    context_parts = []
    
    try:
        resources = ChapterResource.objects.filter(chapter_id=chapter_id)
        
        for resource in resources:
            if resource.resource_type == 'notes':
                notes_text = _extract_pdf_text(resource.file_path)
                if notes_text:
                    context_parts.append(f"[Chapter Notes]\n{notes_text}")
                    
            elif resource.resource_type == 'textbook':
                textbook_text = _extract_pdf_text(resource.file_path)
                if textbook_text:
                    context_parts.append(f"[Textbook Content]\n{textbook_text}")
                    
            elif resource.resource_type == 'video':
                transcript = _load_transcript(resource.file_path)
                if transcript:
                    context_parts.append(f"[Video Transcript]\n{transcript}")
    
    except Exception as e:
        logger.error(f"Error extracting context for chapter {chapter_id}: {e}")
    
    if not context_parts:
        return (
            "No chapter content could be extracted. "
            "The student may be viewing a chapter without loaded materials. "
            "Answer based on general educational knowledge but note that "
            "specific chapter materials are not available."
        )
    
    # Join and truncate to stay within LLM token budget
    full_context = "\n\n".join(context_parts)
    if len(full_context) > MAX_CONTEXT_CHARS:
        full_context = full_context[:MAX_CONTEXT_CHARS] + "\n\n[Content truncated for length]"
    
    return full_context


def invalidate_cache(chapter_id: int = None):
    """
    Clear cached context. Call when chapter content is updated
    (e.g. after content sync).
    """
    if chapter_id is None:
        get_chapter_context.cache_clear()
    else:
        # lru_cache doesn't support per-key invalidation,
        # so we clear the whole cache
        get_chapter_context.cache_clear()


def get_chapter_language(chapter_id: int) -> str:
    """
    Determine the primary language for a chapter ('kannada', 'hindi', or 'english').
    """
    from api.models import Chapter
    try:
        chapter = Chapter.objects.select_related('subject').get(id=chapter_id)
        subject_ident = (chapter.subject.identifier or '').lower()
        disp = (chapter.subject.display_name or '').lower()
        if 'kannada' in subject_ident or 'ಕನ್ನಡ' in chapter.subject.display_name:
            return 'kannada'
        elif 'hindi' in subject_ident or 'हिन्दी' in chapter.subject.display_name or 'हिंदी' in chapter.subject.display_name:
            return 'hindi'
    except Exception as e:
        logger.warning(f"Could not determine language for chapter {chapter_id}: {e}")
    return 'english'


def translate_query_to_language(text: str, target_lang: str) -> str:
    """
    Translates an English user question into the chapter's native language (Kannada or Hindi).
    Uses MyMemoryTranslator with caching and fallback.
    """
    target_lang = (target_lang or '').lower()
    if target_lang not in ['kannada', 'hindi']:
        return text

    if not text or not text.strip():
        return text

    # Check if text contains Latin/English letters
    has_latin = any('a' <= c.lower() <= 'z' for c in text)
    if not has_latin:
        return text

    if target_lang == 'kannada':
        # If text is already in Kannada script, skip
        if any('\u0C80' <= c <= '\u0CFF' for c in text):
            return text
        lang_code = 'kn-IN'
    else:
        # If text is already in Hindi Devanagari script, skip
        if any('\u0900' <= c <= '\u097F' for c in text):
            return text
        lang_code = 'hi-IN'

    try:
        from deep_translator import MyMemoryTranslator
        translated = MyMemoryTranslator(source='en-US', target=lang_code, email='educarnival.orbis@gmail.com').translate(text)
        if translated and translated.strip():
            logger.info(f"Translated query [{text}] -> [{translated.strip()}] ({target_lang})")
            return translated.strip()
    except Exception as e:
        logger.warning(f"Translation failed via MyMemoryTranslator: {e}")

    return text


