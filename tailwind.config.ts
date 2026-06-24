import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep warm charcoal canvas — makes the cream áo dài pop
        ink: {
          900: "#0E0F13",
          800: "#15171D",
          700: "#1C1F27",
          600: "#262932",
          500: "#373B47",
        },
        // Cream — pulled from the avatar's blouse
        cream: {
          50: "#FAF7F1",
          100: "#F2EDE3",
          200: "#E5DDCC",
        },
        // Holographic blue — the signal color, from her pin accent
        signal: {
          400: "#A3D0EC",
          500: "#7DB3D8",
          600: "#5894BD",
        },
        // Warm amber — used sparingly for "speaking" state warmth
        warm: {
          400: "#E8C088",
          500: "#D9A964",
        },
      },
      fontFamily: {
        display: ['"DM Sans"', "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "breathe": "breathe 6s ease-in-out infinite",
        "ripple": "ripple 1.6s ease-out infinite",
        "shimmer": "shimmer 2.4s ease-in-out infinite",
        "fade-up": "fadeUp 0.4s ease-out",
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
      },
    },
  },
  plugins: [],
};

export default config;
