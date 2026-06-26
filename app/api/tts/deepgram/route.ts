// Server-only: primary TTS via Deepgram Aura, STREAMED.
//
// Returns raw linear16 PCM (16kHz mono) and pipes Deepgram's response straight
// through to the browser as it's synthesized — so playback can start on the
// first bytes instead of waiting for the whole clip. (Network traces showed the
// old "buffer the entire clip" approach was the dominant latency source.)
//
// Tier 1 of the voice chain. On any failure it returns a JSON error so the
// client falls back to Gemini TTS (/api/tts), then the browser's Web Speech voice.

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/apiGuard";

export const runtime = "nodejs";

const MAX_TEXT = 2000;
// Budget to first byte only; cleared once the stream starts flowing.
const CONNECT_TIMEOUT_MS = 12000;
const SAMPLE_RATE = 16000;

interface DeepgramBody {
  text?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  const blocked = await guard(req, "tts-deepgram", { limit: 90, windowMs: 60_000, localOnly: true });
  if (blocked) return blocked;

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DEEPGRAM_API_KEY not set" }, { status: 400 });
  }

  let body: DeepgramBody;
  try {
    body = (await req.json()) as DeepgramBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  if (text.length > MAX_TEXT) {
    return NextResponse.json({ error: "text too long" }, { status: 413 });
  }

  // Tolerate a stray "model=" prefix / inline-comment / whitespace in the env.
  const model = (process.env.DEEPGRAM_TTS_MODEL || "aura-2-luna-en")
    .trim()
    .replace(/^model=/i, "")
    .split(/\s+/)[0]
    .trim();

  // Raw 16kHz PCM, streamed (container=none). Simli consumes 16kHz PCM directly.
  const url =
    `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}` +
    `&encoding=linear16&sample_rate=${SAMPLE_RATE}&container=none`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const detail = err instanceof Error ? err.message : "Unknown error";
    console.error("Deepgram TTS failed:", detail);
    return NextResponse.json({ error: "Deepgram TTS failed.", detail }, { status: 502 });
  }

  if (!res.ok || !res.body) {
    clearTimeout(timer);
    const detail = await res.text().catch(() => "");
    console.error("Deepgram TTS failed:", res.status, detail.slice(0, 200));
    return NextResponse.json(
      { error: "Deepgram TTS failed.", detail: `${res.status}: ${detail.slice(0, 200)}` },
      { status: 502 },
    );
  }

  // Headers are in — stop the connect timer and stream the audio through.
  clearTimeout(timer);
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": `audio/L16;rate=${SAMPLE_RATE}`,
      "Cache-Control": "no-store",
    },
  });
}
