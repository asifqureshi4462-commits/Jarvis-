import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Clapperboard,
  FileText,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  Lightbulb,
  Link2,
  Radar,
  Send,
  Share2,
  Sparkles,
  Tag,
} from 'lucide-react';
import { creatorFetchJson } from '../../lib/creatorApi';
import {
  subscribeCreatorCalendar,
  subscribeCreatorConnections,
  subscribeCreatorIdeas,
  subscribeCreatorPosts,
  subscribeCreatorProjects,
  subscribeCreatorReports,
  subscribeCreatorScripts,
  subscribeCreatorSnapshots,
} from '../../lib/creatorFirebase';
import type {
  AIProviderChoice,
  CreatorCalendarDoc,
  CreatorConnectionDoc,
  CreatorIdeaDoc,
  CreatorPostDoc,
  CreatorProjectDoc,
  CreatorProviderStatus,
  CreatorReportDoc,
  CreatorScriptDoc,
  CreatorSectionId,
  CreatorSnapshotDoc,
  CreatorVoiceCommand,
  FacebookAnalyticsPayload,
  InstagramAnalyticsPayload,
  ScriptSceneItem,
  SocialPlatformId,
  YouTubeAnalyticsPayload,
} from '../../types/creator';
import type { ConfirmDialogState } from '../../types/jarvis';
import { AccountsAndProviders } from './AccountsAndProviders';
import {
  FacebookAnalyticsView,
  InstagramAnalyticsView,
  PerformanceReportsView,
  YouTubeAnalyticsView,
} from './AnalyticsViews';
import { formatCompactNumber, MetricTile } from './CreatorCharts';
import {
  CompetitorResearchView,
  ContentCalendarView,
  ContentIdeasView,
  ScriptWriterView,
} from './StrategyAndScripts';
import {
  PublishingManagerView,
  SeoAssistantView,
  ThumbnailStudioView,
  VideoCreatorView,
} from './VideoPipelineAndStudio';

interface CreatorStudioProps {
  uid: string | null;
  isAuthenticated: boolean;
  onGoogleSignIn: () => Promise<void>;
  onRequestConfirm: (dlg: ConfirmDialogState) => void;
  voiceCommand: CreatorVoiceCommand | null;
  onClearVoiceCommand: () => void;
}

