"use client";

import { motion } from "framer-motion";
import { useId } from "react";

interface RingGaugeProps {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  /** Center label; defaults to the rounded percentage. */
  label?: string;
  /** Sub-label under the ring (e.g. "Volume"). */
  caption?: string;
  className?: string;
}

/**
 * Circular progress ring with a brand-gradient stroke that animates from 0 to
 * `value` on mount. Used for Volume (78%) and Confidence gauges in the mockups.
 */
export default function RingGauge({
  value,
  size = 96,
  stroke = 8,
  label,
  caption,
  className = "",
}: RingGaugeProps) {
  const id = useId();
  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.round(clamped * 100);

  return (
    <div className={`inline-flex flex-col items-center gap-2 ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id={`ring-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgb(var(--grad-start))" />
              <stop offset="50%" stopColor="rgb(var(--grad-mid))" />
              <stop offset="100%" stopColor="rgb(var(--grad-end))" />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={stroke}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#ring-${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - clamped) }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-lg font-semibold text-ink-primary">{label ?? `${pct}%`}</span>
        </div>
      </div>
      {caption && <span className="text-sm text-ink-secondary">{caption}</span>}
    </div>
  );
}
