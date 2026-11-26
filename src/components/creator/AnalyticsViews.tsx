import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Camera,
  Download,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { creatorFetchJson } from '../../lib/creatorApi';
import {
  deleteCreatorReport,
  saveCreatorReport,
  saveCreatorSnapshot,
} from '../../lib/creatorFirebase';
import type {
  AIProviderChoice,
  CreatorPostDoc,
  CreatorReportDoc,
  CreatorSnapshotDoc,
  FacebookAnalyticsPayload,
  InstagramAnalyticsPayload,
  YouTubeAnalyticsPayload,
} from '../../types/creator';
import {
  DailyPerformanceChart,
  FormatComparisonPanel,
  MetricTile,
  TrafficSourcesBarChart,
  formatCompactNumber,
  formatDurationSec,
} from './CreatorCharts';

interface YouTubeAnalyticsViewProps {
  uid: string | null;
  data: YouTubeAnalyticsPayload | null;
  snapshots: CreatorSnapshotDoc[];
  loading: boolean;
  error: string | null;
  range: '7d' | '28d' | '90d' | 'custom';
  customStart: string;
  customEnd: string;
  onChangeRange: (r: '7d' | '28d' | '90d' | 'custom') => void;
  onChangeCustomDates: (start: string, end: string) => void;
  onFetch: () => Promise<void>;
  onGoConnect: () => void;
  onNotice: (msg: string) => void;
}

