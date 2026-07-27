"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { orbPalette, type OrbState } from "@/lib/design/tokens";
import type { AvatarState } from "@/types";

// Lazy-load the entire R3F canvas (the only static importer of three/fiber) so
// the 3D bundle never blocks first paint and non-orb screens don't pull it in.
const OrbCanvas = dynamic(() => import("./avatar/OrbCanvas"), { ssr: false });

interface AvatarOrbProps {
  state: AvatarState;
  /** Smoothed 0..1 amplitude driving the pulse (from useAudioLevel). */
  levelRef?: MutableRefObject<number>;
  /** Diameter of the orb+portrait area in px. */
  size?: number;
  /** The portrait / live video, rendered inside the ring. */
  children?: ReactNode;
  className?: string;
}

/** Map the app's AvatarState union onto the 5 visual orb states. */
export function avatarToOrb(state: AvatarState): OrbState {
  switch (state) {
    case "listening":
      return "listening";
    case "thinking":
    case "looking":
    case "recognizing":
    case "learning":
      return "thinking";
    case "speaking":
      return "speaking";
    case "error":
      return "recovering";
    case "recognized":
    case "uncertain":
    case "idle":
    case "muted":
    default:
      return "ready";
  }
}

// WebGL support, probed ONCE per page and cached. The probe canvas creates a
// real GL context, so it must be released immediately: Chrome caps live
// contexts (~16) and every leaked one pushes out the oldest — which is the
// orb's own context ("Too many active WebGL contexts" → THREE Context Lost).
let webglSupported: boolean | null = null;
function hasWebgl(): boolean {
  if (webglSupported !== null) return webglSupported;
  try {
    const gl =
      document.createElement("canvas").getContext("webgl2") ||
      document.createElement("canvas").getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    webglSupported = Boolean(gl);
  } catch {
    webglSupported = false;
  }
  return webglSupported;
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const on = () => setReduce(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

/**
 * Mira's hero avatar orb: a glowing orbital ring + floating particles framing
 * her portrait, driven by voice state and audio amplitude. R3F for genuine 3D
 * depth; degrades to an animated CSS ring when reduced-motion is set or WebGL
 * is unavailable. The portrait (children) sits inside the ring.
 */
export default function AvatarOrb({
  state,
  levelRef,
  size = 360,
  children,
  className = "",
}: AvatarOrbProps) {
  const orbState = avatarToOrb(state);
  const reduce = usePrefersReducedMotion();
  const [visible, setVisible] = useState(true);
  const [webglFailed, setWebglFailed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  // Once per mount, never per render (the old version re-probed on every
  // render through an unstable callback dep and leaked a context each time).
  useEffect(() => {
    if (!hasWebgl()) setWebglFailed(true);
  }, []);

  const palette = orbPalette[orbState];
  // The ring canvas is drawn larger than the portrait so the ring encircles it.
  const canvasSize = size * 1.28;
  const useCss = reduce || webglFailed;

  return (
    <div
      ref={wrapRef}
      className={`relative grid place-items-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Ring layer — behind the portrait. Explicitly centered and inert:
          it's larger than the portrait, so it must never intercept clicks
          meant for surrounding controls (.decor-layer enforces this with
          !important down the whole subtree, R3F internals included). */}
      <div
        className="decor-layer pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: canvasSize, height: canvasSize }}
        aria-hidden
      >
        {useCss ? (
          <CssOrb state={orbState} />
        ) : (
          <OrbCanvas state={orbState} levelRef={levelRef} reduceMotion={reduce} visible={visible} />
        )}
      </div>

      {/* Ambient color wash matching the state (cheap, always on). */}
      <div
        className="decor-layer pointer-events-none absolute inset-0 rounded-full blur-3xl opacity-50 transition-colors duration-700"
        style={{ background: `radial-gradient(circle, ${palette.glow}66, transparent 65%)` }}
        aria-hidden
      />

      {/* Portrait / live video slot. */}
      <div className="relative z-10 grid place-items-center" style={{ width: size, height: size }}>
        {children}
      </div>
    </div>
  );
}

/** Animated CSS ring — reduced-motion / no-WebGL fallback. */
function CssOrb({ state }: { state: OrbState }) {
  const p = orbPalette[state];
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div
        className="aspect-square w-[78%] rounded-full"
        style={{
          border: `2px solid ${p.ring}`,
          boxShadow: `0 0 60px 6px ${p.glow}66, inset 0 0 40px ${p.glow}44`,
        }}
      />
    </div>
  );
}
