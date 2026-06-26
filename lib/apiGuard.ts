// Server-only request guard for the API routes.
//
// Two cheap, dependency-free protections so a public deployment can't be
// trivially abused to burn the paid Gemini / Deepgram / Simli quota:
//
//   1. Origin check — only accept POSTs that come from the app's own origin
//      (the browser always sends an Origin header on a cross-origin-capable
//      fetch). Optionally require a shared secret header instead, for
//      programmatic callers. This blocks casual curl/scraper abuse from other
//      sites. It is NOT a defense against a determined attacker spoofing
//      headers — pair it with the rate limit below.
//   2. Rate limit — a small in-memory sliding window keyed by client IP, so a
//      single source can't hammer a route. (Per-instance only; good enough for
//      a single-region deploy. Swap for Upstash/Redis if you scale out.)
//
// Returns a ready-to-send NextResponse when the request should be rejected, or
// null when it's allowed.

import { NextRequest, NextResponse } from "next/server";

interface GuardOptions {
  /** Max requests allowed per window, per IP. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
}

// ----- in-memory rate limiter -----

const hits = new Map<string, number[]>();
// Bound the map so a flood of unique IPs can't grow memory without limit.
const MAX_KEYS = 5000;

function clientKey(req: NextRequest, route: string): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return `${route}:${ip}`;
}

function rateLimited(key: string, opts: GuardOptions): number | null {
  const now = Date.now();
  const windowStart = now - opts.windowMs;
  const recent = (hits.get(key) || []).filter((t) => t > windowStart);

  if (recent.length >= opts.limit) {
    // Seconds until the oldest hit in the window expires.
    const retryAfter = Math.ceil((recent[0] + opts.windowMs - now) / 1000);
    hits.set(key, recent);
    return Math.max(retryAfter, 1);
  }

  recent.push(now);
  hits.set(key, recent);

  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (hits.size > MAX_KEYS) {
    for (const [k, v] of hits) {
      const live = v.filter((t) => t > windowStart);
      if (live.length === 0) hits.delete(k);
      else hits.set(k, live);
    }
  }
  return null;
}

// ----- origin / secret check -----

function allowedOrigin(req: NextRequest): boolean {
  // A shared secret (if configured) is an explicit allow for any caller.
  const secret = process.env.API_SHARED_SECRET;
  if (secret && req.headers.get("x-api-secret") === secret) return true;

  const origin = req.headers.get("origin");
  // Same-origin fetches from our own pages always send a matching Origin.
  // (Some privacy setups strip it; we only hard-block a *mismatching* origin.)
  if (!origin) return true;

  try {
    const host = req.headers.get("host");
    const originHost = new URL(origin).host;
    return host ? originHost === host : true;
  } catch {
    return false;
  }
}

/**
 * Guard an API route. Returns a NextResponse to short-circuit with (and stop
 * processing), or null when the request is allowed to proceed.
 */
export function guard(
  req: NextRequest,
  route: string,
  opts: GuardOptions,
): NextResponse | null {
  if (!allowedOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const retryAfter = rateLimited(clientKey(req, route), opts);
  if (retryAfter !== null) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  return null;
}
