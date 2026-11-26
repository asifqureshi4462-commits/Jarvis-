/**
 * Real-time Web Audio Voice Activity Detection (VAD)
 * Calibrates ambient noise floor, distinguishes voice-band energy from background hum,
 * tolerates brief mid-sentence pauses, and fires end-of-speech within 500–900ms.
 */

export interface VoiceActivityOptions {
  stream: MediaStream;
  silenceThresholdMs?: number; // 500..900ms
  noSpeechTimeoutMs?: number; // Optional max wait before speech begins
  minSpeechMs?: number; // Minimum continuous speech before EOS can fire
  onLevel?: (rmsNormalized: number, isSpeaking: boolean) => void;
  onSpeechStart?: () => void;
  onEndOfSpeech?: (eosDetectionMs: number, hadSpeech: boolean) => void;
}

export interface VoiceActivityHandle {
  stop: () => void;
  getEosDetectionMs: () => number;
}

export function createVoiceActivityMonitor(
  options: VoiceActivityOptions
): VoiceActivityHandle {
  const silenceThresholdMs = Math.min(
    900,
    Math.max(500, options.silenceThresholdMs ?? 650)
  );
  const noSpeechTimeoutMs = options.noSpeechTimeoutMs ?? 7000;
  const minSpeechMs = options.minSpeechMs ?? 220;

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;

  const ctx = new AudioCtx();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const source = ctx.createMediaStreamSource(options.stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.25;
  source.connect(analyser);

  const timeData = new Uint8Array(analyser.frequencyBinCount);
  const freqData = new Uint8Array(analyser.frequencyBinCount);

  const nyquist = ctx.sampleRate / 2;
  const binHz = nyquist / analyser.frequencyBinCount;
  // Human speech fundamentals + formants mostly sit in 250Hz..3400Hz
  const lowBin = Math.max(1, Math.floor(250 / binHz));
  const highBin = Math.min(
    analyser.frequencyBinCount - 1,
    Math.ceil(3400 / binHz)
  );

  let disposed = false;
  let rafId = 0;
  const startedAt = performance.now();
  let noiseFloor = 0.015;
  let noiseSamples = 0;
  let speechDetected = false;
  let speechStartAt = 0;
  let lastSpeechAt = 0;
  let silenceStartedAt = 0;
  let eosTriggered = false;

  const tick = () => {
    if (disposed || eosTriggered) return;
    const now = performance.now();

    analyser.getByteTimeDomainData(timeData);
    analyser.getByteFrequencyData(freqData);

    // Overall RMS
    let sumSq = 0;
    for (let i = 0; i < timeData.length; i++) {
      const sample = (timeData[i] - 128) / 128;
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / timeData.length);

    // Speech-band energy ratio (0..1)
    let bandSum = 0;
    for (let b = lowBin; b <= highBin; b++) {
      bandSum += freqData[b];
    }
    const bandAvg = bandSum / Math.max(1, highBin - lowBin + 1) / 255;

    // Adaptive ambient noise calibration during initial 300ms or quiet periods
    if (now - startedAt < 300 && noiseSamples < 25) {
      noiseFloor = noiseFloor * 0.75 + Math.min(0.06, rms) * 0.25;
      noiseSamples++;
    } else if (!speechDetected && rms < noiseFloor * 1.4) {
      noiseFloor = noiseFloor * 0.96 + Math.min(0.06, rms) * 0.04;
    }

    const activeThreshold = Math.max(0.022, noiseFloor * 2.25);
    const isVoiceFrame = rms > activeThreshold && bandAvg > 0.06;

    const normalizedLevel = Math.min(1, rms * 4.2);
    options.onLevel?.(normalizedLevel, isVoiceFrame);

    if (isVoiceFrame) {
      if (!speechDetected && speechStartAt === 0) {
        speechStartAt = now;
      }
      if (!speechDetected && now - speechStartAt >= 90) {
        speechDetected = true;
        options.onSpeechStart?.();
      }
      lastSpeechAt = now;
      silenceStartedAt = 0;
    } else if (speechDetected) {
      if (silenceStartedAt === 0) {
        silenceStartedAt = now;
      }
      const spokeDuration = lastSpeechAt - speechStartAt;
      const silentDuration = now - silenceStartedAt;
      if (spokeDuration >= minSpeechMs && silentDuration >= silenceThresholdMs) {
        eosTriggered = true;
        options.onEndOfSpeech?.(Math.round(silentDuration), true);
        return;
      }
    } else if (noSpeechTimeoutMs > 0 && now - startedAt >= noSpeechTimeoutMs) {
      eosTriggered = true;
      options.onEndOfSpeech?.(0, false);
      return;
    }

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  return {
    getEosDetectionMs: () =>
      lastSpeechAt > 0
        ? Math.max(0, Math.round(performance.now() - lastSpeechAt))
        : 0,
    stop: () => {
      if (disposed) return;
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      try {
        source.disconnect();
      } catch {
        // Ignore
      }
      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    },
  };
}
