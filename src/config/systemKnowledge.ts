/**
 * Verified Developer Identity & Complete Technical Knowledge Configuration
 * Synchronized strictly against actual project configuration and source files.
 */

export const DEVELOPER_IDENTITY = {
  developerName: 'Asif Qureshi',
  assistantName: 'J.A.R.V.I.S',
  fullName: 'Just A Rather Very Intelligent System',
  englishResponse:
    'I was created and developed by Asif Qureshi, Sir. I am J.A.R.V.I.S, your personal AI assistant.',
  hindiUrduResponse:
    'Mujhe Asif Qureshi ne develop kiya hai, Sir. Main J.A.R.V.I.S hoon, aapka personal AI assistant.',
  strictRule:
    'Never invent the developer’s qualifications, company, achievements, or unverified biographical history.',
} as const;

export interface TechnicalSpecItem {
  label: string;
  value: string;
  category: 'Core' | 'AI & Voice' | 'Data & Auth' | 'Platform & Build';
}

export const VERIFIED_TECHNICAL_KNOWLEDGE = {
  applicationType:
    'Full-Stack Progressive Web App (PWA) & Web Application (not a native Android Studio / Kotlin Gradle APK)',
  programmingLanguages: ['TypeScript 7.0.2', 'JavaScript (ESM)', 'CSS3 (Tailwind CSS v4)'],
  frontendStack: [
    'React 19.0.1',
    'React DOM 19.0.1',
    'Vite 8.3.0',
    'Tailwind CSS 4.3.3 (@tailwindcss/vite)',
    'Lucide React 0.546.0',
    'Motion 12.23.24',
    '@vis.gl/react-google-maps 1.10.2',
  ],
  backendStack: [
    'Node.js + Express 4.21.2 (server.ts via tsx 4.21.0)',
    'WebSocket bridge (ws 8.23.0 on /ws/live)',
    'Server-Sent Events (SSE) streaming (/api/jarvis/chat/stream)',
  ],
  databaseAndStorage: [
    'Firebase Cloud Firestore 13.4.0 (Database ID: ai-studio-dba2849e-6a5b-4507-8510-cd7086ef15ef, Project: gen-lang-client-0689307187)',
    'Browser localStorage for instant theme & UI preference hydration',
  ],
  authenticationSystem: [
    'Firebase Authentication (Google Sign-In OAuth 2.0 popup)',
    'In-memory scoped Google Workspace OAuth access tokens',
    'AES-256-GCM encrypted Creator Studio OAuth sessions',
  ],
  aiModelsAndProviders: {
    primarySdk: '@google/genai 3.6.1',
    fastModeModel: 'gemini-3.1-flash-lite (low-latency fast path)',
    balancedModeModel: 'gemini-4-hydrogen (ThinkingLevel.MEDIUM + Search/Maps/Tools)',
    reasoningModeModel: 'gemini-4-hydrogen (ThinkingLevel.XHIGH deep reasoning)',
    liveVoiceModel: 'gemini-3.8-live (real-time bidirectional audio)',
    transcriptionModel: 'gemini-3.5-transcribe (with multimodal fallback)',
    creatorProviders: 'Google Gemini + optional Anthropic Claude API + Runway/Pexels',
  },
  voiceRecognitionEngine: [
    'Web Speech API + real-time Web Audio VAD (500–900ms silence end-of-speech) for continuous "Hey Jarvis" hands-free & follow-up conversation',
    'Push-to-Talk MediaRecorder with VAD auto-stop transcribed via cached Gemini STT',
    'Gemini Live API real-time 16kHz PCM audio WebSocket',
  ],
  ttsEngine: [
    'ElevenLabs Streaming Male Voice Primary (eleven_flash_v2_5 / turbo_v2_5 / multilingual_v2, Voice ID uuyFQegRan8rpIQCGu9K)',
    'Optional Gemini Male Neural TTS (gemini-3.8-flash-lite-tts — Charon, Fenrir, Puck)',
  ],
  apiIntegrations: [
    'Google Workspace (Gmail, Calendar, Drive, Docs, Sheets, Slides, Tasks, Meet, Contacts, Forms)',
    'Google Maps Platform & Gemini Maps Grounding',
    'Google News RSS feeds (technology, ai, business, world, science)',
    'Creator Studio (YouTube Data/Analytics, Meta Instagram & Facebook Graph, X, LinkedIn, Telegram Bot)',
  ],
  memoryImplementation:
    'User-isolated Firestore subcollections (users/{uid}/memories, users/{uid}/messages, users/{uid}/notes, users/{uid}/tasks, users/{uid}/settings) with regex secret filtering.',
  pwaAndDeviceCapabilities: [
    'vite-plugin-pwa 2.0.0 with Workbox service worker & standalone manifest (192x192 & 512x512 maskable icons)',
    'Installable on Android Chrome as WebAPK (Add to Home Screen)',
    'Web APIs: Microphone, Camera (getUserMedia), Geolocation, Screen Wake Lock, Notifications, Tel/Mailto/Android intent:// deep links',
    'Native Android Notice: This repository contains no android/ Gradle project or AndroidManifest.xml (no minSdk/targetSdk/APK build); hardware radio toggles (Wi-Fi/Bluetooth) and killed-state background wake-word are browser-sandboxed.',
  ],
  buildAndLint: [
    'Bundler: Vite 8.3.0 (npm run build -> dist/)',
    'Typecheck: TypeScript 7.0.2 (tsc --noEmit)',
    'Security Rules Lint: ESLint 10.15.0 + @firebase/eslint-plugin-security-rules',
  ],
  folderStructure: [
    'src/App.tsx — Main HUD orchestrator, voice pipelines, navigation',
    'src/config/systemKnowledge.ts — Developer identity & verified technical architecture',
    'src/components/ — Orb, Chat, Memory, Soul, Workspace, Maps, Settings, Headlines, Tasks, Camera, Calculator',
    'src/components/creator/ — 14-section Creator Studio module',
    'src/hooks/ — useTheme, useHandsFreeVoice, useOnlineStatus, usePWAInstall',
    'src/lib/ — localCommandRouter, deviceControl, firebase, workspaceApi, creatorApi',
    'server.ts & server/ — Express REST + SSE streaming + Gemini Live WebSocket + Creator routes',
    'public/ — PWA icons & manifest assets',
  ],
} as const;

