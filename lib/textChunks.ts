// Split an assistant reply into speakable chunks so playback can start after
// the first sentence instead of waiting for the whole thing to synthesize.
//
// TTS time scales with payload size (uncompressed PCM), so the FIRST chunk is
// kept small — audio starts from a tiny payload almost immediately — while
// later chunks are larger for efficiency. Chunks are prefetched (the next is
// fetched while the current plays), and since a chunk's spoken duration far
// exceeds its synth time, playback stays gapless.

interface ChunkOptions {
  /** Soft minimum length for chunks after the first. */
  minLen?: number;
  /** Hard ceiling per chunk; long sentences get split on a comma/space. */
  maxLen?: number;
  /** The first chunk flushes as soon as it reaches this — keep it small so the
   *  voice starts fast. Guards against emitting a too-tiny fragment. */
  firstMinLen?: number;
}

export function splitIntoSpeechChunks(text: string, opts: ChunkOptions = {}): string[] {
  const minLen = opts.minLen ?? 160;
  const maxLen = opts.maxLen ?? 220;
  const firstMinLen = opts.firstMinLen ?? 25;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  // Sentence-ish split, keeping the terminating punctuation.
  const sentences = clean.match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g) || [clean];

  const chunks: string[] = [];
  let buf = "";

  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push(t);
    buf = "";
  };

  // First chunk flushes early (small, fast first audio); later chunks fill up.
  const threshold = () => (chunks.length === 0 ? firstMinLen : minLen);

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
    if (buf.length >= threshold()) flush();
  }
  flush();

  return chunks.length > 0 ? chunks : [clean];
}
