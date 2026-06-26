"use client";

// Lightweight per-turn latency instrumentation for the voice pipeline.
//
// Measures "time to first spoken word" broken into stages so optimizations can
// be proven, not guessed. A turn starts when speech is finalized (perfStart),
// marks are recorded along the way (perfMark), and the deltas are logged when
// the first audio plays (perfFlush).
//
// Enabled in development automatically; in production set localStorage
// "mira:perf" = "1" to turn it on. Zero overhead and silent when disabled.

function enabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return true;
  try {
    return localStorage.getItem("mira:perf") === "1";
  } catch {
    return false;
  }
}

let t0 = 0;
let marks: Array<[string, number]> = [];
let active = false;

/** Begin a turn (call when the user's speech is finalized). */
export function perfStart(): void {
  if (!enabled()) {
    active = false;
    return;
  }
  t0 = performance.now();
  marks = [];
  active = true;
}

/** Record a stage relative to the turn start, e.g. "chat" or "first-audio". */
export function perfMark(label: string): void {
  if (!active) return;
  marks.push([label, Math.round(performance.now() - t0)]);
}

/** Log the turn's stage deltas and end the turn. */
export function perfFlush(): void {
  if (!active) return;
  active = false;
  const summary = marks.map(([l, ms]) => `${l}=${ms}ms`).join("  ");
  // eslint-disable-next-line no-console
  console.debug(`[mira latency] ${summary}`);
}
