import React, { useState } from 'react';
import {
  BookmarkPlus,
  CalendarPlus,
  Check,
  Film,
  Flame,
  Lightbulb,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Wand2,
} from 'lucide-react';
import { creatorFetchJson } from '../../lib/creatorApi';
import {
  addCreatorCalendarEntry,
  deleteCreatorCalendarEntry,
  deleteCreatorIdea,
  deleteCreatorScript,
  saveCreatorIdea,
  saveCreatorReport,
  saveCreatorScript,
  updateCreatorCalendarEntry,
  updateCreatorIdeaStatus,
} from '../../lib/creatorFirebase';
import type {
  AIProviderChoice,
  CreatorCalendarDoc,
  CreatorIdeaDoc,
  CreatorScriptDoc,
  CreatorSnapshotDoc,
  ScriptSceneItem,
  YouTubeAnalyticsPayload,
} from '../../types/creator';
import { formatCompactNumber } from './CreatorCharts';

interface ContentIdeasViewProps {
  uid: string | null;
  aiProvider: AIProviderChoice;
  niche: string;
  onChangeNiche: (n: string) => void;
  youtubeData: YouTubeAnalyticsPayload | null;
  snapshots: CreatorSnapshotDoc[];
  ideas: CreatorIdeaDoc[];
  onDraftScript: (topic: string, format: 'short' | 'long', hook?: string) => void;
  onNotice: (msg: string) => void;
}

interface GeneratedIdeaItem {
  topic: string;
  targetAudience: string;
  suggestedFormat: string;
  suggestedLength: string;
  hook: string;
  contentAngle: string;
  researchSources: string[];
  reason: string;
  confidence: 'low' | 'medium' | 'high';
}

