"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { getVoices, pickDefaultVoice, speak, stopSpeaking } from "@/lib/speechSynthesis";
import { TTS_MODEL_OPTIONS, GEMINI_VOICE_OPTIONS } from "@/lib/ttsModels";
import VisionMemoryPanel from "@/components/VisionMemoryPanel";
import AvatarModeModal from "@/components/AvatarModeModal";
import BuiltByFooter from "@/components/ui/BuiltByFooter";
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
  handsFree: boolean;
  onHandsFreeChange: (v: boolean) => void;
  captionsEnabled: boolean;
  onCaptionsChange: (v: boolean) => void;
  liveAvatarSupported: boolean;
  liveAvatarEnabled: boolean;
  onLiveAvatarChange: (v: boolean) => void;
  ttsModel: string;
  onTtsModelChange: (model: string) => void;
  geminiVoice: string;
  onGeminiVoiceChange: (voice: string) => void;
  knownPersonRecognition: boolean;
  onKnownPersonRecognitionChange: (v: boolean) => void;
  liveVisionEnabled: boolean;
  onLiveVisionChange: (v: boolean) => void;
  autoCaptureVision: boolean;
  onAutoCaptureVisionChange: (v: boolean) => void;
  onResetPermissions: () => void;
  onResetConversation: () => void;
  /** Download the conversation + memory as JSON. */
  onExportConversation: () => void;
  /** Restore a conversation from a JSON export file. */
  onImportConversation: (file: File) => void;
}

/**
 * Settings modal (mockup image 12): glass panel with icon · title · subtitle ·
 * control rows. The primary rows match the mockup; provider/vision/model extras
 * live under an Advanced disclosure so no functionality is lost. Esc + backdrop
 * close, initial focus, and a simple Tab focus-trap for a11y.
 */
