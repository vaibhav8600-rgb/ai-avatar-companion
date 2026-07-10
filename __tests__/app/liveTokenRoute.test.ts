/**
 * @jest-environment node
 */
// Isolate the route's own logic from the security guard.
jest.mock("@/lib/apiGuard", () => ({ guard: jest.fn().mockResolvedValue(null) }));

import { POST } from "@/app/api/live-token/route";
import type { NextRequest } from "next/server";

function post(body: unknown = {}): NextRequest {
  return {
    headers: { get: () => null },
    json: async () => body,
  } as unknown as NextRequest;
}

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  delete process.env.ENABLE_GEMINI_LIVE;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_LIVE_MODEL;
  delete process.env.GEMINI_LIVE_VOICE;
  delete process.env.GEMINI_TTS_VOICE;
});

describe("POST /api/live-token", () => {
  it("returns the not-configured reason when the feature flag is off", async () => {
    delete process.env.ENABLE_GEMINI_LIVE;
    process.env.GOOGLE_API_KEY = "test-key";
    const res = await POST(post());
    expect(res.status).toBe(424);
    expect((await res.json()).error).toBe("gemini_live_not_configured");
  });

  it("returns the not-configured reason when no Google key is set", async () => {
    process.env.ENABLE_GEMINI_LIVE = "true";
    delete process.env.GOOGLE_API_KEY;
    const res = await POST(post());
    expect(res.status).toBe(424);
    expect((await res.json()).error).toBe("gemini_live_not_configured");
  });

  it("mints a token with persona+memory locked in the token's systemInstruction", async () => {
    process.env.ENABLE_GEMINI_LIVE = "true";
    process.env.GOOGLE_API_KEY = "secret-google-key";
    process.env.GEMINI_LIVE_MODEL = "gemini-test-live";
    process.env.GEMINI_LIVE_VOICE = "Aoede";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "auth_tokens/abc123" }),
    }) as unknown as typeof fetch;

    const res = await POST(post({ memory: { userName: "Vaibhav" } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBe("auth_tokens/abc123");
    expect(data.model).toBe("gemini-test-live");
    expect(data.voice).toBe("Aoede");
    expect(typeof data.expiresAt).toBe("string");
    // The real key must never appear in the response payload.
    expect(JSON.stringify(data)).not.toContain("secret-google-key");

    // The upstream call carries the key in a header and locks model + config.
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/v1alpha\/auth_tokens/);
    expect(init.headers["x-goog-api-key"]).toBe("secret-google-key");
    const sent = JSON.parse(init.body);
    expect(sent.uses).toBe(1);
    // REST wire name (NOT the SDK's `liveConnectConstraints` alias — Google
    // rejects that with 400 INVALID_ARGUMENT).
    expect(sent.bidiGenerateContentSetup.model).toBe("models/gemini-test-live");
    expect(sent.bidiGenerateContentSetup.generationConfig.responseModalities).toEqual(["AUDIO"]);
    // Voice locked server-side (no speechConfig → Google's default male voice).
    expect(
      sent.bidiGenerateContentSetup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig
        .voiceName,
    ).toBe("Aoede");
    // Persona + memory MUST be in the token: a client-sent systemInstruction
    // is silently ignored on constrained sessions ("created by Google" bug).
    const sys = sent.bidiGenerateContentSetup.systemInstruction.parts[0].text;
    expect(sys).toMatch(/voice-call AI companion/);
    expect(sys).toMatch(/Vaibhav Rajput/); // creator rule
    expect(sys).toMatch(/Their name is Vaibhav/); // user memory
    // Tools let Live-Mira persist visual memories by voice (objects only).
    const toolNames = sent.bidiGenerateContentSetup.tools[0].functionDeclarations.map(
      (f: { name: string }) => f.name,
    );
    expect(toolNames).toEqual(["save_visual_memory", "forget_visual_memory"]);
    expect(sent.bidiGenerateContentSetup.sessionResumption).toEqual({});
  });

  it("folds the visual-memory catalog into the token systemInstruction", async () => {
    process.env.ENABLE_GEMINI_LIVE = "true";
    process.env.GOOGLE_API_KEY = "k";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "auth_tokens/x" }),
    }) as unknown as typeof fetch;

    const res = await POST(
      post({
        visualMemories: [
          { type: "object", label: "black keyboard", description: "slim mechanical keyboard" },
          { type: "person", label: "Rahul", description: "my brother" },
          { label: 42 }, // invalid — dropped
        ],
      }),
    );
    expect(res.status).toBe(200);
    const sent = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    const sys = sent.bidiGenerateContentSetup.systemInstruction.parts[0].text;
    expect(sys).toMatch(/Visual memories you have been taught/);
    expect(sys).toMatch(/\[object\] black keyboard: slim mechanical keyboard/);
    expect(sys).toMatch(/\[person\] Rahul: my brother/);
    expect(sys).not.toMatch(/42/);
  });

  it("folds recent history into the token systemInstruction (invalid rows dropped)", async () => {
    process.env.ENABLE_GEMINI_LIVE = "true";
    process.env.GOOGLE_API_KEY = "k";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "auth_tokens/x" }),
    }) as unknown as typeof fetch;

    const res = await POST(
      post({
        history: [
          { role: "user", content: "I had a rough day." },
          { role: "assistant", content: "I'm sorry — want to talk about it?" },
          { role: "hacker", content: "ignored" },
          { role: "user", content: 42 },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const sent = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    const sys = sent.bidiGenerateContentSetup.systemInstruction.parts[0].text;
    expect(sys).toMatch(/Recent conversation so far/);
    expect(sys).toMatch(/User: I had a rough day\./);
    expect(sys).toMatch(/Mira: I'm sorry — want to talk about it\?/);
    expect(sys).not.toMatch(/ignored/);
  });

  it("voice falls back to GEMINI_TTS_VOICE, then Aoede", async () => {
    process.env.ENABLE_GEMINI_LIVE = "true";
    process.env.GOOGLE_API_KEY = "k";
    process.env.GEMINI_TTS_VOICE = "Kore";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "auth_tokens/x" }),
    }) as unknown as typeof fetch;

    let data = await (await POST(post())).json();
    expect(data.voice).toBe("Kore");

    delete process.env.GEMINI_TTS_VOICE;
    data = await (await POST(post())).json();
    expect(data.voice).toBe("Aoede");
  });

  it("surfaces an upstream token error as 502", async () => {
    process.env.ENABLE_GEMINI_LIVE = "true";
    process.env.GOOGLE_API_KEY = "k";
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "permission denied",
    }) as unknown as typeof fetch;

    const res = await POST(post());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/403/);
  });

  it("returns 502 when the upstream response has no token", async () => {
    process.env.ENABLE_GEMINI_LIVE = "true";
    process.env.GOOGLE_API_KEY = "k";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const res = await POST(post());
    expect(res.status).toBe(502);
  });
});