const SECTIONS: Array<{
  id: CreatorSectionId;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: 'overview', label: 'Overview', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  { id: 'accounts', label: 'Accounts', icon: <Link2 className="w-3.5 h-3.5" /> },
  { id: 'youtube', label: 'YouTube', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: 'instagram', label: 'Instagram', icon: <Share2 className="w-3.5 h-3.5" /> },
  { id: 'facebook', label: 'Facebook', icon: <Share2 className="w-3.5 h-3.5" /> },
  { id: 'ideas', label: 'Content Ideas', icon: <Lightbulb className="w-3.5 h-3.5" /> },
  { id: 'competitor', label: 'Competitors', icon: <Radar className="w-3.5 h-3.5" /> },
  { id: 'scripts', label: 'Script Writer', icon: <FileText className="w-3.5 h-3.5" /> },
  { id: 'video', label: 'AI Video Creator', icon: <Film className="w-3.5 h-3.5" /> },
  { id: 'thumbnails', label: 'Thumbnails', icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { id: 'seo', label: 'SEO Assistant', icon: <Tag className="w-3.5 h-3.5" /> },
  { id: 'publish', label: 'Publishing', icon: <Send className="w-3.5 h-3.5" /> },
  { id: 'calendar', label: 'Calendar', icon: <Calendar className="w-3.5 h-3.5" /> },
  { id: 'reports', label: 'Reports', icon: <Clapperboard className="w-3.5 h-3.5" /> },
];

export const CreatorStudio: React.FC<CreatorStudioProps> = ({
  uid,
  isAuthenticated,
  onGoogleSignIn,
  onRequestConfirm,
  voiceCommand,
  onClearVoiceCommand,
}) => {
  const [section, setSection] = useState<CreatorSectionId>('overview');
  const [aiProvider, setAiProvider] = useState<AIProviderChoice>('auto');
  const [niche, setNiche] = useState('AI Agents, Coding Automation & Tech Reviews');
  const [notice, setNotice] = useState<string | null>(null);

  // Provider & Social Status
  const [providerStatus, setProviderStatus] = useState<CreatorProviderStatus | null>(
    null
  );

  // Firestore Real-Time State
  const [connections, setConnections] = useState<CreatorConnectionDoc[]>([]);
  const [snapshots, setSnapshots] = useState<CreatorSnapshotDoc[]>([]);
  const [ideas, setIdeas] = useState<CreatorIdeaDoc[]>([]);
  const [scripts, setScripts] = useState<CreatorScriptDoc[]>([]);
  const [projects, setProjects] = useState<CreatorProjectDoc[]>([]);
  const [calendar, setCalendar] = useState<CreatorCalendarDoc[]>([]);
  const [posts, setPosts] = useState<CreatorPostDoc[]>([]);
  const [reports, setReports] = useState<CreatorReportDoc[]>([]);

  // Live Platform Analytics Cache
  const [ytRange, setYtRange] = useState<'7d' | '28d' | '90d' | 'custom'>('28d');
  const [ytCustomStart, setYtCustomStart] = useState(
    new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
  );
  const [ytCustomEnd, setYtCustomEnd] = useState(new Date().toISOString().slice(0, 10));
  const [youtubeData, setYoutubeData] = useState<YouTubeAnalyticsPayload | null>(null);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);

  const [instagramData, setInstagramData] = useState<InstagramAnalyticsPayload | null>(
    null
  );
  const [igLoading, setIgLoading] = useState(false);
  const [igError, setIgError] = useState<string | null>(null);

  const [facebookData, setFacebookData] = useState<FacebookAnalyticsPayload | null>(null);
  const [fbLoading, setFbLoading] = useState(false);
  const [fbError, setFbError] = useState<string | null>(null);

  // Cross-module handoff drafts
  const [scriptDraft, setScriptDraft] = useState<{
    topic: string;
    format: 'short' | 'long';
    hook?: string;
  } | null>(null);
  const [videoDraft, setVideoDraft] = useState<{
    title: string;
    format: 'short' | 'long';
    fullScript: string;
    scenes: ScriptSceneItem[];
  } | null>(null);
  const [seoDraft, setSeoDraft] = useState<{ topic: string; script: string }>({
    topic: '',
    script: '',
  });
  const [thumbDraft, setThumbDraft] = useState<{
    topic: string;
    videoUrl?: string;
    aspectRatio: '9:16' | '16:9';
  }>({ topic: 'AI Agents Automation', aspectRatio: '16:9' });
  const [publishDraft, setPublishDraft] = useState<{
    platform?: SocialPlatformId;
    projectId?: string;
    videoFilename?: string;
    videoUrl?: string;
    title?: string;
    caption?: string;
    tags?: string[];
    isShort?: boolean;
    thumbnailDataUrl?: string;
  } | null>(null);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
  }, []);

  const refreshProviderStatus = useCallback(async () => {
    if (!uid) return;
    try {
      const data = await creatorFetchJson<CreatorProviderStatus>(
        '/api/creator/providers/status'
      );
      setProviderStatus(data);
    } catch {
      // Ignore if auth initializing
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    refreshProviderStatus();
    const onSubError = (label: string) => (err: Error) => {
      console.warn(`Creator ${label} sync warning:`, err.message);
    };
    const u1 = subscribeCreatorConnections(uid, setConnections, onSubError('connections'));
    const u2 = subscribeCreatorSnapshots(uid, setSnapshots, onSubError('snapshots'));
    const u3 = subscribeCreatorIdeas(uid, setIdeas, onSubError('ideas'));
    const u4 = subscribeCreatorScripts(uid, setScripts, onSubError('scripts'));
    const u5 = subscribeCreatorProjects(uid, setProjects, onSubError('projects'));
    const u6 = subscribeCreatorCalendar(uid, setCalendar, onSubError('calendar'));
    const u7 = subscribeCreatorPosts(uid, setPosts, onSubError('posts'));
    const u8 = subscribeCreatorReports(uid, setReports, onSubError('reports'));
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
      u8();
    };
  }, [uid, refreshProviderStatus]);

  const fetchYouTube = useCallback(async () => {
    if (!uid) return;
    setYtLoading(true);
    setYtError(null);
    try {
      const params = new URLSearchParams({ range: ytRange });
      if (ytRange === 'custom') {
        params.set('startDate', ytCustomStart);
        params.set('endDate', ytCustomEnd);
      }
      const res = await creatorFetchJson<YouTubeAnalyticsPayload>(
        `/api/creator/analytics/youtube?${params.toString()}`
      );
      setYoutubeData(res);
    } catch (err) {
      setYtError(err instanceof Error ? err.message : 'Unable to sync YouTube.');
    } finally {
      setYtLoading(false);
    }
  }, [uid, ytRange, ytCustomStart, ytCustomEnd]);

  const fetchInstagram = useCallback(async () => {
    if (!uid) return;
    setIgLoading(true);
    setIgError(null);
    try {
      const res = await creatorFetchJson<InstagramAnalyticsPayload>(
        '/api/creator/analytics/instagram'
      );
      setInstagramData(res);
    } catch (err) {
      setIgError(err instanceof Error ? err.message : 'Unable to sync Instagram.');
    } finally {
      setIgLoading(false);
    }
  }, [uid]);

  const fetchFacebook = useCallback(async () => {
    if (!uid) return;
    setFbLoading(true);
    setFbError(null);
    try {
      const res = await creatorFetchJson<FacebookAnalyticsPayload>(
        '/api/creator/analytics/facebook'
      );
      setFacebookData(res);
    } catch (err) {
      setFbError(err instanceof Error ? err.message : 'Unable to sync Facebook.');
    } finally {
      setFbLoading(false);
    }
  }, [uid]);

  // Handle J.A.R.V.I.S Voice & Chat Commands
  useEffect(() => {
    if (!voiceCommand) return;
    const act = voiceCommand.action;
    if (act === 'analyze_youtube' || act === 'top_videos' || act === 'show_top_videos') {
      setSection('youtube');
      fetchYouTube();
    } else if (act === 'suggest_topics') {
      if (voiceCommand.topic) setNiche(voiceCommand.topic);
      setSection('ideas');
    } else if (act === 'create_reel') {
      setVideoDraft({
        title: voiceCommand.topic || '30-Second AI Tool Breakdown',
        format: 'short',
        fullScript: '',
        scenes: [],
      });
      setSection('video');
    } else if (act === 'prepare_script' || act === 'create_longform_script') {
      setScriptDraft({
        topic: voiceCommand.topic || 'AI Workflow Deep Dive',
        format: 'long',
      });
      setSection('scripts');
    } else if (act === 'generate_thumbnail') {
      setThumbDraft((prev) => ({
        ...prev,
        topic: voiceCommand.topic || prev.topic,
      }));
      setSection('thumbnails');
    } else if (act === 'plan_tomorrow' || act === 'plan_schedule') {
      setSection('calendar');
    } else if (act === 'publish_preview' || act === 'prepare_upload') {
      if (voiceCommand.platform) {
        setPublishDraft((prev) => ({
          ...prev,
          platform: voiceCommand.platform as SocialPlatformId,
        }));
      }
      setSection('publish');
    } else if (voiceCommand.section) {
      setSection(voiceCommand.section);
    }
    onClearVoiceCommand();
  }, [voiceCommand, fetchYouTube, onClearVoiceCommand]);

  const connectedCount = providerStatus
    ? Object.values(providerStatus.oauth).filter((v) => v.connected).length +
      (providerStatus.mediaProviders.telegram.configured ? 1 : 0)
    : 0;

  if (!isAuthenticated || !uid) {
    return (
      <div className="rounded-2xl border border-cyan-600/30 dark:border-cyan-500/30 bg-white dark:bg-[#08101E]/95 p-8 text-center space-y-4 shadow-sm dark:shadow-none">
        <Clapperboard className="w-10 h-10 text-cyan-600 dark:text-cyan-300 mx-auto" />
        <h2 className="font-display text-lg font-bold tracking-wider text-cyan-800 dark:text-cyan-200">
          J.A.R.V.I.S CREATOR STUDIO
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
          Sign in with your Google account to unlock social OAuth connections, YouTube
          Analytics, AI Content Strategist, 12-Step FFmpeg Video Production, and multi-platform
          publishing.
        </p>
        <button
          type="button"
          onClick={onGoogleSignIn}
          className="min-h-[42px] px-5 rounded-xl bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300"
        >
          Sign In with Google
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Studio Top Bar + AI Provider Selector */}
      <div className="rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/95 p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm dark:shadow-none">
        <div>
          <div className="flex items-center gap-2">
            <Clapperboard className="w-4 h-4 text-cyan-600 dark:text-cyan-300" />
            <h2 className="font-display text-base sm:text-lg font-bold tracking-wider text-cyan-800 dark:text-cyan-200">
              CREATOR STUDIO
            </h2>
            <span className="text-[11px] font-mono-hud text-emerald-700 dark:text-emerald-300">
              · {connectedCount}/6 CHANNELS LINKED
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Analytics · AI Strategist · Shorts & Long-Form · 12-Step FFmpeg Studio ·
            Confirmed Publishing
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
            AI ENGINE:
          </span>
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#050A14] p-0.5">
            {(['auto', 'claude', 'gemini'] as const).map((eng) => (
              <button
                key={eng}
                type="button"
                onClick={() => setAiProvider(eng)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium uppercase whitespace-nowrap ${
                  aiProvider === eng
                    ? 'bg-cyan-600/15 dark:bg-cyan-500/25 text-cyan-800 dark:text-cyan-200'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {eng}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Non-intrusive inline feedback notice */}
      {notice && (
        <div className="rounded-xl border border-cyan-600/30 dark:border-cyan-500/35 bg-cyan-50 dark:bg-[#08101E] px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-cyan-800 dark:text-cyan-200">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 14-Section Horizontal Sub-Nav */}
      <nav
        aria-label="Creator Studio Sections"
        className="flex items-center gap-1.5 overflow-x-auto pb-1"
      >
        {SECTIONS.map((s) => {
          const active = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`min-h-[38px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'border-cyan-600 dark:border-cyan-400 bg-cyan-600/15 dark:bg-cyan-500/15 text-cyan-800 dark:text-cyan-200'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-cyan-500/45'
              }`}
            >
              {s.icon}
              <span>{s.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Active Section Viewport */}
      {section === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricTile
              label="Connected Channels"
              value={`${connectedCount} / 6`}
              subValue="OAuth + Telegram"
            />
            <MetricTile
              label="YouTube Subscribers"
              value={formatCompactNumber(youtubeData?.metrics.subscribers ?? null)}
              subValue={youtubeData ? `${youtubeData.metrics.views ?? 0} period views` : 'Sync to load'}
              unavailable={!youtubeData}
            />
            <MetricTile
              label="Video Productions"
              value={String(projects.length)}
              subValue={`${scripts.length} saved scripts`}
            />
            <MetricTile
              label="Published & Scheduled"
              value={String(posts.length)}
              subValue={`${calendar.length} calendar slots`}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setSection('ideas')}
              className="text-left rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-slate-50 dark:bg-[#050A14] p-4 hover:border-cyan-500 dark:hover:border-cyan-400/60 space-y-1.5"
            >
              <Sparkles className="w-5 h-5 text-cyan-600 dark:text-cyan-300" />
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                1. Strategize & Research
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Inspect competitors, scan tech trends, and generate high-opportunity video
                ideas.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSection('video')}
              className="text-left rounded-2xl border border-emerald-600/25 dark:border-emerald-500/25 bg-slate-50 dark:bg-[#050A14] p-4 hover:border-emerald-500 dark:hover:border-emerald-400/60 space-y-1.5"
            >
              <Film className="w-5 h-5 text-emerald-600 dark:text-emerald-300" />
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                2. 12-Step FFmpeg Video Studio
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Turn scripts into 9:16 Reels or 16:9 videos with TTS narration, subtitles,
                and ffprobe QC.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSection('publish')}
              className="text-left rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-slate-50 dark:bg-[#050A14] p-4 hover:border-cyan-500 dark:hover:border-cyan-400/60 space-y-1.5"
            >
              <Send className="w-5 h-5 text-cyan-600 dark:text-cyan-300" />
              <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                3. Multi-Platform Publish
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Review platform-specific SEO, preview assets, and publish safely after
                explicit confirmation.
              </p>
            </button>
          </div>
        </div>
      )}

      {section === 'accounts' && (
        <AccountsAndProviders
          uid={uid}
          providerStatus={providerStatus}
          connections={connections}
          onRefreshStatus={refreshProviderStatus}
          onNotice={showNotice}
        />
      )}

      {section === 'youtube' && (
        <YouTubeAnalyticsView
          uid={uid}
          data={youtubeData}
          snapshots={snapshots}
          loading={ytLoading}
          error={ytError}
          range={ytRange}
          customStart={ytCustomStart}
          customEnd={ytCustomEnd}
          onChangeRange={setYtRange}
          onChangeCustomDates={(s, e) => {
            setYtCustomStart(s);
            setYtCustomEnd(e);
          }}
          onFetch={fetchYouTube}
          onGoConnect={() => setSection('accounts')}
          onNotice={showNotice}
        />
      )}

      {section === 'instagram' && (
        <InstagramAnalyticsView
          uid={uid}
          data={instagramData}
          loading={igLoading}
          error={igError}
          onFetch={fetchInstagram}
          onGoConnect={() => setSection('accounts')}
          onNotice={showNotice}
        />
      )}

      {section === 'facebook' && (
        <FacebookAnalyticsView
          uid={uid}
          data={facebookData}
          loading={fbLoading}
          error={fbError}
          onFetch={fetchFacebook}
          onGoConnect={() => setSection('accounts')}
          onNotice={showNotice}
        />
      )}

      {section === 'ideas' && (
        <ContentIdeasView
          uid={uid}
          aiProvider={aiProvider}
          niche={niche}
          onChangeNiche={setNiche}
          youtubeData={youtubeData}
          snapshots={snapshots}
          ideas={ideas}
          onDraftScript={(topic, format, hook) => {
            setScriptDraft({ topic, format, hook });
            setSection('scripts');
          }}
          onNotice={showNotice}
        />
      )}

      {section === 'competitor' && (
        <CompetitorResearchView
          uid={uid}
          aiProvider={aiProvider}
          niche={niche}
          onDraftScript={(topic, format) => {
            setScriptDraft({ topic, format });
            setSection('scripts');
          }}
          onNotice={showNotice}
        />
      )}

      {section === 'scripts' && (
        <ScriptWriterView
          uid={uid}
          aiProvider={aiProvider}
          scripts={scripts}
          initialDraft={scriptDraft}
          onClearInitialDraft={() => setScriptDraft(null)}
          onSendToVideoCreator={(payload) => {
            setVideoDraft(payload);
            setSection('video');
          }}
          onSendToSeo={(topic, script) => {
            setSeoDraft({ topic, script });
            setSection('seo');
          }}
          onNotice={showNotice}
        />
      )}

      {section === 'video' && (
        <VideoCreatorView
          uid={uid}
          aiProvider={aiProvider}
          providerStatus={providerStatus}
          projects={projects}
          incomingDraft={videoDraft}
          onClearIncomingDraft={() => setVideoDraft(null)}
          onSendToPublish={(payload) => {
            setPublishDraft((prev) => ({
              ...prev,
              projectId: payload.projectId,
              videoFilename: payload.videoFilename,
              videoUrl: payload.videoUrl,
              title: payload.title,
              caption: payload.scriptSummary,
              isShort: payload.aspectRatio === '9:16',
              platform: 'youtube',
            }));
            setSection('publish');
          }}
          onSendVideoToThumbnail={(videoUrl, topic, ar) => {
            setThumbDraft({ topic, videoUrl, aspectRatio: ar });
            setSection('thumbnails');
          }}
          onNotice={showNotice}
        />
      )}

      {section === 'thumbnails' && (
        <ThumbnailStudioView
          uid={uid}
          aiProvider={aiProvider}
          initialTopic={thumbDraft.topic}
          initialVideoUrl={thumbDraft.videoUrl}
          initialAspectRatio={thumbDraft.aspectRatio}
          onAttachThumbnailToPublish={(dataUrl) => {
            setPublishDraft((prev) => ({
              ...prev,
              thumbnailDataUrl: dataUrl,
            }));
            setSection('publish');
          }}
          onNotice={showNotice}
        />
      )}

      {section === 'seo' && (
        <SeoAssistantView
          uid={uid}
          aiProvider={aiProvider}
          initialTopic={seoDraft.topic}
          initialScript={seoDraft.script}
          onApplyToPublish={(plat, title, caption, tags) => {
            setPublishDraft((prev) => ({
              ...prev,
              platform: plat,
              title,
              caption,
              tags,
            }));
            setSection('publish');
          }}
          onNotice={showNotice}
        />
      )}

      {section === 'publish' && (
        <PublishingManagerView
          uid={uid}
          providerStatus={providerStatus}
          projects={projects}
          posts={posts}
          draftPublish={publishDraft}
          onRequestConfirm={onRequestConfirm}
          onNotice={showNotice}
        />
      )}

      {section === 'calendar' && (
        <ContentCalendarView
          uid={uid}
          aiProvider={aiProvider}
          niche={niche}
          ideas={ideas}
          youtubeData={youtubeData}
          calendar={calendar}
          onNotice={showNotice}
        />
      )}

      {section === 'reports' && (
        <PerformanceReportsView
          uid={uid}
          aiProvider={aiProvider}
          niche={niche}
          youtubeData={youtubeData}
          snapshots={snapshots}
          posts={posts}
          reports={reports}
          onNotice={showNotice}
        />
      )}
    </div>
  );
};
