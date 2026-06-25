"use client";

// Client-side TTS: the shared server fetch chain (Deepgram → Gemini), plus
// in-browser PCM playback for Still-image mode. Both server tiers return raw
// PCM, so there's a single decode path. Tier 3 (browser Web Speech) lives in
// the page's voiceReply, used when fetchTtsAudio throws.

import { base64ToUint8 } from "./audio";

export interface TtsAudioResult {
  audioBase64: string;
  sampleRate: number;
}

/**
 * Get TTS audio with fallback: try Deepgram (/api/tts/deepgram), then Gemini
 * (/api/tts). Both return raw PCM. Throws if both fail (caller then falls back
 * to the browser voice). `model`/`voice` apply to Gemini only.
 */
export async function fetchTtsAudio(
  text: string,
  model?: string,
  voice?: string,
): Promise<TtsAudioResult> {
  // Tier 1 — Deepgram Aura.
  try {
    const res = await fetch("/api/tts/deepgram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const data = (await res.json()) as TtsAudioResult & { audioBase64?: string };
      if (data.audioBase64) {
        return { audioBase64: data.audioBase64, sampleRate: data.sampleRate || 24000 };
      }
    }
  } catch {
    // fall through to Gemini
  }

  // Tier 2 — Gemini TTS model chain.
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, model, voice }),
  });
  if (!res.ok) {
    let msg = `TTS failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as TtsAudioResult & { audioBase64?: string };
  if (!data.audioBase64) throw new Error("TTS returned no audio");
  return { audioBase64: data.audioBase64, sampleRate: data.sampleRate || 24000 };
}

// ----- in-browser playback (Still mode) -----

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

export function isTtsAudioSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
}

/** Create/resume the AudioContext within a user gesture (mobile autoplay). */
export function primeTtsAudio(): void {
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

/** Stop any in-progress server-TTS playback. */
export function stopServerTts(): void {
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      // already stopped
    }
    currentSource = null;
  }
}

interface PlayOptions {
  text: string;
  model?: string;
  voice?: string;
  /** 0..1 */
  volume?: number;
}

/**
 * Fetch (Deepgram → Gemini) and play TTS for `text` in the browser. Resolves
 * when playback finishes or is stopped. Throws if both server tiers fail.
 */
export async function playServerTts(opts: PlayOptions): Promise<void> {
  const ctx = getCtx();
  if (!ctx) throw new Error("Web Audio unavailable");
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});

  const { audioBase64, sampleRate } = await fetchTtsAudio(opts.text, opts.model, opts.voice);
  const bytes = base64ToUint8(audioBase64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  if (sampleCount === 0) throw new Error("empty audio");
  const floats = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) floats[i] = view.getInt16(i * 2, true) / 32768;

  const buffer = ctx.createBuffer(1, sampleCount, sampleRate || 24000);
  buffer.getChannelData(0).set(floats);

  stopServerTts();

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = opts.volume ?? 1;
  source.connect(gain).connect(ctx.destination);

  await new Promise<void>((resolve) => {
    source.onended = () => {
      if (currentSource === source) currentSource = null;
      resolve();
    };
    currentSource = source;
    source.start();
  });
}
