import type { ElevenLabsModelId, VoiceTuningConfig } from '../types/jarvis';

const TUNING_STORAGE_KEY = 'jarvis_voice_tuning_v1';

export const DEFAULT_VOICE_TUNING: VoiceTuningConfig = {
  elevenLabsModelId: 'eleven_flash_v2_5',
  volume: 1.0,
  vadSilenceMs: 650,
  bargeInEnabled: true,
  followUpWindowSec: 12,
};

const VALID_EL_MODELS: ElevenLabsModelId[] = [
  'eleven_flash_v2_5',
  'eleven_turbo_v2_5',
  'eleven_multilingual_v2',
];

export function loadVoiceTuning(): VoiceTuningConfig {
  try {
    const raw = localStorage.getItem(TUNING_STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_TUNING;
    const parsed = JSON.parse(raw) as Partial<VoiceTuningConfig>;
    return {
      elevenLabsModelId: VALID_EL_MODELS.includes(
        parsed.elevenLabsModelId as ElevenLabsModelId
      )
        ? (parsed.elevenLabsModelId as ElevenLabsModelId)
        : DEFAULT_VOICE_TUNING.elevenLabsModelId,
      volume:
        typeof parsed.volume === 'number'
          ? Math.min(1.5, Math.max(0.1, parsed.volume))
          : DEFAULT_VOICE_TUNING.volume,
      vadSilenceMs:
        typeof parsed.vadSilenceMs === 'number'
          ? Math.min(900, Math.max(500, Math.round(parsed.vadSilenceMs)))
          : DEFAULT_VOICE_TUNING.vadSilenceMs,
      bargeInEnabled:
        typeof parsed.bargeInEnabled === 'boolean'
          ? parsed.bargeInEnabled
          : DEFAULT_VOICE_TUNING.bargeInEnabled,
      followUpWindowSec:
        typeof parsed.followUpWindowSec === 'number'
          ? Math.min(20, Math.max(0, Math.round(parsed.followUpWindowSec)))
          : DEFAULT_VOICE_TUNING.followUpWindowSec,
    };
  } catch {
    return DEFAULT_VOICE_TUNING;
  }
}

export function saveVoiceTuning(next: VoiceTuningConfig): VoiceTuningConfig {
  const sanitized: VoiceTuningConfig = {
    elevenLabsModelId: VALID_EL_MODELS.includes(next.elevenLabsModelId)
      ? next.elevenLabsModelId
      : DEFAULT_VOICE_TUNING.elevenLabsModelId,
    volume: Math.min(1.5, Math.max(0.1, Number(next.volume) || 1.0)),
    vadSilenceMs: Math.min(
      900,
      Math.max(500, Math.round(Number(next.vadSilenceMs) || 650))
    ),
    bargeInEnabled: Boolean(next.bargeInEnabled),
    followUpWindowSec: Math.min(
      20,
      Math.max(0, Math.round(Number(next.followUpWindowSec) ?? 12))
    ),
  };
  try {
    localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // Ignore storage failures
  }
  return sanitized;
}
