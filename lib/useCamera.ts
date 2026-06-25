"use client";

// getUserMedia camera hook for Mira Vision, with front/back switching.
//
// Never starts automatically — the caller invokes start() from a user gesture.
// Supports a preferred facing mode ("user" front / "environment" back), a
// switchCamera() that flips between them (stopping the old stream first, which
// mobile browsers require), device enumeration, and graceful fallbacks.

import { useCallback, useEffect, useRef, useState } from "react";
import { loadPreferredCamera, savePreferredCamera } from "./memoryManager";
import { markPermissionGranted } from "./permissionManager";

export type CameraStatus =
  | "idle" // not started
  | "requesting" // asking for permission
  | "active" // streaming
  | "denied" // permission refused
  | "error"; // other failure

export type CameraFacingMode = "user" | "environment";

interface StartOptions {
  facingMode?: CameraFacingMode;
  deviceId?: string;
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentFacingMode, setCurrentFacingMode] = useState<CameraFacingMode>("user");
  const [availableVideoDevices, setAvailableVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  // Closure-safe copy of the facing mode for callbacks.
  const facingRef = useRef<CameraFacingMode>("user");

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    releaseStream();
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, [releaseStream]);

  /** List video input devices (labels are only populated after permission). */
  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAvailableVideoDevices(devices.filter((d) => d.kind === "videoinput"));
    } catch {
      // ignore — switch button just stays hidden
    }
  }, []);

  /**
   * Open a stream for the given facing mode, trying progressively looser
   * constraints (some mobile browsers reject strict ones). Stops the old stream
   * first — required for reliable switching on mobile — then attaches the new.
   */
  const openStream = useCallback(async (facing: CameraFacingMode, deviceId?: string) => {
    // Fully release + detach the previous stream before requesting a new one.
    // Mobile browsers often won't hand over the other camera until the old one
    // is stopped and the <video> source is cleared; a short delay lets the
    // hardware settle before re-acquiring.
    const hadStream = Boolean(streamRef.current);
    releaseStream();
    if (videoRef.current) videoRef.current.srcObject = null;
    if (hadStream) await new Promise((r) => setTimeout(r, 250));

    const attempts: MediaStreamConstraints[] = [];
    if (deviceId) {
      attempts.push({ video: { deviceId: { exact: deviceId } }, audio: false });
    }
    attempts.push({
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    attempts.push({ video: { facingMode: facing }, audio: false });
    attempts.push({ video: true, audio: false });

    let stream: MediaStream | null = null;
    let lastErr: unknown = null;
    for (const constraints of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!stream) throw lastErr ?? new Error("Camera unavailable");

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }
    facingRef.current = facing;
    setCurrentFacingMode(facing);
    savePreferredCamera(facing);
    return stream;
  }, [releaseStream]);

  const start = useCallback(
    async (options?: StartOptions): Promise<boolean> => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError("Camera isn't supported in this browser.");
        setStatus("error");
        return false;
      }
      setStatus("requesting");
      setError(null);
      const facing = options?.facingMode ?? loadPreferredCamera() ?? "user";
      try {
        await openStream(facing, options?.deviceId);
        setStatus("active");
        markPermissionGranted(); // keep the central manager in sync
        await refreshDevices(); // labels/devices available once permission granted
        return true;
      } catch (err) {
        const name = (err as DOMException)?.name || "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setError("Camera permission was denied. You can enable it in your browser settings.");
          setStatus("denied");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setError("No camera was found on this device.");
          setStatus("error");
        } else {
          setError("Couldn't start the camera. Please try again.");
          setStatus("error");
        }
        return false;
      }
    },
    [openStream, refreshDevices],
  );

  /** Flip front <-> back. Restores the previous camera if the switch fails. */
  const switchCamera = useCallback(async (): Promise<boolean> => {
    if (!streamRef.current) return false;
    const previous = facingRef.current;
    const next: CameraFacingMode = previous === "user" ? "environment" : "user";
    setIsSwitchingCamera(true);
    setError(null);
    try {
      await openStream(next);
      return true;
    } catch {
      setError("Couldn't switch camera.");
      // Old stream was already stopped; try to restore the previous one.
      try {
        await openStream(previous);
      } catch {
        setStatus("error");
      }
      return false;
    } finally {
      setIsSwitchingCamera(false);
    }
  }, [openStream]);

  /** Capture the current frame as a downscaled JPEG data URL (sync, may be null). */
  const capture = useCallback((maxWidth = 768, quality = 0.7): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  }, []);

  /**
   * Capture the current frame, rejecting with a clean error if the camera is
   * inactive. Always reads from whichever camera is currently active.
   */
  const captureCurrentCameraFrame = useCallback(async (): Promise<string> => {
    if (!streamRef.current) throw new Error("The camera isn't on right now.");
    const frame = capture();
    if (!frame) throw new Error("I couldn't capture the camera image.");
    return frame;
  }, [capture]);

  // Re-attach the stream if the <video> mounts after start() (state + render gap).
  useEffect(() => {
    const v = videoRef.current;
    if (v && streamRef.current && v.srcObject !== streamRef.current) {
      v.srcObject = streamRef.current;
      v.play().catch(() => {});
    }
  });

  // Always release the camera on unmount.
  useEffect(() => () => releaseStream(), [releaseStream]);

  return {
    videoRef,
    status,
    error,
    currentFacingMode,
    availableVideoDevices,
    isSwitchingCamera,
    start,
    stop,
    switchCamera,
    capture,
    captureCurrentCameraFrame,
  };
}
