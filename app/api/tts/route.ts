// Server-only: turns the assistant's reply text into speech audio that the
// browser feeds to the Simli avatar for lip-sync.
//
// Uses Gemini's text-to-speech via the same GOOGLE_API_KEY as the chat route.
// Gemini returns raw PCM (16-bit, mono, usually 24kHz) as base64 — we pass it
// straight through with its sample rate; the client resamples to 16kHz.
//
// Resilience: a single TTS model can fail (quota, 5xx, a model id that isn't
// available to your key) or hang. So we try a chain of models in order, each
// with its own timeout, and return the first that produces audio. The chain is
// GEMINI_TTS_MODEL → GEMINI_TTS_MODELS (csv) → built-in defaults, de-duped.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface TtsRequest {
  text?: string;
}

// Tried in order if earlier ones fail. Newest/fastest first.
const DEFAULT_TTS_MODELS = [
  "gemini-2.5-flash-preview-tts",
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-pro-preview-tts",
];

// Per-model attempt budget. If a model doesn't respond in time we move on.
const ATTEMPT_TIMEOUT_MS = 15000;

/** Build the ordered, de-duped list of TTS models to try. */
function getModelChain(): string[] {
  const primary = process.env.GEMINI_TTS_MODEL?.trim();
  const extra = (process.env.GEMINI_TTS_MODELS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const chain = [primary, ...extra, ...DEFAULT_TTS_MODELS].filter(Boolean) as string[];
  return Array.from(new Set(chain));
}

/** Pull the sample rate out of a mime type like "audio/L16;rate=24000". */
function parseSampleRate(mimeType: string | undefined): number {
  if (!mimeType) return 24000;
  const match = /rate=(\d+)/.exec(mimeType);
  return match ? parseInt(match[1], 10) : 24000;
}

/** Synthesize with a single model. Throws on any failure (incl. timeout). */
async function synthesize(
  model: string,
  text: string,
  voice: string,
  apiKey: string,
): Promise<{ audioBase64: string; sampleRate: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
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
      throw new Error(`timed out after ${ATTEMPT_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  const voice = process.env.GEMINI_TTS_VOICE || "Kore";
  const models = getModelChain();
  const errors: string[] = [];

  // Walk the chain; return the first model that yields audio.
  for (const model of models) {
    try {
      const out = await synthesize(model, text, voice, apiKey);
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
