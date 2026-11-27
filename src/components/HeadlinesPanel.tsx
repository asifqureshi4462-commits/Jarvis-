import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, ExternalLink, Newspaper, RefreshCw, X } from 'lucide-react';
import type { NewsArticle } from '../types/jarvis';

const CATEGORIES = [
  { id: 'technology', label: 'Tech' },
  { id: 'ai', label: 'AI' },
  { id: 'business', label: 'Business' },
  { id: 'world', label: 'World' },
  { id: 'science', label: 'Science' },
] as const;

interface HeadlinesPanelProps {
  compact?: boolean;
}

export const HeadlinesPanel: React.FC<HeadlinesPanelProps> = ({
  compact = false,
}) => {
  const [category, setCategory] = useState<string>('technology');
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [summaryText, setSummaryText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadNews = useCallback(async (cat: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/news?category=${encodeURIComponent(cat)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch live headlines.');
      }
      setArticles(Array.isArray(data.articles) ? data.articles : []);
      setSummaryText(data.summaryText || '');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to retrieve headlines.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNews(category);
  }, [category, loadNews]);

  const visibleArticles = compact ? articles.slice(0, 3) : articles;

  return (
    <>
      <section className="rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white/95 dark:bg-[#050A12]/95 backdrop-blur-md p-4 flex flex-col shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Newspaper className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <h2 className="font-display text-xs sm:text-sm font-semibold tracking-wider text-slate-900 dark:text-slate-100 truncate">
              TODAY&apos;S HEADLINES
            </h2>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {compact && articles.length > 3 && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="min-h-[36px] px-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-[11px] font-medium text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 inline-flex items-center gap-1 whitespace-nowrap"
              >
                <span>View All</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => loadNews(category)}
              disabled={loading}
              aria-label="Refresh headlines"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 hover:border-cyan-500/50 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                category === c.id
                  ? 'bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold'
                  : 'bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-800'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="mt-2.5 flex-1 space-y-2">
          {loading && (
            <div className="space-y-2 py-1">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 rounded-xl bg-slate-100 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 animate-pulse"
                />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-rose-500/35 bg-rose-50 dark:bg-rose-950/20 p-3 text-xs text-rose-700 dark:text-rose-300">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => loadNews(category)}
                className="mt-1.5 underline text-rose-800 dark:text-rose-200 hover:opacity-80"
              >
                Retry feed
              </button>
            </div>
          )}

          {!loading && !error && visibleArticles.length === 0 && !summaryText && (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-3 text-center">
              No live headlines returned for this category right now.
            </p>
          )}

          {!loading &&
            !error &&
            visibleArticles.map((art, idx) => (
              <a
                key={`${art.url}-${idx}`}
                href={art.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-slate-200 dark:border-slate-800/90 bg-slate-50 dark:bg-[#050A14] p-2.5 hover:border-cyan-500/45 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100 group-hover:text-cyan-700 dark:group-hover:text-cyan-200 line-clamp-2 leading-snug">
                    {art.title}
                  </p>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:text-cyan-600 dark:group-hover:text-cyan-300 shrink-0 mt-0.5" />
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="truncate">{art.source}</span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{category}</span>
                </div>
              </a>
            ))}

          {!loading && !error && visibleArticles.length === 0 && summaryText && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed line-clamp-4">
              {summaryText}
            </div>
          )}
        </div>
      </section>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-xl max-h-[82dvh] flex flex-col rounded-2xl border border-cyan-500/35 bg-white dark:bg-[#08101E] text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <h3 className="font-display text-sm font-semibold tracking-wider uppercase">
                  All {category} Headlines
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close headlines"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {articles.map((art, idx) => (
                <a
                  key={`modal-${art.url}-${idx}`}
                  href={art.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3 hover:border-cyan-500/45 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100">
                      {art.title}
                    </p>
                    <ExternalLink className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {art.source}
                  </p>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
