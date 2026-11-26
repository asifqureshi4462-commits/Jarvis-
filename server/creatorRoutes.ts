import fs from "node:fs";
import path from "node:path";
import express, { Express, Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import {
  AuthedRequest,
  getUserVault,
  requireCreatorAuth,
  resolveProviderSecret,
  signMediaAccess,
  verifyMediaAccess,
} from "./creatorAuth.js";
import {
  downloadLicensedMedia,
  generateRunwayClip,
  generateSubtitlesFromScript,
  probeMediaDuration,
  renderCreatorVideo,
  RenderSceneInput,
  resolveProjectDir,
  resolveProjectFile,
  sanitizeFilename,
  sanitizeSegment,
  searchPexelsVideos,
} from "./creatorVideo.js";

function parseIsoDurationSec(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

function getAppPublicUrl(req: Request): string {
  const envUrl = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (envUrl && envUrl.startsWith("http")) return envUrl;
  const proto =
    (req.headers["x-forwarded-proto"] as string)?.split(",")[0] ||
    req.protocol ||
    "http";
  const host =
    (req.headers["x-forwarded-host"] as string)?.split(",")[0] ||
    req.headers.host ||
    "localhost:3000";
  return `${proto}://${host}`;
}

async function callClaudeJsonOrText(params: {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<{ text: string; modelUsed: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model || "claude-sonnet-4-20250514",
      max_tokens: params.maxTokens || 3500,
      system: params.system,
      messages: [{ role: "user", content: params.prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error (${res.status}): ${errText}`);
  }
  const json = (await res.json()) as {
    model?: string;
    content?: Array<{ type: string; text?: string }>;
  };
  const text = (json.content || [])
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n")
    .trim();
  return { text, modelUsed: json.model || params.model };
}

function extractJsonBlock(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf("{");
    const firstBracket = candidate.indexOf("[");
    let start = -1;
    let end = -1;
    if (
      firstBracket !== -1 &&
      (firstBrace === -1 || firstBracket < firstBrace)
    ) {
      start = firstBracket;
      end = candidate.lastIndexOf("]");
    } else if (firstBrace !== -1) {
      start = firstBrace;
      end = candidate.lastIndexOf("}");
    }
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("AI response was not valid JSON.");
  }
}

export function registerCreatorRoutes(
  app: Express,
  getGeminiClient: (apiVersion?: string) => GoogleGenAI
) {
  // 1. Provider & Social Connection Status (never returns raw secrets)
  app.get(
    "/api/creator/providers/status",
    requireCreatorAuth,
    (req: AuthedRequest, res: Response) => {
      const uid = req.authUser!.uid;
      const vault = getUserVault(uid);

      const claudeSession = Boolean(vault.anthropicApiKey);
      const claudeEnv = Boolean(process.env.ANTHROPIC_API_KEY);
      const runwaySession = Boolean(vault.runwayApiKey);
      const runwayEnv = Boolean(process.env.RUNWAY_API_KEY);
      const pexelsSession = Boolean(vault.pexelsApiKey);
      const pexelsEnv = Boolean(process.env.PEXELS_API_KEY);
      const elSession = Boolean(vault.elevenLabsApiKey);
      const elEnv = Boolean(process.env.ELEVENLABS_API_KEY);
      const ytKeySession = Boolean(vault.youtubeApiKey);
      const ytKeyEnv = Boolean(process.env.YOUTUBE_API_KEY);
      const tgSession = Boolean(vault.telegramBotToken && vault.telegramChatId);
      const tgEnv = Boolean(process.env.TELEGRAM_BOT_TOKEN);

      const oauthPlatforms = (
        ["youtube", "instagram", "facebook", "x", "linkedin"] as const
      ).reduce<Record<string, unknown>>((acc, p) => {
        const rec = vault.oauth[p];
        acc[p] = rec
          ? {
              connected: true,
              accountId: rec.accountId || "",
              accountName: rec.accountName || p,
              handle: rec.handle || "",
              avatarUrl: rec.avatarUrl || "",
              followersCount: rec.followersCount ?? null,
            }
          : { connected: false };
        return acc;
      }, {});

      res.json({
        ai: {
          gemini: {
            configured: Boolean(process.env.GEMINI_API_KEY),
            source: "env",
          },
          claude: {
            configured: claudeSession || claudeEnv,
            source: claudeSession ? "session" : claudeEnv ? "env" : "none",
            model: vault.anthropicModel || "claude-sonnet-4-20250514",
          },
        },
        mediaProviders: {
          elevenlabs: {
            configured: elSession || elEnv,
            source: elSession ? "session" : elEnv ? "env" : "none",
          },
          runway: {
            configured: runwaySession || runwayEnv,
            source: runwaySession ? "session" : runwayEnv ? "env" : "none",
          },
          pexels: {
            configured: pexelsSession || pexelsEnv,
            source: pexelsSession ? "session" : pexelsEnv ? "env" : "none",
          },
          youtubeApiKey: {
            configured: ytKeySession || ytKeyEnv,
            source: ytKeySession ? "session" : ytKeyEnv ? "env" : "none",
          },
          telegram: {
            configured: tgSession || tgEnv,
            chatId: vault.telegramChatId || "",
            source: tgSession ? "session" : tgEnv ? "env" : "none",
          },
        },
        oauth: oauthPlatforms,
      });
    }
  );

  // Configure per-session keys (stored strictly in server memory, never persisted in browser or Firestore)
  app.post(
    "/api/creator/providers/configure",
    requireCreatorAuth,
    (req: AuthedRequest, res: Response) => {
      const uid = req.authUser!.uid;
      const vault = getUserVault(uid);
      const body = req.body ?? {};

      const assignKey = (
        field: keyof Omit<typeof vault, "oauth">,
        val: unknown
      ) => {
        if (val === null) {
          delete vault[field];
        } else if (typeof val === "string" && val.trim()) {
          vault[field] = val.trim().slice(0, 300);
        }
      };

      assignKey("anthropicApiKey", body.anthropicApiKey);
      assignKey("anthropicModel", body.anthropicModel);
      assignKey("elevenLabsApiKey", body.elevenLabsApiKey);
      assignKey("elevenLabsVoiceId", body.elevenLabsVoiceId);
      assignKey("runwayApiKey", body.runwayApiKey);
      assignKey("pexelsApiKey", body.pexelsApiKey);
      assignKey("youtubeApiKey", body.youtubeApiKey);
      assignKey("telegramBotToken", body.telegramBotToken);
      assignKey("telegramChatId", body.telegramChatId);

      res.json({ updated: true });
    }
  );

  // Test Claude API connection
  app.post(
    "/api/creator/providers/test-claude",
    requireCreatorAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const uid = req.authUser!.uid;
        const vault = getUserVault(uid);
        const bodyKey =
          typeof req.body?.apiKey === "string" && req.body.apiKey.trim()
            ? req.body.apiKey.trim()
            : undefined;
        const apiKey =
          bodyKey || resolveProviderSecret(uid, "anthropicApiKey", "ANTHROPIC_API_KEY");
        if (!apiKey) {
          return res.status(400).json({
            connected: false,
            error: "Claude API key is required. Enter your Anthropic key above.",
          });
        }
        const model =
          (typeof req.body?.model === "string" && req.body.model.trim()) ||
          vault.anthropicModel ||
          "claude-sonnet-4-20250514";

        const result = await callClaudeJsonOrText({
          apiKey,
          model,
          system: "Reply briefly confirming readiness.",
          prompt: "Confirm Claude Creator Intelligence connection in one short sentence.",
          maxTokens: 48,
        });

        if (bodyKey) {
          vault.anthropicApiKey = bodyKey;
          vault.anthropicModel = model;
        }

        res.json({
          connected: true,
          modelUsed: result.modelUsed,
          reply: result.text,
        });
      } catch (err) {
        res.status(400).json({
          connected: false,
          error: err instanceof Error ? err.message : "Claude verification failed.",
        });
      }
    }
  );

  // Test & Connect Telegram Bot + Channel via Official Telegram Bot API
  app.post(
    "/api/creator/providers/test-telegram",
    requireCreatorAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const uid = req.authUser!.uid;
        const vault = getUserVault(uid);
        const token =
          (typeof req.body?.botToken === "string" && req.body.botToken.trim()) ||
          resolveProviderSecret(uid, "telegramBotToken", "TELEGRAM_BOT_TOKEN");
        const chatId =
          (typeof req.body?.chatId === "string" && req.body.chatId.trim()) ||
          vault.telegramChatId;

        if (!token) {
          return res.status(400).json({
            connected: false,
            error: "Telegram Bot Token is required (from @BotFather).",
          });
        }

        const meRes = await fetch(
          `https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`
        );
        const meJson = (await meRes.json()) as {
          ok?: boolean;
          description?: string;
          result?: { id: number; username?: string; first_name?: string };
        };
        if (!meRes.ok || !meJson.ok || !meJson.result) {
          return res.status(400).json({
            connected: false,
            error: meJson.description || "Invalid Telegram Bot Token.",
          });
        }

        let chatTitle = meJson.result.first_name || "Telegram Bot";
        let memberCount: number | null = null;
        if (chatId) {
          const chatRes = await fetch(
            `https://api.telegram.org/bot${encodeURIComponent(
              token
            )}/getChat?chat_id=${encodeURIComponent(chatId)}`
          );
          const chatJson = (await chatRes.json()) as {
            ok?: boolean;
            description?: string;
            result?: { title?: string; username?: string; id?: number };
          };
          if (!chatRes.ok || !chatJson.ok) {
            return res.status(400).json({
              connected: false,
              error:
                chatJson.description ||
                "Bot verified, but cannot access the specified Chat/Channel ID. Ensure the bot is an admin in that channel.",
            });
          }
          chatTitle = chatJson.result?.title || chatJson.result?.username || chatId;

          const countRes = await fetch(
            `https://api.telegram.org/bot${encodeURIComponent(
              token
            )}/getChatMemberCount?chat_id=${encodeURIComponent(chatId)}`
          );
          const countJson = (await countRes.json()) as {
            ok?: boolean;
            result?: number;
          };
          if (countRes.ok && countJson.ok && typeof countJson.result === "number") {
            memberCount = countJson.result;
          }
        }

        vault.telegramBotToken = token;
        if (chatId) vault.telegramChatId = chatId;

        res.json({
          connected: true,
          accountName: chatTitle,
          handle: meJson.result.username ? `@${meJson.result.username}` : String(meJson.result.id),
          channelId: chatId || "",
          followersCount: memberCount,
        });
      } catch (err) {
        res.status(500).json({
          connected: false,
          error: err instanceof Error ? err.message : "Telegram verification failed.",
        });
      }
    }
  );

  // 2. YouTube Data API + YouTube Analytics API
  app.get(
    "/api/creator/analytics/youtube",
    requireCreatorAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const uid = req.authUser!.uid;
        const vault = getUserVault(uid);
        const ytAuth = vault.oauth.youtube;
        if (!ytAuth?.accessToken) {
          return res.status(401).json({
            connected: false,
            error: "Connect your YouTube channel via OAuth in Connected Accounts first.",
          });
        }

        const range = String(req.query.range || "28d");
        const end = new Date();
        const start = new Date();
        if (range === "7d") start.setDate(end.getDate() - 7);
        else if (range === "90d") start.setDate(end.getDate() - 90);
        else if (range === "custom" && req.query.startDate && req.query.endDate) {
          const s = new Date(String(req.query.startDate));
          const e = new Date(String(req.query.endDate));
          if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
            start.setTime(s.getTime());
            end.setTime(e.getTime());
          }
        } else {
          start.setDate(end.getDate() - 28);
        }

        const startDateStr = start.toISOString().slice(0, 10);
        const endDateStr = end.toISOString().slice(0, 10);
        const headers = { Authorization: `Bearer ${ytAuth.accessToken}` };

        // Channel overview & uploads playlist
        const chRes = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true",
          { headers }
        );
        const chJson = (await chRes.json()) as {
          error?: { message?: string };
          items?: Array<{
            id: string;
            snippet?: { title?: string; customUrl?: string; description?: string };
            statistics?: {
              viewCount?: string;
              subscriberCount?: string;
              videoCount?: string;
            };
            contentDetails?: { relatedPlaylists?: { uploads?: string } };
          }>;
        };
        if (!chRes.ok) {
          throw new Error(chJson.error?.message || "YouTube Data API request failed.");
        }
        const channel = chJson.items?.[0];
        if (!channel) {
          return res.status(404).json({
            connected: true,
            error: "No YouTube channel found on this Google account.",
          });
        }

        // Daily YouTube Analytics query
        const dailyUrl = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
        dailyUrl.searchParams.set("ids", "channel==MINE");
        dailyUrl.searchParams.set("startDate", startDateStr);
        dailyUrl.searchParams.set("endDate", endDateStr);
        dailyUrl.searchParams.set(
          "metrics",
          "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments"
        );
        dailyUrl.searchParams.set("dimensions", "day");
        dailyUrl.searchParams.set("sort", "day");

        const dailyRes = await fetch(dailyUrl.toString(), { headers });
        const dailyJson = (await dailyRes.json()) as {
          columnHeaders?: Array<{ name: string }>;
          rows?: Array<Array<string | number>>;
          error?: { message?: string };
        };

        const dailySeries: Array<{
          date: string;
          views: number;
          watchTimeMinutes: number;
          subscribersNet: number;
          likes: number;
          comments: number;
        }> = [];

        let totalPeriodViews: number | null = null;
        let totalWatchMinutes: number | null = null;
        let avgViewDurationSec: number | null = null;
        let audienceRetentionPct: number | null = null;
        let subscribersGained: number | null = null;
        let subscribersLost: number | null = null;
        let periodLikes: number | null = null;
        let periodComments: number | null = null;

        if (dailyRes.ok && Array.isArray(dailyJson.rows)) {
          totalPeriodViews = 0;
          totalWatchMinutes = 0;
          subscribersGained = 0;
          subscribersLost = 0;
          periodLikes = 0;
          periodComments = 0;
          let avdSum = 0;
          let retSum = 0;
          let activeDays = 0;

          for (const row of dailyJson.rows) {
            const views = Number(row[1] ?? 0);
            const wt = Number(row[2] ?? 0);
            const avd = Number(row[3] ?? 0);
            const ret = Number(row[4] ?? 0);
            const gained = Number(row[5] ?? 0);
            const lost = Number(row[6] ?? 0);
            const likes = Number(row[7] ?? 0);
            const comments = Number(row[8] ?? 0);

            totalPeriodViews += views;
            totalWatchMinutes += wt;
            subscribersGained += gained;
            subscribersLost += lost;
            periodLikes += likes;
            periodComments += comments;
            if (views > 0) {
              avdSum += avd;
              retSum += ret;
              activeDays += 1;
            }
            dailySeries.push({
              date: String(row[0]),
              views,
              watchTimeMinutes: wt,
              subscribersNet: gained - lost,
              likes,
              comments,
            });
          }
          avgViewDurationSec = activeDays > 0 ? Math.round(avdSum / activeDays) : null;
          audienceRetentionPct =
            activeDays > 0 ? Number((retSum / activeDays).toFixed(1)) : null;
        }

        // Optional Impressions & CTR check (strictly null if unavailable — never coerced to 0)
        let impressions: number | null = null;
        let ctrPercent: number | null = null;
        try {
          const impUrl = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
          impUrl.searchParams.set("ids", "channel==MINE");
          impUrl.searchParams.set("startDate", startDateStr);
          impUrl.searchParams.set("endDate", endDateStr);
          impUrl.searchParams.set("metrics", "impressions,impressionClickThroughRate");
          const impRes = await fetch(impUrl.toString(), { headers });
          if (impRes.ok) {
            const impJson = (await impRes.json()) as {
              rows?: Array<Array<number>>;
            };
            if (impJson.rows?.[0]) {
              const rawImp = impJson.rows[0][0];
              const rawCtr = impJson.rows[0][1];
              impressions = typeof rawImp === "number" ? rawImp : null;
              ctrPercent =
                typeof rawCtr === "number" ? Number((rawCtr * 100).toFixed(2)) : null;
            }
          }
        } catch {
          impressions = null;
          ctrPercent = null;
        }

        // Traffic sources
        let trafficSources: Array<{ source: string; views: number; watchTimeMinutes: number }> = [];
        try {
          const tsUrl = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
          tsUrl.searchParams.set("ids", "channel==MINE");
          tsUrl.searchParams.set("startDate", startDateStr);
          tsUrl.searchParams.set("endDate", endDateStr);
          tsUrl.searchParams.set("dimensions", "insightTrafficSourceType");
          tsUrl.searchParams.set("metrics", "views,estimatedMinutesWatched");
          tsUrl.searchParams.set("sort", "-views");
          const tsRes = await fetch(tsUrl.toString(), { headers });
          if (tsRes.ok) {
            const tsJson = (await tsRes.json()) as {
              rows?: Array<[string, number, number]>;
            };
            trafficSources = (tsJson.rows || []).map((r) => ({
              source: String(r[0]),
              views: Number(r[1] || 0),
              watchTimeMinutes: Number(r[2] || 0),
            }));
          }
        } catch {
          trafficSources = [];
        }

        // Videos list (Top, Underperforming, Shorts vs Long-form)
        const uploadsPlaylist = channel.contentDetails?.relatedPlaylists?.uploads;
        const videos: Array<{
          id: string;
          title: string;
          publishedAt: string;
          thumbnailUrl: string;
          durationSec: number;
          format: "short" | "long";
          views: number;
          likes: number;
          comments: number;
        }> = [];

        if (uploadsPlaylist) {
          const plRes = await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${encodeURIComponent(
              uploadsPlaylist
            )}&maxResults=30`,
            { headers }
          );
          if (plRes.ok) {
            const plJson = (await plRes.json()) as {
              items?: Array<{ contentDetails?: { videoId?: string } }>;
            };
            const ids = (plJson.items || [])
              .map((i) => i.contentDetails?.videoId)
              .filter(Boolean) as string[];
            if (ids.length > 0) {
              const vRes = await fetch(
                `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(
                  ids.join(",")
                )}`,
                { headers }
              );
              if (vRes.ok) {
                const vJson = (await vRes.json()) as {
                  items?: Array<{
                    id: string;
                    snippet?: {
                      title?: string;
                      publishedAt?: string;
                      thumbnails?: { medium?: { url?: string } };
                    };
                    contentDetails?: { duration?: string };
                    statistics?: {
                      viewCount?: string;
                      likeCount?: string;
                      commentCount?: string;
                    };
                  }>;
                };
                for (const item of vJson.items || []) {
                  const durSec = parseIsoDurationSec(
                    item.contentDetails?.duration || ""
                  );
                  const title = item.snippet?.title || "Untitled Video";
                  const isShort =
                    (durSec > 0 && durSec <= 61) || /#shorts/i.test(title);
                  videos.push({
                    id: item.id,
                    title,
                    publishedAt: item.snippet?.publishedAt || "",
                    thumbnailUrl: item.snippet?.thumbnails?.medium?.url || "",
                    durationSec: durSec,
                    format: isShort ? "short" : "long",
                    views: Number(item.statistics?.viewCount || 0),
                    likes: Number(item.statistics?.likeCount || 0),
                    comments: Number(item.statistics?.commentCount || 0),
                  });
                }
              }
            }
          }
        }

        const sortedByViews = [...videos].sort((a, b) => b.views - a.views);
        const shorts = videos.filter((v) => v.format === "short");
        const longForm = videos.filter((v) => v.format === "long");

        const sumFormat = (arr: typeof videos) => ({
          count: arr.length,
          totalViews: arr.reduce((s, v) => s + v.views, 0),
          avgViews:
            arr.length > 0
              ? Math.round(arr.reduce((s, v) => s + v.views, 0) / arr.length)
              : null,
          totalLikes: arr.reduce((s, v) => s + v.likes, 0),
        });

        res.json({
          connected: true,
          dateRange: { range, startDate: startDateStr, endDate: endDateStr },
          channel: {
            id: channel.id,
            title: channel.snippet?.title || "",
            handle: channel.snippet?.customUrl || "",
            totalLifetimeViews: channel.statistics?.viewCount
              ? Number(channel.statistics.viewCount)
              : null,
            subscribers: channel.statistics?.subscriberCount
              ? Number(channel.statistics.subscriberCount)
              : null,
            videoCount: channel.statistics?.videoCount
              ? Number(channel.statistics.videoCount)
              : null,
          },
          metrics: {
            views: totalPeriodViews,
            subscribers: channel.statistics?.subscriberCount
              ? Number(channel.statistics.subscriberCount)
              : null,
            subscriberGrowth:
              subscribersGained !== null && subscribersLost !== null
                ? subscribersGained - subscribersLost
                : null,
            watchTimeMinutes: totalWatchMinutes,
            averageViewDurationSec: avgViewDurationSec,
            audienceRetentionPct,
            ctrPercent,
            impressions,
            likes: periodLikes,
            comments: periodComments,
          },
          analyticsNote: dailyRes.ok
            ? impressions === null
              ? "Impressions & CTR were not returned by YouTube Analytics API for this channel/period and are marked Unavailable."
              : undefined
            : dailyJson.error?.message ||
              "YouTube Analytics API reports unavailable; showing YouTube Data API channel statistics.",
          dailySeries,
          trafficSources,
          topVideos: sortedByViews.slice(0, 6),
          underperformingVideos: [...sortedByViews].reverse().slice(0, 5),
          formatComparison: {
            shorts: sumFormat(shorts),
            longForm: sumFormat(longForm),
          },
        });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : "Failed to fetch YouTube analytics.",
        });
      }
    }
  );

  // Public YouTube Competitor Channel Lookup (YouTube Data API v3)
  app.get(
    "/api/creator/youtube/competitor",
    requireCreatorAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const uid = req.authUser!.uid;
        const q = String(req.query.query || "").trim();
        if (!q) {
          return res.status(400).json({ error: "Enter a channel handle, URL, or niche keyword." });
        }

        const vault = getUserVault(uid);
        const apiKey = resolveProviderSecret(uid, "youtubeApiKey", "YOUTUBE_API_KEY");
        const bearer = vault.oauth.youtube?.accessToken;

        if (!apiKey && !bearer) {
          return res.status(400).json({
            error:
              "Connect YouTube OAuth or enter a YouTube Data API key to fetch live competitor channel telemetry.",
            needsKey: "youtubeApiKey",
          });
        }

        const authHeaders: Record<string, string> = bearer
          ? { Authorization: `Bearer ${bearer}` }
          : {};
        const keyParam = !bearer && apiKey ? `&key=${encodeURIComponent(apiKey)}` : "";

        // Search for channel matching query
        const cleanQuery = q.replace(/^https?:\/\/(www\.)?youtube\.com\/(@)?/i, "").split("/")[0];
        const searchRes = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=3&q=${encodeURIComponent(
            cleanQuery
          )}${keyParam}`,
          { headers: authHeaders }
        );
        const searchJson = (await searchRes.json()) as {
          error?: { message?: string };
          items?: Array<{ id?: { channelId?: string } }>;
        };
        if (!searchRes.ok) {
          throw new Error(searchJson.error?.message || "YouTube competitor search failed.");
        }

        const channelId = searchJson.items?.[0]?.id?.channelId;
        if (!channelId) {
          return res.status(404).json({ error: `No public YouTube channel matched "${q}".` });
        }

        const chRes = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(
            channelId
          )}${keyParam}`,
          { headers: authHeaders }
        );
        const chJson = (await chRes.json()) as {
          items?: Array<{
            id: string;
            snippet?: { title?: string; description?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } };
            statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
            contentDetails?: { relatedPlaylists?: { uploads?: string } };
          }>;
        };
        const ch = chJson.items?.[0];
        if (!ch) {
          return res.status(404).json({ error: "Competitor channel details unavailable." });
        }

        const uploadsId = ch.contentDetails?.relatedPlaylists?.uploads;
        const recentVideos: Array<{
          id: string;
          title: string;
          publishedAt: string;
          views: number;
          likes: number;
          comments: number;
          durationSec: number;
        }> = [];

        if (uploadsId) {
          const plRes = await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${encodeURIComponent(
              uploadsId
            )}&maxResults=12${keyParam}`,
            { headers: authHeaders }
          );
          if (plRes.ok) {
            const plJson = (await plRes.json()) as {
              items?: Array<{ contentDetails?: { videoId?: string } }>;
            };
            const ids = (plJson.items || [])
              .map((i) => i.contentDetails?.videoId)
              .filter(Boolean) as string[];
            if (ids.length > 0) {
              const vRes = await fetch(
                `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(
                  ids.join(",")
                )}${keyParam}`,
                { headers: authHeaders }
              );
              if (vRes.ok) {
                const vJson = (await vRes.json()) as {
                  items?: Array<{
                    id: string;
                    snippet?: { title?: string; publishedAt?: string };
                    contentDetails?: { duration?: string };
                    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
                  }>;
                };
                for (const item of vJson.items || []) {
                  recentVideos.push({
                    id: item.id,
                    title: item.snippet?.title || "",
                    publishedAt: item.snippet?.publishedAt || "",
                    views: Number(item.statistics?.viewCount || 0),
                    likes: Number(item.statistics?.likeCount || 0),
                    comments: Number(item.statistics?.commentCount || 0),
                    durationSec: parseIsoDurationSec(item.contentDetails?.duration || ""),
                  });
                }
              }
            }
          }
        }

        res.json({
          channel: {
            id: ch.id,
            title: ch.snippet?.title || "",
            handle: ch.snippet?.customUrl || "",
            description: ch.snippet?.description || "",
            avatarUrl: ch.snippet?.thumbnails?.default?.url || "",
            subscribers: ch.statistics?.subscriberCount
              ? Number(ch.statistics.subscriberCount)
              : null,
            totalViews: ch.statistics?.viewCount ? Number(ch.statistics.viewCount) : null,
            videoCount: ch.statistics?.videoCount ? Number(ch.statistics.videoCount) : null,
          },
          recentVideos,
        });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : "Competitor lookup failed.",
        });
      }
    }
  );

  // 3. Instagram Analytics (Meta Graph API)
  app.get(
    "/api/creator/analytics/instagram",
    requireCreatorAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const vault = getUserVault(req.authUser!.uid);
        const igAuth = vault.oauth.instagram;
        if (!igAuth?.accessToken || !igAuth.igUserId) {
          return res.status(401).json({
            connected: false,
            error:
              "Connect an Instagram Business/Creator account via Meta OAuth in Connected Accounts first.",
          });
        }

        const tok = igAuth.pageAccessToken || igAuth.accessToken;
        const profileRes = await fetch(
          `https://graph.facebook.com/v21.0/${encodeURIComponent(
            igAuth.igUserId
          )}?fields=id,username,name,followers_count,follows_count,media_count,profile_picture_url&access_token=${encodeURIComponent(
            tok
          )}`
        );
        const profile = (await profileRes.json()) as {
          id?: string;
          username?: string;
          name?: string;
          followers_count?: number;
          follows_count?: number;
          media_count?: number;
          profile_picture_url?: string;
          error?: { message?: string };
        };
        if (!profileRes.ok) {
          throw new Error(profile.error?.message || "Instagram profile fetch failed.");
        }

        let reach: number | null = null;
        let views: number | null = null;
        let profileViews: number | null = null;
        try {
          const insRes = await fetch(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(
              igAuth.igUserId
            )}/insights?metric=reach,profile_views,views&period=day&metric_type=total_value&access_token=${encodeURIComponent(
              tok
            )}`
          );
          if (insRes.ok) {
            const insJson = (await insRes.json()) as {
              data?: Array<{
                name: string;
                total_value?: { value?: number };
                values?: Array<{ value?: number }>;
              }>;
            };
            for (const m of insJson.data || []) {
              const val = m.total_value?.value ?? m.values?.[0]?.value ?? null;
              if (m.name === "reach" && typeof val === "number") reach = val;
              if (m.name === "views" && typeof val === "number") views = val;
              if (m.name === "profile_views" && typeof val === "number") profileViews = val;
            }
          }
        } catch {
          // Leave null to distinguish unavailable from 0
        }

        const mediaRes = await fetch(
          `https://graph.facebook.com/v21.0/${encodeURIComponent(
            igAuth.igUserId
          )}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count&limit=15&access_token=${encodeURIComponent(
            tok
          )}`
        );
        const mediaJson = (await mediaRes.json()) as {
          data?: Array<{
            id: string;
            caption?: string;
            media_type?: string;
            media_product_type?: string;
            permalink?: string;
            timestamp?: string;
            like_count?: number;
            comments_count?: number;
          }>;
        };

        res.json({
          connected: true,
          profile: {
            id: profile.id,
            name: profile.name || profile.username || "",
            username: profile.username || "",
            followers: profile.followers_count ?? null,
            following: profile.follows_count ?? null,
            mediaCount: profile.media_count ?? null,
          },
          metrics: {
            reach,
            views,
            profileViews,
          },
          media: mediaJson.data || [],
        });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : "Failed to load Instagram analytics.",
        });
      }
    }
  );

  // 4. Facebook Pages Analytics (Meta Graph API)
  app.get(
    "/api/creator/analytics/facebook",
    requireCreatorAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const vault = getUserVault(req.authUser!.uid);
        const fbAuth = vault.oauth.facebook;
        if (!fbAuth?.accessToken || !fbAuth.pageId) {
          return res.status(401).json({
            connected: false,
            error: "Connect a Facebook Page via Meta OAuth in Connected Accounts first.",
          });
        }

        const pageTok = fbAuth.pageAccessToken || fbAuth.accessToken;
        const pageRes = await fetch(
          `https://graph.facebook.com/v21.0/${encodeURIComponent(
            fbAuth.pageId
          )}?fields=id,name,fan_count,followers_count,category&access_token=${encodeURIComponent(
            pageTok
          )}`
        );
        const pageJson = (await pageRes.json()) as {
          id?: string;
          name?: string;
          fan_count?: number;
          followers_count?: number;
          category?: string;
          error?: { message?: string };
        };
        if (!pageRes.ok) {
          throw new Error(pageJson.error?.message || "Facebook Page fetch failed.");
        }

        let impressions: number | null = null;
        let engagements: number | null = null;
        let pageViews: number | null = null;
        try {
          const insRes = await fetch(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(
              fbAuth.pageId
            )}/insights?metric=page_impressions,page_post_engagements,page_views_total&period=days_28&access_token=${encodeURIComponent(
              pageTok
            )}`
          );
          if (insRes.ok) {
            const insJson = (await insRes.json()) as {
              data?: Array<{ name: string; values?: Array<{ value?: number }> }>;
            };
            for (const m of insJson.data || []) {
              const latest = m.values?.[m.values.length - 1]?.value;
              if (m.name === "page_impressions" && typeof latest === "number")
                impressions = latest;
              if (m.name === "page_post_engagements" && typeof latest === "number")
                engagements = latest;
              if (m.name === "page_views_total" && typeof latest === "number")
                pageViews = latest;
            }
          }
        } catch {
          // Leave null
        }

        const vidRes = await fetch(
          `https://graph.facebook.com/v21.0/${encodeURIComponent(
            fbAuth.pageId
          )}/videos?fields=id,title,description,created_time,length,permalink_url,views&limit=12&access_token=${encodeURIComponent(
            pageTok
          )}`
        );
        const vidJson = (await vidRes.json()) as {
          data?: Array<{
            id: string;
            title?: string;
            description?: string;
            created_time?: string;
            length?: number;
            permalink_url?: string;
            views?: number;
          }>;
        };

        res.json({
          connected: true,
          page: {
            id: pageJson.id,
            name: pageJson.name,
            category: pageJson.category || "",
            fans: pageJson.fan_count ?? null,
            followers: pageJson.followers_count ?? null,
          },
          metrics: {
            impressions28d: impressions,
            engagements28d: engagements,
            pageViews28d: pageViews,
          },
          videos: vidJson.data || [],
        });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : "Failed to load Facebook analytics.",
        });
      }
    }
  );

  // 5. Configurable AI Content Intelligence Engine (Claude + Gemini 4 Hydrogen)
  app.post(
    "/api/creator/ai/generate",
    requireCreatorAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const uid = req.authUser!.uid;
        const vault = getUserVault(uid);
        const {
          task,
          provider = "auto",
          payload = {},
        } = (req.body ?? {}) as {
          task: string;
          provider?: "claude" | "gemini" | "auto";
          payload?: Record<string, unknown>;
        };

        const claudeKey = resolveProviderSecret(
          uid,
          "anthropicApiKey",
          "ANTHROPIC_API_KEY"
        );
        const claudeModel = vault.anthropicModel || "claude-sonnet-4-20250514";

        if (provider === "claude" && !claudeKey) {
          return res.status(400).json({
            error:
              "Claude API key is not configured. Add your Anthropic API key in Creator Studio > Connected Accounts or AI Provider Vault.",
            needsKey: "anthropicApiKey",
          });
        }

        const useClaude = provider === "claude" || (provider === "auto" && Boolean(claudeKey));
        const niche = String(payload.niche || "AI Tools, Technology & Developer Productivity");
        const channelContext = JSON.stringify(payload.channelSummary || {}).slice(0, 3500);
        const snapshotsContext = JSON.stringify(payload.snapshots || []).slice(0, 3000);
        const competitorContext = JSON.stringify(payload.competitorData || {}).slice(0, 3000);

        let systemPrompt =
          "You are J.A.R.V.I.S Creator Intelligence — an analytical AI Social Media Strategist, Script Architect, and Video Producer. Be honest, evidence-driven, and never fabricate analytics or guarantee viral views.";
        let userPrompt = "";
        let wantJson = true;
        let useSearch = false;

        if (task === "strategize") {
          useSearch = true;
          const count = Math.min(8, Math.max(3, Number(payload.count || 5)));
          userPrompt = `Analyze this creator niche: "${niche}".
