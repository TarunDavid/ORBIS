/**
 * Focus Alarm Manager
 * ====================
 * Continuous, event-driven audio alarm system using the browser Web Audio API
 * (for alert chimes) and the browser SpeechSynthesis API (for spoken voice reminders).
 * 100% offline and cross-browser compatible.
 *
 * Loops continuously:
 * [Dual-tone Chime] -> [Spoken Voice Reminder] -> [1.2s pause] -> [Repeat]
 * until stop() is called by returning to focus, resuming fullscreen, or parent unlock.
 */

class FocusAlarmManager {
  private isAlarming = false;
  private audioContext: AudioContext | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private cycleTimeoutId: number | null = null;
  private watchdogTimeoutId: number | null = null;
  private currentMessage = '';
  private currentFreq1 = 440;
  private currentFreq2 = 587;
  private onVoiceCallback: (() => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        try {
          window.speechSynthesis.getVoices();
        } catch {
          // ignore
        }
      };
    }
  }

  /**
   * Helper to retrieve current student name from localStorage
   */
  getStudentName(): string {
    try {
      const raw = localStorage.getItem('currentStudent');
      if (raw) {
        const student = JSON.parse(raw);
        if (student?.name && typeof student.name === 'string') {
          return student.name.trim();
        }
      }
    } catch {
      // ignore
    }
    return 'Student';
  }

  /**
   * Resolve appropriate default warning message based on alarm frequency
   */
  resolveDefaultMessage(freq1: number): string {
    const name = this.getStudentName();
    if (freq1 === 520) {
      return `Hey ${name}, please return to full screen!`;
    }
    return `Hey ${name}, please focus on your lesson!`;
  }

  /**
   * Play a dual-tone alert chime using Web Audio API
   */
  private playTone(freq1: number, freq2: number) {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContextClass();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      const ctx = this.audioContext;
      const notes = [freq1, freq2];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const startTime = ctx.currentTime + idx * 0.14;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.24, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.20);
      });
    } catch (e) {
      console.warn('[FocusAlarm] Tone playback failed:', e);
    }
  }

  /**
   * Select the most natural English voice available in the browser
   */
  private getBestVoice(): SpeechSynthesisVoice | null {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    return (
      voices.find(v => v.lang === 'en-US' && !v.name.toLowerCase().includes('google')) ||
      voices.find(v => v.lang.startsWith('en')) ||
      voices[0] ||
      null
    );
  }

  /**
   * Speak the current voice message via SpeechSynthesis with Chrome keep-alive & GC protection
   */
  private speakCurrentMessage(onCompleted: () => void) {
    if (!('speechSynthesis' in window) || !this.currentMessage) {
      this.cycleTimeoutId = window.setTimeout(onCompleted, 2000);
      return;
    }

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      const utterance = new SpeechSynthesisUtterance(this.currentMessage);
      this.currentUtterance = utterance; // Retain reference to prevent V8 GC termination

      utterance.rate = 1.0;
      utterance.pitch = 1.05;
      utterance.volume = 1.0;

      const voice = this.getBestVoice();
      if (voice) utterance.voice = voice;

      let finished = false;
      const finishOnce = () => {
        if (finished) return;
        finished = true;
        if (this.watchdogTimeoutId !== null) {
          clearTimeout(this.watchdogTimeoutId);
          this.watchdogTimeoutId = null;
        }
        this.currentUtterance = null;
        if (this.isAlarming) {
          onCompleted();
        }
      };

      utterance.onend = () => {
        finishOnce();
      };

      utterance.onerror = (e) => {
        console.warn('[FocusAlarm] Utterance error:', e);
        finishOnce();
      };

      // Watchdog timeout in case onend never fires (e.g. background tab throttling)
      const expectedDurationMs = Math.max(2500, this.currentMessage.length * 90);
      this.watchdogTimeoutId = window.setTimeout(() => {
        finishOnce();
      }, expectedDurationMs + 1200);

      window.speechSynthesis.speak(utterance);

      // Keep-alive kick for Chrome
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (e) {
      console.warn('[FocusAlarm] Speech synthesis failed:', e);
      this.cycleTimeoutId = window.setTimeout(onCompleted, 2000);
    }
  }

  /**
   * Executes a single alarm cycle: chime -> speak -> wait 1.2s -> repeat
   */
  private runCycle() {
    if (!this.isAlarming) return;

    // 1. Play dual-tone alert chime
    this.playTone(this.currentFreq1, this.currentFreq2);

    // Call optional callback if provided
    try {
      this.onVoiceCallback?.();
    } catch {
      // ignore
    }

    // 2. Speak warning message
    this.speakCurrentMessage(() => {
      if (!this.isAlarming) return;
      // 3. Short natural pause between continuous repetitions (1.2s)
      this.cycleTimeoutId = window.setTimeout(() => {
        if (this.isAlarming) {
          this.runCycle();
        }
      }, 1200);
    });
  }

  /**
   * Start a continuous alarm and voice message loop.
   * Repeats continuously until stop() is called.
   *
   * @param messageOrCallback The spoken message text or a legacy voice callback.
   * @param freq1 Frequency of first tone note (Hz).
   * @param freq2 Frequency of second tone note (Hz).
   * @param onVoice Optional additional callback triggered on each cycle.
   */
  start(
    messageOrCallback?: string | (() => void),
    freq1 = 440,
    freq2 = 587,
    onVoice?: () => void
  ) {
    let msg = '';
    let cb: (() => void) | null = null;

    if (typeof messageOrCallback === 'string') {
      msg = messageOrCallback;
      cb = onVoice || null;
    } else if (typeof messageOrCallback === 'function') {
      cb = messageOrCallback;
      msg = this.resolveDefaultMessage(freq1);
    } else {
      msg = this.resolveDefaultMessage(freq1);
    }

    // If already alarming with the exact same message, let it keep cycling smoothly
    if (this.isAlarming && this.currentMessage === msg) {
      return;
    }

    // Update current parameters
    this.currentMessage = msg;
    this.currentFreq1 = freq1;
    this.currentFreq2 = freq2;
    this.onVoiceCallback = cb;

    if (this.isAlarming) {
      // Switched message mid-alarm: restart cycle with new message immediately
      this.clearTimeouts();
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
      }
      this.runCycle();
      return;
    }

    this.isAlarming = true;
    this.runCycle();
  }

  /**
   * Stop the continuous alarm and silence all speech immediately.
   */
  stop() {
    this.isAlarming = false;
    this.currentUtterance = null;
    this.onVoiceCallback = null;
    this.clearTimeouts();
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }

  private clearTimeouts() {
    if (this.cycleTimeoutId !== null) {
      clearTimeout(this.cycleTimeoutId);
      this.cycleTimeoutId = null;
    }
    if (this.watchdogTimeoutId !== null) {
      clearTimeout(this.watchdogTimeoutId);
      this.watchdogTimeoutId = null;
    }
  }

  get active(): boolean {
    return this.isAlarming;
  }
}

export const focusAlarm = new FocusAlarmManager();
export default focusAlarm;
