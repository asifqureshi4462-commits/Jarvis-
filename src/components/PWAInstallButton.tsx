import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="min-h-[44px] inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-700 dark:text-cyan-200 hover:bg-cyan-500/20 transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="min-h-[44px] inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-700 dark:text-cyan-200 hover:bg-cyan-500/20 transition-colors whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-cyan-500/35 bg-white dark:bg-[#08101E] text-slate-900 dark:text-slate-100 p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Install J.A.R.V.I.S on iOS
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                1. Tap the <strong>Share</strong> button in Safari.
                <br />
                2. Select <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-lg bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 text-sm font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
