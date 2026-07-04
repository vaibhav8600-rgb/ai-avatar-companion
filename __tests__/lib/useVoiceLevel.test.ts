import { renderHook } from "@testing-library/react";
import { useVoiceLevel } from "@/lib/useVoiceLevel";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("useVoiceLevel", () => {
  it("returns an amplitude ref that starts at 0", () => {
    const { result } = renderHook(() => useVoiceLevel("idle"));
    expect(result.current.current).toBe(0);
  });

  it("stays a valid 0..1 number while speaking and cleans up on unmount", async () => {
    const { result, rerender, unmount } = renderHook(({ s }) => useVoiceLevel(s), {
      initialProps: { s: "idle" as const },
    });
    rerender({ s: "speaking" as const });
    await tick(60); // let a few animation frames run
    const level = result.current.current;
    expect(typeof level).toBe("number");
    expect(level).toBeGreaterThanOrEqual(0);
    expect(level).toBeLessThanOrEqual(1);
    expect(() => unmount()).not.toThrow();
  });
});
