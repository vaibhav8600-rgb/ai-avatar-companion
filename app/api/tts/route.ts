// Server-only: turns the assistant's reply text into speech audio that the
// browser feeds to the Simli avatar for lip-sync.
//
// Uses Gemini's text-to-speech model via the same GOOGLE_API_KEY as the chat
// route. Gemini returns raw PCM (16-bit, mono, usually 24kHz) as base64 — we
// pass it straight through with its sample rate; the client resamples to the
// 16kHz Simli expects.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface TtsRequest {
  text?: string;
}

/** Pull the sample rate out of a mime type like "audio/L16;rate=24000". */
function parseSampleRate(mimeType: string | undefined): number {
  if (!mimeType) return 24000;
  const match = /rate=(\d+)/.exec(mimeType);
  return match ? parseInt(match[1], 10) : 24000;
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

  const model = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
  const voice = process.env.GEMINI_TTS_VOICE || "Kore";

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
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice },
              },
            },
          },
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `Gemini TTS error ${res.status}: ${detail}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const part = data.candidates?.[0]?.content?.parts?.find(
      (p: { inlineData?: { data?: string } }) => p.inlineData?.data,
    );
    const audioBase64: string | undefined = part?.inlineData?.data;
    if (!audioBase64) {
      return NextResponse.json({ error: "Gemini TTS returned no audio" }, { status: 502 });
    }

    return NextResponse.json({
      audioBase64,
      sampleRate: parseSampleRate(part?.inlineData?.mimeType),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
