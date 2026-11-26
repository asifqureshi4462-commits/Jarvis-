import React, { useState } from 'react';
import type { YouTubeAnalyticsPayload } from '../../types/creator';

export function formatCompactNumber(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return 'Unavailable';
  if (val === 0) return '0';
  return new Intl.NumberFormat('en-US', {
    notation: Math.abs(val) >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(val);
}

export function formatDurationSec(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return 'Unavailable';
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${String(rem).padStart(2, '0')}`;
}

interface MetricTileProps {
  label: string;
  value: string;
  subValue?: string;
  unavailable?: boolean;
  delta?: string | null;
  deltaPositive?: boolean;
}

export const MetricTile: React.FC<MetricTileProps> = ({
  label,
  value,
  subValue,
  unavailable,
  delta,
  deltaPositive,
}) => {
  return (
    <div className="rounded-xl border border-cyan-600/20 dark:border-cyan-500/20 bg-slate-50 dark:bg-[#050A14] p-3.5 flex flex-col justify-between gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono-hud uppercase tracking-wider text-slate-600 dark:text-slate-400">
          {label}
        </span>
        {delta && (
          <span
            className={`text-[11px] font-mono-hud ${
              deltaPositive
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-amber-700 dark:text-amber-300'
            }`}
          >
            {delta}
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`font-mono-hud text-xl sm:text-2xl font-semibold tracking-tight ${
            unavailable ? 'text-slate-500 text-base' : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {value}
        </span>
        {subValue && (
          <span className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
            {subValue}
          </span>
        )}
      </div>
    </div>
  );
};

interface DailyPerformanceChartProps {
  series: YouTubeAnalyticsPayload['dailySeries'];
}

export const DailyPerformanceChart: React.FC<DailyPerformanceChartProps> = ({
  series,
}) => {
  const [metric, setMetric] = useState<'views' | 'watchTimeMinutes' | 'subscribersNet'>(
    'views'
  );
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!series || series.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-6 text-center text-xs text-slate-600 dark:text-slate-400">
        No daily time-series rows were returned for the selected date range.
      </div>
    );
  }

  const width = 680;
  const height = 210;
  const padL = 48;
  const padR = 16;
  const padT = 18;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const values = series.map((d) => Number(d[metric] ?? 0));
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(1, ...values);
  const range = maxVal - minVal || 1;

  const points = series.map((d, i) => {
    const x =
      series.length === 1
        ? padL + innerW / 2
        : padL + (i / (series.length - 1)) * innerW;
    const y = padT + innerH - ((Number(d[metric] ?? 0) - minVal) / range) * innerH;
    return { x, y, item: d, val: Number(d[metric] ?? 0) };
  });

  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(
    padT + innerH
  ).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  const activePoint =
    hoverIdx !== null && points[hoverIdx] ? points[hoverIdx] : points[points.length - 1];

  const metricLabel =
    metric === 'views'
      ? 'Views'
      : metric === 'watchTimeMinutes'
        ? 'Watch Time (min)'
        : 'Net Subscribers';

  return (
    <div className="rounded-xl border border-cyan-600/20 dark:border-cyan-500/20 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-display text-sm font-semibold text-cyan-800 dark:text-cyan-200 tracking-wide">
            DAILY PERFORMANCE TRAJECTORY
          </h4>
          <p className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
            {activePoint.item.date} · {metricLabel}:{' '}
            <span className="text-cyan-700 dark:text-cyan-300 font-semibold">
              {formatCompactNumber(activePoint.val)}
            </span>{' '}
            · Likes {formatCompactNumber(activePoint.item.likes)} · Comments{' '}
            {formatCompactNumber(activePoint.item.comments)}
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E] p-0.5">
          {(
            [
              { id: 'views', label: 'Views' },
              { id: 'watchTimeMinutes', label: 'Watch Time' },
              { id: 'subscribersNet', label: 'Subs Net' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMetric(tab.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                metric === tab.id
                  ? 'bg-cyan-600/15 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-200'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[460px] h-48 select-none"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="creatorAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0891b2" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#0891b2" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((ratio) => {
            const y = padT + ratio * innerH;
            const labelVal = Math.round(maxVal - ratio * range);
            return (
              <g key={ratio}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  className="stroke-slate-300 dark:stroke-slate-700/60"
                  strokeDasharray="3 3"
                />
                <text
                  x={padL - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-600 dark:fill-slate-400"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {formatCompactNumber(labelVal)}
                </text>
              </g>
            );
          })}

          <path d={areaPath} fill="url(#creatorAreaGrad)" />
          <path
            d={linePath}
            fill="none"
            className="stroke-cyan-600 dark:stroke-cyan-400"
            strokeWidth="2.2"
          />

          {activePoint && (
            <line
              x1={activePoint.x}
              y1={padT}
              x2={activePoint.x}
              y2={padT + innerH}
              className="stroke-cyan-600/45 dark:stroke-cyan-400/40"
              strokeDasharray="2 2"
            />
          )}

          {points.map((p, idx) => (
            <g key={p.item.date}>
              <circle
                cx={p.x}
                cy={p.y}
                r={hoverIdx === idx ? 5 : 2.5}
                className={
                  hoverIdx === idx
                    ? 'fill-emerald-600 dark:fill-emerald-400'
                    : 'fill-cyan-600 dark:fill-cyan-400'
                }
              />
              <rect
                x={p.x - innerW / Math.max(points.length * 2, 2)}
                y={padT}
                width={Math.max(12, innerW / Math.max(points.length, 1))}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(idx)}
              />
            </g>
          ))}

          <text
            x={padL}
            y={height - 6}
            className="fill-slate-600 dark:fill-slate-400"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
          >
            {series[0].date}
          </text>
          <text
            x={width - padR}
            y={height - 6}
            textAnchor="end"
            className="fill-slate-600 dark:fill-slate-400"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
          >
            {series[series.length - 1].date}
          </text>
        </svg>
      </div>
    </div>
  );
};

interface TrafficSourcesBarChartProps {
  sources: YouTubeAnalyticsPayload['trafficSources'];
}

export const TrafficSourcesBarChart: React.FC<TrafficSourcesBarChartProps> = ({
  sources,
}) => {
  if (!sources || sources.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-4 text-xs text-slate-600 dark:text-slate-400">
        Traffic source breakdown unavailable for this query window.
      </div>
    );
  }

  const totalViews = sources.reduce((s, x) => s + x.views, 0) || 1;
  const maxViews = Math.max(1, ...sources.map((s) => s.views));

  return (
    <div className="rounded-xl border border-cyan-600/20 dark:border-cyan-500/20 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3">
      <h4 className="font-display text-sm font-semibold text-cyan-800 dark:text-cyan-200 tracking-wide">
        TRAFFIC SOURCES
      </h4>
      <div className="space-y-2.5">
        {sources.slice(0, 7).map((item) => {
          const share = ((item.views / totalViews) * 100).toFixed(1);
          const barW = Math.max(4, Math.round((item.views / maxViews) * 100));
          return (
            <div key={item.source} className="space-y-1">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-slate-800 dark:text-slate-200 truncate">
                  {item.source.replace(/_/g, ' ')}
                </span>
                <span className="font-mono-hud text-slate-700 dark:text-slate-300 shrink-0">
                  {formatCompactNumber(item.views)} · {share}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-900 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 dark:from-cyan-400 dark:to-emerald-400"
                  style={{ width: `${barW}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface FormatComparisonPanelProps {
  comparison: YouTubeAnalyticsPayload['formatComparison'];
}

export const FormatComparisonPanel: React.FC<FormatComparisonPanelProps> = ({
  comparison,
}) => {
  const sViews = comparison.shorts.totalViews || 0;
  const lViews = comparison.longForm.totalViews || 0;
  const sum = sViews + lViews || 1;
  const shortsShare = Math.round((sViews / sum) * 100);
  const longShare = 100 - shortsShare;

  return (
    <div className="rounded-xl border border-cyan-600/20 dark:border-cyan-500/20 bg-slate-50 dark:bg-[#050A14] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-display text-sm font-semibold text-cyan-800 dark:text-cyan-200 tracking-wide">
          SHORTS VS LONG-FORM
        </h4>
        <span className="text-[11px] font-mono-hud text-slate-600 dark:text-slate-400">
          Views Split: {shortsShare}% Shorts · {longShare}% Long
        </span>
      </div>

      <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-900 overflow-hidden flex">
        <div
          className="h-full bg-cyan-500 dark:bg-cyan-400"
          style={{ width: `${shortsShare}%` }}
          title={`Shorts: ${shortsShare}%`}
        />
        <div
          className="h-full bg-emerald-500 dark:bg-emerald-400"
          style={{ width: `${longShare}%` }}
          title={`Long-form: ${longShare}%`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-cyan-600/20 dark:border-cyan-500/20 bg-white dark:bg-[#08101E] p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-display text-xs text-cyan-700 dark:text-cyan-300">
              SHORTS (9:16)
            </span>
            <span className="font-mono-hud text-xs text-slate-600 dark:text-slate-400">
              {comparison.shorts.count} videos
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
            <div>
              <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                Total Views
              </span>
              <span className="font-mono-hud text-slate-900 dark:text-slate-100 font-semibold">
                {formatCompactNumber(comparison.shorts.totalViews)}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                Avg / Video
              </span>
              <span className="font-mono-hud text-slate-900 dark:text-slate-100 font-semibold">
                {formatCompactNumber(comparison.shorts.avgViews)}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                Likes
              </span>
              <span className="font-mono-hud text-slate-900 dark:text-slate-100 font-semibold">
                {formatCompactNumber(comparison.shorts.totalLikes)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-emerald-600/20 dark:border-emerald-500/20 bg-white dark:bg-[#08101E] p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-display text-xs text-emerald-700 dark:text-emerald-300">
              LONG-FORM (16:9)
            </span>
            <span className="font-mono-hud text-xs text-slate-600 dark:text-slate-400">
              {comparison.longForm.count} videos
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
            <div>
              <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                Total Views
              </span>
              <span className="font-mono-hud text-slate-900 dark:text-slate-100 font-semibold">
                {formatCompactNumber(comparison.longForm.totalViews)}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                Avg / Video
              </span>
              <span className="font-mono-hud text-slate-900 dark:text-slate-100 font-semibold">
                {formatCompactNumber(comparison.longForm.avgViews)}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                Likes
              </span>
              <span className="font-mono-hud text-slate-900 dark:text-slate-100 font-semibold">
                {formatCompactNumber(comparison.longForm.totalLikes)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
