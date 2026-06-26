// Server-only request guard for the API routes.
//
// Two protections so a public deployment can't be trivially abused to burn the
// paid Gemini / Deepgram / Simli quota:
//
//   1. Origin check — only accept POSTs from the app's own origin (the browser
//      sends an Origin header on cross-origin-capable fetches). A configured
//      `API_SHARED_SECRET` (sent as `x-api-secret`) is an explicit allow for
//      trusted programmatic callers. Blocks casual curl/scraper abuse; pair it
//      with the rate limit below.
//   2. Rate limit — per-IP, per-route sliding window.
//      • In production with Upstash configured, uses a DISTRIBUTED limiter
//        (@upstash/ratelimit + Redis) so it works across stateless serverless
//        instances. An in-instance `ephemeralCache` short-circuits repeat hits
//        so we don't call Redis on every request (lower latency + cost).
//      • Without Upstash env vars (local dev), it transparently falls back to a
//        simple in-memory limiter — no setup required. The same fallback also
//        catches a Redis outage so a transient failure can't take the app down.
//
// `guard()` returns a ready-to-send NextResponse when the request should be
// rejected, or null when it's allowed. It is async (the distributed limiter
// makes a network call), so call sites `await` it.

import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

interface GuardOptions {
  /** Max requests allowed per window, per IP. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /**
   * Skip the distributed (Redis) limiter and use only the in-instance one.
   * Use on latency-critical hot paths (e.g. TTS chunks, several per reply) where
   * the expensive call (chat) is already Redis-gated — avoids a Redis round-trip
   * per audio chunk.
   */
  localOnly?: boolean;
}

// ----- client IP -----

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "anonymous";
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

// ----- distributed limiter (Upstash Redis) -----

const upstashConfigured =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

// Singletons reused across warm invocations (avoid reconnecting per request).
let redis: Redis | null = null;
// One in-memory cache shared by every limiter: once an IP is known to be
// blocked for a window, repeat requests are rejected without a Redis round-trip.
const ephemeralCache = new Map<string, number>();
// Cache Ratelimit instances per route+config so we build them once.
const limiters = new Map<string, Ratelimit>();

function getRedis(): Redis {
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

function getLimiter(route: string, opts: GuardOptions): Ratelimit {
  const key = `${route}:${opts.limit}:${opts.windowMs}`;
  let rl = limiters.get(key);
  if (!rl) {
    const windowSec = Math.max(1, Math.ceil(opts.windowMs / 1000));
    rl = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(opts.limit, `${windowSec} s`),
      ephemeralCache, // fewer Redis calls for hot/blocked IPs
      analytics: false, // skip extra Redis writes — lower latency & cost
      prefix: `rl:${route}`, // namespace per route
    });
    limiters.set(key, rl);
  }
  return rl;
}

// ----- in-memory fallback (local dev / Redis outage) -----

const hits = new Map<string, number[]>();
const MAX_KEYS = 5000;

function memRateLimited(key: string, opts: GuardOptions): number | null {
  const now = Date.now();
  const windowStart = now - opts.windowMs;
  const recent = (hits.get(key) || []).filter((t) => t > windowStart);

  if (recent.length >= opts.limit) {
    const retryAfter = Math.ceil((recent[0] + opts.windowMs - now) / 1000);
    hits.set(key, recent);
    return Math.max(retryAfter, 1);
  }

  recent.push(now);
  hits.set(key, recent);

  if (hits.size > MAX_KEYS) {
    for (const [k, v] of hits) {
      const live = v.filter((t) => t > windowStart);
      if (live.length === 0) hits.delete(k);
      else hits.set(k, live);
    }
  }
  return null;
}

function tooMany(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please slow down." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/**
 * Guard an API route. Returns a NextResponse to short-circuit with (and stop
 * processing), or null when the request is allowed to proceed.
 */
export async function guard(
  req: NextRequest,
  route: string,
  opts: GuardOptions,
): Promise<NextResponse | null> {
  if (!allowedOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = clientIp(req);

  if (upstashConfigured && !opts.localOnly) {
    try {
      const { success, reset } = await getLimiter(route, opts).limit(ip);
      if (!success) {
        const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
        return tooMany(retryAfter);
      }
      return null;
    } catch (err) {
      // Redis unreachable — fall back to in-memory so we stay available.
      console.error("Upstash ratelimit error; using in-memory fallback:", err);
    }
  }

  const retryAfter = memRateLimited(`${route}:${ip}`, opts);
  if (retryAfter !== null) return tooMany(retryAfter);
  return null;
}
