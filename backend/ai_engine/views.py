import os
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from .services import LLMService, STTService, TTSService

# Helper for mocking context extraction
def get_chapter_context(chapter_id):
    # In a real app, this would extract text from the ChapterResource (PDF/Transcript)
    return "This chapter covers the basics of plant life. Plants need water, sunlight, and soil to grow. Photosynthesis is the process by which plants make their own food."

class SummarizeVideoView(APIView):
    def post(self, request, *args, **kwargs):
        chapter_id = request.data.get('chapter_id')
        if not chapter_id:
            return Response({'error': 'chapter_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        context = get_chapter_context(chapter_id)
        prompt = f"Context: {context}\n\nInstruction: Summarize the context concisely in one paragraph.\n\nSummary:"
        
        try:
            llm = LLMService.get_instance()
            output = llm(prompt, max_tokens=150, stop=["\n\n", "User:"], echo=False)
            summary_text = output['choices'][0]['text'].strip()
            
            return Response({'summary': summary_text}, status=status.HTTP_200_OK)
        except Exception as e:
            print("Summarize Error:", e)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ChatbotView(APIView):
    def post(self, request, *args, **kwargs):
        chapter_id = request.data.get('chapter_id')
        message = request.data.get('message')
        if not chapter_id or not message:
            return Response({'error': 'chapter_id and message are required'}, status=status.HTTP_400_BAD_REQUEST)
        
        context = get_chapter_context(chapter_id)
        
        # Simple instruct prompt format
        prompt = f"<|im_start|>system\nYou are a helpful AI tutor for a student. Use the following context to answer the student's question. Context: {context}<|im_end|>\n<|im_start|>user\n{message}<|im_end|>\n<|im_start|>assistant\n"
        
        try:
            llm = LLMService.get_instance()
            output = llm(prompt, max_tokens=200, stop=["<|im_end|>", "<|im_start|>"], echo=False)
            response_text = output['choices'][0]['text'].strip()
            
            return Response({'response': response_text}, status=status.HTTP_200_OK)
        except Exception as e:
            print("Chatbot Error:", e)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class VoiceAssistantView(APIView):
    def post(self, request, *args, **kwargs):
        chapter_id = request.data.get('chapter_id')
        audio_file = request.FILES.get('audio')
        
        if not chapter_id or not audio_file:
            return Response({'error': 'chapter_id and audio file are required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # 1. Save uploaded audio temporarily
        audio_path = os.path.join(settings.BASE_DIR, 'temp_audio.webm')
        with open(audio_path, 'wb+') as f:
            for chunk in audio_file.chunks():
                f.write(chunk)
                
        try:
            # 2. STT (Whisper)
            stt = STTService.get_instance()
            segments, info = stt.transcribe(audio_path, beam_size=5)
            user_text = "".join([segment.text for segment in segments]).strip()
            print("Transcribed Voice:", user_text)
            
            if not user_text:
                 return Response({'error': 'Could not transcribe audio'}, status=status.HTTP_400_BAD_REQUEST)
            
            # 3. LLM (SmolLM)
            context = get_chapter_context(chapter_id)
            prompt = f"<|im_start|>system\nYou are an AI voice tutor. Answer the following question concisely in 1-2 sentences using this context: {context}<|im_end|>\n<|im_start|>user\n{user_text}<|im_end|>\n<|im_start|>assistant\n"
            
            llm = LLMService.get_instance()
            output = llm(prompt, max_tokens=100, stop=["<|im_end|>"], echo=False)
            ai_text = output['choices'][0]['text'].strip()
            
            # 4. TTS (Piper)
            output_audio_path = os.path.join(settings.BASE_DIR, 'api', 'static', 'response.wav')
            # Ensure static dir exists
            os.makedirs(os.path.dirname(output_audio_path), exist_ok=True)
            
            success = TTSService.generate_audio(ai_text, output_audio_path)
            
            if not success:
                return Response({'error': 'TTS failed'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
            return Response({
                'transcribed_text': user_text,
                'text_response': ai_text,
                'audio_url': '/static/response.wav'
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            print("Voice Assistant Error:", e)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            if os.path.exists(audio_path):
                os.remove(audio_path)
