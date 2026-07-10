import { renderHook, act } from "@testing-library/react";
import { useSimliAvatar } from "@/lib/useSimliAvatar";

describe("useSimliAvatar", () => {
  it("exposes the avatar lifecycle API and starts idle", () => {
    const { result } = renderHook(() => useSimliAvatar({}));
    expect(result.current.status).toBe("idle");
    for (const fn of [
      "ensureConnected",
      "speak",
      "speakChunks",
      "speakStream",
      "sendPcm",
      "clear",
      "stop",
    ] as const) {
      expect(typeof result.current[fn]).toBe("function");
    }
    expect(result.current.videoRef).toBeDefined();
    expect(result.current.audioRef).toBeDefined();
  });

  it("ensureConnected resolves false when the media elements aren't mounted", async () => {
    const { result } = renderHook(() => useSimliAvatar({}));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.ensureConnected();
    });
    expect(ok).toBe(false);
  });

  it("clear() and stop() are safe no-ops when nothing is connected", () => {
    const { result } = renderHook(() => useSimliAvatar({}));
    expect(() => result.current.clear()).not.toThrow();
    expect(() => result.current.stop()).not.toThrow();
  });

  it("sendPcm (Gemini Live audio) throws when the avatar isn't connected", () => {
    const { result } = renderHook(() => useSimliAvatar({}));
    expect(() => result.current.sendPcm(new Uint8Array(4))).toThrow(/not connected/i);
  });
});
