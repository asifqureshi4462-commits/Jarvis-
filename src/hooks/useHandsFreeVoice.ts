import { useCallback, useEffect, useRef, useState } from 'react';

export type HandsFreeStatus =
  | 'off'
  | 'standby'
  | 'listening_command'
  | 'follow_up'
  | 'paused'
  | 'error'
  | 'unsupported';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

export interface HandsFreeTimingMeta {
  sttMs: number;
  eosDetectionMs: number;
}

interface UseHandsFreeVoiceOptions {
  enabled: boolean;
  paused: boolean;
  keepScreenAwake: boolean;
  vadSilenceMs?: number; // 500..900ms
  followUpWindowSec?: number; // 0..20s after Jarvis finishes speaking
  followUpTriggerCounter?: number; // Increments when Jarvis completes a voice-initiated reply
  lang?: string;
  onCommand: (commandText: string, timing: HandsFreeTimingMeta) => void;
  onStopListeningRequested: () => void;
  onWakeAcknowledged?: () => void;
  onInterimHeard?: (text: string) => void;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

function playWakeChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.11, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Ignore audio lock
  }
}

export function useHandsFreeVoice({
  enabled,
  paused,
  keepScreenAwake,
  vadSilenceMs = 650,
  followUpWindowSec = 12,
  followUpTriggerCounter = 0,
  lang = 'en-IN',
  onCommand,
  onStopListeningRequested,
  onWakeAcknowledged,
  onInterimHeard,
}: UseHandsFreeVoiceOptions) {
  const supported = Boolean(getSpeechRecognitionCtor());
  const [status, setStatus] = useState<HandsFreeStatus>(
    supported ? 'off' : 'unsupported'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastHeard, setLastHeard] = useState<string>('');
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);

  const awaitingCommandRef = useRef<boolean>(false);
  const followUpActiveRef = useRef<boolean>(false);
  const commandTimeoutRef = useRef<number | null>(null);
  const silenceFlushTimerRef = useRef<number | null>(null);
  const pendingInterimRef = useRef<string>('');
  const lastInterimChangeAtRef = useRef<number>(0);
  const speechStartedAtRef = useRef<number>(0);
  const retryDelayRef = useRef<number>(200);
  const restartTimerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const lastDispatchedRef = useRef<{ text: string; at: number }>({
    text: '',
    at: 0,
  });

  const onCommandRef = useRef(onCommand);
  const onStopRef = useRef(onStopListeningRequested);
  const onWakeAckRef = useRef(onWakeAcknowledged);
  const onInterimRef = useRef(onInterimHeard);
  const vadMsRef = useRef(Math.min(900, Math.max(500, vadSilenceMs)));
  const followUpSecRef = useRef(Math.min(20, Math.max(0, followUpWindowSec)));

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);
  useEffect(() => {
    onStopRef.current = onStopListeningRequested;
  }, [onStopListeningRequested]);
  useEffect(() => {
    onWakeAckRef.current = onWakeAcknowledged;
  }, [onWakeAcknowledged]);
  useEffect(() => {
    onInterimRef.current = onInterimHeard;
  }, [onInterimHeard]);
  useEffect(() => {
    vadMsRef.current = Math.min(900, Math.max(500, vadSilenceMs));
  }, [vadSilenceMs]);
  useEffect(() => {
    followUpSecRef.current = Math.min(20, Math.max(0, followUpWindowSec));
  }, [followUpWindowSec]);

  const clearSilenceFlush = useCallback(() => {
    if (silenceFlushTimerRef.current !== null) {
      window.clearTimeout(silenceFlushTimerRef.current);
      silenceFlushTimerRef.current = null;
    }
    pendingInterimRef.current = '';
  }, []);

  const clearCommandWindow = useCallback(() => {
    awaitingCommandRef.current = false;
    followUpActiveRef.current = false;
    clearSilenceFlush();
    if (commandTimeoutRef.current !== null) {
      window.clearTimeout(commandTimeoutRef.current);
      commandTimeoutRef.current = null;
    }
  }, [clearSilenceFlush]);

  // Enter natural multi-turn follow-up listening window when Jarvis finishes speaking
  useEffect(() => {
    if (!enabled || followUpTriggerCounter <= 0 || followUpSecRef.current <= 0) {
      return;
    }
    awaitingCommandRef.current = true;
    followUpActiveRef.current = true;
    if (!paused) {
      setStatus('follow_up');
    }
    if (commandTimeoutRef.current !== null) {
      window.clearTimeout(commandTimeoutRef.current);
    }
    commandTimeoutRef.current = window.setTimeout(() => {
      awaitingCommandRef.current = false;
      followUpActiveRef.current = false;
      setStatus((prev) => (prev === 'follow_up' || prev === 'listening_command' ? 'standby' : prev));
    }, followUpSecRef.current * 1000);
  }, [followUpTriggerCounter, enabled, paused]);

  // Screen Wake Lock
  useEffect(() => {
    let cancelled = false;
    const nav = navigator as unknown as {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };

    const releaseLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
        } catch {
          // Ignore
        }
        wakeLockRef.current = null;
      }
      if (!cancelled) setWakeLockActive(false);
    };

    if (!enabled || !keepScreenAwake || !nav.wakeLock) {
      releaseLock();
      return () => {
        cancelled = true;
      };
    }

    const requestLock = async () => {
      try {
        const sentinel = await nav.wakeLock!.request('screen');
        if (cancelled) {
          await sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
      } catch {
        if (!cancelled) setWakeLockActive(false);
      }
    };

    requestLock();
    const onVis = () => {
      if (document.visibilityState === 'visible' && enabled && keepScreenAwake) {
        requestLock();
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      releaseLock();
    };
  }, [enabled, keepScreenAwake]);

  // Continuous SpeechRecognition + Fast VAD-Silence Finalizer
  useEffect(() => {
    const SpeechRec = getSpeechRecognitionCtor();
    if (!SpeechRec) {
      setStatus('unsupported');
      return;
    }

    if (!enabled) {
      clearCommandWindow();
      setErrorMessage(null);
      setStatus('off');
      return;
    }

    if (paused) {
      clearSilenceFlush();
      setStatus('paused');
      return;
    }

    let disposed = false;
    let rec: SpeechRecognitionInstance | null = null;

    const dispatchCommand = (rawText: string, eosMs: number) => {
      const cleaned = rawText.trim();
      if (!cleaned) return;
      const now = performance.now();
      if (
        lastDispatchedRef.current.text === cleaned &&
        now - lastDispatchedRef.current.at < 1400
      ) {
        return;
      }
      lastDispatchedRef.current = { text: cleaned, at: now };

      const sttMs =
        speechStartedAtRef.current > 0
          ? Math.max(80, Math.round(now - speechStartedAtRef.current))
          : Math.max(120, eosMs);
      speechStartedAtRef.current = 0;

      clearCommandWindow();
      setStatus('standby');
      onCommandRef.current(cleaned, {
        sttMs,
        eosDetectionMs: Math.max(0, Math.round(eosMs)),
      });
    };

    const handleTranscriptSegment = (transcript: string, eosMs: number) => {
      const lower = transcript.toLowerCase();

      if (
        /\b(stop\s+listening|go\s+to\s+sleep|stand\s+down|listening\s+band\s+karo)\b/i.test(
          lower
        )
      ) {
        clearCommandWindow();
        onStopRef.current();
        return;
      }

      const hasWakeWord =
        /\bhey\s+jarvis\b/i.test(lower) || /\bjarvis\b/i.test(lower);

      if (hasWakeWord) {
        const trailing = transcript
          .replace(/^.*?\b(?:hey\s+)?jarvis\b[,:\s-]*/i, '')
          .trim();
        if (trailing.length >= 2) {
          dispatchCommand(trailing, eosMs);
        } else {
          awaitingCommandRef.current = true;
          followUpActiveRef.current = false;
          setStatus('listening_command');
          playWakeChime();
          onWakeAckRef.current?.();
          if (commandTimeoutRef.current !== null) {
            window.clearTimeout(commandTimeoutRef.current);
          }
          commandTimeoutRef.current = window.setTimeout(() => {
            awaitingCommandRef.current = false;
            if (!disposed) setStatus('standby');
          }, 9500);
        }
        return;
      }

      if (awaitingCommandRef.current) {
        dispatchCommand(transcript, eosMs);
      }
    };

    const startRecognizer = () => {
      if (disposed) return;
      try {
        rec = new SpeechRec();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = lang;

        rec.onresult = (event) => {
          retryDelayRef.current = 200;
          const idx = event.results.length - 1;
          const resItem = event.results[idx];
          if (!resItem) return;
          const transcript = String(resItem[0]?.transcript || '').trim();
          if (!transcript) return;
          setLastHeard(transcript);

          if (speechStartedAtRef.current === 0) {
            speechStartedAtRef.current = performance.now();
          }

          if (!resItem.isFinal) {
            const lower = transcript.toLowerCase();
            const isWakeCandidate =
              /\bhey\s+jarvis\b/i.test(lower) || /\bjarvis\b/i.test(lower);

            if (awaitingCommandRef.current || isWakeCandidate) {
              onInterimRef.current?.(transcript);
            }

            // Fast VAD-style silence flush: if Chrome stalls on isFinal after user stops speaking
            // for vadSilenceMs (500–900ms), finalize immediately instead of waiting 2+ seconds.
            if (awaitingCommandRef.current || (isWakeCandidate && transcript.length > 14)) {
              pendingInterimRef.current = transcript;
              lastInterimChangeAtRef.current = performance.now();
              if (silenceFlushTimerRef.current !== null) {
                window.clearTimeout(silenceFlushTimerRef.current);
              }
              const targetVadMs = vadMsRef.current;
              silenceFlushTimerRef.current = window.setTimeout(() => {
                if (disposed || !pendingInterimRef.current) return;
                const flushed = pendingInterimRef.current;
                const actualSilence = Math.round(
                  performance.now() - lastInterimChangeAtRef.current
                );
                clearSilenceFlush();
                try {
                  rec?.stop();
                } catch {
                  // Ignore stop failure
                }
                handleTranscriptSegment(flushed, actualSilence);
              }, targetVadMs);
            }
            return;
          }

          const eosMs =
            lastInterimChangeAtRef.current > 0
              ? Math.min(
                  vadMsRef.current,
                  Math.max(120, Math.round(performance.now() - lastInterimChangeAtRef.current))
                )
              : Math.min(vadMsRef.current, 550);
          clearSilenceFlush();
          handleTranscriptSegment(transcript, eosMs);
        };

        rec.onerror = (ev) => {
          const code = ev?.error || 'unknown';
          if (code === 'not-allowed' || code === 'service-not-allowed') {
            disposed = true;
            setStatus('error');
            setErrorMessage(
              'Microphone permission denied. Allow microphone access in browser site settings to use Hands-Free Mode.'
            );
            return;
          }
          if (code === 'audio-capture') {
            disposed = true;
            setStatus('error');
            setErrorMessage(
              'No active microphone hardware detected. Connect a microphone and re-enable Hands-Free Mode.'
            );
            return;
          }
          if (code === 'network') {
            setErrorMessage(
              'Browser speech recognition reported a network issue; retrying standby listener...'
            );
          }
        };

        rec.onend = () => {
          if (disposed) return;
          const wait = retryDelayRef.current;
          retryDelayRef.current = Math.min(1800, retryDelayRef.current * 1.4);
          restartTimerRef.current = window.setTimeout(() => {
            if (!disposed) startRecognizer();
          }, wait);
        };

        rec.start();
        setErrorMessage(null);
        setStatus(
          followUpActiveRef.current
            ? 'follow_up'
            : awaitingCommandRef.current
              ? 'listening_command'
              : 'standby'
        );
      } catch (err) {
        if (!disposed) {
          setStatus('error');
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'Unable to start continuous voice recognition.'
          );
        }
      }
    };

    startRecognizer();

    return () => {
      disposed = true;
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      clearSilenceFlush();
      try {
        rec?.abort();
      } catch {
        // Ignore
      }
    };
  }, [enabled, paused, lang, clearCommandWindow, clearSilenceFlush]);

  const cancelFollowUp = useCallback(() => {
    clearCommandWindow();
    if (enabled && !paused) {
      setStatus('standby');
    }
  }, [clearCommandWindow, enabled, paused]);

  return {
    supported,
    status,
    errorMessage,
    lastHeard,
    wakeLockActive,
    cancelFollowUp,
  };
}