Channel telemetry context: ${channelContext}
Historical snapshots: ${snapshotsContext}
Public competitor context: ${competitorContext}

Recommend ${count} original, high-opportunity video ideas grounded in current AI/tech developments and past performance patterns. Never promise or guarantee viral views.
Return ONLY valid JSON array of objects, each with exact keys:
- topic (string)
- targetAudience (string)
- suggestedFormat (string, e.g. "YouTube Shorts (9:16)", "YouTube Long-form Tutorial (16:9)", "Instagram Reels (9:16)")
- suggestedLength (string, e.g. "35 seconds" or "11 minutes")
- hook (string, opening 3-second hook)
- contentAngle (string)
- researchSources (array of 2-4 concise source names or topic trends)
- reason (string explaining why this fits the channel and audience)
- confidence ("low" | "medium" | "high")`;
        } else if (task === "competitor_research") {
          useSearch = true;
          const target = String(payload.query || niche);
          userPrompt = `Perform an analytical competitor & market gap study for "${target}".
Competitor public data: ${competitorContext}
Creator niche: ${niche}
Return ONLY valid JSON with keys:
- summary (string)
- winningPatterns (array of strings)
- contentGaps (array of strings)
- recommendedCounterAngles (array of { title: string, format: string, whyItCompetes: string })
- caveats (string noting public metrics context without claiming guarantees)`;
        } else if (task === "script") {
          const topic = String(payload.topic || "Top AI Workflow Automation Tools");
          const format = payload.format === "short" ? "short" : "long";
          const platform = String(
            payload.platform || (format === "short" ? "YouTube Shorts / Reels" : "YouTube")
          );
          const duration = String(
            payload.duration || (format === "short" ? "35 seconds" : "10 minutes")
          );
          const style = String(payload.style || "Analytical, crisp, high-retention");
          userPrompt = `Write a dedicated ${
            format === "short"
              ? "SHORT-FORM vertical (9:16) script with rapid 2-second hook, tight visual beat changes, and punchy payoff—NOT a cut-down long video"
              : "LONG-FORM horizontal (16:9) structured tutorial/explainer script with chapter flow, deep value, B-roll direction, and retention resets"
          }.
