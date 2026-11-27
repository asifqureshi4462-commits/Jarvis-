import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BellOff,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Compass,
  Cpu,
  FolderKanban,
  ImagePlus,
  LayoutDashboard,
  Link2,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  Moon,
  Radio,
  Send,
  Settings,
  Sparkles,
  Square,
  Sun,
  Volume2,
  VolumeX,
  WifiOff,
  XCircle,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  addMemory,
  addMessage,
  addNote,
  addTask,
  clearMessages,
  deleteMemory,
  deleteNote,
  deleteTask,
  googleSignIn,
  initAuth,
  loadSettings,
  logout,
  saveAssistantSettings,
  subscribeMemories,
  subscribeMessages,
  subscribeNotes,
  subscribeTasks,
  toggleTask,
  updateMemory,
} from './lib/firebase';
import type {
  AlarmTimer,
  ChatMessage,
  ConfirmDialogState,
  GroundingChunk,
  LatencyTelemetry,
  MemoryItem,
  ModelMode,
  NavSection,
  NoteItem,
  OrbState,
  SoulConfig,
  TaskItem,
  ThemeMode,
  VoiceSettings,
  VoiceTuningConfig,
} from './types/jarvis';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useTheme } from './hooks/useTheme';
import {
  useHandsFreeVoice,
  type HandsFreeTimingMeta,
} from './hooks/useHandsFreeVoice';
import { routeLocalCommand } from './lib/localCommandRouter';
import {
  executeDeviceControl,
  parseAlarmSchedule,
  requestNotificationPermissionIfPossible,
} from './lib/deviceControl';
import { loadVoiceTuning, saveVoiceTuning } from './lib/voiceStorage';
import {
  createVoiceActivityMonitor,
  type VoiceActivityHandle,
} from './lib/voiceVad';
import { SplashScreen } from './components/SplashScreen';
import { JarvisOrb } from './components/JarvisOrb';
import { HeadlinesPanel } from './components/HeadlinesPanel';
import { TasksPanel } from './components/TasksPanel';
import { MemoryScreen } from './components/MemoryScreen';
import { ChatScreen } from './components/ChatScreen';
import { SoulScreen } from './components/SoulScreen';
import { WorkspaceHub } from './components/WorkspaceHub';
import { MapsView } from './components/MapsView';
import { SettingsScreen } from './components/SettingsScreen';
import { ConfirmModal } from './components/ConfirmModal';
import { CameraModal } from './components/CameraModal';
import { CalculatorModal } from './components/CalculatorModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { CreatorStudio } from './components/creator/CreatorStudio';
import type { CreatorSectionId, CreatorVoiceCommand } from './types/creator';

const DEFAULT_SOUL: SoulConfig = {
  assistantName: 'J.A.R.V.I.S.',
  addressTitle: 'Sir',
  personalityTone:
    'Intelligent, composed, polite, deeply capable, and subtly witty.',
  languages: ['English', 'Hindi', 'Urdu'],
  customDirectives: '',
};

const DEFAULT_VOICE: VoiceSettings = {
  voiceEngine: 'elevenlabs',
  geminiVoiceName: 'Charon',
  elevenLabsVoiceId: 'uuyFQegRan8rpIQCGu9K',
  stability: 0.5,
  similarity: 0.75,
  speed: 1.0,
  autoSpeak: true,
  wakeWordEnabled: false,
  themeMode: 'dark',
  modelMode: 'fast',
  showLatencyTelemetry: true,
  keepScreenAwake: false,
};

interface HealthSnapshot {
  geminiConfigured: boolean;
  elevenLabsConfigured: boolean;
  elevenLabsVoiceIdValid: boolean;
  mapsConfigured: boolean;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function sanitizeForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitCompleteSentence(buffer: string): {
  sentence: string | null;
  rest: string;
} {
  // Match natural sentence boundary (. ! ? । or newline) avoiding common abbreviations/decimals
  const regex = /([.!?।]+(?:\s+|$)|\n+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(buffer)) !== null) {
    const endIdx = match.index + match[0].length;
    const candidate = buffer.slice(0, endIdx).trim();
    const prevWord = candidate.slice(Math.max(0, candidate.length - 12));
    if (
      /(?:Dr|Mr|Mrs|Ms|St|vs|e\.g|i\.e|J\.A\.R\.V\.I\.S)\.$/.test(prevWord) ||
      /\d\.$/.test(candidate)
    ) {
      continue;
    }
    if (candidate.length >= 18) {
      return {
        sentence: candidate,
        rest: buffer.slice(endIdx),
      };
    }
  }
  if (buffer.length >= 180) {
    const commaIdx = buffer.lastIndexOf(', ', 160);
    if (commaIdx >= 32) {
      return {
        sentence: buffer.slice(0, commaIdx + 1).trim(),
        rest: buffer.slice(commaIdx + 1),
      };
    }
  }
  return { sentence: null, rest: buffer };
}

function playNotificationChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + idx * 0.14;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.35);
    });
  } catch {
    // Ignore audio context lock
  }
}