export const ContentIdeasView: React.FC<ContentIdeasViewProps> = ({
  uid,
  aiProvider,
  niche,
  onChangeNiche,
  youtubeData,
  snapshots,
  ideas,
  onDraftScript,
  onNotice,
}) => {
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<GeneratedIdeaItem[]>([]);
  const [grounding, setGrounding] = useState<Array<{ title: string; url: string }>>([]);
  const [modelUsed, setModelUsed] = useState('');

  const handleGenerate = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const res = await creatorFetchJson<{
        result: GeneratedIdeaItem[];
        modelUsed: string;
        groundingSources?: Array<{ title: string; url: string }>;
      }>('/api/creator/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          task: 'strategize',
          provider: aiProvider,
          payload: {
            niche,
            count,
            channelSummary: youtubeData
              ? {
                  title: youtubeData.channel.title,
                  metrics: youtubeData.metrics,
                  topVideos: youtubeData.topVideos.slice(0, 4),
                  formatComparison: youtubeData.formatComparison,
                }
              : {},
            snapshots: snapshots.slice(0, 5),
          },
        }),
      });
      setGenerated(Array.isArray(res.result) ? res.result : []);
      setGrounding(res.groundingSources || []);
      setModelUsed(res.modelUsed);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Strategy generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (item: GeneratedIdeaItem) => {
    if (!uid) return;
    await saveCreatorIdea(uid, {
      ...item,
      status: 'saved',
    });
    onNotice(`Saved idea: "${item.topic}"`);
  };

  const inferFormat = (fmt: string): 'short' | 'long' =>
    /short|reel|vertical|9:16/i.test(fmt) ? 'short' : 'long';

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/95 p-4 space-y-3 shadow-sm dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-semibold tracking-wider text-cyan-800 dark:text-cyan-200">
              AI CONTENT STRATEGIST
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Evaluates niche trends, historical performance, and format fit. Analytical
              confidence only — never guarantees viral views.
            </p>
          </div>
          {modelUsed && (
            <span className="text-[11px] font-mono-hud text-emerald-700 dark:text-emerald-300">
              Model: {modelUsed}
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={niche}
            onChange={(e) => onChangeNiche(e.target.value)}
            placeholder="Channel Niche (e.g. AI Agents, Coding Automation, Tech Reviews)"
            className="flex-1 min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-3.5 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
          />
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-3 text-xs text-slate-800 dark:text-slate-200"
          >
            {[3, 5, 7].map((c) => (
              <option key={c} value={c}>
                {c} Ideas
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !uid}
            className="min-h-[42px] px-4 rounded-xl bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Lightbulb className="w-4 h-4" />
            <span>{loading ? 'Researching Trends...' : 'Recommend Video Ideas'}</span>
          </button>
        </div>
      </div>

      {generated.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-display text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            RECOMMENDED CONTENT OPPORTUNITIES ({generated.length})
          </h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {generated.map((item, idx) => (
              <div
                key={`${item.topic}-${idx}`}
                className="rounded-xl border border-cyan-600/25 dark:border-cyan-500/25 bg-slate-50 dark:bg-[#050A14] p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h5 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.topic}
                    </h5>
                    <span className="font-mono-hud text-[11px] uppercase text-cyan-700 dark:text-cyan-300 shrink-0">
                      {item.confidence} conf.
                    </span>
                  </div>
                  <p className="text-[11px] font-mono-hud text-emerald-700 dark:text-emerald-300">
                    {item.suggestedFormat} · {item.suggestedLength} · Audience:{' '}
                    {item.targetAudience}
                  </p>
                  <p className="text-xs text-slate-800 dark:text-slate-200">
                    <span className="text-cyan-700 dark:text-cyan-300 font-semibold">Hook:</span>{' '}
                    {item.hook}
                  </p>
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    <span className="text-slate-600 dark:text-slate-400 font-semibold">
                      Angle:
                    </span>{' '}
                    {item.contentAngle}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    <span className="text-slate-700 dark:text-slate-300 font-semibold">
                      Why:
                    </span>{' '}
                    {item.reason}
                  </p>
                  {Array.isArray(item.researchSources) && item.researchSources.length > 0 && (
                    <p className="text-[11px] text-slate-500">
                      Sources: {item.researchSources.join(' · ')}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => handleSave(item)}
                    className="min-h-[34px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#08101E] text-xs text-slate-800 dark:text-slate-200 hover:border-cyan-500/50 inline-flex items-center gap-1"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    <span>Save Idea</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onDraftScript(
                        item.topic,
                        inferFormat(item.suggestedFormat),
                        item.hook
                      )
                    }
                    className="min-h-[34px] px-3 rounded-lg bg-emerald-600 dark:bg-emerald-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-emerald-500 dark:hover:bg-emerald-300 inline-flex items-center gap-1"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Write Script</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          {grounding.length > 0 && (
            <div className="text-[11px] text-slate-600 dark:text-slate-400 flex flex-wrap gap-3">
              <span>Live Search Grounding:</span>
              {grounding.slice(0, 5).map((g) => (
                <a
                  key={g.url}
                  href={g.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-700 dark:text-cyan-300 underline truncate max-w-[220px]"
                >
                  {g.title}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Saved Ideas Library */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3">
        <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          SAVED IDEA BACKLOG ({ideas.length})
        </h4>
        <div className="space-y-2">
          {ideas.map((idea) => (
            <div
              key={idea.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] p-3 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {idea.topic}
                </p>
                <p className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
                  {idea.suggestedFormat} · {idea.suggestedLength || 'N/A'} · Status:{' '}
                  {idea.status}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={idea.status}
                  onChange={(e) =>
                    uid &&
                    updateCreatorIdeaStatus(
                      uid,
                      idea.id,
                      e.target.value as CreatorIdeaDoc['status']
                    )
                  }
                  className="min-h-[32px] rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#050A14] px-2 text-[11px] text-slate-800 dark:text-slate-200"
                >
                  <option value="saved">Saved</option>
                  <option value="scripted">Scripted</option>
                  <option value="produced">Produced</option>
                  <option value="archived">Archived</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    onDraftScript(
                      idea.topic,
                      inferFormat(idea.suggestedFormat),
                      idea.hook
                    )
                  }
                  className="min-h-[32px] px-2.5 rounded-lg border border-cyan-600/35 dark:border-cyan-500/35 text-[11px] text-cyan-800 dark:text-cyan-200"
                >
                  Script
                </button>
                <button
                  type="button"
                  onClick={() => uid && deleteCreatorIdea(uid, idea.id)}
                  className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                  aria-label="Delete idea"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {ideas.length === 0 && (
            <p className="text-xs text-slate-500">No saved ideas yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

interface CompetitorResearchViewProps {
  uid: string | null;
  aiProvider: AIProviderChoice;
  niche: string;
  onDraftScript: (topic: string, format: 'short' | 'long') => void;
  onNotice: (msg: string) => void;
}

interface CompetitorPayload {
  channel: {
    id: string;
    title: string;
    handle: string;
    description: string;
    avatarUrl: string;
    subscribers: number | null;
    totalViews: number | null;
    videoCount: number | null;
  };
  recentVideos: Array<{
    id: string;
    title: string;
    publishedAt: string;
    views: number;
    likes: number;
    comments: number;
    durationSec: number;
  }>;
}

export const CompetitorResearchView: React.FC<CompetitorResearchViewProps> = ({
  uid,
  aiProvider,
  niche,
  onDraftScript,
  onNotice,
}) => {
  const [query, setQuery] = useState('');
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [compData, setCompData] = useState<CompetitorPayload | null>(null);
  const [analysis, setAnalysis] = useState<{
    summary: string;
    winningPatterns: string[];
    contentGaps: string[];
    recommendedCounterAngles: Array<{
      title: string;
      format: string;
      whyItCompetes: string;
    }>;
    caveats: string;
  } | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !query.trim()) return;
    setLoadingLookup(true);
    try {
      const res = await creatorFetchJson<CompetitorPayload>(
        `/api/creator/youtube/competitor?query=${encodeURIComponent(query.trim())}`
      );
      setCompData(res);
      setAnalysis(null);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Competitor lookup failed.');
    } finally {
      setLoadingLookup(false);
    }
  };

  const handleAnalyze = async () => {
    if (!uid) return;
    setLoadingAi(true);
    try {
      const res = await creatorFetchJson<{
        result: typeof analysis;
      }>('/api/creator/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          task: 'competitor_research',
          provider: aiProvider,
          payload: {
            niche,
            query: query.trim() || compData?.channel.title || niche,
            competitorData: compData || {},
          },
        }),
      });
      setAnalysis(res.result);
      if (res.result) {
        await saveCreatorReport(uid, {
          title: `Competitor Gap Analysis · ${compData?.channel.title || query || niche}`,
          reportType: 'competitor',
          summary: `${res.result.summary}\n\nGaps:\n- ${(res.result.contentGaps || []).join(
            '\n- '
          )}`,
        });
      }
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Competitor AI analysis failed.');
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <div className="space-y-5">
      <form
        onSubmit={handleLookup}
        className="rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/95 p-4 space-y-3 shadow-sm dark:shadow-none"
      >
        <div>
          <h3 className="font-display text-base font-semibold tracking-wider text-cyan-800 dark:text-cyan-200">
            COMPETITOR INTELLIGENCE
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Fetches live public YouTube channel metrics via YouTube Data API v3 and
            identifies strategic content gaps.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter competitor channel handle, URL, or name (e.g. @Fireship)"
            className="flex-1 min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-3.5 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loadingLookup || !uid}
            className="min-h-[42px] px-4 rounded-xl bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Search className="w-4 h-4" />
            <span>{loadingLookup ? 'Scanning...' : 'Inspect Channel'}</span>
          </button>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={loadingAi || !uid}
            className="min-h-[42px] px-4 rounded-xl border border-emerald-600/35 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/15 text-xs font-semibold text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4" />
            <span>{loadingAi ? 'Analyzing...' : 'AI Counter-Strategy'}</span>
          </button>
        </div>
      </form>

      {compData && (
        <div className="rounded-xl border border-cyan-600/20 dark:border-cyan-500/20 bg-slate-50 dark:bg-[#050A14] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {compData.channel.avatarUrl && (
                <img
                  src={compData.channel.avatarUrl}
                  alt={compData.channel.title}
                  className="w-11 h-11 rounded-full border border-cyan-500/30"
                />
              )}
              <div>
                <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {compData.channel.title}
                </h4>
                <p className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
                  {compData.channel.handle} · Subs{' '}
                  {formatCompactNumber(compData.channel.subscribers)} · Total Views{' '}
                  {formatCompactNumber(compData.channel.totalViews)} · Videos{' '}
                  {formatCompactNumber(compData.channel.videoCount)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {compData.recentVideos.slice(0, 8).map((v) => (
              <div
                key={v.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 py-2 flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-slate-800 dark:text-slate-200 truncate">{v.title}</span>
                <span className="font-mono-hud text-cyan-700 dark:text-cyan-300 shrink-0">
                  {formatCompactNumber(v.views)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis && (
        <div className="rounded-xl border border-emerald-600/25 dark:border-emerald-500/25 bg-slate-50 dark:bg-[#050A14] p-4 space-y-4">
          <div className="space-y-1">
            <h4 className="font-display text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              COMPETITIVE OPPORTUNITY BRIEF
            </h4>
            <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
              {analysis.summary}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] p-3 space-y-1.5">
              <span className="text-[11px] font-mono-hud uppercase text-cyan-700 dark:text-cyan-300">
                Winning Patterns Observed
              </span>
              <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4">
                {(analysis.winningPatterns || []).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] p-3 space-y-1.5">
              <span className="text-[11px] font-mono-hud uppercase text-amber-700 dark:text-amber-300">
                Underserved Content Gaps
              </span>
              <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4">
                {(analysis.contentGaps || []).map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-mono-hud uppercase text-emerald-700 dark:text-emerald-300">
              Recommended Counter-Angles
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {(analysis.recommendedCounterAngles || []).map((c, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] p-3 flex flex-col justify-between gap-2"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {c.title}
                    </p>
                    <p className="text-[11px] font-mono-hud text-cyan-700 dark:text-cyan-300">
                      {c.format}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      {c.whyItCompetes}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onDraftScript(
                        c.title,
                        /short|reel/i.test(c.format) ? 'short' : 'long'
                      )
                    }
                    className="self-end px-2.5 py-1 rounded-md bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-[11px] font-semibold"
                  >
                    Draft Script
                  </button>
                </div>
              ))}
            </div>
          </div>
          {analysis.caveats && (
            <p className="text-[11px] text-slate-500">{analysis.caveats}</p>
          )}
        </div>
      )}
    </div>
  );
};

interface ScriptWriterViewProps {
  uid: string | null;
  aiProvider: AIProviderChoice;
  scripts: CreatorScriptDoc[];
  initialDraft?: { topic: string; format: 'short' | 'long'; hook?: string } | null;
  onClearInitialDraft: () => void;
  onSendToVideoCreator: (payload: {
    title: string;
    format: 'short' | 'long';
    fullScript: string;
    scenes: ScriptSceneItem[];
  }) => void;
  onSendToSeo: (topic: string, scriptBody: string) => void;
  onNotice: (msg: string) => void;
}

export const ScriptWriterView: React.FC<ScriptWriterViewProps> = ({
  uid,
  aiProvider,
  scripts,
  initialDraft,
  onClearInitialDraft,
  onSendToVideoCreator,
  onSendToSeo,
  onNotice,
}) => {
  const [format, setFormat] = useState<'short' | 'long'>(initialDraft?.format || 'short');
  const [platform, setPlatform] = useState('YouTube Shorts / Reels');
  const [topic, setTopic] = useState(initialDraft?.topic || '');
  const [durationTarget, setDurationTarget] = useState(
    initialDraft?.format === 'long' ? '10 minutes' : '35 seconds'
  );
  const [title, setTitle] = useState(initialDraft?.topic || '');
  const [hook, setHook] = useState(initialDraft?.hook || '');
  const [body, setBody] = useState('');
  const [scenes, setScenes] = useState<ScriptSceneItem[]>([]);
  const [hooksList, setHooksList] = useState<
    Array<{ style: string; hookText: string; deliveryTip: string }>
  >([]);
  const [review, setReview] = useState<{
    strengths?: string[];
    issues?: string[];
    improvedHook?: string;
    improvedScript?: string;
  } | null>(null);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (initialDraft) {
      setFormat(initialDraft.format);
      setTopic(initialDraft.topic);
      setTitle(initialDraft.topic);
      if (initialDraft.hook) setHook(initialDraft.hook);
      setPlatform(
        initialDraft.format === 'short' ? 'YouTube Shorts / Instagram Reels' : 'YouTube'
      );
      setDurationTarget(initialDraft.format === 'short' ? '35 seconds' : '10 minutes');
      setEditingId(undefined);
      onClearInitialDraft();
    }
  }, [initialDraft, onClearInitialDraft]);

  const handleModeSwitch = (nextFmt: 'short' | 'long') => {
    setFormat(nextFmt);
    setPlatform(
      nextFmt === 'short' ? 'YouTube Shorts / Instagram Reels' : 'YouTube Long-Form'
    );
    setDurationTarget(nextFmt === 'short' ? '35 seconds' : '10 minutes');
  };

  const handleGenerateScript = async () => {
    if (!uid || !topic.trim()) {
      onNotice('Enter a video topic first.');
      return;
    }
    setBusyTask('script');
    try {
      const res = await creatorFetchJson<{
        result: {
          title: string;
          hook: string;
          fullScript: string;
          scenes: ScriptSceneItem[];
          retentionNotes?: string;
        };
      }>('/api/creator/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          task: 'script',
          provider: aiProvider,
          payload: {
            topic: topic.trim(),
            format,
            platform,
            duration: durationTarget,
          },
        }),
      });
      setTitle(res.result.title || topic);
      setHook(res.result.hook || '');
      setBody(res.result.fullScript || '');
      setScenes(Array.isArray(res.result.scenes) ? res.result.scenes : []);
      setReview(null);
      onNotice('Structured script and scene breakdown generated.');
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Script generation failed.');
    } finally {
      setBusyTask(null);
    }
  };

  const handleGenerateHooks = async () => {
    if (!uid || !topic.trim()) return;
    setBusyTask('hooks');
    try {
      const res = await creatorFetchJson<{
        result: Array<{ style: string; hookText: string; deliveryTip: string }>;
      }>('/api/creator/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          task: 'hooks',
          provider: aiProvider,
          payload: { topic: topic.trim(), format },
        }),
      });
      setHooksList(Array.isArray(res.result) ? res.result : []);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Hook generator failed.');
    } finally {
      setBusyTask(null);
    }
  };

  const handleQualityOrImprove = async (task: 'quality_review' | 'improve_script') => {
    if (!uid || !body.trim()) return;
    setBusyTask(task);
    try {
      const res = await creatorFetchJson<{
        result: {
          strengths?: string[];
          issues?: string[];
          improvedHook?: string;
          improvedScript?: string;
        };
      }>('/api/creator/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          task,
          provider: aiProvider,
          payload: { script: `${hook}\n\n${body}`, format },
        }),
      });
      setReview(res.result);
      if (task === 'improve_script' && res.result.improvedScript) {
        if (res.result.improvedHook) setHook(res.result.improvedHook);
        setBody(res.result.improvedScript);
        onNotice('Script strengthened with AI polish.');
      }
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Review failed.');
    } finally {
      setBusyTask(null);
    }
  };

  const handleSaveScript = async () => {
    if (!uid || !title.trim() || !body.trim()) {
      onNotice('Script title and body are required to save.');
      return;
    }
    const id = await saveCreatorScript(
      uid,
      {
        title,
        format,
        platform,
        durationTarget,
        hook,
        body,
        scenesJson: JSON.stringify(scenes),
        aiProvider,
      },
      editingId
    );
    setEditingId(id);
    onNotice('Script saved to Firestore library.');
  };

  const handleLoadScript = (s: CreatorScriptDoc) => {
    setEditingId(s.id);
    setTitle(s.title);
    setTopic(s.title);
    setFormat(s.format);
    setPlatform(s.platform || (s.format === 'short' ? 'YouTube Shorts / Reels' : 'YouTube'));
    setDurationTarget(s.durationTarget || (s.format === 'short' ? '35 seconds' : '10 minutes'));
    setHook(s.hook || '');
    setBody(s.body);
    try {
      setScenes(s.scenesJson ? (JSON.parse(s.scenesJson) as ScriptSceneItem[]) : []);
    } catch {
      setScenes([]);
    }
  };

  return (
    <div className="space-y-5">
      {/* Mode Selector: Short-Form vs Long-Form */}
      <div className="rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/95 p-4 space-y-4 shadow-sm dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold tracking-wider text-cyan-800 dark:text-cyan-200">
              SHORTS & LONG-FORM SCRIPT ARCHITECT
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Separate narrative engines: Short-Form builds punchy vertical hooks; Long-Form
              builds chaptered deep-dives — never auto-slicing long videos into shorts.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#050A14] p-1">
            <button
              type="button"
              onClick={() => handleModeSwitch('short')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                format === 'short'
                  ? 'bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950'
                  : 'text-slate-700 dark:text-slate-300 hover:text-cyan-700 dark:hover:text-cyan-200'
              }`}
            >
              Short-Form (9:16)
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('long')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                format === 'long'
                  ? 'bg-emerald-600 dark:bg-emerald-400 text-white dark:text-slate-950'
                  : 'text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-200'
              }`}
            >
              Long-Form (16:9)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Video topic or title concept..."
            className="sm:col-span-2 min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
          />
          <input
            type="text"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            placeholder="Target Platform"
            className="min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-3 text-xs text-slate-800 dark:text-slate-200 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
          />
          <input
            type="text"
            value={durationTarget}
            onChange={(e) => setDurationTarget(e.target.value)}
            placeholder="Duration (e.g. 35s / 10m)"
            className="min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-3 text-xs text-slate-800 dark:text-slate-200 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGenerateScript}
            disabled={busyTask !== null || !uid}
            className="min-h-[38px] px-4 rounded-xl bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {busyTask === 'script'
                ? 'Architecting Script...'
                : `Generate ${format === 'short' ? 'Short-Form' : 'Long-Form'} Script`}
            </span>
          </button>
          <button
            type="button"
            onClick={handleGenerateHooks}
            disabled={busyTask !== null || !uid}
            className="min-h-[38px] px-3.5 rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-xs font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-500/20 inline-flex items-center gap-1.5"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>{busyTask === 'hooks' ? 'Generating Hooks...' : 'Hook Generator (6x)'}</span>
          </button>
          <button
            type="button"
            onClick={() => handleQualityOrImprove('quality_review')}
            disabled={busyTask !== null || !body.trim()}
            className="min-h-[38px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#050A14] text-xs text-slate-800 dark:text-slate-200 hover:border-cyan-500/50 disabled:opacity-40"
          >
            {busyTask === 'quality_review' ? 'Reviewing...' : 'AI Quality Check'}
          </button>
          <button
            type="button"
            onClick={() => handleQualityOrImprove('improve_script')}
            disabled={busyTask !== null || !body.trim()}
            className="min-h-[38px] px-3.5 rounded-xl border border-emerald-600/35 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-xs text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-40"
          >
            {busyTask === 'improve_script' ? 'Polishing...' : 'Improve Retention'}
          </button>
        </div>
      </div>

      {/* Hooks Picker */}
      {hooksList.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 dark:border-amber-500/25 bg-slate-50 dark:bg-[#050A14] p-4 space-y-2.5">
          <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            OPENING HOOK VARIATIONS (CLICK TO APPLY)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {hooksList.map((h, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setHook(h.hookText)}
                className="text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] p-3 hover:border-amber-400/60 space-y-1"
              >
                <span className="text-[10px] font-mono-hud uppercase text-amber-700 dark:text-amber-300">
                  {h.style}
                </span>
                <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                  {h.hookText}
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  {h.deliveryTip}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Script Editor & Handoff */}
      <div className="rounded-xl border border-cyan-600/20 dark:border-cyan-500/20 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Working Script Title"
            className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100"
          />
          <input
            type="text"
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="Opening Hook (0–3s)"
            className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-cyan-800 dark:text-cyan-200"
          />
        </div>

        <textarea
          rows={9}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Spoken narration & production script..."
          className="w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] p-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 leading-relaxed focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
            {scenes.length} visual scenes mapped · {body.split(/\s+/).filter(Boolean).length}{' '}
            words
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveScript}
              disabled={!uid || !body.trim()}
              className="min-h-[36px] px-3.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#08101E] text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-cyan-500/50 disabled:opacity-40"
            >
              Save Script
            </button>
            <button
              type="button"
              onClick={() => onSendToSeo(title || topic, body)}
              disabled={!body.trim()}
              className="min-h-[36px] px-3.5 rounded-lg border border-cyan-600/35 dark:border-cyan-500/40 bg-cyan-50 dark:bg-cyan-500/10 text-xs font-medium text-cyan-800 dark:text-cyan-200 inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Send to SEO</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onSendToVideoCreator({
                  title: title || topic || 'New Creator Production',
                  format,
                  fullScript: `${hook ? `${hook}\n\n` : ''}${body}`,
                  scenes,
                })
              }
              disabled={!body.trim()}
              className="min-h-[36px] px-4 rounded-lg bg-emerald-600 dark:bg-emerald-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-emerald-500 dark:hover:bg-emerald-300 inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <Film className="w-3.5 h-3.5" />
              <span>Produce in AI Video Creator</span>
            </button>
          </div>
        </div>
      </div>

      {review && (
        <div className="rounded-xl border border-emerald-600/25 dark:border-emerald-500/25 bg-slate-50 dark:bg-[#050A14] p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <span className="font-mono-hud uppercase text-emerald-700 dark:text-emerald-300">
              Strengths
            </span>
            <ul className="mt-1 space-y-1 text-slate-700 dark:text-slate-300 list-disc pl-4">
              {(review.strengths || []).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <span className="font-mono-hud uppercase text-amber-700 dark:text-amber-300">
              Improvements Suggested
            </span>
            <ul className="mt-1 space-y-1 text-slate-700 dark:text-slate-300 list-disc pl-4">
              {(review.issues || []).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Saved Scripts Library */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-4 space-y-2.5">
        <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          SAVED SCRIPTS ({scripts.length})
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {scripts.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] p-3 flex items-center justify-between gap-2"
            >
              <button
                type="button"
                onClick={() => handleLoadScript(s)}
                className="text-left min-w-0 flex-1"
              >
                <p className="text-xs font-semibold text-cyan-800 dark:text-cyan-200 truncate">
                  {s.title}
                </p>
                <p className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
                  {s.format === 'short' ? 'Short-Form (9:16)' : 'Long-Form (16:9)'} ·{' '}
                  {s.durationTarget || 'Custom'}
                </p>
              </button>
              <button
                type="button"
                onClick={() => uid && deleteCreatorScript(uid, s.id)}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 shrink-0"
                aria-label="Delete script"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface ContentCalendarViewProps {
  uid: string | null;
  aiProvider: AIProviderChoice;
  niche: string;
  ideas: CreatorIdeaDoc[];
  youtubeData: YouTubeAnalyticsPayload | null;
  calendar: CreatorCalendarDoc[];
  onNotice: (msg: string) => void;
}

export const ContentCalendarView: React.FC<ContentCalendarViewProps> = ({
  uid,
  aiProvider,
  niche,
  ideas,
  youtubeData,
  calendar,
  onNotice,
}) => {
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState('youtube');
  const [format, setFormat] = useState<'short' | 'long' | 'post'>('short');
  const [scheduledDate, setScheduledDate] = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !title.trim()) return;
    await addCreatorCalendarEntry(uid, {
      title: title.trim(),
      platform,
      format,
      scheduledDate,
      status: 'planned',
      notes,
    });
    setTitle('');
    setNotes('');
    onNotice('Added entry to Content Calendar.');
  };

  const handleAiPlan = async (days: number) => {
    if (!uid) return;
    setAiBusy(true);
    try {
      const res = await creatorFetchJson<{
        result: Array<{
          title: string;
          platform: string;
          format: 'short' | 'long' | 'post';
          scheduledDate: string;
          notes?: string;
        }>;
      }>('/api/creator/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          task: 'calendar_plan',
          provider: aiProvider,
          payload: {
            days,
            niche,
            ideas: ideas.slice(0, 6).map((i) => i.topic),
            channelSummary: youtubeData?.formatComparison || {},
          },
        }),
      });
      const items = Array.isArray(res.result) ? res.result : [];
      for (const item of items) {
        await addCreatorCalendarEntry(uid, {
          title: item.title,
          platform: item.platform || 'youtube',
          format: item.format || 'short',
          scheduledDate: item.scheduledDate || new Date().toISOString().slice(0, 10),
          status: 'planned',
          notes: item.notes,
        });
      }
      onNotice(`Added ${items.length} AI-planned slots to your calendar.`);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Calendar planning failed.');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/95 p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm dark:shadow-none">
        <div>
          <h3 className="font-display text-base font-semibold tracking-wider text-cyan-800 dark:text-cyan-200">
            CONTENT CALENDAR & PRODUCTION SCHEDULE
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Coordinate Shorts, Reels, Long-form uploads, and cross-platform posts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleAiPlan(1)}
            disabled={aiBusy || !uid}
            className="min-h-[36px] px-3 rounded-lg border border-cyan-600/35 dark:border-cyan-500/40 bg-cyan-50 dark:bg-cyan-500/15 text-xs font-medium text-cyan-800 dark:text-cyan-200"
          >
            Plan Tomorrow
          </button>
          <button
            type="button"
            onClick={() => handleAiPlan(7)}
            disabled={aiBusy || !uid}
            className="min-h-[36px] px-3.5 rounded-lg bg-emerald-600 dark:bg-emerald-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-emerald-500 dark:hover:bg-emerald-300 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{aiBusy ? 'Scheduling...' : 'AI 7-Day Plan'}</span>
          </button>
        </div>
      </div>

      <form
        onSubmit={handleAdd}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-4 grid grid-cols-1 sm:grid-cols-6 gap-2.5"
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Content title..."
          className="sm:col-span-2 min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 text-xs text-slate-900 dark:text-slate-100"
        />
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-2.5 text-xs text-slate-800 dark:text-slate-200"
        >
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="telegram">Telegram</option>
          <option value="x">X</option>
          <option value="linkedin">LinkedIn</option>
        </select>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as 'short' | 'long' | 'post')}
          className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-2.5 text-xs text-slate-800 dark:text-slate-200"
        >
          <option value="short">Short / Reel</option>
          <option value="long">Long-Form</option>
          <option value="post">Post</option>
        </select>
        <input
          type="date"
          value={scheduledDate}
          onChange={(e) => setScheduledDate(e.target.value)}
          className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-2.5 text-xs text-slate-800 dark:text-slate-200"
        />
        <button
          type="submit"
          disabled={!uid || !title.trim()}
          className="min-h-[38px] rounded-lg bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 inline-flex items-center justify-center gap-1"
        >
          <CalendarPlus className="w-3.5 h-3.5" />
          <span>Add Slot</span>
        </button>
      </form>

      <div className="space-y-2">
        {calendar.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3.5 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono-hud text-cyan-700 dark:text-cyan-300">
                  {item.scheduledDate}
                </span>
                <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                  {item.title}
                </span>
              </div>
              <p className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400 mt-0.5">
                {item.platform.toUpperCase()} · {item.format.toUpperCase()}
                {item.notes ? ` · ${item.notes}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={item.status}
                onChange={(e) =>
                  uid &&
                  updateCreatorCalendarEntry(uid, item.id, {
                    status: e.target.value as CreatorCalendarDoc['status'],
                  })
                }
                className="min-h-[34px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#08101E] px-2.5 text-xs text-slate-800 dark:text-slate-200"
              >
                <option value="planned">Planned</option>
                <option value="in_production">In Production</option>
                <option value="scheduled">Scheduled</option>
                <option value="published">Published</option>
              </select>
              {item.status !== 'published' && (
                <button
                  type="button"
                  onClick={() =>
                    uid && updateCreatorCalendarEntry(uid, item.id, { status: 'published' })
                  }
                  className="p-2 rounded-lg text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                  aria-label="Mark published"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => uid && deleteCreatorCalendarEntry(uid, item.id)}
                className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                aria-label="Delete slot"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {calendar.length === 0 && (
          <p className="text-xs text-slate-500">No calendar entries scheduled yet.</p>
        )}
      </div>
    </div>
  );
};
