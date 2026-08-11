"use client";

/**
 * Voice + beeps for the run screen.
 *
 * Both Web Speech and Web Audio are gated behind a user gesture on iOS, so
 * `unlock()` must be called synchronously from the Start button's click
 * handler — not from an effect that runs afterwards.
 */
class Announcer {
  private ctx: AudioContext | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private unlocked = false;

  muted = false;

  get supported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  unlock() {
    if (this.unlocked || typeof window === "undefined") return;
    this.unlocked = true;

    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        this.ctx = new Ctor();
        void this.ctx.resume();
      }
    } catch {
      this.ctx = null;
    }

    if (this.supported) {
      // A silent utterance inside the gesture is what actually grants
      // permission for every later, un-gestured call.
      const primer = new SpeechSynthesisUtterance("");
      primer.volume = 0;
      window.speechSynthesis.speak(primer);
      this.pickVoice();
      window.speechSynthesis.addEventListener?.("voiceschanged", () => this.pickVoice());
    }
  }

  private pickVoice() {
    if (!this.supported) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    this.voice =
      voices.find((v) => /^en[-_]US$/i.test(v.lang) && v.localService) ??
      voices.find((v) => /^en/i.test(v.lang)) ??
      voices[0];
  }

  say(text: string, { interrupt = true }: { interrupt?: boolean } = {}) {
    if (!this.supported || this.muted || !text) return;
    try {
      if (interrupt) window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.voice) utterance.voice = this.voice;
      utterance.rate = 1.05;
      utterance.pitch = 1;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    } catch {
      // A failed announcement must never interrupt the countdown.
    }
  }

  /** Short sine blip. `tick` for 3-2-1, `go` to open a set, `done` to close one. */
  beep(kind: "tick" | "go" | "done" = "tick") {
    if (!this.ctx || this.muted) return;
    try {
      if (this.ctx.state === "suspended") void this.ctx.resume();

      const frequency = kind === "go" ? 880 : kind === "done" ? 620 : 660;
      const duration = kind === "tick" ? 0.09 : 0.22;
      const now = this.ctx.currentTime;

      const oscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.35, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      oscillator.connect(gain).connect(this.ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    } catch {
      // Ignore — audio is a nicety, the visual countdown is the source of truth.
    }
  }

  silence() {
    if (this.supported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Nothing to cancel.
      }
    }
  }
}

export const announcer = new Announcer();
