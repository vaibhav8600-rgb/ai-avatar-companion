"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

interface WaveformProps {
  /** 0..1 amplitude source, read each frame. */
  levelRef?: MutableRefObject<number>;
  /** Bar count (odd → symmetric around center). */
  bars?: number;
  width?: number;
  height?: number;
  /** "blue" | "amber" | "violet" — tints the gradient. */
  tone?: "blue" | "amber" | "violet";
  className?: string;
  /** Gentle idle motion even when level ~0. */
  idle?: boolean;
}

const TONES: Record<NonNullable<WaveformProps["tone"]>, [string, string]> = {
  blue: ["#38bdf8", "#22d3ee"],
  amber: ["#f59e0b", "#fcd34d"],
  violet: ["#7c3aed", "#d946ef"],
};

/**
 * Amplitude-reactive bar waveform fanning out from the center. Canvas2D (cheap,
 * off the React render path). Idle-animates gently when silent. Used behind the
 * mic and in the listening/speaking caption boxes.
 */
export default function Waveform({
  levelRef,
  bars = 48,
  width = 320,
  height = 64,
  tone = "blue",
  className = "",
  idle = true,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const [c1, c2] = TONES[tone];
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, c1 + "22");
    grad.addColorStop(0.5, c2);
    grad.addColorStop(1, c1 + "22");

    const gap = width / bars;
    const barW = Math.max(2, gap * 0.5);
    const mid = height / 2;
    // Per-bar phase for organic motion.
    const phases = Array.from({ length: bars }, (_, i) => (i / bars) * Math.PI * 2);
    let raf = 0;

    const draw = () => {
      // Hidden (e.g. `hidden sm:block` wings on mobile) — skip the paint work
      // entirely; keep the loop so we resume when shown again.
      if (canvas.offsetParent === null) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const level = levelRef?.current ?? 0;
      const t = performance.now() * 0.004;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = grad;
      for (let i = 0; i < bars; i++) {
        // Center bars taller; envelope tapers at edges.
        const dist = Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
        const env = 1 - dist * 0.75;
        const wiggle = reduce ? 0.5 : Math.sin(t + phases[i]) * 0.5 + 0.5;
        const idleFloor = idle ? 0.08 + wiggle * 0.06 : 0;
        const amp = Math.max(idleFloor, level * env * (0.5 + wiggle * 0.7));
        const h = Math.max(2, amp * height * 0.9);
        const x = i * gap + (gap - barW) / 2;
        const r = barW / 2;
        // Rounded vertical bar centered on mid.
        ctx.beginPath();
        ctx.roundRect(x, mid - h / 2, barW, h, r);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [levelRef, bars, width, height, tone, idle]);

  return <canvas ref={canvasRef} aria-hidden className={className} style={{ width, height }} />;
}
