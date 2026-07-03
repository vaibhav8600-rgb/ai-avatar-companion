"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { fileToAttachment } from "@/lib/imageAttachment";
import Skeleton from "@/components/ui/Skeleton";
import type { ChatMessage } from "@/types";

interface ChatViewProps {
  messages: ChatMessage[];
  assistantName: string;
  /** True while waiting for a reply — shows the typing indicator. */
  thinking: boolean;
  /** `image` is an optional data-URL attachment (analyzed via Mira Vision). */
  onSend: (text: string, image?: string) => void;
  onBack: () => void;
}

/**
 * Cosmic messenger chat (mockups 7 & 14) over the same conversation the voice
 * call uses. Mira's portrait-halo backdrop, glass received bubbles (left) and
 * gradient sent bubbles (right) with timestamps + read marks, a typing
 * indicator, and a sticky composer. Text-only — no voice playback.
 */
export default function ChatView({
  messages,
  assistantName,
  thinking,
  onSend,
  onBack,
}: ChatViewProps) {
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [viewportH, setViewportH] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking, viewportH]);

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
    if (!text && !attachment) return;
    onSend(text, attachment ?? undefined);
    setDraft("");
    setAttachment(null);
  };

  const pickFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setAttaching(true);
    try {
      const scaled = await fileToAttachment(file);
      if (scaled) setAttachment(scaled);
    } catch {
      /* ignore unreadable files */
    } finally {
      setAttaching(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-x-0 top-0 z-40 mx-auto flex max-w-2xl flex-col bg-cosmic-base/92 backdrop-blur-xl"
      style={{ height: viewportH ? `${viewportH}px` : "100dvh" }}
    >
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-white/[0.06] px-3 pb-3 pt-[calc(0.7rem_+_env(safe-area-inset-top))] sm:px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to call"
          className="grid h-9 w-9 place-items-center rounded-full text-ink-secondary hover:bg-white/[0.06] hover:text-ink-primary"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-accent-violet/30">
          <Image src="/avatar.png" alt={assistantName} fill sizes="40px" className="object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-tight text-ink-primary">
            {assistantName}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] leading-tight text-ink-secondary">
            <span
              className={`h-1.5 w-1.5 rounded-full ${thinking ? "bg-status-speak" : "bg-status-ready"}`}
            />
            {thinking ? "typing…" : "Online"}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs text-ink-secondary">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            className="text-accent-cyan"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path d="M12 2 20 7v10l-8 5-8-5V7z" />
          </svg>
          AI Companion
        </span>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="thin-scroll flex-1 space-y-2.5 overflow-y-auto px-3 py-4 sm:px-5"
      >
        {messages.length === 0 && !thinking ? (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <PortraitHalo name={assistantName} />
            <p className="max-w-xs text-center text-sm leading-relaxed text-ink-muted">
              Say hello to {assistantName}. Messages here are text-only — switch to the call to hear
              her voice.
            </p>
          </div>
        ) : (
          <>
            {messages.length > 0 && (
              <div className="mb-4 flex justify-center">
                <PortraitHalo name={assistantName} small />
              </div>
            )}
            {messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
          </>
        )}
        {thinking && <TypingBubble />}
      </div>

      {/* Composer */}
      <div className="border-t border-white/[0.06] px-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-3 sm:px-4">
        {/* Attachment preview */}
        {(attachment || attaching) && (
          <div className="mb-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
            {attaching ? (
              <Skeleton rounded="rounded-xl" className="h-14 w-14" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attachment!}
                alt="Attachment preview"
                className="h-14 w-14 rounded-xl border border-white/10 object-cover"
              />
            )}
            <span className="flex-1 truncate text-sm text-ink-secondary">
              {attaching ? "Preparing image…" : "Image ready to send"}
            </span>
            {!attaching && (
              <button
                type="button"
                onClick={() => setAttachment(null)}
                aria-label="Remove attachment"
                className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-white/10 hover:text-ink-primary"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            aria-label="Attach image"
            onClick={() => fileRef.current?.click()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:text-accent-violet"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21.44 11.05-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.33 3.33 0 0 1 4.71 4.71l-9.2 9.19a1.67 1.67 0 0 1-2.36-2.36l8.49-8.48" />
            </svg>
          </button>
          <div className="glass flex flex-1 items-center rounded-full px-4 py-2.5 focus-within:border-accent-violet/40">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={attachment ? "Add a caption…" : "Type a message…"}
              className="flex-1 bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={(!draft.trim() && !attachment) || attaching}
            aria-label="Send message"
            className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-onbrand disabled:opacity-30"
          >
            <span aria-hidden className="absolute inset-0 rounded-full bg-brand-gradient" />
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="relative"
            >
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22l-4-9-9-4 20-7z" />
            </svg>
          </button>
        </form>
      </div>
    </motion.div>
  );
}

function PortraitHalo({ name, small = false }: { name: string; small?: boolean }) {
  const d = small ? 88 : 132;
  return (
    <div className="relative grid place-items-center" style={{ width: d, height: d }}>
      <span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          boxShadow: "0 0 60px 8px rgba(251,146,60,0.35)",
          border: "2px solid rgba(251,146,60,0.55)",
        }}
      />
      <div
        className="relative overflow-hidden rounded-full"
        style={{ width: d * 0.86, height: d * 0.86 }}
      >
        <Image src="/avatar.png" alt={name} fill sizes="132px" className="object-cover" />
      </div>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`relative max-w-[82%] px-4 py-2.5 text-sm leading-relaxed sm:max-w-[70%] ${
          isUser
            ? "rounded-2xl rounded-br-md bg-brand-gradient text-onbrand"
            : "glass rounded-2xl rounded-bl-md text-ink-primary"
        }`}
      >
        {message.imageBase64 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.imageBase64}
            alt="Shared attachment"
            className="mb-2 max-h-64 w-full rounded-xl border border-white/10 object-cover"
          />
        )}
        {message.content && (
          <span className="whitespace-pre-wrap break-words">{message.content}</span>
        )}
        <span
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums ${isUser ? "text-onbrand/70" : "text-ink-muted"}`}
        >
          {formatTime(message.timestamp)}
          {isUser && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3 12 4 4 8-9M11 16l2 2 8-9" />
            </svg>
          )}
        </span>
      </div>
    </motion.div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="glass rounded-2xl rounded-bl-md px-4 py-3">
        <span className="flex gap-1">
          {[0, 0.2, 0.4].map((delay) => (
            <span
              key={delay}
              className="h-1.5 w-1.5 rounded-full bg-ink-secondary"
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
