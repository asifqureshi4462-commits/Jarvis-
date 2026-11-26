import React, { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Cpu,
  Loader2,
  Mic,
  Radio,
  Volume2,
  WifiOff,
} from 'lucide-react';
import type { OrbState } from '../types/jarvis';

export type OrbListeningMode = 'manual' | 'wake_word' | 'follow_up';

interface JarvisOrbProps {
  state: OrbState;
  audioLevel: number; // 0.0 to 1.0 real RMS level
  listeningMode?: OrbListeningMode;
  wakeWordStandby?: boolean;
  onTap?: () => void;
  size?: number;
}

interface Particle {
  theta: number;
  phi: number;
  baseRadius: number;
  size: number;
  isGold: boolean;
  speedOffset: number;
}

const STATUS_META: Record<
  OrbState,
  { label: string; colorClass: string; borderClass: string }
> = {
  IDLE: {
    label: 'JARVIS IDLE',
    colorClass: 'text-cyan-700 dark:text-cyan-300',
    borderClass: 'border-cyan-500/40 dark:border-cyan-500/30',
  },
  LISTENING: {
    label: 'LISTENING',
    colorClass: 'text-sky-700 dark:text-sky-300',
    borderClass: 'border-sky-500/60 dark:border-sky-400/60',
  },
  THINKING: {
    label: 'THINKING',
    colorClass: 'text-amber-700 dark:text-amber-300',
    borderClass: 'border-amber-500/60 dark:border-amber-400/60',
  },
  SPEAKING: {
    label: 'SPEAKING',
    colorClass: 'text-emerald-700 dark:text-emerald-300',
    borderClass: 'border-emerald-500/60 dark:border-emerald-400/60',
  },
  EXECUTING: {
    label: 'EXECUTING',
    colorClass: 'text-violet-700 dark:text-violet-300',
    borderClass: 'border-violet-500/60 dark:border-violet-400/60',
  },
  DISCONNECTED: {
    label: 'DISCONNECTED',
    colorClass: 'text-slate-600 dark:text-slate-400',
    borderClass: 'border-slate-400/60 dark:border-slate-600/60',
  },
  STOPPED: {
    label: 'JARVIS IDLE',
    colorClass: 'text-cyan-700 dark:text-cyan-300',
    borderClass: 'border-cyan-500/40 dark:border-cyan-500/30',
  },
  ERROR: {
    label: 'ERROR',
    colorClass: 'text-rose-700 dark:text-rose-400',
    borderClass: 'border-rose-500/60',
  },
};

