// Split an assistant reply into speakable chunks so playback can start after
// the first sentence instead of waiting for the whole thing to synthesize.
//
// We break on sentence boundaries, then merge tiny fragments up to a soft
// minimum so the voice doesn't sound choppy, and cap each chunk's length.

interface ChunkOptions {
  /** Don't emit a chunk shorter than this unless it's the last one. */
  minLen?: number;
  /** Hard ceiling per chunk; long sentences get split on a comma/space. */
  maxLen?: number;
}

export function splitIntoSpeechChunks(text: string, opts: ChunkOptions = {}): string[] {
  const minLen = opts.minLen ?? 140;
  const maxLen = opts.maxLen ?? 240;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  // Short / medium replies: don't chunk at all — one fetch, same as before.
  // Chunking only pays off when the reply is long enough that starting after
  // the first part meaningfully beats waiting for the whole thing.
  if (clean.length <= maxLen) return [clean];

  // Sentence-ish split, keeping the terminating punctuation.
  const sentences = clean.match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g) || [clean];

  const chunks: string[] = [];
  let buf = "";

  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push(t);
    buf = "";
  };

  for (const raw of sentences) {
    let s = raw.trim();
    if (!s) continue;

    // Split over-long single sentences on a comma, else on a space.
    while (s.length > maxLen) {
      const slice = s.slice(0, maxLen);
      const cut = Math.max(slice.lastIndexOf(", "), slice.lastIndexOf(" "));
      const at = cut > maxLen * 0.5 ? cut + 1 : maxLen;
      flush();
      chunks.push(s.slice(0, at).trim());
      s = s.slice(at).trim();
    }

    buf = buf ? `${buf} ${s}` : s;
    if (buf.length >= minLen) flush();
  }
  flush();

  return chunks.length > 0 ? chunks : [clean];
}
