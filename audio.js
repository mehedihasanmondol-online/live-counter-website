/**
 * Web Audio API Sound Synthesizer for Live Counter Assistant
 * Provides tactile clicks, pops, swooshes, match tension pulse, and victory fanfare
 */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.initAudioContext = this.initAudioContext.bind(this);
    
    // Load mute state from localStorage
    const savedMute = localStorage.getItem('live_counter_muted');
    if (savedMute !== null) {
      this.muted = savedMute === 'true';
    }

    // Auto-init on first user gesture to unlock AudioContext on browsers
    const unlock = () => {
      this.initAudioContext();
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
  }

  initAudioContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('live_counter_muted', this.muted);
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  // Crisp increment sound with dynamic pitch reflecting score excitement
  playIncrement(score = 0) {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Pitch dynamically scales slightly with score (base 540Hz up to 880Hz)
      const baseFreq = 540 + Math.min(score * 3, 340);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.08);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch (e) {
      console.warn('Audio error:', e);
    }
  }

  // Soft low whoosh/pop for decrement
  playDecrement() {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.1);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.11);
    } catch (e) {
      console.warn('Audio error:', e);
    }
  }

  // Reset whoosh
  playReset() {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.25);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {
      console.warn('Audio error:', e);
    }
  }

  // Tension pulse when near target
  playTension() {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(130, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.18);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {
      console.warn('Audio error:', e);
    }
  }

  // Triumphant victory fanfare melody
  playFanfare() {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const notes = [
        { f: 523.25, t: 0.0, d: 0.16 }, // C5
        { f: 523.25, t: 0.16, d: 0.16 }, // C5
        { f: 523.25, t: 0.32, d: 0.16 }, // C5
        { f: 659.25, t: 0.48, d: 0.4 },  // E5
        { f: 587.33, t: 0.88, d: 0.18 }, // D5
        { f: 659.25, t: 1.06, d: 0.18 }, // E5
        { f: 783.99, t: 1.24, d: 0.7 },  // G5 (triumphant hold)
        { f: 1046.50, t: 1.94, d: 0.9 }  // C6 (high apex)
      ];

      const now = this.ctx.currentTime + 0.05;

      notes.forEach(({ f, t, d }) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + t);

        // Add subtle vibrato
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.setValueAtTime(5, now + t);
        lfoGain.gain.setValueAtTime(4, now + t);
        lfo.connect(osc.frequency);
        lfo.start(now + t);
        lfo.stop(now + t + d);

        gain.gain.setValueAtTime(0.001, now + t);
        gain.gain.linearRampToValueAtTime(0.3, now + t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + d);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + t);
        osc.stop(now + t + d + 0.05);
      });
    } catch (e) {
      console.warn('Audio fanfare error:', e);
    }
  }
}

window.soundEngine = new SoundEngine();
