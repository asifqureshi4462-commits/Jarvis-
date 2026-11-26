export type OrbState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'SPEAKING'
  | 'EXECUTING'
  | 'ERROR'
  | 'DISCONNECTED'
  | 'STOPPED';

export type NavSection =
  | 'dashboard'
  | 'memory'
  | 'chat'
  | 'soul'
  | 'workspace'
  | 'creator'
  | 'maps'
  | 'settings';

export type ModelMode = 'fast' | 'balanced' | 'deep';

export type ThemeMode = 'dark' | 'light' | 'system';

export type ElevenLabsModelId =
  | 'eleven_flash_v2_5'
  | 'eleven_turbo_v2_5'
  | 'eleven_multilingual_v2';

export interface VoiceTuningConfig {
  elevenLabsModelId: ElevenLabsModelId;
  volume: number; // 0.1 to 1.5
  vadSilenceMs: number; // 500 to 900
  bargeInEnabled: boolean;
  followUpWindowSec: number; // 0 to 20
}

export interface LatencyTelemetry {
  eosDetectionMs?: number;
  sttMs?: number;
  routeMs: number;
  aiFirstTokenMs?: number;
  aiTotalMs?: number;
  toolExecMs?: number;
  ttsFirstChunkMs?: number;
  ttsMs?: number;
  firstAudibleMs?: number;
  audioStartMs?: number;
  totalMs: number;
  path: 'local_fast_path' | 'streaming_ai' | 'live_voice' | 'error';
  modelUsed?: string;
  voiceEngineUsed?: string;
  timestamp?: string;
  queryPreview?: string;
}

export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
  maps?: {
    uri?: string;
    title?: string;
    placeAnswerSources?: {
      reviewSnippets?: Array<{
        content?: string;
        author?: string;
      }>;
    };
  };
}

export interface MemoryItem {
  id: string;
  userId: string;
  content: string;
  category: 'preference' | 'fact' | 'project' | 'contact' | 'routine';
  importance: 'low' | 'medium' | 'high';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TaskItem {
  id: string;
  userId: string;
  title: string;
  completed: boolean;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  reminderAt?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  userId: string;
  role: 'user' | 'assistant';
  text: string;
  language?: string;
  modelUsed?: string;
  groundingChunks?: GroundingChunk[];
  telemetry?: LatencyTelemetry;
  createdAt?: unknown;
}

export interface NoteItem {
  id: string;
  userId: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SoulConfig {
  assistantName: string;
  addressTitle: string;
  personalityTone: string;
  languages: string[];
  customDirectives: string;
}

export interface VoiceSettings {
  voiceEngine: 'gemini' | 'elevenlabs';
  geminiVoiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  elevenLabsVoiceId: string;
  stability: number;
  similarity: number;
  speed: number;
  autoSpeak: boolean;
  wakeWordEnabled: boolean;
  themeMode?: ThemeMode;
  modelMode?: ModelMode;
  showLatencyTelemetry?: boolean;
  keepScreenAwake?: boolean;
}

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
}

export interface AlarmTimer {
  id: string;
  label: string;
  endsAt: number;
  triggered: boolean;
}

export interface ConfirmDialogState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => Promise<void> | void;
}
