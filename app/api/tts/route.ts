// Server-only: turns the assistant's reply text into speech audio that the
// browser feeds to the Simli avatar for lip-sync.
//
// Uses Gemini for text-to-speech via the same GOOGLE_API_KEY as the chat route.
// Returns raw PCM (16-bit, mono, usually 24kHz) as base64 — the client
// resamples to the 16kHz Simli expects.
//
// Two synthesis backends, chosen per-model automatically:
//   - generateContent (REST)  → classic TTS models (…-tts).
//   - Live API (WebSocket)    → native-audio / live / dialog models, e.g.
//                               gemini-2.5-flash-preview-native-audio-dialog
//                               and Gemini 3 Flash Live.
//
// Resilience: we try a chain of models in order, each with its own timeout,
// and return the first that produces audio. Any model that errors, times out,
// or returns no audio is skipped — so an unavailable Live model degrades
// gracefully to the regular TTS models (and, on the client, ultimately to the
// browser's Web Speech API).

import { NextRequest, NextResponse } from "next/server";
import { isAllowedTtsModel, isAllowedGeminiVoice } from "@/lib/ttsModels";
import { guard } from "@/lib/apiGuard";

export const runtime = "nodejs";

interface TtsRequest {
  text?: string;
  /** Optional user-selected model (validated against the allowlist). */
  model?: string;
  /** Optional user-selected Gemini voice (validated against the allowlist). */
  voice?: string;
}

interface SynthResult {
  audioBase64: string;
  sampleRate: number;
}

// Classic TTS models (generateContent), tried in order if earlier ones fail.
const DEFAULT_TTS_MODELS = [
  "gemini-2.5-flash-preview-tts",
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-pro-preview-tts",
];

// Per-attempt budgets. Live needs a little longer (connect + stream).
const TTS_TIMEOUT_MS = 15000;
const LIVE_TIMEOUT_MS = 20000;

/** A model whose name implies the realtime Live API (WebSocket) backend. */
function isLiveModel(model: string): boolean {
  return /live|native-audio|dialog/i.test(model);
}

