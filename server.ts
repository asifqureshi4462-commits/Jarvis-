import express, { Request, Response } from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { WebSocketServer, WebSocket } from "ws";
import {
  GoogleGenAI,
  FunctionDeclaration,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
} from "@google/genai";
import { registerCreatorOAuthRoutes } from "./server/creatorOAuth.js";
import { registerCreatorRoutes } from "./server/creatorRoutes.js";
import { buildVerifiedArchitecturePrompt } from "./src/config/systemKnowledge.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

function getGeminiClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment secrets.");
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

const jarvisTools: FunctionDeclaration[] = [
  {
    name: "add_task",
    description: "Add a new task or reminder to the user's Today Tasks list.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Short clear task description" },
        priority: {
          type: Type.STRING,
          description: "Task priority: low, medium, or high",
        },
        dueDate: {
          type: Type.STRING,
          description: "Optional due date (YYYY-MM-DD or Today/Tomorrow)",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "complete_task",
    description: "Mark an existing task as completed by matching its title.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        titleQuery: { type: Type.STRING, description: "Task title or keywords" },
      },
      required: ["titleQuery"],
    },
  },
  {
    name: "save_memory",
    description:
      "Save a user preference, personal fact, routine, or project detail to persistent memory. Never save passwords or API keys.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        content: { type: Type.STRING, description: "Memory fact to remember" },
        category: {
          type: Type.STRING,
          description: "One of: preference, fact, project, contact, routine",
        },
        importance: {
          type: Type.STRING,
          description: "One of: low, medium, high",
        },
      },
      required: ["content", "category"],
    },
  },
  {
    name: "save_note",
    description: "Create a quick personal note for the user.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Note title" },
        content: { type: Type.STRING, description: "Note body content" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "open_app_action",
    description:
      "Open a supported application, website, YouTube search, camera viewfinder, photo gallery, calculator, browser URL, or device intent (youtube, instagram, facebook, whatsapp, browser, chrome, maps, gmail, calendar, camera, gallery, calculator, bluetooth, wifi, settings, phone).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        target: {
          type: Type.STRING,
          description:
            "Target app or service name (youtube, instagram, facebook, whatsapp, browser, chrome, maps, gmail, calendar, camera, gallery, calculator, bluetooth, wifi, settings, phone, creator, memory, chat, soul, workspace)",
        },
        query: {
          type: Type.STRING,
          description: "Optional search query, phone number, or URL",
        },
      },
      required: ["target"],
    },
  },
  {
    name: "set_alarm_timer",
    description: "Set an in-app alarm or countdown timer with audible alert.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        label: { type: Type.STRING, description: "Label for the alarm/timer" },
        minutes: { type: Type.NUMBER, description: "Duration in minutes" },
      },
      required: ["label", "minutes"],
    },
  },
  {
    name: "navigate_panel",
    description:
      "Switch the active J.A.R.V.I.S screen to dashboard, memory, chat, soul, workspace, creator, maps, or settings.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        panel: {
          type: Type.STRING,
          description: "One of: dashboard, memory, chat, soul, workspace, creator, maps, settings",
        },
      },
      required: ["panel"],
    },
  },
  {
    name: "creator_action",
    description:
      "Control the J.A.R.V.I.S Creator Studio module for YouTube/social analytics, AI topic ideas, short-form Reels or long-form scripts, thumbnail concepts, content calendar, or preparing a publish preview.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description:
            "One of: analyze_youtube, suggest_topics, create_reel, create_longform_script, generate_thumbnail, show_top_videos, plan_schedule, prepare_upload, open_section",
        },
        topic: {
          type: Type.STRING,
          description: "Optional topic or video title",
        },
        section: {
          type: Type.STRING,
          description:
            "Optional Creator Studio sub-section: overview, accounts, youtube, instagram, facebook, ideas, competitor, scripts, video, thumbnails, seo, publish, calendar, reports",
        },
        platform: {
          type: Type.STRING,
          description: "Optional target platform (youtube, instagram, facebook, telegram, x, linkedin)",
        },
      },
      required: ["action"],
    },
  },
];

interface SoulConfig {
  assistantName?: string;
  addressTitle?: string;
  personalityTone?: string;
  languages?: string[];
  customDirectives?: string;
}

