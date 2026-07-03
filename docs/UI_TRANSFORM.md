# Mira UI Transformation

A full re-skin of Mira from the original warm cream/charcoal theme to the
**cosmic, 3D-enhanced design** in `design/mockups/*` — plus the fixes,
performance work, and tooling that came with it.

> **Scope guarantee:** this was a presentation-layer transform. The STT → AI →
> TTS → Simli lip-sync pipeline, the AI provider abstraction, WebRTC/Simli
> logic, IndexedDB visual memory, and every API route are unchanged. Components
> were restyled/wrapped; existing props, hooks, state, and data flow were kept.

---

## 1. Design system

Single source of truth: [`lib/design/tokens.ts`](../lib/design/tokens.ts) — the
cosmic palette, brand gradient, glass values, per-state orb colors, and radii.

### Theming (light + dark)

Colors resolve through **CSS variables stored as space-separated RGB triplets**
(`--grad-start: 59 130 246`) in [`app/globals.css`](../app/globals.css). This
lets Tailwind utilities apply alpha modifiers against them
(`bg-status-error/10` → `rgb(var(--status-error) / 0.1)`), so **one token set
restyles every utility, including translucency**, when the theme flips.

- `tailwind.config.ts` maps every color to `rgb(var(--…) / <alpha-value>)`.
- Tailwind's `white` is remapped to `--contrast` (white in dark, near-black in
  light) so the ubiquitous `bg-white/[0.03]` / `border-white/10` surface tints
  **invert gracefully**. Text that must stay white on a gradient fill uses the
  fixed `text-onbrand` / `bg-onbrand` color instead.
- **Default is dark.** An inline pre-hydration script in
  [`app/layout.tsx`](../app/layout.tsx) sets `data-theme` before first paint
  (no flash); it honors a saved choice (`localStorage["mira-theme"]`) and
  otherwise defaults to dark (OS preference is intentionally ignored).
- Toggle: [`components/ui/ThemeToggle.tsx`](../components/ui/ThemeToggle.tsx).
- Theme changes animate via a global color-only transition (transforms/opacity
  untouched, so Framer Motion is unaffected).

### Core primitives — [`components/ui/`](../components/ui/)

| Primitive                   | Purpose                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `GlassPanel` / `.glass`     | Frosted glass surface (the universal container). On phones the backdrop-blur is swapped for a solid translucent fill — see Performance. |
| `NeonFrame`                 | Breathing blue→violet→magenta gradient edge around the app window.                                                                      |
| `StatusPill`                | State pill (Ready/Listening/Thinking/Speaking/Recovering/Offline) with a colored glow.                                                  |
| `GradientButton`            | Brand-gradient CTA with hover/press glow.                                                                                               |
| `RingGauge`                 | Animated circular gauge (volume/confidence).                                                                                            |
| `MiraLogo`                  | Cyan crystalline hexagon mark.                                                                                                          |
| `BuiltByFooter`             | Shared "V — Built by Vaibhav Rajput" footer.                                                                                            |
| `Skeleton` / `CardSkeleton` | Shimmer loading placeholders (see §5).                                                                                                  |
| `CosmicBackground`          | The persistent moving glitter starfield (see §3).                                                                                       |

---

## 2. The signature element — AvatarOrb

[`components/AvatarOrb.tsx`](../components/AvatarOrb.tsx) frames Mira's portrait
(or live video) in a glowing orbital ring with floating particles, driven by
voice state and audio amplitude.

- **Genuine 3D** via React Three Fiber:
  [`components/avatar/OrbScene.tsx`](../components/avatar/OrbScene.tsx) — a bright
  ring + a counter-rotating tilted second ring for parallax depth + an
  additive-blended instanced particle field. Colors lerp between states for a
  smooth crossfade; particles orbit on concentric paths in `thinking`.
- **Lazy-loaded**: the entire R3F `<Canvas>` lives in
  [`components/avatar/OrbCanvas.tsx`](../components/avatar/OrbCanvas.tsx) and is
  imported with `next/dynamic({ ssr: false })`, so **Three.js stays out of the
  first-paint bundle** (First Load JS ≈ 169 kB; the 3D chunk loads on demand).
- **Reactivity**: [`lib/useVoiceLevel.ts`](../lib/useVoiceLevel.ts) produces a
  smoothed 0..1 amplitude in a ref (read inside the R3F frame loop and the
  waveforms). It's a synthetic envelope, intentionally decoupled from the Simli
  / TTS audio graph so it can't disturb lip-sync;
  [`lib/useAudioLevel.ts`](../lib/useAudioLevel.ts) is a real-mic path available
  for opt-in.
- **Graceful degradation**: reduced-motion or no-WebGL renders an animated CSS
  ring instead; the render loop pauses when the tab is hidden.
- `AvatarState → OrbState` mapping lives in `avatarToOrb()`.

---

## 3. Cosmic background (glitter)

[`components/ui/CosmicBackground.tsx`](../components/ui/CosmicBackground.tsx) — a
single fixed, full-viewport Canvas2D layer mounted once at the app root, so the
drifting **glitter runs across the entire app** continuously.

- Depth-parallax stars + bright twinkling **cross-flare sparkles** (~1 in 5).
- **Theme-aware**: cool white/violet on dark, indigo/violet on light — sampled
  per frame, so it transitions with the toggle.
- Nebula corner blooms + a bottom "horizon" glow are pure CSS
  (`body::before` / `body::after`).
- GPU-cheap: DPR capped at 1.5, particle count scales with viewport (hard cap),
  loop pauses when the tab is hidden, single static frame under reduced-motion.

---

## 4. Screens (restyled to the mockups)

