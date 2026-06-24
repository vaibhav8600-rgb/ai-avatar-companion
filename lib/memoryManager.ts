// Tiny localStorage-backed persistence for user-level memory.
// Kept deliberately small: just the things the assistant should remember
// across sessions. Sensitive data should never be stored here.

import type { UserMemory } from "@/types";

const MEMORY_KEY = "aac:memory:v1";
const HISTORY_KEY = "aac:history:v1";

export function loadMemory(): UserMemory {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    return raw ? (JSON.parse(raw) as UserMemory) : {};
  } catch {
    return {};
  }
}

export function saveMemory(memory: UserMemory): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function clearMemory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(MEMORY_KEY);
}

// --- conversation history (in-session, but persisted for convenience) ---

import type { ChatMessage } from "@/types";

export function loadHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(history: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    // Cap history size to keep localStorage small.
    const capped = history.slice(-100);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(capped));
  } catch {
    // ignore
  }
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(HISTORY_KEY);
}
