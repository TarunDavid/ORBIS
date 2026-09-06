"""
AI engine API views.

Mihir owns: LLM integration, prompt construction, context construction,
             response handling, flashcard/quiz generation endpoints.
Tarun owns: Whisper/Piper implementation (STT/TTS services).
"""

import os
import json
import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings

from .services import LLMService, STTService, TTSService
from .context import get_chapter_context, get_chapter_language, translate_query_to_language
from .prompts import (
    SYSTEM_TUTOR,
    SYSTEM_VOICE_TUTOR,
    SUMMARIZE_VIDEO,
    GENERATE_FLASHCARDS,
    GENERATE_QUIZ,
    EXPLAIN_INCORRECT_QUESTION,
    IDENTIFY_WEAK_CONCEPTS,
    get_system_tutor_prompt,
    get_voice_tutor_prompt,
    get_summarize_prompt,
    build_chat_prompt,
    build_completion_prompt,
    build_messages,
)

logger = logging.getLogger(__name__)


def _safe_translate(text: str, lang_code: str, max_retries: int = 2) -> str:
    """Translates text safely with non-blocking timeout and retry logic."""
    import requests
    import time
    from deep_translator import MyMemoryTranslator

    clean = text.strip()
    if not clean:
        return ""

    orig_get = requests.get
    def timeout_get(*args, **kwargs):
        if 'timeout' not in kwargs:
            kwargs['timeout'] = 6
        return orig_get(*args, **kwargs)
    requests.get = timeout_get

    for attempt in range(max_retries):
        try:
            t = MyMemoryTranslator(source='en-US', target=lang_code, email='educarnival.orbis@gmail.com')
            res = t.translate(clean)
            if res and res.strip():
                return res.strip()
        except Exception as e:
            logger.warning(f"Translation attempt {attempt+1} failed for '{clean[:25]}': {e}")
            time.sleep(0.3)
    return ""


