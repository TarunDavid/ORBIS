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
from .context import get_chapter_context
from .prompts import (
    SYSTEM_TUTOR,
    SYSTEM_VOICE_TUTOR,
    SUMMARIZE_VIDEO,
    GENERATE_FLASHCARDS,
    GENERATE_QUIZ,
    EXPLAIN_INCORRECT_QUESTION,
    IDENTIFY_WEAK_CONCEPTS,
    build_chat_prompt,
    build_completion_prompt,
)

logger = logging.getLogger(__name__)


class SummarizeVideoView(APIView):
    """Generate an AI summary of a chapter's video/content."""

    def post(self, request, *args, **kwargs):
        chapter_id = request.data.get('chapter_id')
        if not chapter_id:
            return Response(
                {'error': 'chapter_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        context = get_chapter_context(int(chapter_id))
        prompt = build_completion_prompt(
            SUMMARIZE_VIDEO.format(chapter_context=context)
        )

        try:
            output = LLMService.generate(prompt, max_tokens=300, stop=["<|im_end|>"], echo=False)
            summary_text = output['choices'][0]['text'].strip()

            # Optionally track that summary was generated
            _track_progress(request, chapter_id, 'summary_generated')

            return Response({'summary': summary_text}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Summarize error: {e}")
            return Response(
                {'error': 'Failed to generate summary. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ChatbotView(APIView):
    """Chapter-grounded AI chatbot for text-based doubt clearing."""

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

        context = get_chapter_context(int(chapter_id))
        system_prompt = SYSTEM_TUTOR.format(chapter_context=context)

        # Load chat history for this session if available
        chat_history = self._get_chat_history(session_id)

        prompt = build_chat_prompt(system_prompt, message, chat_history)

        try:
            output = LLMService.generate(
                prompt, max_tokens=300,
                stop=["<|im_end|>", "<|im_start|>"],
                echo=False,
            )
            response_text = output['choices'][0]['text'].strip()

            # Persist the conversation
            saved_session_id = self._save_messages(
                student_id, chapter_id, session_id, message, response_text
            )

            return Response({
                'response': response_text,
                'session_id': saved_session_id,
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

            # 3. LLM (Qwen2.5 — grounded in chapter context)
            context = get_chapter_context(int(chapter_id))
            system_prompt = SYSTEM_VOICE_TUTOR.format(chapter_context=context)
            prompt = build_chat_prompt(system_prompt, user_text)

            output = LLMService.generate(
                prompt, max_tokens=150,
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
        prompt = build_completion_prompt(
            GENERATE_FLASHCARDS.format(chapter_context=context, count=count)
        )

        try:
            output = LLMService.generate(
                prompt, max_tokens=800,
                stop=["<|im_end|>"],
                echo=False,
            )
            raw_text = output['choices'][0]['text'].strip()

            # Parse JSON response
            flashcard_data = self._parse_json(raw_text)

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

    def _parse_json(self, text):
        """Try to parse JSON from LLM output, handling common issues."""
        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try to find JSON within the text
        try:
            start = text.index('{')
            end = text.rindex('}') + 1
            return json.loads(text[start:end])
        except (ValueError, json.JSONDecodeError):
            pass

        logger.error(f"Could not parse JSON from LLM output: {text[:200]}")
        return None

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
        prompt = build_completion_prompt(
            GENERATE_QUIZ.format(chapter_context=context, count=count)
        )

        try:
            output = LLMService.generate(
                prompt, max_tokens=1000,
                stop=["<|im_end|>"],
                echo=False,
            )
            raw_text = output['choices'][0]['text'].strip()

            quiz_data = self._parse_json(raw_text)

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

    def _parse_json(self, text):
        """Try to parse JSON from LLM output."""
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        try:
            start = text.index('{')
            end = text.rindex('}') + 1
            return json.loads(text[start:end])
        except (ValueError, json.JSONDecodeError):
            pass
        logger.error(f"Could not parse JSON from LLM output: {text[:200]}")
        return None

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

                prompt = build_completion_prompt(
                    IDENTIFY_WEAK_CONCEPTS.format(
                        chapter_context=context,
                        questions_json=questions_json
                    )
                )
                
                weak_concepts_data = []
                try:
                    output = LLMService.generate(prompt, max_tokens=500, stop=["<|im_end|>"], echo=False)
                    raw_text = output['choices'][0]['text'].strip()
                    
                    # Use existing _parse_json method (we can instantiate a dummy object or define it as a helper)
                    # To avoid rewriting, I'll parse it here:
                    parsed_concepts = None
                    try:
                        start = raw_text.find('{')
                        end = raw_text.rfind('}') + 1
                        if start != -1 and end != 0:
                            parsed_concepts = json.loads(raw_text[start:end])
                    except Exception:
                        pass
                    
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