function buildSystemInstruction(
  soul: SoulConfig | undefined,
  memories: Array<{ content: string; category: string }> | undefined,
  workspaceSummary: string | undefined,
  modelMode = "fast",
  voiceEngine = "elevenlabs",
  isVoice = false,
  userMessage = ""
): string {
  const name = soul?.assistantName || "J.A.R.V.I.S.";
  const title = soul?.addressTitle || "Sir";
  const tone =
    soul?.personalityTone ||
    "Intelligent, composed, polite, helpful, and subtly witty.";
  const languages =
    Array.isArray(soul?.languages) && soul.languages.length > 0
      ? soul.languages.join(", ")
      : "English, Hindi, Urdu";
  const directives = soul?.customDirectives || "";

  const memoryBlock =
    Array.isArray(memories) && memories.length > 0
      ? `\nKnown user memories:\n${memories
          .slice(0, 14)
          .map((m) => `- [${m.category}] ${m.content}`)
          .join("\n")}`
      : "";

  const workspaceBlock = workspaceSummary
    ? `\nLive Workspace Context:\n${workspaceSummary}`
    : "";

  const needsFullTechContext =
    /\b(architecture|tech|stack|language|model|database|firestore|sdk|backend|frontend|firebase|voice|tts|stt|elevenlabs|creator|developer|asif|created|developed|made|built|owns|programmed|android|apk|permission)\b/i.test(
      userMessage
    );

  const identityAndTech = needsFullTechContext
    ? buildVerifiedArchitecturePrompt(modelMode, voiceEngine)
    : `Developer Identity: Created and developed by Asif Qureshi. Assistant: J.A.R.V.I.S (Just A Rather Very Intelligent System). Never invent unverified developer history.`;

  const voiceRule = isVoice
    ? `\nVoice Response Style: Speak in concise, natural sentences suitable for immediate text-to-speech playback. Lead directly with the answer in the first sentence; avoid markdown tables, bullet punctuation clutter, or raw URLs.`
    : "";

  return `You are ${name}, a futuristic personal AI assistant.
Personality: ${tone}
Languages: ${languages}. Reply naturally in the user's language (English, Hindi, or Urdu) and address them as "${title}" where natural.
Current date & time: ${new Date().toISOString()}.
Never fabricate facts, emails, events, or developer history. Never execute irreversible actions without confirmation.
${voiceRule}
${identityAndTech}
${directives ? `Custom directives: ${directives}\n` : ""}${memoryBlock}${workspaceBlock}`;
}

function validateElevenLabsVoiceId(voiceId: string | undefined): {
  valid: boolean;
  reason?: string;
} {
  if (!voiceId || !voiceId.trim()) {
    return { valid: false, reason: "ElevenLabs Voice ID is empty." };
  }
  const trimmed = voiceId.trim();
  if (trimmed === "00000" || /^0+$/.test(trimmed)) {
    return {
      valid: false,
      reason:
        "Voice ID '00000' is a placeholder. Please enter a valid ElevenLabs Voice ID in Settings.",
    };
  }
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(trimmed)) {
    return {
      valid: false,
      reason: "Invalid ElevenLabs Voice ID format.",
    };
  }
  return { valid: true };
}

function isQuotaError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || "");
  return (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.toLowerCase().includes("quota")
  );
}

function isNotFoundError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || "");
  return (
    msg.includes("404") ||
    msg.includes("NOT_FOUND") ||
    msg.toLowerCase().includes("not found")
  );
}

function isTransientError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || "");
  return (
    msg.includes("503") ||
    msg.includes("UNAVAILABLE") ||
    msg.toLowerCase().includes("high demand") ||
    msg.toLowerCase().includes("overloaded")
  );
}

function formatGeminiError(error: unknown, fallback: string): {
  status: number;
  message: string;
} {
  if (isQuotaError(error)) {
    return {
      status: 429,
      message:
        "Gemini API rate limit reached. Please wait a moment and try again, or switch to Fast mode.",
    };
  }
  if (isTransientError(error)) {
    return {
      status: 503,
      message:
        "Gemini service is temporarily busy due to high demand. Please try again in a few seconds.",
    };
  }
  if (isNotFoundError(error)) {
    return {
      status: 404,
      message: "Requested Gemini model is unavailable on this API version.",
    };
  }
  return {
    status: 500,
    message: error instanceof Error ? error.message : fallback,
  };
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .trim();
}

function parseRssArticles(
  xml: string
): Array<{ title: string; url: string; source: string }> {
  const articles: Array<{ title: string; url: string; source: string }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && articles.length < 8) {
    const block = match[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

    const rawTitle = titleMatch ? decodeXmlEntities(titleMatch[1]) : "";
    const url = linkMatch ? decodeXmlEntities(linkMatch[1]) : "";
    let source = sourceMatch ? decodeXmlEntities(sourceMatch[1]) : "";

    let title = rawTitle;
    if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -` - ${source}`.length).trim();
    } else if (!source && title.includes(" - ")) {
      const idx = title.lastIndexOf(" - ");
      source = title.slice(idx + 3).trim();
      title = title.slice(0, idx).trim();
    }

    if (title && url.startsWith("http")) {
      articles.push({
        title,
        url,
        source: source || "Google News",
      });
    }
  }
  return articles;
}

const NEWS_RSS_URLS: Record<string, string> = {
  technology:
    "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en",
  ai: "https://news.google.com/rss/search?q=artificial+intelligence&hl=en-US&gl=US&ceid=US:en",
  business:
    "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en",
  world:
    "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en",
  science:
    "https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-US&gl=US&ceid=US:en",
};

const newsCache: Record<
  string,
  {
    articles: Array<{ title: string; url: string; source: string }>;
    summaryText: string;
    fetchedAt: string;
    expiresAt: number;
  }
> = {};