export default function SettingsPanel(props: SettingsPanelProps) {
  const {
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
    handsFree,
    onHandsFreeChange,
    captionsEnabled,
    onCaptionsChange,
    liveAvatarSupported,
    liveAvatarEnabled,
    onLiveAvatarChange,
    ttsModel,
    onTtsModelChange,
    geminiVoice,
    onGeminiVoiceChange,
    knownPersonRecognition,
    onKnownPersonRecognitionChange,
    liveVisionEnabled,
    onLiveVisionChange,
    autoCaptureVision,
    onAutoCaptureVisionChange,
    onResetPermissions,
    onResetConversation,
    onExportConversation,
    onImportConversation,
  } = props;

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [visionMemoryOpen, setVisionMemoryOpen] = useState(false);
  const [avatarModeOpen, setAvatarModeOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const convFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getVoices().then((vs) => {
      if (cancelled) return;
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

  // Esc to close + simple Tab focus-trap.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const f = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const previewVoice = () => {
    stopSpeaking();
    speak({ text: "Hi, I'm Mira. This is how I sound.", voiceName, volume });
  };

  // NOTE: no AnimatePresence / `exit` animation on this full-screen backdrop.
  // While the live avatar is connected, the page re-renders continuously
  // (Simli status, keepalive, video events); those re-renders interrupt a
  // Framer exit animation and leave the `fixed inset-0` backdrop mounted —
  // permanently blocking every click ("UI freeze"). Rendering conditionally
  // makes close an instant, guaranteed unmount. Enter animation is preserved.
  if (!open) return null;
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-40 grid place-items-center bg-cosmic-base/70 p-2 backdrop-blur-sm sm:p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        {/* Neon glow border */}
        <motion.div
          ref={panelRef}
          initial={{ scale: 0.96, y: 12, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-panel bg-brand-gradient opacity-50 blur-md"
          />
          <div className="glass relative flex max-h-[92dvh] flex-col overflow-hidden rounded-panel">
            {/* Header */}
            <header className="flex shrink-0 items-center gap-3 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-gradient-soft text-accent-violet ring-1 ring-accent-violet/30">
                <GearIcon />
              </span>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-ink-primary">Settings</h2>
                <p className="text-sm text-ink-secondary">Customize your Mira experience</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close settings"
                className="grid h-10 w-10 place-items-center rounded-full glass text-ink-secondary hover:text-ink-primary"
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

            {/* Rows */}
            <div className="thin-scroll min-h-0 flex-1 divide-y divide-white/[0.06] overflow-y-auto overflow-x-hidden px-4 sm:px-6">
              <Row icon={<UserIcon />} title="Your Name" subtitle="Personalize your experience">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <input
                    value={memory.userName || ""}
                    onChange={(e) => onMemoryChange({ ...memory, userName: e.target.value })}
                    placeholder="What should she call you?"
                    className="w-36 max-w-full bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none sm:w-44"
                  />
                  <PencilIcon />
                </div>
              </Row>

              <Row icon={<VoiceIcon />} title="Voice Selection" subtitle="Choose Mira's voice">
                <div className="flex items-center gap-2">
                  <SelectField value={voiceName || ""} onChange={onVoiceChange}>
                    {voices.length === 0 ? (
                      <option value="">System default</option>
                    ) : (
                      voices.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name}
                        </option>
                      ))
                    )}
                  </SelectField>
                  <button
                    type="button"
                    onClick={previewVoice}
                    aria-label="Preview voice"
                    className="grid h-10 w-10 place-items-center rounded-full bg-brand-gradient-soft text-accent-violet ring-1 ring-accent-violet/30 hover:text-ink-primary"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </div>
              </Row>

              <Row icon={<VolumeIcon />} title="Volume" subtitle="Adjust voice output">
                <div className="flex w-56 items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={volume}
                    onChange={(e) => onVolumeChange(Number(e.target.value))}
                    className="flex-1 accent-accent-violet"
                  />
                  <span className="w-10 text-right text-sm tabular-nums text-ink-secondary">
                    {Math.round(volume * 100)}%
                  </span>
                </div>
              </Row>

              {liveAvatarSupported && (
                <Row icon={<VideoIcon />} title="Avatar Mode" subtitle="Choose how Mira appears">
                  <div className="flex items-center gap-2">
                    <Segmented
                      options={[
                        { label: "Live Video", value: "live", icon: <VideoIcon small /> },
                        { label: "Still Image", value: "still", icon: <ImageIcon /> },
                      ]}
                      value={liveAvatarEnabled ? "live" : "still"}
                      onChange={(v) => onLiveAvatarChange(v === "live")}
                    />
                    <button
                      type="button"
                      onClick={() => setAvatarModeOpen(true)}
                      aria-label="More avatar options"
                      className="grid h-9 w-9 place-items-center rounded-full glass text-ink-secondary hover:text-ink-primary"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <circle cx="5" cy="12" r="1.6" />
                        <circle cx="12" cy="12" r="1.6" />
                        <circle cx="19" cy="12" r="1.6" />
                      </svg>
                    </button>
                  </div>
                </Row>
              )}

              <Row
                icon={<HandIcon />}
                title="Hands-free Mode"
                subtitle="Enable voice-activated interaction"
              >
                <Switch checked={handsFree} onChange={onHandsFreeChange} label="Hands-free mode" />
              </Row>

              <Row
                icon={<CaptionIcon />}
                title="Captions"
                subtitle="Show subtitles during conversation"
              >
                <Switch checked={captionsEnabled} onChange={onCaptionsChange} label="Captions" />
              </Row>

              <Row icon={<MicIcon />} title="Mic Mode" subtitle="Control how you talk to Mira">
                <Segmented
                  options={[
                    { label: "Push-to-Talk", value: "ptt", icon: <MicIcon small /> },
                    { label: "Click-to-Toggle", value: "toggle", icon: <CursorIcon /> },
                  ]}
                  value={pushToTalk ? "ptt" : "toggle"}
                  onChange={(v) => onPushToTalkChange(v === "ptt")}
                />
              </Row>

              {/* Advanced (provider/model/vision extras — preserved) */}
              <div className="py-4">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="flex w-full items-center justify-between text-sm font-medium text-ink-secondary hover:text-ink-primary"
                >
                  Advanced &amp; Mira Vision
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className={`transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <AnimatePresence initial={false}>
                  {advancedOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-4 pt-4">
                        <MiniField
                          label="Avatar voice model"
                          hint="Live video avatar voice; auto-falls back if unavailable."
                        >
                          <SelectField value={ttsModel} onChange={onTtsModelChange} full>
                            {TTS_MODEL_OPTIONS.map((m) => (
                              <option key={m.id || "auto"} value={m.id}>
                                {m.label}
                                {m.hint ? ` — ${m.hint}` : ""}
                              </option>
                            ))}
                          </SelectField>
                        </MiniField>
                        <MiniField label="Avatar voice persona">
                          <SelectField value={geminiVoice} onChange={onGeminiVoiceChange} full>
                            {GEMINI_VOICE_OPTIONS.map((v) => (
                              <option key={v.id || "default"} value={v.id}>
                                {v.label}
                              </option>
                            ))}
                          </SelectField>
                        </MiniField>
                        <ToggleRow
                          label="Live Vision conversation"
                          hint="Talk to the camera — “What do you see?”, “Remember this as…”"
                          checked={liveVisionEnabled}
                          onChange={onLiveVisionChange}
                        />
                        <ToggleRow
                          label="Auto-capture for vision questions"
                          hint="Grab a frame automatically when you ask about the view"
                          checked={autoCaptureVision}
                          onChange={onAutoCaptureVisionChange}
                        />
                        <ToggleRow
                          label="Known-person recognition"
                          hint="Only matches people you enrolled with consent"
                          checked={knownPersonRecognition}
                          onChange={onKnownPersonRecognitionChange}
                        />
                        <div className="flex items-center justify-between gap-3 opacity-80">
                          <div>
                            <p className="text-sm text-ink-primary">Ask before saving a person</p>
                            <p className="text-xs text-ink-muted">Always on for privacy</p>
                          </div>
                          <span className="text-xs uppercase tracking-wider text-accent-cyan">
                            Always
                          </span>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => setVisionMemoryOpen(true)}
                            className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-ink-primary hover:bg-white/[0.06]"
                          >
                            Manage visual memories…
                          </button>
                          <button
                            type="button"
                            onClick={onResetPermissions}
                            className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-ink-primary hover:bg-white/[0.06]"
                          >
                            Re-run permission setup…
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Row
                icon={<BackupIcon />}
                title="Conversation Backup"
                subtitle="Export or restore chat as JSON"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onExportConversation}
                    className="rounded-full border border-white/10 px-3.5 py-2 text-sm font-medium text-ink-primary hover:bg-white/[0.06]"
                  >
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={() => convFileRef.current?.click()}
                    className="rounded-full border border-white/10 px-3.5 py-2 text-sm font-medium text-ink-primary hover:bg-white/[0.06]"
                  >
                    Import
                  </button>
                  <input
                    ref={convFileRef}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onImportConversation(f);
                      e.target.value = "";
                    }}
                  />
                </div>
              </Row>

              <Row
                icon={<ResetIcon />}
                title="Reset Conversation"
                subtitle="Clear the current conversation"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Reset the current conversation?")) {
                      onResetConversation();
                      onClose();
                    }
                  }}
                  className="rounded-full border border-status-speak/50 px-4 py-2 text-sm font-medium text-status-speak hover:bg-status-speak/10"
                >
                  Reset Now
                </button>
              </Row>

              <Row
                icon={<TrashIcon />}
                title="Clear Local Memory"
                subtitle="Delete all locally stored data"
                danger
              >
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Delete all locally stored data (conversation + memory)?")) {
                      onResetConversation();
                      onClose();
                    }
                  }}
                  className="rounded-full border border-status-error/50 px-4 py-2 text-sm font-medium text-status-error hover:bg-status-error/10"
                >
                  Clear Now
                </button>
              </Row>
            </div>

            <footer className="shrink-0 px-6 py-4">
              <BuiltByFooter withTitle />
            </footer>
          </div>
        </motion.div>

        {/* Nested modals — click-guarded from the backdrop. */}
        <div onClick={(e) => e.stopPropagation()}>
          <VisionMemoryPanel
            open={visionMemoryOpen}
            onClose={() => setVisionMemoryOpen(false)}
            knownPersonRecognition={knownPersonRecognition}
            onKnownPersonRecognitionChange={onKnownPersonRecognitionChange}
          />
          {liveAvatarSupported && (
            <AvatarModeModal
              open={avatarModeOpen}
              onClose={() => setAvatarModeOpen(false)}
              liveAvatarEnabled={liveAvatarEnabled}
              onLiveAvatarChange={onLiveAvatarChange}
            />
          )}
        </div>
      </motion.div>
    </>
  );
}

/* ---- row + control primitives ---- */

function Row({
  icon,
  title,
  subtitle,
  danger,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  danger?: boolean;
  children: ReactNode;
}) {
  // flex-wrap: wide controls (segmented toggles, selects) drop onto their own
  // full-width line on narrow phones instead of forcing horizontal overflow
  // that pushed the whole panel off-screen.
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4">
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ring-1 ${danger ? "bg-status-error/10 text-status-error ring-status-error/30" : "glass text-ink-secondary ring-white/10"}`}
      >
        {icon}
      </span>
      <div className="min-w-[8.5rem] flex-1">
        <p className={`font-semibold ${danger ? "text-status-error" : "text-ink-primary"}`}>
          {title}
        </p>
        <p className="text-xs text-ink-secondary">{subtitle}</p>
      </div>
      <div className="flex min-w-0 max-w-full items-center">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active ? "text-onbrand" : "text-ink-secondary hover:text-ink-primary"}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${options.map((x) => x.value).join()}`}
                className="absolute inset-0 rounded-full bg-brand-gradient"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition-colors ${checked ? "bg-brand-gradient" : "bg-white/10"}`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 34 }}
        className="absolute top-1 h-5 w-5 rounded-full bg-onbrand shadow"
        style={{ left: checked ? 24 : 4 }}
      />
    </button>
  );
}