export const TECHNICAL_SPEC_ITEMS: TechnicalSpecItem[] = [
  {
    category: 'Core',
    label: 'Assistant & Creator',
    value: 'J.A.R.V.I.S (Just A Rather Very Intelligent System) · Developer: Asif Qureshi',
  },
  {
    category: 'Core',
    label: 'Architecture',
    value: 'Full-Stack React 19 + Express + WebSocket Progressive Web App (PWA)',
  },
  {
    category: 'Core',
    label: 'Languages',
    value: 'TypeScript 7.0.2, JavaScript (ESM), CSS3 (Tailwind CSS 4.3.3)',
  },
  {
    category: 'Core',
    label: 'Frontend Stack',
    value: 'React 19.0.1, Vite 8.3.0, Lucide React, Motion, @vis.gl/react-google-maps',
  },
  {
    category: 'Core',
    label: 'Backend Stack',
    value: 'Node.js, Express 4.21.2 (server.ts via tsx), ws 8.23.0 (/ws/live)',
  },
  {
    category: 'AI & Voice',
    label: 'AI SDK & Models',
    value:
      '@google/genai 3.6.1 · Fast: gemini-3.1-flash-lite · Balanced/Reasoning: gemini-4-hydrogen (MEDIUM/XHIGH) · Live: gemini-3.8-live',
  },
  {
    category: 'AI & Voice',
    label: 'Voice Recognition (STT)',
    value: 'Web Speech API (Hands-Free "Hey Jarvis") + MediaRecorder -> gemini-3.5-transcribe',
  },
  {
    category: 'AI & Voice',
    label: 'Voice Synthesis (TTS)',
    value:
      'ElevenLabs Streaming Male Voice Primary (eleven_flash_v2_5, no female fallback) & Optional Gemini Male TTS (Charon/Fenrir/Puck)',
  },
  {
    category: 'Data & Auth',
    label: 'Database & Memory',
    value:
      'Firebase Cloud Firestore 13.4.0 (users/{uid}/memories, tasks, notes, messages, settings, creator*)',
  },
  {
    category: 'Data & Auth',
    label: 'Authentication',
    value: 'Firebase Auth (Google OAuth 2.0 Popup) + In-memory Workspace Tokens',
  },
  {
    category: 'Data & Auth',
    label: 'API Integrations',
    value:
      'Google Workspace (Gmail/Calendar/Drive/Docs/Sheets/Tasks/Meet/Contacts), Google Maps, News RSS, Creator Social APIs',
  },
  {
    category: 'Platform & Build',
    label: 'PWA & Android Support',
    value:
      'vite-plugin-pwa 2.0.0 standalone WebAPK (no native Gradle APK / minSdk in this web codebase; uses Web APIs & URI deep links)',
  },
  {
    category: 'Platform & Build',
    label: 'Build & Linting',
    value: 'npm run build (Vite -> dist/), tsc --noEmit, ESLint 10 + Firebase Security Rules plugin',
  },
];

