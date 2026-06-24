// Frontend API client. The only network call from the browser is to our
// own /api/chat endpoint — API keys never leave the server.

import type { ChatRequest, ChatResponse } from "@/types";

export async function sendChat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data.error || JSON.stringify(data);
    } catch {
      detail = await res.text();
    }
    throw new Error(`Chat request failed (${res.status}): ${detail}`);
  }

  return (await res.json()) as ChatResponse;
}
