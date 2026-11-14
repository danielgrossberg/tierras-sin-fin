// Utilidades generales: azar con semilla, ruido, colores y helpers del DOM.
// Este módulo no toca el DOM al cargarse, así que el servidor también puede importarlo.
'use strict';

export const $ = s => document.querySelector(s);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];

// Generador pseudoaleatorio determinista
export function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function hashI(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, -1640531535);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; h = Math.imul(h, -2048144789); h ^= h >>> 15;
  return h >>> 0;
}
export function hash(x, y, s) { return hashI(x, y, s) / 4294967296; }
export function strHash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
// La semilla del mundo se deriva del código de sala (igual en cliente y servidor)
export const roomSeed = code => strHash('tsf:' + code);

// Ruido de valor + fBm
const sm = t => t * t * (3 - 2 * t);
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s, o) {
  let t = 0, amp = 1, f = 1, n = 0;
  for (let i = 0; i < o; i++) { t += vnoise(x * f, y * f, s + i * 131) * amp; n += amp; amp *= .5; f *= 2; }
  return t / n;
}

// Colores
export function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; }
export function shade(hex, amt) {
  let [r, g, b] = hex2rgb(hex); const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((f - r) * p + r); g = Math.round((f - g) * p + g); b = Math.round((f - b) * p + b);
  return `rgb(${r},${g},${b})`;
}
export const EF = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

// Escapar texto que viene de otros jugadores antes de meterlo en HTML
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);

// Flecha de dirección (8 rumbos) desde un vector en coordenadas de pantalla
const ARW = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
export const dirArrow = (dx, dy) => (dx || dy) ? ARW[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8] : '•';

// Dirección cardinal con norte = arriba en la pantalla. dx: este positivo · dn: norte positivo
const CARD = ['E', 'NE', 'N', 'NO', 'O', 'SO', 'S', 'SE'];
export const cardinal = (dx, dn) => (dx || dn) ? CARD[(Math.round(Math.atan2(dn, dx) / (Math.PI / 4)) + 8) % 8] : '·';

// Color propio y estable de cada compañero (según su nombre): anillo, nombre y flecha
const MATE_COLORS = ['#4da3ff', '#46c37b', '#ff7eb6', '#b36bff', '#ff9a3d', '#2ed3c6'];
export function mateColor(name) { let h = 0; for (const c of String(name)) h = (h * 31 + c.codePointAt(0)) >>> 0; return MATE_COLORS[h % MATE_COLORS.length]; }
export function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${a})`; }

// Limpia un nombre de jugador: sin controles ni <>, máx. 12 caracteres
export function cleanName(s) {
  if (typeof s !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const t = s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, 12).join('').trim();
}
