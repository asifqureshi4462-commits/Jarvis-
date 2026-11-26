import {
  DEVELOPER_IDENTITY,
  VERIFIED_TECHNICAL_KNOWLEDGE,
} from '../config/systemKnowledge';
import type { ModelMode, NavSection, ThemeMode } from '../types/jarvis';
import type { DeviceTarget } from './deviceControl';

export type LocalRouteAction =
  | { type: 'reply_only'; reply: string; language?: string }
  | { type: 'set_theme'; theme: ThemeMode; reply: string }
  | { type: 'set_model_mode'; mode: ModelMode; reply: string }
  | { type: 'stop_hands_free'; reply: string }
  | { type: 'device_action'; target: DeviceTarget; query?: string; reply?: string }
  | { type: 'navigate'; panel: NavSection; reply: string };

export interface LocalRouterContext {
  addressTitle: string;
  modelMode: ModelMode;
  voiceEngine: 'gemini' | 'elevenlabs';
}

function isHindiOrUrduText(input: string): boolean {
  return (
    /[\u0900-\u097F\u0600-\u06FF]/.test(input) ||
    /\b(aapko|tumhe|tumhara|kisne|banaya|kaun|khol|kholo|chalao|dikhao|karo|bhai|yaar|band|mein|banaye|gaye|kaise|kya|batao|banao|lagao)\b/i.test(
      input
    )
  );
}

function isCreatorQuery(q: string): boolean {
  return (
    /(who\s+(created|developed|made|built|owns|programmed|invented)\s+(you|jarvis)|who\s+is\s+(your\s+)?(developer|creator|maker|owner|programmer)|who\s+is\s+asif\s+qureshi|aapko\s+kisne\s+banaya|tumhe\s+kisne\s+banaya|tumhara\s+(creator|developer|malik|owner)\s+(kaun|kon)|kisne\s+banaya\s+(hai|tha|tujhe|tumhe|aapko)|asif\s+qureshi\s+kaun)/i.test(
      q
    )
  );
}

function isTechnicalArchitectureQuery(q: string): boolean {
  return (
    /(what|which|kis)\s+(programming\s+language|language\s+mein|tech\s+stack|architecture|database|ai\s+model|model\s+do\s+you\s+use|voice\s+engine|backend|frontend|framework)/i.test(
      q
    ) ||
    /(tum\s+kis\s+programming\s+language|kis\s+language\s+mein\s+banaye|what\s+database\s+do\s+you\s+use|what\s+is\s+your\s+(tech\s+stack|architecture|minimum\s+sdk|package\s+name))/i.test(
      q
    )
  );
}

/**
 * Deterministic < 15ms multilingual NLU router for instant local commands, identity,
 * verified technical architecture answers, and device/app launches.
 * Returns null if the query needs Gemini intelligence.
 */
