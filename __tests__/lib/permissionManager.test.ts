import {
  isPermissionsInitialized,
  setPermissionsInitialized,
  markPermissionGranted,
  resetPermissions,
  queryPermissionState,
  requestCameraAndMic,
} from "@/lib/permissionManager";

function setNav(prop: string, value: unknown) {
  Object.defineProperty(navigator, prop, { value, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  setNav("permissions", undefined);
  setNav("mediaDevices", undefined);
});

describe("permission onboarding flag", () => {
  it("round-trips the initialized flag", () => {
    expect(isPermissionsInitialized()).toBe(false);
    setPermissionsInitialized(true);
    expect(isPermissionsInitialized()).toBe(true);
    resetPermissions();
    expect(isPermissionsInitialized()).toBe(false);
  });

  it("markPermissionGranted sets the flag", () => {
    markPermissionGranted();
    expect(isPermissionsInitialized()).toBe(true);
  });
});

describe("queryPermissionState", () => {
  it("returns 'unknown' when the Permissions API is unavailable", async () => {
    expect(await queryPermissionState()).toBe("unknown");
  });

  it("returns 'granted' when both camera and mic are granted", async () => {
    setNav("permissions", { query: jest.fn().mockResolvedValue({ state: "granted" }) });
    expect(await queryPermissionState()).toBe("granted");
  });

  it("returns 'denied' if either is denied", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ state: "denied" })
      .mockResolvedValueOnce({ state: "granted" });
    setNav("permissions", { query });
    expect(await queryPermissionState()).toBe("denied");
  });

  it("returns 'prompt' when access hasn't been decided", async () => {
    setNav("permissions", { query: jest.fn().mockResolvedValue({ state: "prompt" }) });
    expect(await queryPermissionState()).toBe("prompt");
  });
});

describe("requestCameraAndMic", () => {
  it("reports unsupported when getUserMedia is missing", async () => {
    expect(await requestCameraAndMic()).toEqual({ granted: false, reason: "unsupported" });
  });

  it("grants and stops tracks on success, marking initialized", async () => {
    const stop = jest.fn();
    const getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    setNav("mediaDevices", { getUserMedia });
    expect(await requestCameraAndMic()).toEqual({ granted: true });
    expect(stop).toHaveBeenCalled();
    expect(isPermissionsInitialized()).toBe(true);
  });

  it("reports denied on NotAllowedError", async () => {
    const err = Object.assign(new Error("x"), { name: "NotAllowedError" });
    setNav("mediaDevices", { getUserMedia: jest.fn().mockRejectedValue(err) });
    expect(await requestCameraAndMic()).toEqual({ granted: false, reason: "denied" });
  });

  it("falls back to audio-only when the camera is unavailable", async () => {
    const noCam = Object.assign(new Error("no cam"), { name: "NotFoundError" });
    const getUserMedia = jest
      .fn()
      .mockRejectedValueOnce(noCam) // audio+video fails
      .mockResolvedValueOnce({ getTracks: () => [{ stop: jest.fn() }] }); // audio-only ok
    setNav("mediaDevices", { getUserMedia });
    expect(await requestCameraAndMic()).toEqual({ granted: true });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });
});
