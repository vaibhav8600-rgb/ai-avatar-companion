"use client";

import { motion } from "framer-motion";
import type { MutableRefObject } from "react";
import Waveform from "./Waveform";
import type { AvatarState } from "@/types";

interface VoiceMicProps {
  state: AvatarState;
  levelRef?: MutableRefObject<number>;
  onPress: () => void;
  onRelease?: () => void;
  pushToTalk?: boolean;
  disabled?: boolean;
}

/**
 * The central call control: a large gradient-filled mic with a soft outer glow
 * and an amplitude-reactive waveform fanning out to each side. The glow/waveform
 * tone tracks state (blue listening, amber speaking, brand idle).
 */
export default function VoiceMic({
  state,
  levelRef,
  onPress,
  onRelease,
  pushToTalk = false,
  disabled = false,
}: VoiceMicProps) {
  const isListening = state === "listening";
  const isSpeaking = state === "speaking";
  // "thinking" no longer disables the mic — pressing it aborts the in-flight
  // turn and starts listening (the page handles that), so a slow/stuck reply
  // can never lock the user out of the primary control.
  const tone = isListening ? "blue" : isSpeaking ? "amber" : "violet";

  const handlers = pushToTalk
    ? {
        onPointerDown: () => !disabled && onPress(),
        onPointerUp: () => !disabled && onRelease?.(),
        onPointerLeave: () => !disabled && isListening && onRelease?.(),
      }
    : { onClick: () => !disabled && onPress() };

  return (
    <div className="flex items-center justify-center gap-1">
      <Waveform
        levelRef={levelRef}
        tone={tone}
        width={150}
        height={56}
        className="hidden sm:block scale-x-[-1]"
      />

      <motion.button
        type="button"
        disabled={disabled}
        aria-label={isListening ? "Stop listening" : "Start listening"}
        aria-pressed={isListening}
        whileTap={disabled ? undefined : { scale: 0.94 }}
        className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-violet/70 disabled:opacity-50 sm:h-[104px] sm:w-[104px]"
        {...handlers}
      >
        {/* Pulsing outer glow (opacity-only). */}
        <span
          aria-hidden
          className={`absolute inset-0 rounded-full blur-xl ${
            isListening
              ? "bg-status-listen/60"
              : isSpeaking
                ? "bg-status-speak/60"
                : "bg-brand-gradient opacity-60"
          } ${!disabled ? "animate-pulse-slow" : ""}`}
        />
        {/* Rotating ring accent. */}
        <span
          aria-hidden
          className={`absolute -inset-1 rounded-full ${
            isListening ? "bg-status-listen" : isSpeaking ? "bg-status-speak" : "bg-brand-gradient"
          } opacity-70 blur-[2px]`}
        />
        <span aria-hidden className="absolute inset-[3px] rounded-full bg-cosmic-elevated" />
        {/* Gradient fill face. */}
        <span
          aria-hidden
          className={`absolute inset-[6px] rounded-full ${
            isListening ? "bg-status-listen" : isSpeaking ? "bg-status-speak" : "bg-brand-gradient"
          }`}
          style={{ opacity: isListening || isSpeaking ? 0.85 : 1 }}
        />
        <MicGlyph className="relative z-10 text-onbrand" />
      </motion.button>

      <Waveform
        levelRef={levelRef}
        tone={tone}
        width={150}
        height={56}
        className="hidden sm:block"
      />
    </div>
  );
}

function MicGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}
