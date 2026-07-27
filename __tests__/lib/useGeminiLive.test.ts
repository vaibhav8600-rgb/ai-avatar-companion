import { renderHook, act } from "@testing-library/react";
import { useGeminiLive } from "@/lib/useGeminiLive";

/** Minimal scriptable WebSocket double (jsdom ships none). */
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: "client close" });
  }
  // ---- test helpers (server side of the wire) ----
  serverOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
  serverMessage(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  serverDrop(code = 1006, reason = "network lost") {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

const flush = () => act(async () => {});

let realWebSocket: unknown;
let realFetch: typeof fetch | undefined;

beforeAll(() => {
  realWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
  realFetch = global.fetch;
});
beforeEach(() => {
  MockWebSocket.instances = [];
  (globalThis as { WebSocket: unknown }).WebSocket = MockWebSocket;
});
afterEach(() => {
  jest.restoreAllMocks();
});
afterAll(() => {
  (globalThis as { WebSocket: unknown }).WebSocket = realWebSocket;
  global.fetch = realFetch as typeof fetch;
});

function mockTokenResponse() {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      token: "auth_tokens/tok",
      model: "gemini-test-live",
      voice: "Aoede",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
  }) as unknown as typeof fetch;
}

/** Connect a hook through the mock wire; returns the socket. */
async function connectLive(
  result: { current: ReturnType<typeof useGeminiLive> },
  opts?: Parameters<ReturnType<typeof useGeminiLive>["connect"]>[0],
) {
  let ok!: Promise<boolean>;
  act(() => {
    ok = result.current.connect(opts);
  });
  await flush(); // token fetch resolves, socket constructed
  const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  await act(async () => {
    ws.serverOpen();
    ws.serverMessage({ setupComplete: {} });
  });
  await expect(ok).resolves.toBe(true);
  return ws;
}

