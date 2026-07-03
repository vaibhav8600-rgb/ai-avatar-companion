"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import MiraLogo from "@/components/ui/MiraLogo";
import type { ChatMessage } from "@/types";

interface ChatTranscriptProps {
  messages: ChatMessage[];
  expanded: boolean;
  onToggle: () => void;
  assistantName: string;
}

/**
 * Slide-out right transcript panel (mockup image 13): glass message cards
 * (alternating You / Mira), a date divider, client-side search, an auto-scroll
 * indicator, and a Collapse button. Opened from the transcript button in the
 * main header.
 */
export default function ChatTranscript({
  messages,
  expanded,
  onToggle,
  assistantName,
}: ChatTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, expanded]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? messages.filter((m) => m.content.toLowerCase().includes(q)) : messages;
  }, [messages, query]);

  const dateLabel = useMemo(() => {
    const iso = messages[0]?.timestamp;
    try {
      return `Today, ${new Date(iso ?? Date.now()).toLocaleDateString([], { month: "long", day: "numeric" })}`;
    } catch {
      return "Today";
    }
  }, [messages]);

  return (
    <>
      <AnimatePresence>
        {expanded && (
          <motion.aside
            initial={{ x: "100%", opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.4 }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed right-0 top-0 z-40 flex h-dvh w-[min(400px,100vw)] flex-col glass rounded-none border-l border-white/10 sm:right-4 sm:top-4 sm:h-[calc(100dvh-2rem)] sm:rounded-panel sm:border"
          >
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient-soft text-accent-cyan">
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
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6M8 13h8M8 17h5" />
                </svg>
              </span>
              <span className="flex-1 text-lg font-semibold text-ink-primary">Transcript</span>
              <button
                type="button"
                onClick={onToggle}
                aria-label="Collapse transcript"
                className="grid h-8 w-8 place-items-center rounded-full text-ink-secondary hover:bg-white/10 hover:text-ink-primary"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m17 11-5-5-5 5M17 18l-5-5-5 5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={onToggle}
                aria-label="Close transcript"
                className="grid h-8 w-8 place-items-center rounded-full text-ink-secondary hover:bg-white/10 hover:text-ink-primary"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </header>

            {/* Date divider */}
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-xs text-ink-muted">{dateLabel}</span>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="thin-scroll flex-1 space-y-3 overflow-y-auto px-4 pb-2">
              {filtered.length === 0 ? (
                <p className="px-1 text-sm italic text-ink-muted">
                  {query ? "No matching messages." : "Your conversation will appear here."}
                </p>
              ) : (
                filtered.map((m) => (
                  <TranscriptCard key={m.id} message={m} assistantName={assistantName} />
                ))
              )}
            </div>

            {/* Search + auto-scroll */}
            <div className="space-y-3 border-t border-white/[0.06] px-4 py-4">
              <div className="flex items-center gap-2">
                <div className="glass flex flex-1 items-center gap-2 rounded-full px-3 py-2">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="text-ink-muted"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search transcript"
                    className="flex-1 bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none"
                  />
                </div>
                <span className="grid h-9 w-9 place-items-center rounded-full glass text-ink-secondary">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                  >
                    <path d="M4 6h16M7 12h10M10 18h4" />
                  </svg>
                </span>
              </div>
              <div className="flex items-center gap-2 px-1 text-xs text-ink-secondary">
                <span className="h-2 w-2 rounded-full bg-status-ready" /> Auto-scroll is on
              </div>
              <button
                type="button"
                onClick={onToggle}
                className="w-full rounded-full border border-accent-violet/40 bg-brand-gradient-soft py-2.5 text-sm font-medium text-ink-primary hover:bg-brand-gradient-soft/80"
              >
                ‹ Collapse Panel
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

function TranscriptCard({
  message,
  assistantName,
}: {
  message: ChatMessage;
  assistantName: string;
}) {
  const isUser = message.role === "user";
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-card border p-3.5 ${isUser ? "border-white/[0.06] bg-white/[0.03]" : "border-accent-violet/15 bg-brand-gradient-soft"}`}
    >
      <div className="flex items-center gap-2">
        {isUser ? (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-status-listen/15 text-status-listen">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          </span>
        ) : (
          <MiraLogo size={24} pulse={false} />
        )}
        <span
          className={`text-sm font-semibold ${isUser ? "text-status-listen" : "text-accent-cyan"}`}
        >
          {isUser ? "You" : assistantName}
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-ink-muted">
          {formatTime(message.timestamp)}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-primary/90">
        {message.content}
      </p>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
