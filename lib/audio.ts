// Browser audio helpers for the live avatar.
//
// Gemini TTS hands us base64-encoded raw PCM (16-bit signed, little-endian,
// mono) at ~24kHz. Simli wants PCM16 mono at exactly 16kHz. These helpers
// decode and resample so the audio drives the avatar's lips correctly.

/** base64 -> raw bytes. */
export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** PCM16 LE bytes -> normalized Float32 samples in [-1, 1]. */
function pcm16ToFloat32(bytes: Uint8Array): Float32Array {
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

/** Float32 samples in [-1, 1] -> PCM16 LE bytes. */
function float32ToPcm16(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

// Reused context just for decoding compressed audio (mp3/opus/…). Offline so it
// needs no user gesture/resume. decodeAudioData ignores its rate when decoding.
let decodeCtx: BaseAudioContext | null = null;
function getDecodeCtx(): BaseAudioContext {
  if (decodeCtx) return decodeCtx;
  const AC =
    (typeof window !== "undefined" &&
      (window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)) ||
    undefined;
  try {
    decodeCtx = new OfflineAudioContext(1, 1, 16000);
  } catch {
    if (!AC) throw new Error("Web Audio unavailable");
    decodeCtx = new AC();
  }
  return decodeCtx;
}

/**
 * Decode a base64 *compressed* clip (e.g. mp3) and resample it to 16kHz mono
 * PCM16 for Simli. Throws if the browser can't decode the format (caller then
 * falls back to another voice tier).
 */
export async function decodeCompressedToSimliPcm(
  audioBase64: string,
  targetRate = 16000,
): Promise<Uint8Array> {
  const bytes = base64ToUint8(audioBase64);
  // Tight copy so decodeAudioData can safely take ownership of the buffer.
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const decoded = await getDecodeCtx().decodeAudioData(ab);

  const frameCount = Math.max(1, Math.ceil(decoded.duration * targetRate));
  const offline = new OfflineAudioContext(1, frameCount, targetRate);
  const source = offline.createBufferSource();
  source.buffer = decoded; // OfflineAudioContext mixes to its 1 (mono) channel
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return float32ToPcm16(rendered.getChannelData(0));
}

/**
 * Decode a base64 PCM16 buffer and resample it to 16kHz PCM16 for Simli.
 * Uses OfflineAudioContext for high-quality resampling.
 */
export async function decodeToSimliPcm(
  audioBase64: string,
  sourceRate: number,
  targetRate = 16000,
): Promise<Uint8Array> {
  const bytes = base64ToUint8(audioBase64);
  const floats = pcm16ToFloat32(bytes);

  if (sourceRate === targetRate || floats.length === 0) {
    return float32ToPcm16(floats);
  }

  const frameCount = Math.max(
    1,
    Math.ceil((floats.length * targetRate) / sourceRate),
  );
  const offline = new OfflineAudioContext(1, frameCount, targetRate);
  const buffer = offline.createBuffer(1, floats.length, sourceRate);
  buffer.getChannelData(0).set(floats);

  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  return float32ToPcm16(rendered.getChannelData(0));
}
