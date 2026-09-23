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

  // Football Kick sound - punchy low-frequency thump and friction
  playKick(power = 1) {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const baseFreq = 160 + Math.min(power * 60, 80);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.12);

      gain.gain.setValueAtTime(0.35 * Math.min(power, 1.2), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.14);

      // Add kick turf slap noise
      this.playNoiseTransient(now, 0.04, 900, 0.15);
    } catch (e) {
      console.warn('Audio kick error:', e);
    }
  }

  // Ball hitting net - soft rustle / ripple
  playNet() {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      this.playNoiseTransient(now, 0.32, 1200, 0.22, true);
    } catch (e) {
      console.warn('Audio net error:', e);
    }
  }

  // Ball hitting post / crossbar - metallic clang
  playWoodwork() {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      [840, 1680, 2520].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        const vol = 0.28 / (idx + 1);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.45);
      });

      this.playNoiseTransient(now, 0.05, 3000, 0.2);
    } catch (e) {
      console.warn('Audio woodwork error:', e);
    }
  }

  // Goalkeeper glove deflection / catch
  playGloveSave() {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.09);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);

      this.playNoiseTransient(now, 0.07, 1600, 0.25);
    } catch (e) {
      console.warn('Audio save error:', e);
    }
  }

  // Referee whistle
  playWhistle() {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const freqs = [2520, 2840];

      freqs.forEach(f => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const tremolo = this.ctx.createOscillator();
        const tremGain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);

        tremolo.type = 'sine';
        tremolo.frequency.setValueAtTime(28, now);
        tremGain.gain.setValueAtTime(25, now);
        tremolo.connect(osc.frequency);
        tremolo.start(now);
        tremolo.stop(now + 0.35);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
        gain.gain.setValueAtTime(0.16, now + 0.28);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.35);
      });
    } catch (e) {
      console.warn('Audio whistle error:', e);
    }
  }

  // Crowd Roar on Goal
  playCrowdRoar() {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 2.2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Generate brownian/filtered noise
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.04 * white)) / 1.04;
        lastOut = data[i];
        data[i] *= 3.5;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(650, now);
      filter.Q.setValueAtTime(1.5, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.1);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(now);
      noise.stop(now + 2.2);
    } catch (e) {
      console.warn('Audio roar error:', e);
    }
  }

  // Crowd Groan on Miss / Save
  playCrowdGroan() {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 1.2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 2.8;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(480, now);
      filter.frequency.exponentialRampToValueAtTime(240, now + 0.9);
      filter.Q.setValueAtTime(2.5, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(now);
      noise.stop(now + 1.2);
    } catch (e) {
      console.warn('Audio groan error:', e);
    }
  }

  // Noise transient helper
  playNoiseTransient(startTime, duration, cutoff = 1000, volume = 0.2, isFlutter = false) {
    if (!this.ctx) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, startTime);

    const gain = this.ctx.createGain();
    if (isFlutter) {
      gain.gain.setValueAtTime(0.01, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    } else {
      gain.gain.setValueAtTime(volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    }

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(startTime);
    noise.stop(startTime + duration);
  }

  // Shuffle Tick Sound - crisp percussive mechanical tick for spinning / shuffling
  playShuffleTick(pitchMultiplier = 1) {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520 * pitchMultiplier, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.035);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.045);

      this.playNoiseTransient(now, 0.02, 3800, 0.15);
    } catch (e) {
      console.warn('Shuffle tick error:', e);
    }
  }

  // Shuffle continuous flutter / card-riffle whoosh
  playShuffleFlutter(duration = 2.4) {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Filtered fluttering noise
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.45;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(650, now);
      filter.frequency.linearRampToValueAtTime(1400, now + duration * 0.55);
      filter.frequency.exponentialRampToValueAtTime(450, now + duration);
      filter.Q.setValueAtTime(2.6, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.18);
      gain.gain.setValueAtTime(0.2, now + duration - 0.35);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(now);
      noise.stop(now + duration + 0.05);
    } catch (e) {
      console.warn('Shuffle flutter error:', e);
    }
  }

  // Casino Slot Reel Mechanical Lock / Stop Clunk
  playSlotLock() {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.12);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);

      this.playNoiseTransient(now, 0.05, 2400, 0.3);
    } catch (e) {
      console.warn('Slot lock error:', e);
    }
  }

  // Casino Win Bell Chimes (Ascending bells: C6, E6, G6, C7)
  playCasinoChime() {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const notes = [1046.50, 1318.51, 1567.98, 2093.00];
      const now = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        const noteTime = now + idx * 0.08;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0.001, noteTime);
        gain.gain.linearRampToValueAtTime(0.28, noteTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.38);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(noteTime);
        osc.stop(noteTime + 0.4);
      });
    } catch (e) {
      console.warn('Casino chime error:', e);
    }
  }
}

window.soundEngine = new SoundEngine();
