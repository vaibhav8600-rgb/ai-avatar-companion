"use client";

import { forwardRef, type HTMLAttributes } from "react";

type Radius = "card" | "panel" | "full";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Corner radius token. */
  radius?: Radius;
  /** Slightly brighter fill for elevated/nested surfaces. */
  elevated?: boolean;
}

const RADIUS: Record<Radius, string> = {
  card: "rounded-card",
  panel: "rounded-panel",
  full: "rounded-full",
};

/**
 * Frosted glass card — the universal container in the mockups. Low-opacity
 * white fill, 1px translucent border, backdrop blur, soft top-edge inner
 * highlight (via the `.glass` utility in globals.css).
 */
const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(function GlassPanel(
  { radius = "card", elevated = false, className = "", children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`glass ${RADIUS[radius]} ${elevated ? "bg-white/[0.06]" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
});

export default GlassPanel;
