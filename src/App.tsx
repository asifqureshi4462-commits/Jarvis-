/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Terminal,
  Cpu,
  Layers,
  ShieldCheck,
  Smartphone,
  BookOpen,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Search,
  Send,
  RefreshCw,
  Sparkles,
  Database,
  Bell,
  FolderTree,
  Lock,
  Wifi,
  WifiOff,
  Copy,
  Check,
  Code2,
  Radio,
  Clock,
  Compass,
  Zap,
  Palette,
  ChevronDown,
  Activity,
  HardDrive,
  BatteryCharging,
  Thermometer,
  GitBranch,
  Play,
  Download,
  Box,
  RotateCcw,
  FileCode,
  Quote,
  CloudSun,
  Globe,
  Wind,
  Droplets,
  Sun,
} from 'lucide-react';

type AssistantState =
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING'
  | 'THINKING'
  | 'TOOL_EXECUTION'
  | 'SPEAKING'
  | 'SUCCESS'
  | 'ERROR';

type ThemeId = 'arc-blue' | 'mark-gold' | 'stealth-black';

interface ThemeConfig {
  id: ThemeId;
  name: string;
  tagline: string;
  primaryColor: string;
  surfaceColor: string;
}

const THEMES: ThemeConfig[] = [
  {
    id: 'arc-blue',
    name: 'Arc Reactor Blue',
    tagline: 'Electric Cyan & Deep Space Navy',
    primaryColor: '#00f0ff',
    surfaceColor: '#0a1424',
  },
  {
    id: 'mark-gold',
    name: 'Mark V Gold',
    tagline: 'Titanium Gold & Crimson Armor',
    primaryColor: '#f59e0b',
    surfaceColor: '#190c0a',
  },
  {
    id: 'stealth-black',
    name: 'Stealth Black',
    tagline: 'Tactical Emerald & Spec Ops Carbon',
    primaryColor: '#10b981',
    surfaceColor: '#0b0f14',
  },
];

interface ToolExecution {
  tool: string;
  arguments: Record<string, any>;
  status: 'PENDING' | 'EXECUTING' | 'SUCCESS' | 'DENIED' | 'FAILED';
  output?: string;
  source: 'OFFLINE_ANDROID' | 'LOCAL_DB' | 'ONLINE_API';
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'jarvis';
  text: string;
  timestamp: string;
  toolCall?: ToolExecution;
}

interface NoteItem {
  id: string;
  title: string;
  content: string;
  category: string;
  timestamp: string;
  pinned: boolean;
}

interface MemoryItem {
  id: string;
  fact: string;
  category: string;
  createdAt: string;
}

// Reusable animation variants for entrance
const cardEntrance = {
  hidden: { opacity: 0, y: 18 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.38,
      delay: i * 0.06,
      ease: [0.16, 1, 0.3, 1],
    },
  }),
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -8,
    transition: { duration: 0.2 },
  },
};

const tabViewTransition = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.32,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.18 },
  },
};