def generate_educational_summary(chapter_id: int, force_refresh: bool = False) -> tuple[str, str]:
    """
    Generates a structured, curriculum-grounded educational summary in the chapter's native language.
    Avoids raw Whisper transcript errors, speech disfluencies, and garbled quotes.
    Caches results to disk for fast, repeatable retrieval.
    """
    import json
    import os
    import re
    import urllib.parse
    from django.conf import settings
    from api.models import Chapter
    from deep_translator import MyMemoryTranslator

    # Check disk cache first unless forced
    cache_dir = os.path.join(settings.MEDIA_ROOT, 'ai_summaries')
    os.makedirs(cache_dir, exist_ok=True)
    cache_file = os.path.join(cache_dir, f'summary_{chapter_id}.json')

    if not force_refresh and os.path.exists(cache_file):
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                cached_data = json.load(f)
                if cached_data.get('summary') and cached_data.get('language'):
                    return cached_data['summary'], cached_data['language']
        except Exception as e:
            logger.warning(f"Error reading summary cache for chapter {chapter_id}: {e}")

    ch = Chapter.objects.select_related('subject', 'subject__grade').get(id=chapter_id)
    lang_ident = (ch.subject.identifier or '').lower()
    disp_name = ch.subject.display_name or ''
    grade_name = ch.subject.grade.identifier if ch.subject.grade else ''

    if 'kannada' in lang_ident or 'ಕನ್ನಡ' in disp_name:
        target_lang = 'kannada'
        lang_code = 'kn-IN'
        header_overview = '### 📖 ಪಾಠದ ಪರಿಚಯ'
        header_concepts = '### 💡 ಪ್ರಮುಖ ಕಲಿಕಾಂಶಗಳು'
        header_exam = '### 🎯 ಪರೀಕ್ಷೆಗೆ ನೆನಪಿಡಬೇಕಾದ ಮುಖ್ಯಾಂಶಗಳು'
    elif 'hindi' in lang_ident or 'हिन्दी' in disp_name or 'हिंदी' in disp_name:
        target_lang = 'hindi'
        lang_code = 'hi-IN'
        header_overview = '### 📖 पाठ का परिचय'
        header_concepts = '### 💡 मुख्य अवधारणाएँ एवं सीख'
        header_exam = '### 🎯 परीक्षा के लिए महत्वपूर्ण बातें'
    else:
        target_lang = 'english'
        lang_code = None
        header_overview = '### 📖 Chapter Overview'
        header_concepts = '### 💡 Key Concepts & Learnings'
        header_exam = '### 🎯 Key Exam Takeaways'

    # Clean lecture title from video resource
    video_res = ch.resources.filter(resource_type='video').first()
    lecture_title = ''
    if video_res:
        raw_name = os.path.basename(urllib.parse.unquote(video_res.file_path))
        raw_name = re.sub(r'\s*\(\d+p,.*?\)\.mp4$', '', raw_name)
        lecture_title = raw_name.replace('.mp4', '').strip()

    sys_prompt = """You are a senior school curriculum designer authoring a study guide for students.
Based on the chapter title, subject, grade, and video lecture topic, write a high-quality, structured educational summary.
Structure into exactly 3 sections:
Overview:
(2 clear sentences introducing the lesson topic, educational objectives, and why it is important)

Key Concepts:
- **Concept 1**: Detailed explanation of first concept.
- **Concept 2**: Detailed explanation of second concept.
- **Concept 3**: Detailed explanation of third concept.

Exam Takeaways:
- **Point 1**: Actionable point for revision and exam scoring.
- **Point 2**: Actionable point for revision and exam scoring.

STRICT RULES:
- Do NOT quote speech-to-text glitches, transcripts, or conversational filler.
- Do NOT use generic filler sentences.
- Write coherent, factual educational explanations appropriate for the school syllabus."""

    user_prompt = f"""Chapter Title: {ch.title}
Subject: {disp_name} ({grade_name})
Lecture Topic: {lecture_title}

Write the educational study guide now:"""

    res = LLMService.chat(
        messages=[
            {'role': 'system', 'content': sys_prompt},
            {'role': 'user', 'content': user_prompt}
        ],
        max_tokens=600,
        temperature=0.3,
        repeat_penalty=1.18,
    )
    raw_draft = res['choices'][0]['message']['content'].strip()

    if target_lang == 'english':
        final_summary = raw_draft
    else:
        # Translate each section cleanly into target language
        translator = MyMemoryTranslator(source='en-US', target=lang_code, email='educarnival.orbis@gmail.com')
        lines = raw_draft.split('\n')
        out_lines = [header_overview]
        seen_headers = {header_overview}

        for line in lines:
            s = line.strip()
            if not s:
                continue

            low = s.lower()
            if 'concept' in low and ('#' in s or '**' in s or ':' in s):
                if header_concepts not in seen_headers:
                    out_lines.append('')
                    out_lines.append(header_concepts)
                    seen_headers.add(header_concepts)
                continue
            elif ('exam' in low or 'takeaway' in low or 'revision' in low) and ('#' in s or '**' in s or ':' in s):
                if header_exam not in seen_headers:
                    out_lines.append('')
                    out_lines.append(header_exam)
                    seen_headers.add(header_exam)
                continue
            elif 'overview' in low and ('#' in s or '**' in s or ':' in s):
                continue

            is_bullet = s.startswith('- ') or s.startswith('* ') or bool(re.match(r'^\d+[\.\)]\s*', s)) or s.startswith('####')
            clean_line = re.sub(r'^(####|[-*\d\.\)])+\s*', '', s).strip()

            if not clean_line or len(clean_line) < 3:
                continue

            # Translate text safely with timeout and retry
            try:
                translated = _safe_translate(clean_line, lang_code)
                if not translated:
                    continue
                translated = re.sub(r'</?[a-zA-Z][^>]*>', '', translated).strip()
                translated = re.sub(r'^(व्याख्या|ವಿವರಣೆ|Explanation)\s*:\s*\**', '', translated, flags=re.IGNORECASE).strip()
                if is_bullet:
                    if not translated.startswith('- '):
                        out_lines.append(f"- {translated}")
                    else:
                        out_lines.append(translated)
                else:
                    out_lines.append(translated)
            except Exception as ex:
                logger.warning(f"Translation failed for line: {ex}")

        # Drop any dangling truncated fragment at the very end
        while out_lines and len(out_lines[-1].strip()) < 15 and not out_lines[-1].strip().endswith(('.', '।', '!', '?')):
            out_lines.pop()

        final_summary = '\n'.join(out_lines)

    # Save to disk cache
    try:
        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump({'summary': final_summary, 'language': target_lang}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"Failed to write summary cache: {e}")

    return final_summary, target_lang


