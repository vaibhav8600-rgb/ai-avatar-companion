"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { orbPalette, type OrbState } from "@/lib/design/tokens";

interface OrbSceneProps {
  state: OrbState;
  /** Smoothed 0..1 audio amplitude; drives the speaking/listening pulse. */
  levelRef?: MutableRefObject<number>;
  reduceMotion?: boolean;
}

/** Soft round particle sprite (radial-gradient) baked once into a texture. */
function useParticleTexture() {
  return useMemo(() => {
    const size = 64;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }, []);
}

const PARTICLE_COUNT = 90;
const RING_RADIUS = 1.55;

interface Particle {
  ring: number; // 0..2 concentric orbit index
  radius: number;
  angle: number;
  speed: number;
  size: number;
}

/**
 * The orbital ring + drifting/orbiting particle field. Rotates and "breathes",
 * lerps its color toward the current state's palette, and pulses with audio
 * amplitude. In `thinking`, extra concentric orbits carry traveling dots.
 */
export default function OrbScene({ state, levelRef, reduceMotion = false }: OrbSceneProps) {
  const tex = useParticleTexture();
  const group = useRef<THREE.Group>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const glowMat = useRef<THREE.MeshBasicMaterial>(null);
  const pointsMat = useRef<THREE.PointsMaterial>(null);
  const pointsRef = useRef<THREE.Points>(null);
  // Second, thinner ring counter-rotating for parallax depth.
  const ring2 = useRef<THREE.Mesh>(null);
  const ring2Mat = useRef<THREE.MeshBasicMaterial>(null);

  // Target color for the current state, lerped toward each frame.
  const targetColor = useMemo(() => new THREE.Color(orbPalette[state].ring), [state]);
  const targetGlow = useMemo(() => new THREE.Color(orbPalette[state].glow), [state]);
  const targetParticle = useMemo(() => new THREE.Color(orbPalette[state].particles), [state]);

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: PARTICLE_COUNT }, () => {
      const ring = Math.floor(Math.random() * 3);
      const radius = RING_RADIUS + 0.15 + ring * 0.28 + Math.random() * 0.12;
      return {
        ring,
        radius,
        angle: Math.random() * Math.PI * 2,
        speed: (0.05 + Math.random() * 0.12) * (Math.random() > 0.5 ? 1 : -1),
        size: 0.03 + Math.random() * 0.05,
      };
    });
  }, []);

  const positions = useMemo(() => new Float32Array(PARTICLE_COUNT * 3), []);

  useFrame((_, delta) => {
    const level = levelRef?.current ?? 0;
    // Idle breathing so it's never static (unless reduced motion).
    const t = performance.now() * 0.001;
    const breathe = reduceMotion ? 0 : Math.sin(t * 0.9) * 0.03;
    const pulse = 1 + breathe + level * 0.18;

    if (group.current) {
      group.current.scale.setScalar(pulse);
      if (!reduceMotion) group.current.rotation.z += delta * 0.08;
    }
    // Counter-rotate the secondary ring for parallax depth.
    if (ring2.current && !reduceMotion) {
      ring2.current.rotation.z -= delta * 0.22;
    }

    // Lerp colors for a smooth crossfade between states.
    ringMat.current?.color.lerp(targetColor, 0.06);
    glowMat.current?.color.lerp(targetGlow, 0.06);
    ring2Mat.current?.color.lerp(targetGlow, 0.06);
    pointsMat.current?.color.lerp(targetParticle, 0.06);

    // Glow opacity tracks audio + state (thinking is dimmer/steadier).
    if (glowMat.current) {
      const base = state === "thinking" ? 0.36 : 0.5;
      glowMat.current.opacity = base + level * 0.45;
    }
    if (ringMat.current) {
      ringMat.current.opacity = 0.95 + level * 0.05;
    }
    if (ring2Mat.current) {
      ring2Mat.current.opacity = 0.35 + level * 0.3;
    }

    // Particle orbits. Thinking shows all rings brightly; other states show a
    // gentler drift (outer particles faded).
    const orbiting = state === "thinking";
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i];
      if (!reduceMotion) p.angle += p.speed * delta * (orbiting ? 1.4 : 0.5);
      const wobble = orbiting ? 0 : Math.sin(t + i) * 0.03;
      // Non-active outer particles are pushed far on Z so sizeAttenuation
      // shrinks them to nothing (cheaper than a per-point-alpha shader).
      const visible = orbiting || p.ring === 0;
      positions[i * 3] = Math.cos(p.angle) * (p.radius + wobble);
      positions[i * 3 + 1] = Math.sin(p.angle) * (p.radius + wobble);
      positions[i * 3 + 2] = visible ? 0 : -60;
    }
    if (pointsRef.current) {
      (pointsRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    if (pointsMat.current) {
      pointsMat.current.size = 0.1 * (1 + level * 0.7);
    }
  });

  return (
    <group ref={group}>
      {/* Outer soft glow ring */}
      <mesh>
        <ringGeometry args={[RING_RADIUS - 0.28, RING_RADIUS + 0.3, 96]} />
        <meshBasicMaterial
          ref={glowMat}
          color={targetGlow}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Crisp bright ring */}
      <mesh>
        <torusGeometry args={[RING_RADIUS, 0.024, 16, 128]} />
        <meshBasicMaterial
          ref={ringMat}
          color={targetColor}
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Secondary thin ring — counter-rotating, slightly tilted for depth */}
      <mesh ref={ring2} rotation={[0.35, 0, 0]}>
        <torusGeometry args={[RING_RADIUS + 0.22, 0.008, 12, 128]} />
        <meshBasicMaterial
          ref={ring2Mat}
          color={targetGlow}
          transparent
          opacity={0.35}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Orbiting / drifting particles */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={PARTICLE_COUNT}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={pointsMat}
          map={tex}
          color={targetParticle}
          size={0.12}
          sizeAttenuation
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}
