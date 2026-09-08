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
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [isActive, modelsLoaded]);

  const handleVideoPlay = () => {
    if (!checkIntervalRef.current) {
      lastSeenRef.current = Date.now();
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
            if (timeSinceLastSeen > 10000) {
              onDistracted();
            }
          }
        }
      }, 1000);
    }
  };

  if (!isActive) return null;

  return (
    <div className="absolute top-4 right-4 w-36 h-28 bg-[#121316] rounded-2xl overflow-hidden border-[3px] border-cobalt shadow-[4px_4px_0px_#121316] z-50">
      {cameraError ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-white text-center p-2 bg-coral font-grotesk font-bold uppercase tracking-wider">
          <span>Camera Error</span>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          muted
          onPlay={handleVideoPlay}
          className="w-full h-full object-cover transform -scale-x-100"
        />
      )}
      {!modelsLoaded && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#121316]/80 text-white text-[10px] font-grotesk font-bold tracking-wider uppercase">
          Loading AI...
        </div>
      )}
      <div className="absolute bottom-1 right-1">
        <span className="clay-chip bg-mint text-[#121316] px-1.5 py-0.2 text-[8px] flex items-center gap-1 scale-90">
          <span className="neon-dot w-1.5 h-1.5"></span>
          <span>FOCUS</span>
        </span>
      </div>
    </div>
  );
};

export default AttentionTracker;
