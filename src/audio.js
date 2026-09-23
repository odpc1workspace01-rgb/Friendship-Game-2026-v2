/**
 * ODPC1 FRIENDSHIP GAMES 2026 - Web Audio API & Media Sound Engine
 * Generates synthesized sounds for game show countdowns, buzzers, and celebrations,
 * and manages custom user-uploaded timeout & countdown audio files stored in IndexedDB.
 */

let audioCtx = null;
let isAudioEnabled = true;
let currentPreviewAudio = null;
let currentPreviewUrl = null;
let currentActiveAudio = null;
let currentActiveUrl = null;

// Supported MIME types and extensions
const SUPPORTED_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/ogg',
  'application/ogg'
];

const SUPPORTED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.aac'];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * Validate audio file type and size
 * @param {File} file 
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateAudioFile(file) {
  if (!file) {
    return { valid: false, error: 'กรุณาเลือกไฟล์เสียง' };
  }

  // Check file size (20 MB limit)
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'ไฟล์มีขนาดใหญ่เกินกำหนด กรุณาเลือกไฟล์ไม่เกิน 20 MB' };
  }

  // Check extension
  const fileName = (file.name || '').toLowerCase();
  const hasValidExt = SUPPORTED_EXTENSIONS.some(ext => fileName.endsWith(ext));

  // Check MIME type
  const fileType = (file.type || '').toLowerCase();
  const hasValidMime = SUPPORTED_MIME_TYPES.includes(fileType) || fileType.startsWith('audio/');

  if (!hasValidExt && !hasValidMime) {
    return { valid: false, error: 'ไม่รองรับไฟล์เสียงชนิดนี้ (รองรับ MP3, WAV, M4A, OGG)' };
  }

  return { valid: true, error: null };
}

/**
 * Get or initialize Web Audio Context (resumes on user gesture)
 */
export function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(e => console.warn('[Audio] Context resume error:', e));
  }
  return audioCtx;
}

/**
 * Unlock AudioContext for browser autoplay policies
 */
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
}

export function setAudioEnabled(enabled) {
  isAudioEnabled = enabled;
  if (enabled) {
    getAudioContext();
  }
}

export function getAudioEnabled() {
  return isAudioEnabled;
}

// =========================================================
// 1. COUNTDOWN SOUNDS (Game Show 5, 4, 3, 2, 1, GO!)
// =========================================================

/**
 * Play game show synthesizer countdown step (5, 4, 3, 2, 1, or GO!)
 * Energetic, punchy, sports-stadium sound using dual harmonics and tight envelopes.
 */
export function playCountdownStep(step, volume = 0.8) {
  if (!isAudioEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const vol = Math.max(0, Math.min(1, volume));

  if (step === 'GO' || step === 'GO!' || step === 0) {
    // Triumphant High Sports Fanfare Chord on GO!
    playGoSound(vol);
    return;
  }

  const num = Number(step);
  // Distinct frequencies stepping upward: 5 (C5), 4 (D5), 3 (E5), 2 (G5), 1 (C6)
  const stepFreqs = {
    5: { base: 523.25, harm: 1046.50 }, // C5
    4: { base: 587.33, harm: 1174.66 }, // D5
    3: { base: 659.25, harm: 1318.51 }, // E5
    2: { base: 783.99, harm: 1567.98 }, // G5
    1: { base: 1046.50, harm: 2093.00 } // C6 (High energetic staccato)
  };

  const config = stepFreqs[num] || { base: 659.25, harm: 1318.51 };

  try {
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(vol * 0.45, ctx.currentTime);
    masterGain.connect(ctx.destination);

    // 1. Fundamental chime
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(config.base, ctx.currentTime);

    gain1.gain.setValueAtTime(0.01, ctx.currentTime);
    gain1.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);

    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.4);

    // 2. Harmonic metallic staccato ping
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(config.harm, ctx.currentTime);

    gain2.gain.setValueAtTime(0.01, ctx.currentTime);
    gain2.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.015);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(ctx.currentTime);
    osc2.stop(ctx.currentTime + 0.25);
  } catch (err) {
    console.warn('[Audio] Countdown step error:', err);
  }
}

/**
 * 2. GO! Sound (Triumphant High Sports Chord)
 */
export function playGoSound(volume = 0.8) {
  if (!isAudioEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const vol = Math.max(0, Math.min(1, volume));

  try {
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(vol * 0.5, ctx.currentTime);
    masterGain.connect(ctx.destination);

    // Sports Arena Brass / Organ chord: C5, E5, G5, C6, E6
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = idx % 2 === 0 ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.02);

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.85);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(ctx.currentTime + idx * 0.02);
      osc.stop(ctx.currentTime + 0.9);
    });
  } catch (err) {
    console.warn('[Audio] GO sound error:', err);
  }
}

