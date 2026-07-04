import { renderHook, act, waitFor } from "@testing-library/react";
import { useCamera } from "@/lib/useCamera";

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, "mediaDevices", { value, configurable: true });
}

const fakeStream = () => ({ getTracks: () => [{ stop: jest.fn() }] }) as unknown as MediaStream;

beforeEach(() => {
  localStorage.clear();
  setMediaDevices(undefined);
});

describe("useCamera", () => {
  it("starts idle and exposes controls", () => {
    const { result } = renderHook(() => useCamera());
    expect(result.current.status).toBe("idle");
    expect(typeof result.current.start).toBe("function");
    expect(typeof result.current.stop).toBe("function");
    expect(typeof result.current.switchCamera).toBe("function");
  });

  it("errors when the camera API is unavailable", async () => {
    const { result } = renderHook(() => useCamera());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.start();
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe("error");
  });

  it("goes active on a successful start", async () => {
    const getUserMedia = jest.fn().mockResolvedValue(fakeStream());
    setMediaDevices({ getUserMedia, enumerateDevices: jest.fn().mockResolvedValue([]) });
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start({ facingMode: "environment" });
    });
    await waitFor(() => expect(result.current.status).toBe("active"));
  });

  it("reports denied when permission is refused", async () => {
    const err = Object.assign(new Error("no"), { name: "NotAllowedError" });
    setMediaDevices({
      getUserMedia: jest.fn().mockRejectedValue(err),
      enumerateDevices: jest.fn(),
    });
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("denied");
  });

  it("capture returns null with no active video frame", () => {
    const { result } = renderHook(() => useCamera());
    expect(result.current.capture()).toBeNull();
  });
});
