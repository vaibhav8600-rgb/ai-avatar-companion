"use client";

import Image from "next/image";
import type { RefObject } from "react";
import type { AvatarState } from "@/types";

interface AvatarStageProps {
  state: AvatarState;
  /** What the user is currently saying (interim transcript) */
  interimText?: string;
  /** Refs for the live Simli video/audio stream (when enabled). */
  videoRef?: RefObject<HTMLVideoElement>;
  audioRef?: RefObject<HTMLAudioElement>;
  /** When true, show the live lip-synced video instead of the static image. */
  showVideo?: boolean;
}

/**
 * The center of the experience. When the live avatar is connected, a real
 * lip-synced video plays here. Otherwise it falls back to the static image.
 * Either way the aura ring (color + animation) reflects listening / thinking
 * / speaking state. The fake "mouth pulse" is only used in image mode, since
 * the video already has real lip movement.
 */
export default function AvatarStage({
  state,
  interimText,
  videoRef,
  audioRef,
  showVideo = false,
}: AvatarStageProps) {
  const isSpeaking = state === "speaking";
  const isListening = state === "listening";
  const isThinking = state === "thinking";
  const isError = state === "error";

  return (
    <div className="relative flex flex-col items-center justify-center">
      {/* Aura layer — multiple stacked rings for depth */}
      <div className="relative">
        {/* Base ambient breath (always on, very subtle) */}
        <div
          className="aura-ring is-active"
          style={{
            background:
              "radial-gradient(circle, rgba(125,179,216,0.18), transparent 70%)",
            animation: "breathe 6s ease-in-out infinite",
          }}
          aria-hidden
        />

        {/* Listening — blue ripple */}
        {isListening && (
          <>
            <div
              className="aura-ring is-active"
              style={{
                background:
                  "radial-gradient(circle, rgba(125,179,216,0.45), transparent 65%)",
                animation: "ripple 1.6s ease-out infinite",
              }}
              aria-hidden
            />
            <div
              className="aura-ring is-active"
              style={{
                background:
                  "radial-gradient(circle, rgba(125,179,216,0.30), transparent 65%)",
                animation: "ripple 1.6s ease-out 0.4s infinite",
              }}
              aria-hidden
            />
          </>
        )}

        {/* Thinking — soft shimmer */}
        {isThinking && (
          <div
            className="aura-ring is-active"
            style={{
              background:
                "conic-gradient(from 0deg, rgba(125,179,216,0.3), rgba(217,169,100,0.2), rgba(125,179,216,0.3))",
              animation: "spin 4s linear infinite, shimmer 2.4s ease-in-out infinite",
            }}
            aria-hidden
          />
        )}

        {/* Speaking — warm pulsing glow */}
        {isSpeaking && (
          <div
            className="aura-ring is-active"
            style={{
              background:
                "radial-gradient(circle, rgba(232,192,136,0.45), transparent 65%)",
              animation: "pulse 1.2s ease-in-out infinite",
            }}
            aria-hidden
          />
        )}

        {/* Error — muted red */}
        {isError && (
          <div
            className="aura-ring is-active"
            style={{
              background:
                "radial-gradient(circle, rgba(220,90,90,0.35), transparent 65%)",
            }}
            aria-hidden
          />
        )}

        {/* The avatar image itself, in a soft-rounded frame */}
        <div
          className={`
            relative overflow-hidden
            rounded-[2rem] border border-white/5
            shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]
            w-[260px] h-[320px] sm:w-[320px] sm:h-[400px] md:w-[360px] md:h-[460px]
            transition-transform duration-700
            ${isSpeaking ? "scale-[1.015]" : "scale-100"}
          `}
        >
          {/* Live lip-synced video (only mounted when Simli is wired up).
              Kept in the DOM whenever a ref exists so it can receive the
              WebRTC track; we just fade it in once it's actually streaming. */}
          {videoRef && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                showVideo ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
          {audioRef && <audio ref={audioRef} autoPlay className="hidden" />}

          {/* Static image — shown until the live video is streaming. */}
          {!showVideo && (
            <Image
              src="/avatar.png"
              alt="AI avatar"
              fill
              priority
              sizes="(max-width: 768px) 320px, 360px"
              className="object-cover"
            />
          )}

          {/* Subtle vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, transparent 60%, rgba(14,15,19,0.55) 100%)",
            }}
            aria-hidden
          />

          {/* Mouth-area highlight that softly pulses while speaking
              — a cheap stand-in for lip-sync, only in static-image mode. */}
          {isSpeaking && !showVideo && (
            <div
              className="absolute"
              style={{
                left: "50%",
                top: "62%",
                width: "60px",
                height: "20px",
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(232,192,136,0.25), transparent 70%)",
                animation: "pulse 0.4s ease-in-out infinite",
                filter: "blur(8px)",
              }}
              aria-hidden
            />
          )}
        </div>
      </div>

      {/* Interim transcript shown below avatar while listening */}
      {isListening && interimText && (
        <div className="mt-6 px-4 py-2 max-w-md text-center text-cream-100/70 text-sm italic animate-fade-up">
          “{interimText}”
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