/**
 * Legacy beep fallback
 */
export function playCountdownBeep(freq = 880, duration = 0.18) {
  if (!isAudioEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.01, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (err) {
    console.warn('[Audio] Beep error:', err);
  }
}

// =========================================================
// 3. TIME UP SOUND (Synthesized Buzzer & Custom Playback)
// =========================================================

/**
 * Default Game Show Stadium Buzzer (Web Audio API)
 */
export function playSynthesizedTimeoutBuzzer(vol = 0.8) {
  try {
    console.log('[Audio] Playing default synthesizer timeout buzzer');
    const ctx = getAudioContext();
    if (!ctx) return;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, vol)), ctx.currentTime);
    masterGain.connect(ctx.destination);

    // Dual discordant stadium buzzer (160Hz & 168Hz)
    [160, 168].forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.4, ctx.currentTime + 0.75);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.25);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start();
      osc.stop(ctx.currentTime + 1.3);
    });
  } catch (err) {
    console.warn('[Audio] Synthesizer buzzer error:', err);
  }
}

/**
 * Play Time's Up Sound (Custom Audio Blob or Synthesized Buzzer)
 */
export async function playTimeUpSound(options = {}) {
  const { customBlob = null, volume = 0.8, enabled = true } = options;
  if (!isAudioEnabled || !enabled) return;

  const normalizedVol = Math.max(0, Math.min(1, typeof volume === 'number' ? (volume > 1 ? volume / 100 : volume) : 0.8));

  if (customBlob) {
    try {
      console.log('[Audio] Playing custom Time Up audio blob');
      await playAudioBlob(customBlob, normalizedVol);
      return;
    } catch (err) {
      console.warn('[Audio] Custom audio playback failed, falling back to synthesizer:', err);
      playSynthesizedTimeoutBuzzer(normalizedVol);
      return;
    }
  }

  playSynthesizedTimeoutBuzzer(normalizedVol);
}

// =========================================================
// 4. BLOB PLAYBACK & PREVIEW CONTROLLER
// =========================================================

/**
 * Play an Audio Blob using HTMLAudioElement with cleanup
 * @param {Blob} blob 
 * @param {number} volume 0.0 to 1.0
 * @returns {Promise<HTMLAudioElement>}
 */
export function playAudioBlob(blob, volume = 0.8) {
  return new Promise((resolve, reject) => {
    stopCurrentActiveAudio();

    if (!(blob instanceof Blob)) {
      reject(new Error('Invalid audio blob'));
      return;
    }

    try {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, volume));

      currentActiveAudio = audio;
      currentActiveUrl = url;

      const cleanup = () => {
        if (currentActiveUrl === url) {
          URL.revokeObjectURL(url);
          currentActiveUrl = null;
          currentActiveAudio = null;
        }
      };

      audio.onended = () => {
        console.log('[Audio] Playback ended');
        cleanup();
      };

      audio.onerror = (e) => {
        console.error('[Audio] Playback error:', e);
        cleanup();
        reject(e);
      };

      audio.play().then(() => {
        console.log('[Audio] Playback started successfully');
        resolve(audio);
      }).catch(err => {
        console.error('[Audio] Playback failed:', err);
        cleanup();
        reject(err);
      });
    } catch (err) {
      console.error('[Audio] Error creating audio from blob:', err);
      reject(err);
    }
  });
}

/**
 * Stop any currently playing active audio
 */
export function stopCurrentActiveAudio() {
  if (currentActiveAudio) {
    try {
      currentActiveAudio.pause();
      currentActiveAudio.currentTime = 0;
    } catch (e) {}
    currentActiveAudio = null;
  }
  if (currentActiveUrl) {
    try {
      URL.revokeObjectURL(currentActiveUrl);
    } catch (e) {}
    currentActiveUrl = null;
  }
}

/**
 * Stop current preview audio
 */
export function stopCurrentPreview() {
  if (currentPreviewAudio) {
    try {
      currentPreviewAudio.pause();
      currentPreviewAudio.currentTime = 0;
    } catch (e) {}
    currentPreviewAudio = null;
  }
  if (currentPreviewUrl) {
    try {
      URL.revokeObjectURL(currentPreviewUrl);
    } catch (e) {}
    currentPreviewUrl = null;
  }
}

/**
 * Stop all audio playback (preview, active countdown, alarms)
 */
export function stopAllAudio() {
  stopCurrentPreview();
  stopCurrentActiveAudio();
}

/**
 * Preview Audio (Custom Audio Record / Blob or Default Synthesizer)
 * @param {Object|Blob|string} audioTarget 
 * @param {number} volume 0 - 100 or 0.0 - 1.0
 * @param {string} category 'COUNTDOWN' | 'TIME_UP'
 * @param {Function} onEndedCallback 
 * @returns {boolean} returns true if playback started, false if stopped/paused
 */
