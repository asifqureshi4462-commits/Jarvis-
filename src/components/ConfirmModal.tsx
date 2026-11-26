import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { ConfirmDialogState } from '../types/jarvis';

interface ConfirmModalProps {
  dialog: ConfirmDialogState | null;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  dialog,
  onClose,
}) => {
  const [busy, setBusy] = useState(false);

  if (!dialog?.open) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await dialog.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const isDanger = dialog.variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-cyan-500/35 bg-white dark:bg-[#08101E] text-slate-900 dark:text-slate-100 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isDanger
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                  : 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              {dialog.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close confirmation"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
          {dialog.description}
        </p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              isDanger
                ? 'bg-rose-500 text-white hover:bg-rose-400'
                : 'bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 hover:bg-cyan-500 dark:hover:bg-cyan-300'
            } disabled:opacity-50`}
          >
            {busy ? 'Executing...' : dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
