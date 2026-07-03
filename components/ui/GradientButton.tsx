"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface GradientButtonProps {
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  /** "solid" = full brand-gradient fill; "outline" = gradient hairline only. */
  variant?: "solid" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
}

const SIZE: Record<NonNullable<GradientButtonProps["size"]>, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-6 py-3 text-sm",
  lg: "px-8 py-4 text-base",
};

/**
 * Primary CTA: full brand-gradient fill with a soft outer glow that intensifies
 * on hover/press. Honors reduced-motion via Framer's respect for the OS setting
 * (transforms are small and compositor-friendly).
 */
export default function GradientButton({
  onClick,
  type = "button",
  disabled = false,
  variant = "solid",
  size = "md",
  className = "",
  children,
  ...aria
}: GradientButtonProps) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={`group relative inline-flex items-center justify-center gap-2 rounded-full font-semibold ${SIZE[size]} ${
        disabled ? "cursor-not-allowed opacity-40" : ""
      } ${className}`}
      {...aria}
    >
      {/* Glow layer (opacity-only → cheap; no box-shadow animation on hot path). */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-brand-gradient opacity-50 blur-lg transition-opacity duration-300 group-hover:opacity-80"
      />
      {variant === "solid" ? (
        <span className="absolute inset-0 rounded-full bg-brand-gradient" aria-hidden />
      ) : (
        <>
          <span
            className="absolute inset-0 rounded-full bg-brand-gradient opacity-90"
            aria-hidden
          />
          <span className="absolute inset-[1.5px] rounded-full bg-cosmic-elevated" aria-hidden />
        </>
      )}
      <span
        className={`relative z-10 inline-flex items-center gap-2 ${variant === "outline" ? "text-brand-gradient" : "text-onbrand"}`}
      >
        {children}
      </span>
    </motion.button>
  );
}
