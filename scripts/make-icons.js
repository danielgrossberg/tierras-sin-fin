// Genera los íconos de la app (SVG + PNG) sin dependencias externas.
// Uso: npm run icons
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// ---- Escena en coordenadas 0..1: cielo, estrellas, colinas y una espada dorada ----
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const STARS = [[.18, .2], [.8, .16], [.72, .34], [.27, .4], [.88, .5], [.1, .55]];
function scene(u, v) {
  let c = mix(hex('#2b3566'), hex('#0f1220'), Math.min(1, v * 1.1));
  for (const [sx, sy] of STARS) if (Math.hypot(u - sx, v - sy) < .012) c = hex('#f6e7b0');
  if (v > .74 + .04 * Math.sin(u * 6.3)) c = hex('#3b7438');
  if (v > .83 + .03 * Math.sin(u * 9 + 1)) c = hex('#5f9f48');
  const du = u - .5;
  if (v >= .2 && v <= .62 && Math.abs(du) < .05) c = du < 0 ? hex('#ffffff') : hex('#c9d0e0');            // hoja
  if (v >= .11 && v < .2 && Math.abs(du) < .05 * (v - .11) / .09) c = du < 0 ? hex('#ffffff') : hex('#c9d0e0'); // punta
  if (v >= .62 && v <= .675 && Math.abs(du) < .18) c = hex('#f2c14e');                                      // guarda
  if (v > .675 && v <= .79 && Math.abs(du) < .03) c = hex('#6b4d0f');                                        // empuñadura
  if (Math.hypot(du, v - .815) < .042) c = hex('#f2c14e');                                                   // pomo
  return c;
}
function render(size) {
  const px = Buffer.alloc(size * size * 4), SS = 3;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) { const c = scene((x + (i + .5) / SS) / size, (y + (j + .5) / SS) / size); r += c[0]; g += c[1]; b += c[2]; }
    const o = (y * size + x) * 4, n = SS * SS; px[o] = r / n; px[o + 1] = g / n; px[o + 2] = b / n; px[o + 3] = 255;
  }
  return px;
}

// ---- Codificador PNG mínimo ----
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const stride = size * 4, raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  fs.writeFileSync(path.join(OUT, file), png(size, render(size)));
}

// ---- Versión SVG (favicon y manifest) ----
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3566"/><stop offset="1" stop-color="#0f1220"/></linearGradient></defs>
<rect width="100" height="100" rx="22" fill="url(#s)"/>
${STARS.map(([x, y]) => `<circle cx="${x * 100}" cy="${y * 100}" r="1.2" fill="#f6e7b0"/>`).join('')}
<path d="M0 76 Q16 70 32 76 T64 76 T100 74 V100 H0Z" fill="#3b7438"/>
<path d="M0 85 Q12 81 24 85 T50 85 T76 85 T100 84 V100 H0Z" fill="#5f9f48"/>
<path d="M50 11 L55 20 V62 H45 V20 Z" fill="#e9ecf5"/><path d="M50 11 L55 20 V62 H50 Z" fill="#c9d0e0"/>
<rect x="32" y="62" width="36" height="5.5" rx="2" fill="#f2c14e"/>
<rect x="47" y="67.5" width="6" height="11.5" fill="#6b4d0f"/>
<circle cx="50" cy="81.5" r="4.2" fill="#f2c14e"/>
</svg>
`;
fs.writeFileSync(path.join(OUT, 'icon.svg'), svg);
console.log('Íconos generados en', OUT);
