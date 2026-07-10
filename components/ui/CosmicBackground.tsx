"use client";

import { useEffect, useRef } from "react";

/**
 * The persistent cosmic backdrop: a drifting, twinkling glitter-field that
 * runs continuously in BOTH themes. Deliberately Canvas2D (not Three.js): the
 * nebula blooms are painted by CSS (body::before / ::after), and a single
 * lightweight 2D canvas draws the particles on top — keeping the background
 * off the 3D bundle and GPU-cheap on mobile.
 *
 * Theme-aware: dark mode uses cool white/violet stars; light mode switches to
 * violet/blue glitter that reads on a bright background (the data-theme
 * attribute is sampled per frame — a constant-time read).
 *
 * Performance guards: DPR capped at 1.5, particle count scales with viewport
 * (hard cap), the RAF loop pauses when the tab is hidden, and
 * `prefers-reduced-motion` renders a single static frame.
 */
export default function CosmicBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let running = true;

    type Star = {
      x: number;
      y: number;
      z: number; // depth 0..1 → size + drift speed + brightness
      tw: number; // twinkle phase
      spd: number; // twinkle speed
      glitter: boolean; // bright sparkle with a cross-flare
    };
    let stars: Star[] = [];

    function seed() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Denser field so the glitter reads across the whole app; capped for phones.
      const count = Math.min(650, Math.round((w * h) / 2600));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random(),
        tw: Math.random() * Math.PI * 2,
        spd: 0.6 + Math.random() * 1.6,
        glitter: Math.random() < 0.2, // ~1 in 5 is a bright twinkling sparkle
      }));
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function draw(t: number) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const light = document.documentElement.getAttribute("data-theme") === "light";
      // Star / sparkle palettes per theme (r,g,b strings). Light mode uses
      // darker, saturated indigo/violet so the glitter reads on a bright
      // background (the old slate/near-white barely showed).
      const base = light ? "79,70,229" : "226,232,255";
      const tint = light ? "124,58,237" : "196,181,253";
      const spark = light ? "109,40,217" : "255,255,255";

      ctx!.clearRect(0, 0, w, h);
      for (const s of stars) {
        // Slow upward drift, faster for "closer" stars (parallax depth).
        if (!reduce) {
          s.y -= 0.02 + s.z * 0.07;
          if (s.y < -4) {
            s.y = h + 4;
            s.x = Math.random() * w;
          }
        }
        const twinkle = reduce ? 0.7 : 0.5 + 0.5 * Math.sin(t * 0.001 * s.spd + s.tw);

        if (s.glitter) {
          // Bright sparkle: glowing core + thin cross-flare that flashes.
          // Light mode keeps a higher floor (0.35..0.6) so sparkles never fully
          // vanish against the bright backdrop; dark keeps the sharp flash.
          const a = light ? 0.6 * (0.35 + 0.65 * twinkle * twinkle) : 0.75 * twinkle * twinkle;
          const r = 1 + s.z * 1.6;
          const flare = r * (2.5 + twinkle * 2.5);
          ctx!.strokeStyle = `rgba(${spark},${a * 0.6})`;
          ctx!.lineWidth = 0.8;
          ctx!.beginPath();
          ctx!.moveTo(s.x - flare, s.y);
          ctx!.lineTo(s.x + flare, s.y);
          ctx!.moveTo(s.x, s.y - flare);
          ctx!.lineTo(s.x, s.y + flare);
          ctx!.stroke();
          ctx!.beginPath();
          ctx!.arc(s.x, s.y, r, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(${spark},${Math.min(1, a + 0.15)})`;
          ctx!.fill();
        } else {
          const size = 0.4 + s.z * 1.4;
          // Light: raise the base and keep a twinkle floor so the field stays
          // visible on white without looking noisy. Dark: original values.
          const alpha = light
            ? (0.28 + s.z * 0.32) * (0.5 + 0.5 * twinkle)
            : (0.25 + s.z * 0.6) * twinkle;
          ctx!.beginPath();
          ctx!.arc(s.x, s.y, size, 0, Math.PI * 2);
          ctx!.fillStyle = s.z > 0.82 ? `rgba(${tint},${alpha})` : `rgba(${base},${alpha})`;
          ctx!.fill();
        }
      }
    }

    function loop(t: number) {
      if (!running) return;
      draw(t);
      raf = requestAnimationFrame(loop);
    }

    function onVisibility() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduce) {
        running = true;
        raf = requestAnimationFrame(loop);
      }
    }

    resize();
    if (reduce) {
      draw(0); // single static frame
    } else {
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas ref={canvasRef} aria-hidden className="starfield pointer-events-none fixed inset-0" />
  );
}
