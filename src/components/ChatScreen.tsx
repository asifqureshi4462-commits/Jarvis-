import React, { useRef, useState } from 'react';
import {
  Activity,
  BrainCircuit,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  MessageSquare,
  Mic,
  Send,
  Square,
  Trash2,
  Volume2,
  Zap,
} from 'lucide-react';
import type { ChatMessage, ModelMode } from '../types/jarvis';

interface ChatScreenProps {
  messages: ChatMessage[];
  modelMode: ModelMode;
  onChangeModelMode: (mode: ModelMode) => void;
  isProcessing: boolean;
  isRecordingAudio: boolean;
  onSendMessage: (text: string) => Promise<void>;
  onStartAudioRecord: () => void;
  onStopAudioRecord: () => void;
  onSpeakText: (text: string) => void;
  onAnalyzeMedia: (file: File, prompt: string) => Promise<void>;
  onRequestClearHistory: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  messages,
  modelMode,
  onChangeModelMode,
  isProcessing,
  isRecordingAudio,
  onSendMessage,
  onStartAudioRecord,
  onStopAudioRecord,
  onSpeakText,
  onAnalyzeMedia,
  onRequestClearHistory,
}) => {
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    const msg = input.trim();
    setInput('');
    await onSendMessage(msg);
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await onAnalyzeMedia(
      file,
      input.trim() ||
        'Analyze this uploaded photo or video for key details and summarize it concisely.'
    );
    setInput('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] min-h-[480px] rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/95 overflow-hidden shadow-sm">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800/90 bg-slate-50 dark:bg-[#050A14]">
        <div className="flex items-center gap-2.5">
          <MessageSquare className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <h1 className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
            Conversational Interface
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/80 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onChangeModelMode('fast')}
              className={`min-h-[34px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                modelMode === 'fast'
                  ? 'bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Fast</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeModelMode('balanced')}
              className={`min-h-[34px] px-2.5 rounded-lg text-xs font-medium transition-colors ${
                modelMode === 'balanced'
                  ? 'bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Balanced
            </button>
            <button
              type="button"
              onClick={() => onChangeModelMode('deep')}
              className={`min-h-[34px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                modelMode === 'deep'
                  ? 'bg-amber-500 text-white dark:bg-amber-400 dark:text-slate-950 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <BrainCircuit className="w-3 h-3" />
              <span>Advanced Reasoning</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onRequestClearHistory}
            aria-label="Clear conversation"
            className="min-h-[38px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-300 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-12">
            <p className="font-display text-base font-semibold text-cyan-700 dark:text-cyan-300">
              Awaiting Directive, Sir.
            </p>
            <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Speak or type in English, Hindi, or Urdu. You can also attach photos or short videos for analysis.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={m.id}
                className={`flex flex-col ${
                  isUser ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-4 py-3 border ${
                    isUser
                      ? 'bg-cyan-50 dark:bg-cyan-500/12 border-cyan-300 dark:border-cyan-500/35 text-slate-900 dark:text-slate-100'
                      : 'bg-slate-50 dark:bg-[#050A14] border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 mb-1">
                    <span
                      className={`font-mono-hud text-[11px] font-semibold tracking-wider ${
                        isUser
                          ? 'text-cyan-700 dark:text-cyan-300'
                          : 'text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {isUser ? 'YOU' : 'J.A.R.V.I.S'}
                    </span>
                    {m.modelUsed && !isUser && (
                      <span className="font-mono-hud text-[10px] text-slate-500">
                        {m.modelUsed}
                      </span>
                    )}
                  </div>

                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {m.text}
                  </p>

                  {m.telemetry && !isUser && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-mono-hud text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-300">
                        <Activity className="w-3 h-3" />
                        {m.telemetry.path === 'local_fast_path'
                          ? 'LOCAL FAST-PATH'
                          : 'STREAMING AI'}
                      </span>
                      <span>Route {m.telemetry.routeMs}ms</span>
                      {m.telemetry.aiFirstTokenMs !== undefined && (
                        <span>1st Token {m.telemetry.aiFirstTokenMs}ms</span>
                      )}
                      {m.telemetry.ttsMs !== undefined && (
                        <span>TTS {m.telemetry.ttsMs}ms</span>
                      )}
                      <span>Total {m.telemetry.totalMs}ms</span>
                    </div>
                  )}

                  {/* Grounding Links */}
                  {m.groundingChunks && m.groundingChunks.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800/80 space-y-1.5">
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        Verified Sources
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {m.groundingChunks.map((chunk, idx) => {
                          const href = chunk.web?.uri || chunk.maps?.uri;
                          const label =
                            chunk.web?.title ||
                            chunk.maps?.title ||
                            'Source Link';
                          if (!href) return null;
                          return (
                            <a
                              key={`${href}-${idx}`}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-cyan-700 dark:text-cyan-300 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span className="truncate max-w-[200px]">
                                {label}
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!isUser && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSpeakText(m.text)}
                        className="min-h-[32px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 hover:text-cyan-700 dark:hover:text-cyan-300 inline-flex items-center gap-1"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Speak</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(m.id, m.text)}
                        className="min-h-[32px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 hover:text-cyan-700 dark:hover:text-cyan-300 inline-flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedId === m.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {isProcessing && (
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 font-mono-hud">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>STREAMING / PROCESSING REQUEST...</span>
          </div>
        )}
      </div>

      {/* Input Bar */}
      <form
        onSubmit={handleSubmit}
        className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800/90 bg-slate-50 dark:bg-[#050A14] flex items-center gap-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          aria-label="Analyze image or video"
          title="Analyze photo or video"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-transparent text-slate-600 dark:text-slate-300 hover:border-cyan-500/50 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors disabled:opacity-40"
        >
          <ImagePlus className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={isRecordingAudio ? onStopAudioRecord : onStartAudioRecord}
          aria-label={isRecordingAudio ? 'Stop recording' : 'Record voice'}
          className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border transition-colors ${
            isRecordingAudio
              ? 'border-rose-500 bg-rose-500/20 text-rose-700 dark:text-rose-300'
              : 'border-slate-300 dark:border-slate-800 bg-white dark:bg-transparent text-slate-600 dark:text-slate-300 hover:border-cyan-500/50 hover:text-cyan-700 dark:hover:text-cyan-300'
          }`}
        >
          {isRecordingAudio ? (
            <Square className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message J.A.R.V.I.S in English, Hindi, or Urdu..."
          className="flex-1 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-[#08101E] px-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
        />

        <button
          type="submit"
          disabled={!input.trim() || isProcessing}
          aria-label="Send message"
          className="min-h-[44px] min-w-[44px] px-4 flex items-center justify-center rounded-xl bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold hover:bg-cyan-500 dark:hover:bg-cyan-300 transition-colors disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
