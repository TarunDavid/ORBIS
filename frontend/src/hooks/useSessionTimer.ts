/**
 * useSessionTimer — Countdown timer hook for Focus Sessions
 * ==========================================================
 * Returns remaining time in ms, formatted mm:ss, and an isExpired flag.
 * On expiry, calls the provided onExpire callback once.
 *
 * The timer is ephemeral (React state + setInterval). If the page reloads
 * mid-session, the ParentSessionLock component reconstructs remaining time
 * from the persisted `expiresAt` timestamp — not from this hook.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSessionTimerOptions {
  onExpire?: () => void;
}

interface UseSessionTimerReturn {
  /** Remaining time in milliseconds */
  remainingMs: number;
  /** Formatted as mm:ss */
  display: string;
  /** Whether the timer is actively counting */
  isRunning: boolean;
  /** Whether the timer has reached zero */
  isExpired: boolean;
  /** Start the countdown for the given duration in ms */
  start: (durationMs: number) => void;
  /** Resume from a known end timestamp (for page reload recovery) */
  resumeFrom: (expiresAt: number) => void;
  /** Stop the timer without triggering expiry */
  stop: () => void;
}

function formatTime(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function useSessionTimer(
  options: UseSessionTimerOptions = {},
): UseSessionTimerReturn {
  const { onExpire } = options;

  const [endTime, setEndTime] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // Tick function
  useEffect(() => {
    if (!isRunning || endTime === null) return;

    const tick = () => {
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        setRemainingMs(0);
        setIsRunning(false);
        setIsExpired(true);
        if (!expiredRef.current) {
          expiredRef.current = true;
          onExpireRef.current?.();
        }
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        setRemainingMs(remaining);
      }
    };

    // Immediate tick
    tick();

    intervalRef.current = window.setInterval(tick, 1000);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, endTime]);

  const start = useCallback((durationMs: number) => {
    const end = Date.now() + durationMs;
    expiredRef.current = false;
    setIsExpired(false);
    setEndTime(end);
    setRemainingMs(durationMs);
    setIsRunning(true);
  }, []);

  const resumeFrom = useCallback((expiresAt: number) => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      setRemainingMs(0);
      setIsRunning(false);
      setIsExpired(true);
      if (!expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current?.();
      }
    } else {
      expiredRef.current = false;
      setIsExpired(false);
      setEndTime(expiresAt);
      setRemainingMs(remaining);
      setIsRunning(true);
    }
  }, []);

  const stop = useCallback(() => {
    setIsRunning(false);
    setEndTime(null);
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return {
    remainingMs,
    display: formatTime(remainingMs),
    isRunning,
    isExpired,
    start,
    resumeFrom,
    stop,
  };
}

export default useSessionTimer;
