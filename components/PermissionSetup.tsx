"use client";

// First-run onboarding that requests camera + microphone together, once, via
// the central permission manager. Restyled to mockup image 19; logic unchanged.

import Image from "next/image";
import { useState } from "react";
import { requestCameraAndMic } from "@/lib/permissionManager";
import MiraLogo from "@/components/ui/MiraLogo";
import BuiltByFooter from "@/components/ui/BuiltByFooter";

interface PermissionSetupProps {
  open: boolean;
  onGranted: () => void;
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
    if (result.granted) onGranted();
    else if (result.reason === "unsupported") setPhase("unsupported");
    else setPhase("denied");
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-cosmic-base/85 p-3 backdrop-blur-sm sm:p-6">
      <div className="relative w-full max-w-4xl">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-panel bg-brand-gradient opacity-50 blur-md animate-border-glow"
        />
        <div className="glass relative flex max-h-[94dvh] flex-col overflow-hidden rounded-panel">
          <div className="thin-scroll grid gap-6 overflow-y-auto p-6 sm:p-8 md:grid-cols-[1.15fr_0.85fr]">
            {/* Left: content */}
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <MiraLogo size={48} />
                <div>
                  <p className="text-2xl font-bold leading-none text-ink-primary">Mira</p>
                  <p className="text-sm text-accent-violet">AI Avatar Companion</p>
                </div>
              </div>

              {phase === "intro" && (
                <>
                  <h1 className="mt-6 text-4xl font-bold text-ink-primary">
                    Welcome to <span className="text-brand-gradient">Mira</span>
                  </h1>
                  <p className="mt-2 text-ink-secondary">
                    Your intelligent companion. Always here to listen, help, and grow with you.
                  </p>

                  <div className="mt-5 flex items-start gap-3 rounded-card border border-white/10 bg-white/[0.03] p-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-gradient-soft text-accent-violet ring-1 ring-accent-violet/30">
                      <ShieldIcon />
                    </span>
                    <div>
                      <p className="font-semibold text-ink-primary">Your privacy is our priority</p>
                      <p className="text-sm text-ink-secondary">
                        All interactions are secure, encrypted, and never stored without your
                        consent.
                      </p>
                    </div>
                  </div>

                  <p className="mt-6 flex items-center gap-2 text-sm font-medium text-accent-violet">
                    <span>✦</span> Let&apos;s set up your experience
                  </p>
                  <p className="mt-1 text-sm text-ink-secondary">
                    Mira works best with your camera and microphone so we can connect naturally.
                  </p>

                  <div className="mt-4 space-y-3">
                    <PermCard
                      icon={<MicIcon />}
                      title="Microphone Access"
                      desc="Allows Mira to hear you clearly and respond in real-time."
                      scope="Only used for voice conversations"
                    />
                    <PermCard
                      icon={<CamIcon />}
                      title="Camera Access"
                      desc="Enables face-to-face interactions for a more personal connection."
                      scope="Only used for live video sessions"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={enable}
                    disabled={busy}
                    className="group relative mt-6 inline-flex w-full items-center justify-center gap-3 rounded-full py-4 text-base font-semibold text-onbrand disabled:opacity-60"
                  >
                    <span aria-hidden className="absolute inset-0 rounded-full bg-brand-gradient" />
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-brand-gradient opacity-60 blur-lg transition-opacity group-hover:opacity-90"
                    />
                    <span className="relative flex items-center gap-3">
                      <CamIcon small />
                      {busy ? "Requesting…" : "Enable Camera + Microphone"}
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
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  </button>
                  <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-muted">
                    <LockIcon /> You can change permissions anytime in settings.
                  </p>
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="mt-2 text-center text-xs text-ink-muted hover:text-ink-secondary"
                  >
                    Not now
                  </button>
                </>
              )}

