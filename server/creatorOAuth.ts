import crypto from "node:crypto";
import { Express, Request, Response } from "express";
import {
  AuthedRequest,
  getUserVault,
  OAuthTokenRecord,
  requireCreatorAuth,
} from "./creatorAuth.js";

export type SocialPlatform =
  | "youtube"
  | "instagram"
  | "facebook"
  | "x"
  | "linkedin";

interface PendingState {
  uid: string;
  platform: SocialPlatform;
  redirectUri: string;
  codeVerifier?: string;
  expiresAt: number;
}

const pendingOAuthStates = new Map<string, PendingState>();

function getAppBaseUrl(req?: Request): string {
  const envUrl = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (envUrl && envUrl.startsWith("http")) {
    return envUrl;
  }
  if (req) {
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
  return "http://localhost:3000";
}

function getCallbackUrl(platform: SocialPlatform, req?: Request): string {
  return `${getAppBaseUrl(req)}/auth/callback/${platform}`;
}

function base64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getOAuthCredentials(platform: SocialPlatform): {
  clientId?: string;
  clientSecret?: string;
  missingEnv: string[];
} {
  if (platform === "youtube") {
    const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
    const missing: string[] = [];
    if (!clientId) missing.push("YOUTUBE_CLIENT_ID");
    if (!clientSecret) missing.push("YOUTUBE_CLIENT_SECRET");
    return { clientId, clientSecret, missingEnv: missing };
  }
  if (platform === "instagram" || platform === "facebook") {
    const clientId = process.env.META_APP_ID?.trim();
    const clientSecret = process.env.META_APP_SECRET?.trim();
    const missing: string[] = [];
    if (!clientId) missing.push("META_APP_ID");
    if (!clientSecret) missing.push("META_APP_SECRET");
    return { clientId, clientSecret, missingEnv: missing };
  }
  if (platform === "x") {
    const clientId = process.env.X_CLIENT_ID?.trim();
    const clientSecret = process.env.X_CLIENT_SECRET?.trim();
    const missing: string[] = [];
    if (!clientId) missing.push("X_CLIENT_ID");
    return { clientId, clientSecret, missingEnv: missing };
  }
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  const missing: string[] = [];
  if (!clientId) missing.push("LINKEDIN_CLIENT_ID");
  if (!clientSecret) missing.push("LINKEDIN_CLIENT_SECRET");
  return { clientId, clientSecret, missingEnv: missing };
}

function escapeHtmlText(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendPopupResult(
  res: Response,
  payload: Record<string, unknown>,
  message: string
) {
  const safeJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html>
  <body style="background:#04070D;color:#E2E8F0;font-family:system-ui,sans-serif;padding:32px;text-align:center;">
    <p>${escapeHtmlText(message)}</p>
    <script>
      (function () {
        var data = ${safeJson};
        if (window.opener) {
          window.opener.postMessage(data, '*');
          setTimeout(function () { window.close(); }, 350);
        } else {
          window.location.href = '/';
        }
      })();
    </script>
  </body>
</html>`);
}

async function fetchPlatformProfile(
  platform: SocialPlatform,
  accessToken: string,
  refreshToken?: string,
  expiresIn?: number
): Promise<OAuthTokenRecord> {
  const record: OAuthTokenRecord = {
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
  };

  if (platform === "youtube") {
    const chRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const chJson = (await chRes.json()) as {
      items?: Array<{
        id: string;
        snippet?: {
          title?: string;
          customUrl?: string;
          thumbnails?: { default?: { url?: string } };
        };
        statistics?: { subscriberCount?: string };
      }>;
    };
    const ch = chJson.items?.[0];
    if (ch) {
      record.accountId = ch.id;
      record.accountName = ch.snippet?.title || "YouTube Channel";
      record.handle = ch.snippet?.customUrl || ch.id;
      record.avatarUrl = ch.snippet?.thumbnails?.default?.url;
      record.followersCount = ch.statistics?.subscriberCount
        ? Number(ch.statistics.subscriberCount)
        : undefined;
    } else {
      record.accountName = "Google Account (No YouTube Channel Found)";
    }
    return record;
  }

  if (platform === "facebook" || platform === "instagram") {
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,fan_count,picture{url},instagram_business_account{id,username,name,profile_picture_url,followers_count}&access_token=${encodeURIComponent(
        accessToken
      )}`
    );
    const pagesJson = (await pagesRes.json()) as {
      data?: Array<{
        id: string;
        name: string;
        access_token?: string;
        fan_count?: number;
        picture?: { data?: { url?: string } };
        instagram_business_account?: {
          id: string;
          username?: string;
          name?: string;
          profile_picture_url?: string;
          followers_count?: number;
        };
      }>;
    };
    const pages = pagesJson.data || [];
    if (platform === "instagram") {
      const withIg = pages.find((p) => p.instagram_business_account?.id);
      const ig = withIg?.instagram_business_account;
      if (ig) {
        record.igUserId = ig.id;
        record.pageId = withIg?.id;
        record.pageAccessToken = withIg?.access_token;
        record.accountId = ig.id;
        record.accountName = ig.name || ig.username || "Instagram Creator";
        record.handle = ig.username ? `@${ig.username}` : ig.id;
        record.avatarUrl = ig.profile_picture_url;
        record.followersCount = ig.followers_count;
      } else {
        record.accountName = "Meta Account (Link an IG Business Account to a Page)";
      }
      return record;
    }

    const firstPage = pages[0];
    if (firstPage) {
      record.pageId = firstPage.id;
      record.pageAccessToken = firstPage.access_token;
      record.accountId = firstPage.id;
      record.accountName = firstPage.name;
      record.handle = `Page ID: ${firstPage.id}`;
      record.avatarUrl = firstPage.picture?.data?.url;
      record.followersCount = firstPage.fan_count;
    } else {
      record.accountName = "Facebook Profile (No Managed Page Found)";
    }
    return record;
  }

  if (platform === "x") {
    const meRes = await fetch(
      "https://api.twitter.com/2/users/me?user.fields=public_metrics,profile_image_url,username,name",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const meJson = (await meRes.json()) as {
      data?: {
        id: string;
        name: string;
        username: string;
        profile_image_url?: string;
        public_metrics?: { followers_count?: number };
      };
    };
    if (meJson.data) {
      record.accountId = meJson.data.id;
      record.accountName = meJson.data.name;
      record.handle = `@${meJson.data.username}`;
      record.avatarUrl = meJson.data.profile_image_url;
      record.followersCount = meJson.data.public_metrics?.followers_count;
    }
    return record;
  }

  // LinkedIn
  const liRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const liJson = (await liRes.json()) as {
    sub?: string;
    name?: string;
    picture?: string;
    email?: string;
  };
  if (liJson.sub) {
    record.accountId = liJson.sub;
    record.linkedinUrn = `urn:li:person:${liJson.sub}`;
    record.accountName = liJson.name || "LinkedIn Member";
    record.handle = liJson.email || liJson.sub;
    record.avatarUrl = liJson.picture;
  }
  return record;
}

export function registerCreatorOAuthRoutes(app: Express) {
  // List callback URLs and OAuth server readiness
  app.get(
    "/api/creator/oauth/config",
    requireCreatorAuth,
    (req: AuthedRequest, res: Response) => {
      const platforms: SocialPlatform[] = [
        "youtube",
        "instagram",
        "facebook",
        "x",
        "linkedin",
      ];
      const baseUrl = getAppBaseUrl(req);
      const details = platforms.map((p) => {
        const creds = getOAuthCredentials(p);
        return {
          platform: p,
          configured: creds.missingEnv.length === 0,
          missingEnv: creds.missingEnv,
          callbackUrl: `${baseUrl}/auth/callback/${p}`,
        };
      });
      res.json({ baseUrl, platforms: details });
    }
  );

  // Generate direct OAuth provider authorization URL for popup window
  app.get(
    "/api/creator/oauth/:platform/url",
    requireCreatorAuth,
    (req: AuthedRequest, res: Response) => {
      const platform = req.params.platform as SocialPlatform;
      if (
        !["youtube", "instagram", "facebook", "x", "linkedin"].includes(platform)
      ) {
        return res.status(400).json({ error: "Unsupported OAuth platform." });
      }

      const creds = getOAuthCredentials(platform);
      const redirectUri = getCallbackUrl(platform, req);
      if (creds.missingEnv.length > 0 || !creds.clientId) {
        return res.status(400).json({
          error: `OAuth credentials missing in AI Studio Secrets: ${creds.missingEnv.join(
            ", "
          )}. Add them and configure callback URL: ${redirectUri}`,
          missingEnv: creds.missingEnv,
          callbackUrl: redirectUri,
        });
      }

      const state = crypto.randomBytes(24).toString("hex");
      const pending: PendingState = {
        uid: req.authUser!.uid,
        platform,
        redirectUri,
        expiresAt: Date.now() + 10 * 60 * 1000,
      };

      let url = "";
      if (platform === "youtube") {
        const params = new URLSearchParams({
          client_id: creds.clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: [
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/youtube.upload",
            "https://www.googleapis.com/auth/yt-analytics.readonly",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
          state,
        });
        url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      } else if (platform === "instagram" || platform === "facebook") {
        const scope =
          platform === "instagram"
            ? "instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,pages_read_engagement"
            : "pages_show_list,pages_read_engagement,pages_manage_posts,read_insights";
        const params = new URLSearchParams({
          client_id: creds.clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope,
          state,
        });
        url = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
      } else if (platform === "x") {
        const codeVerifier = base64Url(crypto.randomBytes(32));
        const codeChallenge = base64Url(
          crypto.createHash("sha256").update(codeVerifier).digest()
        );
        pending.codeVerifier = codeVerifier;
        const params = new URLSearchParams({
          response_type: "code",
          client_id: creds.clientId,
          redirect_uri: redirectUri,
          scope: "tweet.read tweet.write users.read offline.access",
          state,
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        });
        url = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
      } else if (platform === "linkedin") {
        const params = new URLSearchParams({
          response_type: "code",
          client_id: creds.clientId,
          redirect_uri: redirectUri,
          scope: "openid profile email w_member_social",
          state,
        });
        url = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
      }

      pendingOAuthStates.set(state, pending);
      return res.json({ url, callbackUrl: redirectUri });
    }
  );

  // OAuth Callback Handler (handles trailing slash variations)
  app.get(
    ["/auth/callback/:platform", "/auth/callback/:platform/"],
    async (req: Request, res: Response) => {
      const platform = req.params.platform as SocialPlatform;
      const code = String(req.query.code || "");
      const state = String(req.query.state || "");
      const oauthError = String(
        req.query.error_description || req.query.error || ""
      );

      if (oauthError) {
        return sendPopupResult(
          res,
          { type: "CREATOR_OAUTH_ERROR", platform, error: oauthError },
          `Authorization declined: ${oauthError}`
        );
      }

      const pending = pendingOAuthStates.get(state);
      pendingOAuthStates.delete(state);
      if (!pending || pending.platform !== platform || pending.expiresAt < Date.now()) {
        return sendPopupResult(
          res,
          {
            type: "CREATOR_OAUTH_ERROR",
            platform,
            error: "OAuth state expired or invalid. Please retry connecting.",
          },
          "Session expired. Please close this window and retry."
        );
      }

      if (!code) {
        return sendPopupResult(
          res,
          { type: "CREATOR_OAUTH_ERROR", platform, error: "Missing authorization code." },
          "Missing authorization code."
        );
      }

      try {
        const creds = getOAuthCredentials(platform);
        let accessToken = "";
        let refreshToken: string | undefined;
        let expiresIn: number | undefined;

        if (platform === "youtube") {
          const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: creds.clientId || "",
              client_secret: creds.clientSecret || "",
              redirect_uri: pending.redirectUri,
              grant_type: "authorization_code",
            }),
          });
          const tokenJson = (await tokenRes.json()) as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            error_description?: string;
            error?: string;
          };
          if (!tokenRes.ok || !tokenJson.access_token) {
            throw new Error(
              tokenJson.error_description || tokenJson.error || "YouTube token exchange failed."
            );
          }
          accessToken = tokenJson.access_token;
          refreshToken = tokenJson.refresh_token;
          expiresIn = tokenJson.expires_in;
        } else if (platform === "instagram" || platform === "facebook") {
          const params = new URLSearchParams({
            client_id: creds.clientId || "",
            client_secret: creds.clientSecret || "",
            redirect_uri: pending.redirectUri,
            code,
          });
          const tokenRes = await fetch(
            `https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`
          );
          const tokenJson = (await tokenRes.json()) as {
            access_token?: string;
            expires_in?: number;
            error?: { message?: string };
          };
          if (!tokenRes.ok || !tokenJson.access_token) {
            throw new Error(
              tokenJson.error?.message || "Meta Graph token exchange failed."
            );
          }
          accessToken = tokenJson.access_token;
          expiresIn = tokenJson.expires_in;
        } else if (platform === "x") {
          const headers: Record<string, string> = {
            "Content-Type": "application/x-www-form-urlencoded",
          };
          if (creds.clientSecret) {
            headers.Authorization = `Basic ${Buffer.from(
              `${creds.clientId}:${creds.clientSecret}`
            ).toString("base64")}`;
          }
          const bodyParams = new URLSearchParams({
            code,
            grant_type: "authorization_code",
            client_id: creds.clientId || "",
            redirect_uri: pending.redirectUri,
            code_verifier: pending.codeVerifier || "",
          });
          const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
            method: "POST",
            headers,
            body: bodyParams,
          });
          const tokenJson = (await tokenRes.json()) as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            error_description?: string;
          };
          if (!tokenRes.ok || !tokenJson.access_token) {
            throw new Error(
              tokenJson.error_description || "X OAuth token exchange failed."
            );
          }
          accessToken = tokenJson.access_token;
          refreshToken = tokenJson.refresh_token;
          expiresIn = tokenJson.expires_in;
        } else if (platform === "linkedin") {
          const tokenRes = await fetch(
            "https://www.linkedin.com/oauth/v2/accessToken",
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: pending.redirectUri,
                client_id: creds.clientId || "",
                client_secret: creds.clientSecret || "",
              }),
            }
          );
          const tokenJson = (await tokenRes.json()) as {
            access_token?: string;
            expires_in?: number;
            error_description?: string;
          };
          if (!tokenRes.ok || !tokenJson.access_token) {
            throw new Error(
              tokenJson.error_description || "LinkedIn token exchange failed."
            );
          }
          accessToken = tokenJson.access_token;
          expiresIn = tokenJson.expires_in;
        }

        const profile = await fetchPlatformProfile(
          platform,
          accessToken,
          refreshToken,
          expiresIn
        );
        const vault = getUserVault(pending.uid);
        vault.oauth[platform] = profile;

        return sendPopupResult(
          res,
          {
            type: "CREATOR_OAUTH_SUCCESS",
            platform,
            profile: {
              accountId: profile.accountId || "",
              accountName: profile.accountName || platform,
              handle: profile.handle || "",
              avatarUrl: profile.avatarUrl || "",
              followersCount: profile.followersCount,
            },
          },
          `Connected ${profile.accountName || platform} to J.A.R.V.I.S Creator Studio. Closing window...`
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "OAuth verification failed.";
        return sendPopupResult(
          res,
          { type: "CREATOR_OAUTH_ERROR", platform, error: message },
          `Connection error: ${message}`
        );
      }
    }
  );

  // Disconnect platform OAuth session
  app.post(
    "/api/creator/oauth/:platform/disconnect",
    requireCreatorAuth,
    (req: AuthedRequest, res: Response) => {
      const platform = req.params.platform as SocialPlatform;
      const vault = getUserVault(req.authUser!.uid);
      if (platform in vault.oauth) {
        delete vault.oauth[platform];
      }
      res.json({ disconnected: true, platform });
    }
  );
}
