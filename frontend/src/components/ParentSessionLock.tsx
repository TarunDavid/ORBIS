/**
 * ParentSessionLock — OTP-protected Focus Session Lock
 * =====================================================
 * Provides a tamper-resistant study session that parents can start with
 * a time limit. The student cannot exit without the parent's 4-digit OTP
 * or waiting for the timer to expire.
 *
 * Security model:
 * - OTP is hashed with SHA-256 (Web Crypto API) before storage.
 * - Plain OTP is shown once, then discarded from memory.
 * - The lock is a full-viewport CSS overlay (z-9999), NOT fullscreen.
 *   Fullscreen is used as visual framing only.
 * - Browser Escape key exits fullscreen (browser guarantee we can't override),
 *   but the CSS overlay appears synchronously to block the page.
 * - OTP expires and is deleted after every session (OTP or timer unlock).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, Unlock, Clock, Shield, AlertTriangle, Timer, Maximize, CheckCircle, Sparkles } from 'lucide-react';
import { useSessionTimer } from '../hooks/useSessionTimer';
import { focusAlarm } from '../lib/focusAlarm';

// ---------------------------------------------------------------------------
// Audio Chime helper (Web Audio API - offline)
// ---------------------------------------------------------------------------

function playVictoryChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
      gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + idx * 0.12 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.12);
      osc.stop(ctx.currentTime + idx * 0.12 + 0.55);
    });
  } catch (e) {
    console.warn('[ParentSessionLock] Victory chime failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

async function hashOtp(otp: string): Promise<string> {
  try {
    const encoded = new TextEncoder().encode(otp);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback for non-HTTPS / non-localhost (crypto.subtle unavailable)
    console.warn('[ParentSessionLock] crypto.subtle unavailable — using plaintext fallback');
    return `plain:${otp}`;
  }
}

// generateOtp removed as parent sets their own pin

// ---------------------------------------------------------------------------
// localStorage helpers (graceful fallback)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'orbis_focus_lock';

interface LockRecord {
  hashedOtp: string;
  expiresAt: number; // Unix ms
}

function saveLockRecord(record: LockRecord): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    console.warn('[ParentSessionLock] localStorage unavailable — lock state will not persist across reloads');
    return false;
  }
}

function loadLockRecord(): LockRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LockRecord;
  } catch {
    return null;
  }
}

function clearLockRecord(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ParentSessionLockProps {
  /** Ref to the DOM element to request fullscreen on */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Called when the session ends (OTP unlock or timer expiry) */
  onSessionEnd: () => void;
  /** Called when the lock phase changes (e.g. entering or leaving the locked state) */
  onLockStateChange?: (isLocked: boolean) => void;
  /** Called to speak an audio alert when student exits fullscreen */
  onFullscreenExitAlert?: () => void;
  /** Called to pause the lesson video when fullscreen is exited */
  onPauseVideo?: () => void;
  /** Called to resume the lesson video when fullscreen is restored */
  onResumeVideo?: () => void;
  /** Name of current student to speak in voice alerts */
  studentName?: string;
}

type Phase = 'setup' | 'show-otp' | 'locked' | 'completed';

const DURATION_OPTIONS = [
  { label: '30 min', ms: 30 * 60 * 1000 },
  { label: '1 hour', ms: 60 * 60 * 1000 },
];

