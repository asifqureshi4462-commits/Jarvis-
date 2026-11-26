import React, { useState } from 'react';
import { Calculator, Delete, X } from 'lucide-react';

interface CalculatorModalProps {
  open: boolean;
  onClose: () => void;
}

const KEYS = [
  '7', '8', '9', '/',
  '4', '5', '6', '*',
  '1', '2', '3', '-',
  '0', '.', '=', '+',
];

function evaluateExpression(expr: string): string {
  const sanitized = expr.replace(/[^0-9+\-*/(). ]/g, '').trim();
  if (!sanitized) return '0';
  try {
    const fn = new Function(`"use strict"; return (${sanitized});`);
    const res = fn();
    if (typeof res === 'number' && Number.isFinite(res)) {
      return String(Math.round(res * 1e8) / 1e8);
    }
    return 'Error';
  } catch {
    return 'Error';
  }
}

export const CalculatorModal: React.FC<CalculatorModalProps> = ({
  open,
  onClose,
}) => {
  const [display, setDisplay] = useState('0');

  if (!open) return null;

  const pressKey = (k: string) => {
    if (k === '=') {
      setDisplay((prev) => evaluateExpression(prev));
      return;
    }
    setDisplay((prev) => {
      if (prev === '0' || prev === 'Error') {
        return /[0-9.]/.test(k) ? k : `0${k}`;
      }
      return prev + k;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xs rounded-2xl border border-cyan-500/35 bg-white dark:bg-[#08101E] text-slate-900 dark:text-slate-100 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold flex items-center gap-2">
            <Calculator className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>Quick Calculator</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close calculator"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#050A14] px-4 py-3 text-right font-mono-hud text-2xl font-semibold overflow-x-auto">
          {display}
        </div>

        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => setDisplay('0')}
            className="col-span-2 min-h-[44px] rounded-xl border border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs font-semibold"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() =>
              setDisplay((prev) =>
                prev.length <= 1 || prev === 'Error' ? '0' : prev.slice(0, -1)
              )
            }
            aria-label="Backspace"
            className="col-span-2 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#050A14] flex items-center justify-center text-slate-700 dark:text-slate-200"
          >
            <Delete className="w-4 h-4" />
          </button>

          {KEYS.map((k) => {
            const isEq = k === '=';
            const isOp = ['/', '*', '-', '+'].includes(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => pressKey(k)}
                className={`min-h-[46px] rounded-xl font-mono-hud text-sm font-semibold transition-colors ${
                  isEq
                    ? 'bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950'
                    : isOp
                      ? 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                      : 'border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] text-slate-900 dark:text-slate-100 hover:border-cyan-400/50'
                }`}
              >
                {k}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
