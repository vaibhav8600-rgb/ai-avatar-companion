"use client";

import { useEffect, useRef } from "react";
import type { AvatarState } from "@/types";

/**
 * Produces a lively 0..1 amplitude in a ref (read inside animation loops) that
 * drives the AvatarOrb pulse and the waveform visualizers.
 *
 * Design choice: this is a *synthetic* envelope, not a tap of the real audio
 * graph. Mira's playback runs through the Simli WebRTC audio element and the
 * TTS buffer-source chain (lib/audio.ts, useSimliAvatar); re-routing those via
 * createMediaElementSource risks breaking lip-sync/playback — explicitly out of
 * bounds for this UI re-skin. The envelope layers a few sines + a random walk
 * so it reads as organically reactive while staying compositor-cheap and fully
 * decoupled from the pipeline. (For a real-data path, see lib/useAudioLevel.ts,
 * which can tap a mic MediaStream safely when a consumer opts in.)
 *
 * The ref eases to 0 when Mira isn't speaking/listening.
 */
export function useVoiceLevel(state: AvatarState) {
  const levelRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let walk = 0;
    const start = performance.now();

    const tick = () => {
      const s = stateRef.current;
      const active = s === "listening" || s === "speaking";
      let target = 0;
      if (active) {
        if (reduce) {
          target = 0.4;
        } else {
          const t = (performance.now() - start) * 0.001;
          walk += (Math.random() - 0.5) * 0.25;
          walk = Math.max(-0.4, Math.min(0.4, walk * 0.92));
          // Speaking is punchier than listening.
          const base = s === "speaking" ? 0.42 : 0.3;
          const swing = s === "speaking" ? 0.32 : 0.22;
          const osc =
            Math.sin(t * 7.3) * 0.5 + Math.sin(t * 3.1 + 1) * 0.3 + Math.sin(t * 13 + 2) * 0.2;
          target = Math.max(0, Math.min(1, base + osc * swing * 0.5 + walk * 0.5));
        }
      }
      levelRef.current += (target - levelRef.current) * (active ? 0.4 : 0.12);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return levelRef;
}
