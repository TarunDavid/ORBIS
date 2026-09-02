import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';

interface AttentionTrackerProps {
  isActive: boolean;
  onDistracted: () => void;
  onFocused: () => void;
}

const AttentionTracker: React.FC<AttentionTrackerProps> = ({ isActive, onDistracted, onFocused }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const lastSeenRef = useRef<number>(Date.now());
  const checkIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
      } catch (e) {
        console.error("Failed to load face-api models", e);
      }
    };
    loadModels();
  }, []);

  useEffect(() => {
    if (isActive && modelsLoaded) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then((s) => {
          streamRef.current = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
        })
        .catch((err) => {
          console.error("Camera access denied or failed", err);
          setCameraError(true);
        });
    }

    return () => {
      // Clear the detection interval when camera stops or component unmounts
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      // Stop camera tracks using the ref (avoids race condition)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [isActive, modelsLoaded]);

  const handleVideoPlay = () => {
    if (!checkIntervalRef.current) {
      lastSeenRef.current = Date.now(); // Reset timer when video starts
      checkIntervalRef.current = window.setInterval(async () => {
        if (videoRef.current) {
          const detections = await faceapi.detectAllFaces(
            videoRef.current,
            new faceapi.TinyFaceDetectorOptions()
          );

          if (detections && detections.length > 0) {
            lastSeenRef.current = Date.now();
            onFocused();
          } else {
            const timeSinceLastSeen = Date.now() - lastSeenRef.current;
            if (timeSinceLastSeen > 10000) { // 10 seconds threshold
              onDistracted();
            }
          }
        }
      }, 1000); // Check every second
    }
  };

  if (!isActive) return null;

  return (
    <div className="absolute top-4 right-4 w-32 h-24 bg-black rounded-lg overflow-hidden shadow-lg border-2 border-indigo-500 z-50">
      {cameraError ? (
        <div className="w-full h-full flex items-center justify-center text-xs text-white text-center p-2 bg-red-900">
          Camera Error
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          muted
          onPlay={handleVideoPlay}
          className="w-full h-full object-cover transform -scale-x-100" // Mirrors the video
        />
      )}
      {!modelsLoaded && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white text-xs">
          Loading AI...
        </div>
      )}
    </div>
  );
};

export default AttentionTracker;
