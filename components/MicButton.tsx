"use client";

import type { AvatarState } from "@/types";

interface MicButtonProps {
  state: AvatarState;
  disabled?: boolean;
  onPress: () => void;
  onRelease?: () => void;
  /** If true, mic button toggles on click. If false, push-to-talk. */
  pushToTalk?: boolean;
}

/**
 * Big tappable mic. Push-to-talk by default (hold to listen, release to send),
 * with click-to-toggle as an alternative.
 */
export default function MicButton({
  state,
  disabled,
  onPress,
  onRelease,
  pushToTalk = false,
}: MicButtonProps) {
  const isActive = state === "listening";
  const isBusy = state === "thinking" || state === "speaking";

  const handlers = pushToTalk
    ? {
        onPointerDown: () => !disabled && onPress(),
        onPointerUp: () => !disabled && onRelease?.(),
        onPointerLeave: () => !disabled && isActive && onRelease?.(),
      }
    : {
        onClick: () => !disabled && onPress(),
      };

  return (
    <button
      type="button"
      disabled={disabled || isBusy}
      aria-label={isActive ? "Stop listening" : "Start listening"}
      aria-pressed={isActive}
      className={`
        relative grid place-items-center
        h-16 w-16 sm:h-[72px] sm:w-[72px]
        rounded-full text-onbrand
        transition-transform duration-300
        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-violet/70 focus-visible:ring-offset-2 focus-visible:ring-offset-cosmic-base
        disabled:cursor-not-allowed disabled:opacity-40
      `}
      {...handlers}
    >
      {/* Pulsing outer glow. */}
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full blur-lg ${
          isActive ? "bg-status-listen/60 animate-pulse-slow" : "bg-brand-gradient opacity-50"
        }`}
      />
      {/* Face. */}
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full ${isActive ? "bg-status-listen" : "bg-brand-gradient"}`}
      />
      <MicIcon active={isActive} />
    </button>
  );
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="relative z-10"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      {active && (
        <>
          <line x1="9" y1="22" x2="15" y2="22" />
        </>
      )}
    </svg>
  );
}