export function routeLocalCommand(
  rawInput: string,
  ctx: LocalRouterContext
): LocalRouteAction | null {
  const text = rawInput.trim();
  if (!text) return null;
  const q = text.toLowerCase();
  const title = ctx.addressTitle || 'Sir';
  const hiUr = isHindiOrUrduText(text);

  // 1. Mandatory Developer Identity
  if (isCreatorQuery(q)) {
    return {
      type: 'reply_only',
      reply: hiUr
        ? DEVELOPER_IDENTITY.hindiUrduResponse
        : DEVELOPER_IDENTITY.englishResponse,
      language: hiUr ? 'Hindi/Urdu' : 'English',
    };
  }

  // 2. Verified Technical Architecture Queries
  if (isTechnicalArchitectureQuery(q)) {
    const activeModelDesc =
      ctx.modelMode === 'fast'
        ? VERIFIED_TECHNICAL_KNOWLEDGE.aiModelsAndProviders.fastModeModel
        : ctx.modelMode === 'deep'
          ? VERIFIED_TECHNICAL_KNOWLEDGE.aiModelsAndProviders.reasoningModeModel
          : VERIFIED_TECHNICAL_KNOWLEDGE.aiModelsAndProviders.balancedModeModel;

    if (/(database|firestore|db)/i.test(q)) {
      return {
        type: 'reply_only',
        reply: hiUr
          ? `Main Firebase Cloud Firestore (Database ID: ai-studio-dba2849e-6a5b-4507-8510-cd7086ef15ef) aur local preference storage ka istemal karta hoon, ${title}.`
          : `I use Firebase Cloud Firestore 13.4.0 (Database ID: ai-studio-dba2849e-6a5b-4507-8510-cd7086ef15ef) with user-isolated collections for memories, tasks, notes, messages, settings, and Creator Studio, plus localStorage for instant theme hydration, ${title}.`,
      };
    }

    if (/(ai\s+model|model\s+do\s+you\s+use|kaun\s+sa\s+model)/i.test(q)) {
      return {
        type: 'reply_only',
        reply: `I am currently running in "${ctx.modelMode.toUpperCase()}" performance mode using ${activeModelDesc} via @google/genai 3.6.1, with gemini-3.8-live for real-time audio and ${ctx.voiceEngine === 'elevenlabs' ? 'ElevenLabs' : 'Gemini Neural TTS'} for speech output, ${title}.`,
      };
    }

    if (/(programming\s+language|language\s+mein|banaye\s+gaye)/i.test(q)) {
      return {
        type: 'reply_only',
        reply: hiUr
          ? `Mujhe TypeScript 7.0.2, JavaScript (ESM), aur CSS3 (Tailwind CSS v4) mein banaya gaya hai, ${title}. Mera frontend React 19 + Vite 8 par aur backend Node.js + Express 4 par chalta hai.`
          : `I am built with TypeScript 7.0.2, JavaScript (ESM), and CSS3 (Tailwind CSS v4) — running React 19 + Vite 8 on the frontend and Node.js + Express 4 + WebSockets on the backend, ${title}.`,
      };
    }

    return {
      type: 'reply_only',
      reply: `Verified Architecture, ${title}: Full-Stack PWA written in TypeScript 7.0.2 (React 19, Vite 8, Tailwind CSS v4, Express 4.21, ws 8.23), backed by Firebase Cloud Firestore & Google OAuth, powered by @google/genai 3.6.1 (currently ${activeModelDesc}).`,
    };
  }

  // 3. Stop Listening / Hands-Free Shutdown
  if (
    /^(?:jarvis\s+)?(?:stop\s+listening|go\s+to\s+sleep|stand\s+down|mute\s+wake\s*word|listening\s+band\s+karo|sunna\s+band\s+karo|chup\s+ho\s+jao)\b/i.test(
      q
    )
  ) {
    return {
      type: 'stop_hands_free',
      reply: hiUr
        ? `Theek hai ${title}, hands-free listening band kar di hai.`
        : `Standing down continuous voice listening, ${title}. Tap the orb anytime you need me.`,
    };
  }

  // 4. Theme Switching
  if (/\b(light\s*mode|day\s*mode|bright\s*theme)\b/i.test(q) && /\b(on|enable|switch|turn|use|lagao|karo|set)\b/i.test(q)) {
    return {
      type: 'set_theme',
      theme: 'light',
      reply: `Switched interface to Light Mode, ${title}.`,
    };
  }
  if (/\b(dark\s*mode|night\s*mode|dark\s*theme)\b/i.test(q) && /\b(on|enable|switch|turn|use|lagao|karo|set)\b/i.test(q)) {
    return {
      type: 'set_theme',
      theme: 'dark',
      reply: `Switched interface to Dark Mode, ${title}.`,
    };
  }
  if (/\b(system\s*(?:default|theme|mode)|default\s*mode)\b/i.test(q) && /\b(on|enable|switch|turn|use|lagao|karo|set)\b/i.test(q)) {
    return {
      type: 'set_theme',
      theme: 'system',
      reply: `Set theme to follow your device system appearance automatically, ${title}.`,
    };
  }

  // 5. Performance Mode Switching
  if (/\b(fast\s*mode|speed\s*mode)\b/i.test(q) && /\b(on|enable|switch|turn|use|set)\b/i.test(q)) {
    return {
      type: 'set_model_mode',
      mode: 'fast',
      reply: `Fast Mode activated (gemini-3.1-flash-lite), ${title}.`,
    };
  }
  if (/\b(balanced\s*mode)\b/i.test(q) && /\b(on|enable|switch|turn|use|set)\b/i.test(q)) {
    return {
      type: 'set_model_mode',
      mode: 'balanced',
      reply: `Balanced Mode activated (gemini-4-hydrogen), ${title}.`,
    };
  }
  if (/\b(reasoning\s*mode|deep\s*mode|advanced\s*reasoning)\b/i.test(q) && /\b(on|enable|switch|turn|use|set)\b/i.test(q)) {
    return {
      type: 'set_model_mode',
      mode: 'deep',
      reply: `Advanced Reasoning Mode activated (gemini-4-hydrogen XHIGH), ${title}.`,
    };
  }

  // 6. Alarms & Timers (English + Hindi/Urdu)
  if (
    /\b(set\s+(?:an?\s+)?(?:alarm|timer)|wake\s+me\s+up|alarm\s+(?:lagao|set\s*karo)|timer\s+(?:lagao|set\s*karo))\b/i.test(
      q
    )
  ) {
    return {
      type: 'device_action',
      target: 'alarm',
      query: text,
    };
  }

  // 7. Ambiguous App Reference Clarification ("open my video app")
  if (/\b(my\s+video\s+app|video\s+app\s+kholo)\b/i.test(q)) {
    return {
      type: 'reply_only',
      reply: `Did you want me to open YouTube or J.A.R.V.I.S Creator Studio (AI Video Creator), ${title}? Say "Open YouTube" or "Open Creator Studio".`,
    };
  }

  // 8. Hardware Radio Toggles (Bluetooth / Wi-Fi) — honest sandbox limit or Android Settings intent
  if (
    /\b(open|launch|turn\s+on|turn\s+off|enable|disable|toggle|connect|switch\s+on|switch\s+off|on\s+karo|band\s+karo|kholo|chalao)\b/i.test(
      q
    )
  ) {
    if (/\bbluetooth\b/i.test(q)) {
      return { type: 'device_action', target: 'bluetooth' };
    }
    if (/\bwi-?fi\b/i.test(q)) {
      return { type: 'device_action', target: 'wifi' };
    }
  }

  // 9. Multilingual App / Device Open Intents
  const isOpenCommand =
    /\b(open|launch|start|run|show|go\s+to|khol|kholo|khol\s+kar\s+do|chalao|chala\s+do|dikhao)\b/i.test(
      q
    );

  if (isOpenCommand) {
    if (/\byoutube\b/i.test(q)) {
      const searchMatch = text.match(/(?:search|play|for|par)\s+(.+?)(?:\s+on\s+youtube|\s+youtube|$)/i);
      return {
        type: 'device_action',
        target: 'youtube',
        query: searchMatch?.[1]?.trim(),
      };
    }
    if (/\binstagram\b/i.test(q)) {
      return { type: 'device_action', target: 'instagram' };
    }
    if (/\bfacebook\b/i.test(q)) {
      return { type: 'device_action', target: 'facebook' };
    }
    if (/\bwhatsapp\b/i.test(q)) {
      return { type: 'device_action', target: 'whatsapp' };
    }
    if (/\b(chrome|browser|google)\b/i.test(q) && !/\bgoogle\s*(maps|drive|calendar|meet|tasks|workspace)\b/i.test(q)) {
      return { type: 'device_action', target: 'browser' };
    }
    if (/\bcamera\b/i.test(q)) {
      return { type: 'device_action', target: 'camera' };
    }
    if (/\b(gallery|photos)\b/i.test(q)) {
      return { type: 'device_action', target: 'gallery' };
    }
    if (/\bcalculator\b/i.test(q)) {
      return { type: 'device_action', target: 'calculator' };
    }
    if (/\bbluetooth\b/i.test(q)) {
      return { type: 'device_action', target: 'bluetooth' };
    }
    if (/\bwi-?fi\b/i.test(q)) {
      return { type: 'device_action', target: 'wifi' };
    }
    if (/\bcreator\s*studio\b/i.test(q)) {
      return { type: 'navigate', panel: 'creator', reply: `Opening Creator Studio, ${title}.` };
    }
    if (/\bmemory\b/i.test(q)) {
      return { type: 'navigate', panel: 'memory', reply: `Opening Memory Core, ${title}.` };
    }
    if (/\bworkspace\b/i.test(q)) {
      return { type: 'navigate', panel: 'workspace', reply: `Opening Workspace Hub, ${title}.` };
    }
    if (/\b(gmail|email|mail)\b/i.test(q)) {
      return { type: 'device_action', target: 'gmail' };
    }
    if (/\bcalendar\b/i.test(q)) {
      return { type: 'device_action', target: 'calendar' };
    }
    if (/\bmaps?\b/i.test(q)) {
      return { type: 'device_action', target: 'maps' };
    }
    if (/\bsettings?\b/i.test(q)) {
      return { type: 'device_action', target: 'settings' };
    }
    if (/\bsoul\b/i.test(q)) {
      return { type: 'navigate', panel: 'soul', reply: `Opening SOUL Personality Core, ${title}.` };
    }
  }

  // Play X on YouTube direct pattern
  const ytPlayMatch = text.match(/^(?:play|chalao|search)\s+(.+?)\s+on\s+youtube$/i);
  if (ytPlayMatch) {
    return {
      type: 'device_action',
      target: 'youtube',
      query: ytPlayMatch[1].trim(),
    };
  }

  // Call phone number pattern (always triggers confirm modal)
  const callMatch = text.match(/^(?:call|dial|phone)\s+([+\d][\d\s()-]{4,})$/i);
  if (callMatch) {
    return {
      type: 'device_action',
      target: 'phone',
      query: callMatch[1].trim(),
    };
  }

  return null;
}
