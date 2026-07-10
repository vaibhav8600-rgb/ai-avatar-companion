// Server-only: mints a short-lived Gemini Live ephemeral token so the browser
// can open the Live API WebSocket DIRECTLY to Google (lowest latency) without
// ever seeing GOOGLE_API_KEY. Mirrors the /api/simli-session pattern.
//
// We call the v1alpha auth_tokens REST endpoint with fetch — the @google/genai
// SDK isn't a dependency here and a raw POST keeps the surface tiny (same
// reasoning as the other provider routes).
//
// If Gemini Live isn't configured (no key, or feature flag off), we return a
// clear 4xx reason so the client skips straight to the classic voice pipeline
// without wasting time on a doomed connection attempt.

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/apiGuard";
import { buildSystemPrompt } from "@/lib/systemPrompt";
import type { UserMemory } from "@/types";

export const runtime = "nodejs";

// Fallback only — override with GEMINI_LIVE_MODEL so a model rename never
// needs a redeploy.
const DEFAULT_LIVE_MODEL = "gemini-3.1-flash-live-preview";

// Ephemeral token windows: ~30 min of messaging once a session is open, and a
// short window to *start* the session (we connect immediately after minting).
const TOKEN_TTL_MS = 30 * 60_000;
const NEW_SESSION_TTL_MS = 2 * 60_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // A session mints one token; reconnects/failovers may need a few per minute.
  const blocked = await guard(req, "live-token", { limit: 20, windowMs: 60_000 });
  if (blocked) return blocked;

  const apiKey = process.env.GOOGLE_API_KEY;
  const enabled = (process.env.ENABLE_GEMINI_LIVE || "").toLowerCase() === "true";

  if (!enabled || !apiKey) {
    // Not an error — the classic pipeline is a fully supported mode.
    return NextResponse.json({ error: "gemini_live_not_configured" }, { status: 424 });
  }

  // The client sends its user memory AND recent conversation history. Both
  // are folded into the system prompt and LOCKED INTO THE TOKEN below —
  // empirically, a constrained Live session silently IGNORES a client-sent
  // systemInstruction (Mira answered "I was created by Google"), and seeding
  // history via clientContent{turnComplete:false} hard-closes the socket
  // (1007 invalid argument). The token's bidiGenerateContentSetup is the ONE
  // place context reliably reaches the session.
  let memory: UserMemory | undefined;
  let history: { role: string; content: string }[] = [];
  let visualMemories: { type: string; label: string; description: string }[] = [];
  try {
    const body = (await req.json()) as {
      memory?: UserMemory;
      history?: { role?: unknown; content?: unknown }[];
      visualMemories?: { type?: unknown; label?: unknown; description?: unknown }[];
    };
    if (body && typeof body === "object") {
      if (body.memory && typeof body.memory === "object") memory = body.memory;
      if (Array.isArray(body.history)) {
        history = body.history
          .filter(
            (m): m is { role: string; content: string } =>
              !!m &&
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string" &&
              m.content.length > 0,
          )
          .slice(-12) // recent turns only — the token payload stays small
          .map((m) => ({ role: m.role, content: m.content.slice(0, 400) }));
      }
      if (Array.isArray(body.visualMemories)) {
        visualMemories = body.visualMemories
          .filter(
            (m): m is { type: string; label: string; description: string } =>
              !!m && typeof m.label === "string" && m.label.length > 0,
          )
          .slice(0, 24)
          .map((m) => ({
            type: typeof m.type === "string" ? m.type : "object",
            label: m.label.slice(0, 80),
            description: typeof m.description === "string" ? m.description.slice(0, 200) : "",
          }));
      }
    }
  } catch {
    // No/invalid body is fine — prompt just omits the memory/history blocks.
  }

  const model = process.env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL;
  // Live speaks with its own native voice — WITHOUT an explicit speechConfig
  // Google picks its default (a male voice), which clashes with Mira's
  // persona and the classic chain's female voices. Follow the TTS tier's
  // voice when no Live-specific one is set; Aoede is a warm female default.
  const voice = process.env.GEMINI_LIVE_VOICE || process.env.GEMINI_TTS_VOICE || "Aoede";
  const assistantName = process.env.ASSISTANT_NAME || "Mira";
  const persona =
    process.env.ASSISTANT_PERSONA || "warm, intelligent, professional, gently playful";
  let systemPrompt = buildSystemPrompt(assistantName, persona, memory);
  if (visualMemories.length > 0) {
    const lines = visualMemories.map(
      (m) => `- [${m.type}] ${m.label}${m.description ? `: ${m.description}` : ""}`,
    );
    systemPrompt +=
      `\n\nVisual memories you have been taught (recognize these naturally by label when you see them in the camera):\n` +
      lines.join("\n");
  }
  if (history.length > 0) {
    const lines = history.map(
      (m) => `${m.role === "assistant" ? assistantName : "User"}: ${m.content}`,
    );
    systemPrompt += `\n\nRecent conversation so far (continue naturally from it):\n${lines.join("\n")}`;
  }

  const now = Date.now();
  const expireTime = new Date(now + TOKEN_TTL_MS).toISOString();
  const newSessionExpireTime = new Date(now + NEW_SESSION_TTL_MS).toISOString();

  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1alpha/auth_tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        uses: 1,
        expireTime,
        newSessionExpireTime,
        // Lock the token to our model + config so a leaked token can't be
        // repurposed; sessionResumption lets a dropped connection resume
        // instead of losing context (client-side handling is a follow-up).
        // NOTE: the REST wire name is `bidiGenerateContentSetup` (a
        // BidiGenerateContentSetup message) — the @google/genai SDK's
        // `liveConnectConstraints` is a JS-side alias that the SDK converts
        // to this field; sending the SDK name returns 400 INVALID_ARGUMENT.
        bidiGenerateContentSetup: {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          },
          // Persona + user memory + recent history. MUST live here (see the
          // note above) — a client-sent systemInstruction is ignored on
          // constrained sessions.
          systemInstruction: { parts: [{ text: systemPrompt }] },
          // Tools let Live-Mira actually PERSIST things: the model calls
          // these when the user says "remember/forget this…", the client
          // executes against IndexedDB and replies via toolResponse.
          // Objects only — people remain consent-gated behind the Teach
          // Person UI, never saved by a model decision.
          tools: [
            {
              functionDeclarations: [
                {
                  name: "save_visual_memory",
                  description:
                    "Save an OBJECT the user is showing on camera as a persistent visual memory, " +
                    "when they ask you to remember it. Never use this for people or faces — for " +
                    "people, tell the user to use the Teach Person button (explicit consent is required).",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      label: {
                        type: "STRING",
                        description: "Short name the user gave the item, e.g. 'my black keyboard'",
                      },
                      description: {
                        type: "STRING",
                        description: "Brief visual description of the item as seen in the camera",
                      },
                    },
                    required: ["label", "description"],
                  },
                },
                {
                  name: "forget_visual_memory",
                  description:
                    "Delete a previously saved visual memory by its label, when the user asks you to forget it.",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      label: { type: "STRING", description: "Label of the memory to delete" },
                    },
                    required: ["label"],
                  },
                },
              ],
            },
          ],
          sessionResumption: {},
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `Gemini Live token error ${res.status}: ${detail.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { name?: string };
    if (!data.name) {
      return NextResponse.json({ error: "Gemini Live returned no token" }, { status: 502 });
    }

    // `name` (auth_tokens/…) IS the bearer the client uses in place of an API
    // key when opening the WebSocket. Never log it; never return the real key.
    // (No systemPrompt in the response — it's locked in the token; a client
    // copy would be ignored by the constrained session anyway.)
    return NextResponse.json({
      token: data.name,
      model,
      voice,
      expiresAt: expireTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