Topic: "${topic}"
Target Platform: ${platform}
Target Duration: ${duration}
Tone/Style: ${style}

Return ONLY valid JSON with keys:
- title (string)
- hook (string, strong opening hook)
- fullScript (string, complete spoken narration with section markers)
- scenes (array of 4-8 objects: { index: number, title: string, durationSec: number, narration: string, visualPrompt: string, overlayText: string })
- retentionNotes (string)`;
        } else if (task === "hooks") {
          const topic = String(payload.topic || "AI Agents");
          const format = String(payload.format || "short");
          userPrompt = `Generate 6 distinct opening hooks (curiosity gap, contrarian, proof-first, problem-agitate, speed-demo, question) for a ${format} video about "${topic}".
Return ONLY valid JSON array of { style: string, hookText: string, deliveryTip: string }.`;
        } else if (task === "quality_review" || task === "improve_script") {
          const scriptText = String(payload.script || "");
          const format = String(payload.format || "short");
          userPrompt = `Review and ${
            task === "improve_script" ? "rewrite/strengthen" : "critique"
          } this ${format} script for clarity, hook strength, pacing, factual accuracy, and audience retention:
"""
${scriptText.slice(0, 12000)}
"""
Return ONLY valid JSON with keys:
- strengths (array of strings)
- issues (array of strings)
- improvedHook (string)
- improvedScript (string)`;
        } else if (task === "seo") {
          const topic = String(payload.topic || "");
          const scriptSummary = String(payload.script || "").slice(0, 3000);
          userPrompt = `Create platform-specific SEO & publishing metadata for "${topic}".