export const JarvisOrb: React.FC<JarvisOrbProps> = ({
  state,
  audioLevel,
  listeningMode = 'manual',
  wakeWordStandby = false,
  onTap,
  size = 260,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<OrbState>(state);
  const levelRef = useRef<number>(audioLevel);
  const listeningModeRef = useRef<OrbListeningMode>(listeningMode);
  const wakeStandbyRef = useRef<boolean>(wakeWordStandby);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    levelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    listeningModeRef.current = listeningMode;
  }, [listeningMode]);

  useEffect(() => {
    wakeStandbyRef.current = wakeWordStandby;
  }, [wakeWordStandby]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const particles: Particle[] = [];
    const count = 210;
    for (let i = 0; i < count; i++) {
      const goldenRatio = (1 + Math.sqrt(5)) / 2;
      const theta = (2 * Math.PI * i) / goldenRatio;
      const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
      particles.push({
        theta,
        phi,
        baseRadius: size * 0.31 + (i % 7) * 1.4,
        size: i % 9 === 0 ? 2.4 : 1.45,
        isGold: i % 6 === 0,
        speedOffset: ((i % 5) - 2) * 0.08,
      });
    }

    let animId = 0;
    let t = 0;
    let smoothedLevel = 0;
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const render = () => {
      const currentState = stateRef.current;
      const targetLevel = Math.min(1, Math.max(0, levelRef.current));
      smoothedLevel += (targetLevel - smoothedLevel) * 0.22;

      const speedMultiplier = reducedMotion
        ? 0.15
        : currentState === 'DISCONNECTED'
          ? 0.18
          : currentState === 'EXECUTING'
            ? 2.5
            : currentState === 'THINKING'
              ? 2.8
              : currentState === 'SPEAKING'
                ? 1.7 + smoothedLevel * 1.6
                : currentState === 'LISTENING'
                  ? 1.3 + smoothedLevel * 1.2
                  : 0.45;

      t += 0.014 * speedMultiplier;

      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;

      const isWakeWordListening =
        currentState === 'LISTENING' &&
        (listeningModeRef.current === 'wake_word' ||
          listeningModeRef.current === 'follow_up');
      const isWakeStandby =
        (currentState === 'IDLE' || currentState === 'STOPPED') &&
        wakeStandbyRef.current;

      const corePulse =
        currentState === 'SPEAKING'
          ? 1 + smoothedLevel * 0.35
          : isWakeWordListening
            ? 1 + smoothedLevel * 0.3 + Math.sin(t * 2.8) * 0.1
            : currentState === 'LISTENING'
              ? 1 + smoothedLevel * 0.35
              : currentState === 'THINKING' || currentState === 'EXECUTING'
                ? 1 + Math.sin(t * 3) * 0.14
                : currentState === 'DISCONNECTED'
                  ? 0.92
                  : isWakeStandby
                    ? 1 + Math.sin(t * 1.8) * 0.055
                    : 1 + Math.sin(t * 1.4) * 0.04;

      const isError = currentState === 'ERROR';
      const isThinking = currentState === 'THINKING';
      const isExecuting = currentState === 'EXECUTING';
      const isDisconnected = currentState === 'DISCONNECTED';

      const primaryRgb = isError
        ? '244, 63, 94'
        : isDisconnected
          ? '100, 116, 139'
          : isExecuting
            ? '139, 92, 246'
            : isThinking
              ? '245, 158, 11'
              : isWakeWordListening
                ? '34, 211, 238'
                : '0, 184, 217';
      const secondaryRgb = isError
        ? '251, 146, 60'
        : isDisconnected
          ? '148, 163, 184'
          : isExecuting
            ? '34, 211, 238'
            : isWakeWordListening
              ? '16, 185, 129'
              : '245, 158, 11';

      const outerGlow = ctx.createRadialGradient(
        cx,
        cy,
        size * 0.04,
        cx,
        cy,
        size * 0.46 * corePulse
      );
      outerGlow.addColorStop(
        0,
        `rgba(${primaryRgb}, ${
          isDisconnected ? 0.18 : isWakeWordListening ? 0.4 : 0.34
        })`
      );
      outerGlow.addColorStop(0.45, `rgba(${primaryRgb}, 0.1)`);
      outerGlow.addColorStop(1, 'rgba(4, 7, 13, 0)');
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
      ctx.fill();

      // Subtle concentric sonar pulse during wake-word LISTENING detection
      if (isWakeWordListening && !reducedMotion) {
        for (let w = 0; w < 2; w++) {
          const phase = (t * 0.55 + w * 0.5) % 1;
          const pulseRadius = size * (0.31 + phase * 0.165);
          const pulseAlpha = (1 - phase) * 0.34;
          ctx.save();
          ctx.strokeStyle = `rgba(34, 211, 238, ${pulseAlpha.toFixed(3)})`;
          ctx.lineWidth = Math.max(0.7, 1.65 - phase * 0.9);
          ctx.beginPath();
          ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      const rings = [
        { rx: size * 0.38, ry: size * 0.14, rot: t * 0.55, tilt: 0.35, alpha: 0.42 },
        { rx: size * 0.41, ry: size * 0.17, rot: -t * 0.42, tilt: -0.58, alpha: 0.3 },
        { rx: size * 0.34, ry: size * 0.34, rot: t * 0.2, tilt: 0, alpha: 0.22 },
      ];

      rings.forEach((ring, idx) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ring.tilt + (idx < 2 ? Math.sin(t * 0.3) * 0.12 : 0));
        ctx.strokeStyle =
          idx === 1
            ? `rgba(${secondaryRgb}, ${ring.alpha + smoothedLevel * 0.25})`
            : `rgba(${primaryRgb}, ${ring.alpha + smoothedLevel * 0.35})`;
        ctx.lineWidth = idx === 0 ? 1.4 : 1.05;
        ctx.setLineDash(idx === 2 ? [4, 6] : [18, 10]);
        ctx.lineDashOffset = -t * 28 * (idx % 2 === 0 ? 1 : -1);
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          ring.rx * (1 + smoothedLevel * 0.08),
          ring.ry * (1 + smoothedLevel * 0.08),
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
      });

      const projected: Array<{
        x: number;
        y: number;
        z: number;
        alpha: number;
        r: number;
        gold: boolean;
      }> = [];

      const expansion =
        currentState === 'SPEAKING'
          ? 1 + smoothedLevel * 0.22
          : isWakeWordListening
            ? 1 + smoothedLevel * 0.16 + Math.sin(t * 2.8) * 0.045
            : currentState === 'LISTENING'
              ? 1 + smoothedLevel * 0.16
              : currentState === 'THINKING' || currentState === 'EXECUTING'
                ? 0.94 + Math.sin(t * 2.5) * 0.08
                : currentState === 'DISCONNECTED'
                  ? 0.92
                  : 1;

      for (const p of particles) {
        const theta = p.theta + t * (0.7 + p.speedOffset);
        const phi = p.phi + Math.sin(t * 0.4 + p.theta) * 0.08;
        const r = p.baseRadius * expansion;

        const x3 = r * Math.sin(phi) * Math.cos(theta);
        const y3 = r * Math.cos(phi);
        const z3 = r * Math.sin(phi) * Math.sin(theta);

        const tiltX = 0.28;
        const yRot = y3 * Math.cos(tiltX) - z3 * Math.sin(tiltX);
        const zRot = y3 * Math.sin(tiltX) + z3 * Math.cos(tiltX);

        const perspective = 340 / (340 - zRot);
        const sx = cx + x3 * perspective;
        const sy = cy + yRot * perspective;

        const depthNorm = (zRot + r) / (2 * r);
        const alpha = Math.min(
          1,
          Math.max(
            0.18,
            (isDisconnected ? 0.14 : 0.24) + depthNorm * 0.74 + smoothedLevel * 0.25
          )
        );
        projected.push({
          x: sx,
          y: sy,
          z: zRot,
          alpha,
          r: p.size * perspective,
          gold: x3 < -r * 0.22 || p.isGold,
        });
      }

      projected.sort((a, b) => a.z - b.z);

      for (const pt of projected) {
        ctx.fillStyle = pt.gold
          ? `rgba(${secondaryRgb}, ${pt.alpha})`
          : `rgba(${primaryRgb}, ${pt.alpha})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.fill();
      }

      const coreRadius = size * 0.072 * corePulse;
      const coreGrad = ctx.createRadialGradient(
        cx,
        cy,
        1,
        cx,
        cy,
        coreRadius * 1.9
      );
      coreGrad.addColorStop(0, isDisconnected ? '#CBD5E1' : '#FFFFFF');
      coreGrad.addColorStop(0.35, `rgba(${primaryRgb}, 0.95)`);
      coreGrad.addColorStop(1, `rgba(${primaryRgb}, 0)`);
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * 1.9, 0, Math.PI * 2);
      ctx.fill();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [size]);

  const baseMeta = STATUS_META[state] || STATUS_META.IDLE;
  const isWakeListening =
    state === 'LISTENING' &&
    (listeningMode === 'wake_word' || listeningMode === 'follow_up');
  const isStandbyIdle =
    (state === 'IDLE' || state === 'STOPPED') && wakeWordStandby;

  const badgeMeta =
    state === 'LISTENING' && listeningMode === 'follow_up'
      ? {
          label: 'FOLLOW-UP LISTENING',
          colorClass: 'text-emerald-700 dark:text-emerald-300',
          borderClass: 'border-emerald-500/60 dark:border-emerald-400/60',
        }
      : state === 'LISTENING' && listeningMode === 'wake_word'
        ? {
            label: 'WAKE-WORD LISTENING',
            colorClass: 'text-cyan-700 dark:text-cyan-300',
            borderClass: 'border-cyan-500/60 dark:border-cyan-400/60',
          }
        : isStandbyIdle
          ? {
              label: 'WAKE-WORD STANDBY',
              colorClass: 'text-emerald-700 dark:text-emerald-300',
              borderClass: 'border-emerald-500/45 dark:border-emerald-400/40',
            }
          : baseMeta;

  return (
    <div className="flex flex-col items-center select-none">
      <button
        type="button"
        onClick={onTap}
        aria-label={`J.A.R.V.I.S Orb — ${badgeMeta.label}`}
        className="relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-full transition-transform active:scale-[0.98]"
        style={{ width: size, height: size }}
      >
        {isWakeListening && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-3 rounded-full border border-cyan-500/45 dark:border-cyan-300/40 animate-pulse motion-reduce:animate-none"
          />
        )}
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size }}
          className="block rounded-full relative z-10"
        />
      </button>

      <div
        className={`mt-1.5 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white/95 dark:bg-[#08101E]/90 border ${badgeMeta.borderClass} font-mono-hud text-[11px] tracking-widest ${badgeMeta.colorClass}`}
      >
        {state === 'LISTENING' && <Mic className="w-3.5 h-3.5" />}
        {state === 'THINKING' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {state === 'EXECUTING' && <Cpu className="w-3.5 h-3.5" />}
        {state === 'SPEAKING' && <Volume2 className="w-3.5 h-3.5" />}
        {state === 'ERROR' && <AlertTriangle className="w-3.5 h-3.5" />}
        {state === 'DISCONNECTED' && <WifiOff className="w-3.5 h-3.5" />}
        {(state === 'IDLE' || state === 'STOPPED') && (
          <Radio
            className={`w-3.5 h-3.5 ${
              isStandbyIdle ? 'text-emerald-600 dark:text-emerald-400' : ''
            }`}
          />
        )}
        <span>{badgeMeta.label}</span>
      </div>
    </div>
  );
};
