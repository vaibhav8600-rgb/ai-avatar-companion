"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import MiraLogo from "@/components/ui/MiraLogo";
import BuiltByFooter from "@/components/ui/BuiltByFooter";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWA install experience (mockup image 8). Self-contained: captures the
 * `beforeinstallprompt` event to offer a native install on Chromium, and falls
 * back to manual "Add to Home Screen" steps on iOS Safari. Shows a floating
 * chip; tapping opens the install card. Hidden entirely once installed/standalone.
 */
export default function InstallAppPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setDismissed(true);
      return;
    }
    const ua = window.navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua);
    setIsIOS(ios);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", () => setDismissed(true));
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  // Only surface when there's something to offer.
  const installable = !!deferred || isIOS;
  if (dismissed || !installable) return null;

  const nativeInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setDismissed(true);
    setDeferred(null);
    setOpen(false);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 left-4 z-30 inline-flex items-center gap-2 rounded-full glass px-4 py-2.5 text-sm text-ink-primary shadow-glow-violet"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
          </svg>
          Install App
        </button>
      )}

      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 grid place-items-center bg-cosmic-base/80 p-4 backdrop-blur-md"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.96, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="glass relative w-full max-w-sm overflow-hidden rounded-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full glass text-ink-secondary hover:text-ink-primary"
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

            <div className="flex flex-col items-center gap-4 px-6 py-7 text-center">
              <MiraLogo size={64} />
              <div>
                <h2 className="text-2xl font-bold text-ink-primary">Install App</h2>
                <p className="text-sm text-ink-secondary">Add Mira to your Home Screen</p>
              </div>

              {isIOS ? (
                <div className="w-full space-y-2 text-left">
                  <Step n={1} text="Tap the Share button in Safari's toolbar." />
                  <Step n={2} text="Choose “Add to Home Screen”." />
                  <Step n={3} text="Tap “Add” — Mira lands on your home screen." />
                </div>
              ) : (
                <div className="w-full space-y-2 text-left">
                  <Step n={1} text="Tap Install below." />
                  <Step n={2} text="Confirm in your browser's prompt." />
                  <Step n={3} text="Launch Mira full-screen anytime." />
                </div>
              )}

              <div className="w-full space-y-2 pt-1">
                <Feature text="Works offline" />
                <Feature text="Native full-screen feel" />
                <Feature text="Faster & smarter" />
              </div>

              {!isIOS && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={nativeInstall}
                  className="relative mt-2 w-full rounded-full py-3.5 font-semibold text-onbrand"
                >
                  <span aria-hidden className="absolute inset-0 rounded-full bg-brand-gradient" />
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-brand-gradient opacity-60 blur-lg"
                  />
                  <span className="relative">Add Mira to Home Screen</span>
                </motion.button>
              )}

              <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                Secure · Private · Encrypted
              </p>
              <BuiltByFooter />
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-white/10 bg-white/[0.03] p-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-gradient text-sm font-semibold text-onbrand">
        {n}
      </span>
      <span className="text-sm text-ink-secondary">{text}</span>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-primary">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-status-ready/15 text-status-ready">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      {text}
    </div>
  );
}
