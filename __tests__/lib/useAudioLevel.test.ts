import { renderHook } from "@testing-library/react";
import { useAudioLevel } from "@/lib/useAudioLevel";

describe("useAudioLevel", () => {
  it("exposes a level ref and attach/detach helpers", () => {
    const { result } = renderHook(() => useAudioLevel());
    expect(result.current.levelRef.current).toBe(0);
    expect(typeof result.current.attachStream).toBe("function");
    expect(typeof result.current.attachElement).toBe("function");
    expect(typeof result.current.detach).toBe("function");
  });

  it("degrades gracefully when Web Audio is unavailable (no throw)", () => {
    const { result } = renderHook(() => useAudioLevel());
    // jsdom has no AudioContext — attach* swallow the failure internally.
    expect(() =>
      result.current.attachStream({ getTracks: () => [] } as unknown as MediaStream),
    ).not.toThrow();
    expect(() => result.current.detach()).not.toThrow();
    expect(result.current.levelRef.current).toBe(0);
  });

  it("cleans up on unmount without throwing", () => {
    const { unmount } = renderHook(() => useAudioLevel());
    expect(() => unmount()).not.toThrow();
  });
});