class SummarizeVideoView(APIView):
    """Generate an AI summary of a chapter's video/content in its native language."""

    def post(self, request, *args, **kwargs):
        chapter_id = request.data.get('chapter_id')
        if not chapter_id:
            return Response(
                {'error': 'chapter_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            summary_text, lang = generate_educational_summary(int(chapter_id))

            # Optionally track that summary was generated
            _track_progress(request, chapter_id, 'summary_generated')

            return Response({
                'summary': summary_text,
                'language': lang,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Summarize error: {e}")
            return Response(
                {'error': 'Failed to generate summary. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ChatbotView(APIView):
    """Chapter-grounded AI chatbot for text-based doubt clearing in respective languages."""

    def post(self, request, *args, **kwargs):
        chapter_id = request.data.get('chapter_id')
        message = request.data.get('message')
        student_id = request.data.get('student_id')
        session_id = request.data.get('session_id')

        if not chapter_id or not message:
            return Response(
                {'error': 'chapter_id and message are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        lang = get_chapter_language(int(chapter_id))
        context = get_chapter_context(int(chapter_id))
        system_prompt = get_system_tutor_prompt(lang, context)

        # Load chat history for this session if available
        chat_history = self._get_chat_history(session_id)

        # Translate user prompt to the respective language if student asked in English
        translated_query = None
        has_latin = any('a' <= c.lower() <= 'z' for c in message)
        if lang in ['kannada', 'hindi'] and has_latin:
            translated_query = translate_query_to_language(message, lang)

        if translated_query and translated_query != message:
            if lang == 'kannada':
                augmented_message = (
                    f"ವಿದ್ಯಾರ್ಥಿಯ ಪ್ರಶ್ನೆ (ಕನ್ನಡಕ್ಕೆ ಅನುವಾದಿಸಲಾಗಿದೆ): {translated_query}\n"
                    f"[ಮೂಲ ಇಂಗ್ಲಿಷ್ ಪ್ರಶ್ನೆ: {message}]\n"
                    f"[ದಯವಿಟ್ಟು ಕಡ್ಡಾಯವಾಗಿ ಕನ್ನಡ ಲಿಪಿಯಲ್ಲಿಯೇ ಸರಳವಾಗಿ ಮತ್ತು ಸ್ಪಷ್ಟವಾಗಿ ಉತ್ತರಿಸಿ]"
                )
            else:
                augmented_message = (
                    f"विद्यार्थी का प्रश्न (हिन्दी में अनूदित): {translated_query}\n"
                    f"[मूल अंग्रेज़ी प्रश्न: {message}]\n"
                    f"[कृपया अनिवार्य रूप से केवल शुद्ध हिन्दी (देवनागरी लिपि) में ही उत्तर दें]"
                )
        else:
            augmented_message = message
            if lang == 'kannada' and not any('\u0C80' <= c <= '\u0CFF' for c in message):
                augmented_message = f"{message}\n[ಸೂಚನೆ: ದಯವಿಟ್ಟು ಕನ್ನಡ ಲಿಪಿಯಲ್ಲಿಯೇ ಉತ್ತರಿಸಿ]"
            elif lang == 'hindi' and not any('\u0900' <= c <= '\u097F' for c in message):
                augmented_message = f"{message}\n[निर्देश: कृपया केवल शुद्ध हिन्दी (देवनागरी लिपि) में ही उत्तर दें]"

        # Build messages for chat completion
        messages = [{"role": "system", "content": system_prompt}]
        if chat_history:
            messages.extend(chat_history)
        messages.append({"role": "user", "content": augmented_message})

        try:
            output = LLMService.chat(
                messages=messages,
                max_tokens=400,
                temperature=0.7,
                repeat_penalty=1.15,
            )
            response_text = output['choices'][0]['message']['content'].strip()

            # Persist the conversation (store original clean message to database)
            saved_session_id = self._save_messages(
                student_id, chapter_id, session_id, message, response_text
            )

            return Response({
                'response': response_text,
                'session_id': saved_session_id,
                'language': lang,
                'translated_message': translated_query if (translated_query and translated_query != message) else None,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Chatbot error: {e}")
            return Response(
                {'error': 'Failed to generate response. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _get_chat_history(self, session_id):
        """Load previous messages for a chat session."""
        if not session_id:
            return []
        try:
            from api.models import ChatMessage
            messages = ChatMessage.objects.filter(
                session_id=session_id
            ).order_by('timestamp')
            # Limit history to last 10 messages to fit in context window
            messages = messages[max(0, messages.count() - 10):]
            return [
                {'role': msg.role, 'content': msg.content}
                for msg in messages
            ]
        except Exception as e:
            logger.warning(f"Could not load chat history: {e}")
            return []

    def _save_messages(self, student_id, chapter_id, session_id, user_msg, bot_msg):
        """Persist chat messages to the database."""
        try:
            from api.models import ChatSession, ChatMessage

            if session_id:
                try:
                    session = ChatSession.objects.get(id=session_id)
                except ChatSession.DoesNotExist:
                    session = None
            else:
                session = None

            if session is None:
                session = ChatSession.objects.create(
                    student_id=student_id if student_id else None,
                    chapter_id=chapter_id,
                )

            ChatMessage.objects.create(
                session=session, role='user', content=user_msg
            )
            ChatMessage.objects.create(
                session=session, role='assistant', content=bot_msg
            )

            return session.id
        except Exception as e:
            logger.warning(f"Could not save chat messages: {e}")
            return session_id


class VoiceAssistantView(APIView):
    """
    Voice-based doubt clearing.
    
    Chain: Student Speech → Whisper (STT) → Qwen2.5 → Piper (TTS) → Spoken Response
    
    Tarun owns Whisper/Piper implementation.
    Mihir owns the LLM integration and context grounding.
    """

    def post(self, request, *args, **kwargs):
        chapter_id = request.data.get('chapter_id')
        audio_file = request.FILES.get('audio')

        if not chapter_id or not audio_file:
            return Response(
                {'error': 'chapter_id and audio file are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. Save uploaded audio temporarily
        audio_path = os.path.join(settings.BASE_DIR, 'temp_audio.webm')
        with open(audio_path, 'wb+') as f:
            for chunk in audio_file.chunks():
                f.write(chunk)

        try:
            # 2. STT (Whisper — Tarun's module)
            stt = STTService.get_instance()
            segments, info = stt.transcribe(audio_path, beam_size=5)
            user_text = "".join([segment.text for segment in segments]).strip()
            logger.info(f"Transcribed voice: {user_text}")

            if not user_text:
                return Response(
                    {'error': 'Could not understand the audio. Please try again.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # 3. LLM (Qwen2.5 — grounded in chapter context and language)
            lang = get_chapter_language(int(chapter_id))
            context = get_chapter_context(int(chapter_id))
            system_prompt = get_voice_tutor_prompt(lang, context)
            prompt = build_chat_prompt(system_prompt, user_text)

            output = LLMService.generate(
                prompt, max_tokens=200,
                stop=["<|im_end|>"],
                echo=False,
            )
            ai_text = output['choices'][0]['text'].strip()

            # 4. TTS (Piper — Tarun's module)
            output_audio_path = os.path.join(
                settings.BASE_DIR, 'api', 'static', 'response.wav'
            )
            os.makedirs(os.path.dirname(output_audio_path), exist_ok=True)

            success = TTSService.generate_audio(ai_text, output_audio_path)

            if not success:
                return Response(
                    {'error': 'Text-to-speech failed'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            return Response({
                'transcribed_text': user_text,
                'text_response': ai_text,
                'audio_url': '/static/response.wav',
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Voice assistant error: {e}")
            return Response(
                {'error': 'Voice processing failed. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        finally:
            if os.path.exists(audio_path):
                os.remove(audio_path)


class FlashcardGenerateView(APIView):
    """Generate AI flashcards from chapter content."""

    def post(self, request, *args, **kwargs):
        chapter_id = request.data.get('chapter_id')
        student_id = request.data.get('student_id')
        count = request.data.get('count', 5)

        if not chapter_id:
            return Response(
                {'error': 'chapter_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        context = get_chapter_context(int(chapter_id))
        messages = build_messages(
            GENERATE_FLASHCARDS.format(chapter_context=context, count=count)
        )

        try:
            flashcard_data = LLMService.generate_json(
                messages, max_tokens=2048, retries=1
            )

            if not flashcard_data or 'flashcards' not in flashcard_data:
                return Response(
                    {'error': 'Failed to parse flashcard data. Retrying may help.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            # Save to database
            flashcard_set_id = self._save_flashcards(
                student_id, chapter_id, flashcard_data['flashcards']
            )

            return Response({
                'flashcard_set_id': flashcard_set_id,
                'flashcards': flashcard_data['flashcards'],
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Flashcard generation error: {e}")
            return Response(
                {'error': 'Failed to generate flashcards. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )



    def _save_flashcards(self, student_id, chapter_id, flashcards):
        """Persist generated flashcards to the database."""
        try:
            from api.models import FlashcardSet, Flashcard

            fset = FlashcardSet.objects.create(
                student_id=student_id if student_id else None,
                chapter_id=chapter_id,
            )

            for i, card in enumerate(flashcards):
                Flashcard.objects.create(
                    flashcard_set=fset,
                    front=card.get('front', ''),
                    back=card.get('back', ''),
                    order=i + 1,
                )

            return fset.id
        except Exception as e:
            logger.warning(f"Could not save flashcards: {e}")
            return None


class QuizGenerateView(APIView):
    """Generate AI quiz questions from chapter content."""

    def post(self, request, *args, **kwargs):
        chapter_id = request.data.get('chapter_id')
        student_id = request.data.get('student_id')
        count = request.data.get('count', 5)

        if not chapter_id:
            return Response(
                {'error': 'chapter_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        context = get_chapter_context(int(chapter_id))
        messages = build_messages(
            GENERATE_QUIZ.format(chapter_context=context, count=count)
        )

        try:
            quiz_data = LLMService.generate_json(
                messages, max_tokens=2048, retries=1
            )

            if not quiz_data or 'questions' not in quiz_data:
                return Response(
                    {'error': 'Failed to parse quiz data. Retrying may help.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            # Save to database
            attempt_id = self._save_quiz(
                student_id, chapter_id, quiz_data['questions']
            )

            return Response({
                'attempt_id': attempt_id,
                'questions': quiz_data['questions'],
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Quiz generation error: {e}")
            return Response(
                {'error': 'Failed to generate quiz. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )



    def _save_quiz(self, student_id, chapter_id, questions):
        """Persist generated quiz to the database."""
        try:
            from api.models import QuizAttempt, QuizQuestion

            attempt = QuizAttempt.objects.create(
                student_id=student_id if student_id else None,
                chapter_id=chapter_id,
                total_questions=len(questions),
            )

            for i, q in enumerate(questions):
                QuizQuestion.objects.create(
                    attempt=attempt,
                    question_text=q.get('question', ''),
                    options=q.get('options', []),
                    correct_answer=q.get('correct_answer', ''),
                    order=i + 1,
                )

            return attempt.id
        except Exception as e:
            logger.warning(f"Could not save quiz: {e}")
            return None


class QuizSubmitView(APIView):
    """Submit quiz answers and get results."""

    def post(self, request, *args, **kwargs):
        attempt_id = request.data.get('attempt_id')
        answers = request.data.get('answers', {})

        if not attempt_id:
            return Response(
                {'error': 'attempt_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from api.models import QuizAttempt, QuizQuestion
            from django.utils import timezone

            attempt = QuizAttempt.objects.get(id=attempt_id)
            questions = QuizQuestion.objects.filter(attempt=attempt).order_by('order')

            score = 0
            results = []

            for q in questions:
                student_answer = answers.get(str(q.id), answers.get(str(q.order), ''))
                q.student_answer = student_answer
                q.save()

                is_correct = student_answer.strip().upper() == q.correct_answer.strip().upper()
                if is_correct:
                    score += 1

                results.append({
                    'question': q.question_text,
                    'options': q.options,
                    'correct_answer': q.correct_answer,
                    'student_answer': student_answer,
                    'is_correct': is_correct,
                })

            attempt.score = score
            attempt.completed_at = timezone.now()
            attempt.save()

            return Response({
                'score': score,
                'total': attempt.total_questions,
                'results': results,
            }, status=status.HTTP_200_OK)

        except QuizAttempt.DoesNotExist:
            return Response(
                {'error': 'Quiz attempt not found'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            logger.error(f"Quiz submit error: {e}")
            return Response(
                {'error': 'Failed to submit quiz. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


def _track_progress(request, chapter_id, field_name):
    """Helper to update learning progress for a student."""
    student_id = request.data.get('student_id')
    if not student_id:
        return

    try:
        from api.models import LearningProgress
        progress, _ = LearningProgress.objects.get_or_create(
            student_id=student_id, chapter_id=chapter_id,
        )
        setattr(progress, field_name, True)
        progress.save()
    except Exception as e:
        logger.warning(f"Could not track progress: {e}")


class QuizAnalyzeView(APIView):
    """Analyze a submitted quiz to generate per-question explanations and identify weak concepts."""

    def post(self, request, *args, **kwargs):
        attempt_id = request.data.get('attempt_id')

        if not attempt_id:
            return Response(
                {'error': 'attempt_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from api.models import QuizAttempt, QuizQuestion, QuestionExplanation, WeakConcept
            attempt = QuizAttempt.objects.get(id=attempt_id)
            chapter_id = attempt.chapter_id
            questions = QuizQuestion.objects.filter(attempt=attempt).order_by('order')

            # Identify incorrect questions
            incorrect_questions = []
            for q in questions:
                # If they skipped it or got it wrong
                if not q.student_answer or q.student_answer.strip().upper() != q.correct_answer.strip().upper():
                    incorrect_questions.append(q)

            if not incorrect_questions:
                return Response({
                    'status': 'all_correct',
                    'explanations': [],
                    'weak_concepts': []
                }, status=status.HTTP_200_OK)

            context = get_chapter_context(chapter_id)
            explanations_data = []

            # 1. Generate Per-Question Explanations
            for q in incorrect_questions:
                # Check if we already generated it (idempotency)
                if hasattr(q, 'explanation'):
                    explanations_data.append({
                        'question_id': q.id,
                        'order': q.order,
                        'explanation': q.explanation.explanation_text
                    })
                    continue

                prompt = build_completion_prompt(
                    EXPLAIN_INCORRECT_QUESTION.format(
                        chapter_context=context,
                        question_text=q.question_text,
                        options=json.dumps(q.options),
                        correct_answer=q.correct_answer,
                        student_answer=q.student_answer or "No Answer"
                    )
                )

                try:
                    output = LLMService.generate(prompt, max_tokens=200, stop=["<|im_end|>"], echo=False)
                    exp_text = output['choices'][0]['text'].strip()
                    QuestionExplanation.objects.create(question=q, explanation_text=exp_text)
                    explanations_data.append({
                        'question_id': q.id,
                        'order': q.order,
                        'explanation': exp_text
                    })
                except Exception as e:
                    logger.error(f"Failed to explain question {q.id}: {e}")

            # 2. Identify Weak Concepts
            # Check if concepts already exist
            existing_concepts = list(WeakConcept.objects.filter(attempt=attempt))
            if existing_concepts:
                weak_concepts_data = [
                    {
                        'concept_name': wc.concept_name,
                        'explanation': wc.explanation,
                        'related_question_ids': list(wc.related_questions.values_list('id', flat=True))
                    } for wc in existing_concepts
                ]
            else:
                # Build input for LLM
                questions_json = json.dumps([
                    {
                        "id": q.id,
                        "question": q.question_text,
                        "student_missed_because": next((e['explanation'] for e in explanations_data if e['question_id'] == q.id), "Answered incorrectly")
                    } for q in incorrect_questions
                ], indent=2)

                messages = build_messages(
                    IDENTIFY_WEAK_CONCEPTS.format(
                        chapter_context=context,
                        questions_json=questions_json
                    )
                )
                
                weak_concepts_data = []
                try:
                    parsed_concepts = LLMService.generate_json(
                        messages, max_tokens=2048, retries=1
                    )
                    
                    if parsed_concepts and 'weak_concepts' in parsed_concepts:
                        for wc_data in parsed_concepts['weak_concepts']:
                            wc = WeakConcept.objects.create(
                                attempt=attempt,
                                concept_name=wc_data.get('concept_name', 'Unknown Concept'),
                                explanation=wc_data.get('explanation', '')
                            )
                            # Link related questions
                            q_ids = wc_data.get('related_question_ids', [])
                            for q_id in q_ids:
                                wc.related_questions.add(q_id)
                            
                            weak_concepts_data.append({
                                'concept_name': wc.concept_name,
                                'explanation': wc.explanation,
                                'related_question_ids': q_ids
                            })
                except Exception as e:
                    logger.error(f"Failed to identify weak concepts: {e}")

            return Response({
                'status': 'analyzed',
                'explanations': explanations_data,
                'weak_concepts': weak_concepts_data
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Quiz analysis error: {e}")
            return Response(
                {'error': 'Failed to analyze quiz.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
