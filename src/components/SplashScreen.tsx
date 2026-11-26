import React, { useEffect, useRef, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [fading, setFading] = useState(false);
  const [entered, setEntered] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const enterRaf = requestAnimationFrame(() => setEntered(true));
    const t1 = setTimeout(() => setFading(true), 950);
    const t2 = setTimeout(() => onComplete(), 1250);
    return () => {
      cancelAnimationFrame(enterRaf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onComplete]);

  // Lightweight orbital particle glow around the emblem
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 240;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const particles = Array.from({ length: 28 }, (_, i) => ({
      angle: (Math.PI * 2 * i) / 28,
      radius: 78 + (i % 3) * 14,
      speed: (i % 2 === 0 ? 1 : -1) * (0.012 + (i % 4) * 0.004),
      size: i % 5 === 0 ? 2.2 : 1.3,
      emerald: i % 4 === 0,
    }));

    let animId = 0;
    let tick = 0;
    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      tick += reducedMotion ? 0.1 : 1;

      const glow = ctx.createRadialGradient(cx, cy, 24, cx, cy, 114);
      glow.addColorStop(0, 'rgba(34, 211, 238, 0.24)');
      glow.addColorStop(0.55, 'rgba(16, 185, 129, 0.08)');
      glow.addColorStop(1, 'rgba(4, 7, 13, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 114, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.26)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = -tick * 0.45;
      ctx.beginPath();
      ctx.arc(cx, cy, 92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      for (const p of particles) {
        const a = p.angle + tick * p.speed;
        const px = cx + Math.cos(a) * p.radius;
        const py = cy + Math.sin(a) * p.radius;
        ctx.fillStyle = p.emerald
          ? 'rgba(16, 185, 129, 0.72)'
          : 'rgba(34, 211, 238, 0.78)';
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reducedMotion) {
        animId = requestAnimationFrame(draw);
      }
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div
      onClick={onComplete}
      role="button"
      tabIndex={0}
      aria-label="Skip intro splash"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onComplete();
      }}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#F4F7FB] dark:bg-[#04070D] px-6 transition-opacity duration-300 cursor-pointer ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div
        className={`relative flex flex-col items-center text-center max-w-sm transition-all duration-500 ${
          entered ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
        }`}
      >
        <div className="relative w-60 h-60 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            style={{ width: 240, height: 240 }}
            className="absolute inset-0 pointer-events-none"
          />
          <div className="relative z-10 w-32 h-32 sm:w-36 sm:h-36 rounded-2xl overflow-hidden border border-cyan-500/45 bg-black flex items-center justify-center shadow-[0_0_55px_rgba(34,211,238,0.28)]">
            <img
              src="/src/assets/images/jarvis_emblem_1795542174982.jpg"
              alt="J.A.R.V.I.S Core Emblem"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-[0.22em] text-cyan-700 dark:text-cyan-300">
          J.A.R.V.I.S
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 tracking-wide">
          Just A Rather Very Intelligent System · Asif Qureshi
        </p>

        <div className="mt-6 w-48 h-1 rounded-full bg-slate-200 dark:bg-slate-800/90 overflow-hidden">
          <div className="h-full w-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 animate-pulse" />
        </div>
      </div>
    </div>
  );
};
