import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cpu,
  Gauge,
  Globe,
  Info,
  Mic,
  Monitor,
  Moon,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  UserCheck,
  Volume2,
  XCircle,
  Zap,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type {
  ElevenLabsModelId,
  LatencyTelemetry,
  ModelMode,
  ThemeMode,
  VoiceSettings,
  VoiceTuningConfig,
} from '../types/jarvis';
import type { HandsFreeStatus } from '../hooks/useHandsFreeVoice';
import {
  DEVELOPER_IDENTITY,
  TECHNICAL_SPEC_ITEMS,
  VERIFIED_TECHNICAL_KNOWLEDGE,
} from '../config/systemKnowledge';

interface SettingsScreenProps {
  voice: VoiceSettings;
  voiceTuning: VoiceTuningConfig;
  onUpdateVoiceTuning: (next: VoiceTuningConfig) => void;
  onSaveVoice: (next: VoiceSettings) => Promise<void>;
  onTestVoice: (
    settings: VoiceSettings,
    tuning: VoiceTuningConfig
  ) => Promise<{ ttsFirstChunkMs?: number; firstAudibleMs?: number; error?: string } | void>;
  themeMode: ThemeMode;
  resolvedTheme: 'dark' | 'light';
  onChangeThemeMode: (mode: ThemeMode) => void;
  modelMode: ModelMode;
  onChangeModelMode: (mode: ModelMode) => void;
  handsFreeState: {
    supported: boolean;
    status: HandsFreeStatus;
    errorMessage: string | null;
    lastHeard: string;
    wakeLockActive: boolean;
  };
  latencyHistory: LatencyTelemetry[];
  onClearLatencyHistory: () => void;
  user: User | null;
  hasWorkspaceToken: boolean;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
}

interface HealthStatus {
  status: string;
  geminiConfigured: boolean;
  elevenLabsConfigured: boolean;
  elevenLabsVoiceIdValid: boolean;
  elevenLabsDefaultVoiceId: string;
  elevenLabsDefaultModelId?: string;
  mapsConfigured: boolean;
  timestamp: string;
}

const GEMINI_MALE_VOICES: VoiceSettings['geminiVoiceName'][] = [
  'Charon',
  'Fenrir',
  'Puck',
];

const ELEVENLABS_MODELS: Array<{
  id: ElevenLabsModelId;
  label: string;
  badge: string;
  subtitle: string;
}> = [
  {
    id: 'eleven_flash_v2_5',
    label: 'Eleven Flash v2.5',
    badge: '~75ms Ultra-Fast',
    subtitle: 'Recommended for real-time voice conversations & streaming playback',
  },
  {
    id: 'eleven_turbo_v2_5',
    label: 'Eleven Turbo v2.5',
    badge: 'Balanced',
    subtitle: 'High-clarity conversational speech with fast turn-around',
  },
  {
    id: 'eleven_multilingual_v2',
    label: 'Multilingual v2',
    badge: 'Rich EN / HI / UR',
    subtitle: 'Highest expressiveness for multilingual Hindi/Urdu/English phrasing',
  },
];

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'dark',
    label: 'Dark Mode',
    subtitle: 'Deep obsidian HUD with neon cyan & emerald highlights',
    icon: <Moon className="w-4 h-4" />,
  },
  {
    id: 'light',
    label: 'Light Mode',
    subtitle: 'Clean daylight surface with high-contrast slate ink',
    icon: <Sun className="w-4 h-4" />,
  },
  {
    id: 'system',
    label: 'System Default',
    subtitle: 'Follows Android / OS appearance automatically',
    icon: <Monitor className="w-4 h-4" />,
  },
];