export function buildVerifiedArchitecturePrompt(activeModelMode: string, voiceEngine: string): string {
  return [
    `MANDATORY DEVELOPER IDENTITY:`,
    `- Assistant Name: ${DEVELOPER_IDENTITY.assistantName} (${DEVELOPER_IDENTITY.fullName})`,
    `- Creator / Developer: ${DEVELOPER_IDENTITY.developerName}`,
    `- When asked who created, developed, owns, or programmed you (or who Asif Qureshi is), answer naturally:`,
    `  English: "${DEVELOPER_IDENTITY.englishResponse}"`,
    `  Hindi/Urdu: "${DEVELOPER_IDENTITY.hindiUrduResponse}"`,
    `- ${DEVELOPER_IDENTITY.strictRule}`,
    ``,
    `VERIFIED PROJECT TECHNICAL ARCHITECTURE (Do NOT guess or invent specs):`,
    `- Runtime Type: ${VERIFIED_TECHNICAL_KNOWLEDGE.applicationType}`,
    `- Languages: ${VERIFIED_TECHNICAL_KNOWLEDGE.programmingLanguages.join(', ')}`,
    `- Frontend: ${VERIFIED_TECHNICAL_KNOWLEDGE.frontendStack.join(', ')}`,
    `- Backend: ${VERIFIED_TECHNICAL_KNOWLEDGE.backendStack.join(', ')}`,
    `- Database: ${VERIFIED_TECHNICAL_KNOWLEDGE.databaseAndStorage.join('; ')}`,
    `- Auth: ${VERIFIED_TECHNICAL_KNOWLEDGE.authenticationSystem.join('; ')}`,
    `- Active AI Performance Mode: ${activeModelMode} | Models: Fast=${VERIFIED_TECHNICAL_KNOWLEDGE.aiModelsAndProviders.fastModeModel}; Balanced=${VERIFIED_TECHNICAL_KNOWLEDGE.aiModelsAndProviders.balancedModeModel}; Reasoning=${VERIFIED_TECHNICAL_KNOWLEDGE.aiModelsAndProviders.reasoningModeModel}; Live=${VERIFIED_TECHNICAL_KNOWLEDGE.aiModelsAndProviders.liveVoiceModel}`,
    `- Active Voice Engine: ${voiceEngine} | TTS options: ${VERIFIED_TECHNICAL_KNOWLEDGE.ttsEngine.join('; ')}`,
    `- Voice Recognition: ${VERIFIED_TECHNICAL_KNOWLEDGE.voiceRecognitionEngine.join('; ')}`,
    `- Memory System: ${VERIFIED_TECHNICAL_KNOWLEDGE.memoryImplementation}`,
    `- Android/Native Truth: There is no Android Studio Gradle/Kotlin project or minSdk/targetSdk in this codebase; it runs as a Web & Android Chrome installable PWA.`,
  ].join('\n');
}