export default function App() {
  const isOnline = useOnlineStatus();
  const { themeMode, resolvedTheme, setThemeMode } = useTheme();
  const [backendOnline, setBackendOnline] = useState(true);
  const [healthSnapshot, setHealthSnapshot] = useState<HealthSnapshot | null>(
    null
  );
  const [showSplash, setShowSplash] = useState(true);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  // Auth & Firebase State
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Persistent Entities
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [soul, setSoul] = useState<SoulConfig>(DEFAULT_SOUL);
  const [voice, setVoice] = useState<VoiceSettings>(DEFAULT_VOICE);
  const [voiceTuning, setVoiceTuning] = useState<VoiceTuningConfig>(() =>
    loadVoiceTuning()
  );

  // UI & Navigation State
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [modelMode, setModelMode] = useState<ModelMode>('fast');
  const [orbState, setOrbState] = useState<OrbState>('IDLE');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceErrorBanner, setVoiceErrorBanner] = useState<string | null>(null);
  const [followUpTriggerCounter, setFollowUpTriggerCounter] = useState(0);

  // Transcript, Telemetry & Modals
  const [quickInput, setQuickInput] = useState('');
  const [liveUserTranscript, setLiveUserTranscript] = useState('');
  const [liveJarvisTranscript, setLiveJarvisTranscript] = useState('');
  const [lastTelemetry, setLastTelemetry] = useState<LatencyTelemetry | null>(
    null
  );
  const [latencyHistory, setLatencyHistory] = useState<LatencyTelemetry[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [alarms, setAlarms] = useState<AlarmTimer[]>([]);
  const [confirmDialog, setConfirmDialog] =
    useState<ConfirmDialogState | null>(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [calculatorModalOpen, setCalculatorModalOpen] = useState(false);
  const [orbSize, setOrbSize] = useState<number>(240);
  const [creatorVoiceCmd, setCreatorVoiceCmd] =
    useState<CreatorVoiceCommand | null>(null);

  const quickFileRef = useRef<HTMLInputElement | null>(null);
  const galleryFileRef = useRef<HTMLInputElement | null>(null);
  const mutedRef = useRef<boolean>(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const voiceTuningRef = useRef<VoiceTuningConfig>(voiceTuning);
  useEffect(() => {
    voiceTuningRef.current = voiceTuning;
  }, [voiceTuning]);

  // Audio playback & capture refs
  const ttsAudioCtxRef = useRef<AudioContext | null>(null);
  const ttsSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ttsGainRef = useRef<GainNode | null>(null);
  const ttsRafRef = useRef<number>(0);
  const speechSessionIdRef = useRef<number>(0);
  const ttsAbortControllersRef = useRef<Set<AbortController>>(new Set());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const pttStreamRef = useRef<MediaStream | null>(null);
  const pttVadRef = useRef<VoiceActivityHandle | null>(null);
  const pttChunksRef = useRef<Blob[]>([]);
  const pttEosMsRef = useRef<number>(0);

  // Gemini Live WebSocket refs
  const liveWsRef = useRef<WebSocket | null>(null);
  const liveInCtxRef = useRef<AudioContext | null>(null);
  const liveInStreamRef = useRef<MediaStream | null>(null);
  const liveProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveOutCtxRef = useRef<AudioContext | null>(null);
  const liveNextStartRef = useRef<number>(0);
  const liveOutNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const liveInputAccRef = useRef<string>('');
  const liveOutputAccRef = useRef<string>('');

  const recordTelemetry = useCallback((entry: LatencyTelemetry) => {
    setLastTelemetry(entry);
    setLatencyHistory((prev) => [entry, ...prev].slice(0, 15));
  }, []);

  const handleUpdateVoiceTuning = useCallback((next: VoiceTuningConfig) => {
    const saved = saveVoiceTuning(next);
    setVoiceTuning(saved);
    if (ttsGainRef.current) {
      ttsGainRef.current.gain.value = saved.volume;
    }
  }, []);

  // Responsive Orb Sizing (keeps Neural Circuit nodes + SVG conduit + Orb balanced on 360px phones)
  useEffect(() => {
    const updateSize = () => {
      if (window.innerWidth < 400) setOrbSize(164);
      else if (window.innerWidth < 768) setOrbSize(206);
      else setOrbSize(244);
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Backend /api/health probe for real status & connected services
  const probeBackendHealth = useCallback(async () => {
    if (!navigator.onLine) {
      setBackendOnline(false);
      return;
    }
    try {
      const controller = new AbortController();
      const tId = window.setTimeout(() => controller.abort(), 5000);
      const res = await fetch('/api/health', { signal: controller.signal });
      window.clearTimeout(tId);
      setBackendOnline(res.ok);
      if (res.ok) {
        const data = await res.json();
        setHealthSnapshot({
          geminiConfigured: Boolean(data.geminiConfigured),
          elevenLabsConfigured: Boolean(data.elevenLabsConfigured),
          elevenLabsVoiceIdValid: Boolean(data.elevenLabsVoiceIdValid),
          mapsConfigured: Boolean(data.mapsConfigured),
        });
      }
    } catch {
      setBackendOnline(false);
    }
  }, []);

  useEffect(() => {
    probeBackendHealth();
    const timer = window.setInterval(probeBackendHealth, 45000);
    return () => window.clearInterval(timer);
  }, [probeBackendHealth, isOnline]);

  // Google Maps Quota Listener
  useEffect(() => {
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Firebase Auth & Real-Time Subscriptions
  useEffect(() => {
    const unsub = initAuth((u, tok) => {
      setUser(u);
      setAccessToken(tok);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) {
      setMemories([]);
      setTasks([]);
      setNotes([]);
      return;
    }

    const unsubMem = subscribeMemories(user.uid, setMemories, (err) =>
      console.error('Memories sync error:', err)
    );
    const unsubTasks = subscribeTasks(user.uid, setTasks, (err) =>
      console.error('Tasks sync error:', err)
    );
    const unsubMsgs = subscribeMessages(user.uid, setMessages, (err) =>
      console.error('Messages sync error:', err)
    );
    const unsubNotes = subscribeNotes(user.uid, setNotes, (err) =>
      console.error('Notes sync error:', err)
    );

    loadSettings(user.uid)
      .then((res) => {
        if (res.soul) setSoul(res.soul);
        if (res.voice) {
          const merged: VoiceSettings = {
            ...DEFAULT_VOICE,
            ...res.voice,
            themeMode: res.voice.themeMode || themeMode,
            modelMode: res.voice.modelMode || 'fast',
          };
          setVoice(merged);
          if (res.voice.themeMode) setThemeMode(res.voice.themeMode);
          if (merged.modelMode) setModelMode(merged.modelMode);
        }
      })
      .catch((err) => console.error('Settings load error:', err));

    return () => {
      unsubMem();
      unsubTasks();
      unsubMsgs();
      unsubNotes();
    };
  }, [user]);

  // Alarm Ticker + Browser Notification
  useEffect(() => {
    if (alarms.length === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      setAlarms((prev) =>
        prev.map((a) => {
          if (!a.triggered && now >= a.endsAt) {
            playNotificationChime();
            if (
              typeof window !== 'undefined' &&
              'Notification' in window &&
              Notification.permission === 'granted'
            ) {
              try {
                new Notification('J.A.R.V.I.S Alarm', {
                  body: a.label,
                  icon: '/icons/icon-192.png',
                });
              } catch {
                // Ignore
              }
            }
            return { ...a, triggered: true };
          }
          return a;
        })
      );
    }, 1000);
    return () => clearInterval(id);
  }, [alarms.length]);

  const handleGoogleSignIn = async () => {
    try {
      const { user: signedInUser, accessToken: tok } = await googleSignIn();
      setUser(signedInUser);
      setAccessToken(tok);
      setVoiceErrorBanner(null);
    } catch (err) {
      setVoiceErrorBanner(
        err instanceof Error ? err.message : 'Google Sign-In failed.'
      );
    }
  };

  const handleGoogleSignOut = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
  };

  const handleThemeChange = useCallback(
    (nextTheme: ThemeMode) => {
      setThemeMode(nextTheme);
      setVoice((prev) => {
        const updated = { ...prev, themeMode: nextTheme };
        if (user?.emailVerified) {
          saveAssistantSettings(user.uid, soul, updated).catch(() => {});
        }
        return updated;
      });
    },
    [setThemeMode, user, soul]
  );

  const handleModelModeChange = useCallback(
    (nextMode: ModelMode) => {
      setModelMode(nextMode);
      setVoice((prev) => {
        const updated = { ...prev, modelMode: nextMode };
        if (user?.emailVerified) {
          saveAssistantSettings(user.uid, soul, updated).catch(() => {});
        }
        return updated;
      });
    },
    [user, soul]
  );

  const persistMessage = useCallback(
    async (
      role: 'user' | 'assistant',
      text: string,
      modelUsed?: string,
      groundingChunks?: GroundingChunk[],
      telemetry?: LatencyTelemetry
    ) => {
      const clean = text.trim();
      if (!clean) return;
      if (user?.emailVerified) {
        try {
          await addMessage(user.uid, role, clean, undefined, modelUsed);
          if ((groundingChunks && groundingChunks.length > 0) || telemetry) {
            setMessages((prev) => {
              const lastIdx = prev.length - 1;
              if (lastIdx >= 0 && prev[lastIdx].role === role) {
                const updated = [...prev];
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  groundingChunks:
                    groundingChunks && groundingChunks.length > 0
                      ? groundingChunks
                      : updated[lastIdx].groundingChunks,
                  telemetry: telemetry || updated[lastIdx].telemetry,
                };
                return updated;
              }
              return prev;
            });
          }
          return;
        } catch (err) {
          console.error('Persist message error:', err);
        }
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          userId: user?.uid || 'guest',
          role,
          text: clean,
          modelUsed,
          groundingChunks,
          telemetry,
        },
      ]);
    },
    [user]
  );

  // Ensure reusable Web Audio Context & GainNode
  const ensureTtsAudioGraph = useCallback(async () => {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!ttsAudioCtxRef.current || ttsAudioCtxRef.current.state === 'closed') {
      ttsAudioCtxRef.current = new AudioCtx();
    }
    const ctx = ttsAudioCtxRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (!ttsGainRef.current) {
      ttsGainRef.current = ctx.createGain();
      ttsGainRef.current.connect(ctx.destination);
    }
    ttsGainRef.current.gain.value = voiceTuningRef.current.volume;
    return { ctx, gainNode: ttsGainRef.current };
  }, []);

  // Stop any ongoing TTS or Live audio playback cleanly
  const stopSpeaking = useCallback(() => {
    speechSessionIdRef.current += 1;
    ttsAbortControllersRef.current.forEach((ctrl) => {
      try {
        ctrl.abort();
      } catch {
        // Ignore
      }
    });
    ttsAbortControllersRef.current.clear();

    if (ttsRafRef.current) {
      cancelAnimationFrame(ttsRafRef.current);
      ttsRafRef.current = 0;
    }
    try {
      ttsSourceRef.current?.stop();
    } catch {
      // Ignore already stopped
    }
    ttsSourceRef.current = null;

    liveOutNodesRef.current.forEach((node) => {
      try {
        node.stop();
      } catch {
        // Ignore
      }
    });
    liveOutNodesRef.current = [];
    liveNextStartRef.current = 0;
    setAudioLevel(0);
    setOrbState(isLiveActive ? 'LISTENING' : 'IDLE');
  }, [isLiveActive]);

  // Fetch & decode one TTS sentence segment using strictly configured voice engine (ElevenLabs Male by default, NO silent female fallback)
  const fetchTtsSegmentBuffer = useCallback(
    async (
      rawText: string,
      cfg: VoiceSettings,
      tuning: VoiceTuningConfig,
      sessionId: number
    ): Promise<{
      audioBuffer: AudioBuffer;
      ttsFirstChunkMs: number;
      ttsTotalMs: number;
      engineUsed: string;
    }> => {
      const clean = sanitizeForSpeech(rawText);
      if (!clean) {
        throw new Error('Empty speakable text segment.');
      }

      const controller = new AbortController();
      ttsAbortControllersRef.current.add(controller);
      const tReq = performance.now();

      try {
        if (cfg.voiceEngine === 'elevenlabs') {
          const res = await fetch('/api/jarvis/tts/stream', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: clean.slice(0, 2200),
              elevenLabsVoiceId: cfg.elevenLabsVoiceId || 'uuyFQegRan8rpIQCGu9K',
              modelId: tuning.elevenLabsModelId,
              stability: cfg.stability,
              similarity: cfg.similarity,
              speed: cfg.speed,
            }),
          });

          if (!res.ok || !res.body) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(
              (errJson as { error?: string }).error ||
                `ElevenLabs Male Voice failed (HTTP ${res.status}).`
            );
          }

          const reader = res.body.getReader();
          const chunks: Uint8Array[] = [];
          let totalBytes = 0;
          let firstChunkMs: number | undefined;

          while (true) {
            if (speechSessionIdRef.current !== sessionId) {
              throw new DOMException('Speech interrupted', 'AbortError');
            }
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.byteLength > 0) {
              if (firstChunkMs === undefined) {
                firstChunkMs = Math.round(performance.now() - tReq);
              }
              chunks.push(value);
              totalBytes += value.byteLength;
            }
          }

          if (totalBytes === 0) {
            throw new Error('ElevenLabs returned an empty audio stream.');
          }

          const combined = new Uint8Array(totalBytes);
          let offset = 0;
          for (const c of chunks) {
            combined.set(c, offset);
            offset += c.byteLength;
          }

          const { ctx } = await ensureTtsAudioGraph();
          const audioBuffer = await ctx.decodeAudioData(combined.buffer);
          const ttsTotalMs = Math.round(performance.now() - tReq);
          return {
            audioBuffer,
            ttsFirstChunkMs: firstChunkMs ?? ttsTotalMs,
            ttsTotalMs,
            engineUsed: `elevenlabs:${tuning.elevenLabsModelId}`,
          };
        }

        // Optional explicit Gemini Male TTS (Charon / Fenrir / Puck only)
        const allowedMale = ['Charon', 'Fenrir', 'Puck'];
        const safeMale = allowedMale.includes(cfg.geminiVoiceName)
          ? cfg.geminiVoiceName
          : 'Charon';

        const res = await fetch('/api/jarvis/tts', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: clean.slice(0, 2000),
            engine: 'gemini',
            geminiVoiceName: safeMale,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Gemini Male TTS synthesis failed.');
        }

        const { ctx } = await ensureTtsAudioGraph();
        const arrayBuf = base64ToArrayBuffer(data.audioBase64);
        const audioBuffer = await ctx.decodeAudioData(arrayBuf);
        const ttsTotalMs = Math.round(performance.now() - tReq);
        return {
          audioBuffer,
          ttsFirstChunkMs: ttsTotalMs,
          ttsTotalMs,
          engineUsed: `gemini:${safeMale}`,
        };
      } finally {
        ttsAbortControllersRef.current.delete(controller);
      }
    },
    [ensureTtsAudioGraph]
  );

  // Play a decoded AudioBuffer through GainNode + AnalyserNode driving JarvisOrb
  const playDecodedAudioBuffer = useCallback(
    async (
      audioBuffer: AudioBuffer,
      sessionId: number,
      playbackRate = 1.0,
      onAudioStarted?: () => void
    ): Promise<void> => {
      if (speechSessionIdRef.current !== sessionId || mutedRef.current) return;
      const { ctx, gainNode } = await ensureTtsAudioGraph();
      if (speechSessionIdRef.current !== sessionId) return;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      if (playbackRate !== 1.0) {
        source.playbackRate.value = Math.min(1.5, Math.max(0.7, playbackRate));
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const freqData = new Uint8Array(analyser.frequencyBinCount);

      source.connect(analyser);
      analyser.connect(gainNode);
      ttsSourceRef.current = source;

      setOrbState('SPEAKING');

      const tickLevel = () => {
        if (!ttsSourceRef.current || speechSessionIdRef.current !== sessionId)
          return;
        analyser.getByteTimeDomainData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) {
          const v = (freqData[i] - 128) / 128;
          sum += v * v;
        }
        setAudioLevel(Math.min(1, Math.sqrt(sum / freqData.length) * 3.2));
        ttsRafRef.current = requestAnimationFrame(tickLevel);
      };

      await new Promise<void>((resolve) => {
        source.onended = () => {
          if (ttsRafRef.current) {
            cancelAnimationFrame(ttsRafRef.current);
            ttsRafRef.current = 0;
          }
          if (ttsSourceRef.current === source) {
            ttsSourceRef.current = null;
          }
          setAudioLevel(0);
          resolve();
        };
        try {
          source.start(0);
          onAudioStarted?.();
          ttsRafRef.current = requestAnimationFrame(tickLevel);
        } catch {
          resolve();
        }
      });
    },
    [ensureTtsAudioGraph]
  );

  // Single-utterance speak helper (used for greetings, local commands, replay, voice test)
  const speakText = useCallback(
    async (
      text: string,
      overrideVoice?: VoiceSettings,
      overrideTuning?: VoiceTuningConfig
    ): Promise<{
      ttsFirstChunkMs: number;
      ttsMs: number;
      firstAudibleMs: number;
      engineUsed: string;
      error?: string;
    }> => {
      const cfg = overrideVoice || voice;
      const tuning = overrideTuning || voiceTuningRef.current;
      const clean = sanitizeForSpeech(text);
      if (!clean || mutedRef.current) {
        return {
          ttsFirstChunkMs: 0,
          ttsMs: 0,
          firstAudibleMs: 0,
          engineUsed: 'muted',
        };
      }

      stopSpeaking();
      const sessionId = speechSessionIdRef.current;
      setVoiceErrorBanner(null);
      const tStart = performance.now();

      try {
        const seg = await fetchTtsSegmentBuffer(clean, cfg, tuning, sessionId);
        let firstAudibleMs = Math.round(performance.now() - tStart);
        await playDecodedAudioBuffer(
          seg.audioBuffer,
          sessionId,
          cfg.voiceEngine === 'gemini' ? cfg.speed : 1.0,
          () => {
            firstAudibleMs = Math.round(performance.now() - tStart);
          }
        );
        if (speechSessionIdRef.current === sessionId) {
          setOrbState('IDLE');
        }
        return {
          ttsFirstChunkMs: seg.ttsFirstChunkMs,
          ttsMs: seg.ttsTotalMs,
          firstAudibleMs,
          engineUsed: seg.engineUsed,
        };
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          return {
            ttsFirstChunkMs: 0,
            ttsMs: 0,
            firstAudibleMs: 0,
            engineUsed: 'aborted',
          };
        }
        const errMsg =
          err instanceof Error ? err.message : 'ElevenLabs male voice failed.';
        setOrbState('ERROR');
        setAudioLevel(0);
        setVoiceErrorBanner(errMsg);
        window.setTimeout(() => {
          setOrbState((prev) => (prev === 'ERROR' ? 'IDLE' : prev));
        }, 3500);
        return {
          ttsFirstChunkMs: 0,
          ttsMs: Math.round(performance.now() - tStart),
          firstAudibleMs: 0,
          engineUsed: 'error',
          error: errMsg,
        };
      }
    },
    [voice, stopSpeaking, fetchTtsSegmentBuffer, playDecodedAudioBuffer]
  );

  // Shared Device Control Execution Callback Bundle
  const runDeviceTarget = useCallback((target: string, query?: string) => {
    const outcome = executeDeviceControl(target, query, {
      navigate: (sec) => setActiveSection(sec),
      openCamera: () => setCameraModalOpen(true),
      openGalleryPicker: () => galleryFileRef.current?.click(),
      openCalculator: () => setCalculatorModalOpen(true),
      addAlarm: (label, endsAt) =>
        setAlarms((prev) => [
          ...prev,
          {
            id: `alarm_${Date.now()}`,
            label,
            endsAt,
            triggered: false,
          },
        ]),
    });

    if (outcome.requiresConfirmation && outcome.onConfirm) {
      setConfirmDialog({
        open: true,
        title: outcome.confirmTitle || 'Confirm Action',
        description: outcome.confirmDescription || outcome.message,
        confirmLabel: 'Confirm',
        variant: 'primary',
        onConfirm: outcome.onConfirm,
      });
    } else if (!outcome.ok && outcome.method === 'blocked') {
      setVoiceErrorBanner(outcome.message);
    }
    return outcome;
  }, []);

  // Execute tool calls returned by Gemini backend
  const executeToolCalls = useCallback(
    async (
      toolCalls: Array<{ name?: string; args?: Record<string, unknown> }>
    ): Promise<string[]> => {
      const notices: string[] = [];
      for (const tc of toolCalls) {
        const name = tc.name;
        const args = tc.args || {};

        if (name === 'add_task' && typeof args.title === 'string') {
          const prio =
            args.priority === 'low' ||
            args.priority === 'medium' ||
            args.priority === 'high'
              ? args.priority
              : 'medium';
          const due =
            typeof args.dueDate === 'string' ? args.dueDate : undefined;
          if (user?.emailVerified) {
            await addTask(user.uid, args.title, prio, due);
          } else {
            setTasks((prev) => [
              {
                id: `local_task_${Date.now()}`,
                userId: 'guest',
                title: String(args.title),
                completed: false,
                priority: prio,
                dueDate: due,
              },
              ...prev,
            ]);
          }
        } else if (
          name === 'complete_task' &&
          typeof args.titleQuery === 'string'
        ) {
          const q = args.titleQuery.toLowerCase();
          const match = tasks.find(
            (t) => !t.completed && t.title.toLowerCase().includes(q)
          );
          if (match) {
            if (user?.emailVerified) {
              await toggleTask(user.uid, match.id, true);
            } else {
              setTasks((prev) =>
                prev.map((t) =>
                  t.id === match.id ? { ...t, completed: true } : t
                )
              );
            }
          }
        } else if (
          name === 'save_memory' &&
          typeof args.content === 'string'
        ) {
          const raw = args.content;
          if (
            /(sk-[a-zA-Z0-9]{16,}|AIza[0-9A-Za-z_-]{20,}|password\s*[:=])/i.test(
              raw
            )
          ) {
            continue;
          }
          const cat =
            args.category === 'preference' ||
            args.category === 'fact' ||
            args.category === 'project' ||
            args.category === 'contact' ||
            args.category === 'routine'
              ? args.category
              : 'fact';
          const imp =
            args.importance === 'low' ||
            args.importance === 'medium' ||
            args.importance === 'high'
              ? args.importance
              : 'medium';
          if (user?.emailVerified) {
            await addMemory(user.uid, raw, cat, imp);
          }
        } else if (
          name === 'save_note' &&
          typeof args.title === 'string' &&
          typeof args.content === 'string'
        ) {
          if (user?.emailVerified) {
            await addNote(user.uid, args.title, args.content);
          } else {
            setNotes((prev) => [
              {
                id: `local_note_${Date.now()}`,
                userId: 'guest',
                title: String(args.title),
                content: String(args.content),
                pinned: false,
              },
              ...prev,
            ]);
          }
        } else if (
          name === 'set_alarm_timer' &&
          (typeof args.minutes === 'number' || typeof args.label === 'string')
        ) {
          if (typeof args.minutes === 'number') {
            const mins = Math.max(0.1, Math.min(240, args.minutes));
            requestNotificationPermissionIfPossible();
            setAlarms((prev) => [
              ...prev,
              {
                id: `alarm_${Date.now()}`,
                label: String(args.label || 'J.A.R.V.I.S Timer'),
                endsAt: Date.now() + mins * 60 * 1000,
                triggered: false,
              },
            ]);
          } else if (typeof args.label === 'string') {
            const parsed = parseAlarmSchedule(args.label);
            if (parsed) {
              requestNotificationPermissionIfPossible();
              setAlarms((prev) => [
                ...prev,
                {
                  id: `alarm_${Date.now()}`,
                  label: parsed.label,
                  endsAt: parsed.endsAt,
                  triggered: false,
                },
              ]);
            }
          }
        } else if (
          name === 'navigate_panel' &&
          typeof args.panel === 'string'
        ) {
          const allowed: NavSection[] = [
            'dashboard',
            'memory',
            'chat',
            'soul',
            'workspace',
            'creator',
            'maps',
            'settings',
          ];
          if (allowed.includes(args.panel as NavSection)) {
            setActiveSection(args.panel as NavSection);
          }
        } else if (
          name === 'creator_action' &&
          typeof args.action === 'string'
        ) {
          setActiveSection('creator');
          setCreatorVoiceCmd({
            id: Date.now(),
            action: args.action,
            topic: typeof args.topic === 'string' ? args.topic : undefined,
            section:
              typeof args.section === 'string'
                ? (args.section as CreatorSectionId)
                : undefined,
            platform:
              typeof args.platform === 'string' ? args.platform : undefined,
          });
        } else if (
          name === 'open_app_action' &&
          typeof args.target === 'string'
        ) {
          const outcome = runDeviceTarget(
            args.target,
            typeof args.query === 'string' ? args.query : undefined
          );
          if (!outcome.ok && outcome.message) {
            notices.push(outcome.message);
          }
        }
      }
      return notices;
    },
    [user, tasks, runDeviceTarget]
  );

  // Send text/voice command to J.A.R.V.I.S (Local Fast-Path -> Pipelined SSE Streaming AI + Sentence TTS)
  const sendCommandToJarvis = useCallback(
    async (
      text: string,
      opts?: { sttMs?: number; eosDetectionMs?: number; isVoice?: boolean }
    ) => {
      const clean = text.trim();
      if (!clean) return;

      const tCmdStart = performance.now();
      stopSpeaking();
      const speechSessionId = speechSessionIdRef.current;
      const shouldSpeak = voice.autoSpeak && !mutedRef.current;
      const isVoiceTurn = Boolean(opts?.isVoice || opts?.sttMs !== undefined);

      setIsProcessing(true);
      setOrbState('THINKING');
      setLiveUserTranscript(clean);
      setVoiceErrorBanner(null);

      // Non-blocking message persistence so AI streaming starts immediately
      void persistMessage('user', clean);

      // Step 1: <10ms Local Deterministic NLU Fast-Path
      const tRouteStart = performance.now();
      const localAction = routeLocalCommand(clean, {
        addressTitle: soul.addressTitle || 'Sir',
        modelMode,
        voiceEngine: voice.voiceEngine,
      });
      const routeMs = Math.max(1, Math.round(performance.now() - tRouteStart));

      if (localAction) {
        try {
          setOrbState('EXECUTING');
          const tExecStart = performance.now();
          let replyText = localAction.reply || '';

          if (localAction.type === 'set_theme') {
            handleThemeChange(localAction.theme);
          } else if (localAction.type === 'set_model_mode') {
            handleModelModeChange(localAction.mode);
          } else if (localAction.type === 'stop_hands_free') {
            setVoice((prev) => {
              const next = { ...prev, wakeWordEnabled: false };
              if (user?.emailVerified) {
                saveAssistantSettings(user.uid, soul, next).catch(() => {});
              }
              return next;
            });
          } else if (localAction.type === 'navigate') {
            setActiveSection(localAction.panel);
          } else if (localAction.type === 'device_action') {
            const outcome = runDeviceTarget(
              localAction.target,
              localAction.query
            );
            replyText = outcome.message;
          }

          const toolExecMs = Math.round(performance.now() - tExecStart);
          setLiveJarvisTranscript(replyText);

          let ttsFirstChunkMs: number | undefined;
          let ttsMs: number | undefined;
          let firstAudibleMs: number | undefined;
          let engineUsed = 'none';

          if (shouldSpeak && replyText) {
            const ttsOutcome = await speakText(replyText);
            ttsFirstChunkMs = ttsOutcome.ttsFirstChunkMs || undefined;
            ttsMs = ttsOutcome.ttsMs || undefined;
            firstAudibleMs = ttsOutcome.firstAudibleMs
              ? Math.round(
                  (opts?.eosDetectionMs || 0) +
                    (opts?.sttMs || 0) +
                    ttsOutcome.firstAudibleMs
                )
              : undefined;
            engineUsed = ttsOutcome.engineUsed;
            if (isVoiceTurn && voice.wakeWordEnabled && localAction.type !== 'stop_hands_free') {
              setFollowUpTriggerCounter((c) => c + 1);
            }
          } else {
            setOrbState('IDLE');
          }

          const telemetry: LatencyTelemetry = {
            eosDetectionMs: opts?.eosDetectionMs,
            sttMs: opts?.sttMs,
            routeMs,
            toolExecMs,
            ttsFirstChunkMs,
            ttsMs,
            firstAudibleMs,
            totalMs: Math.round(performance.now() - tCmdStart),
            path: 'local_fast_path',
            modelUsed: 'local-nlu-router',
            voiceEngineUsed: engineUsed,
            timestamp: new Date().toISOString(),
            queryPreview: clean.slice(0, 48),
          };
          recordTelemetry(telemetry);
          void persistMessage(
            'assistant',
            replyText,
            'local-nlu-router',
            undefined,
            telemetry
          );
          return;
        } finally {
          setIsProcessing(false);
        }
      }

      // Check offline state
      if (!navigator.onLine) {
        setBackendOnline(false);
        setOrbState('DISCONNECTED');
        const offlineMsg =
          'No active internet connection. Please check Wi-Fi or mobile data and try again.';
        setVoiceErrorBanner(offlineMsg);
        setLiveJarvisTranscript(offlineMsg);
        setIsProcessing(false);
        return;
      }

      // Step 2: Live SSE Streaming Gemini + Pipelined Sentence-by-Sentence ElevenLabs TTS
      const workspaceSummary = [
        tasks.length > 0
          ? `Current Tasks (${tasks.filter((t) => !t.completed).length} remaining): ${tasks
              .slice(0, 8)
              .map((t) => `${t.completed ? '[Done]' : '[Todo]'} ${t.title}`)
              .join('; ')}`
          : '',
        notes.length > 0
          ? `Recent Notes: ${notes
              .slice(0, 4)
              .map((n) => `${n.title}: ${n.content.slice(0, 100)}`)
              .join(' | ')}`
          : '',
        accessToken
          ? 'Google Workspace OAuth token is active; user can manage Gmail, Calendar, Drive, Tasks, Meet, and Contacts inside the Workspace tab.'
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      // Concurrent sentence TTS prefetch + sequential audio playback queue
      const pendingAudioPromises: Array<
        Promise<{
          audioBuffer: AudioBuffer;
          ttsFirstChunkMs: number;
          ttsTotalMs: number;
          engineUsed: string;
        }>
      > = [];
      let playbackChain: Promise<void> = Promise.resolve();
      let firstTtsChunkRecorded: number | undefined;
      let totalTtsDurationMs = 0;
      let firstAudibleAtCmdMs: number | undefined;
      let ttsEngineUsed = 'none';
      let ttsErrorEncountered: string | null = null;
      let sentenceBuffer = '';
      const activeTuning = voiceTuningRef.current;

      const enqueueSentenceForSpeech = (sentenceText: string) => {
        if (
          !shouldSpeak ||
          ttsErrorEncountered ||
          speechSessionIdRef.current !== speechSessionId
        ) {
          return;
        }
        const cleaned = sanitizeForSpeech(sentenceText);
        if (!cleaned) return;

        // Kick off TTS stream fetch immediately in parallel with ongoing LLM streaming
        const segPromise = fetchTtsSegmentBuffer(
          cleaned,
          voice,
          activeTuning,
          speechSessionId
        );
        pendingAudioPromises.push(segPromise);

        playbackChain = playbackChain.then(async () => {
          if (
            speechSessionIdRef.current !== speechSessionId ||
            mutedRef.current ||
            ttsErrorEncountered
          ) {
            return;
          }
          try {
            const seg = await segPromise;
            if (firstTtsChunkRecorded === undefined) {
              firstTtsChunkRecorded = seg.ttsFirstChunkMs;
            }
            totalTtsDurationMs += seg.ttsTotalMs;
            ttsEngineUsed = seg.engineUsed;

            await playDecodedAudioBuffer(
              seg.audioBuffer,
              speechSessionId,
              voice.voiceEngine === 'gemini' ? voice.speed : 1.0,
              () => {
                if (firstAudibleAtCmdMs === undefined) {
                  firstAudibleAtCmdMs = Math.round(performance.now() - tCmdStart);
                }
              }
            );
          } catch (ttsErr) {
            if ((ttsErr as { name?: string })?.name === 'AbortError') return;
            const msg =
              ttsErr instanceof Error
                ? ttsErr.message
                : 'ElevenLabs voice playback failed.';
            ttsErrorEncountered = msg;
            setVoiceErrorBanner(msg);
          }
        });
      };

      try {
        setLiveJarvisTranscript('');
        const tAiStart = performance.now();
        const res = await fetch('/api/jarvis/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: clean,
            history: messages.slice(-10).map((m) => ({
              role: m.role,
              text: m.text,
            })),
            modelMode,
            isVoice: isVoiceTurn,
            soulConfig: soul,
            voiceEngine: voice.voiceEngine,
            memories: memories.slice(0, 14).map((m) => ({
              content: m.content,
              category: m.category,
            })),
            location: userLocation,
            workspaceSummary,
          }),
        });

        setBackendOnline(true);

        if (!res.ok || !res.body) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(
            (errJson as { error?: string }).error ||
              'J.A.R.V.I.S streaming request failed.'
          );
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamedText = '';
        let aiFirstTokenMs: number | undefined;
        let donePayload: {
          reply?: string;
          modelUsed?: string;
          toolCalls?: Array<{ name?: string; args?: Record<string, unknown> }>;
          groundingChunks?: GroundingChunk[];
          serverTimingMs?: { aiFirstTokenMs?: number; aiTotalMs?: number };
        } | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';

          for (const frame of frames) {
            const lines = frame.split('\n');
            let evType = 'message';
            let dataStr = '';
            for (const line of lines) {
              if (line.startsWith('event:')) evType = line.slice(6).trim();
              else if (line.startsWith('data:'))
                dataStr += line.slice(5).trim();
            }
            if (!dataStr) continue;
            const parsed = JSON.parse(dataStr);
            if (evType === 'delta' && typeof parsed.text === 'string') {
              if (aiFirstTokenMs === undefined) {
                aiFirstTokenMs = Math.round(performance.now() - tAiStart);
              }
              streamedText += parsed.text;
              setLiveJarvisTranscript(streamedText);

              if (shouldSpeak) {
                sentenceBuffer += parsed.text;
                let extracted = splitCompleteSentence(sentenceBuffer);
                while (extracted.sentence) {
                  enqueueSentenceForSpeech(extracted.sentence);
                  sentenceBuffer = extracted.rest;
                  extracted = splitCompleteSentence(sentenceBuffer);
                }
              }
            } else if (evType === 'done') {
              donePayload = parsed;
            } else if (evType === 'error') {
              throw new Error(parsed.error || 'Streaming AI failure.');
            }
          }
        }

        const aiTotalMs = Math.round(performance.now() - tAiStart);
        let reply = String(donePayload?.reply || streamedText || '').trim();
        let toolExecMs = 0;

        if (
          donePayload?.toolCalls &&
          Array.isArray(donePayload.toolCalls) &&
          donePayload.toolCalls.length > 0
        ) {
          setOrbState('EXECUTING');
          const tToolStart = performance.now();
          const toolNotices = await executeToolCalls(donePayload.toolCalls);
          toolExecMs = Math.round(performance.now() - tToolStart);
          if (toolNotices.length > 0) {
            reply = reply
              ? `${reply}\n\n${toolNotices.join(' ')}`
              : toolNotices.join(' ');
            if (shouldSpeak) {
              sentenceBuffer = `${sentenceBuffer} ${toolNotices.join(' ')}`.trim();
            }
          }
        }

        setLiveJarvisTranscript(reply);

        // Flush remaining tail sentence to TTS queue immediately
        if (shouldSpeak && sentenceBuffer.trim()) {
          enqueueSentenceForSpeech(sentenceBuffer.trim());
          sentenceBuffer = '';
        } else if (shouldSpeak && pendingAudioPromises.length === 0 && reply) {
          enqueueSentenceForSpeech(reply);
        }

        setIsProcessing(false);

        if (shouldSpeak && pendingAudioPromises.length > 0) {
          await playbackChain;
          if (speechSessionIdRef.current === speechSessionId) {
            if (ttsErrorEncountered) {
              setOrbState('ERROR');
              window.setTimeout(() => {
                setOrbState((prev) => (prev === 'ERROR' ? 'IDLE' : prev));
              }, 3500);
            } else {
              setOrbState('IDLE');
              if (isVoiceTurn && voice.wakeWordEnabled && !mutedRef.current) {
                setFollowUpTriggerCounter((c) => c + 1);
              }
            }
          }
        } else {
          setOrbState('IDLE');
          if (isVoiceTurn && voice.wakeWordEnabled) {
            setFollowUpTriggerCounter((c) => c + 1);
          }
        }

        const telemetry: LatencyTelemetry = {
          eosDetectionMs: opts?.eosDetectionMs,
          sttMs: opts?.sttMs,
          routeMs,
          aiFirstTokenMs:
            aiFirstTokenMs ?? donePayload?.serverTimingMs?.aiFirstTokenMs,
          aiTotalMs,
          toolExecMs: toolExecMs || undefined,
          ttsFirstChunkMs: firstTtsChunkRecorded,
          ttsMs: totalTtsDurationMs || undefined,
          firstAudibleMs: firstAudibleAtCmdMs,
          totalMs: Math.round(performance.now() - tCmdStart),
          path: 'streaming_ai',
          modelUsed: donePayload?.modelUsed,
          voiceEngineUsed: ttsEngineUsed,
          timestamp: new Date().toISOString(),
          queryPreview: clean.slice(0, 48),
        };
        recordTelemetry(telemetry);

        void persistMessage(
          'assistant',
          reply,
          donePayload?.modelUsed,
          donePayload?.groundingChunks,
          telemetry
        );
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : 'Unable to reach J.A.R.V.I.S.';
        const isNetworkDrop =
          !navigator.onLine || /failed to fetch|networkerror/i.test(errMsg);
        if (isNetworkDrop) {
          setBackendOnline(false);
          setOrbState('DISCONNECTED');
        } else {
          setOrbState('ERROR');
          setTimeout(() => {
            setOrbState((prev) => (prev === 'ERROR' ? 'IDLE' : prev));
          }, 3500);
        }
        setVoiceErrorBanner(errMsg);
        setLiveJarvisTranscript(`System Alert: ${errMsg}`);
        setIsProcessing(false);
      }
    },
    [
      stopSpeaking,
      voice,
      persistMessage,
      soul,
      modelMode,
      user,
      handleThemeChange,
      handleModelModeChange,
      runDeviceTarget,
      speakText,
      recordTelemetry,
      tasks,
      notes,
      accessToken,
      messages,
      memories,
      userLocation,
      fetchTtsSegmentBuffer,
      playDecodedAudioBuffer,
      executeToolCalls,
    ]
  );

  // Continuous Hands-Free Wake Word ("Hey Jarvis") + Follow-Up Loop
  const handsFreePaused =
    orbState === 'SPEAKING' ||
    orbState === 'THINKING' ||
    orbState === 'EXECUTING' ||
    isRecordingAudio ||
    isLiveActive ||
    isProcessing;

  const handsFreeState = useHandsFreeVoice({
    enabled: voice.wakeWordEnabled,
    paused: handsFreePaused,
    keepScreenAwake: Boolean(voice.keepScreenAwake),
    vadSilenceMs: voiceTuning.vadSilenceMs,
    followUpWindowSec: voiceTuning.followUpWindowSec,
    followUpTriggerCounter,
    onInterimHeard: (interim) => {
      setLiveUserTranscript(interim);
    },
    onCommand: (cmdText, timing: HandsFreeTimingMeta) => {
      void sendCommandToJarvis(cmdText, {
        sttMs: timing.sttMs,
        eosDetectionMs: timing.eosDetectionMs,
        isVoice: true,
      });
    },
    onStopListeningRequested: () => {
      const next = { ...voice, wakeWordEnabled: false };
      setVoice(next);
      if (user?.emailVerified) {
        saveAssistantSettings(user.uid, soul, next).catch(() => {});
      }
      const msg = `Standing down continuous voice listening, ${soul.addressTitle || 'Sir'}.`;
      setLiveJarvisTranscript(msg);
      if (voice.autoSpeak && !mutedRef.current) {
        void speakText(msg);
      }
    },
    onWakeAcknowledged: () => {
      setOrbState('LISTENING');
    },
  });

  // Sync Orb visual state with hands-free active command / follow-up listening
  const prevHandsFreeStatusRef = useRef(handsFreeState.status);
  useEffect(() => {
    const prev = prevHandsFreeStatusRef.current;
    prevHandsFreeStatusRef.current = handsFreeState.status;

    if (
      (handsFreeState.status === 'listening_command' ||
        handsFreeState.status === 'follow_up') &&
      !isLiveActive &&
      !isRecordingAudio &&
      !isProcessing &&
      orbState === 'IDLE'
    ) {
      setOrbState('LISTENING');
      return;
    }

    if (
      (prev === 'listening_command' || prev === 'follow_up') &&
      handsFreeState.status !== 'listening_command' &&
      handsFreeState.status !== 'follow_up' &&
      orbState === 'LISTENING' &&
      !isLiveActive &&
      !isRecordingAudio &&
      !isProcessing
    ) {
      setOrbState('IDLE');
    }
  }, [
    handsFreeState.status,
    orbState,
    isLiveActive,
    isRecordingAudio,
    isProcessing,
  ]);

  // Optional Voice Barge-In during TTS playback when Hands-Free + Barge-In are enabled
  useEffect(() => {
    if (
      orbState !== 'SPEAKING' ||
      !voice.wakeWordEnabled ||
      !voiceTuning.bargeInEnabled ||
      isLiveActive ||
      isRecordingAudio
    ) {
      return;
    }

    let cancelled = false;
    let bargeStream: MediaStream | null = null;
    let bargeVad: VoiceActivityHandle | null = null;

    navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        bargeStream = stream;
        let sustainedFrames = 0;
        bargeVad = createVoiceActivityMonitor({
          stream,
          silenceThresholdMs: 700,
          noSpeechTimeoutMs: 0,
          onLevel: (lvl, isVoiceFrame) => {
            if (isVoiceFrame && lvl > 0.34) {
              sustainedFrames++;
              if (sustainedFrames >= 6) {
                bargeVad?.stop();
                stopSpeaking();
                setOrbState('LISTENING');
              }
            } else {
              sustainedFrames = Math.max(0, sustainedFrames - 1);
            }
          },
        });
      })
      .catch(() => {
        // Ignore mic contention
      });

    return () => {
      cancelled = true;
      bargeVad?.stop();
      bargeStream?.getTracks().forEach((t) => t.stop());
    };
  }, [
    orbState,
    voice.wakeWordEnabled,
    voiceTuning.bargeInEnabled,
    isLiveActive,
    isRecordingAudio,
    stopSpeaking,
  ]);

  // Media (Photo / Video) Multimodal Analysis
  const handleAnalyzeMedia = useCallback(
    async (file: File, prompt: string) => {
      if (file.size > 14 * 1024 * 1024) {
        setVoiceErrorBanner('Media file must be under 14 MB.');
        return;
      }
      setIsProcessing(true);
      setOrbState('THINKING');
      setVoiceErrorBanner(null);
      void persistMessage('user', `[Uploaded ${file.type}] ${prompt}`);

      try {
        const buf = await file.arrayBuffer();
        const dataBase64 = arrayBufferToBase64(buf);
        const res = await fetch('/api/jarvis/analyze-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mimeType: file.type || 'image/jpeg',
            dataBase64,
            prompt,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Media analysis failed.');
        setLiveJarvisTranscript(data.analysis);
        void persistMessage('assistant', data.analysis, data.modelUsed);
        if (voice.autoSpeak && !mutedRef.current) {
          await speakText(data.analysis);
        } else {
          setOrbState('IDLE');
        }
      } catch (err) {
        setOrbState('ERROR');
        setVoiceErrorBanner(
          err instanceof Error ? err.message : 'Media analysis failed.'
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [persistMessage, voice.autoSpeak, speakText]
  );

  // Push-to-Talk Audio Recording with Real-Time VAD Auto-Stop -> Cached STT
  const stopAudioRecord = useCallback((eosMs?: number) => {
    if (typeof eosMs === 'number') {
      pttEosMsRef.current = eosMs;
    }
    pttVadRef.current?.stop();
    pttVadRef.current = null;
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
    pttStreamRef.current?.getTracks().forEach((t) => t.stop());
    pttStreamRef.current = null;
    setIsRecordingAudio(false);
    setAudioLevel(0);
  }, []);

  const startAudioRecord = useCallback(async () => {
    if (isRecordingAudio || isProcessing) return;
    stopSpeaking();
    setVoiceErrorBanner(null);
    pttEosMsRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      pttStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      pttChunksRef.current = [];
      let discardSilentCapture = false;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) pttChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        if (discardSilentCapture) {
          setOrbState('IDLE');
          setIsProcessing(false);
          return;
        }
        const blob = new Blob(pttChunksRef.current, { type: mimeType });
        if (blob.size < 400) {
          setOrbState('IDLE');
          return;
        }
        setOrbState('THINKING');
        setIsProcessing(true);
        const tSttStart = performance.now();
        try {
          const buf = await blob.arrayBuffer();
          const dataBase64 = arrayBufferToBase64(buf);
          const res = await fetch('/api/jarvis/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mimeType: mimeType.split(';')[0],
              dataBase64,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Transcription failed.');
          const transcript = String(data.transcript || '').trim();
          const sttMs = Math.round(performance.now() - tSttStart);
          if (!transcript) {
            setOrbState('IDLE');
            setIsProcessing(false);
            return;
          }
          await sendCommandToJarvis(transcript, {
            sttMs,
            eosDetectionMs: pttEosMsRef.current || undefined,
            isVoice: true,
          });
        } catch (err) {
          setOrbState('ERROR');
          setIsProcessing(false);
          setVoiceErrorBanner(
            err instanceof Error ? err.message : 'Voice transcription failed.'
          );
        }
      };

      // Attach real-time VAD monitor for 500–900ms automatic end-of-speech stop
      pttVadRef.current = createVoiceActivityMonitor({
        stream,
        silenceThresholdMs: voiceTuningRef.current.vadSilenceMs,
        noSpeechTimeoutMs: 6500,
        onLevel: (lvl) => setAudioLevel(lvl),
        onEndOfSpeech: (eosMs, hadSpeech) => {
          if (!hadSpeech) {
            discardSilentCapture = true;
          }
          stopAudioRecord(eosMs);
        },
      });

      mediaRecorderRef.current = recorder;
      recorder.start(150);
      setIsRecordingAudio(true);
      setOrbState('LISTENING');
    } catch (err) {
      setOrbState('ERROR');
      setVoiceErrorBanner(
        err instanceof Error
          ? err.message
          : 'Microphone access denied or unavailable.'
      );
    }
  }, [
    isRecordingAudio,
    isProcessing,
    stopSpeaking,
    stopAudioRecord,
    sendCommandToJarvis,
  ]);

  // Gemini Live API Two-Way Real-Time Audio Session (/ws/live)
  const stopLiveSession = useCallback(() => {
    try {
      liveProcessorRef.current?.disconnect();
    } catch {
      // Ignore
    }
    liveProcessorRef.current = null;
    liveInStreamRef.current?.getTracks().forEach((t) => t.stop());
    liveInStreamRef.current = null;

    if (liveInCtxRef.current && liveInCtxRef.current.state !== 'closed') {
      liveInCtxRef.current.close().catch(() => {});
    }
    liveInCtxRef.current = null;

    liveOutNodesRef.current.forEach((n) => {
      try {
        n.stop();
      } catch {
        // Ignore
      }
    });
    liveOutNodesRef.current = [];
    if (liveOutCtxRef.current && liveOutCtxRef.current.state !== 'closed') {
      liveOutCtxRef.current.close().catch(() => {});
    }
    liveOutCtxRef.current = null;

    if (liveWsRef.current) {
      try {
        liveWsRef.current.close();
      } catch {
        // Ignore
      }
      liveWsRef.current = null;
    }

    setIsLiveActive(false);
    setAudioLevel(0);
    setOrbState('IDLE');
  }, []);

  const startLiveSession = useCallback(async () => {
    if (isLiveActive) {
      stopLiveSession();
      return;
    }
    stopSpeaking();
    setVoiceErrorBanner(null);
    setOrbState('THINKING');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      liveInStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const inCtx = new AudioCtx({ sampleRate: 16000 });
      const outCtx = new AudioCtx({ sampleRate: 24000 });
      liveInCtxRef.current = inCtx;
      liveOutCtxRef.current = outCtx;
      liveNextStartRef.current = outCtx.currentTime;

      const maleLiveVoice = ['Charon', 'Fenrir', 'Puck'].includes(
        voice.geminiVoiceName
      )
        ? voice.geminiVoiceName
        : 'Charon';

      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${window.location.host}/ws/live?voice=${encodeURIComponent(
        maleLiveVoice
      )}&name=${encodeURIComponent(soul.assistantName)}&title=${encodeURIComponent(
        soul.addressTitle
      )}`;

      const ws = new WebSocket(wsUrl);
      liveWsRef.current = ws;

      ws.onopen = () => {
        setIsLiveActive(true);
        liveInputAccRef.current = '';
        liveOutputAccRef.current = '';

        const src = inCtx.createMediaStreamSource(stream);
        const proc = inCtx.createScriptProcessor(4096, 1, 1);
        liveProcessorRef.current = proc;

        proc.onaudioprocess = (ev) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const floatSamples = ev.inputBuffer.getChannelData(0);
          let sum = 0;
          const pcm16 = new Int16Array(floatSamples.length);
          for (let i = 0; i < floatSamples.length; i++) {
            const s = Math.max(-1, Math.min(1, floatSamples[i]));
            sum += s * s;
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          const rms = Math.min(1, Math.sqrt(sum / floatSamples.length) * 4);
          if (liveOutNodesRef.current.length === 0) {
            setAudioLevel(rms);
          }
          ws.send(JSON.stringify({ audio: arrayBufferToBase64(pcm16.buffer) }));
        };

        src.connect(proc);
        proc.connect(inCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ready') {
            setOrbState('LISTENING');
          } else if (msg.type === 'inputTranscript' && msg.text) {
            liveInputAccRef.current += msg.text;
            setLiveUserTranscript(liveInputAccRef.current.trim());
          } else if (msg.type === 'outputTranscript' && msg.text) {
            liveOutputAccRef.current += msg.text;
            setLiveJarvisTranscript(liveOutputAccRef.current.trim());
          } else if (msg.type === 'audio' && msg.data && !mutedRef.current) {
            setOrbState('SPEAKING');
            const raw = base64ToArrayBuffer(msg.data);
            const pcm16 = new Int16Array(raw);
            const float32 = new Float32Array(pcm16.length);
            let sum = 0;
            for (let i = 0; i < pcm16.length; i++) {
              const v = pcm16[i] / 32768;
              float32[i] = v;
              sum += v * v;
            }
            setAudioLevel(Math.min(1, Math.sqrt(sum / pcm16.length) * 3.5));

            const audioBuf = outCtx.createBuffer(1, float32.length, 24000);
            audioBuf.getChannelData(0).set(float32);

            const node = outCtx.createBufferSource();
            node.buffer = audioBuf;
            const liveGain = outCtx.createGain();
            liveGain.gain.value = voiceTuningRef.current.volume;
            node.connect(liveGain);
            liveGain.connect(outCtx.destination);

            const startAt = Math.max(
              outCtx.currentTime,
              liveNextStartRef.current
            );
            node.start(startAt);
            liveNextStartRef.current = startAt + audioBuf.duration;
            liveOutNodesRef.current.push(node);

            node.onended = () => {
              liveOutNodesRef.current = liveOutNodesRef.current.filter(
                (n) => n !== node
              );
              if (liveOutNodesRef.current.length === 0) {
                setOrbState('LISTENING');
                setAudioLevel(0);
              }
            };
          } else if (msg.type === 'interrupted') {
            liveOutNodesRef.current.forEach((n) => {
              try {
                n.stop();
              } catch {
                // Ignore
              }
            });
            liveOutNodesRef.current = [];
            liveNextStartRef.current = outCtx.currentTime;
            setOrbState('LISTENING');
            setAudioLevel(0);
          } else if (msg.type === 'turnComplete') {
            const uTxt = liveInputAccRef.current.trim();
            const jTxt = liveOutputAccRef.current.trim();
            if (uTxt) void persistMessage('user', uTxt, 'gemini-3.8-live');
            if (jTxt) void persistMessage('assistant', jTxt, 'gemini-3.8-live');
            liveInputAccRef.current = '';
            liveOutputAccRef.current = '';
          } else if (msg.type === 'error') {
            setVoiceErrorBanner(msg.message || 'Live voice stream error.');
            stopLiveSession();
            setOrbState('ERROR');
          }
        } catch {
          // Ignore malformed message
        }
      };

      ws.onerror = () => {
        setVoiceErrorBanner('Live Voice WebSocket connection encountered an error.');
        stopLiveSession();
        setOrbState('ERROR');
      };

      ws.onclose = () => {
        stopLiveSession();
      };
    } catch (err) {
      setVoiceErrorBanner(
        err instanceof Error
          ? err.message
          : 'Failed to start Live Voice session.'
      );
      stopLiveSession();
      setOrbState('ERROR');
    }
  }, [
    isLiveActive,
    stopLiveSession,
    stopSpeaking,
    voice.geminiVoiceName,
    soul.assistantName,
    soul.addressTitle,
    persistMessage,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLiveSession();
      stopAudioRecord();
      stopSpeaking();
    };
  }, [stopLiveSession, stopAudioRecord, stopSpeaking]);

  const handleOrbTap = () => {
    if (isLiveActive) {
      stopLiveSession();
    } else if (isRecordingAudio) {
      stopAudioRecord();
    } else if (orbState === 'SPEAKING') {
      stopSpeaking();
    } else {
      startAudioRecord();
    }
  };

  const handleRequestClearHistory = () => {
    setConfirmDialog({
      open: true,
      title: 'Clear Conversation History',
      description:
        'This will permanently purge your synced J.A.R.V.I.S transcript history. Stored memories and tasks will remain intact.',
      confirmLabel: 'Purge History',
      variant: 'danger',
      onConfirm: async () => {
        if (user?.emailVerified) {
          await clearMessages(user.uid);
        }
        setMessages([]);
        setLiveUserTranscript('');
        setLiveJarvisTranscript('');
        setLastTelemetry(null);
      },
    });
  };

  const effectiveOrbState: OrbState =
    !isOnline || !backendOnline ? 'DISCONNECTED' : orbState;

  const orbListeningMode =
    effectiveOrbState === 'LISTENING' && !isLiveActive && !isRecordingAudio
      ? handsFreeState.status === 'follow_up'
        ? 'follow_up'
        : handsFreeState.status === 'listening_command'
          ? 'wake_word'
          : 'manual'
      : 'manual';

  const latestUserMsg = useMemo(() => {
    if (liveUserTranscript) return liveUserTranscript;
    const found = [...messages].reverse().find((m) => m.role === 'user');
    return found?.text || 'Tap Push-to-Talk or say "Hey Jarvis"...';
  }, [messages, liveUserTranscript]);

  const latestJarvisMsg = useMemo(() => {
    if (liveJarvisTranscript) return liveJarvisTranscript;
    const found = [...messages].reverse().find((m) => m.role === 'assistant');
    return (
      found?.text ||
      `Systems online, ${soul.addressTitle || 'Sir'}. Ready for voice or text command.`
    );
  }, [messages, liveJarvisTranscript, soul.addressTitle]);

  const desktopNavItems: Array<{
    id: NavSection;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'dashboard',
      label: 'HOME HUD',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    { id: 'memory', label: 'MEMORY', icon: <Brain className="w-4 h-4" /> },
    { id: 'chat', label: 'CHAT', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'soul', label: 'SOUL', icon: <Sparkles className="w-4 h-4" /> },
    {
      id: 'workspace',
      label: 'WORKSPACE',
      icon: <FolderKanban className="w-4 h-4" />,
    },
    {
      id: 'creator',
      label: 'CREATOR STUDIO',
      icon: <Clapperboard className="w-4 h-4" />,
    },
    { id: 'maps', label: 'MAPS', icon: <Compass className="w-4 h-4" /> },
    {
      id: 'settings',
      label: 'SETTINGS',
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  // Clean 6-item mobile bottom navigation fitting 360px phones without horizontal scrolling
  const mobileBottomNav: Array<{
    id: NavSection;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'dashboard', label: 'HOME', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'memory', label: 'MEMORY', icon: <Brain className="w-4 h-4" /> },
    { id: 'chat', label: 'CHAT', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'workspace', label: 'WORKSPACE', icon: <FolderKanban className="w-4 h-4" /> },
    { id: 'creator', label: 'STUDIO', icon: <Clapperboard className="w-4 h-4" /> },
    { id: 'settings', label: 'SETTINGS', icon: <Settings className="w-4 h-4" /> },
  ];

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim() || isProcessing) return;
    const cmd = quickInput.trim();
    setQuickInput('');
    if (isLiveActive && liveWsRef.current?.readyState === WebSocket.OPEN) {
      liveWsRef.current.send(JSON.stringify({ text: cmd }));
      setLiveUserTranscript(cmd);
      return;
    }
    await sendCommandToJarvis(cmd, { isVoice: false });
  };

  const handleQuickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await handleAnalyzeMedia(
      file,
      quickInput.trim() || 'Analyze this media for key details.'
    );
    setQuickInput('');
  };

  const activeVoiceLabel =
    voice.voiceEngine === 'elevenlabs'
      ? `ElevenLabs Male (${voiceTuning.elevenLabsModelId.replace('eleven_', '')})`
      : `Gemini Male (${voice.geminiVoiceName})`;

  return (
    <div className="min-h-dvh bg-[#F4F7FB] dark:bg-[#04070D] text-slate-900 dark:text-slate-100 flex flex-col pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0 transition-colors">
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {/* Hidden Gallery Picker */}
      <input
        ref={galleryFileRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleQuickFile}
        className="hidden"
      />

      {/* Google Maps Quota Banner */}
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs text-center sticky top-0 z-50">
          <span>
            Google Maps Platform quota reached. Visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold"
            >
              maps developer site
            </a>{' '}
            to update your account.
          </span>
        </div>
      )}

      {/* Offline Banner */}
      {(!isOnline || !backendOnline) && (
        <div className="bg-rose-50 dark:bg-rose-950/90 border-b border-rose-300 dark:border-rose-500/40 px-4 py-2 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>
            {!isOnline
              ? 'Offline mode active — cloud AI queries and Workspace sync will resume once connected.'
              : 'Server connection interrupted — attempting to reconnect to J.A.R.V.I.S backend.'}
          </span>
        </div>
      )}

      {/* Futuristic Top HUD Header */}
      <header className="sticky top-0 z-40 pt-[env(safe-area-inset-top)] border-b border-slate-200 dark:border-cyan-500/20 bg-white/90 dark:bg-[#04070D]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setActiveSection('dashboard')}
            className="flex items-center gap-2.5 text-left min-w-0"
          >
            <div className="relative w-8 h-8 rounded-xl border border-cyan-500/50 bg-black p-0.5 shadow-[0_0_16px_rgba(34,211,238,0.28)] shrink-0">
              <img
                src="/src/assets/images/jarvis_emblem_1795542174982.jpg"
                alt="J.A.R.V.I.S"
                referrerPolicy="no-referrer"
                className="w-full h-full rounded-lg object-contain"
              />
            </div>
            <span className="font-display text-sm sm:text-lg font-bold tracking-[0.16em] text-cyan-700 dark:text-cyan-300 whitespace-nowrap shrink-0">
              {soul.assistantName || 'J.A.R.V.I.S'}
            </span>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Real Connection Status */}
            <div
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono-hud ${
                isOnline && backendOnline
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isOnline && backendOnline
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-rose-500'
                }`}
              />
              <span>{isOnline && backendOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </div>

            {/* Inline Header Theme Selector (Dark / Light / System) */}
            <div
              role="group"
              aria-label="Theme mode"
              className="inline-flex items-center p-0.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#08101E]"
            >
              {(
                [
                  { id: 'dark', label: 'Dark', icon: <Moon className="w-3.5 h-3.5" /> },
                  { id: 'light', label: 'Light', icon: <Sun className="w-3.5 h-3.5" /> },
                  { id: 'system', label: 'Auto', icon: <Monitor className="w-3.5 h-3.5" /> },
                ] as const
              ).map((t) => {
                const active = themeMode === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleThemeChange(t.id)}
                    aria-label={`Switch theme to ${t.label}`}
                    title={`Theme: ${t.label}`}
                    className={`min-h-[36px] px-2 sm:px-2.5 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${
                      active
                        ? 'bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {t.icon}
                    <span className="hidden md:inline">{t.label}</span>
                  </button>
                );
              })}
            </div>

            <PWAInstallButton />

            <button
              type="button"
              onClick={() => setActiveSection('settings')}
              aria-label="Open Settings"
              className={`hidden sm:flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border transition-colors ${
                activeSection === 'settings'
                  ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-200'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#08101E] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>

            {user ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveSection('settings')}
                  title={user.email || 'Profile'}
                  className="min-h-[40px] px-2 rounded-xl border border-cyan-500/30 bg-slate-100 dark:bg-[#08101E] flex items-center gap-1.5 text-xs text-slate-800 dark:text-slate-200"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      referrerPolicy="no-referrer"
                      className="w-6 h-6 rounded-full"
                    />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 flex items-center justify-center font-semibold">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </span>
                  )}
                  <span className="hidden xl:inline max-w-[100px] truncate">
                    {user.displayName || 'Account'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleGoogleSignOut}
                  aria-label="Sign out"
                  className="min-h-[40px] min-w-[40px] hidden sm:flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#08101E] text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-300"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="min-h-[40px] px-3 rounded-xl bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold text-xs hover:bg-cyan-500 dark:hover:bg-cyan-300 transition-colors whitespace-nowrap"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Active Alarms Banner */}
      {alarms.length > 0 && (
        <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 pt-3 space-y-2">
          {alarms.map((alarm) => {
            const secsLeft = Math.max(
              0,
              Math.ceil((alarm.endsAt - Date.now()) / 1000)
            );
            const mins = Math.floor(secsLeft / 60);
            const secs = secsLeft % 60;
            return (
              <div
                key={alarm.id}
                className={`rounded-xl border px-4 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm ${
                  alarm.triggered
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/20 text-amber-900 dark:text-amber-100'
                    : 'border-cyan-500/35 bg-white dark:bg-[#08101E] text-cyan-800 dark:text-cyan-200'
                }`}
              >
                <span className="font-medium">
                  {alarm.triggered
                    ? `ALARM TRIGGERED: ${alarm.label}`
                    : `Timer: ${alarm.label} — ${mins}:${String(secs).padStart(
                        2,
                        '0'
                      )}`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setAlarms((prev) => prev.filter((a) => a.id !== alarm.id))
                  }
                  className="min-h-[34px] px-3 rounded-lg bg-slate-200 dark:bg-slate-900/80 text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-800 inline-flex items-center gap-1"
                >
                  <BellOff className="w-3.5 h-3.5" />
                  <span>Dismiss</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Non-fatal System / ElevenLabs Voice Notice */}
      {voiceErrorBanner && (
        <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 pt-3">
          <div className="rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/35 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-rose-900 dark:text-rose-200">
            <span>{voiceErrorBanner}</span>
            <button
              type="button"
              onClick={() => setVoiceErrorBanner(null)}
              className="underline text-rose-950 dark:text-rose-100 shrink-0 font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-5 flex gap-5">
        {/* Desktop Left Navigation Rail */}
        <aside className="hidden md:flex flex-col w-48 lg:w-52 shrink-0 relative">
          <nav
            aria-label="Primary HUD Navigation"
            className="space-y-2 sticky top-20"
          >
            {desktopNavItems.map((item) => {
              const active = activeSection === item.id;
              return (
                <div key={item.id} className="relative flex items-center">
                  <button
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full min-h-[44px] px-3.5 rounded-xl border text-left flex items-center gap-3 font-display text-xs tracking-wider transition-all ${
                      active
                        ? 'border-cyan-500 bg-cyan-500/12 text-cyan-800 dark:text-cyan-200 shadow-sm dark:shadow-[0_0_20px_rgba(34,211,238,0.16)]'
                        : 'border-slate-200 dark:border-emerald-500/25 bg-white dark:bg-[#08101E]/85 text-slate-700 dark:text-slate-300 hover:border-cyan-500/50 hover:text-cyan-700 dark:hover:text-cyan-200'
                    }`}
                  >
                    <span
                      className={
                        active
                          ? 'text-cyan-600 dark:text-cyan-300'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }
                    >
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </button>
                  <span
                    aria-hidden="true"
                    className={`hidden lg:block w-4 h-[2px] -mr-4 transition-colors ${
                      active
                        ? 'bg-gradient-to-r from-cyan-500 to-transparent'
                        : 'bg-gradient-to-r from-emerald-500/35 to-transparent'
                    }`}
                  />
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0">
          {activeSection === 'dashboard' && (
            <div className="space-y-4">
              {/* Top Live Transcript Card (Matching Glowing Emerald/Cyan HUD Reference) */}
              <section
                aria-label="Live Conversation Transcript"
                className="rounded-2xl border border-emerald-500/35 dark:border-emerald-400/35 bg-white/95 dark:bg-[#050A12]/95 backdrop-blur-md px-4 py-3.5 shadow-sm dark:shadow-[0_0_26px_rgba(16,185,129,0.08)] space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[11px] font-mono-hud tracking-widest uppercase">
                    <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                      TRANSCRIPT
                    </span>
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span className="text-cyan-700 dark:text-cyan-300 truncate max-w-[175px] sm:max-w-none">
                      {activeVoiceLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono-hud text-[11px] text-cyan-700 dark:text-cyan-300">
                      {isLiveActive
                        ? 'LIVE AUDIO'
                        : isRecordingAudio
                          ? 'CAPTURING VAD'
                          : isProcessing
                            ? 'THINKING'
                            : effectiveOrbState}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveSection('chat')}
                      className="text-xs text-emerald-700 dark:text-emerald-300 hover:underline font-medium inline-flex items-center gap-0.5 whitespace-nowrap"
                    >
                      <span>History</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5 pt-1 border-t border-slate-200/80 dark:border-emerald-500/15">
                  <div className="min-w-0">
                    <p className="font-mono-hud text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 tracking-wider">
                      J.A.R.V.I.S
                    </p>
                    <p className="mt-1 text-xs sm:text-sm text-slate-900 dark:text-slate-100 leading-relaxed max-h-20 overflow-y-auto">
                      {latestJarvisMsg}
                    </p>
                  </div>
                  <div className="min-w-0 sm:border-l sm:border-slate-200/80 sm:dark:border-slate-800 sm:pl-4">
                    <p className="font-mono-hud text-[10px] font-semibold text-cyan-700 dark:text-cyan-300 tracking-wider">
                      YOU
                    </p>
                    <p className="mt-1 text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed max-h-20 overflow-y-auto">
                      {latestUserMsg}
                    </p>
                  </div>
                </div>

                {voice.showLatencyTelemetry && lastTelemetry && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[11px] font-mono-hud text-slate-600 dark:text-slate-400 border-t border-slate-200/80 dark:border-slate-800/80">
                    <span className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-300 font-semibold">
                      <Activity className="w-3 h-3" />
                      <span>{lastTelemetry.modelUsed || lastTelemetry.path}</span>
                    </span>
                    {lastTelemetry.eosDetectionMs !== undefined && (
                      <span>EOS {lastTelemetry.eosDetectionMs}ms</span>
                    )}
                    {lastTelemetry.sttMs !== undefined && (
                      <span>STT {lastTelemetry.sttMs}ms</span>
                    )}
                    {lastTelemetry.aiFirstTokenMs !== undefined && (
                      <span>1st Tok {lastTelemetry.aiFirstTokenMs}ms</span>
                    )}
                    {lastTelemetry.ttsFirstChunkMs !== undefined && (
                      <span>TTS Chk {lastTelemetry.ttsFirstChunkMs}ms</span>
                    )}
                    {lastTelemetry.firstAudibleMs !== undefined && (
                      <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                        Audible {lastTelemetry.firstAudibleMs}ms
                      </span>
                    )}
                    <span>Total {lastTelemetry.totalMs}ms</span>
                  </div>
                )}
              </section>

              {/* Signature Neural Circuit Hub + 3D Particle Sphere + Dashboard Widgets */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                {/* Neural Circuit Hero Card */}
                <section className="xl:col-span-6 rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white/95 dark:bg-[#050A12]/95 backdrop-blur-md p-3 sm:p-5 space-y-4 shadow-sm dark:shadow-[0_0_32px_rgba(34,211,238,0.08)]">
                  {/* 4 Wired Nodes -> SVG Neural Conduit -> 3D Particle Sphere */}
                  <div className="flex items-center justify-between gap-0">
                    {/* Left Quick-Access Neural Nodes */}
                    <div className="w-[112px] sm:w-44 lg:w-48 shrink-0 flex flex-col gap-2 sm:gap-2.5">
                      {(
                        [
                          {
                            id: 'memory',
                            label: 'MEMORY',
                            icon: <Brain className="w-3.5 h-3.5" />,
                            border: 'border-cyan-500/55 dark:border-cyan-400/55 hover:border-cyan-400',
                            badge: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/50',
                          },
                          {
                            id: 'chat',
                            label: 'CHAT',
                            icon: <MessageSquare className="w-3.5 h-3.5" />,
                            border: 'border-amber-500/55 dark:border-amber-400/55 hover:border-amber-400',
                            badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/50',
                          },
                          {
                            id: 'soul',
                            label: 'SOUL',
                            icon: <Sparkles className="w-3.5 h-3.5" />,
                            border: 'border-sky-500/50 dark:border-slate-400/55 hover:border-sky-400',
                            badge: 'bg-sky-500/15 text-sky-700 dark:text-slate-200 border-sky-500/45',
                          },
                          {
                            id: 'settings',
                            label: 'SETTINGS',
                            icon: <Settings className="w-3.5 h-3.5" />,
                            border: 'border-emerald-500/55 dark:border-emerald-400/55 hover:border-emerald-400',
                            badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/50',
                          },
                        ] as const
                      ).map((node) => (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => setActiveSection(node.id)}
                          className={`min-h-[44px] w-full px-1.5 sm:px-2.5 rounded-full border bg-slate-50/90 dark:bg-[#070E1B] text-slate-900 dark:text-slate-100 flex items-center gap-1.5 sm:gap-2.5 transition-all active:scale-[0.98] ${node.border}`}
                        >
                          <span
                            className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${node.badge}`}
                          >
                            {node.icon}
                          </span>
                          <span className="font-display text-[10px] sm:text-xs font-semibold tracking-wider whitespace-nowrap truncate">
                            {node.label}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Center SVG Neural Conduit Traces */}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 80 200"
                      preserveAspectRatio="none"
                      className="w-8 sm:w-14 lg:w-20 h-[196px] sm:h-[208px] shrink-0 overflow-visible"
                    >
                      <defs>
                        <linearGradient id="neuralBusCyan" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.85" />
                          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.95" />
                        </linearGradient>
                        <linearGradient id="neuralBusAmber" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.85" />
                          <stop offset="100%" stopColor="#22D3EE" stopOpacity="0.9" />
                        </linearGradient>
                        <linearGradient id="neuralBusEmerald" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#10B981" stopOpacity="0.85" />
                          <stop offset="100%" stopColor="#22D3EE" stopOpacity="0.95" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M 0 22 C 34 22, 36 92, 80 92"
                        fill="none"
                        stroke="url(#neuralBusCyan)"
                        strokeWidth={effectiveOrbState === 'LISTENING' || effectiveOrbState === 'SPEAKING' ? '2.4' : '1.6'}
                        strokeLinecap="round"
                      />
                      <path
                        d="M 0 74 C 30 74, 38 97, 80 97"
                        fill="none"
                        stroke="url(#neuralBusAmber)"
                        strokeWidth={effectiveOrbState === 'THINKING' ? '2.4' : '1.5'}
                        strokeLinecap="round"
                      />
                      <path
                        d="M 0 126 C 30 126, 38 103, 80 103"
                        fill="none"
                        stroke="url(#neuralBusCyan)"
                        strokeWidth="1.5"
                        strokeOpacity="0.78"
                        strokeLinecap="round"
                      />
                      <path
                        d="M 0 178 C 34 178, 36 108, 80 108"
                        fill="none"
                        stroke="url(#neuralBusEmerald)"
                        strokeWidth={effectiveOrbState === 'EXECUTING' || effectiveOrbState === 'SPEAKING' ? '2.4' : '1.6'}
                        strokeLinecap="round"
                      />
                    </svg>

                    {/* Right 3D Holographic Orb + Direct STOP & Audio Controls */}
                    <div className="flex-1 min-w-0 flex flex-col items-center justify-center">
                      <JarvisOrb
                        state={effectiveOrbState}
                        audioLevel={audioLevel}
                        listeningMode={orbListeningMode}
                        wakeWordStandby={handsFreeState.status === 'standby'}
                        onTap={handleOrbTap}
                        size={orbSize}
                      />

                      <div className="mt-2.5 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            stopSpeaking();
                            if (isLiveActive) stopLiveSession();
                            if (isRecordingAudio) stopAudioRecord();
                            handsFreeState.cancelFollowUp();
                          }}
                          className="min-h-[40px] px-4 rounded-full border border-rose-500/65 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 font-display text-xs font-semibold tracking-wider inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>STOP</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const next = !muted;
                            setMuted(next);
                            if (next) stopSpeaking();
                          }}
                          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                          title={muted ? 'Audio Muted (Tap to enable)' : 'Audio On (Tap to mute)'}
                          className={`min-h-[40px] min-w-[40px] px-2.5 rounded-full border inline-flex items-center justify-center transition-colors ${
                            muted
                              ? 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : 'border-cyan-500/45 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20'
                          }`}
                        >
                          {muted ? (
                            <VolumeX className="w-4 h-4" />
                          ) : (
                            <Volume2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Live Audio Activity Meter */}
                  <div className="w-full space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-75 ${
                          effectiveOrbState === 'SPEAKING'
                            ? 'bg-gradient-to-r from-emerald-400 to-cyan-400'
                            : effectiveOrbState === 'LISTENING'
                              ? 'bg-gradient-to-r from-cyan-400 to-sky-400'
                              : 'bg-cyan-500/30'
                        }`}
                        style={{
                          width: `${Math.max(4, Math.round(audioLevel * 100))}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Wake Word Status & Hands-Free Toggle */}
                  <div className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#040811] px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Radio
                        className={`w-3.5 h-3.5 shrink-0 ${
                          handsFreeState.status === 'standby' ||
                          handsFreeState.status === 'listening_command' ||
                          handsFreeState.status === 'follow_up'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : handsFreeState.status === 'error'
                              ? 'text-rose-500'
                              : 'text-slate-400'
                        }`}
                      />
                      <span className="text-slate-700 dark:text-slate-300 truncate">
                        Wake Word &quot;Hey Jarvis&quot;:{' '}
                        <strong className="font-mono-hud uppercase text-cyan-700 dark:text-cyan-300">
                          {handsFreeState.status.replace('_', ' ')}
                        </strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={!handsFreeState.supported}
                      onClick={() => {
                        const next = {
                          ...voice,
                          wakeWordEnabled: !voice.wakeWordEnabled,
                        };
                        setVoice(next);
                        if (user?.emailVerified) {
                          saveAssistantSettings(user.uid, soul, next).catch(
                            () => {}
                          );
                        }
                      }}
                      className={`min-h-[36px] px-3 rounded-lg border text-[11px] font-semibold transition-colors disabled:opacity-40 whitespace-nowrap shrink-0 ${
                        voice.wakeWordEnabled
                          ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {voice.wakeWordEnabled ? 'Enabled' : 'Enable'}
                    </button>
                  </div>

                  {/* Mobile-Friendly Voice Session & Maps Strip */}
                  <div className="w-full grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={startLiveSession}
                      className={`min-h-[44px] px-2.5 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                        isLiveActive
                          ? 'border-emerald-500 bg-emerald-500 text-white dark:text-slate-950'
                          : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200 hover:bg-cyan-500/20'
                      }`}
                    >
                      <Radio className="w-3.5 h-3.5 shrink-0" />
                      <span>{isLiveActive ? 'End Live' : 'Live Voice'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={
                        isRecordingAudio
                          ? () => stopAudioRecord()
                          : startAudioRecord
                      }
                      disabled={isLiveActive}
                      className={`min-h-[44px] px-2.5 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 whitespace-nowrap ${
                        isRecordingAudio
                          ? 'border-rose-500 bg-rose-500 text-white'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#040811] text-slate-800 dark:text-slate-200 hover:border-cyan-500/50'
                      }`}
                    >
                      {isRecordingAudio ? (
                        <>
                          <MicOff className="w-3.5 h-3.5 shrink-0" />
                          <span>Send Voice</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5 shrink-0" />
                          <span>Push to Talk</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveSection('maps')}
                      className="min-h-[44px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#040811] text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-cyan-500/50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Compass className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                      <span>Maps</span>
                    </button>
                  </div>

                  {/* Quick Text & Media Input Bar */}
                  <form onSubmit={handleQuickSubmit} className="w-full">
                    <input
                      ref={quickFileRef}
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleQuickFile}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => quickFileRef.current?.click()}
                        disabled={isProcessing}
                        aria-label="Upload photo or video"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#040811] text-slate-700 dark:text-slate-300 hover:border-cyan-500/50 hover:text-cyan-700 dark:hover:text-cyan-300 shrink-0"
                      >
                        <ImagePlus className="w-4 h-4" />
                      </button>
                      <input
                        type="text"
                        value={quickInput}
                        onChange={(e) => setQuickInput(e.target.value)}
                        placeholder="Ask J.A.R.V.I.S in English, Hindi, or Urdu..."
                        className="flex-1 min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#040811] px-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={!quickInput.trim() || isProcessing}
                        aria-label="Send command"
                        className="min-h-[44px] min-w-[44px] px-3.5 flex items-center justify-center rounded-xl bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 transition-colors disabled:opacity-40 shrink-0"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </form>
                </section>

                {/* Right Column: Compact 2x2 Dashboard Widgets (Today's Headlines, Today's Tasks, System Status, Connected Services) */}
                <div className="xl:col-span-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
                    <HeadlinesPanel compact />

                    <TasksPanel
                      tasks={tasks}
                      compact
                      onViewAll={() => setActiveSection('workspace')}
                      isAuthenticated={Boolean(user)}
                      onAddTask={async (title, prio, due) => {
                        if (!user) return;
                        await addTask(user.uid, title, prio, due);
                      }}
                      onToggleTask={async (id, completed) => {
                        if (!user) return;
                        await toggleTask(user.uid, id, completed);
                      }}
                      onDeleteTask={async (id) => {
                        if (!user) return;
                        await deleteTask(user.uid, id);
                      }}
                    />
                  </div>

                  {/* Compact System Status & Connected Services Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* System Status Widget */}
                    <section className="rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white/95 dark:bg-[#050A12]/95 backdrop-blur-md p-4 shadow-sm flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                          <h2 className="font-display text-xs font-semibold tracking-wider text-slate-900 dark:text-slate-100">
                            SYSTEM STATUS
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveSection('settings')}
                          className="text-[11px] text-cyan-700 dark:text-cyan-300 hover:underline font-medium"
                        >
                          Diagnostics
                        </button>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Voice Engine</span>
                          <span className="font-mono-hud text-[11px] text-cyan-700 dark:text-cyan-300 font-medium truncate max-w-[155px]">
                            {activeVoiceLabel}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 dark:text-slate-400">AI Speed Mode</span>
                          <span className="font-mono-hud text-[11px] uppercase text-slate-800 dark:text-slate-200">
                            {modelMode}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 dark:text-slate-400">VAD Threshold</span>
                          <span className="font-mono-hud text-[11px] text-emerald-700 dark:text-emerald-300">
                            {voiceTuning.vadSilenceMs} ms
                          </span>
                        </div>
                      </div>
                    </section>

                    {/* Connected Services Widget */}
                    <section className="rounded-2xl border border-slate-200 dark:border-emerald-500/25 bg-white/95 dark:bg-[#050A12]/95 backdrop-blur-md p-4 shadow-sm flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Link2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <h2 className="font-display text-xs font-semibold tracking-wider text-slate-900 dark:text-slate-100">
                            CONNECTED SERVICES
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveSection('workspace')}
                          className="text-[11px] text-emerald-700 dark:text-emerald-300 hover:underline font-medium"
                        >
                          Workspace
                        </button>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        {[
                          {
                            label: 'ElevenLabs Male Voice',
                            ok: Boolean(
                              healthSnapshot?.elevenLabsConfigured &&
                                healthSnapshot?.elevenLabsVoiceIdValid
                            ),
                          },
                          {
                            label: 'Gemini Intelligence',
                            ok: Boolean(healthSnapshot?.geminiConfigured),
                          },
                          {
                            label: 'Gmail & Calendar',
                            ok: Boolean(user && accessToken),
                          },
                          {
                            label: 'Google Maps',
                            ok: Boolean(healthSnapshot?.mapsConfigured),
                          },
                        ].map((svc) => (
                          <div
                            key={svc.label}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="text-slate-600 dark:text-slate-300 truncate">
                              {svc.label}
                            </span>
                            {svc.ok ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'memory' && (
            <MemoryScreen
              memories={memories}
              isAuthenticated={Boolean(user)}
              onAddMemory={async (content, cat, imp) => {
                if (!user) return;
                await addMemory(user.uid, content, cat, imp);
              }}
              onUpdateMemory={async (id, content, cat, imp) => {
                if (!user) return;
                await updateMemory(user.uid, id, content, cat, imp);
              }}
              onDeleteMemory={async (id) => {
                if (!user) return;
                await deleteMemory(user.uid, id);
              }}
              onRequestClearHistory={handleRequestClearHistory}
            />
          )}

          {activeSection === 'chat' && (
            <ChatScreen
              messages={messages}
              modelMode={modelMode}
              onChangeModelMode={handleModelModeChange}
              isProcessing={isProcessing}
              isRecordingAudio={isRecordingAudio}
              onSendMessage={(msg) => sendCommandToJarvis(msg, { isVoice: false })}
              onStartAudioRecord={startAudioRecord}
              onStopAudioRecord={() => stopAudioRecord()}
              onSpeakText={(txt) => void speakText(txt)}
              onAnalyzeMedia={handleAnalyzeMedia}
              onRequestClearHistory={handleRequestClearHistory}
            />
          )}

          {activeSection === 'soul' && (
            <SoulScreen
              soul={soul}
              onSaveSoul={async (nextSoul) => {
                setSoul(nextSoul);
                if (user?.emailVerified) {
                  await saveAssistantSettings(user.uid, nextSoul, voice);
                }
              }}
            />
          )}

          {activeSection === 'workspace' && (
            <WorkspaceHub
              accessToken={accessToken}
              user={user}
              notes={notes}
              onGoogleSignIn={handleGoogleSignIn}
              onAddNote={async (title, content) => {
                if (!user) return;
                await addNote(user.uid, title, content);
              }}
              onDeleteNote={async (id) => {
                if (!user) return;
                await deleteNote(user.uid, id);
              }}
              onSummarizeWithJarvis={(text) => {
                setActiveSection('chat');
                void sendCommandToJarvis(text, { isVoice: false });
              }}
              onRequestConfirm={setConfirmDialog}
              onStartAlarm={(label, minutes) => {
                requestNotificationPermissionIfPossible();
                setAlarms((prev) => [
                  ...prev,
                  {
                    id: `alarm_${Date.now()}`,
                    label,
                    endsAt: Date.now() + minutes * 60 * 1000,
                    triggered: false,
                  },
                ]);
              }}
              onRunDeviceAction={(target, query) => {
                const outcome = runDeviceTarget(target, query);
                setLiveJarvisTranscript(outcome.message);
              }}
            />
          )}

          {activeSection === 'creator' && (
            <CreatorStudio
              uid={user?.uid ?? null}
              isAuthenticated={Boolean(user)}
              onGoogleSignIn={handleGoogleSignIn}
              onRequestConfirm={setConfirmDialog}
              voiceCommand={creatorVoiceCmd}
              onClearVoiceCommand={() => setCreatorVoiceCmd(null)}
            />
          )}

          {activeSection === 'maps' && (
            <MapsView
              userLocation={userLocation}
              onUpdateLocation={setUserLocation}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsScreen
              voice={voice}
              voiceTuning={voiceTuning}
              onUpdateVoiceTuning={handleUpdateVoiceTuning}
              onSaveVoice={async (nextVoice) => {
                const merged = {
                  ...nextVoice,
                  themeMode,
                  modelMode,
                };
                setVoice(merged);
                if (user?.emailVerified) {
                  await saveAssistantSettings(user.uid, soul, merged);
                }
              }}
              onTestVoice={async (draftVoice, draftTuning) => {
                const res = await speakText(
                  `Voice diagnostics calibrated for ${soul.assistantName}, ${soul.addressTitle}. Developed by Asif Qureshi. All systems nominal.`,
                  draftVoice,
                  draftTuning
                );
                return {
                  ttsFirstChunkMs: res.ttsFirstChunkMs,
                  firstAudibleMs: res.firstAudibleMs,
                  error: res.error,
                };
              }}
              themeMode={themeMode}
              resolvedTheme={resolvedTheme}
              onChangeThemeMode={handleThemeChange}
              modelMode={modelMode}
              onChangeModelMode={handleModelModeChange}
              handsFreeState={handsFreeState}
              latencyHistory={latencyHistory}
              onClearLatencyHistory={() => setLatencyHistory([])}
              user={user}
              hasWorkspaceToken={Boolean(accessToken)}
              onGoogleSignIn={handleGoogleSignIn}
              onGoogleSignOut={handleGoogleSignOut}
            />
          )}
        </main>
      </div>

      {/* Clean 6-Item Mobile Bottom Navigation Bar (56px height keeps sticky top+bottom <= 15% of mobile viewport) */}
      <nav
        aria-label="Mobile HUD Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-[calc(3.5rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] border-t border-slate-200 dark:border-cyan-500/25 bg-white/95 dark:bg-[#04070D]/95 backdrop-blur-md px-1 grid grid-cols-6 gap-0.5 items-center"
      >
        {mobileBottomNav.map((item) => {
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`min-h-[44px] px-0.5 flex flex-col items-center justify-center gap-0.5 rounded-lg text-[9px] font-medium transition-colors ${
                active
                  ? 'text-cyan-700 dark:text-cyan-300 bg-cyan-500/10 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {item.icon}
              <span className="truncate max-w-full leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <ConfirmModal
        dialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
      />

      <CameraModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCaptureImage={async (file, prompt) => {
          await handleAnalyzeMedia(file, prompt);
        }}
      />

      <CalculatorModal
        open={calculatorModalOpen}
        onClose={() => setCalculatorModalOpen(false)}
      />
    </div>
  );
}
