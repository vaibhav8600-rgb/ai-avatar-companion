"use client";

// Mira Vision camera UI. Full-screen panel with a live preview, a compact
// header, and a mic so you can talk to Mira *while the camera is on*
// (Live Vision Conversation). The Look / Teach object / Teach person buttons
// remain as manual fallbacks. Capture + form state live here; analyze/save
// actions are owned by the page.

import { useState, type RefObject } from "react";
import MicButton from "@/components/MicButton";
import type { AvatarState } from "@/types";
import type { CameraStatus } from "@/lib/useCamera";

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
  // Voice (Live Vision Conversation)
  avatarState: AvatarState;
  pushToTalk: boolean;
  interimText: string;
  onMicPress: () => void;
  onMicRelease: () => void;
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
}: CameraPanelProps) {
  const [phase, setPhase] = useState<Phase>("preview");

  // Teach-object form
  const [objFrame, setObjFrame] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");

  // Teach-person form
  const [consent, setConsent] = useState(false);
  const [personShots, setPersonShots] = useState<string[]>([]);
  const [personName, setPersonName] = useState("");
  const [personContext, setPersonContext] = useState("");

  const active = status === "active";
  const isListening = avatarState === "listening";

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
    <div className="fixed inset-0 z-40 flex flex-col bg-ink-900 animate-fade-up">
      {/* Compact header */}
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2.5 pt-[calc(0.6rem+env(safe-area-inset-top))] bg-ink-800/90 border-b border-white/[0.06] backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? "bg-red-500 animate-pulse" : "bg-cream-100/30"}`}
            aria-hidden
          />
          <span className="text-sm font-medium text-cream-50 truncate">Mira Vision</span>
          {active && liveVision && (
            <span className="shrink-0 rounded-full bg-signal-500/20 border border-signal-500/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-signal-400">
              Live
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close camera"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-cream-100/70 hover:bg-white/[0.06]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      {/* Live preview */}
      <div className="relative flex-1 min-h-0 bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />

        {status !== "active" && (
          <div className="absolute inset-0 grid place-items-center bg-ink-900/80 px-6 text-center">
            <p className="max-w-xs text-sm text-cream-100/80">
              {status === "requesting" && "Requesting camera permission…"}
              {status === "denied" && (error || "Camera permission denied.")}
              {status === "error" && (error || "Camera unavailable.")}
              {status === "idle" && "Starting camera…"}
            </p>
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-ink-900/40">
            <div className="h-9 w-9 rounded-full border-2 border-white/20 border-t-signal-400 animate-spin" />
          </div>
        )}

        {/* Interim transcript floats over the video while listening */}
        {active && isListening && interimText && (
          <div className="absolute inset-x-0 bottom-3 px-4">
            <p className="mx-auto max-w-md rounded-full bg-ink-900/70 px-4 py-1.5 text-center text-sm italic text-cream-100/80 backdrop-blur-sm">
              “{interimText}”
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="shrink-0 bg-ink-800/95 border-t border-white/[0.06] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {phase === "preview" && (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3">
            {/* Status line */}
            <p className="text-[11px] uppercase tracking-[0.18em] text-cream-100/50">{statusLine}</p>

            {/* Mic — talk to Mira while the camera is on */}
            <MicButton
              state={avatarState}
              pushToTalk={pushToTalk}
              onPress={onMicPress}
              onRelease={onMicRelease}
              disabled={busy || !active}
            />

            <p className="text-center text-[11px] leading-relaxed text-cream-100/40">
              {active
                ? "Talk to me — “what do you see?”, “remember this as my keyboard”, “who is this?”"
                : "Turn the camera on to start."}
            </p>

            {/* Manual fallbacks */}
            <div className="grid w-full grid-cols-3 gap-2">
              <PanelButton small disabled={!active || busy} onClick={onLook}>
                Look
              </PanelButton>
              <PanelButton small disabled={!active || busy} onClick={() => setPhase("object")}>
                Teach object
              </PanelButton>
              <PanelButton small disabled={!active || busy} onClick={() => setPhase("person")}>
                Teach person
              </PanelButton>
            </div>
          </div>
        )}

        {/* ---- Teach object ---- */}
        {phase === "object" && (
          <div className="mx-auto max-w-md space-y-3">
            {!objFrame ? (
              <div className="flex gap-2">
                <PanelButton primary disabled={!active || busy} onClick={() => setObjFrame(capture())}>
                  Capture
                </PanelButton>
                <PanelButton disabled={busy} onClick={back}>
                  Cancel
                </PanelButton>
              </div>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={objFrame} alt="Captured object" className="h-24 w-full rounded-lg border border-white/10 object-cover" />
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={`What should ${assistantName} remember this as?`}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-cream-100 focus:border-signal-500/60 focus:outline-none"
                  autoFocus
                />
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes (color, brand, where it lives…)"
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-cream-100 focus:border-signal-500/60 focus:outline-none"
                />
                <div className="flex gap-2">
                  <PanelButton
                    primary
                    disabled={!label.trim() || busy}
                    onClick={() => {
                      onTeachObjectSave(objFrame, label.trim(), notes.trim());
                      back();
                    }}
                  >
                    Save
                  </PanelButton>
                  <PanelButton disabled={busy} onClick={() => setObjFrame(null)}>
                    Retake
                  </PanelButton>
                  <PanelButton disabled={busy} onClick={back}>
                    Cancel
                  </PanelButton>
                </div>
              </>
            )}
          </div>
        )}

        {/* ---- Teach person (opt-in) ---- */}
        {phase === "person" && (
          <div className="mx-auto max-w-md space-y-3">
            {!consent ? (
              <>
                <p className="text-[11px] leading-relaxed text-cream-100/60">
                  Known-people only. Only enroll someone who has given permission.
                  {` ${assistantName} `}never identifies strangers, and you can
                  delete this anytime in Settings.
                </p>
                <label className="flex items-center gap-2 text-sm text-cream-100/80">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="accent-signal-500"
                  />
                  I have this person&apos;s permission.
                </label>
                <PanelButton disabled={busy} onClick={back}>
                  Cancel
                </PanelButton>
              </>
            ) : (
              <>
                <p className="text-[11px] text-cream-100/60">Capture 3 angles ({personShots.length}/3).</p>
                {personShots.length > 0 && (
                  <div className="flex gap-2">
                    {personShots.map((s, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={s} alt={`Angle ${i + 1}`} className="h-14 w-14 rounded-md border border-white/10 object-cover" />
                    ))}
                  </div>
                )}
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
                    <input
                      type="text"
                      value={personName}
                      onChange={(e) => setPersonName(e.target.value)}
                      placeholder="Name (known person)"
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-cream-100 focus:border-signal-500/60 focus:outline-none"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={personContext}
                      onChange={(e) => setPersonContext(e.target.value)}
                      placeholder="Context (e.g. my brother)"
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-cream-100 focus:border-signal-500/60 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <PanelButton
                        primary
                        disabled={!personName.trim() || busy}
                        onClick={() => {
                          onTeachPersonSave(personShots, personName.trim(), personContext.trim());
                          back();
                        }}
                      >
                        Save
                      </PanelButton>
                      <PanelButton disabled={busy} onClick={() => setPersonShots([])}>
                        Recapture
                      </PanelButton>
                      <PanelButton disabled={busy} onClick={back}>
                        Cancel
                      </PanelButton>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PanelButton({
  children,
  onClick,
  disabled,
  primary,
  small,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        flex-1 rounded-xl font-medium transition-colors
        disabled:cursor-not-allowed disabled:opacity-40
        ${small ? "px-2 py-2 text-xs" : "px-4 py-2.5 text-sm"}
        ${primary
          ? "bg-signal-500 text-ink-900 hover:bg-signal-400"
          : "border border-white/[0.08] bg-white/[0.05] text-cream-100 hover:bg-white/[0.08]"
        }
      `}
    >
      {children}
    </button>
  );
}
