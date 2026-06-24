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
        rounded-full
        transition-all duration-300
        focus:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900
        disabled:opacity-40 disabled:cursor-not-allowed
        ${isActive
          ? "bg-signal-500 text-ink-900 shadow-[0_0_40px_-5px_rgba(125,179,216,0.6)]"
          : "bg-white/[0.05] text-cream-100 hover:bg-white/[0.08] border border-white/[0.08]"
        }
      `}
      {...handlers}
    >
      {isActive && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(125,179,216,0.4), transparent 70%)",
            animation: "pulse 1.6s ease-in-out infinite",
          }}
          aria-hidden
        />
      )}
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