export function previewAudio(audioTarget, volume = 80, category = 'TIME_UP', onEndedCallback = null) {
  // If preview is already active, stop it first
  const wasPlaying = currentPreviewAudio !== null;
  stopCurrentPreview();

  const normalizedVol = Math.max(0, Math.min(1, volume > 1 ? volume / 100 : volume));

  // If target is null or 'default'
  if (!audioTarget || audioTarget === 'default' || audioTarget.isDefault) {
    if (category === 'COUNTDOWN') {
      // Play sample 3, 2, 1, GO
      let step = 3;
      playCountdownStep(step, normalizedVol);
      const timer = setInterval(() => {
        step--;
        if (step > 0) {
          playCountdownStep(step, normalizedVol);
        } else if (step === 0) {
          playCountdownStep('GO', normalizedVol);
        } else {
          clearInterval(timer);
          if (onEndedCallback) onEndedCallback();
        }
      }, 700);
      return true;
    } else {
      playSynthesizedTimeoutBuzzer(normalizedVol);
      if (onEndedCallback) setTimeout(onEndedCallback, 1300);
      return true;
    }
  }

  // Target is a custom record with audioBlob, or a direct Blob
  const blob = audioTarget.audioBlob || audioTarget.blob || (audioTarget instanceof Blob ? audioTarget : null);

  if (!blob) {
    console.warn('[Audio] No valid audio blob found for preview, using default sound');
    if (category === 'COUNTDOWN') {
      playCountdownStep(1, normalizedVol);
    } else {
      playSynthesizedTimeoutBuzzer(normalizedVol);
    }
    if (onEndedCallback) onEndedCallback();
    return false;
  }

  try {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = normalizedVol;

    currentPreviewAudio = audio;
    currentPreviewUrl = url;

    const cleanup = () => {
      if (currentPreviewUrl === url) {
        URL.revokeObjectURL(url);
        currentPreviewUrl = null;
        currentPreviewAudio = null;
      }
      if (onEndedCallback) onEndedCallback();
    };

    audio.onended = () => {
      console.log('[Audio] Preview ended');
      cleanup();
    };

    audio.onerror = (e) => {
      console.warn('[Audio] Preview playback error:', e);
      cleanup();
      // Fallback
      if (category === 'COUNTDOWN') {
        playCountdownStep(1, normalizedVol);
      } else {
        playSynthesizedTimeoutBuzzer(normalizedVol);
      }
    };

    audio.play().then(() => {
      console.log('[Audio] Preview started:', audioTarget.audioName || 'custom audio');
    }).catch(err => {
      console.warn('[Audio] Preview play error:', err);
      cleanup();
      if (category === 'COUNTDOWN') {
        playCountdownStep(1, normalizedVol);
      } else {
        playSynthesizedTimeoutBuzzer(normalizedVol);
      }
    });

    return true;
  } catch (err) {
    console.error('[Audio] Error preparing preview:', err);
    if (category === 'COUNTDOWN') {
      playCountdownStep(1, normalizedVol);
    } else {
      playSynthesizedTimeoutBuzzer(normalizedVol);
    }
    if (onEndedCallback) onEndedCallback();
    return false;
  }
}

// =========================================================
// 5. SECONDARY SOUND EFFECTS (Warnings, Stingers, Fanfare)
// =========================================================

export function playWarningTick(freq = 950) {
  if (!isAudioEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (err) {
    console.warn('[Audio] Tick error:', err);
  }
}

export function playCelebrationFanfare() {
  if (!isAudioEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const melody = [
      { f: 523.25, t: 0.0, d: 0.15 },
      { f: 659.25, t: 0.15, d: 0.15 },
      { f: 783.99, t: 0.30, d: 0.15 },
      { f: 1046.50, t: 0.45, d: 0.40 },
      { f: 880.00, t: 0.88, d: 0.15 },
      { f: 1046.50, t: 1.05, d: 0.60 }
    ];

    melody.forEach(note => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, ctx.currentTime + note.t);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + note.t);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + note.t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + note.t + note.d);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + note.t);
      osc.stop(ctx.currentTime + note.t + note.d + 0.05);
    });
  } catch (err) {
    console.warn('[Audio] Fanfare error:', err);
  }
}

export function playRankStinger(rank) {
  if (!isAudioEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const freqs = {
      4: 440,
      3: 554.37,
      2: 659.25,
      1: 880
    };
    const freq = freqs[rank] || 440;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = rank === 1 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (rank === 1) {
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + 0.3);
    }

    gain.gain.setValueAtTime(0.01, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (rank === 1 ? 0.6 : 0.3));

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  } catch (err) {
    console.warn('[Audio] Rank stinger error:', err);
  }
}
