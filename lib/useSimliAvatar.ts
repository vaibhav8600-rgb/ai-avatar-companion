"use client";

// React hook that owns the live Simli avatar lifecycle.
//
// Flow:
//   ensureConnected() -> mint a session token from /api/simli-session, then
//                        open a WebRTC stream into <video>/<audio> elements.
//   speak(text)       -> POST text to /api/tts, resample the PCM to 16kHz,
//                        and push it to Simli, which lip-syncs the face.
//   clear()           -> stop the avatar mid-sentence (barge-in).
//   stop()            -> tear the stream down.
//
// The simli-client SDK is browser-only (WebRTC/AudioWorklet), so it's loaded
// with a dynamic import and never touches the server bundle. If Simli isn't
// configured, status becomes "unconfigured" and callers fall back to the
// static image + browser speech.

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeToSimliPcm } from "./audio";
import { fetchTtsAudio } from "./ttsAudio";

// Minimal shape of the bits of SimliClient we use (avoids importing the type
// at module scope, which would pull the browser-only module into SSR).
interface SimliClientLike {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendAudioData(data: Uint8Array): void;
  ClearBuffer(): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
}

export type SimliStatus =
  | "idle"          // not yet attempted
  | "connecting"
  | "ready"
  | "unconfigured"  // no SIMLI_API_KEY/FACE_ID on the server
  | "error";

interface UseSimliAvatarCallbacks {
  onSpeaking?: () => void;
  onSilent?: () => void;
  onError?: (message: string) => void;
}

// How many PCM bytes to push per chunk. 6000 bytes = 3000 samples ≈ 187ms
// at 16kHz — small enough to stream smoothly, large enough to be efficient.
const CHUNK_BYTES = 6000;

export function useSimliAvatar(callbacks: UseSimliAvatarCallbacks) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clientRef = useRef<SimliClientLike | null>(null);
  const connectPromiseRef = useRef<Promise<boolean> | null>(null);
  const [status, setStatus] = useState<SimliStatus>("idle");

  // Keep callbacks in a ref so the connect/speak functions stay stable.
  const cbRef = useRef(callbacks);
  useEffect(() => {
    cbRef.current = callbacks;
  });

  const doConnect = useCallback(async (): Promise<boolean> => {
    if (!videoRef.current || !audioRef.current) return false;
    setStatus("connecting");
    try {
      const res = await fetch("/api/simli-session", { method: "POST" });
      const data = (await res.json()) as {
        configured?: boolean;
        session_token?: string;
        error?: string;
      };

      if (data.configured === false) {
        setStatus("unconfigured");
        return false;
      }
      if (!res.ok || !data.session_token) {
        setStatus("error");
        cbRef.current.onError?.(data.error || "Could not start avatar session");
        return false;
      }

      // NOTE: we import the package's "./dist/client" entry directly instead of
      // the "simli-client" main entry. simli-client@3.0.2 ships a casing bug —
      // dist/index.js does `require("./Client")` but the real file is
      // `dist/client.js` (lowercase). That resolves on case-insensitive
      // filesystems (Windows/macOS) but breaks the production build on Linux
      // (e.g. Vercel) with "Can't resolve './Client'". dist/client.js exports
      // everything we need and its transitive imports are correctly cased.
      const { SimliClient, LogLevel } = await import("simli-client/dist/client");
      const client = new SimliClient(
        data.session_token,
        videoRef.current,
        audioRef.current,
        null,            // iceServers: null is fine for the livekit transport
        LogLevel.ERROR,
        "livekit",
      ) as unknown as SimliClientLike;

      client.on("speaking", () => cbRef.current.onSpeaking?.());
      client.on("silent", () => cbRef.current.onSilent?.());
      client.on("error", (detail: unknown) =>
        cbRef.current.onError?.(typeof detail === "string" ? detail : "Avatar stream error"),
      );

      await client.start();
      clientRef.current = client;
      // The mic press that precedes a reply already counts as a user gesture,
      // so this autoplay should be unblocked; ignore failures defensively.
      audioRef.current?.play().catch(() => {});
      setStatus("ready");
      return true;
    } catch (err) {
      setStatus("error");
      cbRef.current.onError?.(err instanceof Error ? err.message : "Avatar connection failed");
      return false;
    }
  }, []);

  /** Connect once; safe to call repeatedly. Returns whether Simli is usable. */
  const ensureConnected = useCallback((): Promise<boolean> => {
    if (clientRef.current) return Promise.resolve(true);
    if (status === "unconfigured") return Promise.resolve(false);
    if (!connectPromiseRef.current) {
      connectPromiseRef.current = doConnect().then((ok) => {
        // Allow a retry later if this attempt failed (but not if unconfigured).
        if (!ok) connectPromiseRef.current = null;
        return ok;
      });
    }
    return connectPromiseRef.current;
  }, [doConnect, status]);

  /** Synthesize `text` (Deepgram → Gemini fallback) and stream it for lip-sync. */
  const speak = useCallback(
    async (text: string, model?: string, voice?: string): Promise<void> => {
      const client = clientRef.current;
      if (!client) throw new Error("Avatar not connected");

      const { audioBase64, sampleRate } = await fetchTtsAudio(text, model, voice);
      const pcm = await decodeToSimliPcm(audioBase64, sampleRate || 24000, 16000);

      for (let offset = 0; offset < pcm.length; offset += CHUNK_BYTES) {
        client.sendAudioData(pcm.subarray(offset, offset + CHUNK_BYTES));
      }
    },
    [],
  );

  /**
   * Speak a sequence of text chunks, prefetching each chunk's TTS while the
   * previous one streams — so her lips start moving after the first sentence
   * instead of after the whole reply is synthesized. Throws if the FIRST chunk
   * fails (caller falls back to the browser voice); later failures are skipped.
   */
  const speakChunks = useCallback(
    async (chunks: string[], model?: string, voice?: string): Promise<void> => {
      const client = clientRef.current;
      if (!client) throw new Error("Avatar not connected");
      if (chunks.length === 0) return;

      let nextFetch = fetchTtsAudio(chunks[0], model, voice);
      for (let i = 0; i < chunks.length; i++) {
        let audio;
        try {
          audio = await nextFetch;
        } catch (err) {
          if (i === 0) throw err;
          break;
        }
        if (i + 1 < chunks.length) {
          nextFetch = fetchTtsAudio(chunks[i + 1], model, voice);
          nextFetch.catch(() => {});
        }
        const pcm = await decodeToSimliPcm(audio.audioBase64, audio.sampleRate || 24000, 16000);
        for (let offset = 0; offset < pcm.length; offset += CHUNK_BYTES) {
          client.sendAudioData(pcm.subarray(offset, offset + CHUNK_BYTES));
        }
      }
    },
    [],
  );

  /** Stop the avatar mid-sentence (used when the user starts talking). */
  const clear = useCallback(() => {
    clientRef.current?.ClearBuffer();
  }, []);

  /** Tear down the stream entirely (e.g. when the user switches to image mode). */
  const stop = useCallback(() => {
    clientRef.current?.stop().catch(() => {});
    clientRef.current = null;
    connectPromiseRef.current = null;
    // Don't clobber "unconfigured" — that's a permanent fact, not a live stream.
    setStatus((s) => (s === "unconfigured" ? s : "idle"));
  }, []);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      clientRef.current?.stop().catch(() => {});
      clientRef.current = null;
    };
  }, []);

  return { videoRef, audioRef, status, ensureConnected, speak, speakChunks, clear, stop };
}
