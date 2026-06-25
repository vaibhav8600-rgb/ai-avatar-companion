"use client";

import type { AvatarState } from "@/types";

const LABELS: Record<AvatarState, { text: string; dot: string }> = {
  idle:        { text: "Ready",        dot: "bg-cream-100/50" },
  listening:   { text: "Listening",    dot: "bg-signal-500" },
  thinking:    { text: "Thinking…",    dot: "bg-signal-400" },
  speaking:    { text: "Speaking",     dot: "bg-warm-400" },
  error:       { text: "Disconnected", dot: "bg-red-400" },
  muted:       { text: "Muted",        dot: "bg-cream-200/40" },
  looking:     { text: "Looking…",     dot: "bg-signal-400" },
  learning:    { text: "Learning…",    dot: "bg-warm-400" },
  recognizing: { text: "Recognizing…", dot: "bg-signal-400" },
  recognized:  { text: "Recognized",   dot: "bg-signal-500" },
  uncertain:   { text: "Not sure…",    dot: "bg-warm-500" },
};

interface StatusIndicatorProps {
  state: AvatarState;
  /** Name to greet by, e.g. "Mira" */
  assistantName?: string;
}

export default function StatusIndicator({ state, assistantName }: StatusIndicatorProps) {
  const { text, dot } = LABELS[state];
  const showPulse =
    state === "listening" ||
    state === "thinking" ||
    state === "speaking" ||
    state === "looking" ||
    state === "learning" ||
    state === "recognizing";

  return (
    <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm">
      <span className="relative flex h-2 w-2">
        {showPulse && (
          <span className={`absolute inline-flex h-full w-full rounded-full ${dot} opacity-60 animate-ping`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dot}`} />
      </span>
      <span className="text-xs uppercase tracking-[0.18em] text-cream-100/70 font-medium">
        {assistantName ? `${assistantName} · ${text}` : text}
      </span>
    </div>
  );
}
