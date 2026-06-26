// Server-only: primary TTS via Deepgram Aura. Returns raw linear16 PCM (same
// shape as /api/tts) so it drops straight into the existing pipeline — live
// mode resamples it for Simli, still mode plays it via Web Audio.
//
// Tier 1 of the voice chain. If this fails / has no key / times out, the client
// falls back to Gemini TTS (/api/tts), then to the browser's Web Speech voice.

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/apiGuard";

export const runtime = "nodejs";

const MAX_TEXT = 2000;
const TIMEOUT_MS = 15000;
const SAMPLE_RATE = 24000;

interface DeepgramBody {
  text?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = await guard(req, "tts-deepgram", { limit: 90, windowMs: 60_000 });
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
  const url =
    `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}` +
    `&encoding=linear16&sample_rate=${SAMPLE_RATE}&container=none`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Deepgram ${res.status}: ${detail.slice(0, 200)}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) throw new Error("empty audio");

    return NextResponse.json({
      audioBase64: buffer.toString("base64"),
      sampleRate: SAMPLE_RATE,
      format: "pcm",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    console.error("Deepgram TTS failed:", detail);
    // Surface the upstream reason (status + message, no key) to aid debugging.
    return NextResponse.json({ error: "Deepgram TTS failed.", detail }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