- **Voice Call** ([`app/page.tsx`](../app/page.tsx)) — the hero. Header
  (logo + name + status pill; transcript / theme / hands-free / settings on the
  right), the AvatarOrb, amplitude-reactive `VoiceMic` with waveform wings,
  Camera/Chat side buttons, state-driven caption zone, and the offline banner.
  The text box also takes image attachments (§7). The shell is one responsive
  scroll column (see §6).
- **Transcript** ([`ChatTranscript.tsx`](../components/ChatTranscript.tsx)) —
  slide-out glass panel with search, date divider, and message cards.
- **Chat** ([`ChatView.tsx`](../components/ChatView.tsx)) — cosmic messenger:
  portrait-halo, glass received / gradient sent bubbles, typing indicator, and
  the new **attachment** feature (§7).
- **Settings** ([`SettingsPanel.tsx`](../components/SettingsPanel.tsx)) —
  icon · title · subtitle · control rows; extras under an Advanced disclosure.
- **Avatar Mode** ([`AvatarModeModal.tsx`](../components/AvatarModeModal.tsx)),
  **Onboarding** ([`PermissionSetup.tsx`](../components/PermissionSetup.tsx)),
  the **Vision suite** ([`CameraPanel.tsx`](../components/CameraPanel.tsx),
  [`VisionMemoryPanel.tsx`](../components/VisionMemoryPanel.tsx)), and the
  **PWA install** prompt ([`InstallAppPrompt.tsx`](../components/InstallAppPrompt.tsx)).

The still-mode portrait `public/avatar.png` was replaced with Mira from the
mockups.

---

## 5. Skeleton loaders

[`components/ui/Skeleton.tsx`](../components/ui/Skeleton.tsx) — a theme-aware,
reduced-motion-friendly shimmer (`.skeleton` in `globals.css`). Applied to:

- the **Visual Memory** grid while IndexedDB loads (`CardSkeleton` grid), and
- the **avatar portrait** while `avatar.png` loads (fades in on `onLoad`).

---

## 6. Mobile responsiveness & performance

- **Layout**: the voice screen is one scroll column using the `m-auto` centering
  pattern (centers when there's room, scrolls from the top when the viewport is
  short) so nothing clips on an iPhone SE/13. The orb scales down to 228 px
  under 400 px width; the mic and controls have mobile sizes; Settings rows wrap
  instead of overflowing.
- **Performance budget**: on phones (`max-width: 640px` / `pointer: coarse`) the
  expensive real-time `backdrop-filter` on `.glass` is replaced with a solid
  translucent fill; hidden waveform canvases skip painting; the starfield DPR is
  capped. Targets 60 fps on mid-range Android.
- **Accessibility**: `prefers-reduced-motion` degrades the orb, starfield, and
  skeleton to static; modals trap focus and close on Esc; icon-only buttons
  carry aria labels.

---

## 7. Image attachments

Available in **both** composers — the WhatsApp-style chat
([`ChatView.tsx`](../components/ChatView.tsx)) and the voice-screen text box
([`app/page.tsx`](../app/page.tsx)):

1. Pick an image → it's read and **downscaled on-device** via the shared
   [`lib/imageAttachment.ts`](../lib/imageAttachment.ts) helper
   (`fileToAttachment` → `makeThumbnail`, max 1024 px) so the payload stays small.
2. A removable preview chip appears above the composer; send is enabled with an
   image even without a caption (image-only turns get a default "What's in this
   image?" prompt).
3. On send the image is stored on the turn (`ChatMessage.imageBase64`, a new
   optional field) and **analyzed via the existing Mira Vision route**
   (`analyzeImage`), whose description is injected as that turn's vision context
   so Mira's reply references the picture. In chat it renders inline in the
   user's bubble; from the voice text box her reply is spoken.

Additive and pipeline-safe: `sendUserMessage` gained an optional `image`; the
mic/voice path never passes it. Both composers share `fileToAttachment` so the
downscale/read logic lives in one place.

---

## 8. Notable bug fixes (during the transform)

- **Live-mode UI freeze.** Root cause: enabling Live Video makes the page
  re-render continuously (Simli status, keepalive, video events), which
  interrupted the Settings modal's Framer `AnimatePresence` **exit** animation,
  leaving its `fixed inset-0` backdrop mounted and blocking every click.
  Fix: full-screen modal backdrops render conditionally (no exit-animation
  wedge). Also hardened the Simli lifecycle (stable `ensureConnected`, a silence
  keepalive so idle sessions aren't culled, guarded `ClearBuffer`, self-healing
  teardown, graceful fallback to the still image).
- **`ChunkLoadError` in dev.** A service worker registered while testing a prod
  build (`npm start`) kept controlling `localhost` under `npm run dev` and
  intercepted dev chunks. Fix: a pre-hydration dev-only self-heal in
  `layout.tsx` (unregister + clear caches + one-time reload) and a hardened
  service worker that never touches dev/HMR traffic and uses cache-first only
  for immutable hashed assets (`public/service-worker.js`, `aac-v4`).
- **Duplicate live transcript.** The interim "You: …" now renders only in the
  caption bar under the mic (removed the copy under the avatar).

---

## 9. Tooling

- **ESLint** is now actually installed and configured
  (`.eslintrc.json` → `next/core-web-vitals` + `prettier`). `next build` lints.
- **Prettier** (`.prettierrc.json`, `.prettierignore`) with scripts:
  `npm run format`, `format:check`, `lint`, `lint:fix`, `typecheck`.
- New runtime deps: `framer-motion`, `three`, `@react-three/fiber`,
  `@react-three/drei` (+ `@types/three`).

## 10. Verifying changes

`npm run build` is the source of truth (type-check + lint + build). There's no
test framework; mic / mobile Web Speech / camera / Simli / PWA behaviors need
real-device testing. Live-mode + PWA fixes were verified with headless Chrome
(Playwright) against the production build.
