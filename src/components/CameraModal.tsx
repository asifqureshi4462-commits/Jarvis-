import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Sparkles, X } from 'lucide-react';

interface CameraModalProps {
  open: boolean;
  onClose: () => void;
  onCaptureImage: (file: File, prompt: string) => Promise<void>;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  open,
  onClose,
  onCaptureImage,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError(null);

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Camera permission denied or no camera device detected.'
        );
      }
    };

    start();

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, facingMode]);

  if (!open) return null;

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
      );
      if (blob) {
        const file = new File([blob], `jarvis_capture_${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        onClose();
        await onCaptureImage(
          file,
          'Describe what you see in this captured camera frame concisely as J.A.R.V.I.S.'
        );
      }
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl border border-cyan-500/35 bg-white dark:bg-[#08101E] text-slate-900 dark:text-slate-100 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold flex items-center gap-2">
            <Camera className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            <span>J.A.R.V.I.S Camera Viewfinder</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 p-4 text-xs sm:text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black aspect-video flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() =>
              setFacingMode((prev) =>
                prev === 'environment' ? 'user' : 'environment'
              )
            }
            className="min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Switch Camera</span>
          </button>

          <button
            type="button"
            disabled={Boolean(error) || capturing}
            onClick={handleCapture}
            className="min-h-[42px] px-4 rounded-xl bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold text-xs hover:bg-cyan-500 dark:hover:bg-cyan-300 inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{capturing ? 'Capturing...' : 'Capture & Analyze'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
