import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Link2,
  RefreshCw,
  ShieldCheck,
  Unlink,
  Zap,
} from 'lucide-react';
import { creatorFetchJson } from '../../lib/creatorApi';
import { upsertCreatorConnection } from '../../lib/creatorFirebase';
import type {
  CreatorConnectionDoc,
  CreatorProviderStatus,
  OAuthPlatformSetup,
  SocialPlatformId,
} from '../../types/creator';

interface AccountsAndProvidersProps {
  uid: string | null;
  providerStatus: CreatorProviderStatus | null;
  connections: CreatorConnectionDoc[];
  onRefreshStatus: () => Promise<void>;
  onNotice: (msg: string) => void;
}

const OAUTH_PLATFORMS: Array<{
  id: Exclude<SocialPlatformId, 'telegram'>;
  label: string;
  apiNote: string;
}> = [
  {
    id: 'youtube',
    label: 'YouTube',
    apiNote: 'YouTube Data API v3 · YouTube Analytics v2 · Resumable Upload',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    apiNote: 'Meta Graph API · Business/Creator Reels & Insights',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    apiNote: 'Meta Graph API · Page Video & 28-Day Insights',
  },
  {
    id: 'x',
    label: 'X (Twitter)',
    apiNote: 'OAuth 2.0 PKCE · Posts & Account Profile',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    apiNote: 'OpenID + UGC Posts API · Professional Publishing',
  },
];

const CLAUDE_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-haiku-20241022',
];

