import React, { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import type { SoulConfig } from '../types/jarvis';

interface SoulScreenProps {
  soul: SoulConfig;
  onSaveSoul: (next: SoulConfig) => Promise<void>;
}

const SUPPORTED_LANGUAGES = ['English', 'Hindi', 'Urdu'] as const;

export const SoulScreen: React.FC<SoulScreenProps> = ({ soul, onSaveSoul }) => {
  const [draft, setDraft] = useState<SoulConfig>(soul);
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  const toggleLang = (lang: string) => {
    const exists = draft.languages.includes(lang);
    const next = exists
      ? draft.languages.filter((l) => l !== lang)
      : [...draft.languages, lang];
    if (next.length === 0) return;
    setDraft({ ...draft, languages: next });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveSoul(draft);
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 2200);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
          <Sparkles className="w-6 h-6 text-amber-500 dark:text-amber-400" />
          <span>SOUL — Personality Core</span>
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          Define how J.A.R.V.I.S addresses you, reasons, and communicates across languages. Created by Asif Qureshi.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/90 p-5 space-y-5 shadow-sm"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Assistant Designation
            </label>
            <input
              type="text"
              value={draft.assistantName}
              onChange={(e) =>
                setDraft({ ...draft, assistantName: e.target.value })
              }
              maxLength={64}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-3.5 text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              User Form of Address
            </label>
            <input
              type="text"
              value={draft.addressTitle}
              onChange={(e) =>
                setDraft({ ...draft, addressTitle: e.target.value })
              }
              maxLength={40}
              placeholder="Sir"
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] px-3.5 text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Personality & Tone Calibration
          </label>
          <textarea
            rows={3}
            value={draft.personalityTone}
            onChange={(e) =>
              setDraft({ ...draft, personalityTone: e.target.value })
            }
            maxLength={600}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3.5 text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
            Active Conversational Languages
          </label>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const active = draft.languages.includes(lang);
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggleLang(lang)}
                  className={`min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-medium border transition-colors ${
                    active
                      ? 'bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 border-cyan-500 dark:border-cyan-300 font-semibold'
                      : 'bg-slate-50 dark:bg-[#050A14] text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {lang}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Custom Behavioral Directives
          </label>
          <textarea
            rows={3}
            value={draft.customDirectives}
            onChange={(e) =>
              setDraft({ ...draft, customDirectives: e.target.value })
            }
            maxLength={2000}
            placeholder="e.g. Keep morning briefings concise with bullet points. Confirm before sending emails."
            className="w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-4">
          <p className="text-[11px] font-mono-hud text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Voice Response Preview
          </p>
          <p className="mt-1.5 text-sm text-cyan-700 dark:text-cyan-200 italic">
            "Good morning, {draft.addressTitle || 'Sir'}. All systems for{' '}
            {draft.assistantName || 'J.A.R.V.I.S.'} are operational and ready."
          </p>
        </div>

        <div className="flex items-center justify-end gap-3">
          {savedBanner && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
              <Check className="w-4 h-4" />
              Persona synchronized
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold text-sm hover:bg-cyan-500 dark:hover:bg-cyan-300 transition-colors disabled:opacity-50"
          >
            {saving ? 'Synchronizing...' : 'Save SOUL Profile'}
          </button>
        </div>
      </form>
    </div>
  );
};
