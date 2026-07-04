import { fetchTtsAudio, isTtsAudioSupported, stopServerTts, primeTtsAudio } from "@/lib/ttsAudio";

describe("fetchTtsAudio", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns a PCM clip on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ audioBase64: "AAAA", sampleRate: 24000 }),
    }) as unknown as typeof fetch;
    const clip = await fetchTtsAudio("hello", "gemini-2.5-flash-preview-tts", "Kore");
    expect(clip).toEqual({ audioBase64: "AAAA", sampleRate: 24000, format: "pcm" });
  });

  it("throws when the server returns no audio", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    await expect(fetchTtsAudio("x")).rejects.toThrow(/no audio/i);
  });

  it("throws with the server error on a non-ok response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "tts down" }),
    }) as unknown as typeof fetch;
    await expect(fetchTtsAudio("x")).rejects.toThrow(/tts down/);
  });
});

describe("ttsAudio guards", () => {
  it("reports Web Audio support as a boolean", () => {
    expect(typeof isTtsAudioSupported()).toBe("boolean");
  });

  it("stop and prime are safe to call even with no audio context", () => {
    expect(() => stopServerTts()).not.toThrow();
    expect(() => primeTtsAudio()).not.toThrow();
  });
});
