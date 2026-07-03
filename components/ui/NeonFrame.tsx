"use client";

import type { HTMLAttributes } from "react";

interface NeonFrameProps extends HTMLAttributes<HTMLDivElement> {
  /** Disable the breathing animation (e.g. for reduced-motion-sensitive areas). */
  static?: boolean;
}

/**
 * The outer app "window" frame: a rounded glass surface with a faint animated
 * blue→violet→magenta gradient glow bleeding off its edges. Subtle, breathing.
 *
 * Renders a blurred gradient halo behind a glass panel. Content goes inside.
 */
export default function NeonFrame({
  className = "",
  static: isStatic = false,
  children,
  ...rest
}: NeonFrameProps) {
  return (
    <div className={`relative ${className}`} {...rest}>
      {/* Gradient glow halo bleeding off the edges. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -inset-[2px] rounded-[26px] bg-brand-gradient opacity-60 blur-xl ${
          isStatic ? "" : "animate-border-glow"
        }`}
      />
      {/* Crisp gradient hairline border. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[25px] bg-brand-gradient opacity-40"
      />
      {/* The panel surface. */}
      <div className="relative rounded-panel glass overflow-hidden">{children}</div>
    </div>
  );
}
