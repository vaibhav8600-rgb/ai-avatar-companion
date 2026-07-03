import type { Config } from "tailwindcss";
import { colors, glass } from "./lib/design/tokens";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // All theme-dependent colors resolve through CSS variables (RGB
        // triplets in globals.css) so light/dark switching restyles every
        // utility — including alpha modifiers like bg-status-error/10.
        cosmic: {
          base: "rgb(var(--bg-base) / <alpha-value>)",
          elevated: "rgb(var(--bg-elevated) / <alpha-value>)",
        },
        // `white` inverts with the theme (white in dark, near-black in light)
        // so the ubiquitous bg-white/[0.03] + border-white/10 surface tints
        // stay visible on a light background.
        white: "rgb(var(--contrast) / <alpha-value>)",
        // Fixed white for text/icons sitting on brand-gradient fills.
        onbrand: "#ffffff",
        grad: {
          start: "rgb(var(--grad-start) / <alpha-value>)",
          mid: "rgb(var(--grad-mid) / <alpha-value>)",
          end: "rgb(var(--grad-end) / <alpha-value>)",
        },
        accent: {
          cyan: "rgb(var(--accent-cyan) / <alpha-value>)",
          violet: "rgb(var(--accent-violet) / <alpha-value>)",
        },
        status: {
          ready: "rgb(var(--status-ready) / <alpha-value>)",
          listen: "rgb(var(--status-listen) / <alpha-value>)",
          think: "rgb(var(--status-think) / <alpha-value>)",
          speak: "rgb(var(--status-speak) / <alpha-value>)",
          error: "rgb(var(--status-error) / <alpha-value>)",
        },
        // Text ramp
        ink: {
          primary: "rgb(var(--text-primary) / <alpha-value>)",
          secondary: "rgb(var(--text-secondary) / <alpha-value>)",
          muted: "rgb(var(--text-muted) / <alpha-value>)",
        },
      },
      fontFamily: {
        // Wired to next/font in app/layout.tsx via the --font-inter variable.
        display: ["var(--font-inter)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "brand-gradient": `linear-gradient(135deg, ${colors.grad.start} 0%, ${colors.grad.mid} 50%, ${colors.grad.end} 100%)`,
        "brand-gradient-soft": `linear-gradient(135deg, ${colors.grad.start}33 0%, ${colors.grad.mid}33 50%, ${colors.grad.end}33 100%)`,
      },
      backdropBlur: {
        glass: glass.blur,
      },
      borderRadius: {
        card: "20px",
        panel: "24px",
      },
      boxShadow: {
        glass: "inset 0 1px 0 0 rgba(255,255,255,0.08), 0 20px 60px -20px rgba(0,0,0,0.7)",
        "glow-blue": "0 0 40px -4px rgba(59,130,246,0.55)",
        "glow-violet": "0 0 40px -4px rgba(124,58,237,0.55)",
        "glow-brand": "0 0 48px -6px rgba(124,58,237,0.6)",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        breathe: "breathe 6s ease-in-out infinite",
        ripple: "ripple 1.6s ease-out infinite",
        shimmer: "shimmer 2.4s ease-in-out infinite",
        "fade-up": "fadeUp 0.4s ease-out",
        "spin-slow": "spin 18s linear infinite",
        "gradient-drift": "gradientDrift 8s ease-in-out infinite",
        "border-glow": "borderGlow 6s ease-in-out infinite",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.5" },
          "50%": { transform: "scale(1.04)", opacity: "0.7" },
        },
        ripple: {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        shimmer: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.9" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        gradientDrift: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        borderGlow: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
