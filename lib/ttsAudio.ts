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

/** Stop any in-progress server-TTS playback (and cancel a chunk sequence). */
export function stopServerTts(): void {
  playGeneration++; // supersede any running chunk loop
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
  /** Called the moment audio actually starts playing (not while fetching). */
  onPlay?: () => void;
}

// A generation token so a newer playback request cancels any older sequence
// still in flight (e.g. user barges in mid-reply).
let playGeneration = 0;

/** Decode raw PCM base64 into an AudioBuffer. */
function pcmToBuffer(ctx: AudioContext, audioBase64: string, sampleRate: number): AudioBuffer {
  const bytes = base64ToUint8(audioBase64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  if (sampleCount === 0) throw new Error("empty audio");
  const floats = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) floats[i] = view.getInt16(i * 2, true) / 32768;
  const buffer = ctx.createBuffer(1, sampleCount, sampleRate || 24000);
  buffer.getChannelData(0).set(floats);
  return buffer;
}

/** Play one decoded buffer to completion (or until stopped). */
function playBuffer(
  ctx: AudioContext,
  buffer: AudioBuffer,
  volume: number,
  onStart?: () => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(ctx.destination);
    source.onended = () => {
      if (currentSource === source) currentSource = null;
      resolve();
    };
    currentSource = source;
    source.start();
    onStart?.();
  });
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
  const buffer = pcmToBuffer(ctx, audioBase64, sampleRate || 24000);
  stopServerTts();
  await playBuffer(ctx, buffer, opts.volume ?? 1, opts.onPlay);
}

interface PlayChunksOptions {
  chunks: string[];
  model?: string;
  voice?: string;
  volume?: number;
  /** Fired once, when the very first chunk starts playing. */
  onFirstPlay?: () => void;
}

/**
 * Play a sequence of text chunks back-to-back, prefetching the next chunk's
 * audio while the current one plays — so the voice starts after just the first
 * sentence and there are no gaps between sentences. Throws only if the FIRST
 * chunk fails (so the caller can fall back to the browser voice); later-chunk
 * failures are skipped so a single hiccup doesn't kill the whole reply.
 */
export async function playServerTtsChunks(opts: PlayChunksOptions): Promise<void> {
  const ctx = getCtx();
  if (!ctx) throw new Error("Web Audio unavailable");
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});

  const { chunks, model, voice } = opts;
  if (chunks.length === 0) return;

  // Stop any previous playback FIRST (this bumps the generation), then claim
  // this run's token — otherwise our own stop would invalidate us immediately
  // and nothing would ever play.
  stopServerTts();
  const myGen = ++playGeneration;
  const stillCurrent = () => myGen === playGeneration;

  // Kick off the first fetch; prefetch subsequent ones as we go.
  let nextFetch = fetchTtsAudio(chunks[0], model, voice);

  for (let i = 0; i < chunks.length; i++) {
    let audio;
    try {
      audio = await nextFetch;
    } catch (err) {
      if (i === 0) throw err; // let caller fall back to browser voice
      break; // a later chunk failed — stop gracefully
    }
    if (!stillCurrent()) return; // a newer reply / barge-in superseded us

    // Begin fetching the next chunk while this one plays.
    if (i + 1 < chunks.length) {
      nextFetch = fetchTtsAudio(chunks[i + 1], model, voice);
      nextFetch.catch(() => {}); // avoid unhandled rejection; handled on await
    }

    const buffer = pcmToBuffer(ctx, audio.audioBase64, audio.sampleRate || 24000);
    if (!stillCurrent()) return;
    await playBuffer(ctx, buffer, opts.volume ?? 1, i === 0 ? opts.onFirstPlay : undefined);
    if (!stillCurrent()) return;
  }
}
