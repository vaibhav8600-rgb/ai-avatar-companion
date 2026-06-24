// Generates the PWA app icons procedurally — no image libraries required.
//
// We don't have ImageMagick/sharp available and avatar.png is portrait (not a
// square icon), so this draws an on-brand "orb" icon (the avatar's signal-blue
// glow on the deep ink canvas) directly to a pixel buffer and encodes valid
// PNGs with Node's built-in zlib.
//
// Run:  node scripts/generate-icons.mjs

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(OUT_DIR, { recursive: true });

// --- brand palette (matches tailwind.config.ts) ---
const INK_900 = [0x0e, 0x0f, 0x13];
const INK_700 = [0x1c, 0x1f, 0x27];
const SIGNAL_400 = [0xa3, 0xd0, 0xec];
const SIGNAL_600 = [0x58, 0x94, 0xbd];
const CREAM_100 = [0xf2, 0xed, 0xe3];

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Smooth 0..1 ramp around an edge for cheap anti-aliasing.
function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function blend(dst, src, alpha) {
  return [
    Math.round(dst[0] + (src[0] - dst[0]) * alpha),
    Math.round(dst[1] + (src[1] - dst[1]) * alpha),
    Math.round(dst[2] + (src[2] - dst[2]) * alpha),
  ];
}

function drawIcon(size) {
  const cx = size / 2;
  const cy = size / 2;
  // Keep the mark inside the maskable safe area (~80% of the canvas).
  const orbR = size * 0.30;
  const ringR = size * 0.345;
  const px = 1.5; // edge softness in pixels

  const raw = Buffer.alloc(size * (size * 4 + 1)); // +1 filter byte per row
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // Background: subtle vertical gradient ink-700 -> ink-900.
      let color = lerp(INK_700, INK_900, y / size);

      const d = Math.hypot(x - cx, y - cy);

      // Outer cream glow ring.
      const ringA =
        smoothstep(ringR + px, ringR, d) * smoothstep(orbR - px, orbR, d) * 0.35;
      if (ringA > 0) color = blend(color, CREAM_100, ringA);

      // The orb itself: radial signal gradient, anti-aliased rim.
      const orbA = smoothstep(orbR + px, orbR - px, d);
      if (orbA > 0) {
        const t = Math.min(1, d / orbR);
        const orbColor = lerp(SIGNAL_400, SIGNAL_600, t);
        color = blend(color, orbColor, orbA);
      }

      raw[p++] = color[0];
      raw[p++] = color[1];
      raw[p++] = color[2];
      raw[p++] = 255;
    }
  }
  return raw;
}

// --- minimal PNG encoder (RGBA, 8-bit) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(size, raw) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const { name, size } of [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
]) {
  const png = encodePng(size, drawIcon(size));
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`wrote public/${name} (${size}x${size}, ${png.length} bytes)`);
}