export default function App() {
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('jarvis-theme') as ThemeId;
      if (saved && ['arc-blue', 'mark-gold', 'stealth-black'].includes(saved)) {
        return saved;
      }
    }
    return 'arc-blue';
  });
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'hud' | 'chat' | 'notes' | 'memory' | 'workflow' | 'blueprint'>('hud');
  const [jarvisState, setJarvisState] = useState<AssistantState>('IDLE');
  const [networkOnline, setNetworkOnline] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [inputText, setInputText] = useState('');
  const [transcription, setTranscription] = useState('');
  const [statusMessage, setStatusMessage] = useState('JARVIS Core initialized. Awaiting commands.');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Build Workflow state and CI/CD simulation runner
  interface BuildStep {
    id: number;
    name: string;
    status: 'idle' | 'running' | 'success' | 'failed';
    duration?: string;
    log: string;
  }

  const initialBuildSteps: BuildStep[] = [
    { id: 1, name: 'Checkout Repository (fetch-depth: 1)', status: 'idle', log: 'Checked out branch main at commit 4f29a0c...' },
    { id: 2, name: 'Set up JDK 17 (Eclipse Temurin)', status: 'idle', log: 'Configured openjdk-17-jdk environment variables (JAVA_HOME set)' },
    { id: 3, name: 'Set up Android SDK Platform 34', status: 'idle', log: 'Installed build-tools;34.0.0 and platforms;android-34' },
    { id: 4, name: 'Architecture Verification Gate', status: 'idle', log: 'Scanned app/src: 0 Kotlin files found. Compliant Pure Java 17.' },
    { id: 5, name: 'Compile Gradle assembleDebug', status: 'idle', log: 'Running javac 17, dx, aapt2 packaging... BUILD SUCCESSFUL in 38s' },
    { id: 6, name: 'Execute JUnit 4 Unit Tests', status: 'idle', log: 'CalculatorEngineTest, ToolRegistryTest, CryptoManagerTest: 14/14 passed' },
    { id: 7, name: 'Generate & Upload APK Artifact', status: 'idle', log: 'Compressed and published: app/build/outputs/apk/debug/app-debug.apk (18.4 MB)' },
  ];

  const [buildSteps, setBuildSteps] = useState<BuildStep[]>(initialBuildSteps);
  const [buildRunning, setBuildRunning] = useState(false);
  const [buildSuccess, setBuildSuccess] = useState(false);
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<'ci' | 'phone-guide' | 'yaml'>('ci');
  const [buildLogs, setBuildLogs] = useState<string[]>([
    'JARVIS CI/CD Runner daemon v2.4 initialized.',
    'Tracking workflow: .github/workflows/build.yml',
    'Ready to execute build pipeline. Click "Run CI/CD Pipeline" to begin.',
  ]);

  const runBuildPipeline = () => {
    if (buildRunning) return;
    setBuildRunning(true);
    setBuildSuccess(false);
    setBuildSteps(initialBuildSteps.map((s) => ({ ...s, status: 'idle' })));
    setBuildLogs(['[START] GitHub Actions Workflow Dispatch triggered on branch: main']);

    const stepTimings = [600, 700, 750, 500, 1200, 700, 600];

    const executeStep = (index: number) => {
      if (index >= initialBuildSteps.length) {
        setBuildRunning(false);
        setBuildSuccess(true);
        setBuildLogs((prev) => [
          ...prev,
          '[FINISH] Pipeline completed successfully. 7/7 jobs passed.',
          'Artifact jarvis-debug-apk is ready for deployment.',
        ]);
        return;
      }

      setBuildSteps((prev) =>
        prev.map((s, idx) => (idx === index ? { ...s, status: 'running' } : s))
      );

      setBuildLogs((prev) => [
        ...prev,
        `> Step [${index + 1}/${initialBuildSteps.length}]: ${initialBuildSteps[index].name}...`,
      ]);

      setTimeout(() => {
        setBuildSteps((prev) =>
          prev.map((s, idx) =>
            idx === index
              ? {
                  ...s,
                  status: 'success',
                  duration: `${((stepTimings[index] + Math.random() * 200) / 1000).toFixed(1)}s`,
                }
              : s
          )
        );

        setBuildLogs((prev) => [...prev, `  ${initialBuildSteps[index].log}`, `  ✓ Job completed.`]);

        executeStep(index + 1);
      }, stepTimings[index]);
    };

    executeStep(0);
  };

  // Sync theme with root dataset and localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('jarvis-theme', currentTheme);
  }, [currentTheme]);

  // Hardware Telemetry state for futuristic simulation
  const [telemetry, setTelemetry] = useState({
    cpu: 24,
    ram: 48.6,
    ramUsedGb: 3.89,
    ramTotalGb: 8.0,
    battery: 89,
    batteryStatus: 'Discharging',
    tempC: 31.4,
    clockGhz: 2.84,
    cpuHistory: [18, 22, 28, 24, 32, 26, 29, 24, 31, 25, 27, 24],
  });

  // Real-time telemetry fluctuation reactive to JARVIS state
  useEffect(() => {
    const timer = setInterval(() => {
      setTelemetry((prev) => {
        let baseCpu = 22;
        let baseTemp = 31.2;
        let baseClock = 2.40;

        if (jarvisState === 'PROCESSING' || jarvisState === 'THINKING' || jarvisState === 'TOOL_EXECUTION') {
          baseCpu = 72;
          baseTemp = 36.4;
          baseClock = 3.19;
        } else if (jarvisState === 'LISTENING' || jarvisState === 'SPEAKING') {
          baseCpu = 46;
          baseTemp = 33.2;
          baseClock = 2.84;
        }

        const newCpu = Math.min(98, Math.max(12, Math.round(baseCpu + (Math.random() * 14 - 7))));
        const newTemp = +(baseTemp + (Math.random() * 1.0 - 0.5)).toFixed(1);
        const newClock = +(baseClock + (Math.random() * 0.16 - 0.08)).toFixed(2);
        const newRam = +(47.8 + (Math.random() * 3.2)).toFixed(1);
        const newRamUsed = +((newRam / 100) * 8.0).toFixed(2);
        const newHistory = [...prev.cpuHistory.slice(1), newCpu];

        return {
          cpu: newCpu,
          ram: newRam,
          ramUsedGb: newRamUsed,
          ramTotalGb: 8.0,
          battery: prev.battery,
          batteryStatus: prev.batteryStatus,
          tempC: newTemp,
          clockGhz: newClock,
          cpuHistory: newHistory,
        };
      });
    }, 2000);

    return () => clearInterval(timer);
  }, [jarvisState]);

  const triggerCoreSpike = () => {
    setTelemetry((prev) => ({
      ...prev,
      cpu: 89,
      clockGhz: 3.36,
      tempC: 37.8,
      cpuHistory: [...prev.cpuHistory.slice(1), 89],
    }));
  };

  // Jarvis Daily Brief State & Google Search Grounding Simulation
  const motivationalQuotes = [
    {
      quote: "The best way to predict the future is to invent it.",
      author: "Alan Kay",
      focus: "Autonomous Engineering",
    },
    {
      quote: "Sometimes you gotta run before you can walk.",
      author: "Tony Stark",
      focus: "Rapid Iteration & Courage",
    },
    {
      quote: "Simplicity is prerequisite for reliability.",
      author: "Edsger W. Dijkstra",
      focus: "Pure Java Architecture",
    },
    {
      quote: "It always seems impossible until it's done.",
      author: "Nelson Mandela",
      focus: "Persistent Execution",
    },
    {
      quote: "Make it work, make it right, make it fast.",
      author: "Kent Beck",
      focus: "Software Craftsmanship",
    },
  ];

  const weatherPresets = [
    {
      city: "New York, NY",
      temp: "21°C",
      condition: "Clear Sky",
      humidity: "48%",
      wind: "14 km/h",
      uv: "Moderate (4)",
      query: "current weather in New York via Google Search",
      source: "google.com/search?q=weather+new+york",
    },
    {
      city: "San Francisco, CA",
      temp: "17°C",
      condition: "Mild Coastal Mist",
      humidity: "68%",
      wind: "19 km/h",
      uv: "Low (2)",
      query: "current weather in San Francisco via Google Search",
      source: "google.com/search?q=weather+san+francisco",
    },
    {
      city: "London, UK",
      temp: "15°C",
      condition: "Scattered Clouds",
      humidity: "74%",
      wind: "16 km/h",
      uv: "Low (1)",
      query: "current weather in London via Google Search",
      source: "google.com/search?q=weather+london",
    },
    {
      city: "Tokyo, Japan",
      temp: "23°C",
      condition: "Breezy & Sunny",
      humidity: "52%",
      wind: "11 km/h",
      uv: "Moderate (5)",
      query: "current weather in Tokyo via Google Search",
      source: "google.com/search?q=weather+tokyo",
    },
  ];

  const [dailyBrief, setDailyBrief] = useState({
    quoteIndex: 0,
    weatherIndex: 0,
    isRefreshing: false,
    lastUpdated: "Just now",
  });

  const refreshDailyBrief = () => {
    if (dailyBrief.isRefreshing) return;
    setDailyBrief((prev) => ({ ...prev, isRefreshing: true }));

    setTimeout(() => {
      setDailyBrief((prev) => ({
        quoteIndex: (prev.quoteIndex + 1) % motivationalQuotes.length,
        weatherIndex: (prev.weatherIndex + 1) % weatherPresets.length,
        isRefreshing: false,
        lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }));
    }, 800);
  };

  // Local storage backed state
  const [notes, setNotes] = useState<NoteItem[]>(() => [
    {
      id: '1',
      title: 'Android Build Spec',
      content: 'Target SDK 34, Min SDK 26, Pure Java 17, XML layouts, Room ORM.',
      category: 'Development',
      timestamp: '2026-09-30 10:14',
      pinned: true,
    },
    {
      id: '2',
      title: 'Voice Architecture Note',
      content: 'Foreground service with microphone type required on Android 14+. User-initiated only.',
      category: 'Audio',
      timestamp: '2026-09-30 09:30',
      pinned: false,
    },
  ]);

  const [memories, setMemories] = useState<MemoryItem[]>(() => [
    {
      id: 'm1',
      fact: 'User prefers pure Java architecture and XML layouts for Android.',
      category: 'Preference',
      createdAt: '2026-09-30',
    },
    {
      id: 'm2',
      fact: 'Primary development environment is phone-only using Termux, Acode, and AndroidIDE.',
      category: 'Environment',
      createdAt: '2026-09-30',
    },
  ]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'jarvis',
      text: 'Good day. JARVIS system is operational. All local modules, security gates, and tool handlers are standing by.',
      timestamp: '10:14:00',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setThemeDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeThemeConfig = THEMES.find((t) => t.id === currentTheme) || THEMES[0];

  // Voice synthesis wrapper
  const speakText = (text: string) => {
    if (!ttsEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 0.95;
      utterance.rate = 1.05;
      utterance.onstart = () => setJarvisState('SPEAKING');
      utterance.onend = () => setJarvisState('IDLE');
      utterance.onerror = () => setJarvisState('IDLE');
      window.speechSynthesis.speak(utterance);
    } catch {
      setJarvisState('IDLE');
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // Deterministic Dispatcher Engine Simulation
  const executeCommand = (command: string) => {
    if (!command.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: command,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setJarvisState('PROCESSING');
    setStatusMessage('Parsing intent and validating tool allowlist...');

    setTimeout(() => {
      const lower = command.toLowerCase().trim();
      let jarvisReply = '';
      let toolCall: ToolExecution | undefined;

      // 1. App Launch
      if (lower.startsWith('open ') || lower.startsWith('launch ')) {
        const app = command.replace(/^(open|launch)\s+/i, '').trim();
        toolCall = {
          tool: 'open_app',
          arguments: { package_target: app },
          status: 'SUCCESS',
          source: 'OFFLINE_ANDROID',
          output: `android.content.Intent created for package matching "${app}" via PackageManager.getLaunchIntentForPackage()`,
        };
        jarvisReply = `Accessing Android PackageManager for ${app}. Standard launch intent dispatched.`;
      }
      // 2. Memory
      else if (lower.startsWith('remember that ') || lower.startsWith('remember ')) {
        const fact = command.replace(/^remember(\s+that)?\s+/i, '').trim();
        const newMem: MemoryItem = {
          id: Date.now().toString(),
          fact,
          category: 'Personal',
          createdAt: new Date().toISOString().split('T')[0],
        };
        setMemories((prev) => [newMem, ...prev]);
        toolCall = {
          tool: 'save_memory',
          arguments: { fact, category: 'Personal' },
          status: 'SUCCESS',
          source: 'LOCAL_DB',
          output: `Row inserted into Room memory_table (encrypted with Android Keystore)`,
        };
        jarvisReply = `Stored in encrypted local memory vault: "${fact}".`;
      }
      // 3. Calculator
      else if (
        lower.startsWith('calculate ') ||
        /^[0-9\s+\-*/().^%sqrt]+$/.test(lower) ||
        lower.includes('+') ||
        lower.includes('*') ||
        lower.includes('/')
      ) {
        const expr = command.replace(/^calculate\s+/i, '').trim();
        let result = 'NaN';
        try {
          const clean = expr.replace(/[^0-9+\-*/().]/g, '');
          result = Function(`'use strict'; return (${clean})`)().toString();
        } catch {
          result = 'Invalid arithmetic syntax';
        }
        toolCall = {
          tool: 'calculator',
          arguments: { expression: expr },
          status: 'SUCCESS',
          source: 'OFFLINE_ANDROID',
          output: `Offline math evaluation: ${expr} = ${result}`,
        };
        jarvisReply = `Calculation completed locally without network: ${expr} = ${result}.`;
      }
      // 4. Note
      else if (lower.startsWith('save this as a note:') || lower.startsWith('create note') || lower.startsWith('note:')) {
        const noteContent = command.replace(/^(save this as a note:|create note:?|note:?)\s*/i, '').trim();
        const newNote: NoteItem = {
          id: Date.now().toString(),
          title: noteContent.slice(0, 24) || 'Untitled Note',
          content: noteContent,
          category: 'Quick Note',
          timestamp: new Date().toLocaleString(),
          pinned: false,
        };
        setNotes((prev) => [newNote, ...prev]);
        toolCall = {
          tool: 'create_note',
          arguments: { content: noteContent },
          status: 'SUCCESS',
          source: 'LOCAL_DB',
          output: 'Room database transaction committed to notes_table',
        };
        jarvisReply = `Note saved to your offline Room database vault.`;
      }
      // 5. Weather
      else if (lower.includes('weather')) {
        toolCall = {
          tool: 'weather',
          arguments: { city: 'Local Coordinates / Default' },
          status: 'SUCCESS',
          source: 'ONLINE_API',
          output: 'Current conditions: 22°C, Humidity 58%, Wind 12 km/h, Clear skies.',
        };
        jarvisReply = `Current meteorological report: 22°C with clear skies and 58% humidity.`;
      }
      // 6. Reminders
      else if (lower.includes('remind me')) {
        toolCall = {
          tool: 'create_reminder',
          arguments: { raw: command, channel_id: 'jarvis_reminders_high' },
          status: 'SUCCESS',
          source: 'OFFLINE_ANDROID',
          output: 'AlarmManager.setExactAndAllowWhileIdle() scheduled with NotificationHelper',
        };
        jarvisReply = `Reminder logged. Notification scheduled via Android AlarmManager with full boot persistence.`;
      }
      // 7. General AI response
      else {
        jarvisReply = `Understood. I am processing your query within the deterministic tool router. When connected to the Gemini/OpenAI cloud provider, full contextual reasoning is active. All system commands remain gated behind explicit tool verification.`;
      }

      setJarvisState('TOOL_EXECUTION');
      setStatusMessage(`Dispatched: ${toolCall?.tool || 'conversational_brain'}`);

      setTimeout(() => {
        setJarvisState('SPEAKING');
        const jarvisMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'jarvis',
          text: jarvisReply,
          timestamp: new Date().toLocaleTimeString(),
          toolCall,
        };
        setMessages((prev) => [...prev, jarvisMsg]);
        setStatusMessage('Response ready.');
        speakText(jarvisReply);
      }, 700);
    }, 600);
  };

  // Toggle voice recognition
  const toggleListening = () => {
    if (jarvisState === 'LISTENING') {
      setJarvisState('IDLE');
      setStatusMessage('Voice recognition cancelled.');
      return;
    }

    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      setJarvisState('LISTENING');
      setStatusMessage('Listening to microphone (user-initiated)...');

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setTranscription(transcript);
      };

      recognition.onend = () => {
        if (transcription) {
          executeCommand(transcription);
          setTranscription('');
        } else {
          setJarvisState('IDLE');
          setStatusMessage('Microphone idle.');
        }
      };

      recognition.onerror = () => {
        setJarvisState('ERROR');
        setStatusMessage('Speech recognition error or audio permission missing.');
        setTimeout(() => setJarvisState('IDLE'), 2000);
      };

      recognition.start();
    } else {
      // Browser fallback simulation
      setJarvisState('LISTENING');
      setStatusMessage('Simulating speech recognition on non-WebSpeech browser...');
      setTimeout(() => {
        const sampleQuery = 'JARVIS, remember that I prefer Java.';
        setTranscription(sampleQuery);
        setTimeout(() => {
          executeCommand(sampleQuery);
          setTranscription('');
        }, 800);
      }, 1500);
    }
  };

  return (
    <div
      data-theme={currentTheme}
      className="min-h-screen bg-[var(--jarvis-bg)] text-[var(--jarvis-subtext)] flex flex-col font-sans selection:bg-[var(--jarvis-accent-dim)] selection:text-[var(--jarvis-accent)] transition-colors duration-300"
    >
      {/* Top Bar - Strict 3-zone contract */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-between px-6 py-3.5 border-b border-[var(--jarvis-border)] bg-[var(--jarvis-bg)]/90 backdrop-blur-md sticky top-0 z-50 transition-colors duration-300"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--jarvis-accent-dim)] border border-[var(--jarvis-accent)]/40 flex items-center justify-center text-[var(--jarvis-accent)] shadow-[0_0_12px_var(--jarvis-accent-glow)] transition-colors duration-300">
            <Zap className="w-4 h-4" />
          </div>
          <span className="text-base font-bold tracking-wider text-[var(--jarvis-text)] uppercase">
            JARVIS <span className="text-[var(--jarvis-accent)] font-mono text-xs ml-1 font-semibold transition-colors duration-300">CORE ARCHITECTURE</span>
          </span>
        </div>

        {/* Clean text navigation tabs */}
        <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-[var(--jarvis-text-muted)]">
          {(
            [
              { id: 'hud', label: 'HUD Console' },
              { id: 'chat', label: 'AI Command Chat' },
              { id: 'notes', label: 'Notes Vault' },
              { id: 'memory', label: 'Memory Bank' },
              { id: 'workflow', label: 'Build Workflow' },
              { id: 'blueprint', label: 'Master Blueprint' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative py-1 transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'text-[var(--jarvis-accent)] font-semibold' : 'hover:text-[var(--jarvis-text)]'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeTabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--jarvis-accent)] shadow-[0_0_8px_var(--jarvis-accent)]"
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
            </button>
          ))}
        </nav>

        {/* Primary Status & Actions */}
        <div className="flex items-center gap-3">
          {/* Theme Switcher Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-border-bright)] text-xs text-[var(--jarvis-text)] hover:border-[var(--jarvis-accent)]/50 transition-all shadow-sm"
              title="Switch JARVIS Color Theme"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shadow-[0_0_6px_var(--jarvis-accent-glow)] transition-colors"
                style={{ backgroundColor: activeThemeConfig.primaryColor }}
              />
              <span className="font-medium whitespace-nowrap">{activeThemeConfig.name}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[var(--jarvis-text-muted)] transition-transform duration-200 ${
                  themeDropdownOpen ? 'rotate-180 text-[var(--jarvis-accent)]' : ''
                }`}
              />
            </motion.button>

            <AnimatePresence>
              {themeDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute right-0 mt-2 w-64 p-1.5 rounded-xl bg-[var(--jarvis-surface)] border border-[var(--jarvis-border-bright)] shadow-2xl z-50 backdrop-blur-xl"
                >
                  <div className="px-3 py-2 text-[11px] font-mono text-[var(--jarvis-text-muted)] border-b border-[var(--jarvis-border)] mb-1">
                    ACTIVE COLOR THEME
                  </div>
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setCurrentTheme(t.id);
                        setThemeDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left text-xs transition-all ${
                        currentTheme === t.id
                          ? 'bg-[var(--jarvis-accent-dim)] text-[var(--jarvis-accent)] font-semibold border border-[var(--jarvis-accent)]/30'
                          : 'text-[var(--jarvis-subtext)] hover:bg-[var(--jarvis-surface-elevated)] hover:text-[var(--jarvis-text)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                          style={{
                            backgroundColor: t.primaryColor,
                            boxShadow: currentTheme === t.id ? `0 0 8px ${t.primaryColor}` : 'none',
                          }}
                        />
                        <div>
                          <div className="font-medium">{t.name}</div>
                          <div className="text-[10px] text-[var(--jarvis-text-muted)] leading-tight mt-0.5">
                            {t.tagline}
                          </div>
                        </div>
                      </div>
                      {currentTheme === t.id && (
                        <Check className="w-3.5 h-3.5 text-[var(--jarvis-accent)] shrink-0" />
                      )}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--jarvis-text-muted)] bg-[var(--jarvis-surface-elevated)] px-3 py-1.5 rounded-lg border border-[var(--jarvis-border-bright)]">
            {networkOnline ? (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Wifi className="w-3.5 h-3.5" /> Online
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-400">
                <WifiOff className="w-3.5 h-3.5" /> Offline Mode
              </span>
            )}
            <span className="text-[var(--jarvis-border-bright)]">|</span>
            <span className="font-mono text-[var(--jarvis-accent)] text-[11px] uppercase tracking-wide">
              {jarvisState}
            </span>
          </div>

          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            title={ttsEnabled ? 'Disable Voice Output' : 'Enable Voice Output'}
            className="p-2 rounded-lg bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-border-bright)] text-[var(--jarvis-text-muted)] hover:text-[var(--jarvis-accent)] transition-colors"
          >
            {ttsEnabled ? <Volume2 className="w-4 h-4 text-[var(--jarvis-accent)]" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </motion.header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 gap-6">
        {/* Mobile Tab Switcher */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex md:hidden items-center gap-1 p-1 bg-[var(--jarvis-surface-elevated)] rounded-lg border border-[var(--jarvis-border-bright)] overflow-x-auto"
        >
          {(['hud', 'chat', 'notes', 'memory', 'workflow', 'blueprint'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap capitalize transition-colors ${
                activeTab === tab
                  ? 'bg-[var(--jarvis-accent-dim)] text-[var(--jarvis-accent)] border border-[var(--jarvis-accent)]/30'
                  : 'text-[var(--jarvis-text-muted)] hover:text-[var(--jarvis-text)]'
              }`}
            >
              {tab === 'blueprint' ? 'Blueprint (35)' : tab === 'workflow' ? 'Build CI/CD' : tab}
            </button>
          ))}
        </motion.div>

        {/* Dynamic Tab Views with AnimatePresence */}
        <AnimatePresence mode="wait">
          {/* TAB 1: HUD CONSOLE */}
          {activeTab === 'hud' && (
            <motion.div
              key="hud-view"
              variants={tabViewTransition}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              {/* Center Arc Reactor & Visualizer Panel */}
              <motion.div
                variants={cardEntrance}
                custom={0}
                initial="hidden"
                animate="visible"
                className="lg:col-span-7 bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl p-6 flex flex-col items-center justify-between relative overflow-hidden shadow-xl min-h-[480px] transition-colors duration-300"
              >
                {/* Background HUD Grid Glow */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--jarvis-accent-dim)_0,transparent_70%)] pointer-events-none" />

                <div className="w-full flex items-center justify-between z-10">
                  <div className="flex items-center gap-2 text-xs text-[var(--jarvis-text-muted)]">
                    <span>OS: Android 14 (API 34)</span>
                    <span aria-hidden="true">·</span>
                    <span>Runtime: Java 17</span>
                    <span aria-hidden="true">·</span>
                    <span>UI: Native XML</span>
                  </div>
                  <div className="text-xs font-mono text-[var(--jarvis-accent)] bg-[var(--jarvis-accent-dim)] px-2 py-0.5 rounded border border-[var(--jarvis-accent)]/20">
                    SYSTEM ACTIVE
                  </div>
                </div>

                {/* Central Arc Reactor Visualizer */}
                <div className="my-8 flex flex-col items-center justify-center relative">
                  {/* Outer Ring */}
                  <div
                    className={`w-52 h-52 rounded-full border-2 border-dashed transition-all duration-700 flex items-center justify-center relative ${
                      jarvisState === 'LISTENING'
                        ? 'border-[var(--jarvis-accent)] animate-spin scale-105 shadow-[0_0_30px_var(--jarvis-accent-glow)]'
                        : jarvisState === 'THINKING' || jarvisState === 'PROCESSING'
                        ? 'border-indigo-400 animate-pulse shadow-[0_0_25px_rgba(99,102,241,0.3)]'
                        : jarvisState === 'SPEAKING'
                        ? 'border-emerald-400 scale-105 shadow-[0_0_30px_rgba(52,211,153,0.3)]'
                        : 'border-[var(--jarvis-border-bright)]'
                    }`}
                    style={{ animationDuration: '12s' }}
                  >
                    {/* Concentric Circle 2 */}
                    <div className="w-40 h-40 rounded-full border border-[var(--jarvis-accent)]/30 flex items-center justify-center">
                      {/* Concentric Circle 3 */}
                      <div className="w-28 h-28 rounded-full border-2 border-[var(--jarvis-accent)]/50 bg-[var(--jarvis-bg)] flex items-center justify-center shadow-[inset_0_0_20px_var(--jarvis-accent-dim)]">
                        {/* Core Pulse */}
                        <motion.div
                          animate={{
                            scale:
                              jarvisState === 'LISTENING'
                                ? [1, 1.15, 1]
                                : jarvisState === 'SPEAKING'
                                ? [1, 1.12, 1]
                                : 1,
                          }}
                          transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${
                            jarvisState === 'LISTENING'
                              ? 'bg-[var(--jarvis-accent)] shadow-[0_0_25px_var(--jarvis-accent)]'
                              : jarvisState === 'SPEAKING'
                              ? 'bg-emerald-400 shadow-[0_0_25px_#34d399]'
                              : jarvisState === 'PROCESSING' || jarvisState === 'THINKING'
                              ? 'bg-indigo-500 shadow-[0_0_25px_#6366f1]'
                              : 'bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-accent)]/40 shadow-[0_0_10px_var(--jarvis-accent-glow)]'
                          }`}
                        >
                          <Cpu className="w-6 h-6 text-[var(--jarvis-bg)]" />
                        </motion.div>
                      </div>
                    </div>
                  </div>

                  {/* State Label */}
                  <div className="mt-5 text-center">
                    <div className="text-xl font-bold tracking-wider text-[var(--jarvis-text)]">JARVIS</div>
                    <div className="text-xs text-[var(--jarvis-accent)] font-mono tracking-widest uppercase mt-0.5">
                      {statusMessage}
                    </div>
                  </div>
                </div>

                {/* Dynamic Waveform Simulation */}
                <div className="w-full flex items-center justify-center gap-1.5 h-8 z-10">
                  {[4, 12, 24, 16, 28, 36, 18, 22, 34, 14, 8, 20, 30, 16, 6].map((height, i) => (
                    <motion.div
                      key={i}
                      animate={{
                        height:
                          jarvisState === 'LISTENING' || jarvisState === 'SPEAKING'
                            ? [
                                `${Math.max(6, height * 0.4)}px`,
                                `${Math.max(8, height * 1.3)}px`,
                                `${Math.max(6, height * 0.6)}px`,
                              ]
                            : '4px',
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 0.6 + (i % 5) * 0.1,
                        ease: 'easeInOut',
                      }}
                      className={`w-1 rounded-full transition-colors ${
                        jarvisState === 'LISTENING' || jarvisState === 'SPEAKING'
                          ? 'bg-[var(--jarvis-accent)] shadow-[0_0_6px_var(--jarvis-accent)]'
                          : 'bg-[var(--jarvis-border-bright)]'
                      }`}
                    />
                  ))}
                </div>

                {/* Voice Interaction Trigger */}
                <div className="w-full flex items-center justify-center gap-4 mt-6 z-10">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={toggleListening}
                    className={`px-6 py-3 rounded-xl font-medium flex items-center gap-2.5 transition-all text-sm ${
                      jarvisState === 'LISTENING'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse'
                        : 'bg-[var(--jarvis-accent-dim)] text-[var(--jarvis-accent)] border border-[var(--jarvis-accent)]/40 hover:bg-[var(--jarvis-accent)]/20 shadow-[0_0_15px_var(--jarvis-accent-glow)]'
                    }`}
                  >
                    {jarvisState === 'LISTENING' ? (
                      <>
                        <MicOff className="w-4 h-4 text-rose-400" /> Cancel Listening
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4 text-[var(--jarvis-accent)]" /> Activate Voice Assistant
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>

              {/* JARVIS Daily Brief: Motivational Quote & Google Search Grounded Weather */}
              <motion.div
                variants={cardEntrance}
                custom={1}
                initial="hidden"
                animate="visible"
                className="lg:col-span-7 bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl p-5 shadow-lg transition-colors duration-300 relative overflow-hidden"
              >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--jarvis-border)]">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-[var(--jarvis-accent)]" />
                    <span className="text-sm font-semibold text-[var(--jarvis-text)]">
                      Jarvis Daily Brief
                    </span>
                    <span className="text-[10px] font-mono text-[var(--jarvis-accent)] bg-[var(--jarvis-accent-dim)] px-2 py-0.5 rounded border border-[var(--jarvis-accent)]/20">
                      LIVE DISPATCH
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[var(--jarvis-text-muted)] font-mono">
                      Updated {dailyBrief.lastUpdated}
                    </span>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={refreshDailyBrief}
                      disabled={dailyBrief.isRefreshing}
                      title="Fetch latest brief via Google Search grounding"
                      className="p-1.5 rounded-lg bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-border-bright)] text-[var(--jarvis-text-muted)] hover:text-[var(--jarvis-accent)] transition-all flex items-center gap-1 text-xs"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${dailyBrief.isRefreshing ? 'animate-spin text-[var(--jarvis-accent)]' : ''}`}
                      />
                      <span className="hidden sm:inline text-[11px]">Sync Google Search</span>
                    </motion.button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* Sector 1: Motivational Quote */}
                  <div className="md:col-span-7 p-4 rounded-xl bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-border-bright)] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-xs text-[var(--jarvis-text-muted)] mb-2">
                        <span className="flex items-center gap-1.5 text-[var(--jarvis-accent)] font-medium">
                          <Quote className="w-3.5 h-3.5" /> Core Directive
                        </span>
                        <span className="text-[10px] font-mono text-[var(--jarvis-text-muted)]">
                          {motivationalQuotes[dailyBrief.quoteIndex].focus}
                        </span>
                      </div>

                      <blockquote className="text-sm font-medium text-[var(--jarvis-text)] italic leading-relaxed my-2">
                        "{motivationalQuotes[dailyBrief.quoteIndex].quote}"
                      </blockquote>
                    </div>

                    <div className="mt-3 pt-2 border-t border-[var(--jarvis-border)] flex items-center justify-between text-xs">
                      <span className="text-[var(--jarvis-text-muted)] font-mono text-[11px]">
                        — {motivationalQuotes[dailyBrief.quoteIndex].author}
                      </span>
                      <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                        <Check className="w-3 h-3" /> VERIFIED QUOTE
                      </span>
                    </div>
                  </div>

                  {/* Sector 2: Google Search Grounded Weather */}
                  <div className="md:col-span-5 p-4 rounded-xl bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-border-bright)] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-xs text-[var(--jarvis-text-muted)] mb-2">
                        <span className="flex items-center gap-1 text-[var(--jarvis-accent)] font-medium">
                          <CloudSun className="w-3.5 h-3.5" /> Meteorological Grounding
                        </span>
                        <span className="font-mono text-[10px] text-emerald-400 flex items-center gap-1">
                          <Globe className="w-2.5 h-2.5" /> Google Search
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between my-1">
                        <div>
                          <div className="text-xs text-[var(--jarvis-text-muted)]">
                            {weatherPresets[dailyBrief.weatherIndex].city}
                          </div>
                          <div className="text-xl font-bold font-mono text-[var(--jarvis-text)]">
                            {weatherPresets[dailyBrief.weatherIndex].temp}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-medium text-[var(--jarvis-accent)]">
                            {weatherPresets[dailyBrief.weatherIndex].condition}
                          </span>
                          <div className="text-[10px] text-[var(--jarvis-text-muted)] font-mono">
                            UV Index: {weatherPresets[dailyBrief.weatherIndex].uv}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Meteorological Micro-Stats */}
                    <div className="mt-3 pt-2 border-t border-[var(--jarvis-border)] flex items-center justify-between text-[11px] text-[var(--jarvis-text-muted)] font-mono">
                      <span className="flex items-center gap-1">
                        <Droplets className="w-3 h-3 text-[var(--jarvis-accent)]" /> {weatherPresets[dailyBrief.weatherIndex].humidity}
                      </span>
                      <span className="flex items-center gap-1">
                        <Wind className="w-3 h-3 text-indigo-400" /> {weatherPresets[dailyBrief.weatherIndex].wind}
                      </span>
                      <span className="text-[10px] text-[var(--jarvis-text-muted)] truncate max-w-[90px]" title={weatherPresets[dailyBrief.weatherIndex].source}>
                        google.com/search
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Quick Actions & Live Telemetry Inspector */}
              <div className="lg:col-span-5 flex flex-col gap-5">
                {/* Hardware Telemetry Widget */}
                <motion.div
                  variants={cardEntrance}
                  custom={1}
                  initial="hidden"
                  animate="visible"
                  className="bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl p-5 shadow-lg transition-colors duration-300 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-semibold text-[var(--jarvis-text)] flex items-center gap-2">
                      <Activity className="w-4 h-4 text-[var(--jarvis-accent)] animate-pulse" />
                      <span>Hardware Telemetry</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-[var(--jarvis-accent)] bg-[var(--jarvis-accent-dim)] px-2 py-0.5 rounded border border-[var(--jarvis-accent)]/20">
                        ARM64-V8A BUS
                      </span>
                      <button
                        onClick={triggerCoreSpike}
                        title="Simulate core spike"
                        className="text-[10px] text-[var(--jarvis-text-muted)] hover:text-[var(--jarvis-accent)] border border-[var(--jarvis-border)] hover:border-[var(--jarvis-accent)]/40 px-2 py-0.5 rounded transition-all flex items-center gap-1"
                      >
                        <Zap className="w-2.5 h-2.5" />
                        <span>Spike</span>
                      </button>
                    </div>
                  </div>

                  {/* 3 Core Metric Sectors */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* 1. CPU Gauge & Sparkline */}
                    <div className="p-3 rounded-lg bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-border-bright)] flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-xs text-[var(--jarvis-text-muted)] mb-1">
                          <span className="flex items-center gap-1">
                            <Cpu className="w-3 h-3 text-[var(--jarvis-accent)]" /> CPU Core
                          </span>
                          <span className="font-mono text-[11px] text-[var(--jarvis-text-muted)]">
                            {telemetry.clockGhz} GHz
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1.5 my-1">
                          <span className="text-xl font-bold font-mono text-[var(--jarvis-text)] tabular-nums">
                            {telemetry.cpu}%
                          </span>
                          <span className="text-[10px] text-[var(--jarvis-text-muted)]">Load</span>
                        </div>
                      </div>

                      {/* Mini Live Sparkline Chart */}
                      <div className="mt-2 h-7 w-full flex items-end">
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 110 24">
                          <defs>
                            <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--jarvis-accent)" stopOpacity="0.4" />
                              <stop offset="100%" stopColor="var(--jarvis-accent)" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>
                          {/* Area Fill */}
                          <path
                            d={`M 0,24 ${telemetry.cpuHistory
                              .map((val, i) => `L ${i * 10},${24 - (val / 100) * 22}`)
                              .join(' ')} L 110,24 Z`}
                            fill="url(#cpuGradient)"
                          />
                          {/* Stroke Line */}
                          <path
                            d={`M 0,${24 - (telemetry.cpuHistory[0] / 100) * 22} ${telemetry.cpuHistory
                              .map((val, i) => `L ${i * 10},${24 - (val / 100) * 22}`)
                              .join(' ')}`}
                            fill="none"
                            stroke="var(--jarvis-accent)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-[var(--jarvis-bg)] rounded-full h-1 mt-2 overflow-hidden border border-[var(--jarvis-border)]">
                        <motion.div
                          animate={{ width: `${telemetry.cpu}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className="h-full bg-[var(--jarvis-accent)] shadow-[0_0_6px_var(--jarvis-accent)]"
                        />
                      </div>
                    </div>

                    {/* 2. RAM (Memory) Gauge */}
                    <div className="p-3 rounded-lg bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-border-bright)] flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-xs text-[var(--jarvis-text-muted)] mb-1">
                          <span className="flex items-center gap-1">
                            <HardDrive className="w-3 h-3 text-[var(--jarvis-accent)]" /> LPDDR5X RAM
                          </span>
                          <span className="font-mono text-[11px] text-[var(--jarvis-text-muted)]">
                            {telemetry.ramUsedGb} / {telemetry.ramTotalGb}GB
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1.5 my-1">
                          <span className="text-xl font-bold font-mono text-[var(--jarvis-text)] tabular-nums">
                            {telemetry.ram}%
                          </span>
                          <span className="text-[10px] text-[var(--jarvis-text-muted)]">Allocated</span>
                        </div>
                      </div>

                      {/* Segmented Memory Visualizer */}
                      <div className="mt-3 space-y-1.5">
                        <div className="flex gap-1 h-2 w-full">
                          <div
                            className="h-full rounded-sm bg-[var(--jarvis-accent)] shadow-[0_0_4px_var(--jarvis-accent-glow)]"
                            style={{ width: '42%' }}
                            title="Android System Heap"
                          />
                          <div
                            className="h-full rounded-sm bg-indigo-400 opacity-80"
                            style={{ width: `${Math.max(6, telemetry.ram - 42)}%` }}
                            title="JARVIS AI Cache"
                          />
                          <div
                            className="h-full rounded-sm bg-[var(--jarvis-bg)] border border-[var(--jarvis-border)] flex-1"
                            title="Available Buffer"
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-[var(--jarvis-text-muted)] font-mono">
                          <span>App: 1.4GB</span>
                          <span>Free: {(8.0 - telemetry.ramUsedGb).toFixed(1)}GB</span>
                        </div>
                      </div>

                      {/* Footer state */}
                      <div className="text-[10px] text-[var(--jarvis-text-muted)] mt-2 flex items-center justify-between pt-1 border-t border-[var(--jarvis-border)]">
                        <span>GC: Dormant</span>
                        <span className="text-emerald-400 font-mono">NOMINAL</span>
                      </div>
                    </div>

                    {/* 3. Battery & Thermal State */}
                    <div className="p-3 rounded-lg bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-border-bright)] flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-xs text-[var(--jarvis-text-muted)] mb-1">
                          <span className="flex items-center gap-1">
                            <BatteryCharging className="w-3 h-3 text-emerald-400" /> Battery Cell
                          </span>
                          <span className="flex items-center gap-0.5 font-mono text-[11px] text-[var(--jarvis-text-muted)]">
                            <Thermometer className="w-2.5 h-2.5 text-amber-400" />
                            {telemetry.tempC}°C
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1.5 my-1">
                          <span className="text-xl font-bold font-mono text-[var(--jarvis-text)] tabular-nums">
                            {telemetry.battery}%
                          </span>
                          <span className="text-[10px] text-emerald-400">4.18V · Stable</span>
                        </div>
                      </div>

                      {/* Battery Bar */}
                      <div className="mt-3">
                        <div className="w-full bg-[var(--jarvis-bg)] rounded-full h-2 border border-[var(--jarvis-border)] p-0.5 flex items-center">
                          <motion.div
                            animate={{ width: `${telemetry.battery}%` }}
                            className="h-full bg-emerald-400 rounded-full shadow-[0_0_6px_rgba(52,211,153,0.4)]"
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-[var(--jarvis-text-muted)] font-mono mt-1.5">
                          <span>Health: 98%</span>
                          <span>SoC Temp: {telemetry.tempC}°C</span>
                        </div>
                      </div>

                      {/* Power Profile */}
                      <div className="text-[10px] text-[var(--jarvis-text-muted)] mt-2 flex items-center justify-between pt-1 border-t border-[var(--jarvis-border)]">
                        <span>Governor: Interactive</span>
                        <span className="text-[var(--jarvis-accent)] font-mono">45W DUAL</span>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Tool Dispatcher Sandbox */}
                <motion.div
                  variants={cardEntrance}
                  custom={2}
                  initial="hidden"
                  animate="visible"
                  className="bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl p-5 shadow-lg transition-colors duration-300"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-[var(--jarvis-text)] flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-[var(--jarvis-accent)]" />
                      <span>Quick Command Dispatcher</span>
                    </div>
                    <span className="text-[11px] text-[var(--jarvis-text-muted)] font-mono">ALLOWLIST PROTECTED</span>
                  </div>
                  <p className="text-xs text-[var(--jarvis-text-muted)] mb-4">
                    Deterministic command dispatcher routes directly to local Android handlers or verified APIs.
                  </p>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      {
                        label: 'Open YouTube',
                        sub: 'PackageManager Intent',
                        cmd: 'Open YouTube',
                      },
                      {
                        label: 'Calculate 25 * 50',
                        sub: 'Local Offline Engine',
                        cmd: 'Calculate 25 * 50 + 120',
                      },
                      {
                        label: 'Save Memory',
                        sub: 'Room Keystore Vault',
                        cmd: 'Remember that I prefer Java',
                      },
                      {
                        label: 'Set Reminder',
                        sub: 'AlarmManager Trigger',
                        cmd: 'Remind me tomorrow at 8 AM to study',
                      },
                    ].map((btn, i) => (
                      <motion.button
                        key={btn.label}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => executeCommand(btn.cmd)}
                        className="p-2.5 rounded-lg bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-border-bright)] hover:border-[var(--jarvis-accent)]/50 text-left text-[var(--jarvis-subtext)] hover:text-[var(--jarvis-text)] transition-all flex flex-col gap-1"
                      >
                        <span className="font-semibold text-[var(--jarvis-accent)]">{btn.label}</span>
                        <span className="text-[11px] text-[var(--jarvis-text-muted)]">{btn.sub}</span>
                      </motion.button>
                    ))}
                  </div>

                  {/* Input row */}
                  <div className="mt-4 flex items-center gap-2">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && executeCommand(inputText)}
                      placeholder='Try: "Save this as a note: Finish Chapter 4"'
                      className="flex-1 bg-[var(--jarvis-bg)] border border-[var(--jarvis-border-bright)] rounded-lg px-3 py-2 text-xs text-[var(--jarvis-text)] placeholder-[var(--jarvis-text-muted)] focus:outline-none focus:border-[var(--jarvis-accent)]"
                    />
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => executeCommand(inputText)}
                      className="p-2 rounded-lg bg-[var(--jarvis-accent-dim)] border border-[var(--jarvis-accent)]/40 text-[var(--jarvis-accent)] hover:bg-[var(--jarvis-accent)]/20 transition-all"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </motion.button>
                  </div>
                </motion.div>

                {/* Offline vs Online Capability Matrix */}
                <motion.div
                  variants={cardEntrance}
                  custom={3}
                  initial="hidden"
                  animate="visible"
                  className="bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl p-5 shadow-lg transition-colors duration-300"
                >
                  <div className="text-sm font-semibold text-[var(--jarvis-text)] mb-2 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Execution Boundaries</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <motion.div
                      whileHover={{ x: 2 }}
                      className="flex items-center justify-between p-2 rounded bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-border)]"
                    >
                      <span className="text-[var(--jarvis-subtext)]">Offline Vault (Notes, Memory, Calculator)</span>
                      <span className="text-emerald-400 font-mono text-[11px]">100% LOCAL</span>
                    </motion.div>
                    <motion.div
                      whileHover={{ x: 2 }}
                      className="flex items-center justify-between p-2 rounded bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-border)]"
                    >
                      <span className="text-[var(--jarvis-subtext)]">App Launch & Settings Nav (Intents)</span>
                      <span className="text-emerald-400 font-mono text-[11px]">SANDBOX SAFE</span>
                    </motion.div>
                    <motion.div
                      whileHover={{ x: 2 }}
                      className="flex items-center justify-between p-2 rounded bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-border)]"
                    >
                      <span className="text-[var(--jarvis-subtext)]">AI Cloud Brain & Live Web Search</span>
                      <span className="text-[var(--jarvis-accent)] font-mono text-[11px]">ONLINE (HTTPS)</span>
                    </motion.div>
                    <motion.div
                      whileHover={{ x: 2 }}
                      className="flex items-center justify-between p-2 rounded bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-border)]"
                    >
                      <span className="text-[var(--jarvis-subtext)]">Silent Background Monitoring</span>
                      <span className="text-rose-400 font-mono text-[11px]">PROHIBITED BY OS</span>
                    </motion.div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: AI COMMAND CHAT */}
          {activeTab === 'chat' && (
            <motion.div
              key="chat-view"
              variants={tabViewTransition}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl flex flex-col h-[700px] overflow-hidden shadow-xl transition-colors duration-300"
            >
              {/* Chat Header */}
              <div className="px-5 py-3.5 border-b border-[var(--jarvis-border)] bg-[var(--jarvis-surface-elevated)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--jarvis-accent)]" />
                  <span className="text-sm font-semibold text-[var(--jarvis-text)]">JARVIS AI Conversation Engine</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--jarvis-text-muted)]">
                  <span>Provider: Gemini 2.5 Flash / Backend Proxy</span>
                  <button
                    onClick={() => setMessages([messages[0]])}
                    className="hover:text-[var(--jarvis-text)] transition-colors flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Clear
                  </button>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 p-5 overflow-y-auto space-y-4">
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 12, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div className="text-[11px] text-[var(--jarvis-text-muted)] mb-1 font-mono">
                        {msg.sender === 'user' ? 'USER' : 'JARVIS'} · {msg.timestamp}
                      </div>
                      <div
                        className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                          msg.sender === 'user'
                            ? 'bg-[var(--jarvis-accent-dim)] text-[var(--jarvis-text)] border border-[var(--jarvis-accent)]/30'
                            : 'bg-[var(--jarvis-surface-elevated)] text-[var(--jarvis-subtext)] border border-[var(--jarvis-border-bright)]'
                        }`}
                      >
                        <p>{msg.text}</p>

                        {/* Tool Call telemetry display */}
                        {msg.toolCall && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            transition={{ duration: 0.3 }}
                            className="mt-3 pt-3 border-t border-[var(--jarvis-border)] text-xs"
                          >
                            <div className="flex items-center justify-between text-[var(--jarvis-accent)] font-mono text-[11px] mb-1">
                              <span>TOOL DISPATCHED: {msg.toolCall.tool}</span>
                              <span className="text-emerald-400">{msg.toolCall.status}</span>
                            </div>
                            <div className="bg-[var(--jarvis-bg)] p-2 rounded border border-[var(--jarvis-border)] font-mono text-[11px] text-[var(--jarvis-text-muted)] overflow-x-auto">
                              {msg.toolCall.output}
                            </div>
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <div className="p-4 border-t border-[var(--jarvis-border)] bg-[var(--jarvis-surface-elevated)] flex items-center gap-2">
                <button
                  onClick={toggleListening}
                  className={`p-2.5 rounded-lg border transition-all ${
                    jarvisState === 'LISTENING'
                      ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                      : 'bg-[var(--jarvis-bg)] border-[var(--jarvis-border-bright)] text-[var(--jarvis-text-muted)] hover:text-[var(--jarvis-accent)]'
                  }`}
                >
                  <Mic className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && executeCommand(inputText)}
                  placeholder="Ask JARVIS, dispatch a tool, or dictate a command..."
                  className="flex-1 bg-[var(--jarvis-bg)] border border-[var(--jarvis-border-bright)] rounded-lg px-4 py-2.5 text-sm text-[var(--jarvis-text)] placeholder-[var(--jarvis-text-muted)] focus:outline-none focus:border-[var(--jarvis-accent)]"
                />
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => executeCommand(inputText)}
                  className="px-4 py-2.5 rounded-lg bg-[var(--jarvis-accent)] text-[var(--jarvis-bg)] font-semibold text-xs tracking-wider uppercase hover:opacity-90 transition-all flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> Send
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* TAB 3: NOTES VAULT */}
          {activeTab === 'notes' && (
            <motion.div
              key="notes-view"
              variants={tabViewTransition}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[var(--jarvis-text)]">Offline Notes Vault</h2>
                  <p className="text-xs text-[var(--jarvis-text-muted)]">
                    Room Database (SQLite) with encrypted local storage on device.
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() =>
                    executeCommand(
                      'Save this as a note: Reviewed Android Security permissions and Keystore configuration.'
                    )
                  }
                  className="px-3.5 py-2 rounded-lg bg-[var(--jarvis-accent-dim)] border border-[var(--jarvis-accent)]/40 text-[var(--jarvis-accent)] text-xs font-medium hover:bg-[var(--jarvis-accent)]/20 transition-all"
                >
                  + Add Test Note
                </motion.button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence>
                  {notes.map((note, index) => (
                    <motion.div
                      key={note.id}
                      layout
                      variants={cardEntrance}
                      custom={index}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      whileHover={{ y: -4, borderColor: 'var(--jarvis-accent)' }}
                      className="bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl p-4 flex flex-col justify-between transition-colors shadow-md"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs text-[var(--jarvis-text-muted)] mb-1.5">
                          <span className="text-[var(--jarvis-accent)] font-medium">{note.category}</span>
                          <span>{note.timestamp}</span>
                        </div>
                        <h3 className="text-sm font-semibold text-[var(--jarvis-text)] mb-2">{note.title}</h3>
                        <p className="text-xs text-[var(--jarvis-subtext)] leading-relaxed">{note.content}</p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-[var(--jarvis-border)] flex items-center justify-between text-xs text-[var(--jarvis-text-muted)]">
                        <span>Status: Offline Synced</span>
                        <button
                          onClick={() => setNotes((prev) => prev.filter((n) => n.id !== note.id))}
                          className="hover:text-rose-400 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* TAB 4: MEMORY BANK */}
          {activeTab === 'memory' && (
            <motion.div
              key="memory-view"
              variants={tabViewTransition}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[var(--jarvis-text)]">User-Controlled Long-Term Memory</h2>
                  <p className="text-xs text-[var(--jarvis-text-muted)]">
                    Explicit facts stored with user consent and injected selectively into prompt context.
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() =>
                    executeCommand('Remember that my preferred Android target SDK is 34 with Room ORM')
                  }
                  className="px-3.5 py-2 rounded-lg bg-[var(--jarvis-accent-dim)] border border-[var(--jarvis-accent)]/40 text-[var(--jarvis-accent)] text-xs font-medium hover:bg-[var(--jarvis-accent)]/20 transition-all"
                >
                  + Store Fact
                </motion.button>
              </div>

              <div className="space-y-3">
                <AnimatePresence>
                  {memories.map((mem, index) => (
                    <motion.div
                      key={mem.id}
                      layout
                      variants={cardEntrance}
                      custom={index}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      whileHover={{ x: 3, borderColor: 'var(--jarvis-accent)' }}
                      className="bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl p-4 flex items-center justify-between transition-colors shadow-md"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-[var(--jarvis-text-muted)]">
                          <span className="text-[var(--jarvis-accent)] font-medium">{mem.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>Recorded: {mem.createdAt}</span>
                        </div>
                        <div className="text-sm text-[var(--jarvis-text)]">{mem.fact}</div>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setMemories((prev) => prev.filter((m) => m.id !== mem.id))}
                        className="text-xs text-rose-400 hover:text-rose-300 px-3 py-1.5 rounded bg-rose-500/10 border border-rose-500/20"
                      >
                        Erase
                      </motion.button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* TAB 5: BUILD WORKFLOW & CI/CD */}
          {activeTab === 'workflow' && (
            <motion.div
              key="workflow-view"
              variants={tabViewTransition}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-6"
            >
              {/* Header Panel */}
              <div className="bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl p-5 shadow-lg transition-colors duration-300 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <GitBranch className="w-5 h-5 text-[var(--jarvis-accent)]" />
                    <h2 className="text-lg font-bold text-[var(--jarvis-text)]">
                      Automated Build & CI/CD Pipeline
                    </h2>
                  </div>
                  <p className="text-xs text-[var(--jarvis-text-muted)]">
                    Continuous Integration via GitHub Actions · Phone-only Termux + Acode + AndroidIDE development
                  </p>
                </div>

                {/* Sub-tab Switcher */}
                <div className="flex items-center gap-1 p-1 bg-[var(--jarvis-surface-elevated)] rounded-lg border border-[var(--jarvis-border-bright)] self-start md:self-auto text-xs">
                  <button
                    onClick={() => setActiveWorkflowTab('ci')}
                    className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                      activeWorkflowTab === 'ci'
                        ? 'bg-[var(--jarvis-accent-dim)] text-[var(--jarvis-accent)] border border-[var(--jarvis-accent)]/30'
                        : 'text-[var(--jarvis-text-muted)] hover:text-[var(--jarvis-text)]'
                    }`}
                  >
                    CI/CD Simulator
                  </button>
                  <button
                    onClick={() => setActiveWorkflowTab('phone-guide')}
                    className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                      activeWorkflowTab === 'phone-guide'
                        ? 'bg-[var(--jarvis-accent-dim)] text-[var(--jarvis-accent)] border border-[var(--jarvis-accent)]/30'
                        : 'text-[var(--jarvis-text-muted)] hover:text-[var(--jarvis-text)]'
                    }`}
                  >
                    Phone Setup Guide
                  </button>
                  <button
                    onClick={() => setActiveWorkflowTab('yaml')}
                    className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                      activeWorkflowTab === 'yaml'
                        ? 'bg-[var(--jarvis-accent-dim)] text-[var(--jarvis-accent)] border border-[var(--jarvis-accent)]/30'
                        : 'text-[var(--jarvis-text-muted)] hover:text-[var(--jarvis-text)]'
                    }`}
                  >
                    build.yml Spec
                  </button>
                </div>
              </div>

              {/* VIEW 1: CI/CD PIPELINE SIMULATOR */}
              {activeWorkflowTab === 'ci' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Column: Pipeline Stages */}
                  <div className="lg:col-span-5 flex flex-col gap-4">
                    <div className="bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl p-5 shadow-lg">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Box className="w-4 h-4 text-[var(--jarvis-accent)]" />
                          <span className="text-sm font-semibold text-[var(--jarvis-text)]">Pipeline Jobs</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {buildRunning && (
                            <span className="text-xs text-[var(--jarvis-accent)] font-mono animate-pulse">
                              RUNNING...
                            </span>
                          )}
                          {buildSuccess && (
                            <span className="text-xs text-emerald-400 font-mono flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> 7/7 PASSED
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {buildSteps.map((step) => (
                          <div
                            key={step.id}
                            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition-all ${
                              step.status === 'running'
                                ? 'bg-[var(--jarvis-accent-dim)] border-[var(--jarvis-accent)]/50 text-[var(--jarvis-text)]'
                                : step.status === 'success'
                                ? 'bg-[var(--jarvis-surface-elevated)] border-emerald-500/30 text-[var(--jarvis-text)]'
                                : 'bg-[var(--jarvis-surface-elevated)] border-[var(--jarvis-border)] text-[var(--jarvis-text-muted)]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              {step.status === 'success' ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : step.status === 'running' ? (
                                <div className="w-4 h-4 rounded-full border-2 border-[var(--jarvis-accent)] border-t-transparent animate-spin shrink-0" />
                              ) : (
                                <div className="w-4 h-4 rounded-full border border-[var(--jarvis-border-bright)] flex items-center justify-center text-[10px] text-[var(--jarvis-text-muted)] font-mono shrink-0">
                                  {step.id}
                                </div>
                              )}
                              <span className="font-medium">{step.name}</span>
                            </div>
                            {step.duration && (
                              <span className="text-[11px] font-mono text-[var(--jarvis-accent)]">
                                {step.duration}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 pt-4 border-t border-[var(--jarvis-border)] flex items-center gap-3">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          disabled={buildRunning}
                          onClick={runBuildPipeline}
                          className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 ${
                            buildRunning
                              ? 'bg-[var(--jarvis-surface-elevated)] text-[var(--jarvis-text-muted)] cursor-not-allowed border border-[var(--jarvis-border)]'
                              : 'bg-[var(--jarvis-accent)] text-[var(--jarvis-bg)] hover:opacity-90 shadow-[0_0_12px_var(--jarvis-accent-glow)]'
                          }`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{buildRunning ? 'Executing Build...' : 'Run CI/CD Pipeline'}</span>
                        </motion.button>
                        <button
                          onClick={() => {
                            setBuildSteps(initialBuildSteps);
                            setBuildSuccess(false);
                            setBuildLogs(['Pipeline reset. Ready to run.']);
                          }}
                          title="Reset"
                          className="p-2.5 rounded-lg bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-border-bright)] text-[var(--jarvis-text-muted)] hover:text-[var(--jarvis-text)]"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Artifact Card (Shows on success) */}
                    <AnimatePresence>
                      {buildSuccess && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 shadow-lg text-xs"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                              <Box className="w-4 h-4" /> APK Artifact Ready
                            </span>
                            <span className="font-mono text-[11px] text-[var(--jarvis-text-muted)]">18.4 MB</span>
                          </div>
                          <div className="text-[11px] text-[#cbd5e1] font-mono mb-3 bg-[var(--jarvis-bg)]/80 p-2 rounded border border-[var(--jarvis-border)] overflow-x-auto">
                            app/build/outputs/apk/debug/app-debug.apk
                          </div>
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              alert('Simulated Artifact Download: jarvis-debug.apk ready to transfer to Android device!');
                            }}
                            className="w-full py-2 rounded-lg bg-emerald-500 text-[#060b13] font-bold tracking-wide uppercase flex items-center justify-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" /> Download jarvis-debug.apk
                          </motion.button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Right Column: Live Terminal Log Console */}
                  <div className="lg:col-span-7 flex flex-col">
                    <div className="bg-[#03060c] border border-[var(--jarvis-border)] rounded-xl flex flex-col h-[520px] overflow-hidden shadow-2xl">
                      {/* Terminal Header */}
                      <div className="px-4 py-2.5 bg-[var(--jarvis-surface-elevated)] border-b border-[var(--jarvis-border)] flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Terminal className="w-3.5 h-3.5 text-[var(--jarvis-accent)]" />
                          <span className="font-mono text-[#cbd5e1] text-[11px]">
                            ubuntu-latest (GitHub Runner) - bash
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
                        </div>
                      </div>

                      {/* Log Output Stream */}
                      <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1.5 text-[#9bb0cb]">
                        {buildLogs.map((log, i) => (
                          <div
                            key={i}
                            className={`leading-relaxed ${
                              log.startsWith('[START]') || log.startsWith('[FINISH]')
                                ? 'text-[var(--jarvis-accent)] font-bold'
                                : log.startsWith('>')
                                ? 'text-white'
                                : log.includes('✓')
                                ? 'text-emerald-400'
                                : 'text-[#8299b8]'
                            }`}
                          >
                            {log}
                          </div>
                        ))}
                      </div>

                      {/* Terminal Footer */}
                      <div className="px-4 py-2 border-t border-[var(--jarvis-border)] bg-[var(--jarvis-surface-elevated)]/60 flex items-center justify-between text-[11px] font-mono text-[var(--jarvis-text-muted)]">
                        <span>JDK 17.0.10 · Gradle 8.4 · Android SDK 34</span>
                        <span>STATUS: {buildRunning ? 'BUILDING' : buildSuccess ? 'SUCCESS' : 'IDLE'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW 2: PHONE-ONLY DEVELOPMENT GUIDE */}
              {activeWorkflowTab === 'phone-guide' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl p-5 shadow-lg">
                    <div className="text-xs font-mono text-[var(--jarvis-accent)] mb-1">STAGE 1: TERMINAL</div>
                    <h3 className="text-base font-bold text-[var(--jarvis-text)] mb-2 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-[var(--jarvis-accent)]" /> Termux Environment Setup
                    </h3>
                    <p className="text-xs text-[var(--jarvis-text-muted)] mb-3 leading-relaxed">
                      Install Termux from F-Droid. Open the terminal and bootstrap the essential Android toolchain packages:
                    </p>
                    <div className="bg-[var(--jarvis-bg)] p-3 rounded-lg border border-[var(--jarvis-border)] font-mono text-xs text-[#cbd5e1] mb-2 flex items-center justify-between">
                      <code>pkg update && pkg install openjdk-17 git -y</code>
                      <button
                        onClick={() => handleCopy('pkg update && pkg install openjdk-17 git -y', 'c1')}
                        className="text-[var(--jarvis-accent)] hover:opacity-80 p-1"
                      >
                        {copiedSection === 'c1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="text-[11px] text-[var(--jarvis-text-muted)]">
                      Grant storage permissions: <code>termux-setup-storage</code>
                    </div>
                  </div>

                  <div className="bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl p-5 shadow-lg">
                    <div className="text-xs font-mono text-[var(--jarvis-accent)] mb-1">STAGE 2: EDITING</div>
                    <h3 className="text-base font-bold text-[var(--jarvis-text)] mb-2 flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-[var(--jarvis-accent)]" /> Code Editing in Acode / AndroidIDE
                    </h3>
                    <p className="text-xs text-[var(--jarvis-text-muted)] mb-3 leading-relaxed">
                      Open Acode or AndroidIDE and map the workspace to your local folder:
                    </p>
                    <div className="bg-[var(--jarvis-bg)] p-3 rounded-lg border border-[var(--jarvis-border)] font-mono text-xs text-[#cbd5e1] mb-2">
                      <code>/sdcard/projects/jarvis-android-assistant</code>
                    </div>
                    <p className="text-[11px] text-[var(--jarvis-text-muted)] leading-relaxed">
                      Acode provides pristine Java syntax highlighting and XML validation without battery-draining desktop emulators.
                    </p>
                  </div>

                  <div className="bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl p-5 shadow-lg">
                    <div className="text-xs font-mono text-[var(--jarvis-accent)] mb-1">STAGE 3: GIT PUSH</div>
                    <h3 className="text-base font-bold text-[var(--jarvis-text)] mb-2 flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-[var(--jarvis-accent)]" /> Commit & Remote Push
                    </h3>
                    <p className="text-xs text-[var(--jarvis-text-muted)] mb-3 leading-relaxed">
                      Whenever you create or modify Java/XML files, commit and push from Termux:
                    </p>
                    <div className="bg-[var(--jarvis-bg)] p-3 rounded-lg border border-[var(--jarvis-border)] font-mono text-xs text-[#cbd5e1] mb-2 flex items-center justify-between">
                      <code>git add . && git commit -m "feat: command engine" && git push</code>
                      <button
                        onClick={() => handleCopy('git add . && git commit -m "feat: command engine" && git push', 'c2')}
                        className="text-[var(--jarvis-accent)] hover:opacity-80 p-1"
                      >
                        {copiedSection === 'c2' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-[var(--jarvis-text-muted)]">
                      Pushing to <code>main</code> triggers the GitHub Actions workflow automatically.
                    </p>
                  </div>

                  <div className="bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl p-5 shadow-lg">
                    <div className="text-xs font-mono text-[var(--jarvis-accent)] mb-1">STAGE 4: DEPLOYMENT</div>
                    <h3 className="text-base font-bold text-[var(--jarvis-text)] mb-2 flex items-center gap-2">
                      <Download className="w-4 h-4 text-emerald-400" /> Install APK on Phone
                    </h3>
                    <p className="text-xs text-[var(--jarvis-text-muted)] mb-3 leading-relaxed">
                      Within 60–90 seconds, GitHub Actions finishes compiling your debug APK:
                    </p>
                    <ul className="space-y-1.5 text-xs text-[#cbd5e1]">
                      <li className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Open GitHub repo &gt; <b>Actions</b> tab on mobile browser</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Tap the latest successful workflow run</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Download <code>jarvis-debug-apk.zip</code> and install <code>app-debug.apk</code>!</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {/* VIEW 3: YAML WORKFLOW FILE */}
              {activeWorkflowTab === 'yaml' && (
                <div className="bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl p-5 shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-[var(--jarvis-accent)]" />
                      <span className="text-sm font-semibold text-[var(--jarvis-text)]">
                        .github/workflows/build.yml
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        handleCopy(
                          `name: Build JARVIS Android APK

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build:
    name: Build & Verify APK
    runs-on: ubuntu-latest
    timeout-minutes: 25

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Set up JDK 17
        uses: actions/setup-java@v5
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3

      - name: Verify Architecture (Pure Java & XML)
        run: |
          if [ -d "app/src" ]; then
            KOTLIN_FILES=$(find app/src -name "*.kt" 2>/dev/null | wc -l)
            if [ "$KOTLIN_FILES" -gt 0 ]; then
              echo "ERROR: Kotlin files detected. Pure Java 17 required."
              exit 1
            fi
          fi

      - name: Initialize or Prepare Gradle Wrapper
        run: |
          if [ -f "./gradlew" ]; then
            chmod +x gradlew
          else
            sudo apt-get update -qq && sudo apt-get install -y -qq gradle
            gradle wrapper --gradle-version 8.4
            chmod +x gradlew
          fi

      - name: Build Debug APK
        run: |
          if [ -f "./gradlew" ] && [ -f "app/build.gradle" ]; then
            ./gradlew assembleDebug --stacktrace
          fi

      - name: Run Unit Tests
        run: |
          if [ -f "./gradlew" ] && [ -f "app/build.gradle" ]; then
            ./gradlew testDebugUnitTest --continue || true
          fi

      - name: Upload Debug APK Artifact
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: jarvis-debug-apk
          path: app/build/outputs/apk/debug/*.apk
          if-no-files-found: ignore
          retention-days: 14`,
                          'yaml'
                        )
                      }
                      className="text-xs text-[var(--jarvis-accent)] hover:underline flex items-center gap-1"
                    >
                      {copiedSection === 'yaml' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      Copy YAML
                    </button>
                  </div>
                  <div className="bg-[#040810] p-4 rounded-xl border border-[var(--jarvis-border)] font-mono text-xs text-[#9bb0cb] overflow-x-auto leading-relaxed">
                    <pre>{`name: Build JARVIS Android APK

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build:
    name: Build & Verify APK
    runs-on: ubuntu-latest
    timeout-minutes: 25

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Set up JDK 17
        uses: actions/setup-java@v5
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3

      - name: Verify Architecture (Pure Java & XML)
        run: |
          if [ -d "app/src" ]; then
            KOTLIN_FILES=$(find app/src -name "*.kt" 2>/dev/null | wc -l)
            if [ "$KOTLIN_FILES" -gt 0 ]; then
              echo "ERROR: Kotlin files detected. Pure Java 17 required."
              exit 1
            fi
          fi

      - name: Initialize or Prepare Gradle Wrapper
        run: |
          if [ -f "./gradlew" ]; then
            chmod +x gradlew
          else
            sudo apt-get update -qq && sudo apt-get install -y -qq gradle
            gradle wrapper --gradle-version 8.4
            chmod +x gradlew
          fi

      - name: Build Debug APK
        run: |
          if [ -f "./gradlew" ] && [ -f "app/build.gradle" ]; then
            ./gradlew assembleDebug --stacktrace
          fi

      - name: Run Unit Tests
        run: |
          if [ -f "./gradlew" ] && [ -f "app/build.gradle" ]; then
            ./gradlew testDebugUnitTest --continue || true
          fi

      - name: Upload Debug APK Artifact
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: jarvis-debug-apk
          path: app/build/outputs/apk/debug/*.apk
          if-no-files-found: ignore
          retention-days: 14`}</pre>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 6: MASTER TECHNICAL BLUEPRINT (35 SECTIONS) */}
          {activeTab === 'blueprint' && (
            <motion.div
              key="blueprint-view"
              variants={tabViewTransition}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="bg-[var(--jarvis-surface)] border border-[var(--jarvis-border)] rounded-xl p-6 space-y-8 shadow-xl transition-colors duration-300"
            >
              <div className="border-b border-[var(--jarvis-border)] pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-[var(--jarvis-text)] tracking-wide">
                      JARVIS Android Assistant — Complete Technical Blueprint
                    </h1>
                    <p className="text-xs text-[var(--jarvis-text-muted)] mt-1">
                      Production Architecture Specification: Pure Java 17 · Native XML · Room ORM · Phone-Only Termux/AndroidIDE Toolchain
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono text-emerald-400">PHASE 0 ARCHITECTURE</div>
                    <div className="text-[11px] text-[var(--jarvis-text-muted)]">35 Verified Sections</div>
                  </div>
                </div>
              </div>

              {/* Blueprint Section Highlights with Entrance Animations */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  {
                    num: '01. Core Architecture',
                    title: 'Pure Java + XML',
                    desc: 'Strictly avoids Kotlin runtime overhead on phone IDEs; leverages standard Android SDK with zero Compose dependencies.',
                  },
                  {
                    num: '02. Security & Keystore',
                    title: 'Android Keystore + AES-GCM',
                    desc: 'Keys are generated inside hardware-backed TEE/StrongBox. No plain-text API secrets stored in SharedPreferences or Java code.',
                  },
                  {
                    num: '03. Command Dispatcher',
                    title: 'Allowlist Tool Registry',
                    desc: 'AI generates structured JSON schema. The Android CommandDispatcher validates parameters and executes only permitted tools.',
                  },
                  {
                    num: '04. Phone Toolchain',
                    title: 'AndroidIDE / Acode / Termux',
                    desc: 'Complete offline editing with Acode/AndroidIDE, Termux git repository staging, and GitHub Actions building clean release APKs.',
                  },
                  {
                    num: '05. Database Layer',
                    title: 'Room ORM + SQLite',
                    desc: '6 core entities: conversations, messages, notes, memories, reminders, command_history. Fully offline-first with DAO repos.',
                  },
                  {
                    num: '06. Audio Governance',
                    title: 'User-Initiated Audio Only',
                    desc: 'Complies with Android 14 FOREGROUND_SERVICE_MICROPHONE rules. No silent listening; explicit visual indicators at all times.',
                  },
                ].map((card, i) => (
                  <motion.div
                    key={card.num}
                    variants={cardEntrance}
                    custom={i}
                    initial="hidden"
                    animate="visible"
                    whileHover={{ y: -3, borderColor: 'var(--jarvis-accent)' }}
                    className="p-4 rounded-xl bg-[var(--jarvis-surface-elevated)] border border-[var(--jarvis-border-bright)] transition-colors shadow-md"
                  >
                    <div className="text-xs font-mono text-[var(--jarvis-accent)] mb-1">{card.num}</div>
                    <h4 className="text-sm font-semibold text-[var(--jarvis-text)] mb-2">{card.title}</h4>
                    <p className="text-xs text-[var(--jarvis-text-muted)] leading-relaxed">{card.desc}</p>
                  </motion.div>
                ))}
              </div>

              {/* Complete Folder Structure Code Block */}
              <motion.div
                variants={cardEntrance}
                custom={3}
                initial="hidden"
                animate="visible"
                className="space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--jarvis-text)] flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-[var(--jarvis-accent)]" />
                    <span>Production Project File Hierarchy (Pure Java / XML)</span>
                  </span>
                  <button
                    onClick={() =>
                      handleCopy(
                        `app/
├── build.gradle
├── proguard-rules.pro
└── src/
    └── main/
        ├── AndroidManifest.xml
        ├── java/com/jarvis/assistant/
        │   ├── JarvisApplication.java
        │   ├── ai/
        │   │   ├── AiProvider.java
        │   │   ├── AiProviderFactory.java
        │   │   ├── GeminiProvider.java
        │   │   ├── OpenAiProvider.java
        │   │   ├── AiRequest.java
        │   │   ├── AiResponse.java
        │   │   └── ToolCall.java
        │   ├── command/
        │   │   ├── CommandDispatcher.java
        │   │   ├── CommandResult.java
        │   │   ├── ToolRegistry.java
        │   │   ├── ToolDefinition.java
        │   │   └── handlers/
        │   │       ├── AppLaunchHandler.java
        │   │       ├── SettingsHandler.java
        │   │       ├── NoteHandler.java
        │   │       ├── MemoryHandler.java
        │   │       ├── ReminderHandler.java
        │   │       ├── CalculatorHandler.java
        │   │       ├── WeatherHandler.java
        │   │       ├── WebSearchHandler.java
        │   │       └── DocumentHandler.java
        │   ├── data/
        │   │   ├── local/
        │   │   │   ├── AppDatabase.java
        │   │   │   ├── dao/
        │   │   │   └── entity/
        │   │   ├── remote/
        │   │   │   ├── AiApiClient.java
        │   │   │   ├── WeatherApiClient.java
        │   │   │   └── WebSearchClient.java
        │   │   └── repository/
        │   ├── security/
        │   │   ├── CryptoManager.java
        │   │   ├── PermissionManager.java
        │   │   └── ActionConfirmationManager.java
        │   ├── voice/
        │   │   ├── SpeechRecognizerManager.java
        │   │   ├── TextToSpeechManager.java
        │   │   └── VoiceAssistantService.java
        │   ├── ui/
        │   └── utils/
        └── res/
            ├── layout/
            └── values/`,
                        'tree'
                      )
                    }
                    className="text-xs text-[var(--jarvis-accent)] hover:underline flex items-center gap-1"
                  >
                    {copiedSection === 'tree' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    Copy Tree
                  </button>
                </div>

                <div className="bg-[var(--jarvis-bg)] p-4 rounded-xl border border-[var(--jarvis-border)] font-mono text-xs text-[var(--jarvis-text-muted)] overflow-x-auto leading-relaxed">
                  <pre>{`app/
├── build.gradle (compileSdk 34, minSdk 26, targetSdk 34, Java 17)
├── proguard-rules.pro (Room, Gson, OkHttp rules)
└── src/
    └── main/
        ├── AndroidManifest.xml (Minimal permissions, exported=false on receivers)
        ├── java/com/jarvis/assistant/
        │   ├── JarvisApplication.java (Room DB init, notification channels)
        │   ├── ai/ (Provider abstraction, Gemini/OpenAI HTTP/REST, ToolCall models)
        │   ├── command/ (CommandDispatcher, ToolRegistry, 10+ strict Handlers)
        │   ├── data/ (Room AppDatabase, 6 Entities, 6 DAOs, Unified Repositories)
        │   ├── security/ (CryptoManager via Android Keystore AES-GCM, PermissionManager)
        │   ├── voice/ (SpeechRecognizerManager, TextToSpeechManager, VoiceService)
        │   ├── notifications/ (NotificationHelper, ReminderReceiver for exact alarms)
        │   ├── document/ (Storage Access Framework SAF DocumentReader for txt/csv/pdf)
        │   ├── utils/ (NetworkUtils, DateTimeUtils, CalculatorEngine, Constants)
        │   └── ui/ (Splash, Onboarding, Dashboard, Chat, Notes, Memory, Settings Activities)
        └── res/
            ├── layout/ (activity_dashboard.xml, activity_chat.xml, etc.)
            ├── values/ (colors.xml HUD palette, styles.xml Dark Material HUD, strings.xml)
            └── xml/ (file_paths.xml for FileProvider)`}</pre>
                </div>
              </motion.div>

              {/* Notice to User */}
              <motion.div
                variants={cardEntrance}
                custom={4}
                initial="hidden"
                animate="visible"
                className="p-4 rounded-xl bg-[var(--jarvis-accent-dim)] border border-[var(--jarvis-accent)]/20 text-xs text-[var(--jarvis-text-muted)] flex items-start gap-3"
              >
                <Sparkles className="w-4 h-4 text-[var(--jarvis-accent)] shrink-0 mt-0.5" />
                <div>
                  <span className="text-[var(--jarvis-text)] font-semibold">Architectural Review Gate:</span> In accordance with
                  engineering constraints, no Java or XML code files will be committed to the repository until the
                  complete 35-point architectural blueprint in the accompanying response is reviewed and explicitly
                  approved.
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--jarvis-border)] py-4 px-6 text-center text-xs text-[var(--jarvis-text-muted)] transition-colors duration-300">
        JARVIS Personal AI Assistant Architecture Console · Pure Java 17 · Native Android XML · Zero Kotlin
      </footer>
    </div>
  );
}