async function startServer() {
  const app = express();
  const allowedOrigins = ["https://localhost", "http://localhost", "capacitor://localhost"];
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: "25mb" }));

  // Health & real connection status
  app.get("/api/health", (_req: Request, res: Response) => {
    const rawEnvVoice = process.env.ELEVENLABS_VOICE_ID;
    const defaultVoiceId =
      rawEnvVoice && rawEnvVoice.trim() && rawEnvVoice.trim() !== "00000"
        ? rawEnvVoice.trim()
        : "uuyFQegRan8rpIQCGu9K";
    const voiceValidation = validateElevenLabsVoiceId(defaultVoiceId);
    res.json({
      status: "online",
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      elevenLabsConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
      elevenLabsVoiceIdValid: voiceValidation.valid,
      elevenLabsDefaultVoiceId: defaultVoiceId,
      elevenLabsDefaultModelId: "eleven_flash_v2_5",
      mapsConfigured: Boolean(process.env.VITE_GOOGLE_MAPS_API_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  function resolveChatPlan(
    modelMode: string,
    message: string,
    useMapsGrounding: boolean,
    location: { latitude?: number; longitude?: number } | undefined,
    systemInstruction: string
  ) {
    let modelName = "gemini-3.1-flash-lite";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: Record<string, any> = { systemInstruction };

    const isPlaceQuery =
      useMapsGrounding ||
      /\b(near me|nearby|directions|route|restaurant|cafe|hospital|map|where is|distance to|places around)\b/i.test(
        message
      );

    const needsLiveWebSearch =
      /\b(latest|today|current|news|weather|price|stock|score|who won|release date|forecast)\b/i.test(
        message
      );

    const needsToolDeclarations =
      /\b(task|todo|remind|reminder|remember|memory|note|open|launch|alarm|timer|go to|navigate|switch|creator|youtube|reel|script|thumbnail|instagram|facebook|whatsapp|gmail|calendar|camera|gallery|calculator|call|dial)\b/i.test(
        message
      );

    if (isPlaceQuery) {
      modelName = "gemini-4-hydrogen";
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      config.tools = [{ googleMaps: {} }];
      if (
        location &&
        typeof location.latitude === "number" &&
        typeof location.longitude === "number"
      ) {
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: location.latitude,
              longitude: location.longitude,
            },
          },
        };
      }
    } else if (modelMode === "deep") {
      modelName = "gemini-4-hydrogen";
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.XHIGH };
      config.tools = [{ googleSearch: {} }, { functionDeclarations: jarvisTools }];
      config.toolConfig = { includeServerSideToolInvocations: true };
    } else if (modelMode === "balanced") {
      modelName = "gemini-4-hydrogen";
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
      config.tools = [{ googleSearch: {} }, { functionDeclarations: jarvisTools }];
      config.toolConfig = { includeServerSideToolInvocations: true };
    } else {
      // Fast mode (default for real-time voice conversation: omit heavy tool schemas on ordinary Q&A)
      modelName = "gemini-3.1-flash-lite";
      if (needsLiveWebSearch && needsToolDeclarations) {
        config.tools = [{ googleSearch: {} }, { functionDeclarations: jarvisTools }];
      } else if (needsLiveWebSearch) {
        config.tools = [{ googleSearch: {} }];
      } else if (needsToolDeclarations) {
        config.tools = [{ functionDeclarations: jarvisTools }];
      }
    }
    return { modelName, config };
  }

  let cachedTranscribeCandidate: { model: string; apiVersion?: string } | null = null;
  const PREMADE_MALE_VOICE_ID = "onwK4e9ZLuTAKqWW03F9"; // Daniel - Steady Broadcaster (premade male)
  const paidPlanBlockedVoiceIds = new Set<string>();

  // Streaming J.A.R.V.I.S Chat & Command Endpoint (SSE)
  app.post("/api/jarvis/chat/stream", async (req: Request, res: Response) => {
    const t0 = performance.now();
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const sendEvent = (event: string, data: unknown) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      const {
        message,
        history = [],
        modelMode = "fast",
        voiceEngine = "elevenlabs",
        isVoice = false,
        soulConfig,
        memories = [],
        location,
        workspaceSummary,
        useMapsGrounding = false,
      } = req.body ?? {};

      if (typeof message !== "string" || !message.trim()) {
        sendEvent("error", { error: "Message is required." });
        return res.end();
      }

      const ai = getGeminiClient();
      const systemInstruction = buildSystemInstruction(
        soulConfig,
        memories,
        workspaceSummary,
        modelMode,
        voiceEngine,
        Boolean(isVoice),
        message
      );

      let { modelName, config } = resolveChatPlan(
        modelMode,
        message,
        useMapsGrounding,
        location,
        systemInstruction
      );

      const contents = [
        ...(Array.isArray(history)
          ? history.slice(-10).map((h: { role: string; text: string }) => ({
              role: h.role === "assistant" ? "model" : "user",
              parts: [{ text: String(h.text || "") }],
            }))
          : []),
        { role: "user", parts: [{ text: message }] },
      ];

      let fullText = "";
      let aiFirstTokenMs: number | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let groundingChunks: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let functionCalls: any[] = [];

      const runStream = async (targetModel: string, targetConfig: Record<string, unknown>) => {
        const streamTimeoutMs =
          modelMode === "deep" ? 45000 : modelMode === "balanced" ? 16000 : 10000;
        const streamPromise = ai.models.generateContentStream({
          model: targetModel,
          contents,
          config: targetConfig,
        });
        const stream = await Promise.race([
          streamPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("503 AI response stream timed out.")), streamTimeoutMs)
          ),
        ]);
        for await (const chunk of stream) {
          if (chunk.text) {
            if (aiFirstTokenMs === undefined) {
              aiFirstTokenMs = Math.round(performance.now() - t0);
            }
            fullText += chunk.text;
            sendEvent("delta", { text: chunk.text });
          }
          const gChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (Array.isArray(gChunks) && gChunks.length > 0) {
            groundingChunks = gChunks;
          }
          if (Array.isArray(chunk.functionCalls) && chunk.functionCalls.length > 0) {
            functionCalls = [...functionCalls, ...chunk.functionCalls];
          }
        }
      };

      try {
        await runStream(modelName, config);
      } catch (primaryErr) {
        if (isQuotaError(primaryErr) || isTransientError(primaryErr)) {
          const fallbackModel =
            modelName === "gemini-3.1-flash-lite"
              ? "gemini-4-hydrogen"
              : "gemini-3.1-flash-lite";
          modelName = fallbackModel;
          fullText = "";
          aiFirstTokenMs = undefined;
          functionCalls = [];
          try {
            await runStream(modelName, {
              systemInstruction,
              ...(modelName === "gemini-4-hydrogen"
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
              tools: [{ functionDeclarations: jarvisTools }],
            });
          } catch (secondaryErr) {
            if (isTransientError(secondaryErr)) {
              await new Promise((r) => setTimeout(r, 350));
              modelName = "gemini-3.1-flash-lite";
              fullText = "";
              aiFirstTokenMs = undefined;
              functionCalls = [];
              await runStream(modelName, {
                systemInstruction,
                tools: [{ functionDeclarations: jarvisTools }],
              });
            } else {
              throw secondaryErr;
            }
          }
        } else {
          throw primaryErr;
        }
      }

      if (!fullText && functionCalls.length > 0) {
        const names = functionCalls.map((fc) => fc.name).join(", ");
        fullText = `Executing command (${names}), ${soulConfig?.addressTitle || "Sir"}.`;
        sendEvent("delta", { text: fullText });
      }

      const aiTotalMs = Math.round(performance.now() - t0);
      sendEvent("done", {
        reply: fullText,
        modelUsed: modelName,
        groundingChunks,
        toolCalls: functionCalls,
        serverTimingMs: {
          aiFirstTokenMs: aiFirstTokenMs ?? aiTotalMs,
          aiTotalMs,
        },
      });
      res.end();
    } catch (error: unknown) {
      const formatted = formatGeminiError(
        error,
        "Failed to stream J.A.R.V.I.S response."
      );
      if (formatted.status !== 429) {
        console.error("Chat stream error:", error);
      }
      sendEvent("error", { error: formatted.message, status: formatted.status });
      res.end();
    }
  });

  // Main J.A.R.V.I.S Chat & Command Endpoint (JSON)
  app.post("/api/jarvis/chat", async (req: Request, res: Response) => {
    const t0 = performance.now();
    try {
      const {
        message,
        history = [],
        modelMode = "fast",
        voiceEngine = "elevenlabs",
        isVoice = false,
        soulConfig,
        memories = [],
        location,
        workspaceSummary,
        useMapsGrounding = false,
      } = req.body ?? {};

      if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Message is required." });
      }

      const ai = getGeminiClient();
      const systemInstruction = buildSystemInstruction(
        soulConfig,
        memories,
        workspaceSummary,
        modelMode,
        voiceEngine,
        Boolean(isVoice),
        message
      );

      let { modelName, config } = resolveChatPlan(
        modelMode,
        message,
        useMapsGrounding,
        location,
        systemInstruction
      );

      const contents = [
        ...Array.isArray(history)
          ? history.slice(-16).map((h: { role: string; text: string }) => ({
              role: h.role === "assistant" ? "model" : "user",
              parts: [{ text: String(h.text || "") }],
            }))
          : [],
        { role: "user", parts: [{ text: message }] },
      ];

      let response;
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents,
          config,
        });
      } catch (primaryErr) {
        if (isQuotaError(primaryErr) || isTransientError(primaryErr)) {
          const fallbackModel =
            modelName === "gemini-3.1-flash-lite"
              ? "gemini-4-hydrogen"
              : "gemini-3.1-flash-lite";
          modelName = fallbackModel;
          response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: {
              systemInstruction,
              ...(modelName === "gemini-4-hydrogen"
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
              tools: [{ functionDeclarations: jarvisTools }],
            },
          });
        } else {
          throw primaryErr;
        }
      }

      const groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const functionCalls = response.functionCalls ?? [];

      let replyText = response.text || "";
      if (!replyText && functionCalls.length > 0) {
        const names = functionCalls.map((fc) => fc.name).join(", ");
        replyText = `Executing command (${names}), ${soulConfig?.addressTitle || "Sir"}.`;
      }

      res.json({
        reply: replyText,
        modelUsed: modelName,
        groundingChunks,
        toolCalls: functionCalls,
        aiTotalMs: Math.round(performance.now() - t0),
      });
    } catch (error: unknown) {
      const formatted = formatGeminiError(
        error,
        "Failed to generate J.A.R.V.I.S response."
      );
      if (formatted.status !== 429) {
        console.error("Chat error:", error);
      }
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Multimodal Image & Video Analysis
  app.post("/api/jarvis/analyze-media", async (req: Request, res: Response) => {
    try {
      const { mimeType, dataBase64, prompt } = req.body ?? {};
      if (!mimeType || !dataBase64) {
        return res
          .status(400)
          .json({ error: "Both mimeType and base64 media data are required." });
      }
      if (typeof dataBase64 !== "string" || dataBase64.length > 20 * 1024 * 1024) {
        return res.status(400).json({ error: "Media payload exceeds 15MB limit." });
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: String(mimeType),
                data: dataBase64,
              },
            },
            {
              text:
                typeof prompt === "string" && prompt.trim()
                  ? prompt
                  : "Analyze this media in detail as J.A.R.V.I.S. Highlight key objects, text, events, and actionable insights.",
            },
          ],
        },
      });

      res.json({
        analysis: response.text || "No analysis generated.",
        modelUsed: "gemini-4-hydrogen",
      });
    } catch (error: unknown) {
      const formatted = formatGeminiError(error, "Media analysis failed.");
      if (formatted.status !== 429) {
        console.error("Media analysis error:", error);
      }
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Pre-recorded Audio Transcription (cached working model + fast fallback)
  app.post("/api/jarvis/transcribe", async (req: Request, res: Response) => {
    try {
      const { mimeType = "audio/webm", dataBase64 } = req.body ?? {};
      if (!dataBase64 || typeof dataBase64 !== "string") {
        return res.status(400).json({ error: "Audio dataBase64 is required." });
      }

      const cleanMime = String(mimeType).split(";")[0] || "audio/webm";
      const baseCandidates: Array<{ model: string; apiVersion?: string }> = [
        { model: "gemini-3.5-transcribe", apiVersion: "v1beta" },
        { model: "gemini-3.1-flash-lite" },
        { model: "gemini-4-hydrogen" },
      ];
      const candidates = cachedTranscribeCandidate
        ? [
            cachedTranscribeCandidate,
            ...baseCandidates.filter((c) => c.model !== cachedTranscribeCandidate?.model),
          ]
        : baseCandidates;

      let lastError: unknown = null;
      for (const candidate of candidates) {
        try {
          const ai = getGeminiClient(candidate.apiVersion);
          const response = await ai.models.generateContent({
            model: candidate.model,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMime,
                    data: dataBase64,
                  },
                },
                {
                  text: "Transcribe this spoken audio accurately in its original language (English, Hindi, or Urdu). Output only the spoken words with no commentary.",
                },
              ],
            },
          });

          cachedTranscribeCandidate = candidate;
          return res.json({
            transcript: (response.text || "").trim(),
            modelUsed: candidate.model,
          });
        } catch (err) {
          lastError = err;
          if (isNotFoundError(err) || isQuotaError(err)) {
            if (cachedTranscribeCandidate?.model === candidate.model) {
              cachedTranscribeCandidate = null;
            }
            continue;
          }
          throw err;
        }
      }

      throw lastError || new Error("Audio transcription failed.");
    } catch (error: unknown) {
      const formatted = formatGeminiError(error, "Audio transcription failed.");
      if (formatted.status !== 429) {
        console.error("Transcribe error:", error);
      }
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  function resolveElevenLabsConfig(
    elevenLabsVoiceId: unknown,
    modelId: unknown
  ):
    | { ok: true; apiKey: string; voiceId: string; modelId: string; note?: string }
    | { ok: false; status: number; error: string } {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        status: 400,
        error: "ELEVENLABS_API_KEY is missing in server Secrets. Male ElevenLabs voice cannot start.",
      };
    }

    const explicitVoiceId =
      typeof elevenLabsVoiceId === "string" ? elevenLabsVoiceId.trim() : "";
    const envVoiceId =
      typeof process.env.ELEVENLABS_VOICE_ID === "string" &&
      process.env.ELEVENLABS_VOICE_ID.trim() !== "00000"
        ? process.env.ELEVENLABS_VOICE_ID.trim()
        : "";
    let resolvedVoiceId: string =
      explicitVoiceId || envVoiceId || "uuyFQegRan8rpIQCGu9K";

    const validation = validateElevenLabsVoiceId(resolvedVoiceId);
    if (!validation.valid) {
      return {
        ok: false,
        status: 400,
        error: validation.reason || "Invalid ElevenLabs Voice ID.",
      };
    }

    let note: string | undefined;
    if (
      resolvedVoiceId !== PREMADE_MALE_VOICE_ID &&
      paidPlanBlockedVoiceIds.has(resolvedVoiceId)
    ) {
      note = `Using ElevenLabs premade male voice Daniel (${PREMADE_MALE_VOICE_ID}) because ${resolvedVoiceId} requires a paid ElevenLabs plan.`;
      resolvedVoiceId = PREMADE_MALE_VOICE_ID;
    }

    const allowedModels = [
      "eleven_flash_v2_5",
      "eleven_turbo_v2_5",
      "eleven_multilingual_v2",
    ];
    const requestedModel = typeof modelId === "string" ? modelId.trim() : "";
    const resolvedModelId = allowedModels.includes(requestedModel)
      ? requestedModel
      : process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5";

    return {
      ok: true,
      apiKey,
      voiceId: resolvedVoiceId,
      modelId: resolvedModelId,
      note,
    };
  }

  // Streaming Voice Synthesis (Low-latency ElevenLabs MP3 byte stream)
  app.post("/api/jarvis/tts/stream", async (req: Request, res: Response) => {
    try {
      const {
        text,
        elevenLabsVoiceId,
        modelId = "eleven_flash_v2_5",
        stability = 0.5,
        similarity = 0.75,
        speed = 1.0,
      } = req.body ?? {};

      if (typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "Text is required for speech output." });
      }

      const cfg = resolveElevenLabsConfig(elevenLabsVoiceId, modelId);
      if (!cfg.ok) {
        return res.status(cfg.status).json({ error: cfg.error });
      }

      const controller = new AbortController();
      res.on("close", () => {
        if (!res.writableFinished) controller.abort();
      });

      const callElevenLabsStream = (voiceIdToUse: string) =>
        fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceIdToUse)}/stream?optimize_streaming_latency=3&output_format=mp3_44100_128`,
          {
            method: "POST",
            signal: controller.signal,
            headers: {
              "xi-api-key": cfg.apiKey,
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
            },
            body: JSON.stringify({
              text: text.slice(0, 2500),
              model_id: cfg.modelId,
              voice_settings: {
                stability: Math.min(1, Math.max(0, Number(stability) || 0.5)),
                similarity_boost: Math.min(1, Math.max(0, Number(similarity) || 0.75)),
                speed: Math.min(1.2, Math.max(0.7, Number(speed) || 1.0)),
              },
            }),
          }
        );

      let activeVoiceId = cfg.voiceId;
      let activeNote = cfg.note;
      let elRes = await callElevenLabsStream(activeVoiceId);

      if (elRes.status === 402 && activeVoiceId !== PREMADE_MALE_VOICE_ID) {
        const errBody = await elRes.text().catch(() => "");
        if (errBody.includes("paid_plan_required") || errBody.includes("library voices")) {
          paidPlanBlockedVoiceIds.add(activeVoiceId);
          activeNote = `Switched to ElevenLabs premade male voice Daniel (${PREMADE_MALE_VOICE_ID}) because ${activeVoiceId} requires a paid ElevenLabs API plan.`;
          activeVoiceId = PREMADE_MALE_VOICE_ID;
          elRes = await callElevenLabsStream(activeVoiceId);
        } else {
          return res.status(402).json({
            error: `ElevenLabs stream error (402): ${errBody}`,
          });
        }
      }

      if (!elRes.ok || !elRes.body) {
        const errText = await elRes.text().catch(() => "Stream refused");
        return res.status(elRes.status || 502).json({
          error: `ElevenLabs stream error (${elRes.status}): ${errText}`,
        });
      }

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Voice-Engine", "elevenlabs");
      res.setHeader("X-Voice-Model", cfg.modelId);
      res.setHeader("X-Voice-Id", activeVoiceId);
      if (activeNote) {
        res.setHeader("X-Voice-Note", activeNote);
      }

      const reader = elRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0 && !res.writableEnded) {
          res.write(Buffer.from(value));
        }
      }
      if (!res.writableEnded) res.end();
    } catch (error: unknown) {
      if ((error as { name?: string })?.name === "AbortError") {
        if (!res.writableEnded) res.end();
        return;
      }
      console.error("Streaming TTS error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          error: error instanceof Error ? error.message : "Streaming speech synthesis failed.",
        });
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });

  // Voice Synthesis (ElevenLabs primary male voice or optional Gemini Male TTS)
  app.post("/api/jarvis/tts", async (req: Request, res: Response) => {
    try {
      const {
        text,
        engine = "elevenlabs",
        geminiVoiceName = "Charon",
        elevenLabsVoiceId,
        modelId = "eleven_flash_v2_5",
        stability = 0.5,
        similarity = 0.75,
        speed = 1.0,
      } = req.body ?? {};

      if (typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "Text is required for speech output." });
      }

      if (engine === "elevenlabs") {
        const cfg = resolveElevenLabsConfig(elevenLabsVoiceId, modelId);
        if (!cfg.ok) {
          return res.status(cfg.status).json({ error: cfg.error });
        }

        const callElevenLabsBuffered = (voiceIdToUse: string) =>
          fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceIdToUse)}?optimize_streaming_latency=3`,
            {
              method: "POST",
              headers: {
                "xi-api-key": cfg.apiKey,
                "Content-Type": "application/json",
                Accept: "audio/mpeg",
              },
              body: JSON.stringify({
                text: text.slice(0, 2500),
                model_id: cfg.modelId,
                voice_settings: {
                  stability: Math.min(1, Math.max(0, Number(stability) || 0.5)),
                  similarity_boost: Math.min(1, Math.max(0, Number(similarity) || 0.75)),
                  speed: Math.min(1.2, Math.max(0.7, Number(speed) || 1.0)),
                },
              }),
            }
          );

        let activeVoiceId = cfg.voiceId;
        let activeNote = cfg.note;
        let elRes = await callElevenLabsBuffered(activeVoiceId);

        if (elRes.status === 402 && activeVoiceId !== PREMADE_MALE_VOICE_ID) {
          const errBody = await elRes.text().catch(() => "");
          if (errBody.includes("paid_plan_required") || errBody.includes("library voices")) {
            paidPlanBlockedVoiceIds.add(activeVoiceId);
            activeNote = `Switched to ElevenLabs premade male voice Daniel (${PREMADE_MALE_VOICE_ID}) because ${activeVoiceId} requires a paid ElevenLabs API plan.`;
            activeVoiceId = PREMADE_MALE_VOICE_ID;
            elRes = await callElevenLabsBuffered(activeVoiceId);
          } else {
            return res.status(402).json({
              error: `ElevenLabs API error (402): ${errBody}`,
            });
          }
        }

        if (!elRes.ok) {
          const errText = await elRes.text();
          return res.status(elRes.status).json({
            error: `ElevenLabs API error (${elRes.status}): ${errText}`,
          });
        }

        const arrayBuf = await elRes.arrayBuffer();
        const audioBase64 = Buffer.from(arrayBuf).toString("base64");
        return res.json({
          audioBase64,
          mimeType: "audio/mpeg",
          engine: "elevenlabs",
          modelId: cfg.modelId,
          voiceId: activeVoiceId,
          note: activeNote,
        });
      }

      // Optional explicit Gemini Male TTS (Charon / Fenrir / Puck)
      const allowedMaleVoices = ["Charon", "Fenrir", "Puck"];
      const safeVoice = allowedMaleVoices.includes(geminiVoiceName)
        ? geminiVoiceName
        : "Charon";

      const ttsPayload = {
        model: "gemini-3.8-flash-lite-tts",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: text.slice(0, 2500),
              },
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: safeVoice },
            },
          },
        },
      };

      let ttsResponse;
      try {
        ttsResponse = await getGeminiClient("v1beta").models.generateContent(
          ttsPayload
        );
      } catch (ttsErr) {
        if (isNotFoundError(ttsErr)) {
          ttsResponse = await getGeminiClient().models.generateContent(ttsPayload);
        } else {
          throw ttsErr;
        }
      }

      const audioBase64 =
        ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioBase64) {
        return res.status(502).json({ error: "Gemini TTS returned no audio payload." });
      }

      res.json({
        audioBase64,
        mimeType: "audio/wav",
        engine: "gemini",
        voiceName: safeVoice,
      });
    } catch (error: unknown) {
      const formatted = formatGeminiError(error, "Speech synthesis failed.");
      if (formatted.status !== 429) {
        console.error("TTS error:", error);
      }
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Test ElevenLabs Connection & Fetch Available Voices
  app.post("/api/elevenlabs/test", async (req: Request, res: Response) => {
    try {
      const { voiceId } = req.body ?? {};
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          connected: false,
          error: "ELEVENLABS_API_KEY is not set in server environment secrets.",
        });
      }

      const validation = validateElevenLabsVoiceId(
        voiceId || process.env.ELEVENLABS_VOICE_ID
      );

      const voicesRes = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": apiKey },
      });

      if (!voicesRes.ok) {
        const errText = await voicesRes.text();
        return res.status(voicesRes.status).json({
          connected: false,
          error: `ElevenLabs authentication failed: ${errText}`,
        });
      }

      const data = (await voicesRes.json()) as {
        voices?: Array<{ voice_id: string; name: string; category?: string }>;
      };

      const voices = (data.voices || []).map((v) => ({
        voiceId: v.voice_id,
        name: v.name,
        category: v.category || "custom",
      }));

      res.json({
        connected: true,
        voiceIdValid: validation.valid,
        voiceValidationMessage: validation.reason || "Voice ID format validated.",
        voices,
      });
    } catch (error: unknown) {
      res.status(500).json({
        connected: false,
        error: error instanceof Error ? error.message : "Connection test failed.",
      });
    }
  });

  // Live News Headlines via Google News RSS (cached) with Gemini Search Grounding fallback
  app.get("/api/news", async (req: Request, res: Response) => {
    const rawCategory = String(req.query.category || "technology").toLowerCase();
    const allowedCategories = ["technology", "ai", "business", "world", "science"];
    const category = allowedCategories.includes(rawCategory)
      ? rawCategory
      : "technology";

    const cached = newsCache[category];
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({
        category,
        summaryText: cached.summaryText,
        articles: cached.articles,
        fetchedAt: cached.fetchedAt,
      });
    }

    try {
      const rssUrl = NEWS_RSS_URLS[category] || NEWS_RSS_URLS.technology;
      const rssRes = await fetch(rssUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; JARVIS-HUD/1.0)",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
      });

      if (rssRes.ok) {
        const xml = await rssRes.text();
        const articles = parseRssArticles(xml);
        if (articles.length > 0) {
          const fetchedAt = new Date().toISOString();
          newsCache[category] = {
            articles,
            summaryText: "",
            fetchedAt,
            expiresAt: Date.now() + 10 * 60 * 1000,
          };
          return res.json({
            category,
            summaryText: "",
            articles,
            fetchedAt,
          });
        }
      }

      // Secondary fallback: Gemini Search Grounding
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: `Find 5 real, current top news headlines today in the "${category}" category.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const chunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

      const webLinks = chunks
        .filter((c) => c.web?.uri && c.web?.title)
        .map((c) => ({
          title: String(c.web?.title || ""),
          url: String(c.web?.uri || ""),
          source: (() => {
            try {
              return new URL(String(c.web?.uri)).hostname.replace(/^www\./, "");
            } catch {
              return "Web Source";
            }
          })(),
        }))
        .slice(0, 8);

      const fetchedAt = new Date().toISOString();
      newsCache[category] = {
        articles: webLinks,
        summaryText: response.text || "",
        fetchedAt,
        expiresAt: Date.now() + 10 * 60 * 1000,
      };

      return res.json({
        category,
        summaryText: response.text || "",
        articles: webLinks,
        fetchedAt,
      });
    } catch (error: unknown) {
      if (cached) {
        return res.json({
          category,
          summaryText: cached.summaryText,
          articles: cached.articles,
          fetchedAt: cached.fetchedAt,
        });
      }
      const formatted = formatGeminiError(error, "Unable to load live news feed.");
      if (formatted.status !== 429) {
        console.error("News fetch error:", error);
      }
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Creator Studio OAuth, Analytics, AI Strategist, FFmpeg Video & Publishing Routes
  registerCreatorOAuthRoutes(app);
  registerCreatorRoutes(app, getGeminiClient);

  // Mount Vite middleware in dev or static dist in production
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      appType: "spa",
    });
    app.get("/@vite/client", async (_req: Request, res: Response, next) => {
      try {
        const mod = await vite.transformRequest("/@vite/client");
        if (!mod?.code) return next();
        let patched = mod.code;
        const tStart = patched.indexOf("const transport = normalizeModuleRunnerTransport(");
        const tEnd = patched.indexOf("let willUnload = false;");
        if (tStart !== -1 && tEnd !== -1 && tEnd > tStart) {
          patched =
            patched.slice(0, tStart) +
            "const transport = normalizeModuleRunnerTransport({ connect() {}, disconnect() {}, send() {} });\n" +
            patched.slice(tEnd);
        }
        patched = patched.replace(
          /setupForwardConsoleHandler\(transport,\s*forwardConsole\);?/g,
          "/* console forward disabled */"
        );
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        return res.send(patched);
      } catch {
        return next();
      }
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = http.createServer(app);

  // Real-Time Gemini Live API WebSocket Bridge (/ws/live)
  const wss = new WebSocketServer({ server, path: "/ws/live" });

  wss.on("connection", async (clientWs: WebSocket, req) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI["live"]["connect"]>> | null = null;
    try {
      const url = new URL(req.url || "/ws/live", `http://${req.headers.host || "localhost"}`);
      const voiceName = url.searchParams.get("voice") || "Charon";
      const assistantName = url.searchParams.get("name") || "J.A.R.V.I.S.";
      const addressTitle = url.searchParams.get("title") || "Sir";

      const ai = getGeminiClient("v1beta");
      const allowedMaleVoices = ["Charon", "Fenrir", "Puck"];
      const safeVoice = allowedMaleVoices.includes(voiceName) ? voiceName : "Charon";

      liveSession = await ai.live.connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: safeVoice },
            },
          },
          systemInstruction: `You are ${assistantName} (Just A Rather Very Intelligent System). Speak concisely, politely, and intelligently in English, Hindi, or Urdu matching the user's language. Address the user as "${addressTitle}" when appropriate.\n${buildVerifiedArchitecturePrompt("live", "gemini-3.8-live")}`,
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "ready" }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;

            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: "inputTranscript",
                  text: content.inputTranscription.text,
                })
              );
            }

            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: "outputTranscript",
                  text: content.outputTranscription.text,
                })
              );
            }

            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(
                  JSON.stringify({
                    type: "audio",
                    data: part.inlineData.data,
                  })
                );
              }
            }

            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ type: "interrupted" }));
            }

            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ type: "turnComplete" }));
            }
          },
          onerror: (err: unknown) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: "error",
                  message:
                    err instanceof Error ? err.message : "Gemini Live stream error.",
                })
              );
            }
          },
          onclose: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "closed" }));
            }
          },
        },
      });
    } catch (error: unknown) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "Failed to initialize Gemini Live session.",
          })
        );
      }
      clientWs.close();
      return;
    }

    clientWs.on("message", (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        if (parsed.audio && liveSession) {
          liveSession.sendRealtimeInput({
            audio: {
              data: parsed.audio,
              mimeType: "audio/pcm;rate=16000",
            },
          });
        } else if (parsed.text && liveSession) {
          liveSession.sendRealtimeInput({
            text: String(parsed.text),
          });
        }
      } catch {
        // Ignore malformed websocket frame
      }
    });

    clientWs.on("close", () => {
      try {
        liveSession?.close();
      } catch {
        // Ignore cleanup errors
      }
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`J.A.R.V.I.S server active on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start J.A.R.V.I.S server:", err);
  process.exit(1);
});
