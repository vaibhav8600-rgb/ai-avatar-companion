"use client";

interface BuiltByFooterProps {
  /** Show the "Mira — AI Avatar Companion" line above the byline (as in Settings). */
  withTitle?: boolean;
  className?: string;
}

/** The shared "V" monogram + "Built by Vaibhav Rajput" footer on every screen. */
export default function BuiltByFooter({ withTitle = false, className = "" }: BuiltByFooterProps) {
  return (
    <div className={`flex flex-col items-center gap-1 text-center ${className}`}>
      <div className="flex items-center gap-2">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
          <defs>
            <linearGradient id="v-mono" x1="0" y1="0" x2="24" y2="24">
              <stop offset="0%" stopColor="rgb(var(--grad-start))" />
              <stop offset="100%" stopColor="rgb(var(--grad-end))" />
            </linearGradient>
          </defs>
          <path
            d="M4 5 L12 20 L20 5"
            fill="none"
            stroke="url(#v-mono)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {withTitle && (
          <span className="text-sm font-medium text-brand-gradient">
            Mira — AI Avatar Companion
          </span>
        )}
      </div>
      <span className="text-xs text-ink-muted">Built by Vaibhav Rajput</span>
    </div>
  );
}
