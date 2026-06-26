// Shared types for the AI Avatar Companion.

export type AvatarState =
  | "idle"        // waiting, calm
  | "listening"   // mic is open, user is speaking
  | "thinking"    // request sent to AI, waiting for reply
  | "speaking"    // playing AI's voice reply
  | "error"       // something went wrong / offline
  | "muted"       // mic explicitly muted by user
  // ----- Mira Vision states -----
  | "looking"     // camera frame captured, analyzing the scene
  | "learning"    // teaching Mira an object/person
  | "recognizing" // comparing a frame against learned memories
  | "recognized"  // a confident match was found
  | "uncertain";  // saw something familiar but not sure

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
  /** Optional "what the camera currently sees" context for this turn. */
  visionContext?: string;
}

// ----- Mira Vision -----

export type VisionMode = "scene" | "object" | "person" | "recognition";

export interface VisionRequest {
  imageBase64: string;
  prompt: string;
  mode: VisionMode;
}

export interface VisionResult {
  description: string;
  objects: string[];
  peopleCount: number;
  textVisible: string;
  safetyNotes: string;
  confidence: number;
  /**
   * When recognizing against candidate memories (their thumbnails are sent to
   * the model), the label of the matched memory, or "" / "none" if no match.
   */
  matchedLabel?: string;
}

/** A candidate memory (label + thumbnail) sent to the vision model to compare. */
export interface VisionCandidate {
  label: string;
  imageBase64: string;
}

export type VisualMemoryType = "object" | "person" | "place" | "note";

/** A learned visual memory, stored client-side (IndexedDB). */
export interface VisualMemory {
  id: string;
  type: VisualMemoryType;
  label: string;
  description: string;
  /** Small JPEG thumbnail (data URL) chosen by the user. */
  thumbnailBase64: string;
  /** Extra thumbnails for people enrolled from multiple angles. */
  extraThumbnails?: string[];
  createdAt: string;
  updatedAt: string;
  tags: string[];
  /** People are only stored with explicit consent. */
  consented: boolean;
  confidenceThreshold: number;
}

export interface ChatResponse {
  reply: string;
  /** Provider that handled the call, for debugging. */
  provider: "anthropic" | "openai" | "google" | "mock";
}
