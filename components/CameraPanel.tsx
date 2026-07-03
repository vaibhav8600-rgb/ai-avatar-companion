"use client";

// Mira Vision camera UI (mockups 6 / 4 / 2). Cosmic full-screen panel: framed
// live preview with corner brackets + focus reticle + Live badge, cosmic focus
// action cards (Look / Teach Object / Teach Person / Close), and glass teach
// forms. Talk to Mira while the camera is on (Live Vision Conversation).
// Capture + form state live here; analyze/save actions are owned by the page.

import { useState, type ReactNode, type RefObject } from "react";
import MicButton from "@/components/MicButton";
import MiraLogo from "@/components/ui/MiraLogo";
import type { AvatarState } from "@/types";
import type { CameraStatus, CameraFacingMode } from "@/lib/useCamera";

interface CameraPanelProps {
  videoRef: RefObject<HTMLVideoElement>;
  status: CameraStatus;
  error: string | null;
  assistantName: string;
  busy: boolean;
  liveVision: boolean;
  visionStatus: string;
  capture: () => string | null;
  onLook: () => void;
  onTeachObjectSave: (frame: string, label: string, notes: string) => void;
  onTeachPersonSave: (frames: string[], name: string, context: string) => void;
  onClose: () => void;
  avatarState: AvatarState;
  pushToTalk: boolean;
  interimText: string;
  onMicPress: () => void;
  onMicRelease: () => void;
  currentFacingMode: CameraFacingMode;
  canSwitchCamera: boolean;
  isSwitchingCamera: boolean;
  onSwitchCamera: () => void;
}

type Phase = "preview" | "object" | "person";