export const AccountsAndProviders: React.FC<AccountsAndProvidersProps> = ({
  uid,
  providerStatus,
  connections,
  onRefreshStatus,
  onNotice,
}) => {
  const [oauthConfigs, setOauthConfigs] = useState<OAuthPlatformSetup[]>([]);
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null);
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);

  // Telegram Bot state
  const [tgToken, setTgToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [tgBusy, setTgBusy] = useState(false);

  // Provider Vault inputs (held in server memory per session, never persisted in browser or Firestore)
  const [claudeKey, setClaudeKey] = useState('');
  const [claudeModel, setClaudeModel] = useState(
    providerStatus?.ai.claude.model || 'claude-sonnet-4-20250514'
  );
  const [claudeTestMsg, setClaudeTestMsg] = useState<string | null>(null);
  const [runwayKey, setRunwayKey] = useState('');
  const [pexelsKey, setPexelsKey] = useState('');
  const [elevenLabsKey, setElevenLabsKey] = useState('');
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState('');
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);

  const loadOAuthConfig = async () => {
    if (!uid) return;
    try {
      const data = await creatorFetchJson<{ platforms: OAuthPlatformSetup[] }>(
        '/api/creator/oauth/config'
      );
      setOauthConfigs(data.platforms || []);
    } catch {
      // Ignore if unauthenticated yet
    }
  };

  useEffect(() => {
    loadOAuthConfig();
  }, [uid]);

  useEffect(() => {
    if (providerStatus?.ai.claude.model) {
      setClaudeModel(providerStatus.ai.claude.model);
    }
    if (providerStatus?.mediaProviders.telegram.chatId && !tgChatId) {
      setTgChatId(providerStatus.mediaProviders.telegram.chatId);
    }
  }, [providerStatus]);

  // Listen for OAuth Popup completion message
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const trustedOrigin =
        event.origin === window.location.origin ||
        event.origin.endsWith('.run.app') ||
        event.origin.includes('localhost');
      if (!trustedOrigin) return;

      const payload = event.data as {
        type?: string;
        platform?: Exclude<SocialPlatformId, 'telegram'>;
        account?: {
          accountId?: string;
          accountName?: string;
          handle?: string;
          avatarUrl?: string;
          followersCount?: number | null;
        };
        error?: string;
      };

      if (payload?.type === 'CREATOR_OAUTH_SUCCESS' && payload.platform) {
        if (uid && payload.account) {
          await upsertCreatorConnection(uid, payload.platform, {
            connected: true,
            accountName: payload.account.accountName || payload.platform,
            handle: payload.account.handle,
            channelId: payload.account.accountId,
            avatarUrl: payload.account.avatarUrl,
            followersCount: payload.account.followersCount ?? null,
          });
        }
        await onRefreshStatus();
        onNotice(
          `${payload.platform.toUpperCase()} connected: ${
            payload.account?.accountName || 'Account linked'
          }`
        );
        setBusyPlatform(null);
      } else if (payload?.type === 'CREATOR_OAUTH_ERROR') {
        onNotice(
          `OAuth error (${payload.platform || 'social'}): ${
            payload.error || 'Authorization was not completed.'
          }`
        );
        setBusyPlatform(null);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [uid, onRefreshStatus, onNotice]);

  const handleOAuthConnect = async (
    platform: Exclude<SocialPlatformId, 'telegram'>
  ) => {
    if (!uid) {
      onNotice('Sign in with Google first to link social media accounts.');
      return;
    }
    setBusyPlatform(platform);
    try {
      const data = await creatorFetchJson<{ url: string; callbackUrl: string }>(
        `/api/creator/oauth/${platform}/url`
      );
      const w = 540;
      const h = 680;
      const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2));
      const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2));
      const popup = window.open(
        data.url,
        `jarvis_oauth_${platform}`,
        `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );
      if (!popup) {
        onNotice('Popup was blocked by your browser. Allow popups for OAuth authentication.');
        setBusyPlatform(null);
      }
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Unable to start OAuth flow.');
      setBusyPlatform(null);
    }
  };

  const handleOAuthDisconnect = async (
    platform: Exclude<SocialPlatformId, 'telegram'>
  ) => {
    if (!uid) return;
    setBusyPlatform(platform);
    try {
      await creatorFetchJson(`/api/creator/oauth/${platform}/disconnect`, {
        method: 'POST',
      });
      await upsertCreatorConnection(uid, platform, {
        connected: false,
        accountName: platform,
      });
      await onRefreshStatus();
      onNotice(`${platform.toUpperCase()} disconnected.`);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Disconnect failed.');
    } finally {
      setBusyPlatform(null);
    }
  };

  const handleCopyCallback = async (platform: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedPlatform(platform);
      setTimeout(() => setCopiedPlatform(null), 2000);
    } catch {
      onNotice('Clipboard copy unavailable.');
    }
  };

  const handleConnectTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    setTgBusy(true);
    try {
      const res = await creatorFetchJson<{
        connected: boolean;
        accountName: string;
        handle: string;
        channelId: string;
        followersCount: number | null;
      }>('/api/creator/providers/test-telegram', {
        method: 'POST',
        body: JSON.stringify({ botToken: tgToken.trim(), chatId: tgChatId.trim() }),
      });

      await upsertCreatorConnection(uid, 'telegram', {
        connected: true,
        accountName: res.accountName,
        handle: res.handle,
        channelId: res.channelId,
        followersCount: res.followersCount,
      });
      setTgToken('');
      await onRefreshStatus();
      onNotice(`Telegram verified & linked: ${res.accountName}`);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Telegram connection failed.');
    } finally {
      setTgBusy(false);
    }
  };

  const handleSaveVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    setVaultBusy(true);
    try {
      const payload: Record<string, string> = { anthropicModel: claudeModel };
      if (claudeKey.trim()) payload.anthropicApiKey = claudeKey.trim();
      if (runwayKey.trim()) payload.runwayApiKey = runwayKey.trim();
      if (pexelsKey.trim()) payload.pexelsApiKey = pexelsKey.trim();
      if (elevenLabsKey.trim()) payload.elevenLabsApiKey = elevenLabsKey.trim();
      if (elevenLabsVoiceId.trim()) payload.elevenLabsVoiceId = elevenLabsVoiceId.trim();
      if (youtubeApiKey.trim()) payload.youtubeApiKey = youtubeApiKey.trim();

      await creatorFetchJson('/api/creator/providers/configure', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setClaudeKey('');
      setRunwayKey('');
      setPexelsKey('');
      setElevenLabsKey('');
      setYoutubeApiKey('');
      await onRefreshStatus();
      onNotice('Session provider vault updated in server memory.');
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Failed to update provider vault.');
    } finally {
      setVaultBusy(false);
    }
  };

  const handleTestClaude = async () => {
    if (!uid) return;
    setVaultBusy(true);
    setClaudeTestMsg(null);
    try {
      const res = await creatorFetchJson<{
        connected: boolean;
        modelUsed: string;
        reply: string;
      }>('/api/creator/providers/test-claude', {
        method: 'POST',
        body: JSON.stringify({
          apiKey: claudeKey.trim() || undefined,
          model: claudeModel,
        }),
      });
      setClaudeKey('');
      setClaudeTestMsg(`Verified (${res.modelUsed}): ${res.reply}`);
      await onRefreshStatus();
    } catch (err) {
      setClaudeTestMsg(err instanceof Error ? err.message : 'Claude test failed.');
    } finally {
      setVaultBusy(false);
    }
  };

  const getFirestoreConn = (platform: SocialPlatformId) =>
    connections.find((c) => c.platform === platform);

  const tgConn = getFirestoreConn('telegram');
  const tgConnected = Boolean(providerStatus?.mediaProviders.telegram.configured);

  return (
    <div className="space-y-6">
      {/* Social Media OAuth Connections */}
      <section className="rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/95 p-4 sm:p-5 space-y-4 shadow-sm dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold tracking-wider text-cyan-800 dark:text-cyan-200">
              CONNECTED SOCIAL ACCOUNTS
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Official OAuth 2.0 authentication and API tokens stored strictly in server
              session memory. Passwords are never requested.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onRefreshStatus();
              loadOAuthConfig();
            }}
            className="min-h-[38px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#050A14] text-xs text-slate-800 dark:text-slate-200 hover:border-cyan-500/50 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Status</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {OAUTH_PLATFORMS.map((p) => {
            const live = providerStatus?.oauth?.[p.id];
            const fsRec = getFirestoreConn(p.id);
            const cfg = oauthConfigs.find((c) => c.platform === p.id);
            const isConnected = Boolean(live?.connected);
            const displayName = live?.accountName || fsRec?.accountName || p.label;
            const handle = live?.handle || fsRec?.handle;
            const followers = live?.followersCount ?? fsRec?.followersCount ?? null;

            return (
              <div
                key={p.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {live?.avatarUrl || fsRec?.avatarUrl ? (
                      <img
                        src={live?.avatarUrl || fsRec?.avatarUrl}
                        alt={displayName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full border border-cyan-500/30 object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl border border-cyan-600/25 dark:border-cyan-500/25 bg-cyan-50 dark:bg-cyan-500/10 flex items-center justify-center font-display text-sm font-bold text-cyan-700 dark:text-cyan-300 shrink-0">
                        {p.label[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {isConnected ? displayName : p.label}
                        </span>
                        <span
                          className={`text-[10px] font-mono-hud uppercase ${
                            isConnected
                              ? 'text-emerald-700 dark:text-emerald-300'
                              : 'text-slate-500'
                          }`}
                        >
                          {isConnected ? 'ACTIVE' : 'DISCONNECTED'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                        {handle ? `${handle} · ` : ''}
                        {followers !== null && followers !== undefined
                          ? `${followers.toLocaleString()} followers · `
                          : ''}
                        {p.apiNote}
                      </p>
                    </div>
                  </div>
                </div>

                {cfg && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#08101E] px-2.5 py-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono-hud text-slate-600 dark:text-slate-400 truncate">
                      Callback: {cfg.callbackUrl}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyCallback(p.id, cfg.callbackUrl)}
                      className="text-[10px] text-cyan-700 dark:text-cyan-300 hover:text-cyan-600 dark:hover:text-cyan-200 inline-flex items-center gap-1 shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedPlatform === p.id ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}

                {cfg && !cfg.configured && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300/90">
                    Missing server env vars: {cfg.missingEnv.join(', ')}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  {isConnected ? (
                    <button
                      type="button"
                      onClick={() => handleOAuthDisconnect(p.id)}
                      disabled={busyPlatform === p.id}
                      className="min-h-[38px] px-3 rounded-lg border border-rose-500/35 bg-rose-50 dark:bg-rose-500/10 text-xs font-medium text-rose-700 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-500/20 inline-flex items-center gap-1.5"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOAuthConnect(p.id)}
                      disabled={busyPlatform === p.id || !uid}
                      className="min-h-[38px] px-3.5 rounded-lg bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>
                        {busyPlatform === p.id ? 'Authorizing...' : `Connect ${p.label}`}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Telegram Official Bot API Card */}
          <form
            onSubmit={handleConnectTelegram}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {tgConnected && tgConn?.accountName ? tgConn.accountName : 'Telegram'}
                  </span>
                  <span
                    className={`text-[10px] font-mono-hud uppercase ${
                      tgConnected
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-slate-500'
                    }`}
                  >
                    {tgConnected ? 'BOT VERIFIED' : 'NOT CONFIGURED'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Official Telegram Bot API · Channel video & announcement publishing
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="password"
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                placeholder={
                  tgConnected ? 'Bot Token active (paste to rotate)' : 'Bot Token (@BotFather)'
                }
                className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
              />
              <input
                type="text"
                value={tgChatId}
                onChange={(e) => setTgChatId(e.target.value)}
                placeholder="Channel ID (e.g. @yourchannel or -100...)"
                className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end">
              <button
                type="submit"
                disabled={tgBusy || !uid}
                className="min-h-[38px] px-3.5 rounded-lg border border-cyan-600/35 dark:border-cyan-500/40 bg-cyan-50 dark:bg-cyan-500/15 text-xs font-semibold text-cyan-800 dark:text-cyan-200 hover:bg-cyan-100 dark:hover:bg-cyan-500/25 disabled:opacity-50"
              >
                {tgBusy ? 'Verifying Bot...' : 'Verify & Link Telegram'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* AI & Media Provider Vault (Never displays or collects GEMINI_API_KEY) */}
      <section className="rounded-2xl border border-emerald-600/25 dark:border-emerald-500/25 bg-white dark:bg-[#08101E]/95 p-4 sm:p-5 space-y-4 shadow-sm dark:shadow-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span>AI & MEDIA PROVIDER VAULT</span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Gemini 4 Hydrogen is pre-configured server-side. Add optional third-party keys
              below for Anthropic Claude, Runway Gen, Pexels Stock, ElevenLabs Voice, or
              YouTube Competitor Lookup. Keys reside strictly in server memory for your
              active session.
            </p>
          </div>
          <span className="text-[11px] font-mono-hud text-emerald-700 dark:text-emerald-300 shrink-0">
            Gemini Server: {providerStatus?.ai.gemini.configured ? 'ONLINE' : 'CHECK ENV'}
          </span>
        </div>

        <form onSubmit={handleSaveVault} className="space-y-4">
          {/* Claude Configuration */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-cyan-600 dark:text-cyan-300" />
                <span className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Anthropic Claude AI Provider
                </span>
                <span className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
                  ·{' '}
                  {providerStatus?.ai.claude.configured
                    ? `Configured (${providerStatus.ai.claude.source})`
                    : 'Not configured'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleTestClaude}
                disabled={vaultBusy || !uid}
                className="min-h-[34px] px-3 rounded-lg border border-cyan-600/35 dark:border-cyan-500/35 bg-cyan-50 dark:bg-cyan-500/10 text-xs text-cyan-800 dark:text-cyan-200 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 inline-flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Verify Claude</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="password"
                value={claudeKey}
                onChange={(e) => setClaudeKey(e.target.value)}
                placeholder={
                  providerStatus?.ai.claude.configured
                    ? 'Claude API key stored in session (enter to replace)'
                    : 'Enter Anthropic Claude API key (sk-ant-...)'
                }
                className="min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
              />
              <select
                value={claudeModel}
                onChange={(e) => setClaudeModel(e.target.value)}
                className="min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
              >
                {CLAUDE_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {claudeTestMsg && (
              <p className="text-xs text-cyan-800 dark:text-cyan-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300 shrink-0" />
                <span>{claudeTestMsg}</span>
              </p>
            )}
          </div>

          {/* Media & Data Provider Keys */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Pexels Licensed Stock API
                </span>
                <span className="font-mono-hud text-[10px] text-slate-600 dark:text-slate-400">
                  {providerStatus?.mediaProviders.pexels.configured ? 'ACTIVE' : 'UNSET'}
                </span>
              </div>
              <input
                type="password"
                value={pexelsKey}
                onChange={(e) => setPexelsKey(e.target.value)}
                placeholder="Optional Pexels API key"
                className="w-full min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Runway Gen AI Video API
                </span>
                <span className="font-mono-hud text-[10px] text-slate-600 dark:text-slate-400">
                  {providerStatus?.mediaProviders.runway.configured ? 'ACTIVE' : 'UNSET'}
                </span>
              </div>
              <input
                type="password"
                value={runwayKey}
                onChange={(e) => setRunwayKey(e.target.value)}
                placeholder="Optional Runway API key"
                className="w-full min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  ElevenLabs Voice API
                </span>
                <span className="font-mono-hud text-[10px] text-slate-600 dark:text-slate-400">
                  {providerStatus?.mediaProviders.elevenlabs.configured ? 'ACTIVE' : 'UNSET'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="password"
                  value={elevenLabsKey}
                  onChange={(e) => setElevenLabsKey(e.target.value)}
                  placeholder="Optional EL key"
                  className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
                />
                <input
                  type="text"
                  value={elevenLabsVoiceId}
                  onChange={(e) => setElevenLabsVoiceId(e.target.value)}
                  placeholder="Voice ID"
                  className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  YouTube Data API Key (Public Competitors)
                </span>
                <span className="font-mono-hud text-[10px] text-slate-600 dark:text-slate-400">
                  {providerStatus?.mediaProviders.youtubeApiKey.configured ? 'ACTIVE' : 'UNSET'}
                </span>
              </div>
              <input
                type="password"
                value={youtubeApiKey}
                onChange={(e) => setYoutubeApiKey(e.target.value)}
                placeholder="Optional if YouTube OAuth connected"
                className="w-full min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={vaultBusy || !uid}
              className="min-h-[42px] px-5 rounded-xl bg-emerald-600 dark:bg-emerald-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-emerald-500 dark:hover:bg-emerald-300 disabled:opacity-50"
            >
              {vaultBusy ? 'Updating Session Vault...' : 'Save Session Provider Keys'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
