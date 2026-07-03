"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Lightweight amplitude meter for driving the AvatarOrb pulse / waveforms from
 * real audio. Returns a ref (not state) so consumers can read the smoothed
 * 0..1 level inside an animation loop (R3F useFrame / canvas RAF) without
 * triggering React re-renders.
 *
 * Attach either a mic MediaStream (listening) or an HTMLMediaElement (Mira's
 * TTS/live audio). Detach cleans up its own graph. We create our own
 * AudioContext and only ever use an AnalyserNode tap — for streams this is
 * fully isolated; for elements we route element → analyser → destination so
 * playback is preserved. `createMediaElementSource` may only be called once per
 * element, so we cache the source per element to stay safe if re-attached.
 */
export function useAudioLevel() {
  const levelRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef(0);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const elementSources = useRef(new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>());
  const streamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    if (!analyserRef.current) {
      const a = ctxRef.current.createAnalyser();
      a.fftSize = 256;
      a.smoothingTimeConstant = 0.8;
      analyserRef.current = a;
      dataRef.current = new Uint8Array(new ArrayBuffer(a.frequencyBinCount));
    }
    return { ctx: ctxRef.current, analyser: analyserRef.current! };
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current) return;
    const tick = () => {
      const a = analyserRef.current;
      const data = dataRef.current;
      if (a && data) {
        a.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255; // 0..1
        // Smooth toward the new value; small floor so silence reads ~0.
        levelRef.current += (Math.max(0, avg - 0.02) - levelRef.current) * 0.35;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const attachStream = useCallback(
    (stream: MediaStream) => {
      try {
        const { ctx, analyser } = ensureCtx();
        streamSourceRef.current?.disconnect();
        const src = ctx.createMediaStreamSource(stream);
        src.connect(analyser); // analyser is a sink; do NOT route mic to output
        streamSourceRef.current = src;
        startLoop();
      } catch {
        /* audio graph unavailable — orb falls back to idle pulse */
      }
    },
    [ensureCtx, startLoop],
  );

  const attachElement = useCallback(
    (el: HTMLMediaElement) => {
      try {
        const { ctx, analyser } = ensureCtx();
        let src = elementSources.current.get(el);
        if (!src) {
          src = ctx.createMediaElementSource(el);
          elementSources.current.set(el, src);
        }
        src.connect(analyser);
        analyser.connect(ctx.destination); // keep playback audible
        startLoop();
      } catch {
        /* element already sourced elsewhere or unsupported — ignore */
      }
    },
    [ensureCtx, startLoop],
  );

  const detach = useCallback(() => {
    streamSourceRef.current?.disconnect();
    streamSourceRef.current = null;
    levelRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamSourceRef.current?.disconnect();
      void ctxRef.current?.close();
    };
  }, []);

  return { levelRef, attachStream, attachElement, detach };
}
