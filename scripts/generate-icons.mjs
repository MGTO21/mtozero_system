/**
 * Generates the PWA icon set with no image dependencies.
 *
 * The mark is the "0" of Mtozer0: a fuchsia field with a near-black ring cut out
 * of the centre. Drawn procedurally with 4x supersampling so the curve stays clean.
 *
 * Run: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'icons');

/** Logo gradient endpoints: cyan-blue → violet, sampled from the MTOZERO mark. */
const GRAD_START = [0x1b, 0x9b, 0xe8];
const GRAD_END = [0x7e, 0x33, 0xd4];
const INK = [0x0a, 0x09, 0x09];

/* ---------- minimal PNG encoder ---------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- the mark ---------- */

const SS = 4; // supersampling factor

/** Signed coverage of the icon shape at a point, 0..1, evaluated with SS x SS samples. */
function coverage(px, py, size, { corner, ringOuter, ringInner, maskable }) {
  let inShape = 0;
  let inRing = 0;
  const half = size / 2;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const x = px + (sx + 0.5) / SS;
      const y = py + (sy + 0.5) / SS;

      // Rounded-square body (full bleed for the maskable variant).
      let body;
      if (maskable) {
        body = true;
      } else {
        const dx = Math.max(Math.abs(x - half) - (half - corner), 0);
        const dy = Math.max(Math.abs(y - half) - (half - corner), 0);
        body = Math.hypot(dx, dy) <= corner;
      }
      if (!body) continue;
      inShape++;

      const dist = Math.hypot(x - half, y - half);
      if (dist <= ringOuter && dist >= ringInner) inRing++;
    }
  }
  const samples = SS * SS;
  return { body: inShape / samples, ring: inRing / samples };
}

function render(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const geometry = {
    corner: size * 0.22,
    ringOuter: size * (maskable ? 0.255 : 0.3),
    ringInner: size * (maskable ? 0.145 : 0.17),
    maskable,
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const { body, ring } = coverage(x, y, size, geometry);
      const i = (y * size + x) * 4;
      if (body <= 0) {
        rgba[i + 3] = 0;
        continue;
      }
      // Diagonal gradient, bottom-left to top-right, matching the logo's direction.
      const g = Math.min(1, Math.max(0, (x + (size - y)) / (2 * size)));
      const field = [
        GRAD_START[0] * (1 - g) + GRAD_END[0] * g,
        GRAD_START[1] * (1 - g) + GRAD_END[1] * g,
        GRAD_START[2] * (1 - g) + GRAD_END[2] * g,
      ];
      // Ring is punched out of the gradient field.
      const t = Math.min(1, ring / Math.max(body, 0.0001));
      rgba[i] = Math.round(field[0] * (1 - t) + INK[0] * t);
      rgba[i + 1] = Math.round(field[1] * (1 - t) + INK[1] * t);
      rgba[i + 2] = Math.round(field[2] * (1 - t) + INK[2] * t);
      rgba[i + 3] = Math.round(255 * body);
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],
];

for (const [name, size, options] of targets) {
  writeFileSync(join(OUT_DIR, name), render(size, options));
  console.log(`wrote public/icons/${name} (${size}x${size})`);
}
