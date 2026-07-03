"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { MutableRefObject } from "react";
import Waveform from "./Waveform";

interface CaptionBarProps {
  mode: "listening" | "speaking";
  /** Listening: the interim/user transcript. Speaking: Mira's reply text. */
  text: string;
  levelRef?: MutableRefObject<number>;
  assistantName?: string;
  className?: string;
}

/**
 * The caption card under the mic. In listening mode it shows "You: …" over a
 * reactive blue waveform; in speaking mode it shows Mira's response bubble with
 * an amber waveform underline.
 */
export default function CaptionBar({
  mode,
  text,
  levelRef,
  assistantName = "Mira",
  className = "",
}: CaptionBarProps) {
  const listening = mode === "listening";
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
        className={`glass w-full max-w-xl rounded-card px-5 py-4 ${className}`}
      >
        <p className="text-center text-base leading-relaxed text-ink-primary">
          <span
            className={`font-semibold ${listening ? "text-status-listen" : "text-accent-cyan"}`}
          >
            {listening ? "You:" : `${assistantName}:`}
          </span>{" "}
          {text || (listening ? "Listening…" : "")}
        </p>
        <div className="mt-3 flex justify-center">
          <Waveform
            levelRef={levelRef}
            tone={listening ? "blue" : "amber"}
            bars={64}
            width={420}
            height={36}
            className="max-w-full"
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
