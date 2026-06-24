// Shared types for the AI Avatar Companion.

export type AvatarState =
  | "idle"        // waiting, calm
  | "listening"   // mic is open, user is speaking
  | "thinking"    // request sent to AI, waiting for reply
  | "speaking"    // playing AI's voice reply
  | "error"       // something went wrong / offline
  | "muted";      // mic explicitly muted by user

export type Role = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  /** ISO timestamp */
  timestamp: string;
}

/** Persisted user-level memory (localStorage). */
export interface UserMemory {
  userName?: string;
  assistantName?: string;
  preferences?: Record<string, string>;
  /** Short free-form notes the user wants the assistant to remember. */
  notes?: string[];
}

export interface ChatRequest {
  messages: { role: Role; content: string }[];
  /** Optional memory snippet to inject into the system prompt. */
  memory?: UserMemory;
}

export interface ChatResponse {
  reply: string;
  /** Provider that handled the call, for debugging. */
  provider: "anthropic" | "openai" | "google" | "mock";
}
