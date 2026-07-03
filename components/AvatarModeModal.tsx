"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";
import BuiltByFooter from "@/components/ui/BuiltByFooter";

interface AvatarModeModalProps {
  open: boolean;
  onClose: () => void;
  liveAvatarEnabled: boolean;
  onLiveAvatarChange: (v: boolean) => void;
}

/**
 * Avatar Mode chooser (mockup image 11): two large tilt-on-hover cards — Live
 * Lip-Synced (Simli) vs Still Image Fallback — with a selected glow + check,
 * a Smart Auto-Switch toggle, and Save Preference. Drives the existing
 * liveAvatarEnabled setting; opened from Settings.
 */
export default function AvatarModeModal({
  open,
  onClose,
  liveAvatarEnabled,
  onLiveAvatarChange,
}: AvatarModeModalProps) {
  const [choice, setChoice] = useState<"live" | "still">(liveAvatarEnabled ? "live" : "still");
  const [autoSwitch, setAutoSwitch] = useState(true);

  useEffect(() => {
    if (open) setChoice(liveAvatarEnabled ? "live" : "still");
  }, [open, liveAvatarEnabled]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const save = () => {
    onLiveAvatarChange(choice === "live");
    onClose();
  };

  // Conditional render (no exit animation): a full-screen backdrop must unmount
  // instantly on close so re-renders can't wedge it open and block the UI.
  if (!open) return null;
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 grid place-items-center bg-cosmic-base/75 p-4 backdrop-blur-md"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Avatar Mode"
      >
        <motion.div
          initial={{ scale: 0.96, y: 12, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="glass relative flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-panel"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-5 top-5 z-10 grid h-9 w-9 place-items-center rounded-full glass text-ink-secondary hover:text-ink-primary"
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

          <div className="thin-scroll overflow-y-auto px-6 py-7">
            {/* Title */}
            <div className="flex flex-col items-center text-center">
              <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-brand-gradient-soft text-accent-violet ring-1 ring-accent-violet/30">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
              </span>
              <h2 className="text-4xl font-bold text-brand-gradient">Avatar Mode</h2>
              <p className="mt-1 text-sm text-ink-secondary">
                Choose how Mira appears and responds during your conversations.
              </p>
              <div className="mt-4 flex rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm">
                <span className="rounded-full bg-brand-gradient px-4 py-1.5 font-medium text-onbrand">
                  Avatar Mode
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 text-ink-secondary hover:text-ink-primary"
                >
                  Settings
                </button>
              </div>
            </div>

            {/* Cards */}
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <ModeCard
                selected={choice === "live"}
                onSelect={() => setChoice("live")}
                badge="LIVE MODE"
                badgeIcon={<WifiIcon />}
                title="Live Lip-Synced Avatar via Simli"
                desc="Real-time lip synchronization for the most natural and engaging conversations."
                chip={{ label: "WebRTC Connected", tone: "green" }}
                features={[
                  ["⚡", "Real-time Expression"],
                  ["🎙", "Natural Lip Sync"],
                  ["📡", "WebRTC Powered"],
                ]}
                cta={{ label: "★ Recommended", recommended: true }}
              />
              <ModeCard
                selected={choice === "still"}
                onSelect={() => setChoice("still")}
                badge="FALLBACK MODE"
                badgeIcon={<ShieldIcon />}
                title="Still Image Fallback"
                desc="Uses a static avatar image when live sync is unavailable. Reliable and lightweight."
                chip={{ label: "High Reliability", tone: "cyan" }}
                features={[
                  ["🛡", "Always Available"],
                  ["📶", "Low Bandwidth Friendly"],
                  ["🔒", "Privacy First"],
                ]}
                cta={{ label: "Select Fallback Mode" }}
              />
            </div>

            {/* Smart auto-switch */}
            <div className="mt-5 flex items-center gap-4 rounded-card border border-white/10 bg-white/[0.03] px-5 py-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-gradient-soft text-accent-cyan ring-1 ring-accent-cyan/30">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink-primary">Smart Auto-Switch</p>
                <p className="text-xs text-ink-secondary">
                  Mira will automatically switch to Fallback Mode if the live connection is
                  unstable.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoSwitch}
                aria-label="Smart auto-switch"
                onClick={() => setAutoSwitch((v) => !v)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${autoSwitch ? "bg-brand-gradient" : "bg-white/10"}`}
              >
                <motion.span
                  layout
                  transition={{ type: "spring", stiffness: 500, damping: 34 }}
                  className="absolute top-1 h-5 w-5 rounded-full bg-onbrand"
                  style={{ left: autoSwitch ? 24 : 4 }}
                />
              </button>
            </div>

            {/* Save */}
            <div className="mt-6 flex justify-center">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={save}
                className="relative inline-flex items-center gap-2 rounded-full px-8 py-3.5 font-semibold text-onbrand"
              >
                <span aria-hidden className="absolute inset-0 rounded-full bg-brand-gradient" />
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-brand-gradient opacity-60 blur-lg"
                />
                <span className="relative flex items-center gap-2">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Save Preference
                </span>
              </motion.button>
            </div>

            <div className="mt-6">
              <BuiltByFooter />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}

function ModeCard({
  selected,
  onSelect,
  badge,
  badgeIcon,
  title,
  desc,
  chip,
  features,
  cta,
}: {
  selected: boolean;
  onSelect: () => void;
  badge: string;
  badgeIcon: React.ReactNode;
  title: string;
  desc: string;
  chip: { label: string; tone: "green" | "cyan" };
  features: [string, string][];
  cta: { label: string; recommended?: boolean };
}) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileHover={{ y: -4 }}
      className={`relative flex flex-col overflow-hidden rounded-panel border text-left transition-colors ${selected ? "border-accent-violet/60 shadow-glow-violet" : "border-white/10"}`}
    >
      {selected && (
        <span className="absolute right-4 top-4 z-10 grid h-7 w-7 place-items-center rounded-full bg-brand-gradient text-onbrand">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      )}
      {/* Portrait */}
      <div className="relative h-56 w-full">
        <Image src="/avatar.png" alt="Mira" fill sizes="380px" className="object-cover" />
        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full glass px-3 py-1 text-[11px] font-medium text-ink-primary">
          {badgeIcon}
          {badge}
        </span>
        <span
          className={`absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium ${chip.tone === "green" ? "bg-status-ready/15 text-status-ready" : "bg-accent-cyan/15 text-accent-cyan"}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${chip.tone === "green" ? "bg-status-ready" : "bg-accent-cyan"}`}
          />
          {chip.label}
        </span>
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-cosmic-base to-transparent" />
      </div>
      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="text-lg font-semibold text-ink-primary">{title}</h3>
        <p className="text-sm text-ink-secondary">{desc}</p>
        <ul className="space-y-1.5">
          {features.map(([em, label]) => (
            <li key={label} className="flex items-center gap-2 text-sm text-ink-secondary">
              <span className="text-accent-cyan">{em}</span>
              {label}
            </li>
          ))}
        </ul>
        <div
          className={`mt-auto rounded-full py-2 text-center text-sm font-medium ${cta.recommended ? "border border-accent-violet/40 bg-brand-gradient-soft text-ink-primary" : "border border-white/10 text-ink-secondary"}`}
        >
          {cta.label}
        </div>
      </div>
    </motion.button>
  );
}

function WifiIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M2 8a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5z" />
    </svg>
  );
}
