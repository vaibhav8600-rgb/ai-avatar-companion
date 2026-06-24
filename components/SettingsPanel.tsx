"use client";

import { useEffect, useState } from "react";
import { getVoices, pickDefaultVoice } from "@/lib/speechSynthesis";
import type { UserMemory } from "@/types";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  memory: UserMemory;
  onMemoryChange: (memory: UserMemory) => void;
  volume: number;
  onVolumeChange: (v: number) => void;
  voiceName?: string;
  onVoiceChange: (name: string) => void;
  pushToTalk: boolean;
  onPushToTalkChange: (v: boolean) => void;
  /** Whether the live video avatar is configured/available on the server. */
  liveAvatarSupported: boolean;
  liveAvatarEnabled: boolean;
  onLiveAvatarChange: (v: boolean) => void;
  onResetConversation: () => void;
}

export default function SettingsPanel({
  open,
  onClose,
  memory,
  onMemoryChange,
  volume,
  onVolumeChange,
  voiceName,
  onVoiceChange,
  pushToTalk,
  onPushToTalkChange,
  liveAvatarSupported,
  liveAvatarEnabled,
  onLiveAvatarChange,
  onResetConversation,
}: SettingsPanelProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    let cancelled = false;
    getVoices().then((vs) => {
      if (cancelled) return;
      // English voices only — keeps the list short and useful.
      const englishVoices = vs.filter((v) => v.lang.startsWith("en"));
      setVoices(englishVoices.length > 0 ? englishVoices : vs);
      if (!voiceName) {
        const def = pickDefaultVoice(vs);
        if (def) onVoiceChange(def.name);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [voiceName, onVoiceChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center bg-ink-900/70 backdrop-blur-sm animate-fade-up"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl border border-white/[0.08] bg-ink-800/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
          <h2 className="font-display text-lg text-cream-50">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid place-items-center h-7 w-7 rounded-full hover:bg-white/[0.06] text-cream-100/60"
            aria-label="Close settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="px-6 py-5 space-y-6">
          <Field label="Your name">
            <input
              type="text"
              value={memory.userName || ""}
              onChange={(e) => onMemoryChange({ ...memory, userName: e.target.value })}
              placeholder="What should she call you?"
              className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-cream-100 text-sm focus:outline-none focus:border-signal-500/60"
            />
          </Field>

          <Field label="Volume">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                className="flex-1 accent-signal-500"
              />
              <span className="text-xs text-cream-100/60 tabular-nums w-10 text-right">
                {Math.round(volume * 100)}%
              </span>
            </div>
          </Field>

          <Field label="Voice">
            <select
              value={voiceName || ""}
              onChange={(e) => onVoiceChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-cream-100 text-sm focus:outline-none focus:border-signal-500/60"
            >
              {voices.length === 0 ? (
                <option value="">System default</option>
              ) : (
                voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))
              )}
            </select>
          </Field>

          {liveAvatarSupported && (
            <Field label="Avatar">
              <div className="flex gap-2">
                <Toggle
                  active={liveAvatarEnabled}
                  onClick={() => onLiveAvatarChange(true)}
                  label="Live video"
                />
                <Toggle
                  active={!liveAvatarEnabled}
                  onClick={() => onLiveAvatarChange(false)}
                  label="Still image"
                />
              </div>
            </Field>
          )}

          <Field label="Mic mode">
            <div className="flex gap-2">
              <Toggle
                active={!pushToTalk}
                onClick={() => onPushToTalkChange(false)}
                label="Click to talk"
              />
              <Toggle
                active={pushToTalk}
                onClick={() => onPushToTalkChange(true)}
                label="Push to talk"
              />
            </div>
          </Field>

          <div className="pt-2 border-t border-white/[0.05]">
            <button
              type="button"
              onClick={() => {
                if (confirm("Reset the entire conversation and forget what's saved?")) {
                  onResetConversation();
                  onClose();
                }
              }}
              className="text-sm text-red-400/80 hover:text-red-400"
            >
              Reset conversation & memory
            </button>
          </div>

          <p className="text-center text-[10px] uppercase tracking-[0.2em] text-cream-100/25">
            Crafted by Vaibhav Rajput
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] uppercase tracking-[0.18em] text-cream-100/50">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex-1 px-3 py-2 rounded-lg text-xs transition-colors
        ${active
          ? "bg-signal-500/20 border border-signal-500/50 text-signal-400"
          : "bg-white/[0.03] border border-white/[0.06] text-cream-100/70 hover:bg-white/[0.05]"
        }
      `}
    >
      {label}
    </button>
  );
}
