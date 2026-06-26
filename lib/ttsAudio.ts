"use client";

// Client-side TTS.
//
// Tier 1 — Deepgram, STREAMED: `streamServerTts` (still mode) and the Simli
// hook read /api/tts/deepgram's PCM stream and play it as it arrives.
// Tier 2 — Gemini, BUFFERED: `fetchTtsAudio` (used by the chunked players) is
// the fallback when streaming fails. Returns a full PCM clip.
// Tier 3 — the browser's Web Speech voice, in the page's voiceReply.

import { base64ToUint8 } from "./audio";

export interface TtsAudioResult {
  audioBase64: string;
  /** PCM source sample rate; ignored for compressed formats. */
  sampleRate: number;
  format: "pcm" | "mp3";
}

/**
 * Buffered fallback: fetch a full TTS clip from Gemini (/api/tts → PCM). Throws
 * if it fails (caller then falls back to the browser voice). Deepgram is no
 * longer fetched here — it's the streaming primary (see `streamServerTts`).
 */
export async function fetchTtsAudio(
  text: string,
  model?: string,
  voice?: string,
): Promise<TtsAudioResult> {
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
  const data = (await res.json()) as { audioBase64?: string; sampleRate?: number };
  if (!data.audioBase64) throw new Error("TTS returned no audio");
  return { audioBase64: data.audioBase64, sampleRate: data.sampleRate || 24000, format: "pcm" };
}

// ----- in-browser playback (Still mode) -----

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
// Streaming-mode state (so barge-in can cancel an in-flight stream + its sources).
let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
const scheduledSources = new Set<AudioBufferSourceNode>();

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

/** Stop any in-progress server-TTS playback (chunk sequence OR stream). */
export function stopServerTts(): void {
  playGeneration++; // supersede any running chunk/stream loop
  if (activeReader) {
    try {
      activeReader.cancel();
    } catch {
      // ignore
    }
    activeReader = null;
  }
  for (const s of scheduledSources) {
    try {
      s.stop();
    } catch {
      // already stopped
    }
  }
  scheduledSources.clear();
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

/** Decode a TTS result into a playable AudioBuffer (MP3 via Web Audio, else PCM). */
async function decodeToAudioBuffer(ctx: AudioContext, r: TtsAudioResult): Promise<AudioBuffer> {
  if (r.format === "mp3") {
    const bytes = base64ToUint8(r.audioBase64);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return ctx.decodeAudioData(ab);
  }
  return pcmToBuffer(ctx, r.audioBase64, r.sampleRate || 24000);
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

  const result = await fetchTtsAudio(opts.text, opts.model, opts.voice);
  const buffer = await decodeToAudioBuffer(ctx, result);
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

    try {
      const buffer = await decodeToAudioBuffer(ctx, audio);
      if (!stillCurrent()) return;
      await playBuffer(ctx, buffer, opts.volume ?? 1, i === 0 ? opts.onFirstPlay : undefined);
    } catch (err) {
      if (i === 0) throw err; // first-chunk decode failed → caller falls back
      break; // later chunk failed → stop gracefully
    }
    if (!stillCurrent()) return;
  }
}

interface StreamOptions {
  text: string;
  volume?: number;
  /** Fired once, when the first audio is scheduled to play. */
  onFirstPlay?: () => void;
}

// Schedule incoming PCM in ~120ms blocks; small enough to start fast, large
// enough to avoid excessive source nodes.
const STREAM_SAMPLE_RATE = 16000;
const STREAM_FLUSH_BYTES = STREAM_SAMPLE_RATE * 2 * 0.12; // ~120ms of 16-bit mono

/**
 * Stream TTS from Deepgram (/api/tts/deepgram) and play the PCM as it arrives —
 * first audio starts on the first bytes instead of after the whole clip. Resolves
 * when playback finishes (or is superseded). THROWS if the stream is unavailable
 * or produced no audio, so the caller can fall back to the buffered/browser tiers.
 */
export async function streamServerTts(opts: StreamOptions): Promise<void> {
  const ctx = getCtx();
  if (!ctx) throw new Error("Web Audio unavailable");
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});

  // Supersede any previous playback, then claim this run's token.
  stopServerTts();
  const myGen = ++playGeneration;
  const stillCurrent = () => myGen === playGeneration;

  const res = await fetch("/api/tts/deepgram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: opts.text }),
  });
  const ctype = res.headers.get("content-type") || "";
  if (!res.ok || !res.body || !ctype.startsWith("audio/")) {
    throw new Error("Deepgram stream unavailable");
  }

  const reader = res.body.getReader();
  activeReader = reader;

  const volume = opts.volume ?? 1;
  let nextTime = 0;
  let started = false;
  let leftover: Uint8Array | null = null;
  let lastSource: AudioBufferSourceNode | null = null;
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;

  const scheduleFloats = (floats: Float32Array) => {
    const buffer = ctx.createBuffer(1, floats.length, STREAM_SAMPLE_RATE);
    buffer.getChannelData(0).set(floats);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(ctx.destination);
    const now = ctx.currentTime;
    // Lead slightly; reset the clock if we ever fell behind (underrun).
    if (nextTime < now + 0.05) nextTime = now + 0.08;
    source.start(nextTime);
    nextTime += buffer.duration;
    scheduledSources.add(source);
    source.onended = () => scheduledSources.delete(source);
    lastSource = source;
    if (!started) {
      started = true;
      opts.onFirstPlay?.();
    }
  };

  const flushPending = () => {
    if (pendingBytes === 0 && !leftover) return;
    let merged = new Uint8Array(pendingBytes);
    let o = 0;
    for (const p of pending) {
      merged.set(p, o);
      o += p.length;
    }
    pending = [];
    pendingBytes = 0;
    if (leftover) {
      const m = new Uint8Array(leftover.length + merged.length);
      m.set(leftover, 0);
      m.set(merged, leftover.length);
      merged = m;
      leftover = null;
    }
    const evenLen = merged.length - (merged.length % 2);
    if (merged.length % 2) leftover = merged.slice(evenLen);
    if (evenLen === 0) return;
    const view = new DataView(merged.buffer, merged.byteOffset, evenLen);
    const n = evenLen / 2;
    const floats = new Float32Array(n);
    for (let i = 0; i < n; i++) floats[i] = view.getInt16(i * 2, true) / 32768;
    scheduleFloats(floats);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (!stillCurrent()) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        return;
      }
      if (done) break;
      if (value && value.length) {
        pending.push(value);
        pendingBytes += value.length;
        if (pendingBytes >= STREAM_FLUSH_BYTES) flushPending();
      }
    }
    flushPending();
  } finally {
    if (activeReader === reader) activeReader = null;
  }

  if (!started) throw new Error("Deepgram stream produced no audio");

  // Resolve when the last scheduled buffer finishes (or we get superseded).
  await new Promise<void>((resolve) => {
    if (!stillCurrent() || !lastSource) return resolve();
    lastSource.addEventListener("ended", () => resolve(), { once: true });
  });
}