              {phase === "denied" && (
                <div className="mt-6 space-y-4">
                  <h1 className="text-2xl font-bold text-ink-primary">Permissions are blocked</h1>
                  <p className="text-sm leading-relaxed text-red-300/90">
                    Your browser controls camera/microphone access. Set this site&apos;s Camera and
                    Microphone to <strong>Allow</strong> in browser settings, then reopen.
                  </p>
                  <MobileGuidance />
                  <button
                    type="button"
                    onClick={enable}
                    disabled={busy}
                    className="relative inline-flex w-full items-center justify-center rounded-full py-3.5 font-semibold text-onbrand disabled:opacity-60"
                  >
                    <span aria-hidden className="absolute inset-0 rounded-full bg-brand-gradient" />
                    <span className="relative">{busy ? "Requesting…" : "Try again"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="w-full text-center text-xs text-ink-muted hover:text-ink-secondary"
                  >
                    Continue without permissions
                  </button>
                </div>
              )}

              {phase === "unsupported" && (
                <div className="mt-6 space-y-4">
                  <h1 className="text-2xl font-bold text-ink-primary">Media not supported</h1>
                  <p className="text-sm leading-relaxed text-ink-secondary">
                    This browser doesn&apos;t support media access. You can still use text chat;
                    voice and camera need a browser with microphone/camera support over HTTPS.
                  </p>
                  <MobileGuidance />
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="w-full rounded-full border border-white/10 bg-white/[0.05] py-3.5 text-sm text-ink-primary hover:bg-white/[0.08]"
                  >
                    Got it
                  </button>
                </div>
              )}

              <div className="mt-6 md:hidden">
                <BuiltByFooter />
              </div>
            </div>

            {/* Right: portrait-orb */}
            <div className="relative hidden items-center justify-center md:flex">
              <div className="relative aspect-[3/4] w-full max-w-xs overflow-hidden rounded-panel">
                <span
                  aria-hidden
                  className="absolute left-1/2 top-1/3 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    boxShadow: "0 0 90px 12px rgba(251,146,60,0.4)",
                    border: "2px solid rgba(251,146,60,0.5)",
                  }}
                />
                <Image src="/avatar.png" alt="Mira" fill sizes="320px" className="object-cover" />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-cosmic-base to-transparent" />
              </div>
            </div>
          </div>

          <div className="hidden shrink-0 px-8 pb-5 md:block">
            <BuiltByFooter />
          </div>
        </div>
      </div>
    </div>
  );
}

function PermCard({
  icon,
  title,
  desc,
  scope,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  scope: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-card border border-white/10 bg-white/[0.03] p-4">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-gradient-soft text-accent-violet ring-1 ring-accent-violet/40">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-ink-primary">{title}</p>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-status-ready">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Ready
          </span>
        </div>
        <p className="text-sm text-ink-secondary">{desc}</p>
      </div>
      <div className="hidden shrink-0 items-center gap-1.5 text-right text-xs text-ink-muted sm:flex">
        <ShieldIcon small />
        <span className="max-w-[7rem]">{scope}</span>
      </div>
    </div>
  );
}

function MobileGuidance() {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.02] p-3">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">
        Tips for mobile
      </p>
      <ul className="space-y-1 text-[13px] leading-relaxed text-ink-secondary">
        <li>• Use the same app URL/domain each time (or install the PWA).</li>
        <li>• Avoid private/incognito mode — it forgets permissions.</li>
        <li>• iPhone Safari: Settings → this website → Camera &amp; Microphone → Allow.</li>
        <li>• Android Chrome: Site settings → Camera/Microphone → Allow.</li>
      </ul>
    </div>
  );
}

const st = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
function ShieldIcon({ small }: { small?: boolean }) {
  const d = small ? 14 : 20;
  return (
    <svg width={d} height={d} viewBox="0 0 24 24" {...st}>
      <path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5z" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...st}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
function CamIcon({ small }: { small?: boolean }) {
  const d = small ? 18 : 22;
  return (
    <svg width={d} height={d} viewBox="0 0 24 24" {...st}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" {...st}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
