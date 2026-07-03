"use client";

import Image from "next/image";
import { useEffect, useState, type MutableRefObject, type RefObject } from "react";
import AvatarOrb from "@/components/AvatarOrb";
import Skeleton from "@/components/ui/Skeleton";
import type { AvatarState } from "@/types";

interface AvatarStageProps {
  state: AvatarState;
  /** What the user is currently saying (interim transcript) */
  interimText?: string;
  /** Refs for the live Simli video/audio stream (when enabled). */
  videoRef?: RefObject<HTMLVideoElement>;
  audioRef?: RefObject<HTMLAudioElement>;
  /** True when live mode is engaged and the stream is connecting or ready. */
  liveActive?: boolean;
  /** Smoothed 0..1 audio amplitude, drives the orb pulse. */
  levelRef?: MutableRefObject<number>;
}

/**
 * The center of the experience: Mira's portrait framed by the animated
 * AvatarOrb (ring + particles, state- and audio-reactive). When the live
 * avatar is connected, a real lip-synced video plays inside the ring;
 * otherwise the static image is shown.
 */
export default function AvatarStage({
  state,
  videoRef,
  audioRef,
  liveActive = false,
  levelRef,
}: AvatarStageProps) {
  const isSpeaking = state === "speaking";

  const [videoPlaying, setVideoPlaying] = useState(false);
  const [portraitLoaded, setPortraitLoaded] = useState(false);
  useEffect(() => {
    if (!liveActive) setVideoPlaying(false);
  }, [liveActive]);

  // Responsive orb size. The ring layer draws ~28% wider than the orb, so the
  // orb is sized to keep ring + orb inside even an iPhone SE viewport (375px).
  const [size, setSize] = useState(340);
  useEffect(() => {
    const set = () => {
      const w = window.innerWidth;
      setSize(w < 400 ? 228 : w < 640 ? 264 : w < 1024 ? 320 : 360);
    };
    set();
    window.addEventListener("resize", set);
    return () => window.removeEventListener("resize", set);
  }, []);

  const showVideo = liveActive && videoPlaying;
  const showLoader = liveActive && !videoPlaying;
  const portrait = Math.round(size * 0.82);

  return (
    <div className="relative flex flex-col items-center justify-center">
      <AvatarOrb state={state} levelRef={levelRef} size={size}>
        <div
          className={`relative overflow-hidden rounded-full transition-transform duration-700 ${
            isSpeaking ? "scale-[1.015]" : "scale-100"
          }`}
          style={{ width: portrait, height: portrait }}
        >
          {/* Live lip-synced video — kept mounted whenever a ref exists so it can
              receive the WebRTC track; faded in once actually streaming. */}
          {videoRef && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onPlaying={() => setVideoPlaying(true)}
              onLoadedData={() => setVideoPlaying(true)}
              // If the WebRTC track drops (connection lost, session ended),
              // fall back to the still portrait instead of a black frame.
              onEmptied={() => setVideoPlaying(false)}
              onEnded={() => setVideoPlaying(false)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                showVideo ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
          {audioRef && <audio ref={audioRef} autoPlay className="hidden" />}

          {!showVideo && (
            <>
              {!portraitLoaded && <Skeleton rounded="rounded-none" className="absolute inset-0" />}
              <Image
                src="/avatar.png"
                alt="Mira avatar"
                fill
                priority
                sizes="(max-width: 640px) 264px, 360px"
                onLoad={() => setPortraitLoaded(true)}
                className={`object-cover transition-opacity duration-500 ${portraitLoaded ? "opacity-100" : "opacity-0"}`}
              />
            </>
          )}

          {showLoader && (
            <div className="absolute inset-0 grid place-items-center bg-cosmic-base/55 backdrop-blur-sm animate-fade-up">
              <div className="flex flex-col items-center gap-3">
                <div className="h-10 w-10 rounded-full border-2 border-white/15 border-t-accent-cyan animate-spin" />
                <p className="text-[11px] uppercase tracking-[0.18em] text-ink-secondary">
                  Waking her up…
                </p>
              </div>
            </div>
          )}

          {/* Bottom vignette to blend the portrait into the cosmic backdrop. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, transparent 55%, rgb(var(--bg-base) / 0.65) 100%)",
            }}
            aria-hidden
          />
        </div>
      </AvatarOrb>

      {/* Floor reflection — soft glow pooling under the orb, like the mockups'
          reflective cosmic ground. */}
      <div
        aria-hidden
        className="decor-layer pointer-events-none -mt-4 h-8 w-3/5 rounded-[100%] bg-accent-violet/25 blur-2xl"
      />
      {/* NOTE: the live interim transcript is shown ONLY by the CaptionBar
          under the mic ("You: …"). We intentionally do NOT repeat it here —
          it used to appear in two places at once. */}
    </div>
  );
}
