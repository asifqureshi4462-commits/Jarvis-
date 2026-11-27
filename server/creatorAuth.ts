import crypto from "node:crypto";
import { NextFunction, Request, Response } from "express";

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "jarvis-881a1";
const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

export interface OAuthTokenRecord {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  accountId?: string;
  accountName?: string;
  handle?: string;
  avatarUrl?: string;
  followersCount?: number;
  pageId?: string;
  pageAccessToken?: string;
  igUserId?: string;
  linkedinUrn?: string;
}

export interface UserVault {
  anthropicApiKey?: string;
  anthropicModel?: string;
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  runwayApiKey?: string;
  pexelsApiKey?: string;
  youtubeApiKey?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  oauth: Partial<
    Record<"youtube" | "instagram" | "facebook" | "x" | "linkedin", OAuthTokenRecord>
  >;
}

const vaultStore = new Map<string, UserVault>();
const MEDIA_SIGNING_SECRET =
  process.env.MEDIA_SIGNING_SECRET || crypto.randomBytes(32).toString("hex");

let cachedCerts: Record<string, string> = {};
let certsExpiresAt = 0;

async function getGoogleCerts(): Promise<Record<string, string>> {
  if (Date.now() < certsExpiresAt && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }
  const res = await fetch(CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase public keys (${res.status}).`);
  }
  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = (await res.json()) as Record<string, string>;
  certsExpiresAt = Date.now() + maxAgeSec * 1000;
  return cachedCerts;
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64");
}

export interface AuthenticatedUser {
  uid: string;
  email: string;
}

export interface AuthedRequest extends Request {
  authUser?: AuthenticatedUser;
}

export async function verifyFirebaseIdToken(
  token: string
): Promise<AuthenticatedUser> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed authentication token.");
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64).toString("utf8")) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported token algorithm or missing key ID.");
  }

  const certs = await getGoogleCerts();
  let pem = certs[header.kid];
  if (!pem) {
    certsExpiresAt = 0;
    const fresh = await getGoogleCerts();
    pem = fresh[header.kid];
  }
  if (!pem) {
    throw new Error("Token signing key not recognized.");
  }

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const signature = base64UrlDecode(signatureB64);
  const isValidSig = verifier.verify(pem, signature);
  if (!isValidSig) {
    throw new Error("Invalid authentication signature.");
  }

  const payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    email?: string;
    email_verified?: boolean;
  };

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== FIREBASE_PROJECT_ID) {
    throw new Error("Token audience mismatch.");
  }
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error("Token issuer mismatch.");
  }
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error("Authentication session expired. Please refresh or sign in again.");
  }
  if (!payload.sub || !/^[a-zA-Z0-9_-]{1,128}$/.test(payload.sub)) {
    throw new Error("Invalid user identifier.");
  }
  if (!payload.email_verified) {
    throw new Error("Verified Google account is required for Creator Studio.");
  }

  return {
    uid: payload.sub,
    email: payload.email || "",
  };
}

export async function requireCreatorAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) {
      return res.status(401).json({
        error: "Sign in with Google to authenticate Creator Studio requests.",
      });
    }
    req.authUser = await verifyFirebaseIdToken(match[1].trim());
    return next();
  } catch (err) {
    return res.status(401).json({
      error: err instanceof Error ? err.message : "Authentication required.",
    });
  }
}

export function getUserVault(uid: string): UserVault {
  let vault = vaultStore.get(uid);
  if (!vault) {
    vault = { oauth: {} };
    vaultStore.set(uid, vault);
  }
  return vault;
}

export function resolveProviderSecret(
  uid: string,
  vaultField: keyof Omit<UserVault, "oauth">,
  envKey: string
): string | undefined {
  const vault = getUserVault(uid);
  const sessionVal = vault[vaultField];
  if (typeof sessionVal === "string" && sessionVal.trim()) {
    return sessionVal.trim();
  }
  const envVal = process.env[envKey];
  if (typeof envVal === "string" && envVal.trim()) {
    return envVal.trim();
  }
  return undefined;
}

export function signMediaAccess(
  uid: string,
  projectId: string,
  filename: string,
  ttlSeconds = 3600
): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto
    .createHmac("sha256", MEDIA_SIGNING_SECRET)
    .update(`${uid}:${projectId}:${filename}:${exp}`)
    .digest("hex");
  return { exp, sig };
}

export function verifyMediaAccess(
  uid: string,
  projectId: string,
  filename: string,
  exp: number,
  sig: string
): boolean {
  if (!exp || exp < Math.floor(Date.now() / 1000)) return false;
  if (!sig || !/^[a-f0-9]{64}$/i.test(sig)) return false;
  const expected = crypto
    .createHmac("sha256", MEDIA_SIGNING_SECRET)
    .update(`${uid}:${projectId}:${filename}:${exp}`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
}
