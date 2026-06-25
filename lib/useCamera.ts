"use client";

// getUserMedia camera hook for Mira Vision.
//
// Never starts automatically — the caller invokes start() from a user gesture.
// Exposes permission/status, a videoRef to render the live preview, a capture()
// that returns a downscaled JPEG data URL, and stop() to release the camera.

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus =
  | "idle" // not started
  | "requesting" // asking for permission
  | "active" // streaming
  | "denied" // permission refused
  | "error"; // other failure

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera isn't supported in this browser.");
      setStatus("error");
      return false;
    }
    setStatus("requesting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStatus("active");
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
  }, []);

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
   * inactive or denied. Returns a size-limited base64 JPEG data URL.
   */
  const captureCurrentCameraFrame = useCallback(async (): Promise<string> => {
    if (!streamRef.current) {
      throw new Error("The camera isn't on right now.");
    }
    const frame = capture();
    if (!frame) throw new Error("I couldn't capture the camera image.");
    return frame;
  }, [capture]);

  // The panel's <video> may mount *after* start() runs (state update + render),
  // so re-attach the stream whenever the element becomes available.
  useEffect(() => {
    const v = videoRef.current;
    if (v && streamRef.current && v.srcObject !== streamRef.current) {
      v.srcObject = streamRef.current;
      v.play().catch(() => {});
    }
  });

  // Always release the camera on unmount.
  useEffect(() => stop, [stop]);

  return { videoRef, status, error, start, stop, capture, captureCurrentCameraFrame };
}
