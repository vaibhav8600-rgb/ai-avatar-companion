// Server-only: analyzes a captured camera frame with a vision model.
// API keys never reach the browser, raw provider errors are never exposed.
//
// Providers (chosen like the chat route): Google Gemini vision or OpenAI vision.
// Returns a structured, safety-aware result. If no vision provider is
// configured, responds with a clear, graceful error.

import { NextRequest, NextResponse } from "next/server";
import type { VisionResult } from "@/types";
import { guard } from "@/lib/apiGuard";

export const runtime = "nodejs";

// Reject very large images (base64 chars). ~8MB of base64 ≈ 6MB binary.
const MAX_BASE64_CHARS = 8_000_000;
// Cap how many reference thumbnails we forward to the model (they're tiny, but
// bound the request size and token cost).
const MAX_CANDIDATES = 6;

interface VisionCandidateBody {
  label?: string;
  imageBase64?: string;
}

interface VisionBody {
  imageBase64?: string;
  prompt?: string;
  mode?: string;
  /** Reference memories (label + thumbnail) to compare the frame against. */
  candidates?: VisionCandidateBody[];
}

/** Strip a possible data URL prefix and return mime + raw base64. */
function splitDataUrl(input: string): { mime: string; data: string } {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(input);
  if (m) return { mime: m[1], data: m[2] };
  return { mime: "image/jpeg", data: input };
}

function instruction(mode: string, userPrompt: string, hasCandidates: boolean): string {
  const base =
    "You are the vision system for a friendly AI companion. Analyze the image " +
    "and respond with STRICT JSON only (no markdown), matching this shape:\n" +
    `{"description": string, "objects": string[], "peopleCount": number, ` +
    `"textVisible": string, "safetyNotes": string, "confidence": number, ` +
    `"matchedLabel": string}\n` +
    "confidence is 0..1 for how sure you are of the description. " +
    "matchedLabel is the label of the reference that matches the FIRST image, or " +
    `"" if none match (omit it entirely when no references are provided). ` +
    "Privacy rules: NEVER guess the identity of an unknown person. If people " +
    "are present, only describe them generically (clothing, count, posture). " +
    "Do not infer names, age, ethnicity, or sensitive attributes.";

  const compareHint = hasCandidates
    ? " The FIRST image is the current view. The images that follow are labeled " +
      "reference photos the user saved earlier. Compare the first image against " +
      "each reference and set matchedLabel to the label of the one it clearly " +
      'depicts (same specific item/person), or "" if none is a confident match. ' +
      "Set confidence to how sure the match is."
    : "";

  const modeHint =
    mode === "object"
      ? " Focus on the single main object: what it is, brand/material/notable details."
      : mode === "person"
      ? " A person is being enrolled WITH consent; describe only generic appearance to help re-recognition, never an identity guess."
      : mode === "recognition"
      ? " Decide which saved memory (if any) the current view matches and how confident."
      : " Describe the overall scene naturally and briefly.";

  return `${base}${modeHint}${compareHint}\n\nUser request: ${userPrompt}`;
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
    matchedLabel:
      typeof parsed.matchedLabel === "string" &&
      parsed.matchedLabel.toLowerCase() !== "none"
        ? parsed.matchedLabel.trim()
        : "",
  };
}

async function analyzeWithGemini(
  data: string,
  mime: string,
  sys: string,
  candidates: { label: string; mime: string; data: string }[],
): Promise<VisionResult> {
  const apiKey = process.env.GOOGLE_API_KEY!;
  const model =
    process.env.GEMINI_VISION_MODEL || process.env.GOOGLE_MODEL || "gemini-2.0-flash";
  // First the current view, then each labeled reference thumbnail.
  const parts: Record<string, unknown>[] = [
    { text: sys },
    { text: "Current view:" },
    { inline_data: { mime_type: mime, data } },
  ];
  for (const c of candidates) {
    parts.push({ text: `Reference — "${c.label}":` });
    parts.push({ inline_data: { mime_type: c.mime, data: c.data } });
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
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
  candidates: { label: string; mime: string; data: string }[],
): Promise<VisionResult> {
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
  const content: Record<string, unknown>[] = [
    { type: "text", text: sys },
    { type: "text", text: "Current view:" },
    { type: "image_url", image_url: { url: `data:${mime};base64,${data}` } },
  ];
  for (const c of candidates) {
    content.push({ type: "text", text: `Reference — "${c.label}":` });
    content.push({ type: "image_url", image_url: { url: `data:${c.mime};base64,${c.data}` } });
  }
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
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const json = await res.json();
  return coerceResult(json.choices?.[0]?.message?.content || "");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guard(req, "vision", { limit: 30, windowMs: 60_000 });
  if (blocked) return blocked;

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

  // Normalize reference thumbnails (label + image), capped and split.
  const candidates = (Array.isArray(body.candidates) ? body.candidates : [])
    .filter((c) => c && typeof c.imageBase64 === "string" && typeof c.label === "string")
    .slice(0, MAX_CANDIDATES)
    .map((c) => {
      const split = splitDataUrl(c.imageBase64!);
      return { label: c.label!.slice(0, 80), mime: split.mime, data: split.data };
    });

  const sys = instruction(mode, prompt, candidates.length > 0);

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
      result = await analyzeWithOpenAI(data, mime, sys, candidates);
    } else if (provider === "google" && hasGoogle) {
      result = await analyzeWithGemini(data, mime, sys, candidates);
    } else if (hasGoogle) {
      result = await analyzeWithGemini(data, mime, sys, candidates);
    } else {
      result = await analyzeWithOpenAI(data, mime, sys, candidates);
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
