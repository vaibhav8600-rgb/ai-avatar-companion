import { sendChat } from "@/lib/apiClient";

describe("sendChat", () => {
  afterEach(() => jest.restoreAllMocks());

  it("POSTs to /api/chat and returns the parsed reply", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "hi there", provider: "mock" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await sendChat({ messages: [{ role: "user", content: "hello" }] });
    expect(res).toEqual({ reply: "hi there", provider: "mock" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/chat");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ messages: [{ role: "user", content: "hello" }] });
  });

  it("forwards the abort signal", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ reply: "x", provider: "mock" }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const controller = new AbortController();
    await sendChat({ messages: [] }, controller.signal);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("throws a descriptive error on a non-ok response (json error)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "rate limited" }),
    }) as unknown as typeof fetch;

    await expect(sendChat({ messages: [] })).rejects.toThrow(/429.*rate limited/);
  });

  it("falls back to text() when the error body is not json", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("no json");
      },
      text: async () => "boom",
    }) as unknown as typeof fetch;

    await expect(sendChat({ messages: [] })).rejects.toThrow(/500.*boom/);
  });
});