function SelectField({
  value,
  onChange,
  children,
  full,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`relative ${full ? "w-full" : "w-40 max-w-full sm:w-44"}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 pr-9 text-sm text-ink-primary focus:border-accent-violet/50 focus:outline-none"
      >
        {children}
      </select>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

function MiniField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-muted">{hint}</span>}
    </label>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>
        <span className="block text-sm text-ink-primary">{label}</span>
        {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

/* ---- icons ---- */
const s = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...s}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...s}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...s} className="text-ink-muted">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
function VoiceIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...s}>
      <path d="M6 10v4M10 6v12M14 8v8M18 10v4" />
    </svg>
  );
}
function VolumeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...s}>
      <path d="M11 5 6 9H2v6h4l5 4zM19 6a9 9 0 0 1 0 12M16 9a5 5 0 0 1 0 6" />
    </svg>
  );
}
function VideoIcon({ small }: { small?: boolean }) {
  const d = small ? 14 : 20;
  return (
    <svg width={d} height={d} viewBox="0 0 24 24" {...s}>
      <path d="m23 7-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}
function ImageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" {...s}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}
function HandIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...s}>
      <path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8a6 6 0 0 0 6 6h1a6 6 0 0 0 6-6v-2a2 2 0 0 0-4 0" />
    </svg>
  );
}
function CaptionIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...s}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 12h3M14 12h3M7 15h6" />
    </svg>
  );
}
function MicIcon({ small }: { small?: boolean }) {
  const d = small ? 14 : 20;
  return (
    <svg width={d} height={d} viewBox="0 0 24 24" {...s}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
function CursorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" {...s}>
      <path d="m3 3 7 18 2-7 7-2z" />
    </svg>
  );
}
function ResetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...s}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...s}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
function BackupIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...s}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}