Script context: ${scriptSummary}
CRITICAL: Each platform MUST have genuinely tailored copy and tone—do NOT reuse identical descriptions across YouTube, Instagram, Facebook, X, and LinkedIn.
Return ONLY valid JSON with keys:
- youtubeTitles (array of 3 distinct clickable non-clickbait titles)
- youtubeDescription (string with chapters/context and CTA)
- youtubeKeywords (array of 10-15 keywords)
- youtubeHashtags (array of 5 hashtags)
- instagramCaption (string tailored for Reels with line breaks & CTA)
- instagramHashtags (array of 8-12 hashtags)
- facebookCaption (string conversational community framing)
- xPost (string under 260 chars)
- linkedinPost (string professional insight framing)`;
        } else if (task === "thumbnail_concept") {
          const topic = String(payload.topic || "");
          userPrompt = `Design 3 distinct high-contrast thumbnail concepts for "${topic}".
Return ONLY valid JSON array of 3 objects:
{ headlineText: string (max 4 words), subBadge: string (max 3 words), focalSubject: string, colorMood: "cyan" | "amber" | "crimson" | "emerald", compositionNotes: string }`;
        } else if (task === "calendar_plan") {
          const days = Math.min(14, Math.max(1, Number(payload.days || 7)));
          userPrompt = `Create a practical ${days}-day multi-platform content schedule for niche "${niche}".
