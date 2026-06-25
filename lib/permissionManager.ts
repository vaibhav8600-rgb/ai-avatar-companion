// Centralized camera + microphone permission manager for Mira.
//
// IMPORTANT: this does NOT (and cannot) bypass the browser/OS permission
// prompt. It simply unifies the request: all modules go through one combined
// camera+mic request up front, so the user is asked once instead of separately
// per feature. Final control always remains with the browser/OS.

export type MiraPermissionState = "unknown" | "prompt" | "granted" | "denied";

const INIT_KEY = "mira_permissions_initialized_v1";

export function isPermissionsInitialized(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(INIT_KEY) === "true";
  } catch {
    return false;
  }
}

export function setPermissionsInitialized(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) localStorage.setItem(INIT_KEY, "true");
    else localStorage.removeItem(INIT_KEY);
  } catch {
    // ignore
  }
}

/** Mark that the app has obtained access (called by modules on success too). */
export function markPermissionGranted(): void {
  setPermissionsInitialized(true);
}

/** Clear the app-level onboarding state (does NOT change the browser grant). */
export function resetPermissions(): void {
  setPermissionsInitialized(false);
}

/**
 * Best-effort read of the current browser permission state via the Permissions
 * API. Not all browsers support querying "camera"/"microphone" (e.g. Firefox,
 * iOS Safari) — those return "unknown" and we fall back to a trial request.
 */
export async function queryPermissionState(): Promise<MiraPermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unknown";
  try {
    const desc = (name: string) =>
      navigator.permissions.query({ name } as unknown as PermissionDescriptor).catch(() => null);
    const [cam, mic] = await Promise.all([desc("camera"), desc("microphone")]);
    const states = [cam?.state, mic?.state].filter(Boolean) as PermissionState[];
    if (states.length === 0) return "unknown";
    if (states.includes("denied")) return "denied";
    if (states.length === 2 && states.every((s) => s === "granted")) return "granted";
    if (states.includes("prompt")) return "prompt";
    if (states.includes("granted")) return "granted";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export interface PermissionRequestResult {
  granted: boolean;
  /** "denied" | "unsupported" | "error" — for messaging only. */
  reason?: string;
}

/**
 * Request camera + microphone together, then immediately stop all tracks so
 * nothing is left active. Falls back to audio-only if the device has no camera.
 */
export async function requestCameraAndMic(): Promise<PermissionRequestResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { granted: false, reason: "unsupported" };
  }

  const tryGet = async (constraints: MediaStreamConstraints) => {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach((t) => t.stop()); // never leave devices active
  };

  try {
    await tryGet({ audio: true, video: true });
    markPermissionGranted();
    return { granted: true };
  } catch (err) {
    const name = (err as DOMException)?.name || "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return { granted: false, reason: "denied" };
    }
    // No camera (or constraints unmet): still try to grant the mic so voice works.
    try {
      await tryGet({ audio: true });
      markPermissionGranted();
      return { granted: true };
    } catch (err2) {
      const name2 = (err2 as DOMException)?.name || "";
      if (name2 === "NotAllowedError" || name2 === "SecurityError") {
        return { granted: false, reason: "denied" };
      }
      return { granted: false, reason: "error" };
    }
  }
}
