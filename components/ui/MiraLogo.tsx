"use client";

interface MiraLogoProps {
  size?: number;
  /** Faint breathing pulse. */
  pulse?: boolean;
  className?: string;
}

/**
 * Mira's crystalline hexagon mark — cyan/violet faceted crystal in a rounded
 * glass tile, with a faint pulse. Used in the top bar and onboarding.
 */
export default function MiraLogo({ size = 40, pulse = true, className = "" }: MiraLogoProps) {
  return (
    <span
      className={`relative inline-grid place-items-center rounded-2xl glass ${className}`}
      style={{ width: size, height: size }}
    >
      {pulse && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-2xl bg-accent-cyan/25 blur-md animate-breathe"
        />
      )}
      <svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 24 24"
        fill="none"
        className="relative"
        aria-hidden
      >
        <defs>
          <linearGradient id="mira-hex" x1="0" y1="0" x2="24" y2="24">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        {/* hexagon */}
        <path d="M12 2 L20.5 7 V17 L12 22 L3.5 17 V7 Z" fill="url(#mira-hex)" fillOpacity="0.9" />
        {/* facet lines */}
        <path
          d="M12 2 V22 M3.5 7 L12 12 L20.5 7 M3.5 17 L12 12 L20.5 17"
          stroke="white"
          strokeOpacity="0.35"
          strokeWidth="0.6"
        />
      </svg>
    </span>
  );
}
