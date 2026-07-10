// The assistant's system prompt, shared by BOTH voice pipelines so Mira's
// persona/rules are identical whichever one answers:
//   - /api/chat (classic STT → chat → TTS round trip)
//   - /api/live-token (Gemini Live realtime session setup)
//
// Pure and env-free on purpose: callers pass name/persona in (the server
// routes read ASSISTANT_NAME / ASSISTANT_PERSONA), so this module is safe to
// import from the edge runtime and from unit tests alike.

import type { UserMemory } from "@/types";

export function buildSystemPrompt(
  assistantName: string,
  persona: string,
  memory?: UserMemory,
  visionContext?: string,
): string {
  const memoryBlock =
    memory && Object.keys(memory).length > 0
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
    "- You are speaking over voice. Keep replies SHORT: usually 1–2 sentences. Brevity makes you feel fast and responsive — only go longer if the person clearly asks for depth.",
    "- No markdown, no bullet lists, no headings — your words will be read aloud.",
    "- No stage directions like *smiles* or (pauses). Just speech.",
    "- If the person asks for something you cannot do (browse the web, run code, control devices), say so briefly and offer what you can do instead.",
    "- Avoid filler like 'As an AI...' Just answer.",
    memoryBlock,
    visionBlock,
  ].join("\n");
}

export function formatMemory(memory: UserMemory): string {
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
