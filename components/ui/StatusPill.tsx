"use client";

export type PillStatus = "ready" | "listening" | "thinking" | "speaking" | "recovering" | "offline";

interface StatusPillProps {
  status: PillStatus;
  /** Override the default label text. */
  label?: string;
  /** Pulse the dot (active states). Defaults on for non-ready/offline states. */
  pulse?: boolean;
  className?: string;
}

const CONFIG: Record<
  PillStatus,
  { label: string; dot: string; text: string; ring: string; glow: string; defaultPulse: boolean }
> = {
  ready: {
    label: "Ready",
    dot: "bg-status-ready",
    text: "text-status-ready",
    ring: "border-status-ready/30 bg-status-ready/10",
    glow: "shadow-[0_0_14px_rgba(16,185,129,0.35)]",
    defaultPulse: false,
  },
  listening: {
    label: "Listening",
    dot: "bg-status-listen",
    text: "text-status-listen",
    ring: "border-status-listen/30 bg-status-listen/10",
    glow: "shadow-[0_0_16px_rgba(56,189,248,0.45)]",
    defaultPulse: true,
  },
  thinking: {
    label: "Thinking…",
    dot: "bg-status-think",
    text: "text-status-think",
    ring: "border-status-think/30 bg-status-think/10",
    glow: "shadow-[0_0_16px_rgba(139,92,246,0.45)]",
    defaultPulse: true,
  },
  speaking: {
    label: "Speaking",
    dot: "bg-status-speak",
    text: "text-status-speak",
    ring: "border-status-speak/30 bg-status-speak/10",
    glow: "shadow-[0_0_16px_rgba(245,158,11,0.45)]",
    defaultPulse: true,
  },
  recovering: {
    label: "Recovering",
    dot: "bg-status-speak",
    text: "text-status-speak",
    ring: "border-status-speak/30 bg-status-speak/10",
    glow: "shadow-[0_0_16px_rgba(245,158,11,0.45)]",
    defaultPulse: true,
  },
  offline: {
    label: "Offline",
    dot: "bg-status-error",
    text: "text-status-error",
    ring: "border-status-error/30 bg-status-error/10",
    glow: "shadow-[0_0_14px_rgba(239,68,68,0.4)]",
    defaultPulse: false,
  },
};

/** Small rounded pill: colored dot + label, color-driven by the status token. */
export default function StatusPill({ status, label, pulse, className = "" }: StatusPillProps) {
  const c = CONFIG[status];
  const showPulse = pulse ?? c.defaultPulse;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${c.ring} ${c.text} ${c.glow} ${className}`}
    >
      <span className="relative flex h-2 w-2">
        {showPulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${c.dot} opacity-70 animate-ping`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${c.dot}`} />
      </span>
      {label ?? c.label}
    </span>
  );
}
