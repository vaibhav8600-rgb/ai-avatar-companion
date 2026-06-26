// Server-only proxy to the AI provider. API keys never reach the browser.
//
// Supports three providers based on the AI_PROVIDER env var:
//   - "anthropic" (default)  -> uses ANTHROPIC_API_KEY + ANTHROPIC_MODEL
//   - "openai"               -> uses OPENAI_API_KEY + OPENAI_MODEL
//   - "google"               -> uses GOOGLE_API_KEY + GOOGLE_MODEL (Gemini via AI Studio)
//
// If no key is configured, returns a friendly mock reply so the UI
// still works for demos and review.

import { NextRequest, NextResponse } from "next/server";
import type { ChatRequest, ChatResponse, UserMemory } from "@/types";
import { guard } from "@/lib/apiGuard";

export const runtime = "nodejs";

// Keep the model context bounded so cost + latency don't grow unbounded over a
// long session. We send the most recent turns only; older history is dropped.
const MAX_CONTEXT_MESSAGES = 20;
// Reject obviously abusive payloads early.
const MAX_MESSAGES = 200;
const MAX_TOTAL_CHARS = 60_000;

// ----- system prompt -----

function buildSystemPrompt(
  assistantName: string,
  persona: string,
  memory?: UserMemory,
  visionContext?: string,
): string {
  const memoryBlock = memory && Object.keys(memory).length > 0
    ? `\n\nThings you remember about this person (use naturally, do not list them back):\n${formatMemory(memory)}`
    : "";
  const visionBlock = visionContext
    ? `\n\nThe camera currently sees: ${visionContext}\nUse this only if the person refers to what they're showing you. Do not identify unknown people.`
    : "";

  return [
    `You are ${assistantName}, a friendly voice-call AI companion.`,
    `Your personality is: ${persona}.`,
    "",
    "Important rules:",
    "- You are a virtual AI assistant, not a real human. If asked directly, be honest about this — but you can have a warm, personable conversation.",
    "- You were created, built, and are owned by Vaibhav Rajput. If anyone asks who created, built, made, or owns you — your creator, builder, maker, developer, or owner — tell them clearly: Vaibhav Rajput.",
    "- You are speaking over voice. Keep replies short and natural: 1–3 sentences usually, unless the person clearly wants depth.",
    "- No markdown, no bullet lists, no headings — your words will be read aloud.",
    "- No stage directions like *smiles* or (pauses). Just speech.",
    "- If the person asks for something you cannot do (browse the web, run code, control devices), say so briefly and offer what you can do instead.",
    "- Avoid filler like 'As an AI...' Just answer.",
    memoryBlock,
    visionBlock,
  ].join("\n");
}

function formatMemory(memory: UserMemory): string {
  const lines: string[] = [];
  if (memory.userName) lines.push(`- Their name is ${memory.userName}.`);
  if (memory.preferences && Object.keys(memory.preferences).length > 0) {
    for (const [k, v] of Object.entries(memory.preferences)) {
      lines.push(`- ${k}: ${v}`);
    }
  }
  if (memory.notes && memory.notes.length > 0) {
    for (const note of memory.notes) lines.push(`- ${note}`);
  }
  return lines.join("\n");
}

// ----- providers -----

async function callAnthropic(
  messages: ChatRequest["messages"],
  system: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

  // We use fetch directly to keep the dependency surface tiny.
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const block = Array.isArray(data.content) ? data.content.find((b: { type: string }) => b.type === "text") : null;
  return block?.text?.trim() || "I'm not sure how to respond to that.";
}

async function callOpenAI(
  messages: ChatRequest["messages"],
  system: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "I'm not sure how to respond.";
}

async function callGoogleAI(
  messages: ChatRequest["messages"],
  system: string,
): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY not set");
  const model = process.env.GOOGLE_MODEL || "gemini-2.0-flash";

  // Gemini uses "model" for assistant turns, not "assistant".
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: 512 },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google AI error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return text || "I'm not sure how to respond to that.";
}

function mockReply(lastUser: string, assistantName: string): string {
  const lower = lastUser.toLowerCase();
  if (
    /\b(creator|created|built|build|made|maker|developer|owner|owns?|owned)\b/.test(lower) &&
    /\byou\b/.test(lower)
  ) {
    return `I was created by Vaibhav Rajput — he's my builder and owner. (I'm also in demo mode right now; add an API key in .env.local to chat for real.)`;
  }
  if (lower.includes("name")) {
    return `I'm ${assistantName}. Nice to meet you. By the way, I'm running in demo mode right now — set an API key in the .env file to connect me to a real model.`;
  }
  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return `Hi there. I'm ${assistantName}, running in demo mode. Add an API key to chat with me for real.`;
  }
  return `Right now I'm in demo mode without an API key, so I can only acknowledge you. You said: "${lastUser.slice(0, 120)}". Add an Anthropic, OpenAI, or Google AI key to .env.local and I'll come to life.`;
}

// ----- handler -----

export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guard(req, "chat", { limit: 30, windowMs: 60_000 });
  if (blocked) return blocked;

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }
  if (body.messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "Too many messages." }, { status: 413 });
  }
  const totalChars = body.messages.reduce((n, m) => n + (m.content?.length || 0), 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return NextResponse.json({ error: "Conversation payload too large." }, { status: 413 });
  }

  // Window to the most recent turns so the model context stays bounded.
  const windowed = body.messages.slice(-MAX_CONTEXT_MESSAGES);

  const assistantName = process.env.ASSISTANT_NAME || "Mira";
  const persona = process.env.ASSISTANT_PERSONA || "warm, intelligent, professional, gently playful";
  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  const system = buildSystemPrompt(assistantName, persona, body.memory, body.visionContext);

  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasGoogle = Boolean(process.env.GOOGLE_API_KEY);

  try {
    let reply: string;
    let usedProvider: ChatResponse["provider"] = "mock";

    if (provider === "anthropic" && hasAnthropic) {
      reply = await callAnthropic(windowed, system);
      usedProvider = "anthropic";
    } else if (provider === "openai" && hasOpenAI) {
      reply = await callOpenAI(windowed, system);
      usedProvider = "openai";
    } else if (provider === "google" && hasGoogle) {
      reply = await callGoogleAI(windowed, system);
      usedProvider = "google";
    } else if (hasAnthropic) {
      reply = await callAnthropic(windowed, system);
      usedProvider = "anthropic";
    } else if (hasOpenAI) {
      reply = await callOpenAI(windowed, system);
      usedProvider = "openai";
    } else if (hasGoogle) {
      reply = await callGoogleAI(windowed, system);
      usedProvider = "google";
    } else {
      // No keys configured — return a clear mock reply so the UX still works.
      const lastUser = [...windowed].reverse().find((m) => m.role === "user")?.content || "";
      reply = mockReply(lastUser, assistantName);
      usedProvider = "mock";
    }

    return NextResponse.json({ reply, provider: usedProvider } satisfies ChatResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
