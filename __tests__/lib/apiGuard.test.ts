/**
 * @jest-environment node
 */
import type { NextRequest } from "next/server";
import { guard } from "@/lib/apiGuard";

// Minimal NextRequest stand-in: guard() only reads headers.
function req(headers: Record<string, string> = {}): NextRequest {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as NextRequest;
}

describe("apiGuard.guard (origin check)", () => {
  it("allows requests with no Origin header (same-origin / stripped)", async () => {
    expect(await guard(req(), "test-a", { limit: 100, windowMs: 60000 })).toBeNull();
  });

  it("allows a matching origin/host", async () => {
    const res = await guard(req({ origin: "https://mira.app", host: "mira.app" }), "test-b", {
      limit: 100,
      windowMs: 60000,
    });
    expect(res).toBeNull();
  });

  it("blocks a mismatching origin with 403", async () => {
    const res = await guard(req({ origin: "https://evil.com", host: "mira.app" }), "test-c", {
      limit: 100,
      windowMs: 60000,
    });
    expect(res?.status).toBe(403);
  });

  it("honors a shared secret regardless of origin", async () => {
    process.env.API_SHARED_SECRET = "s3cret";
    const res = await guard(
      req({ origin: "https://evil.com", host: "mira.app", "x-api-secret": "s3cret" }),
      "test-d",
      { limit: 100, windowMs: 60000 },
    );
    expect(res).toBeNull();
    delete process.env.API_SHARED_SECRET;
  });
});

describe("apiGuard.guard (in-memory rate limit)", () => {
  it("returns 429 once the per-IP limit is exceeded in the window", async () => {
    const opts = { limit: 2, windowMs: 60000 };
    const headers = { "x-forwarded-for": "10.0.0.9" };
    expect(await guard(req(headers), "rl-route", opts)).toBeNull(); // 1
    expect(await guard(req(headers), "rl-route", opts)).toBeNull(); // 2
    const third = await guard(req(headers), "rl-route", opts); // 3 → blocked
    expect(third?.status).toBe(429);
    expect(third?.headers.get("Retry-After")).toBeTruthy();
  });

  it("limits are independent per route", async () => {
    const opts = { limit: 1, windowMs: 60000 };
    const headers = { "x-forwarded-for": "10.0.0.10" };
    expect(await guard(req(headers), "route-x", opts)).toBeNull();
    expect(await guard(req(headers), "route-y", opts)).toBeNull(); // different route → fresh
    expect((await guard(req(headers), "route-x", opts))?.status).toBe(429);
  });
});