export const YouTubeAnalyticsView: React.FC<YouTubeAnalyticsViewProps> = ({
  uid,
  data,
  snapshots,
  loading,
  error,
  range,
  customStart,
  customEnd,
  onChangeRange,
  onChangeCustomDates,
  onFetch,
  onGoConnect,
  onNotice,
}) => {
  const [savingSnap, setSavingSnap] = useState(false);

  const ytSnapshots = useMemo(
    () => snapshots.filter((s) => s.platform === 'youtube'),
    [snapshots]
  );

  const previousSnapshot = ytSnapshots[0];
  const viewsDelta = useMemo(() => {
    if (
      !data ||
      data.metrics.views === null ||
      previousSnapshot?.views === undefined ||
      previousSnapshot.views === 0
    ) {
      return null;
    }
    const pct = ((data.metrics.views - previousSnapshot.views) / previousSnapshot.views) * 100;
    return {
      label: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs snap`,
      positive: pct >= 0,
    };
  }, [data, previousSnapshot]);

  const handleSaveSnapshot = async () => {
    if (!uid || !data) return;
    setSavingSnap(true);
    try {
      await saveCreatorSnapshot(uid, {
        platform: 'youtube',
        dateRange: `${data.dateRange.range} (${data.dateRange.startDate} to ${data.dateRange.endDate})`,
        views: data.metrics.views,
        subscribers: data.metrics.subscribers,
        watchTimeMinutes: data.metrics.watchTimeMinutes,
        summaryJson: JSON.stringify({
          channelTitle: data.channel.title,
          metrics: data.metrics,
          formatComparison: data.formatComparison,
        }),
      });
      onNotice('YouTube analytics snapshot archived to Firestore.');
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Snapshot save failed.');
    } finally {
      setSavingSnap(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filter & Actions Bar */}
      <div className="rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/95 p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm dark:shadow-none">
        <div>
          <h3 className="font-display text-base font-semibold tracking-wider text-cyan-800 dark:text-cyan-200">
            YOUTUBE ANALYTICS ENGINE
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            YouTube Data API v3 + YouTube Analytics v2 · Unavailable metrics are explicitly
            labeled and never coerced to 0
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#050A14] p-0.5">
            {(['7d', '28d', '90d', 'custom'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onChangeRange(r)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium uppercase whitespace-nowrap transition-colors ${
                  range === r
                    ? 'bg-cyan-600/15 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-200'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {range === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customStart}
                onChange={(e) => onChangeCustomDates(e.target.value, customEnd)}
                className="min-h-[34px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#050A14] px-2 text-xs text-slate-900 dark:text-slate-200"
              />
              <span className="text-xs text-slate-500">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => onChangeCustomDates(customStart, e.target.value)}
                className="min-h-[34px] rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#050A14] px-2 text-xs text-slate-900 dark:text-slate-200"
              />
            </div>
          )}

          <button
            type="button"
            onClick={onFetch}
            disabled={loading}
            className="min-h-[36px] px-3.5 rounded-lg bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Querying...' : 'Sync YouTube'}</span>
          </button>

          {data && (
            <button
              type="button"
              onClick={handleSaveSnapshot}
              disabled={savingSnap || !uid}
              className="min-h-[36px] px-3 rounded-lg border border-emerald-600/35 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/15 text-xs font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{savingSnap ? 'Saving...' : 'Save Snapshot'}</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/25 p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={onGoConnect}
            className="px-3 py-1.5 rounded-lg bg-amber-500 dark:bg-amber-400 text-white dark:text-slate-950 font-semibold"
          >
            Connect YouTube
          </button>
        </div>
      )}

      {!data && !loading && !error && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-8 text-center space-y-3">
          <BarChart3 className="w-8 h-8 text-cyan-600 dark:text-cyan-400 mx-auto" />
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Click{' '}
            <span className="text-cyan-700 dark:text-cyan-300 font-semibold">
              Sync YouTube
            </span>{' '}
            to pull channel metrics, traffic sources, Shorts vs Long-form breakdown, and
            retention curves.
          </p>
        </div>
      )}

      {data && (
        <>
          {data.analyticsNote && (
            <div className="rounded-xl border border-cyan-600/25 dark:border-cyan-500/25 bg-slate-50 dark:bg-[#050A14] px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300">
              {data.analyticsNote}
            </div>
          )}

          {/* Core KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <MetricTile
              label="Period Views"
              value={formatCompactNumber(data.metrics.views)}
              unavailable={data.metrics.views === null}
              delta={viewsDelta?.label}
              deltaPositive={viewsDelta?.positive}
            />
            <MetricTile
              label="Subscribers"
              value={formatCompactNumber(data.metrics.subscribers)}
              subValue={
                data.metrics.subscriberGrowth !== null
                  ? `${data.metrics.subscriberGrowth >= 0 ? '+' : ''}${
                      data.metrics.subscriberGrowth
                    } period`
                  : undefined
              }
              unavailable={data.metrics.subscribers === null}
            />
            <MetricTile
              label="Watch Time (min)"
              value={formatCompactNumber(data.metrics.watchTimeMinutes)}
              unavailable={data.metrics.watchTimeMinutes === null}
            />
            <MetricTile
              label="Avg View Duration"
              value={formatDurationSec(data.metrics.averageViewDurationSec)}
              subValue={
                data.metrics.audienceRetentionPct !== null
                  ? `${data.metrics.audienceRetentionPct}% retention`
                  : undefined
              }
              unavailable={data.metrics.averageViewDurationSec === null}
            />
            <MetricTile
              label="Impressions · CTR"
              value={
                data.metrics.impressions !== null
                  ? formatCompactNumber(data.metrics.impressions)
                  : 'Unavailable'
              }
              subValue={
                data.metrics.ctrPercent !== null
                  ? `${data.metrics.ctrPercent}% CTR`
                  : 'CTR Unavailable'
              }
              unavailable={data.metrics.impressions === null}
            />
          </div>

          <DailyPerformanceChart series={data.dailySeries} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TrafficSourcesBarChart sources={data.trafficSources} />
            <FormatComparisonPanel comparison={data.formatComparison} />
          </div>

          {/* Top & Underperforming Videos Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-emerald-600/25 dark:border-emerald-500/25 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3">
              <h4 className="font-display text-sm font-semibold text-emerald-700 dark:text-emerald-300 tracking-wide">
                TOP PERFORMING VIDEOS
              </h4>
              <div className="space-y-2">
                {data.topVideos.map((v) => (
                  <div
                    key={v.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#08101E] p-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {v.title}
                      </p>
                      <p className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
                        {v.format === 'short' ? 'Short' : 'Long-form'} ·{' '}
                        {formatDurationSec(v.durationSec)} · Likes{' '}
                        {formatCompactNumber(v.likes)}
                      </p>
                    </div>
                    <span className="font-mono-hud text-xs font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
                      {formatCompactNumber(v.views)} views
                    </span>
                  </div>
                ))}
                {data.topVideos.length === 0 && (
                  <p className="text-xs text-slate-500">No uploaded videos returned.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/30 dark:border-amber-500/25 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3">
              <h4 className="font-display text-sm font-semibold text-amber-700 dark:text-amber-300 tracking-wide">
                UNDERPERFORMING VIDEOS (OPPORTUNITY REVIEW)
              </h4>
              <div className="space-y-2">
                {data.underperformingVideos.map((v) => (
                  <div
                    key={v.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#08101E] p-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {v.title}
                      </p>
                      <p className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
                        {v.format === 'short' ? 'Short' : 'Long-form'} · Comments{' '}
                        {formatCompactNumber(v.comments)}
                      </p>
                    </div>
                    <span className="font-mono-hud text-xs font-semibold text-amber-700 dark:text-amber-300 shrink-0">
                      {formatCompactNumber(v.views)} views
                    </span>
                  </div>
                ))}
                {data.underperformingVideos.length === 0 && (
                  <p className="text-xs text-slate-500">No uploaded videos returned.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Historical Snapshots Log */}
      {ytSnapshots.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-4 space-y-2.5">
          <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            HISTORICAL SNAPSHOTS ({ytSnapshots.length})
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {ytSnapshots.slice(0, 6).map((snap) => (
              <div
                key={snap.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3 py-2 text-xs space-y-0.5"
              >
                <div className="font-mono-hud text-[11px] text-cyan-700 dark:text-cyan-300 truncate">
                  {snap.dateRange}
                </div>
                <div className="font-mono-hud text-slate-800 dark:text-slate-200">
                  Views: {formatCompactNumber(snap.views ?? null)} · Subs:{' '}
                  {formatCompactNumber(snap.subscribers ?? null)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface InstagramAnalyticsViewProps {
  uid: string | null;
  data: InstagramAnalyticsPayload | null;
  loading: boolean;
  error: string | null;
  onFetch: () => Promise<void>;
  onGoConnect: () => void;
  onNotice: (msg: string) => void;
}

export const InstagramAnalyticsView: React.FC<InstagramAnalyticsViewProps> = ({
  uid,
  data,
  loading,
  error,
  onFetch,
  onGoConnect,
  onNotice,
}) => {
  const handleSnapshot = async () => {
    if (!uid || !data) return;
    await saveCreatorSnapshot(uid, {
      platform: 'instagram',
      dateRange: 'daily_insights',
      views: data.metrics.views ?? data.metrics.reach ?? null,
      subscribers: data.profile.followers ?? null,
      summaryJson: JSON.stringify({ profile: data.profile, metrics: data.metrics }),
    });
    onNotice('Instagram snapshot archived.');
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/95 p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm dark:shadow-none">
        <div>
          <h3 className="font-display text-base font-semibold tracking-wider text-cyan-800 dark:text-cyan-200">
            INSTAGRAM BUSINESS & REELS ANALYTICS
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Meta Graph API · Live Reach, Views, Followers & Media Engagement
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onFetch}
            disabled={loading}
            className="min-h-[36px] px-3.5 rounded-lg bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Syncing...' : 'Sync Instagram'}</span>
          </button>
          {data && (
            <button
              type="button"
              onClick={handleSnapshot}
              disabled={!uid}
              className="min-h-[36px] px-3 rounded-lg border border-emerald-600/35 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/15 text-xs text-emerald-800 dark:text-emerald-200"
            >
              Save Snapshot
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/25 p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={onGoConnect}
            className="px-3 py-1.5 rounded-lg bg-amber-500 dark:bg-amber-400 text-white dark:text-slate-950 font-semibold"
          >
            Connect Instagram
          </button>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricTile
              label="Followers"
              value={formatCompactNumber(data.profile.followers)}
              subValue={`@${data.profile.username}`}
              unavailable={data.profile.followers === null}
            />
            <MetricTile
              label="Reach"
              value={formatCompactNumber(data.metrics.reach)}
              unavailable={data.metrics.reach === null}
            />
            <MetricTile
              label="Views"
              value={formatCompactNumber(data.metrics.views)}
              unavailable={data.metrics.views === null}
            />
            <MetricTile
              label="Profile Views"
              value={formatCompactNumber(data.metrics.profileViews)}
              subValue={`${formatCompactNumber(data.profile.mediaCount)} posts`}
              unavailable={data.metrics.profileViews === null}
            />
          </div>

          <div className="rounded-xl border border-cyan-600/20 dark:border-cyan-500/20 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3">
            <h4 className="font-display text-sm font-semibold text-cyan-800 dark:text-cyan-200">
              RECENT REELS & POSTS
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {data.media.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs text-slate-900 dark:text-slate-100 line-clamp-2">
                      {m.caption || '(No caption)'}
                    </p>
                    <p className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
                      {m.media_product_type || m.media_type} · Likes{' '}
                      {formatCompactNumber(m.like_count ?? null)} · Comments{' '}
                      {formatCompactNumber(m.comments_count ?? null)}
                    </p>
                  </div>
                  {m.permalink && (
                    <a
                      href={m.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-700 dark:text-cyan-300 hover:text-cyan-600 dark:hover:text-cyan-200 shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
              {data.media.length === 0 && (
                <p className="text-xs text-slate-500">No media returned.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

interface FacebookAnalyticsViewProps {
  uid: string | null;
  data: FacebookAnalyticsPayload | null;
  loading: boolean;
  error: string | null;
  onFetch: () => Promise<void>;
  onGoConnect: () => void;
  onNotice: (msg: string) => void;
}

export const FacebookAnalyticsView: React.FC<FacebookAnalyticsViewProps> = ({
  uid,
  data,
  loading,
  error,
  onFetch,
  onGoConnect,
  onNotice,
}) => {
  const handleSnapshot = async () => {
    if (!uid || !data) return;
    await saveCreatorSnapshot(uid, {
      platform: 'facebook',
      dateRange: '28d',
      views: data.metrics.impressions28d ?? null,
      subscribers: data.page.followers ?? null,
      summaryJson: JSON.stringify({ page: data.page, metrics: data.metrics }),
    });
    onNotice('Facebook Page snapshot archived.');
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/95 p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm dark:shadow-none">
        <div>
          <h3 className="font-display text-base font-semibold tracking-wider text-cyan-800 dark:text-cyan-200">
            FACEBOOK PAGE & REELS ANALYTICS
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Meta Graph API v21 · Page Followers, 28-Day Impressions & Video Performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onFetch}
            disabled={loading}
            className="min-h-[36px] px-3.5 rounded-lg bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Syncing...' : 'Sync Facebook'}</span>
          </button>
          {data && (
            <button
              type="button"
              onClick={handleSnapshot}
              disabled={!uid}
              className="min-h-[36px] px-3 rounded-lg border border-emerald-600/35 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/15 text-xs text-emerald-800 dark:text-emerald-200"
            >
              Save Snapshot
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/25 p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={onGoConnect}
            className="px-3 py-1.5 rounded-lg bg-amber-500 dark:bg-amber-400 text-white dark:text-slate-950 font-semibold"
          >
            Connect Facebook Page
          </button>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricTile
              label="Page Followers"
              value={formatCompactNumber(data.page.followers)}
              subValue={data.page.name}
              unavailable={data.page.followers === null}
            />
            <MetricTile
              label="28d Impressions"
              value={formatCompactNumber(data.metrics.impressions28d)}
              unavailable={data.metrics.impressions28d === null}
            />
            <MetricTile
              label="28d Engagements"
              value={formatCompactNumber(data.metrics.engagements28d)}
              unavailable={data.metrics.engagements28d === null}
            />
            <MetricTile
              label="28d Page Views"
              value={formatCompactNumber(data.metrics.pageViews28d)}
              unavailable={data.metrics.pageViews28d === null}
            />
          </div>

          <div className="rounded-xl border border-cyan-600/20 dark:border-cyan-500/20 bg-slate-50 dark:bg-[#050A14] p-4 space-y-2.5">
            <h4 className="font-display text-sm font-semibold text-cyan-800 dark:text-cyan-200">
              RECENT PAGE VIDEOS
            </h4>
            <div className="space-y-2">
              {data.videos.map((v) => (
                <div
                  key={v.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                      {v.title || v.description || 'Facebook Video'}
                    </p>
                    <p className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
                      Duration {formatDurationSec(v.length ?? null)} · Views{' '}
                      {formatCompactNumber(v.views ?? null)}
                    </p>
                  </div>
                  {v.permalink_url && (
                    <a
                      href={`https://www.facebook.com${v.permalink_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-700 dark:text-cyan-300 hover:text-cyan-600 dark:hover:text-cyan-200 shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
              {data.videos.length === 0 && (
                <p className="text-xs text-slate-500">No Page videos returned.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

interface PerformanceReportsViewProps {
  uid: string | null;
  aiProvider: AIProviderChoice;
  niche: string;
  youtubeData: YouTubeAnalyticsPayload | null;
  snapshots: CreatorSnapshotDoc[];
  posts: CreatorPostDoc[];
  reports: CreatorReportDoc[];
  onNotice: (msg: string) => void;
}

export const PerformanceReportsView: React.FC<PerformanceReportsViewProps> = ({
  uid,
  aiProvider,
  niche,
  youtubeData,
  snapshots,
  posts,
  reports,
  onNotice,
}) => {
  const [generating, setGenerating] = useState(false);
  const [activeReport, setActiveReport] = useState<{
    title: string;
    summary: string;
    modelUsed?: string;
  } | null>(null);

  const handleGenerateReport = async () => {
    if (!uid) return;
    setGenerating(true);
    try {
      const res = await creatorFetchJson<{
        result: string;
        modelUsed: string;
      }>('/api/creator/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          task: 'performance_report',
          provider: aiProvider,
          payload: {
            niche,
            channelSummary: youtubeData
              ? {
                  channel: youtubeData.channel,
                  metrics: youtubeData.metrics,
                  formatComparison: youtubeData.formatComparison,
                }
              : {},
            snapshots: snapshots.slice(0, 10),
            posts: posts.slice(0, 10),
          },
        }),
      });
      const title = `Creator Intelligence Report · ${new Date().toISOString().slice(0, 10)}`;
      setActiveReport({ title, summary: res.result, modelUsed: res.modelUsed });
      await saveCreatorReport(uid, {
        title,
        reportType: 'performance',
        summary: res.result,
      });
      onNotice('Performance report generated and saved to archive.');
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Report generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const downloadMarkdown = (title: string, body: string) => {
    const blob = new Blob([`# ${title}\n\n${body}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-cyan-600/25 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/95 p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm dark:shadow-none">
        <div>
          <h3 className="font-display text-base font-semibold tracking-wider text-cyan-800 dark:text-cyan-200">
            PERFORMANCE & STRATEGY REPORTS
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Synthesizes channel analytics, historical snapshots, and published post history
            into actionable reports
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerateReport}
          disabled={generating || !uid}
          className="min-h-[38px] px-4 rounded-xl bg-cyan-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-xs font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{generating ? 'Synthesizing...' : 'Generate Performance Report'}</span>
        </button>
      </div>

      {activeReport && (
        <div className="rounded-xl border border-emerald-600/30 dark:border-emerald-500/30 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-display text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                {activeReport.title}
              </h4>
              {activeReport.modelUsed && (
                <span className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
                  Generated by {activeReport.modelUsed}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => downloadMarkdown(activeReport.title, activeReport.summary)}
              className="min-h-[34px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#08101E] text-xs text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .MD</span>
            </button>
          </div>
          <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
            {activeReport.summary}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3">
        <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          ARCHIVED REPORTS ({reports.length})
        </h4>
        <div className="space-y-2.5">
          {reports.map((rep) => (
            <div
              key={rep.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] p-3 flex items-start justify-between gap-3"
            >
              <button
                type="button"
                onClick={() =>
                  setActiveReport({ title: rep.title, summary: rep.summary })
                }
                className="text-left min-w-0 flex-1"
              >
                <p className="text-xs font-semibold text-cyan-800 dark:text-cyan-200 truncate">
                  {rep.title}
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5">
                  {rep.summary}
                </p>
              </button>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => downloadMarkdown(rep.title, rep.summary)}
                  className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-300"
                  aria-label="Download report"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => uid && deleteCreatorReport(uid, rep.id)}
                  className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                  aria-label="Delete report"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {reports.length === 0 && (
            <p className="text-xs text-slate-500">No archived reports yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};
