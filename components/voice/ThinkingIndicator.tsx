"use client";

import { motion } from "framer-motion";

/** "Analyzing your request… ⋯" progress bar with a brain icon (Thinking state). */
export default function ThinkingIndicator({ className = "" }: { className?: string }) {
  return (
    <div className={`glass flex items-center gap-3 rounded-card px-5 py-3.5 ${className}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-status-think/15 text-status-think">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V17a3 3 0 0 0 4 2.8A3 3 0 0 0 12 21a3 3 0 0 0 3-1.2 3 3 0 0 0 4-2.8v-5.2A3 3 0 0 0 18 6a3 3 0 0 0-3-3 3 3 0 0 0-3 1.5A3 3 0 0 0 9 3Z" />
          <path d="M12 4.5v16.5" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-primary">Analyzing your request</span>
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1 w-1 rounded-full bg-ink-secondary"
                style={{
                  animation: "chatTyping 1.2s ease-in-out infinite",
                  animationDelay: `${i * 0.18}s`,
                }}
              />
            ))}
          </span>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-brand-gradient"
            initial={{ x: "-100%" }}
            animate={{ x: ["-100%", "0%", "100%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            style={{ width: "60%" }}
          />
        </div>
      </div>
    </div>
  );
}