export default function CameraPanel({
  videoRef,
  status,
  error,
  assistantName,
  busy,
  liveVision,
  visionStatus,
  capture,
  onLook,
  onTeachObjectSave,
  onTeachPersonSave,
  onClose,
  avatarState,
  pushToTalk,
  interimText,
  onMicPress,
  onMicRelease,
  currentFacingMode,
  canSwitchCamera,
  isSwitchingCamera,
  onSwitchCamera,
}: CameraPanelProps) {
  const [phase, setPhase] = useState<Phase>("preview");
  const [res, setRes] = useState<string>("HD");
  // Real aspect ratio of the active stream (16:9 landscape, 9:16 phone
  // portrait, or anything else) — read from the video metadata so the frame
  // adapts instead of forcing letterboxed 16:9.
  const [videoAspect, setVideoAspect] = useState(16 / 9);

  const [objFrame, setObjFrame] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");

  const [consent, setConsent] = useState(false);
  const [personShots, setPersonShots] = useState<string[]>([]);
  const [personName, setPersonName] = useState("");
  const [personContext, setPersonContext] = useState("");

  const active = status === "active";
  const isListening = avatarState === "listening";
  const scanning = busy || avatarState === "recognizing" || avatarState === "looking";

  const statusLine =
    avatarState === "listening"
      ? "Listening…"
      : avatarState === "thinking"
        ? "Thinking…"
        : avatarState === "speaking"
          ? "Speaking…"
          : visionStatus;

  const resetForms = () => {
    setObjFrame(null);
    setLabel("");
    setNotes("");
    setConsent(false);
    setPersonShots([]);
    setPersonName("");
    setPersonContext("");
  };
  const back = () => {
    resetForms();
    setPhase("preview");
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-cosmic-base/95 backdrop-blur-xl animate-fade-up thin-scroll">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-5 sm:px-6 pt-[calc(1rem+env(safe-area-inset-top))]">
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <MiraLogo size={44} />
            <div>
              <p className="text-2xl font-bold leading-none text-ink-primary">
                Mira <span className="text-brand-gradient">Vision</span>
              </p>
              <p className="text-xs text-ink-secondary">
                See the world through AI-enhanced perception
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${active ? "border-status-error/40 bg-status-error/10 text-status-error" : "glass text-ink-secondary"}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${active ? "bg-status-error animate-pulse" : "bg-ink-muted"}`}
              />
              {active ? "Camera On" : "Camera Off"}
            </span>
            <span className="hidden items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs text-accent-cyan sm:inline-flex">
              <ShieldIcon /> Privacy First
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close camera"
              className="grid h-10 w-10 place-items-center rounded-full glass text-ink-secondary hover:text-ink-primary"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Framed live preview — sized to the stream's own aspect ratio
            (landscape or portrait), capped so it always fits the viewport. */}
        <div className="flex w-full justify-center">
          <div
            className="relative w-full overflow-hidden rounded-panel border border-white/10 bg-black"
            style={{
              aspectRatio: String(videoAspect),
              maxWidth: `min(100%, calc(58dvh * ${videoAspect}))`,
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.videoWidth && v.videoHeight) {
                  setRes(`${v.videoWidth} × ${v.videoHeight}`);
                  setVideoAspect(v.videoWidth / v.videoHeight);
                }
              }}
              className="absolute inset-0 h-full w-full object-cover"
            />

            {status !== "active" && (
              <div className="absolute inset-0 grid place-items-center bg-cosmic-base/80 px-6 text-center">
                <p className="max-w-xs text-sm text-ink-secondary">
                  {status === "requesting" && "Requesting camera permission…"}
                  {status === "denied" && (error || "Camera permission denied.")}
                  {status === "error" && (error || "Camera unavailable.")}
                  {status === "idle" && "Starting camera…"}
                </p>
              </div>
            )}

            {/* Corner brackets */}
            <Brackets />
            {/* Focus reticle */}
            {active && (
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="grid h-16 w-16 place-items-center rounded-full border border-white/40">
                  <span className="text-onbrand/70">+</span>
                </div>
              </div>
            )}
            {/* Scan ripple while analyzing */}
            {scanning && active && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="h-40 w-40 rounded-full border border-accent-cyan/60 animate-ripple" />
                <span
                  className="absolute h-40 w-40 rounded-full border border-accent-cyan/40 animate-ripple"
                  style={{ animationDelay: "0.5s" }}
                />
              </div>
            )}

            {/* Live badge */}
            {active && (
              <span className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full glass px-3 py-1.5 text-xs text-ink-primary">
                <span className="h-2 w-2 rounded-full bg-status-ready" />
                Live · {res} · 30fps
              </span>
            )}

            {/* Camera controls */}
            {active && canSwitchCamera && (
              <button
                type="button"
                onClick={onSwitchCamera}
                disabled={isSwitchingCamera}
                aria-label={currentFacingMode === "user" ? "Use back camera" : "Use front camera"}
                className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs text-ink-primary hover:text-ink-primary disabled:opacity-50"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={isSwitchingCamera ? "animate-spin" : ""}
                >
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                {currentFacingMode === "user" ? "Back" : "Front"}
              </button>
            )}

            {busy && (
              <div className="absolute inset-0 grid place-items-center bg-cosmic-base/30">
                <div className="h-10 w-10 rounded-full border-2 border-white/20 border-t-accent-cyan animate-spin" />
              </div>
            )}

            {active && isListening && interimText && (
              <div className="absolute inset-x-0 bottom-14 px-4">
                <p className="mx-auto max-w-md rounded-full glass px-4 py-1.5 text-center text-sm italic text-ink-primary">
                  “{interimText}”
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ---- Preview: focus cards + mic ---- */}
        {phase === "preview" && (
          <>
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-secondary">{statusLine}</p>
              <MicButton
                state={avatarState}
                pushToTalk={pushToTalk}
                onPress={onMicPress}
                onRelease={onMicRelease}
                disabled={busy || !active}
              />
              <p className="max-w-md text-center text-xs leading-relaxed text-ink-muted">
                {active
                  ? "Talk to me — “what do you see?”, “remember this as my keyboard”, “who is this?”"
                  : "Turn the camera on to start."}
              </p>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-ink-secondary">
                What would you like Mira to focus on?
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <FocusCard
                  tone="cyan"
                  disabled={!active || busy}
                  onClick={onLook}
                  icon={<EyeIcon />}
                  title="Look"
                  desc="Let Mira analyze what's in view"
                />
                <FocusCard
                  tone="violet"
                  disabled={!active || busy}
                  onClick={() => setPhase("object")}
                  icon={<CubeIcon />}
                  title="Teach Object"
                  desc="Help Mira recognize an object"
                />
                <FocusCard
                  tone="violet"
                  disabled={!active || busy}
                  onClick={() => setPhase("person")}
                  icon={<PersonIcon />}
                  title="Teach Person"
                  desc="Help Mira recognize a person"
                />
                <FocusCard
                  tone="red"
                  disabled={busy}
                  onClick={onClose}
                  icon={<CamOffIcon />}
                  title="Close Camera"
                  desc="Turn off the camera for privacy"
                />
              </div>
            </div>
          </>
        )}

        {/* ---- Teach object ---- */}
        {phase === "object" && (
          <TeachShell
            title="Teach Object"
            subtitle="Teach Mira to remember objects on your desk."
            onCancel={back}
          >
            {!objFrame ? (
              <div className="flex gap-2">
                <PanelButton
                  primary
                  disabled={!active || busy}
                  onClick={() => setObjFrame(capture())}
                >
                  Capture
                </PanelButton>
                <PanelButton disabled={busy} onClick={back}>
                  Cancel
                </PanelButton>
              </div>
            ) : (
              <>
                <div className="relative overflow-hidden rounded-card border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={objFrame} alt="Captured object" className="h-40 w-full object-cover" />
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full glass px-2.5 py-1 text-[11px] text-ink-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-status-ready" />
                    Captured
                  </span>
                  <Brackets small />
                </div>
                <FieldLabel>Label this object</FieldLabel>
                <CosmicInput
                  value={label}
                  onChange={setLabel}
                  placeholder={`Remember this as my black keyboard`}
                  autoFocus
                />
                <CosmicInput
                  value={notes}
                  onChange={setNotes}
                  placeholder="Optional notes (color, brand, where it lives…)"
                />
                <LocalMemoryNote />
                <div className="flex gap-2">
                  <PanelButton
                    primary
                    disabled={!label.trim() || busy}
                    onClick={() => {
                      onTeachObjectSave(objFrame, label.trim(), notes.trim());
                      back();
                    }}
                  >
                    Save to Local Memory
                  </PanelButton>
                  <PanelButton disabled={busy} onClick={() => setObjFrame(null)}>
                    Retake
                  </PanelButton>
                </div>
                <p className="text-center text-[11px] text-ink-muted">
                  100% private · No cloud sync · You&apos;re in control
                </p>
              </>
            )}
          </TeachShell>
        )}

        {/* ---- Teach person (opt-in) ---- */}
        {phase === "person" && (
          <TeachShell
            title="Teach Person"
            subtitle={`Help ${assistantName} recognize the people you choose.`}
            onCancel={back}
          >
            {!consent ? (
              <>
                <div className="flex items-start gap-3 rounded-card border border-accent-violet/20 bg-brand-gradient-soft p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cosmic-base/40 text-accent-violet">
                    <LockIcon />
                  </span>
                  <div>
                    <p className="font-semibold text-ink-primary">Consent required</p>
                    <p className="text-sm text-ink-secondary">
                      Known-people only. {assistantName} never identifies strangers, and you can
                      delete this anytime in Settings.
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-ink-primary">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="h-4 w-4 accent-accent-violet"
                  />
                  I have this person&apos;s permission.
                </label>
                <PanelButton disabled={busy} onClick={back}>
                  Cancel
                </PanelButton>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-secondary">
                  Capture 3 angles ({personShots.length}/3).
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {["Front", "Left Profile", "Right Profile"].map((a, i) => (
                    <div key={a} className="flex flex-col items-center gap-1.5">
                      <div className="relative aspect-square w-full overflow-hidden rounded-card border border-white/10 bg-white/[0.03]">
                        {personShots[i] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={personShots[i]}
                            alt={a}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="grid h-full place-items-center text-ink-muted">
                            <PersonIcon />
                          </span>
                        )}
                        <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-cosmic-base/70 text-[10px] text-ink-primary">
                          {i + 1}
                        </span>
                      </div>
                      <span className="text-[11px] text-ink-muted">{a}</span>
                    </div>
                  ))}
                </div>
                {personShots.length < 3 ? (
                  <div className="flex gap-2">
                    <PanelButton
                      primary
                      disabled={!active || busy}
                      onClick={() => {
                        const f = capture();
                        if (f) setPersonShots((s) => [...s, f]);
                      }}
                    >
                      Capture angle
                    </PanelButton>
                    <PanelButton disabled={busy} onClick={back}>
                      Cancel
                    </PanelButton>
                  </div>
                ) : (
                  <>
                    <CosmicInput
                      value={personName}
                      onChange={setPersonName}
                      placeholder="Name (known person)"
                      autoFocus
                    />
                    <CosmicInput
                      value={personContext}
                      onChange={setPersonContext}
                      placeholder="Context (e.g. my brother)"
                    />
                    <div className="rounded-card border border-white/10 bg-white/[0.03] p-3 text-sm text-ink-secondary">
                      Your data stays private — End-to-end encrypted, on-device only.
                    </div>
                    <div className="flex gap-2">
                      <PanelButton
                        primary
                        disabled={!personName.trim() || busy}
                        onClick={() => {
                          onTeachPersonSave(personShots, personName.trim(), personContext.trim());
                          back();
                        }}
                      >
                        Save to Local Memory
                      </PanelButton>
                      <PanelButton disabled={busy} onClick={() => setPersonShots([])}>
                        Recapture
                      </PanelButton>
                    </div>
                  </>
                )}
              </>
            )}
          </TeachShell>
        )}
      </div>
    </div>
  );
}

/* ---- pieces ---- */

function Brackets({ small }: { small?: boolean }) {
  const len = small ? "h-4 w-4" : "h-7 w-7";
  const m = small ? 12 : 16;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ padding: `${m}px` }}>
      <span
        className={`absolute left-0 top-0 ${len} rounded-tl-lg border-l-2 border-t-2 border-white/50`}
      />
      <span
        className={`absolute right-0 top-0 ${len} rounded-tr-lg border-r-2 border-t-2 border-white/50`}
      />
      <span
        className={`absolute bottom-0 left-0 ${len} rounded-bl-lg border-b-2 border-l-2 border-white/50`}
      />
      <span
        className={`absolute bottom-0 right-0 ${len} rounded-br-lg border-b-2 border-r-2 border-white/50`}
      />
    </div>
  );
}

function FocusCard({
  tone,
  icon,
  title,
  desc,
  onClick,
  disabled,
}: {
  tone: "cyan" | "violet" | "red";
  icon: ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const toneClass =
    tone === "cyan"
      ? "text-accent-cyan bg-accent-cyan/10"
      : tone === "red"
        ? "text-status-error bg-status-error/10"
        : "text-accent-violet bg-accent-violet/10";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex flex-col gap-2 rounded-card border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tone === "red" ? "border-status-error/25 bg-status-error/[0.04] hover:border-status-error/50" : "border-white/10 bg-white/[0.03] hover:border-accent-violet/40"}`}
    >
      <span className={`grid h-10 w-10 place-items-center rounded-full ${toneClass}`}>{icon}</span>
      <span className="font-semibold text-ink-primary">{title}</span>
      <span className="flex items-center justify-between text-xs text-ink-secondary">
        {desc}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="shrink-0 transition-transform group-hover:translate-x-0.5"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </button>
  );
}

