/**
 * Cat sound effects manager
 *
 * Uses Web Audio API to generate simple cat-like sounds
 * Inspired by retro game sound effects
 */

class CatSoundManager {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = false;

  constructor() {
    // Check localStorage for user preference
    if (typeof window !== 'undefined') {
      const pref = localStorage.getItem('cat-sounds-enabled');
      this.enabled = pref === 'true';
    }
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('cat-sounds-enabled', enabled.toString());
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // Meow sound (success/happy)
  playMeow() {
    if (!this.enabled) return;

    const ctx = this.getAudioContext();
    const now = ctx.currentTime;

    // Create oscillator for voice
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Meow sound: starts high, dips, then rises
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);

    // Envelope
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Purr sound (stretching/content)
  playPurr() {
    if (!this.enabled) return;

    const ctx = this.getAudioContext();
    const now = ctx.currentTime;

    // Create noise-like purr with oscillator
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, now);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  // Hiss sound (error/grumpy)
  playHiss() {
    if (!this.enabled) return;

    const ctx = this.getAudioContext();
    const now = ctx.currentTime;

    // White noise for hiss
    const bufferSize = ctx.sampleRate * 0.3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    noise.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2000, now);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    noise.start(now);
  }

  // Chirp sound (excited/playful)
  playChirp() {
    if (!this.enabled) return;

    const ctx = this.getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Quick chirp up
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  // Play sound based on event type
  playForEvent(event: 'success' | 'error' | 'job-start' | 'click') {
    switch (event) {
      case 'success':
        this.playMeow();
        break;
      case 'error':
        this.playHiss();
        break;
      case 'job-start':
        this.playChirp();
        break;
      case 'click':
        this.playPurr();
        break;
    }
  }
}

// Export singleton instance
export const catSounds = new CatSoundManager();
