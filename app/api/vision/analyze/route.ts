// Server-only: analyzes a captured camera frame with a vision model.
// API keys never reach the browser, raw provider errors are never exposed.
//
// Providers (chosen like the chat route): Google Gemini vision or OpenAI vision.
// Returns a structured, safety-aware result. If no vision provider is
// configured, responds with a clear, graceful error.

import { NextRequest, NextResponse } from "next/server";
import type { VisionResult } from "@/types";

export const runtime = "nodejs";

// Reject very large images (base64 chars). ~8MB of base64 ≈ 6MB binary.
const MAX_BASE64_CHARS = 8_000_000;

interface VisionBody {
  imageBase64?: string;
  prompt?: string;
  mode?: string;
}

/** Strip a possible data URL prefix and return mime + raw base64. */
function splitDataUrl(input: string): { mime: string; data: string } {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(input);
  if (m) return { mime: m[1], data: m[2] };
  return { mime: "image/jpeg", data: input };
}

function instruction(mode: string, userPrompt: string): string {
  const base =
    "You are the vision system for a friendly AI companion. Analyze the image " +
    "and respond with STRICT JSON only (no markdown), matching this shape:\n" +
    `{"description": string, "objects": string[], "peopleCount": number, ` +
    `"textVisible": string, "safetyNotes": string, "confidence": number}\n` +
    "confidence is 0..1 for how sure you are of the description. " +
    "Privacy rules: NEVER guess the identity of an unknown person. If people " +
    "are present, only describe them generically (clothing, count, posture). " +
    "Do not infer names, age, ethnicity, or sensitive attributes.";

  const modeHint =
    mode === "object"
      ? " Focus on the single main object: what it is, brand/material/notable details."
      : mode === "person"
      ? " A person is being enrolled WITH consent; describe only generic appearance to help re-recognition, never an identity guess."
      : mode === "recognition"
      ? " Compare against the candidate memories in the user prompt; say which (if any) matches and how confident."
      : " Describe the overall scene naturally and briefly.";

  return `${base}${modeHint}\n\nUser request: ${userPrompt}`;
}

/** Safely coerce a model's JSON-ish text into a VisionResult. */
function coerceResult(text: string): VisionResult {
  let parsed: Record<string, unknown> = {};
  try {
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    }
  } catch {
    // fall through to text-only result
  }
  const asArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  return {
    description:
      typeof parsed.description === "string" && parsed.description
        ? parsed.description
        : text.trim().slice(0, 600) || "I couldn't interpret the image.",
    objects: asArray(parsed.objects),
    peopleCount:
      typeof parsed.peopleCount === "number" ? parsed.peopleCount : 0,
    textVisible: typeof parsed.textVisible === "string" ? parsed.textVisible : "",
    safetyNotes: typeof parsed.safetyNotes === "string" ? parsed.safetyNotes : "",
    confidence:
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
  };
}

async function analyzeWithGemini(
  data: string,
  mime: string,
  sys: string,
): Promise<VisionResult> {
  const apiKey = process.env.GOOGLE_API_KEY!;
  const model =
    process.env.GEMINI_VISION_MODEL || process.env.GOOGLE_MODEL || "gemini-2.0-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: sys }, { inline_data: { mime_type: mime, data } }],
          },
        ],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const json = await res.json();
  const text =
    json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ||
    "";
  return coerceResult(text);
}

async function analyzeWithOpenAI(
  data: string,
  mime: string,
  sys: string,
): Promise<VisionResult> {
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: sys },
            { type: "image_url", image_url: { url: `data:${mime};base64,${data}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const json = await res.json();
  return coerceResult(json.choices?.[0]?.message?.content || "");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: VisionBody;
  try {
    body = (await req.json()) as VisionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.imageBase64 || typeof body.imageBase64 !== "string") {
    return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });
  }
  if (body.imageBase64.length > MAX_BASE64_CHARS) {
    return NextResponse.json(
      { error: "Image too large. Please use a smaller capture." },
      { status: 413 },
    );
  }

  const mode = ["scene", "object", "person", "recognition"].includes(body.mode || "")
    ? (body.mode as string)
    : "scene";
  const prompt = (body.prompt || "Describe what you see.").slice(0, 2000);
  const { mime, data } = splitDataUrl(body.imageBase64);
  const sys = instruction(mode, prompt);

  // Provider selection mirrors the chat route preference, then falls back.
  const provider = (process.env.AI_PROVIDER || "google").toLowerCase();
  const hasGoogle = Boolean(process.env.GOOGLE_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

  if (!hasGoogle && !hasOpenAI) {
    return NextResponse.json(
      { error: "No vision provider configured. Add GOOGLE_API_KEY or OPENAI_API_KEY." },
      { status: 503 },
    );
  }

  try {
    let result: VisionResult;
    if (provider === "openai" && hasOpenAI) {
      result = await analyzeWithOpenAI(data, mime, sys);
    } else if (provider === "google" && hasGoogle) {
      result = await analyzeWithGemini(data, mime, sys);
    } else if (hasGoogle) {
      result = await analyzeWithGemini(data, mime, sys);
    } else {
      result = await analyzeWithOpenAI(data, mime, sys);
    }
    return NextResponse.json(result satisfies VisionResult);
  } catch (err) {
    // Log server-side, return a generic message to the browser.
    console.error("Vision analyze failed:", err);
    return NextResponse.json(
      { error: "Vision analysis failed. Please try again." },
      { status: 502 },
    );
  }
}
