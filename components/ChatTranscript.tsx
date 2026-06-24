"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/types";

interface ChatTranscriptProps {
  messages: ChatMessage[];
  expanded: boolean;
  onToggle: () => void;
  assistantName: string;
}

export default function ChatTranscript({
  messages,
  expanded,
  onToggle,
  assistantName,
}: ChatTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, expanded]);

  return (
    <div
      className={`
        fixed right-4 sm:right-6 top-1/2 -translate-y-1/2 z-20
        rounded-2xl border border-white/[0.06] bg-ink-800/70 backdrop-blur-md
        shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]
        transition-all duration-400 ease-out
        ${expanded
          ? "w-[min(360px,calc(100vw-2rem))] h-[60dvh] max-h-[520px]"
          : "w-12 h-12"
        }
        overflow-hidden
      `}
      style={{ transitionProperty: "width, height" }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="absolute top-3 right-3 z-10 grid place-items-center h-6 w-6 rounded-full hover:bg-white/[0.06] text-cream-100/70"
        aria-label={expanded ? "Collapse transcript" : "Expand transcript"}
      >
        {expanded ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {expanded && (
        <div className="h-full flex flex-col">
          <div className="px-5 py-3 border-b border-white/[0.05]">
            <p className="text-[10px] uppercase tracking-[0.2em] text-cream-100/40">
              Transcript
            </p>
          </div>

          <div
            ref={scrollRef}
            className="transcript-scroll flex-1 overflow-y-auto px-5 py-4 space-y-4"
          >
            {messages.length === 0 ? (
              <p className="text-sm text-cream-100/40 italic">
                Your conversation will appear here.
              </p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-cream-100/40">
                    {m.role === "user" ? "You" : assistantName}
                  </p>
                  <p
                    className={`text-sm leading-relaxed ${
                      m.role === "user" ? "text-cream-100" : "text-signal-400"
                    }`}
                  >
                    {m.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
