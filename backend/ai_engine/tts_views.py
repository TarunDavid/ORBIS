"""
Lightweight TTS-only endpoint.
Accepts { "text": "..." } and returns raw WAV audio bytes.
Used by the frontend to pre-generate and cache focus alert clips per student.
"""

import os
import uuid
import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.http import HttpResponse
from django.conf import settings

from .services import TTSService

logger = logging.getLogger(__name__)


class TTSGenerateView(APIView):
    """Generate speech audio from text via Piper TTS (offline, on-device)."""

    def post(self, request, *args, **kwargs):
        text = request.data.get('text', '').strip()

        if not text:
            return Response(
                {'error': 'text is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(text) > 500:
            return Response(
                {'error': 'text must be 500 characters or fewer'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Generate to a unique temp file to avoid collisions
        output_dir = os.path.join(settings.MEDIA_ROOT, 'tts')
        os.makedirs(output_dir, exist_ok=True)
        filename = f'focus_alert_{uuid.uuid4().hex[:8]}.wav'
        output_path = os.path.join(output_dir, filename)

        try:
            success = TTSService.generate_audio(text, output_path, language='english')

            if not success:
                return Response(
                    {'error': 'TTS generation failed'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            # Read the WAV file and return as binary response
            with open(output_path, 'rb') as f:
                audio_bytes = f.read()

            response = HttpResponse(audio_bytes, content_type='audio/wav')
            response['Content-Disposition'] = f'inline; filename="{filename}"'
            response['Content-Length'] = len(audio_bytes)
            return response

        except FileNotFoundError as e:
            logger.error(f"TTS model not found: {e}")
            return Response(
                {'error': 'TTS model not available. Run download_models.py first.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except Exception as e:
            logger.error(f"TTS generation error: {e}")
            return Response(
                {'error': 'Failed to generate audio. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        finally:
            # Clean up temp file
            if os.path.exists(output_path):
                try:
                    os.remove(output_path)
                except OSError:
                    pass
