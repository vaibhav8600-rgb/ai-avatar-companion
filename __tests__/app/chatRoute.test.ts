/**
 * @jest-environment node
 */
// Isolate the route's own logic from the security guard.
jest.mock("@/lib/apiGuard", () => ({ guard: jest.fn().mockResolvedValue(null) }));

import { POST } from "@/app/api/chat/route";
import type { NextRequest } from "next/server";

// Ensure the demo (mock) path: no chat-provider keys configured.
beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
});

function post(body: unknown, badJson = false): NextRequest {
  return {
    headers: { get: () => null },
    json: async () => {
      if (badJson) throw new Error("bad json");
      return body;
    },
  } as unknown as NextRequest;
}

describe("POST /api/chat", () => {
  it("rejects invalid JSON with 400", async () => {
    const res = await POST(post(null, true));
    expect(res.status).toBe(400);
  });

  it("requires a non-empty messages array", async () => {
    const res = await POST(post({ messages: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/messages required/i);
  });

  it("rejects an oversized message count with 413", async () => {
    const messages = Array.from({ length: 201 }, () => ({ role: "user", content: "x" }));
    const res = await POST(post({ messages }));
    expect(res.status).toBe(413);
  });

  it("returns a mock reply in demo mode when no provider key is set", async () => {
    const res = await POST(post({ messages: [{ role: "user", content: "hello" }] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.provider).toBe("mock");
    expect(typeof data.reply).toBe("string");
    expect(data.reply.length).toBeGreaterThan(0);
  });

  it("mock reply attributes creation to Vaibhav Rajput", async () => {
    const res = await POST(post({ messages: [{ role: "user", content: "who created you?" }] }));
    const data = await res.json();
    expect(data.reply).toMatch(/Vaibhav Rajput/);
  });
});
