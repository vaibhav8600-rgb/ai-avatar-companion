/**
 * Design tokens — the single source of truth for Mira's cosmic UI.
 *
 * Extracted from the design mockups (design/mockups/*). Everything visual
 * consumes these: Tailwind theme (tailwind.config.ts), globals.css variables,
 * and any inline styles that need a raw value (glows, gradients, R3F colors).
 *
 * Rule: no hardcoded magic colors in components — import from here or use the
 * Tailwind classes that map to these tokens.
 */

export const colors = {
  // Backgrounds — deep cosmic
  bg: {
    base: "#05060f",
    elevated: "#0a0b1a",
    nebula1: "#1a0b2e", // purple haze, screen edges
    nebula2: "#0b1a3a", // blue haze
    nebula3: "#2a0b2e", // magenta haze, bottom corners
  },

  // Brand gradient (buttons, active states, the signature look)
  grad: {
    start: "#3b82f6", // blue
    mid: "#7c3aed", // violet
    end: "#d946ef", // magenta
  },

  // Accents
  accent: {
    cyan: "#22d3ee", // Mira hex-crystal logo, WebRTC connected
    violet: "#8b5cf6",
  },

  // Status
  status: {
    ready: "#10b981", // green: Ready / Online / success
    listen: "#38bdf8", // blue: Listening state ring
    think: "#8b5cf6", // violet: Thinking
    speak: "#f59e0b", // amber: Speaking / Recovering
    error: "#ef4444", // red: Offline / End / Clear
  },

  // Text
  text: {
    primary: "#f5f7ff",
    secondary: "#9aa4bf",
    muted: "#5e6788",
  },
} as const;

/** Glass surface treatment values (also mirrored as CSS vars in globals.css). */
export const glass = {
  fill: "rgba(255,255,255,0.045)",
  border: "rgba(255,255,255,0.10)",
  blur: "20px",
} as const;

/** The signature brand gradient as a CSS value. */
export const brandGradient = `linear-gradient(135deg, ${colors.grad.start} 0%, ${colors.grad.mid} 50%, ${colors.grad.end} 100%)`;

/** Radial nebula blooms for the cosmic backdrop corners. */
export const nebulaBlooms = [
  { color: colors.bg.nebula1, at: "15% 20%", size: "45%", alpha: 0.55 },
  { color: colors.bg.nebula2, at: "85% 25%", size: "40%", alpha: 0.45 },
  { color: colors.bg.nebula3, at: "80% 90%", size: "45%", alpha: 0.5 },
  { color: colors.bg.nebula1, at: "10% 95%", size: "40%", alpha: 0.4 },
] as const;

/**
 * Per-state ring/glow colors for the AvatarOrb. Maps the internal AvatarState
 * union onto the five visual states from the mockups.
 */
export type OrbState =
  | "ready"
  | "listening"
  | "thinking"
  | "speaking"
  | "recovering";

export const orbPalette: Record<
  OrbState,
  { ring: string; glow: string; particles: string }
> = {
  ready: { ring: "#f59e0b", glow: "#fb923c", particles: "#fbbf24" },
  listening: { ring: colors.status.listen, glow: colors.accent.cyan, particles: "#7dd3fc" },
  thinking: { ring: colors.status.think, glow: colors.grad.mid, particles: "#c4b5fd" },
  speaking: { ring: colors.status.speak, glow: "#fb923c", particles: "#fcd34d" },
  recovering: { ring: colors.status.speak, glow: "#f59e0b", particles: "#fbbf24" },
};

/** Radii scale (px) used across glass panels/cards. */
export const radius = {
  card: 20,
  panel: 24,
  pill: 9999,
} as const;
