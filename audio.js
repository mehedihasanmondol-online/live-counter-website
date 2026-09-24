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
    // Custom Goal Audio Sound Effects (assets/Goal sound effect.mp3 and assets/Goal sound effect 2.mp3)
    this.goalSoundFiles = [
      'assets/Goal sound effect.mp3',
      'assets/Goal sound effect 2.mp3'
    ];
    this.goalAudioBuffers = [];
    this.goalAudioElements = [];
    this.lastGoalSoundIndex = -1;
    this.currentGoalSource = null;
    this.currentGoalAudio = null;
    this.initGoalAudio();
  }

  initGoalAudio() {
    try {
      this.goalAudioElements = this.goalSoundFiles.map((file) => {
        const audio = new Audio(encodeURI(file));
        audio.preload = 'auto';
        return audio;
      });
    } catch (e) {
      console.warn('HTML5 goal audio preload warning:', e);
    }
  }

  loadGoalAudioBuffers() {
    if (!this.ctx) return;
    this.goalSoundFiles.forEach((file, index) => {
      if (this.goalAudioBuffers[index]) return;
      fetch(encodeURI(file))
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then(arrayBuf => this.ctx.decodeAudioData(arrayBuf))
        .then(decodedBuf => {
          this.goalAudioBuffers[index] = decodedBuf;
        })
        .catch(err => {
          console.warn('Web Audio buffer preload error for', file, err);
        });
    });
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
    this.loadGoalAudioBuffers();
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

  // Authentic Stadium Clapping / Applause ("Hattali")
  playApplause(duration = 3.5) {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const sampleRate = this.ctx.sampleRate;
      const bufferSize = Math.floor(sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const output = buffer.getChannelData(0);

      // Generate dense realistic stochastic hand-claps
      const totalClaps = Math.floor(duration * 75); // Over 250 individual claps
      for (let c = 0; c < totalClaps; c++) {
        const startTime = Math.random() * (duration - 0.1);
        const startSample = Math.floor(startTime * sampleRate);
        const clapDuration = 0.015 + Math.random() * 0.025; // 15-40ms flesh impact
        const clapSamples = Math.floor(clapDuration * sampleRate);
        const intensity = 0.35 + Math.random() * 0.65;

        // Swell up fast, sustain enthusiastically, then fade
        let timeWeight = 1.0;
        if (startTime < 0.25) {
          timeWeight = 0.2 + (startTime / 0.25) * 0.8;
        } else if (startTime > duration - 0.7) {
          timeWeight = Math.max(0, (duration - startTime) / 0.7);
        }

        for (let i = 0; i < clapSamples; i++) {
          const idx = startSample + i;
          if (idx < bufferSize) {
            // Sharp transient attack with rapid decay
            const decay = Math.exp(-i / (clapSamples * 0.28));
            const whiteNoise = (Math.random() * 2 - 1);
            output[idx] += whiteNoise * decay * intensity * timeWeight * 0.22;
          }
        }
      }

      // Add soft crowd roar ambience bed to the applause
      let lastVal = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastVal = (lastVal + 0.04 * white) / 1.04;
        const t = i / sampleRate;
        const env = t < 0.3 ? (t / 0.3) : (t > duration - 0.6 ? (duration - t) / 0.6 : 1.0);
        output[i] += lastVal * 0.12 * env;
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      // Bandpass filter centered at 1700Hz with resonance to emulate palm claps
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1700, now);
      filter.Q.setValueAtTime(1.15, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.48, now + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      source.start(now);
      source.stop(now + duration);
    } catch (e) {
      console.warn('Audio applause error:', e);
    }
  }

  // Voice Announcer - Disabled per user request ("kotha bad dau")
  shoutGoal() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
  }

  // Synthesized Goal Fanfare & Horn (Brass/Chamber cheer)
  playGoalHorns() {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // Celebratory chord: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz)
      const chord = [523.25, 659.25, 783.99, 1046.50];
      chord.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);

        // Filter to make it sound like a stadium brass horn
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1800, now);
        filter.Q.setValueAtTime(2.0, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.07, now + 0.08 + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.05);
        osc.stop(now + 1.7);
      });
    } catch (e) {
      console.warn('Goal horn error:', e);
    }
  }

  // Player-specific Goal Sound Effect MP3 ('Goal sound effect.mp3' for Player 1 / Messi, 'Goal sound effect 2.mp3' for Player 2 / Ronaldo)
  playGoalSoundForPlayer(playerOrIdentifier = null) {
    if (this.muted) return;
    this.initAudioContext();

    if (!this.goalSoundFiles || this.goalSoundFiles.length === 0) return;

    let targetIdx = 0;

    if (typeof playerOrIdentifier === 'number') {
      targetIdx = Math.abs(Math.floor(playerOrIdentifier)) % this.goalSoundFiles.length;
    } else if (typeof playerOrIdentifier === 'string') {
      const lower = playerOrIdentifier.toLowerCase().trim();
      if (lower.includes('2.mp3') || lower.endsWith(' 2') || lower === '2' || lower === 'p2' || lower.includes('ronaldo')) {
        targetIdx = 1;
      } else if (lower.includes('sound effect') || lower === '1' || lower === 'p1' || lower.includes('messi')) {
        targetIdx = 0;
      } else if (typeof window !== 'undefined' && window.arenaApp && window.arenaApp.getPlayers) {
        const players = window.arenaApp.getPlayers();
        const pIdx = players.findIndex(p => p.id === playerOrIdentifier || (p.name && p.name.toLowerCase() === lower));
        if (pIdx !== -1) {
          const found = players[pIdx];
          if (found.goalSound && found.goalSound.includes('2')) {
            targetIdx = 1;
          } else if (found.goalSound) {
            targetIdx = 0;
          } else {
            targetIdx = pIdx % this.goalSoundFiles.length;
          }
        }
      }
    } else if (playerOrIdentifier && typeof playerOrIdentifier === 'object') {
      if (playerOrIdentifier.goalSound) {
        targetIdx = playerOrIdentifier.goalSound.includes('2') ? 1 : 0;
      } else if (playerOrIdentifier.goalSoundIndex !== undefined) {
        targetIdx = Math.abs(playerOrIdentifier.goalSoundIndex) % this.goalSoundFiles.length;
      } else if (playerOrIdentifier.id === 'p2' || (playerOrIdentifier.name && playerOrIdentifier.name.toLowerCase().includes('ronaldo'))) {
        targetIdx = 1;
      } else if (playerOrIdentifier.id === 'p1' || (playerOrIdentifier.name && playerOrIdentifier.name.toLowerCase().includes('messi'))) {
        targetIdx = 0;
      } else if (typeof window !== 'undefined' && window.arenaApp && window.arenaApp.getPlayers) {
        const players = window.arenaApp.getPlayers();
        const pIdx = players.findIndex(p => p.id === playerOrIdentifier.id);
        targetIdx = pIdx >= 0 ? (pIdx % this.goalSoundFiles.length) : 0;
      }
    } else {
      // Fallback: check active kicker in penaltyGame if available
      if (typeof window !== 'undefined' && window.penaltyGame && window.penaltyGame.activePlayerId) {
        return this.playGoalSoundForPlayer(window.penaltyGame.activePlayerId);
      }
      targetIdx = 0;
    }

    this.playGoalSoundByIndex(targetIdx);
  }

  // Play a specific goal sound by index (0 for Sound 1 / Messi, 1 for Sound 2 / Ronaldo)
  playGoalSoundByIndex(idx = 0) {
    if (this.muted) return;
    this.initAudioContext();

    if (!this.goalSoundFiles || this.goalSoundFiles.length === 0) return;
    idx = Math.max(0, Math.min(idx, this.goalSoundFiles.length - 1));

    // Stop previous active goal sound to avoid audio clashing
    if (this.currentGoalAudio) {
      try {
        this.currentGoalAudio.pause();
        this.currentGoalAudio.currentTime = 0;
      } catch (e) {}
      this.currentGoalAudio = null;
    }
    if (this.currentGoalSource) {
      try {
        this.currentGoalSource.stop();
        this.currentGoalSource.disconnect();
      } catch (e) {}
      this.currentGoalSource = null;
    }

    // 1. Try Web Audio buffer source (instant low-latency playback)
    if (this.ctx && this.goalAudioBuffers[idx]) {
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = this.goalAudioBuffers[idx];
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(1.0, this.ctx.currentTime);
        source.connect(gain);
        gain.connect(this.ctx.destination);
        source.start(0);
        this.currentGoalSource = source;
        return;
      } catch (err) {
        console.warn('Buffer playback error, falling back:', err);
      }
    }

    // 2. Fallback to preloaded HTML5 Audio at full volume
    try {
      const audio = this.goalAudioElements[idx] || new Audio(encodeURI(this.goalSoundFiles[idx]));
      audio.currentTime = 0;
      audio.volume = 1.0;
      this.currentGoalAudio = audio;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => console.warn('Goal sound playback error:', err));
      }
    } catch (e) {
      console.warn('Goal sound effect error:', e);
    }
  }

  // Pure Goal Celebration: Plays the player-specific Goal Sound Effect MP3 (not random, no speech)
  playGoalCelebration(playerOrIdentifier = null) {
    if (this.muted) return;
    this.initAudioContext();

    // Stop any browser speech synthesis if active
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }

    // Play player-specific goal sound effect MP3
    this.playGoalSoundForPlayer(playerOrIdentifier);
  }

  // Direct alias
  playGoalSound(playerOrIdentifier = null) {
    this.playGoalCelebration(playerOrIdentifier);
  }

  // Backwards-compatibility alias: redirects to player sound if provided, or alternates deterministically
  playRandomGoalSound(playerOrIdentifier = null) {
    if (playerOrIdentifier) {
      this.playGoalSoundForPlayer(playerOrIdentifier);
      return;
    }
    const idx = (this.lastGoalSoundIndex + 1) % this.goalSoundFiles.length;
    this.lastGoalSoundIndex = idx;
    this.playGoalSoundByIndex(idx);
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

  // Casino Win Bell Chimes (Ascending bells: C6, E6, G6, C7) with dynamic streak pitch
  playCasinoChime(pitchMultiplier = 1) {
    if (this.muted) return;
    this.initAudioContext();
    if (!this.ctx) return;

    try {
      const notes = [1046.50, 1318.51, 1567.98, 2093.00].map(f => f * pitchMultiplier);
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
