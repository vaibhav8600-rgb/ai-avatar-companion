"use client";

import { useEffect } from "react";

/**
 * Manages the PWA service worker.
 *
 * - In production: registers it once (offline + install support).
 * - In development: proactively *unregisters* any existing service worker and
 *   clears its caches. This matters because a worker registered while testing a
 *   production build (`npm run build && npm start`) keeps controlling
 *   localhost across later `npm run dev` sessions and serves stale cached HTML,
 *   which shows up as React hydration mismatches. Cleaning up in dev makes the
 *   environment self-heal on the next load.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      if (typeof caches !== "undefined") {
        caches
          .keys()
          .then((keys) => keys.forEach((k) => caches.delete(k)))
          .catch(() => {});
      }
      return;
    }

    const onLoad = () => {
      navigator.serviceWorker.register("/service-worker.js").catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
    };

    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
