"use client";

import { Canvas } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import OrbScene from "./OrbScene";
import type { OrbState } from "@/lib/design/tokens";

interface OrbCanvasProps {
  state: OrbState;
  levelRef?: MutableRefObject<number>;
  reduceMotion?: boolean;
  /** Pause the render loop when the tab is hidden. */
  visible?: boolean;
}

/**
 * The R3F <Canvas> host. Kept in its own module so AvatarOrb can lazy-load it
 * (next/dynamic, ssr:false) — this is the ONLY place @react-three/fiber/three
 * are statically imported, so they stay out of the first-paint bundle and off
 * screens that never render the orb.
 */
export default function OrbCanvas({
  state,
  levelRef,
  reduceMotion,
  visible = true,
}: OrbCanvasProps) {
  return (
    <Canvas
      frameloop={visible ? "always" : "never"}
      camera={{ position: [0, 0, 5], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        // The orb is purely decorative and drawn larger than the portrait, so
        // it overlaps neighboring controls. R3F's event system re-enables
        // pointer events on its own wrapper/canvas, defeating any
        // `pointer-events: none` on an ancestor — force it off at the source
        // so clicks always pass through to the real UI (mic button etc.).
        gl.domElement.style.pointerEvents = "none";
        if (gl.domElement.parentElement) {
          gl.domElement.parentElement.style.pointerEvents = "none";
        }
      }}
      style={{ background: "transparent", pointerEvents: "none" }}
      dpr={[1, 1.75]}
    >
      <OrbScene state={state} levelRef={levelRef} reduceMotion={reduceMotion} />
    </Canvas>
  );
}
