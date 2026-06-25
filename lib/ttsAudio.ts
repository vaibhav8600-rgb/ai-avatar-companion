"use client";

// Plays Gemini TTS audio directly in the browser (used by Still-image mode,
// where there's no Simli avatar to feed). Hits the same /api/tts route — so the
// full server-side model fallback chain applies — and plays the returned raw
// PCM via Web Audio, with stop() support for barge-in.

import { base64ToUint8 } from "./audio";

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

/** Stop any in-progress Gemini TTS playback. */
export function stopGeminiTts(): void {
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
 * Fetch + play Gemini TTS for `text`. Resolves when playback finishes (or is
 * stopped). Throws if the TTS chain fails or audio can't play — callers fall
 * back to the browser's Web Speech API.
 */
export async function playGeminiTts(opts: PlayOptions): Promise<void> {
  const ctx = getCtx();
  if (!ctx) throw new Error("Web Audio unavailable");
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});

  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: opts.text, model: opts.model, voice: opts.voice }),
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

  const { audioBase64, sampleRate } = (await res.json()) as {
    audioBase64: string;
    sampleRate: number;
  };

  const bytes = base64ToUint8(audioBase64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  if (sampleCount === 0) throw new Error("empty audio");
  const floats = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) floats[i] = view.getInt16(i * 2, true) / 32768;

  const buffer = ctx.createBuffer(1, sampleCount, sampleRate || 24000);
  buffer.getChannelData(0).set(floats);

  stopGeminiTts(); // never overlap

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
