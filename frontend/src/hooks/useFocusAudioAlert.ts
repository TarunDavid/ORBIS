/**
 * useFocusAudioAlert — Personalized TTS focus alert hook
 * =======================================================
 * Generates a spoken "Hey {name}, please focus!" clip via the backend
 * Piper TTS endpoint, caches it in IndexedDB, and plays it from cache
 * on subsequent distraction events. The clip is generated only once
 * per student and never needs network access again.
 */

import { useRef, useState, useCallback } from 'react';
import { focusAudioDb } from '../lib/focusAudioDb';

const API_BASE = `http://${window.location.hostname || 'localhost'}:8000/api`;

export function useFocusAudioAlert(
  studentId: number | null,
  studentName: string,
) {
  const [isGenerating, setIsGenerating] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const fsBlobUrlRef = useRef<string | null>(null);
  const dbInitializedRef = useRef(false);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const speakFallback = (text: string) => {
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 0.95;
        // Select an English voice if available
        const voices = window.speechSynthesis.getVoices();
        const enVoice = voices.find(v => v.lang.startsWith('en'));
        if (enVoice) utterance.voice = enVoice;
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.warn('[FocusAudioAlert] Speech synthesis fallback failed:', e);
    }
  };

  const playAudioObj = async (url: string): Promise<boolean> => {
    try {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      const audio = new Audio(url);
      audio.volume = 0.95;
      activeAudioRef.current = audio;
      
      audio.addEventListener('ended', () => {
         activeAudioRef.current = null;
      });

      await audio.play();
      return true;
    } catch (e) {
      console.warn('[FocusAudioAlert] Audio playback failed:', e);
      activeAudioRef.current = null;
      return false;
    }
  };

  const playAlert = useCallback(async () => {
    // Prevent overlapping playback
    if (activeAudioRef.current && !activeAudioRef.current.ended) {
      return;
    }

    const displayName = studentName || 'Student';
    const text = `Hey ${displayName}, please focus!`;

    // Can't cache without a student identity — fallback to browser speech synthesis
    if (!studentId) {
      speakFallback(text);
      return;
    }

    // --- Fast path: play from cached Blob URL in memory ---
    if (blobUrlRef.current) {
      const ok = await playAudioObj(blobUrlRef.current);
      if (ok) return;
    }

    // --- Initialize IndexedDB if needed ---
    if (!dbInitializedRef.current) {
      await focusAudioDb.open();
      dbInitializedRef.current = true;
    }

    // --- Check IndexedDB cache ---
    const cachedBlob = await focusAudioDb.getClip(studentId);
    if (cachedBlob) {
      const url = URL.createObjectURL(cachedBlob);
      blobUrlRef.current = url;
      const ok = await playAudioObj(url);
      if (ok) return;
    }

    // --- Generate via backend TTS (first-time only) ---
    setIsGenerating(true);
    try {
      const res = await fetch(`${API_BASE}/ai/tts/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        console.warn('[FocusAudioAlert] TTS request failed:', res.status);
        speakFallback(text);
        return;
      }

      const blob = await res.blob();

      // Cache in IndexedDB for future offline use
      await focusAudioDb.saveClip(studentId, blob);

      // Cache Blob URL in memory for this session
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      // Play immediately
      await playAudioObj(url);
    } catch (e) {
      console.warn('[FocusAudioAlert] Generation failed, using speech synthesis:', e);
      speakFallback(text);
    } finally {
      setIsGenerating(false);
    }
  }, [studentId, studentName]);

  const playFullscreenAlert = useCallback(async () => {
    // Prevent overlapping playback
    if (activeAudioRef.current && !activeAudioRef.current.ended) {
      return;
    }

    const displayName = studentName || 'Student';
    const text = `Hey ${displayName}, please return to full screen!`;

    // --- Fast path: play from memory cache ---
    if (fsBlobUrlRef.current) {
      const ok = await playAudioObj(fsBlobUrlRef.current);
      if (ok) return;
    }

    // If no student identity, speak immediately
    if (!studentId) {
      speakFallback(text);
      return;
    }

    // Try backend TTS with Piper voice, fallback to speech synthesis
    try {
      const res = await fetch(`${API_BASE}/ai/tts/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        fsBlobUrlRef.current = url;
        const ok = await playAudioObj(url);
        if (ok) return;
      }
    } catch (e) {
      console.warn('[FocusAudioAlert] Fullscreen alert TTS fetch failed:', e);
    }

    // Instant offline fallback
    speakFallback(text);
  }, [studentId, studentName]);

  const stopAudio = useCallback(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  return { playAlert, playFullscreenAlert, stopAudio, isGenerating };
}

export default useFocusAudioAlert;