function TeachShell({
  title,
  subtitle,
  onCancel,
  children,
}: {
  title: string;
  subtitle: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div className="glass rounded-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink-primary">{title}</h3>
          <p className="text-sm text-ink-secondary">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-full glass text-ink-secondary hover:text-ink-primary"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function LocalMemoryNote() {
  return (
    <div className="flex items-center gap-3 rounded-card border border-white/10 bg-white/[0.03] p-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-gradient-soft text-accent-cyan">
        <ChipIcon />
      </span>
      <div className="text-sm">
        <p className="font-medium text-ink-primary">Local Memory</p>
        <p className="text-xs text-ink-muted">On-device only · IndexedDB</p>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="block text-xs font-medium text-ink-secondary">{children}</span>;
}

function CosmicInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:border-accent-violet/50 focus:outline-none"
    />
  );
}

function PanelButton({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${primary ? "bg-brand-gradient text-onbrand" : "glass text-ink-primary hover:text-ink-primary"}`}
    >
      {children}
    </button>
  );
}

const sv = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" {...sv}>
      <path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5z" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...sv}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function CubeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...sv}>
      <path d="M12 2 3 7v10l9 5 9-5V7z" />
      <path d="M3 7l9 5 9-5M12 12v10" />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...sv}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
function CamOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...sv}>
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...sv}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
function ChipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...sv}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </svg>
  );
}
