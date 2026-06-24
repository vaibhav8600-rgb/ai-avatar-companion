"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { ChatMessage } from "@/types";

interface ChatViewProps {
  messages: ChatMessage[];
  assistantName: string;
  /** True while waiting for a reply — shows the typing indicator. */
  thinking: boolean;
  onSend: (text: string) => void;
  onBack: () => void;
}

/**
 * A WhatsApp-style text chat over the same conversation the voice call uses.
 * Full-screen messaging UI: contact header, bubble timeline with timestamps,
 * a typing indicator, and a sticky composer. Sending here is text-only — no
 * voice playback — so it works as a quiet, manual way to talk to Mira.
 */
export default function ChatView({
  messages,
  assistantName,
  thinking,
  onSend,
  onBack,
}: ChatViewProps) {
  const [draft, setDraft] = useState("");
  const [viewportH, setViewportH] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep pinned to the latest message / typing indicator.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking, viewportH]);

  // Track the *visual* viewport so the composer stays above the iOS keyboard.
  // `fixed inset-0` would keep the panel full-height and hide the input behind
  // the keyboard; sizing to visualViewport.height shrinks with it instead.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewportH(vv.height);
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onSend(text);
  };

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 flex flex-col bg-ink-900 animate-fade-up"
      style={{ height: viewportH ? `${viewportH}px` : "100dvh" }}
    >
      {/* Header */}
      <header className="flex items-center gap-3 px-3 sm:px-4 pb-2.5 pt-[calc(0.625rem_+_env(safe-area-inset-top))] bg-ink-800/95 border-b border-white/[0.06] backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="grid place-items-center h-9 w-9 rounded-full hover:bg-white/[0.06] text-cream-100/80"
          aria-label="Back to call"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10">
          <Image src="/avatar.png" alt={assistantName} fill sizes="40px" className="object-cover" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-cream-50 leading-tight truncate">
            {assistantName}
          </p>
          <p className="text-[11px] text-signal-400/80 leading-tight">
            {thinking ? "typing…" : "online"}
          </p>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="transcript-scroll flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2"
      >
        {messages.length === 0 && !thinking ? (
          <div className="h-full grid place-items-center">
            <p className="max-w-xs text-center text-sm text-cream-100/40 leading-relaxed">
              Say hello to {assistantName}. Messages here are text-only — switch
              to the call to hear her voice.
            </p>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} />)
        )}

        {thinking && <TypingBubble />}
      </div>

      {/* Composer */}
      <div className="px-3 sm:px-4 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] bg-ink-800/95 border-t border-white/[0.06]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-end gap-2"
        >
          <div className="flex-1 flex items-center rounded-2xl bg-white/[0.04] border border-white/[0.08] focus-within:border-signal-500/40 transition-colors px-4 py-2.5">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message ${assistantName}…`}
              className="flex-1 bg-transparent text-sm text-cream-100 placeholder:text-cream-100/30 focus:outline-none"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send message"
            className="grid place-items-center h-11 w-11 shrink-0 rounded-full bg-signal-500 text-ink-900 transition-all hover:bg-signal-400 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22l-4-9-9-4 20-7z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`
          max-w-[80%] sm:max-w-[70%] px-3.5 py-2 text-sm leading-relaxed
          shadow-[0_1px_2px_rgba(0,0,0,0.3)]
          ${isUser
            ? "bg-signal-600/90 text-cream-50 rounded-2xl rounded-br-md"
            : "bg-ink-700 text-cream-100 rounded-2xl rounded-bl-md"
          }
        `}
      >
        <span className="whitespace-pre-wrap break-words">{message.content}</span>
        <span
          className={`block text-[10px] mt-1 text-right tabular-nums ${
            isUser ? "text-cream-50/60" : "text-cream-100/40"
          }`}
        >
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="bg-ink-700 rounded-2xl rounded-bl-md px-4 py-3">
        <span className="flex gap-1">
          {[0, 0.2, 0.4].map((delay) => (
            <span
              key={delay}
              className="h-1.5 w-1.5 rounded-full bg-cream-100/50"
              style={{ animation: `chatTyping 1.2s ease-in-out ${delay}s infinite` }}
            />
          ))}
        </span>
      </div>
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
