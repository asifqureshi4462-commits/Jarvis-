import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'An unexpected application error occurred.',
    };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('J.A.R.V.I.S ErrorBoundary:', error, info);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#04070D] text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-rose-500/40 bg-white dark:bg-[#0A111E] p-6 shadow-lg">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="font-display text-lg font-semibold">
                System Recovery Required
              </h2>
            </div>
            <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-600 text-white dark:bg-cyan-500 dark:text-slate-950 font-semibold text-sm hover:bg-cyan-500 dark:hover:bg-cyan-400 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Restore Interface
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