const ParentSessionLock = ({ containerRef, onSessionEnd, onLockStateChange, onFullscreenExitAlert, onPauseVideo, onResumeVideo, studentName }: ParentSessionLockProps) => {
  const [phase, setPhase] = useState<Phase>('setup');
  const [selectedDuration, setSelectedDuration] = useState<number>(DURATION_OPTIONS[0].ms);
  const [customMinutes, setCustomMinutes] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [parentPin, setParentPin] = useState('');
  const [setupError, setSetupError] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [showLockOverlay, setShowLockOverlay] = useState(false);
  const [durationMs, setDurationMs] = useState(DURATION_OPTIONS[0].ms);

  // In-memory fallback for the hashed OTP if localStorage fails
  const hashedOtpRef = useRef<string | null>(null);
  const expiresAtRef = useRef<number>(0);

  // Session timer
  const timer = useSessionTimer({
    onExpire: () => {
      handleAutoUnlock();
    },
  });

  // -----------------------------------------------------------------------
  // Fullscreen helpers
  // -----------------------------------------------------------------------

  const requestFullscreen = useCallback(async () => {
    try {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement
      );
      if (!isFs) {
        const el = document.documentElement || containerRef.current;
        if (el?.requestFullscreen) {
          await el.requestFullscreen();
        } else if ((el as any)?.webkitRequestFullscreen) {
          await (el as any).webkitRequestFullscreen();
        } else if ((el as any)?.msRequestFullscreen) {
          await (el as any).msRequestFullscreen();
        }
      }

      // Keyboard Lock API (Chromium / Edge): Lock the Escape key so single-tap does NOT exit fullscreen
      if ('keyboard' in navigator && (navigator as any).keyboard?.lock) {
        try {
          await (navigator as any).keyboard.lock(['Escape']);
        } catch {
          // Keyboard Lock may be restricted by permissions or browser policy
        }
      }
    } catch (err) {
      console.warn('[ParentSessionLock] Fullscreen request rejected or unavailable:', err);
    }
  }, [containerRef]);

  const exitFullscreen = useCallback(async () => {
    try {
      if ('keyboard' in navigator && (navigator as any).keyboard?.unlock) {
        try {
          (navigator as any).keyboard.unlock();
        } catch {
          // noop
        }
      }
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement
      );
      if (isFs) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch {
      // noop
    }
  }, []);

  // -----------------------------------------------------------------------
  // Fullscreen & Tab-switch detection
  // -----------------------------------------------------------------------

  // Track how many times student switched away
  const switchCountRef = useRef(0);
  const [resumeCooldown, setResumeCooldown] = useState(0);

  useEffect(() => {
    if (phase !== 'locked') return;

    const handleFullscreenChange = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement
      );
      if (phase === 'locked' && !isFs) {
        // Fullscreen was exited (e.g. ESC key) - show lock overlay immediately
        setShowLockOverlay(true);
        // Pause the lesson video immediately
        onPauseVideo?.();
        // Start continuous alarm chime and continuous voice reminder until back in fullscreen
        const displayName = studentName || focusAlarm.getStudentName();
        focusAlarm.start(`Hey ${displayName}, please return to full screen!`, 520, 392);
      } else if (phase === 'locked' && isFs) {
        focusAlarm.stop();
        setShowLockOverlay(false);
        onResumeVideo?.();
      }
    };

    const handleVisibilityChange = () => {
      const displayName = studentName || focusAlarm.getStudentName();
      if (document.hidden && phase === 'locked') {
        // Student switched away from this tab
        switchCountRef.current += 1;
        onPauseVideo?.();
        focusAlarm.start(`Hey ${displayName}, please return to full screen!`, 520, 392);
      }
      if (!document.hidden && phase === 'locked') {
        // Student came back — show overlay with cooldown
        setShowLockOverlay(true);
        const cooldown = Math.min(switchCountRef.current * 3, 15); // 3s, 6s, 9s... max 15s
        setResumeCooldown(cooldown);
        focusAlarm.start(`Hey ${displayName}, please return to full screen!`, 520, 392);
      }
    };

    // Intercept Escape key events in capture phase
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase === 'locked') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Warn on tab close / navigation away
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      return '';
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      focusAlarm.stop();
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [phase, onPauseVideo, onFullscreenExitAlert]);

  // Resume cooldown countdown
  useEffect(() => {
    if (resumeCooldown <= 0) return;
    const interval = window.setInterval(() => {
      setResumeCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [resumeCooldown]);

  // -----------------------------------------------------------------------
  // Check for existing lock record on mount (page reload recovery)
  // -----------------------------------------------------------------------

  useEffect(() => {
    const existing = loadLockRecord();
    if (existing && existing.expiresAt > Date.now()) {
      hashedOtpRef.current = existing.hashedOtp;
      expiresAtRef.current = existing.expiresAt;
      setPhase('locked');
      setShowLockOverlay(true); // Show overlay since we just reloaded
      onLockStateChange?.(true);
      timer.resumeFrom(existing.expiresAt);
    } else if (existing) {
      // Expired — clean up stale record
      clearLockRecord();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  // Start session
  // -----------------------------------------------------------------------

  const handleStartSetup = async () => {
    if (!/^\d{4}$/.test(parentPin)) {
      setSetupError('Please enter a 4-digit PIN');
      return;
    }
    setSetupError('');

    const hashed = await hashOtp(parentPin);

    let duration = selectedDuration;
    if (isCustom && customMinutes) {
      const mins = parseInt(customMinutes, 10);
      if (mins > 0 && mins <= 180) {
        duration = mins * 60 * 1000;
      }
    }

    hashedOtpRef.current = hashed;
    setDurationMs(duration);

    const expiresAt = Date.now() + duration;
    expiresAtRef.current = expiresAt;
    saveLockRecord({ hashedOtp: hashed, expiresAt });

    setPhase('locked');
    onLockStateChange?.(true);
    setShowLockOverlay(false);

    // Enter fullscreen immediately on button click (direct user gesture)
    requestFullscreen();

    // Start countdown from now
    timer.resumeFrom(expiresAt);
  };

  // -----------------------------------------------------------------------
  // Unlock
  // -----------------------------------------------------------------------

  const handleOtpSubmit = async () => {
    if (!otpInput.trim()) {
      setOtpError('Enter the 4-digit code');
      return;
    }

    const enteredHash = await hashOtp(otpInput.trim());
    const storedHash = hashedOtpRef.current || loadLockRecord()?.hashedOtp;

    if (enteredHash === storedHash) {
      performUnlock();
    } else {
      setOtpError('Incorrect code. Try again.');
      setOtpInput('');
    }
  };

  const handleAutoUnlock = () => {
    focusAlarm.stop();
    playVictoryChime();
    clearLockRecord();
    hashedOtpRef.current = null;
    timer.stop();
    setShowLockOverlay(false);
    setPhase('completed');
  };

  const performUnlock = () => {
    focusAlarm.stop();
    exitFullscreen();
    timer.stop();
    clearLockRecord();
    hashedOtpRef.current = null;
    setPhase('setup');
    onLockStateChange?.(false);
    setShowLockOverlay(false);
    setOtpInput('');
    setOtpError('');
    setParentPin('');
    onSessionEnd();
  };

  // -----------------------------------------------------------------------
  // Render: Setup Phase
  // -----------------------------------------------------------------------

  if (phase === 'setup') {
    return (
      <div className="fixed inset-0 z-[9998] bg-[#121316]/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="clay-card bg-white p-6 md:p-8 space-y-6 max-w-md w-full">
          <div className="flex items-center gap-3">
          <div className="clay-circle bg-cobalt text-white p-2.5">
            <Shield size={22} />
          </div>
          <div>
            <h3 className="font-syne font-extrabold text-xl text-[#121316]">Focus Session</h3>
            <p className="font-grotesk text-xs text-stone-500 uppercase tracking-wider">Parent-controlled study lock</p>
          </div>
        </div>

        <p className="font-jakarta text-sm text-stone-600 leading-relaxed">
          Set a study duration and a 4-digit PIN for your child's session. Only you can use this PIN to exit the session early. The session will auto-unlock when the timer expires.
        </p>

        {/* Duration Selector */}
        <div className="space-y-3">
          <p className="font-grotesk font-bold text-xs uppercase tracking-wider text-stone-500">Session Duration</p>
          <div className="flex flex-wrap gap-2">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.ms}
                onClick={() => { setSelectedDuration(opt.ms); setIsCustom(false); }}
                className={`clay-btn px-5 py-2.5 text-sm font-grotesk transition-all ${
                  !isCustom && selectedDuration === opt.ms
                    ? 'bg-cobalt text-white'
                    : 'bg-canvas text-[#121316] hover:bg-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={() => { setIsCustom(true); }}
              className={`clay-btn px-5 py-2.5 text-sm font-grotesk transition-all ${
                isCustom
                  ? 'bg-cobalt text-white'
                  : 'bg-canvas text-[#121316] hover:bg-white'
              }`}
            >
              Custom
            </button>
          </div>

          {isCustom && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                min="1"
                max="180"
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                placeholder="Minutes"
                className="clay-card-sm bg-canvas px-4 py-2.5 w-28 font-grotesk text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-cobalt"
              />
              <span className="font-grotesk text-sm text-stone-500 font-semibold">minutes</span>
            </div>
          )}
        </div>

        {/* PIN Input */}
        <div className="space-y-3">
          <p className="font-grotesk font-bold text-xs uppercase tracking-wider text-stone-500">Set Parent PIN</p>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={parentPin}
            onChange={(e) => {
              setParentPin(e.target.value.replace(/\D/g, ''));
              setSetupError('');
            }}
            placeholder="Enter 4-digit PIN"
            className="clay-card-sm bg-canvas w-full px-4 py-3 font-grotesk font-bold text-xl text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-cobalt placeholder:text-stone-400 placeholder:tracking-normal placeholder:text-sm"
          />
          {setupError && (
            <p className="font-grotesk text-xs text-coral font-bold uppercase tracking-wider text-center animate-pulse">
              {setupError}
            </p>
          )}
        </div>

        <button
          onClick={handleStartSetup}
          className="clay-btn w-full bg-gold text-[#121316] py-3.5 font-grotesk font-bold text-sm flex items-center justify-center gap-2"
        >
          <Lock size={18} />
          <span>Lock Session</span>
        </button>
        </div>
      </div>
    );
  }



  // -----------------------------------------------------------------------
  // Render: Completed Phase (celebration screen)
  // -----------------------------------------------------------------------

  if (phase === 'completed') {
    const minutesCompleted = Math.max(1, Math.round(durationMs / 60000));
    return (
      <div className="fixed inset-0 z-[9998] bg-[#121316]/75 backdrop-blur-md flex items-center justify-center p-4">
        <div className="clay-card bg-white p-8 max-w-md w-full text-center space-y-6 animate-fade-in relative overflow-hidden shadow-2xl">
          {/* Confetti icon */}
          <div className="text-5xl animate-bounce mb-1">🎉</div>
          
          <div className="space-y-2">
            <span className="clay-chip bg-gold text-[#121316] px-3.5 py-1 text-xs uppercase font-extrabold tracking-wider">
              SESSION COMPLETED
            </span>
            <h2 className="font-syne font-extrabold text-3xl text-[#121316]">
              Awesome Job! 🌟
            </h2>
            <p className="font-jakarta text-sm text-stone-600">
              You stayed focused and completed your entire study goal!
            </p>
          </div>

          {/* Achievement stats badges */}
          <div className="grid grid-cols-2 gap-3">
            <div className="clay-card-sm bg-canvas p-4 text-center">
              <div className="text-cobalt font-syne font-extrabold text-3xl">
                {minutesCompleted}m
              </div>
              <p className="font-grotesk text-xs text-stone-500 uppercase font-semibold mt-0.5">
                Focus Time
              </p>
            </div>
            <div className="clay-card-sm bg-gold/20 p-4 text-center border border-gold/40">
              <div className="text-[#121316] font-syne font-extrabold text-3xl flex items-center justify-center gap-1">
                <Sparkles size={22} className="text-gold" />
                <span>+50</span>
              </div>
              <p className="font-grotesk text-xs text-stone-600 uppercase font-semibold mt-0.5">
                Focus XP
              </p>
            </div>
          </div>

          {/* Action button */}
          <button
            onClick={() => {
              performUnlock();
            }}
            className="clay-btn w-full bg-cobalt text-white py-3.5 font-grotesk font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-700"
          >
            <CheckCircle size={18} className="text-mint" />
            <span>Continue Learning</span>
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Locked Phase — Timer badge (inline, shown on the page)
  // -----------------------------------------------------------------------

  return (
    <>
      {/* Timer Badge */}
      <div className="clay-chip bg-coral text-white px-4 py-1.5 flex items-center gap-2 shadow-sm">
        <Timer size={14} className="animate-pulse" />
        <span className="font-grotesk font-bold text-sm tabular-nums">{timer.display}</span>
        <span className="font-grotesk text-[10px] uppercase tracking-wider opacity-80">LOCKED</span>
      </div>

      {/* Lock Overlay — Shows when student switches tabs */}
      {showLockOverlay && (
        <div
          className="fixed inset-0 z-[9999] bg-[#121316]/95 backdrop-blur-md flex flex-col items-center justify-center p-6"
          style={{ touchAction: 'none' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="clay-card bg-white p-8 max-w-sm w-full space-y-6 text-center">
            {/* Header */}
            <div className="flex flex-col items-center gap-3">
              <div className="clay-circle bg-coral text-white p-3">
                <AlertTriangle size={28} />
              </div>
              <h2 className="font-syne font-extrabold text-2xl text-[#121316]">
                Focus Session Paused
              </h2>
              <p className="font-jakarta text-sm text-stone-600">
                You exited fullscreen or switched tabs. Return to fullscreen to continue studying!
              </p>
            </div>

            {/* Timer */}
            <div className="clay-card-sm bg-canvas p-3 flex items-center justify-center gap-2">
              <Clock size={18} className="text-cobalt" />
              <span className="font-syne font-extrabold text-2xl text-[#121316] tabular-nums">
                {timer.display}
              </span>
              <span className="font-grotesk text-xs text-stone-500 uppercase tracking-wider">remaining</span>
            </div>

            {/* Resume / Return to Fullscreen button with cooldown */}
            <button
              onClick={() => {
                if (resumeCooldown <= 0) {
                  focusAlarm.stop();
                  setShowLockOverlay(false);
                  requestFullscreen();
                  onResumeVideo?.();
                }
              }}
              disabled={resumeCooldown > 0}
              className={`clay-btn w-full py-3 font-grotesk font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                resumeCooldown > 0
                  ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                  : 'bg-mint text-[#121316] hover:bg-mint/80'
              }`}
            >
              {resumeCooldown > 0 ? (
                <span>Wait {resumeCooldown}s to resume...</span>
              ) : (
                <>
                  <Maximize size={16} />
                  <span>Return to Fullscreen & Resume</span>
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-stone-200" />
              <span className="font-grotesk text-[10px] text-stone-400 uppercase tracking-widest">Parent only</span>
              <div className="flex-1 h-px bg-stone-200" />
            </div>

            {/* OTP Input for parent early exit */}
            <div className="space-y-3">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={otpInput}
                onChange={(e) => {
                  setOtpInput(e.target.value.replace(/\D/g, ''));
                  setOtpError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleOtpSubmit();
                }}
                placeholder="Enter 4-digit parent code"
                className="clay-card-sm bg-canvas w-full px-4 py-3 font-grotesk font-bold text-xl text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-cobalt placeholder:text-stone-400 placeholder:tracking-normal placeholder:text-sm"
              />

              {otpError && (
                <p className="font-grotesk text-xs text-coral font-bold uppercase tracking-wider animate-pulse">
                  {otpError}
                </p>
              )}

              <button
                onClick={handleOtpSubmit}
                className="clay-btn w-full bg-cobalt text-white py-3 font-grotesk font-bold text-sm flex items-center justify-center gap-2"
              >
                <Unlock size={16} />
                <span>End Session Early</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};

export default ParentSessionLock;
