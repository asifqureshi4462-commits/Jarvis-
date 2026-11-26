import React, { useMemo, useState } from 'react';
import {
  Brain,
  Check,
  Edit3,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import type { MemoryItem } from '../types/jarvis';

interface MemoryScreenProps {
  memories: MemoryItem[];
  isAuthenticated: boolean;
  onAddMemory: (
    content: string,
    category: MemoryItem['category'],
    importance: MemoryItem['importance']
  ) => Promise<void>;
  onUpdateMemory: (
    id: string,
    content: string,
    category: MemoryItem['category'],
    importance: MemoryItem['importance']
  ) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
  onRequestClearHistory: () => void;
}

const CATEGORIES: MemoryItem['category'][] = [
  'preference',
  'fact',
  'project',
  'contact',
  'routine',
];

const SECRET_PATTERN =
  /(sk-[a-zA-Z0-9]{16,}|AIza[0-9A-Za-z_-]{20,}|password\s*[:=]|api[_-]?key\s*[:=])/i;

export const MemoryScreen: React.FC<MemoryScreenProps> = ({
  memories,
  isAuthenticated,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
  onRequestClearHistory,
}) => {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<MemoryItem['category']>('preference');
  const [importance, setImportance] =
    useState<MemoryItem['importance']>('medium');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editCat, setEditCat] = useState<MemoryItem['category']>('fact');
  const [editImp, setEditImp] = useState<MemoryItem['importance']>('medium');
  const [warning, setWarning] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return memories.filter((m) => {
      const catOk = filterCat === 'all' || m.category === filterCat;
      const q = search.trim().toLowerCase();
      const textOk = !q || m.content.toLowerCase().includes(q);
      return catOk && textOk;
    });
  }, [memories, search, filterCat]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setWarning(null);
    if (!content.trim()) return;
    if (SECRET_PATTERN.test(content)) {
      setWarning(
        'Security policy: Passwords, tokens, and API keys cannot be stored as memories.'
      );
      return;
    }
    await onAddMemory(content.trim(), category, importance);
    setContent('');
  };

  const startEdit = (m: MemoryItem) => {
    setEditingId(m.id);
    setEditText(m.content);
    setEditCat(m.category);
    setEditImp(m.importance);
  };

  const saveEdit = async () => {
    if (!editingId || !editText.trim()) return;
    if (SECRET_PATTERN.test(editText)) {
      setWarning(
        'Security policy: Passwords, tokens, and API keys cannot be stored as memories.'
      );
      return;
    }
    await onUpdateMemory(editingId, editText.trim(), editCat, editImp);
    setEditingId(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Brain className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
            <span>Memory Core</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Persistent facts, preferences, and context retrieved by J.A.R.V.I.S across sessions.
          </p>
        </div>

        <button
          type="button"
          onClick={onRequestClearHistory}
          disabled={!isAuthenticated}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs sm:text-sm font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 transition-colors disabled:opacity-40"
        >
          Clear Conversation History
        </button>
      </div>

      {/* Add Memory Card */}
      <form
        onSubmit={handleAdd}
        className="rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/90 p-4 sm:p-5 space-y-3 shadow-sm"
      >
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
          <span>
            Never store API keys, passwords, or private credentials in assistant memory.
          </span>
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          maxLength={2000}
          disabled={!isAuthenticated}
          placeholder={
            isAuthenticated
              ? 'e.g. Prefer morning briefings at 8 AM in English or Hindi...'
              : 'Sign in with Google in the header to persist memories...'
          }
          className="w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none disabled:opacity-50"
        />

        {warning && <p className="text-xs text-rose-600 dark:text-rose-400">{warning}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as MemoryItem['category'])
              }
              className="min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-3 text-xs text-slate-800 dark:text-slate-200 focus:border-cyan-500 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  Category: {c}
                </option>
              ))}
            </select>
            <select
              value={importance}
              onChange={(e) =>
                setImportance(e.target.value as MemoryItem['importance'])
              }
              className="min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-3 text-xs text-slate-800 dark:text-slate-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="low">Importance: Low</option>
              <option value="medium">Importance: Medium</option>
              <option value="high">Importance: High</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={!isAuthenticated || !content.trim()}
            className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold text-sm hover:bg-cyan-500 dark:hover:bg-cyan-300 transition-colors disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
            <span>Store Memory</span>
          </button>
        </div>
      </form>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stored memories..."
            className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] pl-10 pr-4 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setFilterCat('all')}
            className={`min-h-[40px] px-3 rounded-lg text-xs font-medium whitespace-nowrap ${
              filterCat === 'all'
                ? 'bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold'
                : 'bg-white dark:bg-[#08101E] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            All ({memories.length})
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilterCat(c)}
              className={`min-h-[40px] px-3 rounded-lg text-xs font-medium capitalize whitespace-nowrap ${
                filterCat === c
                  ? 'bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold'
                  : 'bg-white dark:bg-[#08101E] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Memory List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#08101E]/70 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {isAuthenticated
              ? 'No matching memories found.'
              : 'Sign in with Google to access your persistent J.A.R.V.I.S memory bank.'}
          </div>
        ) : (
          filtered.map((m) => (
            <div
              key={m.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#08101E]/90 p-4 shadow-sm"
            >
              {editingId === m.id ? (
                <div className="space-y-3">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    maxLength={2000}
                    className="w-full rounded-xl border border-cyan-500/40 bg-slate-50 dark:bg-[#050A14] p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={editCat}
                        onChange={(e) =>
                          setEditCat(e.target.value as MemoryItem['category'])
                        }
                        className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-2.5 text-xs text-slate-800 dark:text-slate-200"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select
                        value={editImp}
                        onChange={(e) =>
                          setEditImp(e.target.value as MemoryItem['importance'])
                        }
                        className="min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-2.5 text-xs text-slate-800 dark:text-slate-200"
                      >
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <X className="w-4 h-4 inline mr-1" />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="min-h-[40px] px-3 rounded-lg bg-emerald-600 text-white dark:bg-emerald-400 dark:text-slate-950 font-semibold text-xs hover:bg-emerald-500 dark:hover:bg-emerald-300"
                      >
                        <Check className="w-4 h-4 inline mr-1" />
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
                      {m.content}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="capitalize text-cyan-700 dark:text-cyan-300">
                        {m.category}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">
                        {m.importance} priority
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(m)}
                      aria-label="Edit memory"
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-300 hover:bg-slate-100 dark:hover:bg-slate-800/70"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteMemory(m.id)}
                      aria-label="Delete memory"
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