const MODEL_OPTIONS: Array<{
  id: ModelMode;
  label: string;
  model: string;
  subtitle: string;
}> = [
  {
    id: 'fast',
    label: 'Fast Mode (Recommended)',
    model: 'gemini-3.1-flash-lite',
    subtitle: 'Sub-second streaming for natural voice & daily directives',
  },
  {
    id: 'balanced',
    label: 'Balanced Mode',
    model: 'gemini-4-hydrogen (MEDIUM)',
    subtitle: 'Web Search, Maps grounding & full device/Workspace tools',
  },
  {
    id: 'deep',
    label: 'Advanced Reasoning',
    model: 'gemini-4-hydrogen (XHIGH)',
    subtitle: 'Maximum analytical depth for complex architecture & planning',
  },
];

function fmtMs(val: number | undefined): string {
  return typeof val === 'number' && val >= 0 ? `${val} ms` : '—';
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  voice,
  voiceTuning,
  onUpdateVoiceTuning,
  onSaveVoice,
  onTestVoice,
  themeMode,
  resolvedTheme,
  onChangeThemeMode,
  modelMode,
  onChangeModelMode,
  handsFreeState,
  latencyHistory,
  onClearLatencyHistory,
  user,
  hasWorkspaceToken,
  onGoogleSignIn,
  onGoogleSignOut,
}) => {
  const [draft, setDraft] = useState<VoiceSettings>(voice);
  const [tuningDraft, setTuningDraft] = useState<VoiceTuningConfig>(voiceTuning);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [elTestResult, setElTestResult] = useState<{
    ok: boolean;
    message: string;
    voices?: Array<{ voiceId: string; name: string }>;
  } | null>(null);
  const [testingEl, setTestingEl] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [testingVoice, setTestingVoice] = useState(false);
  const [voiceTestStatus, setVoiceTestStatus] = useState<string | null>(null);

  useEffect(() => {
    setDraft(voice);
  }, [voice]);

  useEffect(() => {
    setTuningDraft(voiceTuning);
  }, [voiceTuning]);

  const checkHealth = async () => {
    setCheckingHealth(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data);
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveFeedback(null);
    try {
      onUpdateVoiceTuning(tuningDraft);
      await onSaveVoice({
        ...draft,
        themeMode,
        modelMode,
      });
      setSaveFeedback('Voice, VAD & System settings saved.');
      setTimeout(() => setSaveFeedback(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleTestElevenLabs = async () => {
    setTestingEl(true);
    setElTestResult(null);
    try {
      const res = await fetch('/api/elevenlabs/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: draft.elevenLabsVoiceId }),
      });
      const data = await res.json();
      if (!res.ok || !data.connected) {
        setElTestResult({
          ok: false,
          message:
            data.error ||
            'ElevenLabs connection failed. Ensure ELEVENLABS_API_KEY is set in server Secrets.',
        });
      } else {
        setElTestResult({
          ok: true,
          message: `Connected (${data.voices?.length || 0} voices). ${
            data.voiceValidationMessage || ''
          }`,
          voices: data.voices,
        });
      }
    } catch (err) {
      setElTestResult({
        ok: false,
        message:
          err instanceof Error ? err.message : 'ElevenLabs connection error.',
      });
    } finally {
      setTestingEl(false);
    }
  };

  const handleVoiceSample = async () => {
    setTestingVoice(true);
    setVoiceTestStatus(null);
    try {
      onUpdateVoiceTuning(tuningDraft);
      const outcome = await onTestVoice(draft, tuningDraft);
      if (outcome?.error) {
        setVoiceTestStatus(`Voice error: ${outcome.error}`);
      } else if (outcome?.firstAudibleMs) {
        setVoiceTestStatus(
          `Playing male voice — First chunk: ${fmtMs(outcome.ttsFirstChunkMs)} · First audible: ${fmtMs(outcome.firstAudibleMs)}`
        );
      }
    } finally {
      setTestingVoice(false);
    }
  };

  const handleAudioPlaybackCheck = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.16);
      const vol = Math.min(0.4, Math.max(0.03, 0.16 * tuningDraft.volume));
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
      setVoiceTestStatus(
        `Browser audio output unlocked at ${Math.round(tuningDraft.volume * 100)}% gain.`
      );
    } catch (err) {
      setVoiceTestStatus(
        err instanceof Error
          ? `Audio hardware blocked: ${err.message}`
          : 'Browser blocked audio playback.'
      );
    }
  };

  const isPlaceholderVoiceId =
    !draft.elevenLabsVoiceId.trim() ||
    draft.elevenLabsVoiceId.trim() === '00000' ||
    /^0+$/.test(draft.elevenLabsVoiceId.trim());

  const latestMetrics = latencyHistory[0];

  const handsFreeBadgeColor =
    handsFreeState.status === 'listening_command' ||
    handsFreeState.status === 'follow_up'
      ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
      : handsFreeState.status === 'standby'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : handsFreeState.status === 'paused'
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
          : handsFreeState.status === 'error' ||
              handsFreeState.status === 'unsupported'
            ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
            : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400';

  const specCategories: Array<
    'Core' | 'AI & Voice' | 'Data & Auth' | 'Platform & Build'
  > = ['Core', 'AI & Voice', 'Data & Auth', 'Platform & Build'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
          <span>Voice, Latency Diagnostics & System Settings</span>
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          Calibrate ElevenLabs male voice streaming, real-time VAD silence detection, appearance theme, AI speed mode, and live latency metrics.
        </p>
      </div>

      {/* 1. Real-Time Voice Latency Diagnostic Screen */}
      <section className="rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/90 p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>Voice Pipeline Latency Diagnostics (Measured)</span>
          </h2>
          {latencyHistory.length > 0 && (
            <button
              type="button"
              onClick={onClearLatencyHistory}
              className="min-h-[34px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:border-cyan-500"
            >
              Reset Metrics
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {[
            { label: '1. End-of-Speech (VAD)', val: fmtMs(latestMetrics?.eosDetectionMs) },
            { label: '2. STT Completion', val: fmtMs(latestMetrics?.sttMs) },
            { label: '3. First AI Token', val: fmtMs(latestMetrics?.aiFirstTokenMs) },
            { label: '4. TTS 1st Chunk', val: fmtMs(latestMetrics?.ttsFirstChunkMs) },
            { label: '5. First Audible', val: fmtMs(latestMetrics?.firstAudibleMs) },
            { label: '6. Total Completion', val: fmtMs(latestMetrics?.totalMs) },
          ].map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3"
            >
              <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {metric.label}
              </p>
              <p className="mt-1 font-mono-hud text-sm sm:text-base font-bold text-cyan-700 dark:text-cyan-300">
                {metric.val}
              </p>
            </div>
          ))}
        </div>

        {latencyHistory.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-4 text-center">
            No voice or AI requests measured in this session yet. Speak or send a command to populate real millisecond pipeline measurements.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-[11px] font-mono-hud">
              <thead className="bg-slate-100 dark:bg-[#050A14] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-3 py-2">Query</th>
                  <th className="px-2.5 py-2">Path / Model</th>
                  <th className="px-2.5 py-2">EOS</th>
                  <th className="px-2.5 py-2">STT</th>
                  <th className="px-2.5 py-2">1st Tok</th>
                  <th className="px-2.5 py-2">TTS Chk</th>
                  <th className="px-2.5 py-2">Audible</th>
                  <th className="px-2.5 py-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 text-slate-800 dark:text-slate-200">
                {latencyHistory.slice(0, 8).map((row, idx) => (
                  <tr key={`${row.timestamp || idx}-${idx}`}>
                    <td className="px-3 py-2 max-w-[140px] truncate">
                      {row.queryPreview || 'Voice/Text turn'}
                    </td>
                    <td className="px-2.5 py-2 text-cyan-700 dark:text-cyan-300 whitespace-nowrap">
                      {row.modelUsed || row.path}
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmtMs(row.eosDetectionMs)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmtMs(row.sttMs)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmtMs(row.aiFirstTokenMs)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmtMs(row.ttsFirstChunkMs)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap text-emerald-700 dark:text-emerald-300 font-semibold">
                      {fmtMs(row.firstAudibleMs)}
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fmtMs(row.totalMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 2. ElevenLabs Male Voice & VAD Calibration Form */}
      <form
        onSubmit={handleSave}
        className="rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/90 p-5 space-y-5 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>Voice Provider & ElevenLabs Male Calibration</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAudioPlaybackCheck}
              className="min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#050A14] text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-cyan-500"
            >
              Audio Playback Check
            </button>
            <button
              type="button"
              onClick={handleVoiceSample}
              disabled={testingVoice}
              className="min-h-[40px] px-3.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-xs font-semibold text-cyan-700 dark:text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
            >
              {testingVoice ? 'Synthesizing...' : 'Test Male Voice'}
            </button>
          </div>
        </div>

        {voiceTestStatus && (
          <div className="rounded-xl border border-cyan-500/35 bg-cyan-50 dark:bg-cyan-950/25 px-3.5 py-2.5 text-xs text-cyan-900 dark:text-cyan-200 font-mono-hud">
            {voiceTestStatus}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setDraft({ ...draft, voiceEngine: 'elevenlabs' })}
            className={`p-4 rounded-xl border text-left transition-colors ${
              draft.voiceEngine === 'elevenlabs'
                ? 'border-cyan-500 bg-cyan-500/10 dark:bg-cyan-500/15'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                ElevenLabs Male Voice (Default)
              </p>
              <span className="font-mono-hud text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                PRIMARY
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Consistent male J.A.R.V.I.S voice ({draft.elevenLabsVoiceId || 'uuyFQegRan8rpIQCGu9K'}) via low-latency streaming. Never falls back silently to female voices.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setDraft({ ...draft, voiceEngine: 'gemini' })}
            className={`p-4 rounded-xl border text-left transition-colors ${
              draft.voiceEngine === 'gemini'
                ? 'border-cyan-500 bg-cyan-500/10 dark:bg-cyan-500/15'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Gemini Male Neural Voice
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Optional built-in Gemini male TTS persona (Charon / Fenrir / Puck).
            </p>
          </button>
        </div>

        {draft.voiceEngine === 'gemini' ? (
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Gemini Male Voice Persona
            </label>
            <div className="flex flex-wrap gap-2">
              {GEMINI_MALE_VOICES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDraft({ ...draft, geminiVoiceName: v })}
                  className={`min-h-[40px] px-3.5 rounded-lg text-xs font-medium border ${
                    draft.geminiVoiceName === v
                      ? 'bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 border-cyan-500 dark:border-cyan-300 font-semibold'
                      : 'bg-slate-50 dark:bg-[#050A14] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ElevenLabs Model Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                ElevenLabs Streaming Model
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {ELEVENLABS_MODELS.map((m) => {
                  const active = tuningDraft.elevenLabsModelId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        setTuningDraft({ ...tuningDraft, elevenLabsModelId: m.id })
                      }
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        active
                          ? 'border-cyan-500 bg-cyan-500/10 dark:bg-cyan-500/15'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] hover:border-cyan-500/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {m.label}
                        </span>
                        <span className="font-mono-hud text-[10px] text-cyan-700 dark:text-cyan-300">
                          {m.badge}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                        {m.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ElevenLabs Voice ID */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                ElevenLabs Male Voice ID (Official Default: uuyFQegRan8rpIQCGu9K)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={draft.elevenLabsVoiceId}
                  onChange={(e) =>
                    setDraft({ ...draft, elevenLabsVoiceId: e.target.value })
                  }
                  placeholder="uuyFQegRan8rpIQCGu9K"
                  className="flex-1 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-3.5 font-mono-hud text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() =>
                    setDraft({ ...draft, elevenLabsVoiceId: 'uuyFQegRan8rpIQCGu9K' })
                  }
                  className="min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-cyan-500 whitespace-nowrap"
                >
                  Use Default ID
                </button>
                <button
                  type="button"
                  onClick={handleTestElevenLabs}
                  disabled={testingEl}
                  className="min-h-[44px] px-4 rounded-xl border border-cyan-500/50 bg-cyan-500/10 text-xs font-medium text-cyan-800 dark:text-cyan-200 hover:bg-cyan-500/20 whitespace-nowrap"
                >
                  {testingEl ? 'Testing...' : 'Verify ElevenLabs'}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1">
                  Verified Male Voices:
                </span>
                {[
                  { id: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel (Steady · Free API)' },
                  { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George (Warm · Free API)' },
                  { id: 'nPczCjzI2devNBz1zQrb', label: 'Brian (Deep · Free API)' },
                  { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam (Firm · Free API)' },
                  { id: 'uuyFQegRan8rpIQCGu9K', label: 'Viraj (Library · Paid API)' },
                ].map((preset) => {
                  const selected = draft.elevenLabsVoiceId.trim() === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setDraft({ ...draft, elevenLabsVoiceId: preset.id })
                      }
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                        selected
                          ? 'border-cyan-500 bg-cyan-500/15 text-cyan-800 dark:text-cyan-200'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] text-slate-600 dark:text-slate-300 hover:border-cyan-500/50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              {isPlaceholderVoiceId && (
                <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
                  Voice ID &quot;00000&quot; is a placeholder. Pick a Verified Male Voice above or enter your custom male ElevenLabs Voice ID.
                </p>
              )}
              {elTestResult && (
                <div
                  className={`mt-2 rounded-xl border p-3 text-xs ${
                    elTestResult.ok
                      ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300'
                      : 'border-rose-500/40 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300'
                  }`}
                >
                  <p>{elTestResult.message}</p>
                  {elTestResult.voices && elTestResult.voices.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {elTestResult.voices
                        .filter(
                          (v) =>
                            !/\b(sarah|laura|alice|matilda|jessica|bella|lily|janvi|nitya)\b/i.test(
                              v.name
                            )
                        )
                        .slice(0, 10)
                        .map((v) => (
                          <button
                            key={v.voiceId}
                            type="button"
                            onClick={() =>
                              setDraft({ ...draft, elevenLabsVoiceId: v.voiceId })
                            }
                            className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[11px] text-cyan-700 dark:text-cyan-200 hover:border-cyan-500"
                          >
                            {v.name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Voice Calibration Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300 mb-1">
                  <span>Stability</span>
                  <span className="font-mono-hud">{draft.stability.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={draft.stability}
                  onChange={(e) =>
                    setDraft({ ...draft, stability: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300 mb-1">
                  <span>Similarity</span>
                  <span className="font-mono-hud">{draft.similarity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={draft.similarity}
                  onChange={(e) =>
                    setDraft({ ...draft, similarity: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300 mb-1">
                  <span>Speaking Speed</span>
                  <span className="font-mono-hud">{draft.speed.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={0.7}
                  max={1.2}
                  step={0.05}
                  value={draft.speed}
                  onChange={(e) =>
                    setDraft({ ...draft, speed: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300 mb-1">
                  <span>Output Volume</span>
                  <span className="font-mono-hud">
                    {Math.round(tuningDraft.volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1.5}
                  step={0.05}
                  value={tuningDraft.volume}
                  onChange={(e) => {
                    const updated = {
                      ...tuningDraft,
                      volume: Number(e.target.value),
                    };
                    setTuningDraft(updated);
                    onUpdateVoiceTuning(updated);
                  }}
                  className="w-full accent-cyan-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* VAD & Conversation Flow Tuning */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>VAD Silence Threshold & Hands-Free Conversation Timing</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300 mb-1">
                <span>VAD End-of-Speech Silence</span>
                <span className="font-mono-hud text-cyan-700 dark:text-cyan-300">
                  {tuningDraft.vadSilenceMs} ms
                </span>
              </div>
              <input
                type="range"
                min={500}
                max={900}
                step={25}
                value={tuningDraft.vadSilenceMs}
                onChange={(e) => {
                  const updated = {
                    ...tuningDraft,
                    vadSilenceMs: Number(e.target.value),
                  };
                  setTuningDraft(updated);
                  onUpdateVoiceTuning(updated);
                }}
                className="w-full accent-cyan-500"
              />
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Lower (500–650ms) responds faster; higher (750–900ms) tolerates longer pauses mid-sentence.
              </p>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300 mb-1">
                <span>Follow-Up Listening Window</span>
                <span className="font-mono-hud text-emerald-700 dark:text-emerald-300">
                  {tuningDraft.followUpWindowSec === 0
                    ? 'Off'
                    : `${tuningDraft.followUpWindowSec} s`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                step={2}
                value={tuningDraft.followUpWindowSec}
                onChange={(e) => {
                  const updated = {
                    ...tuningDraft,
                    followUpWindowSec: Number(e.target.value),
                  };
                  setTuningDraft(updated);
                  onUpdateVoiceTuning(updated);
                }}
                className="w-full accent-emerald-500"
              />
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Keeps mic ready for follow-up questions after J.A.R.V.I.S finishes speaking before returning to standby.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-5 pt-1">
            <label className="inline-flex items-center gap-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200 cursor-pointer min-h-[40px]">
              <input
                type="checkbox"
                checked={draft.autoSpeak}
                onChange={(e) =>
                  setDraft({ ...draft, autoSpeak: e.target.checked })
                }
                className="w-4 h-4 accent-cyan-500"
              />
              <span>Auto-speak assistant replies</span>
            </label>

            <label className="inline-flex items-center gap-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200 cursor-pointer min-h-[40px]">
              <input
                type="checkbox"
                checked={tuningDraft.bargeInEnabled}
                onChange={(e) => {
                  const updated = {
                    ...tuningDraft,
                    bargeInEnabled: e.target.checked,
                  };
                  setTuningDraft(updated);
                  onUpdateVoiceTuning(updated);
                }}
                className="w-4 h-4 accent-cyan-500"
              />
              <span>Enable Voice Barge-In (interrupt speech by speaking)</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {saveFeedback && (
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {saveFeedback}
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 font-semibold text-sm hover:bg-cyan-500 dark:hover:bg-cyan-300 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Voice & VAD Settings'}
          </button>
        </div>
      </form>

      {/* 3. Continuous Hands-Free Mode ("Hey Jarvis") */}
      <section className="rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/90 p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Mic className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>Hands-Free Voice Mode (&quot;Hey Jarvis&quot;)</span>
          </h2>
          <span
            className={`font-mono-hud text-[11px] px-2.5 py-1 rounded-md border uppercase ${handsFreeBadgeColor}`}
          >
            {handsFreeState.status.replace('_', ' ')}
          </span>
        </div>

        <div className="flex flex-wrap gap-5">
          <label className="inline-flex items-center gap-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200 cursor-pointer min-h-[40px]">
            <input
              type="checkbox"
              checked={draft.wakeWordEnabled}
              disabled={!handsFreeState.supported}
              onChange={(e) => {
                const next = { ...draft, wakeWordEnabled: e.target.checked };
                setDraft(next);
                onSaveVoice({ ...next, themeMode, modelMode });
              }}
              className="w-4 h-4 accent-cyan-500"
            />
            <span>Enable continuous &quot;Hey Jarvis&quot; wake-word listener</span>
          </label>

          <label className="inline-flex items-center gap-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200 cursor-pointer min-h-[40px]">
            <input
              type="checkbox"
              checked={Boolean(draft.keepScreenAwake)}
              onChange={(e) => {
                const next = { ...draft, keepScreenAwake: e.target.checked };
                setDraft(next);
                onSaveVoice({ ...next, themeMode, modelMode });
              }}
              className="w-4 h-4 accent-cyan-500"
            />
            <span>Keep screen awake during Hands-Free standby (Wake Lock)</span>
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3.5 text-xs space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-slate-700 dark:text-slate-300">
            <span>
              Browser SpeechRecognition:{' '}
              <strong>
                {handsFreeState.supported ? 'Supported' : 'Unsupported in this browser'}
              </strong>
            </span>
            <span>
              Screen Wake Lock:{' '}
              <strong>{handsFreeState.wakeLockActive ? 'Active' : 'Inactive'}</strong>
            </span>
          </div>
          {handsFreeState.lastHeard && (
            <p className="text-slate-600 dark:text-slate-400">
              Last heard:{' '}
              <span className="font-mono-hud text-cyan-700 dark:text-cyan-300">
                &quot;{handsFreeState.lastHeard}&quot;
              </span>
            </p>
          )}
          {handsFreeState.errorMessage && (
            <p className="text-rose-700 dark:text-rose-300 font-medium">
              {handsFreeState.errorMessage}
            </p>
          )}
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Privacy & PWA Boundary: Continuous wake-word listening runs while this app tab is open and active, uses a configurable {tuningDraft.followUpWindowSec}s follow-up window after replies, and stops on &quot;stop listening&quot;. Browser security prevents PWAs from keeping microphones open when the browser is killed or screen is locked.
          </p>
        </div>
      </section>

      {/* 4. AI Performance Mode */}
      <section className="rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/90 p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>AI Performance Mode & Response Speed</span>
          </h2>
          <span className="font-mono-hud text-[11px] text-slate-500 dark:text-slate-400">
            SSE Token + Sentence TTS Pipeline
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {MODEL_OPTIONS.map((opt) => {
            const active = modelMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChangeModelMode(opt.id);
                  setDraft((prev) => ({ ...prev, modelMode: opt.id }));
                }}
                className={`p-4 rounded-xl border text-left transition-all ${
                  active
                    ? 'border-cyan-500 bg-cyan-500/10 dark:bg-cyan-500/15'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] hover:border-cyan-500/40'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {opt.label}
                </p>
                <p className="mt-0.5 font-mono-hud text-[11px] text-cyan-700 dark:text-cyan-300">
                  {opt.model}
                </p>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                  {opt.subtitle}
                </p>
              </button>
            );
          })}
        </div>

        <label className="inline-flex items-center gap-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(draft.showLatencyTelemetry)}
            onChange={(e) => {
              const next = { ...draft, showLatencyTelemetry: e.target.checked };
              setDraft(next);
              onSaveVoice({ ...next, themeMode, modelMode });
            }}
            className="w-4 h-4 accent-cyan-500"
          />
          <Activity className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span>Show live millisecond telemetry strip on Home HUD</span>
        </label>
      </section>

      {/* 5. Appearance & Theme System */}
      <section className="rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/90 p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            {resolvedTheme === 'dark' ? (
              <Moon className="w-4 h-4 text-cyan-500" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
            <span>Appearance & Theme System</span>
          </h2>
          <span className="font-mono-hud text-[11px] px-2.5 py-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
            ACTIVE: {resolvedTheme.toUpperCase()} ({themeMode.toUpperCase()})
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {THEME_OPTIONS.map((opt) => {
            const active = themeMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChangeThemeMode(opt.id);
                  setDraft((prev) => ({ ...prev, themeMode: opt.id }));
                }}
                className={`p-4 rounded-xl border text-left transition-all ${
                  active
                    ? 'border-cyan-500 bg-cyan-500/10 dark:bg-cyan-500/15 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] hover:border-cyan-500/40'
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <span
                    className={
                      active
                        ? 'text-cyan-600 dark:text-cyan-300'
                        : 'text-slate-500 dark:text-slate-400'
                    }
                  >
                    {opt.icon}
                  </span>
                  <span>{opt.label}</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                  {opt.subtitle}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* 6. Live Integrations Status */}
      <section className="rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/90 p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>AI & Integration Connection Status</span>
          </h2>
          <button
            type="button"
            onClick={checkHealth}
            disabled={checkingHealth}
            className="min-h-[38px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 hover:border-cyan-500 inline-flex items-center gap-1.5"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${checkingHealth ? 'animate-spin' : ''}`}
            />
            <span>Test Connections</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: 'Gemini Intelligence',
              ok: Boolean(health?.geminiConfigured),
              detail: health?.geminiConfigured
                ? 'Active (3.1 Lite / 4 Hydrogen / 3.8 Live)'
                : 'Unavailable',
            },
            {
              label: 'ElevenLabs Male Voice',
              ok: Boolean(health?.elevenLabsConfigured && health?.elevenLabsVoiceIdValid),
              detail: health?.elevenLabsConfigured
                ? `Streaming Ready (${tuningDraft.elevenLabsModelId})`
                : 'Missing ELEVENLABS_API_KEY',
            },
            {
              label: 'Google Account',
              ok: Boolean(user),
              detail: user?.email || 'Not signed in',
            },
            {
              label: 'Gmail & Calendar',
              ok: Boolean(user && hasWorkspaceToken),
              detail:
                user && hasWorkspaceToken
                  ? 'Authorized session active'
                  : 'Sign in to authorize',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  {item.label}
                </span>
                {item.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-400 truncate">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 7. Google Account */}
      <section className="rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/90 p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <h2 className="font-display text-sm font-semibold tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>Google Account & Workspace Session</span>
          </h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            {user
              ? `Signed in as ${user.email}. ${
                  hasWorkspaceToken
                    ? 'Workspace access token active in memory.'
                    : 'Re-authenticate to refresh Workspace OAuth token.'
                }`
              : 'Connect your Google account for Calendar, Gmail, Drive, Docs, Sheets, Slides, Tasks, Meet, and Contacts.'}
          </p>
        </div>

        {user ? (
          <div className="flex items-center gap-2">
            {!hasWorkspaceToken && (
              <button
                type="button"
                onClick={onGoogleSignIn}
                className="min-h-[44px] px-4 rounded-xl bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300"
              >
                Reconnect Workspace
              </button>
            )}
            <button
              type="button"
              onClick={onGoogleSignOut}
              className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onGoogleSignIn}
            className="gsi-material-button"
          >
            <div className="gsi-material-button-state" />
            <div className="gsi-material-button-content-wrapper">
              <div className="gsi-material-button-icon">
                <svg
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  style={{ display: 'block' }}
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
              </div>
              <span className="gsi-material-button-contents">
                Sign in with Google
              </span>
            </div>
          </button>
        )}
      </section>

      {/* 8. Developer Identity & Verified Technical Information */}
      <section className="rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/90 p-5 space-y-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            <h2 className="font-display text-sm sm:text-base font-semibold tracking-wider text-slate-900 dark:text-slate-100">
              Developer Identity & Verified Technical Information
            </h2>
          </div>
          <span className="font-mono-hud text-[11px] px-2.5 py-1 rounded-md border border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            VERIFIED FROM SOURCE
          </span>
        </div>

        <div className="rounded-xl border border-cyan-500/30 bg-cyan-50 dark:bg-cyan-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <UserCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>
                {DEVELOPER_IDENTITY.assistantName} — {DEVELOPER_IDENTITY.fullName}
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300">
              Creator & Developer: <strong>{DEVELOPER_IDENTITY.developerName}</strong>
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-cyan-800 dark:text-cyan-200 font-mono-hud">
            <Sparkles className="w-3.5 h-3.5" />
            <span>EN / HI / UR Identity Locked</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {specCategories.map((cat) => (
            <div
              key={cat}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-4 space-y-2.5"
            >
              <h3 className="font-mono-hud text-[11px] uppercase tracking-widest text-cyan-700 dark:text-cyan-300 font-semibold">
                {cat}
              </h3>
              <div className="space-y-2">
                {TECHNICAL_SPEC_ITEMS.filter((item) => item.category === cat).map(
                  (item) => (
                    <div key={item.label} className="text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {item.label}:{' '}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400">
                        {item.value}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <Info className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>Verified Project Structure</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
            {VERIFIED_TECHNICAL_KNOWLEDGE.folderStructure.map((entry) => (
              <div key={entry} className="truncate" title={entry}>
                {entry}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
