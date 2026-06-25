// Rule-based intent router for Live Vision Conversation Mode.
//
// Classifies a spoken/typed transcript into a vision intent so the main
// conversation loop can decide whether to use the camera. MVP is regex-based;
// it can later be swapped for an AI classifier behind the same interface.

export type VisionIntent =
  | "normal_chat"
  | "describe_current_view"
  | "remember_current_object"
  | "recognize_current_view"
  | "remember_current_person"
  | "recognize_known_person"
  | "forget_visual_memory";

export interface VisionIntentResult {
  intent: VisionIntent;
  label?: string;
  targetType?: "object" | "person";
  needsCamera: boolean;
  needsConfirmation?: boolean;
}

/**
 * Tidy a label: strip trailing punctuation and filler, but KEEP a leading
 * possessive ("my office laptop" stays "my office laptop"). The spoken form
 * ("your office laptop") is derived separately when Mira replies.
 */
function cleanLabel(raw: string): string {
  let s = raw.trim().replace(/[.?!,]+$/g, "").trim();
  s = s.replace(/\b(please|now|for me)\b\.?$/i, "").trim();
  // Only drop a leading article (a/an/the), not the possessive "my".
  s = s.replace(/^(a|an|the)\s+/i, "").trim();
  return s;
}

const PERSON_HINT = /\b(person|people|him|her|them|guy|man|woman|friend|wife|husband|brother|sister|colleague|mother|father|mom|dad|son|daughter)\b/i;

export function detectVisionIntent(transcript: string): VisionIntentResult {
  const text = transcript.trim();
  const t = text.toLowerCase();

  // 1) Forget / delete a memory.
  if (/\b(forget|delete|remove)\b/.test(t) && /\b(this|that|object|person|memory|it|my|him|her)\b/.test(t)) {
    const m = /\b(?:forget|delete|remove)\s+(?:this\s+|that\s+|my\s+)?(?:object\s+|person\s+|memory\s+(?:of\s+)?)?(.+)/i.exec(text);
    const label = m && m[1] ? cleanLabel(m[1]) : undefined;
    const targetType = PERSON_HINT.test(t) ? "person" : "object";
    return { intent: "forget_visual_memory", label, targetType, needsCamera: false };
  }

  // 2) Remember a PERSON (opt-in, needs confirmation).
  const wantsRemember = /\b(remember|save|enroll|store)\b/.test(t);
  if (wantsRemember && PERSON_HINT.test(t)) {
    const name = extractPersonName(text);
    return {
      intent: "remember_current_person",
      label: name,
      targetType: "person",
      needsCamera: true,
      needsConfirmation: true,
    };
  }

  // 3) Remember an OBJECT.
  if (wantsRemember && /\b(this|it|that)\b/.test(t)) {
    return {
      intent: "remember_current_object",
      label: extractObjectLabel(text),
      targetType: "object",
      needsCamera: true,
    };
  }
  // "This is my X" (statement form) → remember object.
  if (/^this is (?:my|a|an|the)\s+.+/i.test(text) && !PERSON_HINT.test(t)) {
    return {
      intent: "remember_current_object",
      label: extractObjectLabel(text),
      targetType: "object",
      needsCamera: true,
    };
  }

  // 4) Recognize a known PERSON.
  if (
    /\bwho('?s| is| was)?\b.*\b(this|that|he|she|him|her)\b/.test(t) ||
    /\bwho is this\b|\bwho am i looking at\b/.test(t) ||
    /\bdo you (know|recognize)\b.*\b(him|her|them|this person)\b/.test(t) ||
    /\bis this\b.+\?$/.test(t) && PERSON_HINT.test(t)
  ) {
    return { intent: "recognize_known_person", targetType: "person", needsCamera: true };
  }

  // 5) Recognize / identify the current OBJECT view.
  if (
    /\bdo you remember this\b|\bhave you seen this\b|\bwhat is this\b|\bwhats this\b|\bwhich object\b|\bdo you recognize this\b/.test(t) ||
    (/\bis this my\b/.test(t))
  ) {
    return { intent: "recognize_current_view", targetType: "object", needsCamera: true };
  }

  // 6) Describe the current view.
  if (
    /\bwhat (do|can) you see\b/.test(t) ||
    /\blook at\b/.test(t) ||
    /\b(see|seeing) this\b/.test(t) ||
    /\bcan you see\b/.test(t) ||
    /\bcheck this\b/.test(t) ||
    /\bwhat'?s in front\b|\bwhat is in front\b/.test(t) ||
    /\bwhat'?s in my hand\b|\bwhat is in my hand\b|\bin my hand\b/.test(t) ||
    /\bwhat'?s on my\b|\bwhat is on my\b/.test(t) ||
    /\bwhat am i (holding|showing)\b|\bshowing you\b/.test(t) ||
    /\bdescribe (this|what)\b/.test(t) ||
    /\btell me what (you see|is in front)\b/.test(t)
  ) {
    return { intent: "describe_current_view", needsCamera: true };
  }

  return { intent: "normal_chat", needsCamera: false };
}

function extractObjectLabel(text: string): string | undefined {
  const patterns = [
    /(?:remember|save|store)\s+(?:this|it|that)\s+as\s+(.+)/i,
    /(?:remember|save|store)\s+(?:this|that)\s+(.+)/i,
    /^this is\s+(.+)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && m[1]) {
      // Trim a trailing ", remember it" clause.
      const cut = m[1].replace(/,?\s*(?:remember|save|store)\b.*$/i, "");
      const label = cleanLabel(cut);
      if (label) return label;
    }
  }
  return undefined;
}

function extractPersonName(text: string): string | undefined {
  const patterns = [
    /(?:remember|save|enroll|store)\s+(?:this\s+)?(?:person\s+)?(?:as\s+)?(?:him|her|them)?\s*as\s+(.+)/i,
    /this is\s+(?:my\s+(?:friend|wife|husband|brother|sister|colleague|mother|father|mom|dad|son|daughter)\s+)?([A-Za-z][\w'-]*)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && m[1]) {
      const name = m[1].replace(/,?\s*(?:remember|save|enroll)\b.*$/i, "").replace(/[.?!,]+$/g, "").trim();
      if (name && !PERSON_HINT.test(name.toLowerCase())) return name;
    }
  }
  return undefined;
}
