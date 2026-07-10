"use client";

export type VoiceMode = "live" | "classic";

/**
 * Tiny, understated badge showing which voice pipeline is answering: the
 * realtime Gemini Live session or the classic STT → chat → TTS chain. A
 * transparency/debugging aid next to the StatusPill — deliberately quiet,
 * not a marketing badge.
 */
export default function VoiceModePill({
  mode,
  className = "",
}: {
  mode: VoiceMode;
  className?: string;
}) {
  const live = mode === "live";
  return (
    <span
      title={
        live ? "Realtime voice (Gemini Live)" : "Classic voice pipeline (speech recognition + TTS)"
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
        live
          ? "border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan"
          : "border-white/10 bg-white/[0.04] text-ink-muted"
      } ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-accent-cyan" : "bg-ink-muted"}`} />
      {live ? "Live" : "Classic"}
    </span>
  );
}
