"use client";

// Frontend helpers for Mira Vision: call the secure analyze route, make small
// thumbnails for storage, and do lightweight matching of a fresh frame against
// learned memories (MVP — no embeddings yet).

import type { VisionMode, VisionResult, VisualMemory } from "@/types";

/** Call the server vision route. Throws a friendly error on failure. */
export async function analyzeImage(
  imageBase64: string,
  mode: VisionMode,
  prompt: string,
): Promise<VisionResult> {
  const res = await fetch("/api/vision/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mode, prompt }),
  });
  if (!res.ok) {
    let msg = `Vision request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return (await res.json()) as VisionResult;
}

/** Downscale a captured data URL into a tiny thumbnail for storage. */
export function makeThumbnail(dataUrl: string, maxWidth = 200, quality = 0.6): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Build a recognition prompt listing candidate memories of a given type. */
export function buildRecognitionPrompt(
  memories: VisualMemory[],
  type: "object" | "person",
): string {
  const candidates = memories.filter((m) => m.type === type);
  if (candidates.length === 0) {
    return type === "object"
      ? "Describe the main object in the image. The user has no saved objects yet."
      : "Describe generically whether a person is present. Do NOT guess identity.";
  }
  const list = candidates
    .map((m, i) => `${i + 1}. "${m.label}" — ${m.description || "(no description)"}`)
    .join("\n");
  if (type === "object") {
    return (
      "Here are objects the user has taught me before:\n" +
      list +
      "\n\nDoes the image match any of these saved objects? In `description`, " +
      "name the matching label if confident, and set `confidence` accordingly."
    );
  }
  return (
    "Here are people the user has explicitly enrolled (with consent):\n" +
    list +
    "\n\nOnly if the person clearly matches one of these enrolled descriptions, " +
    "name them in `description` with a confidence. If unsure, say a person is " +
    "present without naming them. Never guess identities of unknown people."
  );
}

export interface MemoryMatch {
  memory: VisualMemory;
  confidence: number;
}

/**
 * Lightweight match: find a saved memory whose label appears in the analysis,
 * weighted by the model's reported confidence. MVP heuristic, not embeddings.
 */
export function matchMemory(
  result: VisionResult,
  memories: VisualMemory[],
  type: "object" | "person",
): MemoryMatch | null {
  const haystack = (
    result.description +
    " " +
    result.objects.join(" ")
  ).toLowerCase();

  let best: MemoryMatch | null = null;
  for (const m of memories) {
    if (m.type !== type) continue;
    const label = m.label.toLowerCase();
    if (!label) continue;
    const labelHit = haystack.includes(label);
    // Also match on individual significant words of the label.
    const wordHit = label
      .split(/\s+/)
      .filter((w) => w.length >= 4)
      .some((w) => haystack.includes(w));
    if (labelHit || wordHit) {
      const score = (labelHit ? 1 : 0.7) * (result.confidence || 0.5);
      if (!best || score > best.confidence) best = { memory: m, confidence: score };
    }
  }
  return best;
}
