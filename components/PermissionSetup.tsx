"use client";

// First-run onboarding card that requests camera + microphone together, once,
// through the central permission manager. Shows recovery guidance if blocked.

import { useState } from "react";
import { requestCameraAndMic } from "@/lib/permissionManager";

interface PermissionSetupProps {
  open: boolean;
  /** Called after a successful grant. */
  onGranted: () => void;
  /** Called when the user dismisses ("Not now"). */
  onDismiss: () => void;
}

type Phase = "intro" | "denied" | "unsupported";

export default function PermissionSetup({ open, onGranted, onDismiss }: PermissionSetupProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const enable = async () => {
    setBusy(true);
    const result = await requestCameraAndMic();
    setBusy(false);
    if (result.granted) {
      onGranted();
    } else if (result.reason === "unsupported") {
      setPhase("unsupported");
    } else {
      setPhase("denied");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/80 backdrop-blur-sm p-4 animate-fade-up">
      <div className="flex w-full max-w-md max-h-[90dvh] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-800/95 shadow-2xl">
        <div className="transcript-scroll min-h-0 flex-1 overflow-y-auto px-6 py-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-signal-500/15 text-signal-400">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
            </div>
            <h2 className="font-display text-lg text-cream-50">Set up Mira&apos;s permissions</h2>
          </div>

          {phase === "intro" && (
            <>
              <p className="text-sm leading-relaxed text-cream-100/70">
                Mira uses your <strong className="text-cream-100">microphone</strong> to
                hear you and your <strong className="text-cream-100">camera</strong> for
                Mira Vision. Grant them once here and the app won&apos;t ask again — you&apos;ll
                only see your browser&apos;s own prompt.
              </p>
              <p className="text-[11px] leading-relaxed text-cream-100/40">
                Nothing turns on now: we ask, then immediately release the camera and mic.
                They only activate when you start talking or open the camera, with a visible
                indicator. Final control always stays with your browser/OS.
              </p>

              <button
                type="button"
                onClick={enable}
                disabled={busy}
                className="w-full rounded-xl bg-signal-500 px-4 py-3 text-sm font-medium text-ink-900 transition-colors hover:bg-signal-400 disabled:opacity-50"
              >
                {busy ? "Requesting…" : "Enable Mira permissions"}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="w-full text-center text-xs text-cream-100/50 hover:text-cream-100/80"
              >
                Not now
              </button>
            </>
          )}

          {phase === "denied" && (
            <>
              <p className="text-sm leading-relaxed text-red-300/90">
                Camera/microphone access is blocked. Your browser controls this — if Mira
                keeps asking, set this site&apos;s Camera and Microphone to <strong>Allow</strong>
                in browser settings, then reopen.
              </p>
              <MobileGuidance />
              <button
                type="button"
                onClick={enable}
                disabled={busy}
                className="w-full rounded-xl bg-signal-500 px-4 py-3 text-sm font-medium text-ink-900 hover:bg-signal-400 disabled:opacity-50"
              >
                {busy ? "Requesting…" : "Try again"}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="w-full text-center text-xs text-cream-100/50 hover:text-cream-100/80"
              >
                Continue without permissions
              </button>
            </>
          )}

          {phase === "unsupported" && (
            <>
              <p className="text-sm leading-relaxed text-cream-100/70">
                This browser doesn&apos;t support media access. You can still use text chat;
                voice and camera need a browser with microphone/camera support over HTTPS.
              </p>
              <MobileGuidance />
              <button
                type="button"
                onClick={onDismiss}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm text-cream-100 hover:bg-white/[0.08]"
              >
                Got it
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileGuidance() {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-cream-100/40">
        Tips for mobile
      </p>
      <ul className="space-y-1 text-[11px] leading-relaxed text-cream-100/55">
        <li>• Use the same app URL/domain each time (or install the PWA).</li>
        <li>• Avoid private/incognito mode — it forgets permissions.</li>
        <li>• iPhone Safari: Settings → this website → Camera &amp; Microphone → Allow.</li>
        <li>• Android Chrome: Site settings → Camera/Microphone → Allow.</li>
      </ul>
    </div>
  );
}