Channel context: ${channelContext}
Recent ideas: ${JSON.stringify(payload.ideas || []).slice(0, 2000)}
Start date: ${new Date().toISOString().slice(0, 10)}.
Return ONLY valid JSON array of objects:
{ title: string, platform: "youtube" | "instagram" | "facebook" | "x" | "linkedin", format: "short" | "long" | "post", scheduledDate: "YYYY-MM-DD", notes: string }`;
        } else if (task === "performance_report") {
          wantJson = false;
          userPrompt = `Write a clear, structured Creator Performance & Strategy Report for niche "${niche}".
Channel metrics: ${channelContext}
Historical snapshots: ${snapshotsContext}
Recent posts: ${JSON.stringify(payload.posts || []).slice(0, 2000)}
Highlight trends, format comparisons (Shorts vs Long-form), actionable next steps, and explicitly note that historical performance informs decisions without guaranteeing future outcomes.`;
        } else {
          return res.status(400).json({ error: `Unsupported AI creator task "${task}".` });
        }

        let rawText = "";
        let modelUsed = "";
        let groundingSources: Array<{ title: string; url: string }> = [];

        if (useClaude && claudeKey) {
          const claudeRes = await callClaudeJsonOrText({
            apiKey: claudeKey,
            model: claudeModel,
            system: systemPrompt,
            prompt: userPrompt,
          });
          rawText = claudeRes.text;
          modelUsed = `claude:${claudeRes.modelUsed}`;
        } else {
          const ai = getGeminiClient();
          const model = "gemini-4-hydrogen";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cfg: Record<string, any> = {
            systemInstruction: systemPrompt,
          };
          if (useSearch) {
            cfg.tools = [{ googleSearch: {} }];
          } else if (wantJson) {
            cfg.responseMimeType = "application/json";
          }

          const gRes = await ai.models.generateContent({
            model,
            contents: userPrompt,
            config: cfg,
          });
          rawText = gRes.text || "";
          modelUsed = `gemini:${model}`;
          const chunks =
            gRes.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
          groundingSources = chunks
            .filter((c) => c.web?.uri && c.web?.title)
            .map((c) => ({
              title: String(c.web?.title || ""),
              url: String(c.web?.uri || ""),
            }));
        }

        const result = wantJson ? extractJsonBlock(rawText) : rawText;
        res.json({
          task,
          providerUsed: useClaude ? "claude" : "gemini",
          modelUsed,
          result,
          groundingSources,
        });
      } catch (err) {
        res.status(500).json({
          error:
            err instanceof Error ? err.message : "Creator AI generation failed.",
        });
      }
    }
  );

  // 6. Video Production Pipeline Routes (Steps 5–12)
  app.post(
    "/api/creator/video/pexels-search",
    requireCreatorAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const uid = req.authUser!.uid;
        const apiKey = resolveProviderSecret(uid, "pexelsApiKey", "PEXELS_API_KEY");
        if (!apiKey) {
          return res.status(400).json({
            error:
              "Pexels API key is required for licensed stock video retrieval. Enter your Pexels API key in Connected Accounts / Provider Vault.",
            needsKey: "pexelsApiKey",
          });
        }
        const query = String(req.body?.query || "artificial intelligence technology");
        const aspectRatio = req.body?.aspectRatio === "9:16" ? "9:16" : "16:9";
        const videos = await searchPexelsVideos({ apiKey, query, aspectRatio });
        res.json({ videos });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : "Pexels search failed.",
        });
      }
    }
  );

  app.post(
    "/api/creator/video/pexels-import",
    requireCreatorAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const uid = req.authUser!.uid;
        const projectId = sanitizeSegment(String(req.body?.projectId || ""));
        const sceneIdx = Number(req.body?.sceneIndex || 0);
        const downloadUrl = String(req.body?.downloadUrl || "");
        const filename = `scene_${sceneIdx}_${Date.now()}.mp4`;
        const dest = resolveProjectFile(uid, projectId, filename);
        const info = await downloadLicensedMedia(downloadUrl, dest);
        const { exp, sig } = signMediaAccess(uid, projectId, filename);
        const previewUrl = `/api/creator/media/public/${encodeURIComponent(
          uid
        )}/${encodeURIComponent(projectId)}/${encodeURIComponent(
          filename
        )}?exp=${exp}&sig=${sig}`;
        res.json({ filename, sizeBytes: info.sizeBytes, previewUrl });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : "Failed to import stock clip.",
        });
      }
    }
  );

  app.post(
    "/api/creator/video/runway-generate",
    requireCreatorAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const uid = req.authUser!.uid;
        const apiKey = resolveProviderSecret(uid, "runwayApiKey", "RUNWAY_API_KEY");
        if (!apiKey) {
          return res.status(400).json({
            error:
              "Runway API key is required to generate AI video clips via Runway. Add your Runway key in Provider Vault or switch to Pexels / Upload / Local Storyboard.",
            needsKey: "runwayApiKey",
          });
        }
        const projectId = sanitizeSegment(String(req.body?.projectId || ""));
        const sceneIdx = Number(req.body?.sceneIndex || 0);
        const prompt = String(req.body?.prompt || "");
        const aspectRatio = req.body?.aspectRatio === "9:16" ? "9:16" : "16:9";
        if (!prompt.trim()) {
          return res.status(400).json({ error: "Visual prompt is required." });
        }
        const gen = await generateRunwayClip({ apiKey, prompt, aspectRatio });
        const filename = `runway_scene_${sceneIdx}_${Date.now()}.mp4`;
        const dest = resolveProjectFile(uid, projectId, filename);
        const info = await downloadLicensedMedia(gen.videoUrl, dest);
        const { exp, sig } = signMediaAccess(uid, projectId, filename);
        const previewUrl = `/api/creator/media/public/${encodeURIComponent(
          uid
        )}/${encodeURIComponent(projectId)}/${encodeURIComponent(
          filename
        )}?exp=${exp}&sig=${sig}`;
        res.json({
          taskId: gen.taskId,
          filename,
          sizeBytes: info.sizeBytes,
          previewUrl,
        });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : "Runway video generation failed.",
        });
      }
    }
  );

  app.post(
    "/api/creator/video/upload-asset",
    requireCreatorAuth,
    express.raw({
      type: ["video/*", "audio/*", "image/*", "application/octet-stream"],
      limit: "85mb",
    }),
    (req: AuthedRequest, res: Response) => {
      try {
        const uid = req.authUser!.uid;
        const projectId = sanitizeSegment(String(req.query.projectId || ""));
        const rawName = String(req.query.filename || `asset_${Date.now()}.bin`);
        const safeName = sanitizeFilename(rawName.replace(/[^a-zA-Z0-9_.-]/g, "_"));
        const dest = resolveProjectFile(uid, projectId, safeName);
        const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        if (buf.length === 0) {
          return res.status(400).json({ error: "Empty media payload." });
        }
        fs.writeFileSync(dest, buf);
        const { exp, sig } = signMediaAccess(uid, projectId, safeName);
        const previewUrl = `/api/creator/media/public/${encodeURIComponent(
          uid
        )}/${encodeURIComponent(projectId)}/${encodeURIComponent(
          safeName
        )}?exp=${exp}&sig=${sig}`;
        res.json({ filename: safeName, sizeBytes: buf.length, previewUrl });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : "Asset upload failed.",
        });
      }
    }
  );

  // Step 7 & 8: Generate Voiceover (ElevenLabs / Gemini TTS) + SRT/VTT Captions
  app.post(
    "/api/creator/video/voiceover",
    requireCreatorAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const uid = req.authUser!.uid;
        const {
          projectId,
          scriptText,
          engine = "gemini",
          geminiVoiceName = "Charon",
          elevenLabsVoiceId,
          stability = 0.5,
          similarity = 0.75,
          speed = 1.0,
        } = req.body ?? {};

        const safeProj = sanitizeSegment(String(projectId || ""));
        const cleanText = String(scriptText || "")
          .replace(/\[.*?\]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 4500);
        if (!cleanText) {
          return res.status(400).json({ error: "Narration script text is required." });
        }

        let audioBuffer: Buffer;
        let audioFilename = "voiceover.wav";

        if (engine === "elevenlabs") {
          const elKey = resolveProviderSecret(
            uid,
            "elevenLabsApiKey",
            "ELEVENLABS_API_KEY"
          );
          const vault = getUserVault(uid);
          const resolvedVoiceId =
            (elevenLabsVoiceId && String(elevenLabsVoiceId).trim()) ||
            vault.elevenLabsVoiceId ||
            process.env.ELEVENLABS_VOICE_ID ||
            "";
          if (!elKey) {
            return res.status(400).json({
              error:
                "ElevenLabs API key not configured. Enter it in Provider Vault or switch to Gemini Neural Voice.",
              needsKey: "elevenLabsApiKey",
            });
          }
          if (!resolvedVoiceId || /^0+$/.test(resolvedVoiceId)) {
            return res.status(400).json({
              error: "A valid ElevenLabs Voice ID is required.",
            });
          }
          const elRes = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
              resolvedVoiceId
            )}`,
            {
              method: "POST",
              headers: {
                "xi-api-key": elKey,
                "Content-Type": "application/json",
                Accept: "audio/mpeg",
              },
              body: JSON.stringify({
                text: cleanText,
                model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
                voice_settings: {
                  stability: Math.min(1, Math.max(0, Number(stability) || 0.5)),
                  similarity_boost: Math.min(1, Math.max(0, Number(similarity) || 0.75)),
                  speed: Math.min(1.2, Math.max(0.7, Number(speed) || 1.0)),
                },
              }),
            }
          );
          if (!elRes.ok) {
            throw new Error(`ElevenLabs error (${elRes.status}): ${await elRes.text()}`);
          }
          audioBuffer = Buffer.from(await elRes.arrayBuffer());
          audioFilename = "voiceover.mp3";
        } else {
          const allowed = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"];
          const safeVoice = allowed.includes(geminiVoiceName)
            ? geminiVoiceName
            : "Charon";
          const ttsRes = await getGeminiClient("v1beta").models.generateContent({
            model: "gemini-3.8-flash-lite-tts",
            contents: [{ role: "user", parts: [{ text: cleanText.slice(0, 2500) }] }],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: safeVoice } },
              },
            },
          });
          const partData = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData;
          const b64 = partData?.data;
          if (!b64) {
            throw new Error("Gemini TTS returned empty audio payload.");
          }
          const rawBuf = Buffer.from(b64, "base64");
          if (rawBuf.length >= 4 && rawBuf.subarray(0, 4).toString("ascii") === "RIFF") {
            audioBuffer = rawBuf;
          } else {
            // Wrap raw 24kHz mono 16-bit PCM into standard WAV container
            const rateMatch = String(partData?.mimeType || "").match(/rate=(\d+)/i);
            const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
            const wavHeader = Buffer.alloc(44);
            wavHeader.write("RIFF", 0);
            wavHeader.writeUInt32LE(36 + rawBuf.length, 4);
            wavHeader.write("WAVE", 8);
            wavHeader.write("fmt ", 12);
            wavHeader.writeUInt32LE(16, 16);
            wavHeader.writeUInt16LE(1, 20);
            wavHeader.writeUInt16LE(1, 22);
            wavHeader.writeUInt32LE(sampleRate, 24);
            wavHeader.writeUInt32LE(sampleRate * 2, 28);
            wavHeader.writeUInt16LE(2, 32);
            wavHeader.writeUInt16LE(16, 34);
            wavHeader.write("data", 36);
            wavHeader.writeUInt32LE(rawBuf.length, 40);
            audioBuffer = Buffer.concat([wavHeader, rawBuf]);
          }
          audioFilename = "voiceover.wav";
        }

        const audioPath = resolveProjectFile(uid, safeProj, audioFilename);
        fs.writeFileSync(audioPath, audioBuffer);
        const durationSec = await probeMediaDuration(audioPath);

        const subs = generateSubtitlesFromScript(cleanText, durationSec || 15);
        const srtFilename = "captions.srt";
        const vttFilename = "captions.vtt";
        fs.writeFileSync(resolveProjectFile(uid, safeProj, srtFilename), subs.srt, "utf8");
        fs.writeFileSync(resolveProjectFile(uid, safeProj, vttFilename), subs.vtt, "utf8");

        const audioSig = signMediaAccess(uid, safeProj, audioFilename);
        const srtSig = signMediaAccess(uid, safeProj, srtFilename);

        res.json({
          audioFilename,
          durationSec,
          audioUrl: `/api/creator/media/public/${encodeURIComponent(
            uid
          )}/${encodeURIComponent(safeProj)}/${audioFilename}?exp=${
            audioSig.exp
          }&sig=${audioSig.sig}`,
          captionsFilename: srtFilename,
          captionsSrt: subs.srt,
          captionsVtt: subs.vtt,
          captionsUrl: `/api/creator/media/public/${encodeURIComponent(
            uid
          )}/${encodeURIComponent(safeProj)}/${srtFilename}?exp=${
            srtSig.exp
          }&sig=${srtSig.sig}`,
        });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : "Voiceover generation failed.",
        });
      }
    }
  );

  // Step 9, 10, 11, 12: Real FFmpeg Video Composition, Render, FFprobe Quality Check & Storage
  app.post(
    "/api/creator/video/render",
    requireCreatorAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const uid = req.authUser!.uid;
        const {
          projectId,
          aspectRatio = "9:16",
          scenes = [],
          voiceoverFilename,
          musicFilename,
          burnCaptions = true,
          captionsFilename = "captions.srt",
        } = req.body ?? {};

        const safeProj = sanitizeSegment(String(projectId || ""));
        const safeRatio = aspectRatio === "16:9" ? "16:9" : "9:16";
        const normalizedScenes: RenderSceneInput[] = Array.isArray(scenes)
          ? scenes.map((s: Record<string, unknown>, i: number) => ({
              title: String(s.title || `Scene ${i + 1}`),
              overlayText: s.overlayText ? String(s.overlayText) : undefined,
              durationSec: Math.max(2, Math.min(120, Number(s.durationSec) || 5)),
              assetFilename: s.assetFilename ? String(s.assetFilename) : undefined,
            }))
          : [];

        const result = await renderCreatorVideo({
          uid,
          projectId: safeProj,
          aspectRatio: safeRatio,
          scenes: normalizedScenes,
          voiceoverFilename: voiceoverFilename ? String(voiceoverFilename) : undefined,
          musicFilename: musicFilename ? String(musicFilename) : undefined,
          burnCaptions: Boolean(burnCaptions),
          captionsFilename: captionsFilename ? String(captionsFilename) : undefined,
        });

        const { exp, sig } = signMediaAccess(uid, safeProj, result.finalFilename, 7200);
        const relativePath = `/api/creator/media/public/${encodeURIComponent(
          uid
        )}/${encodeURIComponent(safeProj)}/${encodeURIComponent(
          result.finalFilename
        )}?exp=${exp}&sig=${sig}`;

        res.json({
          finalFilename: result.finalFilename,
          videoUrl: relativePath,
          publicVideoUrl: `${getAppPublicUrl(req)}${relativePath}`,
          quality: result.quality,
        });
      } catch (err) {
        console.error("FFmpeg render error:", err);
        res.status(500).json({
          error: err instanceof Error ? err.message : "FFmpeg video rendering failed.",
        });
      }
    }
  );

  // Signed Media Delivery Endpoint (supports Range requests for HTML5 <video> & Meta Reels crawler)
  app.get(
    "/api/creator/media/public/:uid/:projectId/:filename",
    (req: Request, res: Response) => {
      try {
        const uid = sanitizeSegment(req.params.uid);
        const projectId = sanitizeSegment(req.params.projectId);
        const filename = sanitizeFilename(req.params.filename);
        const exp = Number(req.query.exp || 0);
        const sig = String(req.query.sig || "");

        if (!verifyMediaAccess(uid, projectId, filename, exp, sig)) {
          return res.status(403).json({ error: "Media link expired or unauthorized." });
        }

        const dir = resolveProjectDir(uid, projectId);
        const filePath = path.resolve(dir, filename);
        if (!filePath.startsWith(dir + path.sep) || !fs.existsSync(filePath)) {
          return res.status(404).json({ error: "Media file not found." });
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeMap: Record<string, string> = {
          ".mp4": "video/mp4",
          ".mov": "video/quicktime",
          ".webm": "video/webm",
          ".wav": "audio/wav",
          ".mp3": "audio/mpeg",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".srt": "text/plain; charset=utf-8",
          ".vtt": "text/vtt; charset=utf-8",
        };
        const contentType = mimeMap[ext] || "application/octet-stream";
        const stat = fs.statSync(filePath);
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
          const chunkSize = end - start + 1;
          res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${stat.size}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunkSize,
            "Content-Type": contentType,
          });
          fs.createReadStream(filePath, { start, end }).pipe(res);
          return;
        }

        res.writeHead(200, {
          "Content-Length": stat.size,
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
        });
        fs.createReadStream(filePath).pipe(res);
      } catch {
        res.status(400).json({ error: "Invalid media request." });
      }
    }
  );

  // 7. Social Media Publishing Manager (requires explicit confirmed: true)
  app.post(
    "/api/creator/publish",
    requireCreatorAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const uid = req.authUser!.uid;
        const vault = getUserVault(uid);
        const {
          platform,
          confirmed,
          title,
          description,
          tags = [],
          privacyStatus = "private",
          scheduledAt,
          isShort = false,
          projectId,
          videoFilename,
          thumbnailBase64,
        } = req.body ?? {};

        if (confirmed !== true) {
          return res.status(400).json({
            error: "Explicit user confirmation is required prior to publishing.",
          });
        }

        const cleanTitle = String(title || "").trim().slice(0, 100);
        const cleanDesc = String(description || "").trim().slice(0, 4800);

        // Locate local rendered MP4 if provided
        let localVideoPath: string | null = null;
        if (projectId && videoFilename) {
          const p = resolveProjectFile(
            uid,
            sanitizeSegment(String(projectId)),
            sanitizeFilename(String(videoFilename))
          );
          if (fs.existsSync(p)) {
            localVideoPath = p;
          }
        }

        if (platform === "youtube") {
          const ytAuth = vault.oauth.youtube;
          if (!ytAuth?.accessToken) {
            return res.status(401).json({
              error: "Connect your YouTube channel via OAuth before uploading.",
            });
          }
          if (!localVideoPath) {
            return res.status(400).json({
              error: "Select or render a video MP4 file before uploading to YouTube.",
            });
          }

          const finalTitle =
            isShort && !/#shorts/i.test(cleanTitle)
              ? `${cleanTitle.slice(0, 92)} #Shorts`
              : cleanTitle || "J.A.R.V.I.S Studio Upload";

          const statusObj: Record<string, unknown> = {
            privacyStatus:
              privacyStatus === "public" || privacyStatus === "unlisted"
                ? privacyStatus
                : "private",
            selfDeclaredMadeForKids: false,
          };
          if (scheduledAt) {
            statusObj.privacyStatus = "private";
            statusObj.publishAt = new Date(String(scheduledAt)).toISOString();
          }

          const initRes = await fetch(
            "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${ytAuth.accessToken}`,
                "Content-Type": "application/json; charset=UTF-8",
              },
              body: JSON.stringify({
                snippet: {
                  title: finalTitle,
                  description: cleanDesc,
                  tags: Array.isArray(tags) ? tags.slice(0, 20).map(String) : [],
                  categoryId: "28",
                },
                status: statusObj,
              }),
            }
          );

          if (!initRes.ok) {
            throw new Error(
              `YouTube upload initiation failed (${initRes.status}): ${await initRes.text()}`
            );
          }
          const uploadUrl = initRes.headers.get("location");
          if (!uploadUrl) {
            throw new Error("YouTube did not return a resumable upload session URL.");
          }

          const videoBytes = fs.readFileSync(localVideoPath);
          const putRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": "video/mp4",
              "Content-Length": String(videoBytes.length),
            },
            body: videoBytes,
          });
          const putJson = (await putRes.json()) as {
            id?: string;
            error?: { message?: string };
          };
          if (!putRes.ok || !putJson.id) {
            throw new Error(
              putJson.error?.message || `YouTube video upload failed (${putRes.status}).`
            );
          }

          // Optional Thumbnail Upload
          if (typeof thumbnailBase64 === "string" && thumbnailBase64.includes(",")) {
            try {
              const rawB64 = thumbnailBase64.split(",")[1];
              const imgBuf = Buffer.from(rawB64, "base64");
              await fetch(
                `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(
                  putJson.id
                )}&uploadType=media`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${ytAuth.accessToken}`,
                    "Content-Type": "image/jpeg",
                  },
                  body: imgBuf,
                }
              );
            } catch {
              // Thumbnail upload best-effort after confirmed video ID
            }
          }

          return res.json({
            published: true,
            platform: "youtube",
            externalPostId: putJson.id,
            externalUrl: `https://www.youtube.com/watch?v=${putJson.id}`,
          });
        }

        if (platform === "instagram") {
          const igAuth = vault.oauth.instagram;
          if (!igAuth?.igUserId) {
            return res.status(401).json({
              error: "Connect an Instagram Business/Creator account via Meta OAuth first.",
            });
          }
          if (!projectId || !videoFilename || !localVideoPath) {
            return res.status(400).json({
              error: "Render a vertical (9:16) MP4 video first to publish an Instagram Reel.",
            });
          }

          const tok = igAuth.pageAccessToken || igAuth.accessToken;
          const { exp, sig } = signMediaAccess(
            uid,
            sanitizeSegment(String(projectId)),
            sanitizeFilename(String(videoFilename)),
            3600
          );
          const publicVideoUrl = `${getAppPublicUrl(
            req
          )}/api/creator/media/public/${encodeURIComponent(uid)}/${encodeURIComponent(
            String(projectId)
          )}/${encodeURIComponent(String(videoFilename))}?exp=${exp}&sig=${sig}`;

          const containerRes = await fetch(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(
              igAuth.igUserId
            )}/media`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                media_type: "REELS",
                video_url: publicVideoUrl,
                caption: cleanDesc || cleanTitle,
                access_token: tok,
              }),
            }
          );
          const containerJson = (await containerRes.json()) as {
            id?: string;
            error?: { message?: string };
          };
          if (!containerRes.ok || !containerJson.id) {
            throw new Error(
              containerJson.error?.message || "Instagram Reel container creation failed."
            );
          }

          // Poll container status before publishing
          let ready = false;
          for (let i = 0; i < 15; i++) {
            await new Promise((r) => setTimeout(r, 3000));
            const stRes = await fetch(
              `https://graph.facebook.com/v21.0/${encodeURIComponent(
                containerJson.id
              )}?fields=status_code&access_token=${encodeURIComponent(tok)}`
            );
            const stJson = (await stRes.json()) as { status_code?: string };
            if (stJson.status_code === "FINISHED") {
              ready = true;
              break;
            }
            if (stJson.status_code === "ERROR") {
              throw new Error("Instagram rejected or failed to process the video container.");
            }
          }
          if (!ready) {
            throw new Error("Instagram Reel processing timed out. Check container status in Meta.");
          }

          const pubRes = await fetch(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(
              igAuth.igUserId
            )}/media_publish`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                creation_id: containerJson.id,
                access_token: tok,
              }),
            }
          );
          const pubJson = (await pubRes.json()) as {
            id?: string;
            error?: { message?: string };
          };
          if (!pubRes.ok || !pubJson.id) {
            throw new Error(
              pubJson.error?.message || "Instagram media_publish failed."
            );
          }

          return res.json({
            published: true,
            platform: "instagram",
            externalPostId: pubJson.id,
            externalUrl: "https://www.instagram.com/",
          });
        }

        if (platform === "facebook") {
          const fbAuth = vault.oauth.facebook;
          if (!fbAuth?.pageId) {
            return res.status(401).json({
              error: "Connect a Facebook Page via Meta OAuth first.",
            });
          }
          const pageTok = fbAuth.pageAccessToken || fbAuth.accessToken;
          if (localVideoPath && projectId && videoFilename) {
            const { exp, sig } = signMediaAccess(
              uid,
              sanitizeSegment(String(projectId)),
              sanitizeFilename(String(videoFilename)),
              3600
            );
            const publicVideoUrl = `${getAppPublicUrl(
              req
            )}/api/creator/media/public/${encodeURIComponent(uid)}/${encodeURIComponent(
              String(projectId)
            )}/${encodeURIComponent(String(videoFilename))}?exp=${exp}&sig=${sig}`;

            const bodyPayload: Record<string, unknown> = {
              file_url: publicVideoUrl,
              title: cleanTitle,
              description: cleanDesc,
              access_token: pageTok,
            };
            if (scheduledAt) {
              bodyPayload.published = false;
              bodyPayload.scheduled_publish_time = Math.floor(
                new Date(String(scheduledAt)).getTime() / 1000
              );
            }

            const fbRes = await fetch(
              `https://graph-video.facebook.com/v21.0/${encodeURIComponent(
                fbAuth.pageId
              )}/videos`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload),
              }
            );
            const fbJson = (await fbRes.json()) as {
              id?: string;
              error?: { message?: string };
            };
            if (!fbRes.ok || !fbJson.id) {
              throw new Error(
                fbJson.error?.message || "Facebook Page video publish failed."
              );
            }
            return res.json({
              published: true,
              platform: "facebook",
              externalPostId: fbJson.id,
              externalUrl: `https://www.facebook.com/${fbJson.id}`,
            });
          }
          return res.status(400).json({
            error: "Select a rendered video project to publish to Facebook.",
          });
        }

        if (platform === "telegram") {
          const tgToken = resolveProviderSecret(
            uid,
            "telegramBotToken",
            "TELEGRAM_BOT_TOKEN"
          );
          const chatId = vault.telegramChatId;
          if (!tgToken || !chatId) {
            return res.status(401).json({
              error: "Connect your Telegram Bot Token and Target Channel ID first.",
            });
          }
          if (localVideoPath && projectId && videoFilename) {
            const form = new FormData();
            form.append("chat_id", chatId);
            form.append("caption", (cleanDesc || cleanTitle).slice(0, 1024));
            const blob = new Blob([fs.readFileSync(localVideoPath)], {
              type: "video/mp4",
            });
            form.append("video", blob, path.basename(localVideoPath));
            const tgRes = await fetch(
              `https://api.telegram.org/bot${encodeURIComponent(tgToken)}/sendVideo`,
              { method: "POST", body: form }
            );
            const tgJson = (await tgRes.json()) as {
              ok?: boolean;
              description?: string;
              result?: { message_id?: number };
            };
            if (!tgRes.ok || !tgJson.ok || !tgJson.result?.message_id) {
              throw new Error(tgJson.description || "Telegram sendVideo failed.");
            }
            return res.json({
              published: true,
              platform: "telegram",
              externalPostId: String(tgJson.result.message_id),
              externalUrl: chatId.startsWith("@")
                ? `https://t.me/${chatId.slice(1)}/${tgJson.result.message_id}`
                : "",
            });
          }

          const msgRes = await fetch(
            `https://api.telegram.org/bot${encodeURIComponent(tgToken)}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                text: `${cleanTitle}\n\n${cleanDesc}`.trim().slice(0, 4096),
              }),
            }
          );
          const msgJson = (await msgRes.json()) as {
            ok?: boolean;
            description?: string;
            result?: { message_id?: number };
          };
          if (!msgRes.ok || !msgJson.ok || !msgJson.result?.message_id) {
            throw new Error(msgJson.description || "Telegram sendMessage failed.");
          }
          return res.json({
            published: true,
            platform: "telegram",
            externalPostId: String(msgJson.result.message_id),
            externalUrl: chatId.startsWith("@")
              ? `https://t.me/${chatId.slice(1)}/${msgJson.result.message_id}`
              : "",
          });
        }

        if (platform === "x") {
          const xAuth = vault.oauth.x;
          if (!xAuth?.accessToken) {
            return res.status(401).json({
              error: "Connect your X account via OAuth before posting.",
            });
          }
          const tweetText = (cleanDesc || cleanTitle).slice(0, 280);
          const xRes = await fetch("https://api.twitter.com/2/tweets", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${xAuth.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: tweetText }),
          });
          const xJson = (await xRes.json()) as {
            data?: { id?: string };
            detail?: string;
            title?: string;
          };
          if (!xRes.ok || !xJson.data?.id) {
            throw new Error(xJson.detail || xJson.title || "X tweet publish failed.");
          }
          return res.json({
            published: true,
            platform: "x",
            externalPostId: xJson.data.id,
            externalUrl: `https://x.com/i/web/status/${xJson.data.id}`,
          });
        }

        if (platform === "linkedin") {
          const liAuth = vault.oauth.linkedin;
          if (!liAuth?.accessToken || !liAuth.linkedinUrn) {
            return res.status(401).json({
              error: "Connect your LinkedIn account via OAuth before posting.",
            });
          }
          const liRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${liAuth.accessToken}`,
              "X-Restli-Protocol-Version": "2.0.0",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              author: liAuth.linkedinUrn,
              lifecycleState: "PUBLISHED",
              specificContent: {
                "com.linkedin.ugc.ShareContent": {
                  shareCommentary: { text: (cleanDesc || cleanTitle).slice(0, 2900) },
                  shareMediaCategory: "NONE",
                },
              },
              visibility: {
                "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
              },
            }),
          });
          const liJson = (await liRes.json()) as { id?: string; message?: string };
          if (!liRes.ok || !liJson.id) {
            throw new Error(liJson.message || "LinkedIn post publish failed.");
          }
          return res.json({
            published: true,
            platform: "linkedin",
            externalPostId: liJson.id,
            externalUrl: "https://www.linkedin.com/feed/",
          });
        }

        return res.status(400).json({ error: `Unsupported platform "${platform}".` });
      } catch (err) {
        res.status(500).json({
          published: false,
          error: err instanceof Error ? err.message : "Social media publishing failed.",
        });
      }
    }
  );
}
