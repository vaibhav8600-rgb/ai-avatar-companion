"use client";

import { motion } from "framer-motion";

/** Red top banner shown when the browser reports offline (mockup image 10). */
export default function OfflineBanner({ onRetry }: { onRetry?: () => void }) {
  return (
    <motion.div
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -40, opacity: 0 }}
      className="relative z-30 flex items-center justify-center gap-3 border-b border-status-error/30 bg-status-error/15 px-4 py-2 text-center text-sm text-red-200"
    >
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-status-error" />
        Connection lost. Mira is currently offline.
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-status-error/50 bg-status-error/20 px-3 py-0.5 text-xs font-medium text-red-100 hover:bg-status-error/30"
        >
          Retry
        </button>
      )}
    </motion.div>
  );
}
