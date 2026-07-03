import type { CSSProperties } from "react";

interface SkeletonProps {
  className?: string;
  /** Border-radius utility (defaults to a rounded rectangle). */
  rounded?: string;
  style?: CSSProperties;
}

/**
 * Shimmering loading placeholder (see `.skeleton` in globals.css). Theme-aware
 * and reduced-motion friendly. Compose several to mirror the real layout while
 * async data (IndexedDB memories, images, the 3D orb bundle) loads.
 */
export default function Skeleton({ className = "", rounded = "rounded-lg", style }: SkeletonProps) {
  return <div className={`skeleton ${rounded} ${className}`} style={style} aria-hidden />;
}

/** A memory/thumbnail card skeleton used by the Visual Memory grid. */
export function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-white/10 bg-white/[0.03]">
      <Skeleton rounded="rounded-none" className="h-28 w-full" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-2.5 w-1/3" />
      </div>
    </div>
  );
}