describe("useGeminiLive", () => {
  it("starts idle and reports unconfigured from the 4xx reason (skip to classic)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 424,
      json: async () => ({ error: "gemini_live_not_configured" }),
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useGeminiLive({}));
    expect(result.current.status).toBe("idle");

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.connect();
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe("unconfigured");
    // Permanent: further connects resolve false without another fetch.
    await act(async () => {
      ok = await result.current.connect();
    });
    expect(ok).toBe(false);
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
  });

  it("settles to error (classic fallback) when the token fetch fails", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useGeminiLive({}));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.connect();
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe("error");
    expect(warn).toHaveBeenCalled();
  });

  it("goes live after setup; history rides in the token request, NOT the socket", async () => {
    mockTokenResponse();
    const { result } = renderHook(() => useGeminiLive({}));
    const ws = await connectLive(result, {
      history: [
        { id: "1", role: "user", content: "hi", timestamp: "t" },
        { id: "2", role: "assistant", content: "hello!", timestamp: "t" },
      ],
    });

    expect(result.current.status).toBe("live");
    // The token travels only in the socket URL — never the Google key — and
    // ephemeral tokens require the CONSTRAINED bidi method.
    expect(ws.url).toContain("GenerativeService.BidiGenerateContentConstrained");
    expect(ws.url).toContain("access_token=auth_tokens%2Ftok");

    // History goes to /api/live-token (locked into the token's system
    // instruction server-side) — the only context channel the constrained
    // session honors.
    const tokenBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(tokenBody.history).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello!" },
    ]);

    const setup = JSON.parse(ws.sent[0]);
    expect(setup.setup.model).toBe("models/gemini-test-live");
    expect(setup.setup.generationConfig.responseModalities).toEqual(["AUDIO"]);
    // The voice from the token route is mirrored into the session setup —
    // without it Google speaks with its default male voice.
    expect(
      setup.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
    ).toBe("Aoede");
    // No client systemInstruction (ignored on constrained sessions) and NO
    // clientContent seeding (turnComplete:false hard-closes the socket, 1007).
    expect(setup.setup.systemInstruction).toBeUndefined();
    expect(ws.sent).toHaveLength(1);
    expect(setup.setup.inputAudioTranscription).toEqual({});
    expect(setup.setup.outputAudioTranscription).toEqual({});
  });

  it("routes audio + transcripts through the turn lifecycle in spoken order", async () => {
    mockTokenResponse();
    const events: string[] = [];
    const { result } = renderHook(() =>
      useGeminiLive({
        onAudioChunk: (b64, rate) => events.push(`audio:${b64}@${rate}`),
        onUserTranscript: (t) => events.push(`user:${t}`),
        onModelTranscript: (t) => events.push(`model:${t}`),
        onSpeakingStart: () => events.push("speaking"),
        onTurnComplete: () => events.push("turn-done"),
      }),
    );
    const ws = await connectLive(result);

    await act(async () => {
      ws.serverMessage({ serverContent: { inputTranscription: { text: "what's " } } });
      ws.serverMessage({ serverContent: { inputTranscription: { text: "up?" } } });
      ws.serverMessage({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "UEND" } }],
          },
          outputTranscription: { text: "Not much" },
        },
      });
      ws.serverMessage({ serverContent: { outputTranscription: { text: ", you?" } } });
      ws.serverMessage({ serverContent: { turnComplete: true } });
    });

    expect(events).toEqual([
      "user:what's up?", // committed the moment the model turn starts
      "speaking",
      "audio:UEND@24000",
      "model:Not much, you?", // committed on turnComplete
      "turn-done",
    ]);
  });

  it("flushes partial transcripts and calls onFailover on an unexpected drop", async () => {
    mockTokenResponse();
    const got: Record<string, string> = {};
    let failover = "";
    const { result } = renderHook(() =>
      useGeminiLive({
        onUserTranscript: (t) => (got.user = t),
        onModelTranscript: (t) => (got.model = t),
        onFailover: (r) => (failover = r),
      }),
    );
    const ws = await connectLive(result);

    await act(async () => {
      ws.serverMessage({ serverContent: { inputTranscription: { text: "remember the " } } });
      ws.serverMessage({ serverContent: { outputTranscription: { text: "Of course" } } });
      ws.serverDrop(1006, "network lost");
    });

    // Context preserved: both partial turns landed in history before failover.
    expect(got.user).toBe("remember the");
    expect(got.model).toBe("Of course");
    expect(failover).toMatch(/1006/);
    expect(result.current.status).toBe("error");
  });

  it("an unexpected drop leaves connect() able to reconnect (fresh token)", async () => {
    mockTokenResponse();
    const { result } = renderHook(() => useGeminiLive({ onFailover: () => {} }));
    const ws1 = await connectLive(result);
    await act(async () => ws1.serverDrop(1007, "invalid argument"));

    // The cached connect promise must be cleared on an unexpected close, or
    // this would resolve with the DEAD session's `true` and never reconnect.
    const ws2 = await connectLive(result);
    expect(ws2).not.toBe(ws1);
    expect(result.current.status).toBe("live");
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(2); // new token minted
  });

  it("disconnect() is intentional — no failover fires", async () => {
    mockTokenResponse();
    let failover: string | null = null;
    const { result } = renderHook(() => useGeminiLive({ onFailover: (r) => (failover = r) }));
    await connectLive(result);

    act(() => {
      result.current.disconnect();
    });
    expect(result.current.status).toBe("closed");
    expect(failover).toBeNull();
  });

  it("startMic resolves false when no session is open", async () => {
    const { result } = renderHook(() => useGeminiLive({}));
    await expect(result.current.startMic()).resolves.toBe(false);
  });

  it("sendText forwards a text turn into the live session (camera-mode path)", async () => {
    mockTokenResponse();
    const { result } = renderHook(() => useGeminiLive({}));
    const ws = await connectLive(result);

    let ok!: boolean;
    act(() => {
      ok = result.current.sendText("(The camera currently sees: a desk)\nwhat do you think?");
    });
    expect(ok).toBe(true);
    const sent = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(sent.clientContent.turnComplete).toBe(true);
    expect(sent.clientContent.turns).toEqual([
      {
        role: "user",
        parts: [{ text: "(The camera currently sees: a desk)\nwhat do you think?" }],
      },
    ]);
  });

  it("sendText returns false when the session isn't live (caller falls back to classic)", () => {
    const { result } = renderHook(() => useGeminiLive({}));
    expect(result.current.sendText("hello")).toBe(false);
  });

  it("sendVideoFrame streams a camera frame as realtimeInput.video (Live Vision)", async () => {
    mockTokenResponse();
    const { result } = renderHook(() => useGeminiLive({}));
    const ws = await connectLive(result);

    let ok!: boolean;
    act(() => {
      // Data-URL form, as produced by useCamera.capture() — prefix stripped.
      ok = result.current.sendVideoFrame("data:image/jpeg;base64,QUJD");
    });
    expect(ok).toBe(true);
    const sent = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(sent.realtimeInput.video).toEqual({ data: "QUJD", mimeType: "image/jpeg" });
  });

  it("sendVideoFrame returns false when the session isn't live", () => {
    const { result } = renderHook(() => useGeminiLive({}));
    expect(result.current.sendVideoFrame("data:image/jpeg;base64,QUJD")).toBe(false);
  });

  it("runs a tool call through onToolCall and answers with a toolResponse", async () => {
    mockTokenResponse();
    const seen: { name: string; args: Record<string, unknown> }[] = [];
    const { result } = renderHook(() =>
      useGeminiLive({
        onToolCall: async (name, args) => {
          seen.push({ name, args });
          return { ok: true, saved: String(args.label) };
        },
      }),
    );
    const ws = await connectLive(result);

    await act(async () => {
      ws.serverMessage({
        toolCall: {
          functionCalls: [
            {
              id: "fc_1",
              name: "save_visual_memory",
              args: { label: "red mug", description: "a bright red mug" },
            },
          ],
        },
      });
    });

    expect(seen).toEqual([
      { name: "save_visual_memory", args: { label: "red mug", description: "a bright red mug" } },
    ]);
    const reply = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(reply.toolResponse.functionResponses).toEqual([
      { id: "fc_1", name: "save_visual_memory", response: { ok: true, saved: "red mug" } },
    ]);
  });

  it("visual memories travel to the token route in the connect POST", async () => {
    mockTokenResponse();
    const { result } = renderHook(() => useGeminiLive({}));
    await connectLive(result, {
      visualMemories: [{ type: "object", label: "keyboard", description: "slim black" }],
    });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.visualMemories).toEqual([
      { type: "object", label: "keyboard", description: "slim black" },
    ]);
  });
});