function csv(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Ordered, de-duped list of models to try. Live models (if configured via
 * GEMINI_LIVE_MODELS) are preferred, then the primary TTS model, then any
 * extra TTS models, then built-in TTS defaults.
 */
function getModelChain(preferred?: string): string[] {
  const live = csv(process.env.GEMINI_LIVE_MODELS);
  const primary = process.env.GEMINI_TTS_MODEL?.trim();
  const ttsExtra = csv(process.env.GEMINI_TTS_MODELS);
  // The user's UI choice goes first; the rest remain as graceful fallbacks.
  const chain = [preferred, ...live, primary, ...ttsExtra, ...DEFAULT_TTS_MODELS].filter(
    Boolean,
  ) as string[];
  return Array.from(new Set(chain));
}

/** Pull the sample rate out of a mime type like "audio/L16;rate=24000". */
function parseSampleRate(mimeType: string | undefined): number {
  if (!mimeType) return 24000;
  const match = /rate=(\d+)/.exec(mimeType);
  return match ? parseInt(match[1], 10) : 24000;
}

/** Classic TTS via generateContent. Throws on any failure (incl. timeout). */
async function synthesizeViaTts(
  model: string,
  text: string,
  voice: string,
  apiKey: string,
): Promise<SynthResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
            },
          },
        }),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    const data = await res.json();
    const part = data.candidates?.[0]?.content?.parts?.find(
      (p: { inlineData?: { data?: string } }) => p.inlineData?.data,
    );
    const audioBase64: string | undefined = part?.inlineData?.data;
    if (!audioBase64) throw new Error("no audio in response");

    return { audioBase64, sampleRate: parseSampleRate(part?.inlineData?.mimeType) };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`timed out after ${TTS_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Native-audio / live models via the bidirectional Live API (WebSocket).
 * We send one text turn and collect the streamed PCM audio chunks.
 */
async function synthesizeViaLive(
  model: string,
  text: string,
  voice: string,
  apiKey: string,
): Promise<SynthResult> {
  if (typeof WebSocket === "undefined") {
    throw new Error("WebSocket unavailable in this runtime");
  }

  const url =
    "wss://generativelanguage.googleapis.com/ws/" +
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent" +
    `?key=${apiKey}`;

  return new Promise<SynthResult>((resolve, reject) => {
    const ws = new WebSocket(url);
    const chunks: Buffer[] = [];
    let sampleRate = 24000;
    let settled = false;

    const timer = setTimeout(() => fail(new Error(`live timed out after ${LIVE_TIMEOUT_MS}ms`)), LIVE_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    function fail(err: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }
    function done() {
      if (settled) return;
      if (chunks.length === 0) {
        fail(new Error("live returned no audio"));
        return;
      }
      settled = true;
      cleanup();
      resolve({ audioBase64: Buffer.concat(chunks).toString("base64"), sampleRate });
    }

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${model}`,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
              },
            },
          },
        }),
      );
    };

    ws.onmessage = async (event: MessageEvent) => {
      try {
        let raw: string;
        const d = event.data as unknown;
        if (typeof d === "string") raw = d;
        else if (d instanceof ArrayBuffer) raw = Buffer.from(d).toString("utf8");
        else if (d && typeof (d as Blob).arrayBuffer === "function") {
          raw = Buffer.from(await (d as Blob).arrayBuffer()).toString("utf8");
        } else {
          raw = String(d);
        }

        const msg = JSON.parse(raw);

        // Once setup is acknowledged, send the single text turn.
        if (msg.setupComplete) {
          ws.send(
            JSON.stringify({
              clientContent: {
                turns: [{ role: "user", parts: [{ text }] }],
                turnComplete: true,
              },
            }),
          );
          return;
        }

        const parts = msg.serverContent?.modelTurn?.parts;
        if (Array.isArray(parts)) {
          for (const p of parts) {
            const data: string | undefined = p.inlineData?.data;
            if (data) {
              chunks.push(Buffer.from(data, "base64"));
              const r = /rate=(\d+)/.exec(p.inlineData?.mimeType || "");
              if (r) sampleRate = parseInt(r[1], 10);
            }
          }
        }

        if (msg.serverContent?.turnComplete || msg.serverContent?.generationComplete) {
          done();
        }
      } catch (err) {
        fail(err instanceof Error ? err : new Error("live parse error"));
      }
    };

    ws.onerror = () => fail(new Error("live websocket error"));
    // If the socket closes after we've received audio, treat it as complete.
    ws.onclose = () => done();
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Higher limit than chat: sentence-chunked replies make several TTS calls.
  const blocked = await guard(req, "tts", { limit: 90, windowMs: 60_000 });
  if (blocked) return blocked;

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_API_KEY not set" }, { status: 400 });
  }

  let body: TtsRequest;
  try {
    body = (await req.json()) as TtsRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  // Honor the user's UI voice choice if allowlisted, else fall back to env.
  const voice = isAllowedGeminiVoice(body.voice)
    ? body.voice
    : process.env.GEMINI_TTS_VOICE || "Kore";
  // Honor the user's UI model selection only if it's on the allowlist.
  const preferred = isAllowedTtsModel(body.model) ? body.model : undefined;
  const models = getModelChain(preferred);
  const errors: string[] = [];

  // Walk the chain; return the first model that yields audio. Live models use
  // the WebSocket backend, classic TTS models use generateContent.
  for (const model of models) {
    try {
      const out = isLiveModel(model)
        ? await synthesizeViaLive(model, text, voice, apiKey)
        : await synthesizeViaTts(model, text, voice, apiKey);
      return NextResponse.json({ ...out, model });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      errors.push(`${model} → ${message}`);
      // Try the next model.
    }
  }

  return NextResponse.json(
    { error: `All TTS models failed: ${errors.join(" | ")}` },
    { status: 502 },
  );
}
