// Dibujo del mapa en Canvas 2D: chunks cacheados, sprites, otros jugadores, pines y flechas.
'use strict';
import { $, hash, shade, EF, hexA } from './util.js';
import { TILE, CH, B, EN } from './data.js';
import { G, P, START, st, leader } from './state.js';
import { getChunk, biomeAt, feats, monsters, tileAt, nearestVillage } from './world.js';
import { net, mateColor } from './net.js';
import { tracked, QICON } from './quests.js';
import { tombMinutes } from './tomb.js';
import { mateOnMap, othersBubbles, chatMuted } from './prefs.js';
import { D, DW, DH, VISION, inDungeon, isSeen, isVisible, dunProg, caveDone } from './dungeon.js';
import { CAVE, PETS, NODES } from './data.js';
import { nodeReady } from './gather.js';
import { darkness, twilight } from './daynight.js';
import { activePet } from './pets.js';
import { wbAlive, wbPos } from './worldboss.js';
import { cityLvl, cosPublic, merchVillage } from './economy.js';
import { COS, CITY } from './data.js';
import { elix } from './state.js';
import { mountEmoji } from './mounts.js';
import { MOUNTS } from './data.js';
const MOUNT_BY_E = new Map(Object.values(MOUNTS).map(m => [m.e, m]));
// Título del jugador bajo sus pies (Versión 3 · Fase 4)
function titleTag(txt, X, Y, alpha) { if (!txt) return; ctx.save(); ctx.globalAlpha = alpha; ctx.font = `italic bold 10px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000c'; ctx.strokeText('«' + txt + '»', X, Y); ctx.fillStyle = '#ffe08a'; ctx.fillText('«' + txt + '»', X, Y); ctx.restore(); }
// Montura (Versión 3 · Fase 6.5): el animal abajo, mirando hacia donde camina; devuelve cuánto subir al jinete
function mountSprite(e, X, Y, TS, t, faceR, moving, alpha) {
  const m = MOUNT_BY_E.get(e) || { ride: e }, gal = moving ? Math.abs(Math.sin(t / 60)) * 3 : 0;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(X, Y + TS * .18 - gal); if (faceR) ctx.scale(-1, 1);
  ctx.fillStyle = '#000'; ctx.filter = m.tint || 'none'; ctx.font = `${Math.round(TS * 1.05)}px ${EF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.ride || e, 0, 0);
  ctx.filter = 'none'; if (m.spark) { ctx.globalAlpha = alpha * (.6 + .4 * Math.sin(t / 200)); ctx.font = `${Math.round(TS * .35)}px ${EF}`; ctx.fillText('✨', -TS * .42, -TS * .3); }
  ctx.restore();
  return TS * .45 + gal;
}
// Mascota que sigue al grupo: más chica, detrás del líder, saltando un poco
function petSprite(e, X, Y, TS, t, face, alpha, acc) {
  const px = X - face * TS * .5, py = Y + TS * .18 - Math.abs(Math.sin(t / 180)) * 2.5;
  shadow(px, py + TS * .28, TS * .2); emoji(e, px, py, TS * .52, alpha);
  if (acc && COS[acc]) emoji(COS[acc].e, px + TS * .15, py - TS * .24, TS * .26, alpha);   // accesorio (apariencia)
}

const cvs = $('#world'), ctx = cvs.getContext('2d');
let W = 0, H = 0, DPR = 1, Z = 1.3, vign = null;
const SAFE = { t: 0, r: 0, b: 0, l: 0 };   // zonas seguras (notch) leídas desde CSS

export function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cvs.width = Math.round(W * DPR); cvs.height = Math.round(H * DPR); cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
  Z = W < 700 ? 1.1 : 1.375; vign = null;
  const cs = getComputedStyle(document.documentElement);
  for (const [k, v] of [['t', '--sat'], ['r', '--sar'], ['b', '--sab'], ['l', '--sal']]) SAFE[k] = parseFloat(cs.getPropertyValue(v)) || 0;
}
export function clearCanvas() { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cvs.width, cvs.height); }

// ================= Render de un chunk a un canvas fuera de pantalla =================
export function renderChunk(c) {
  const seed = st.seed;
  const can = document.createElement('canvas'); can.width = can.height = CH * TILE; const g = can.getContext('2d');
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
    const x = c.cx * CH + i, y = c.cy * CH + j, t = c.tiles[j * CH + i], px = i * TILE, py = j * TILE, T = TILE;
    const h1 = hash(x, y, seed + 11), h2 = hash(x, y, seed + 12), h3 = hash(x, y, seed + 13);
    const base = B[t.b].c;
    g.fillStyle = shade(base, (h1 - .5) * .1); g.fillRect(px, py, T, T);
    switch (t.b) {
      case 'GRASS': case 'FOREST': g.fillStyle = shade(base, -.2); for (let k = 0; k < 3; k++) g.fillRect(px + Math.floor((h2 * 97 + k * 11) % 28) + 2, py + Math.floor((h3 * 89 + k * 13) % 25) + 4, 2, 4); break;
      case 'SAND': g.fillStyle = shade(base, -.15); for (let k = 0; k < 4; k++) g.fillRect(px + Math.floor((h2 * 71 + k * 9) % 30), py + Math.floor((h3 * 53 + k * 7) % 30), 2, 2); break;
      case 'DESERT': g.strokeStyle = shade(base, -.12); g.lineWidth = 1.5; g.beginPath(); g.arc(px + 16, py + 40 + h2 * 8, 22, Math.PI * 1.25, Math.PI * 1.75); g.stroke(); break;
      case 'SNOW': g.fillStyle = '#ffffff'; if (h2 < .5) g.fillRect(px + Math.floor(h3 * 28), py + Math.floor(h2 * 56), 2, 2); break;
      case 'SWAMP': if (h2 < .28) { g.fillStyle = '#34505a'; g.beginPath(); g.ellipse(px + 16, py + 18, 11, 6, 0, 0, 7); g.fill(); } break;
      case 'ASH': if (h2 < .22) { g.strokeStyle = '#8a2e22'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px + 4, py + 8 + h3 * 10); g.lineTo(px + 16, py + 16); g.lineTo(px + 28, py + 12 + h3 * 14); g.stroke(); } if (h3 < .05) { g.fillStyle = '#ff6a3d'; g.fillRect(px + Math.floor(h2 * 28), py + Math.floor(h1 * 28), 3, 3); } break;
      case 'WATER': {
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1.5; g.beginPath(); const wy = py + 8 + h2 * 16; g.moveTo(px + 4, wy); g.quadraticCurveTo(px + 10, wy - 4, px + 16, wy); g.quadraticCurveTo(px + 22, wy + 4, px + 28, wy); g.stroke();
        g.fillStyle = 'rgba(235,245,255,.55)'; const N = [[0, -1, px, py, T, 3], [0, 1, px, py + T - 3, T, 3], [-1, 0, px, py, 3, T], [1, 0, px + T - 3, py, 3, T]];
        for (const [a, b, rx, ry, rw, rh] of N) if (biomeAt(x + a, y + b) !== 'WATER') g.fillRect(rx, ry, rw, rh);
        break;
      }
      case 'MOUNT': g.fillStyle = '#625d56'; g.beginPath(); g.moveTo(px + 1, py + T - 1); g.lineTo(px + T / 2, py + 3); g.lineTo(px + T - 1, py + T - 1); g.fill();
        g.fillStyle = '#8f8981'; g.beginPath(); g.moveTo(px + 1, py + T - 1); g.lineTo(px + T / 2, py + 3); g.lineTo(px + T / 2, py + T - 1); g.fill();
        g.fillStyle = '#f4f7fa'; g.beginPath(); g.moveTo(px + T / 2 - 6, py + 12); g.lineTo(px + T / 2, py + 3); g.lineTo(px + T / 2 + 6, py + 12); g.fill(); break;
    }
    switch (t.o) {
      case 'tree': g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(px + 16, py + 28, 10, 4, 0, 0, 7); g.fill();
        g.fillStyle = '#5b3b1f'; g.fillRect(px + 14, py + 18, 4, 10); g.fillStyle = t.b === 'FOREST' ? '#24561f' : '#2f6b2a'; g.beginPath(); g.arc(px + 16, py + 13, 11, 0, 7); g.fill();
        g.fillStyle = t.b === 'FOREST' ? '#2f6f29' : '#3f8a37'; g.beginPath(); g.arc(px + 12, py + 10, 6, 0, 7); g.fill(); break;
      case 'pine': g.fillStyle = '#4a3420'; g.fillRect(px + 14, py + 22, 4, 7); g.fillStyle = '#1f4d3a';
        for (const [w, yy] of [[12, 24], [9, 17], [6, 10]]) { g.beginPath(); g.moveTo(px + 16 - w, py + yy); g.lineTo(px + 16, py + yy - 11); g.lineTo(px + 16 + w, py + yy); g.fill(); }
        g.fillStyle = '#eef4f8'; g.beginPath(); g.moveTo(px + 12, py + 5); g.lineTo(px + 16, py - 1); g.lineTo(px + 20, py + 5); g.fill(); break;
      case 'cactus': g.fillStyle = '#3f8f4f'; g.fillRect(px + 13, py + 6, 6, 22); g.fillRect(px + 6, py + 12, 4, 8); g.fillRect(px + 6, py + 18, 8, 3); g.fillRect(px + 22, py + 9, 4, 8); g.fillRect(px + 18, py + 15, 8, 3); break;
      case 'rock': g.fillStyle = t.b === 'ASH' ? '#2c2424' : '#86837e'; g.beginPath(); g.ellipse(px + 16, py + 20, 11, 8, 0, 0, 7); g.fill(); g.fillStyle = t.b === 'ASH' ? '#4a3c3c' : '#a9a6a0'; g.beginPath(); g.ellipse(px + 13, py + 17, 5, 3, 0, 0, 7); g.fill(); break;
      case 'flower': { const cols = ['#ffd6e7', '#ffe066', '#ff8fab', '#c3a6ff', '#ffffff']; for (let k = 0; k < 3; k++) { g.fillStyle = cols[Math.floor((h2 * 7 + k * 3) % 5)]; g.fillRect(px + Math.floor((h3 * 61 + k * 9) % 26) + 3, py + Math.floor((h1 * 67 + k * 11) % 24) + 4, 3, 3); } break; }
      case 'deadtree': g.strokeStyle = '#3e2f22'; g.lineWidth = 3; g.beginPath(); g.moveTo(px + 16, py + 29); g.lineTo(px + 16, py + 8); g.moveTo(px + 16, py + 16); g.lineTo(px + 8, py + 8); g.moveTo(px + 16, py + 13); g.lineTo(px + 24, py + 6); g.stroke(); break;
      case 'reed': g.strokeStyle = '#8a9a55'; g.lineWidth = 1.5; g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(px + 8 + k * 5, py + 28); g.lineTo(px + 6 + k * 5 + h2 * 4, py + 14 + k % 2 * 3); } g.stroke(); break;
      case 'bones': g.fillStyle = '#e8e2d0'; g.fillRect(px + 9, py + 16, 14, 3); g.fillRect(px + 14, py + 11, 3, 13); break;
      case 'shell': g.fillStyle = '#f5d7c4'; g.beginPath(); g.arc(px + 16, py + 18, 4, 0, 7); g.fill(); break;
    }
  }
  c.can = can;
}

// ================= Helpers de dibujo =================
// OJO: los emojis de color se dibujan con la transparencia del fillStyle actual. Si no se fija un relleno
// opaco, heredan el de la sombra (rgba(0,0,0,.28)) y salen al 28%: por eso el héroe y los monstruos se veían transparentes.
function emoji(t, x, y, size, alpha) { ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.fillStyle = '#000'; ctx.font = `${Math.round(size)}px ${EF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y); ctx.globalAlpha = 1; }
function shadow(x, y, w) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x, y, w, w * .35, 0, 0, 7); ctx.fill(); }
function label(txt, x, y, size, col) {
  ctx.font = `bold ${Math.round(size)}px system-ui,sans-serif,${EF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = '#000b'; ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y);
}
function rrect(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
// Globo de diálogo sobre un personaje
function bubble(txt, x, y) {
  const fs = 14; ctx.font = `600 ${fs}px system-ui,sans-serif,${EF}`;
  // Si no cabe en la pantalla (o es muy largo), se corta con "…"
  const maxW = Math.min(W - 34, 280);
  if (ctx.measureText(txt).width > maxW) { const ch = Array.from(txt); while (ch.length > 1 && ctx.measureText(ch.join('') + '…').width > maxW) ch.pop(); txt = ch.join('').trimEnd() + '…'; }
  const w = ctx.measureText(txt).width + 18, h = fs + 14;
  const bx = Math.max(8, Math.min(W - 8 - w, x - w / 2)), by = y - h;
  ctx.fillStyle = 'rgba(255,255,255,.95)'; rrect(bx, by, w, h, 9); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 6, by + h - 1); ctx.lineTo(x + 6, by + h - 1); ctx.lineTo(x, by + h + 7); ctx.fill();
  ctx.fillStyle = '#1a1f36'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + w / 2, by + h / 2 + 1);
}
// Nombre sobre la cabeza en una "píldora" de color con borde negro
function namePill(txt, x, y, bg, fg, frame) {
  if (frame === 'frame_real') txt = '👑 ' + txt;
  ctx.font = `bold 12px system-ui,sans-serif,${EF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(txt).width + 12, h = 18;
  rrect(x - w / 2, y - h / 2, w, h, 9); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#000'; ctx.stroke();
  if (frame === 'frame_oro' || frame === 'frame_real') { ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffd34d'; rrect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 11); ctx.stroke(); }
  if (frame === 'frame_neon') { ctx.save(); ctx.shadowColor = '#ff4dff'; ctx.shadowBlur = 10; ctx.lineWidth = 2; ctx.strokeStyle = '#ff7bff'; rrect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 11); ctx.stroke(); ctx.restore(); }
  ctx.fillStyle = fg; ctx.fillText(txt, x, y + 1);
}
// Jugador (propio o compañero): anillo de color con pulso, emoji con halo blanco y contorno oscuro, y nombre.
// Todo dentro de save/restore con opacidad y filtro explícitos, para que nada se "arrastre" de otros dibujos.
function heroSprite(X, Y, glyph, size, col, t, flip, alpha, name, nameFg, cos) {
  cos = cos || {};
  // Aura (apariencia): brillo grande alrededor del grupo
  if (cos.aura) { ctx.save(); ctx.globalAlpha = alpha; const r = TS() * (1.3 + .1 * Math.sin(t / 400)), gg = ctx.createRadialGradient(X, Y, 0, X, Y, r); const c = cos.aura === 'aura_sombra' ? '120,60,200' : '255,210,80'; gg.addColorStop(0, `rgba(${c},.45)`); gg.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fill(); ctx.restore(); }
  ctx.save();
  ctx.globalAlpha = alpha; ctx.filter = 'none'; ctx.shadowColor = 'transparent';
  const p = .5 + .5 * Math.sin(t / 280);
  ctx.beginPath(); ctx.ellipse(X, Y + TS() * .4, TS() * .5, TS() * .18, 0, 0, 7);
  ctx.fillStyle = hexA(col, .22 + .12 * p); ctx.fill();
  ctx.lineWidth = 2.5 + 1.5 * p; ctx.strokeStyle = cos.ring === 'ring_arcoiris' ? `hsl(${(t / 8) % 360},90%,60%)` : cos.ring === 'ring_fuego' ? `rgba(255,${120 + 60 * p | 0},40,.95)` : cos.ring === 'ring_hielo' ? 'rgba(150,220,255,.95)' : cos.ring === 'ring_estrellas' ? 'rgba(255,230,120,.95)' : hexA(col, .7 + .3 * p); ctx.stroke();
  // Partículas del anillo (fuego, hielo o estrellas) girando
  if (cos.ring && cos.ring !== 'ring_arcoiris' && COS[cos.ring]) { for (let i = 0; i < 3; i++) { const a = t / 600 + i * 2.1; ctx.save(); ctx.font = `${Math.round(TS() * .26)}px ${EF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText(COS[cos.ring].e, X + Math.cos(a) * TS() * .5, Y + TS() * .4 + Math.sin(a) * TS() * .18); ctx.restore(); } }
  ctx.translate(X, Y); if (flip) ctx.scale(-1, 1);
  ctx.font = `${Math.round(size)}px ${EF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';   // relleno opaco: si no, el emoji hereda la transparencia del anillo
  ctx.shadowColor = 'rgba(255,255,255,.95)'; ctx.shadowBlur = 6 * DPR; ctx.fillText(glyph, 0, 0);   // halo blanco
  ctx.shadowColor = 'rgba(0,0,0,.95)'; ctx.shadowBlur = 2 * DPR; ctx.fillText(glyph, 0, 0);         // contorno oscuro
  ctx.restore();
  if (name) { ctx.save(); ctx.globalAlpha = alpha; namePill(name, X, Y - size * .82, col, nameFg, cos.frame); ctx.restore(); }
}
const TS = () => TILE * Z;
const statusIcon = s => s === 'battle' ? '⚔️ ' : s === 'village' ? '🏘️ ' : s === 'dungeon' ? '🕳️ ' : '';
const visibleOther = o => o.status && o.status !== 'lobby' && o.status !== 'away' && Number.isFinite(o.px);

// Rectángulos del HUD (se leen del DOM cada medio segundo, no en cada frame)
let hudRects = [], hudT = 0;
function refreshHud(t) {
  if (t - hudT < 500) return; hudT = t;
  hudRects = ['#hud', '#info', '#dn', '#coords', '#plist', '#dock', '#dpad', '#social'].map(s => document.querySelector(s)).filter(Boolean)
    .map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
}
const hitsBox = (x0, y0, x1, y1) => hudRects.some(r => x1 > r.left && x0 < r.right && y1 > r.top && y0 < r.bottom);
const hitsHud = (x, y) => hitsBox(x - 26, y - 30, x + 26, y + 30);

// Flecha en el borde de la pantalla apuntando a algo fuera de vista (compañero, misión o Ciudad Origen).
// `placed` guarda las flechas ya dibujadas en este frame para que no se encimen.
const offscreen = (X, Y) => X < 12 || X > W - 12 || Y < 12 || Y > H - 12;
function edgeArrow(X, Y, icon, text, col, textCol, alpha, placed) {
  const m = 46, L = SAFE.l + m, R = W - SAFE.r - m, T = SAFE.t + m, Bt = H - SAFE.b - m;
  const cx = W / 2, cy = H / 2, dx = X - cx, dy = Y - cy;
  let s = Infinity;
  if (dx > 0) s = Math.min(s, (R - cx) / dx); if (dx < 0) s = Math.min(s, (L - cx) / dx);
  if (dy > 0) s = Math.min(s, (Bt - cy) / dy); if (dy < 0) s = Math.min(s, (T - cy) / dy);
  if (!Number.isFinite(s)) return;
  let ax = cx + dx * s, ay = cy + dy * s;
  const ang = Math.atan2(dy, dx);
  // Si cae sobre el HUD (cruceta, botones…) o sobre otra flecha, buscamos el lugar libre más cercano:
  // primero deslizándola por el borde (a ambos lados) y, si el borde está tapado, un poco hacia adentro.
  const onSide = Math.abs(ax - L) < 1 || Math.abs(ax - R) < 1;
  const along = onSide ? [0, 1] : [1, 0], inward = onSide ? [Math.sign(cx - ax) || 1, 0] : [0, Math.sign(cy - ay) || 1];
  ctx.font = `bold 12px system-ui,sans-serif,${EF}`; const tw = ctx.measureText(text).width / 2 + 4;
  const labelAt = (x, y) => [Math.max(L + 24, Math.min(R - 24, x)), y > cy ? y - 30 : y + 31];
  const labelHits = (x, y) => { const [lx, ly] = labelAt(x, y); return hitsBox(lx - tw, ly - 9, lx + tw, ly + 9); };
  // Choque con otra flecha: círculo contra círculo y texto contra texto (o contra el círculo de la otra)
  const box = (x0, y0, x1, y1, q) => x1 > q[0] && x0 < q[2] && y1 > q[1] && y0 < q[3];
  const clash = (x, y) => { const [lx, ly] = labelAt(x, y), me = [lx - tw, ly - 10, lx + tw, ly + 10], ci = [x - 24, y - 24, x + 24, y + 24];
    return placed.some(p => box(...ci, p.c) || box(...me, p.l) || box(...me, p.c) || box(...ci, p.l)); };
  const free = (x, y) => x >= L && x <= R && y >= T && y <= Bt && !hitsHud(x, y) && !labelHits(x, y) && !clash(x, y);
  search: for (let depth = 0; depth <= Math.max(W, H) / 2; depth += 24) {
    for (let k = 0; k <= 40; k++) for (const sg of k ? [1, -1] : [1]) {
      const x = ax + along[0] * sg * k * 8 + inward[0] * depth, y = ay + along[1] * sg * k * 8 + inward[1] * depth;
      if (free(x, y)) { ax = x; ay = y; break search; }
    }
  }
  { const [plx, ply] = labelAt(ax, ay); placed.push({ x: ax, y: ay, c: [ax - 24, ay - 24, ax + 24, ay + 24], l: [plx - tw, ply - 10, plx + tw, ply + 10] }); }
  ctx.save(); ctx.translate(ax, ay); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(15,18,32,.88)'; ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.rotate(ang); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(21, -8); ctx.lineTo(21, 8); ctx.fill(); ctx.restore();
  emoji(icon, 0, 1, 20, alpha);
  ctx.restore();
  const [lx, ly] = labelAt(ax, ay);
  ctx.globalAlpha = alpha; label(text, lx, ly, 12, textCol); ctx.globalAlpha = 1;
}

// ================= Frame principal =================
// ================= Mazmorra (Versión 3 · Fase 1) =================
// El piso se dibuja una vez en un canvas aparte; en cada frame se pone encima la niebla:
// negro = sin explorar · penumbra = ya visto · claro = dentro de tu visión (~5 casillas)
function floorCanvas(fl) {
  if (fl.can) return fl.can;
  const T = TILE, C = CAVE[fl.kind] || CAVE.cripta, can = document.createElement('canvas'); can.width = DW * T; can.height = DH * T;
  const g = can.getContext('2d'), seed = st.seed + fl.f * 17;
  for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
    const px = x * T, py = y * T, h1 = hash(x, y, seed + 1), h2 = hash(x, y, seed + 2), floor = fl.grid[y * DW + x] === 1;
    if (floor) {
      g.fillStyle = shade(C.floor, (h1 - .5) * .14); g.fillRect(px, py, T, T);
      g.strokeStyle = shade(C.floor, -.22); g.lineWidth = 1; g.strokeRect(px + .5, py + .5, T - 1, T - 1);
      if (h2 < .18) { g.fillStyle = shade(C.floor, -.28); g.fillRect(px + 6 + Math.floor(h1 * 16), py + 8 + Math.floor(h2 * 60), 3, 3); }
    } else {
      g.fillStyle = shade(C.wall, (h1 - .5) * .12); g.fillRect(px, py, T, T);
      // Cara del muro (si abajo hay suelo): ladrillos más claros
      if (y + 1 < DH && fl.grid[(y + 1) * DW + x] === 1) {
        g.fillStyle = C.line; g.fillRect(px, py + T * .45, T, T * .55);
        g.strokeStyle = shade(C.line, -.3); g.lineWidth = 1.5; g.beginPath(); g.moveTo(px, py + T * .72); g.lineTo(px + T, py + T * .72);
        g.moveTo(px + (h1 < .5 ? T * .3 : T * .65), py + T * .45); g.lineTo(px + (h1 < .5 ? T * .3 : T * .65), py + T * .72); g.stroke();
      }
    }
  }
  fl.can = can; return can;
}
function drawDungeon(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const TS = TILE * Z, fl = D.fl, pr = dunProg(D.cave.id);
  const camX = Math.round(D.px * TS + TS / 2 - W / 2), camY = Math.round(D.py * TS + TS / 2 - H / 2);
  ctx.drawImage(floorCanvas(fl), -camX, -camY, DW * TS, DH * TS);
  const sx = x => x * TS - camX + TS / 2, sy = y => y * TS - camY + TS / 2;
  const x0 = Math.max(0, Math.floor(camX / TS) - 1), y0 = Math.max(0, Math.floor(camY / TS) - 1), x1 = Math.min(DW - 1, Math.ceil((camX + W) / TS) + 1), y1 = Math.min(DH - 1, Math.ceil((camY + H) / TS) + 1);
  // Objetos del piso (solo si ya se vieron); monstruos solo si están a la vista
  const sprites = [], seen = (x, y) => isSeen(x, y);
  const stairs = (p, up) => { if (p && seen(p.x, p.y)) sprites.push({ y: p.y, fn: () => { const X = sx(p.x), Y = sy(p.y); ctx.fillStyle = 'rgba(242,193,78,.18)'; ctx.fillRect(X - TS / 2, Y - TS / 2, TS, TS); emoji('🪜', X, Y, TS * .85); label(up ? (D.f === 0 ? 'Salida' : 'Subir') : 'Bajar', X, Y - TS * .62, 11, up ? '#ffe6a0' : '#9fd8ff'); } }); };
  stairs(fl.up, true); stairs(fl.down, false);
  if (fl.exit && pr.done && seen(fl.exit.x, fl.exit.y)) sprites.push({ y: fl.exit.y, fn: () => { const X = sx(fl.exit.x), Y = sy(fl.exit.y), r = TS * (.7 + .08 * Math.sin(t / 250)); const gr = ctx.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, 'rgba(127,224,255,.6)'); gr.addColorStop(1, 'rgba(127,224,255,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fill(); emoji('🌀', X, Y, TS * .9); label('Salida', X, Y - TS * .65, 11, '#bff0ff'); } });
  for (const v of fl.veins || []) if (seen(v.x, v.y)) sprites.push({ y: v.y - .2, fn: () => emoji('⛏️', sx(v.x), sy(v.y), TS * .55, nodeReady(v.id) ? .95 : .3) });
  for (const c of fl.chests) if (!pr.ch[c.id] && seen(c.x, c.y)) sprites.push({ y: c.y, fn: () => { shadow(sx(c.x), sy(c.y) + TS * .3, TS * .3); emoji('📦', sx(c.x), sy(c.y) + Math.sin(t / 300 + c.x) * 2, TS * .72); } });
  for (const tr of fl.traps) {
    const known = D.trapSeen.get(tr.id), gone = D.trapGone.has(tr.id);
    if ((known || gone) && seen(tr.x, tr.y)) sprites.push({ y: tr.y - .1, fn: () => emoji(tr.type === 'spike' ? '🔺' : '☁️', sx(tr.x), sy(tr.y), TS * .55, gone ? .45 : .95) });
  }
  for (const m of D.mons.values()) {
    if (!(m.boss ? seen(m.x, m.y) : isVisible(m.x, m.y))) continue;
    sprites.push({ y: m.py, fn: () => {
      const X = sx(m.px), Y = sy(m.py), e = EN[m.group[0]];
      if (m.boss) {
        const r = TS * (.95 + .08 * Math.sin(t / 200)); const gr = ctx.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, 'rgba(255,40,40,.55)'); gr.addColorStop(1, 'rgba(255,40,40,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fill();
        shadow(X, Y + TS * .45, TS * .5); emoji(e.e, X, Y - Math.abs(Math.sin(t / 400)) * 3, TS * 1.35); emoji('👑', X, Y - TS * .85, TS * .45);
      } else {
        ctx.beginPath(); ctx.ellipse(X, Y + TS * .36, TS * .38, TS * .14, 0, 0, 7); ctx.fillStyle = 'rgba(229,72,77,.25)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,90,90,.65)'; ctx.stroke();
        shadow(X, Y + TS * .35, TS * .28); emoji(e.e, X, Y - Math.abs(Math.sin(t / 260 + m.hx)) * 3, TS * .82, m.stun > 0 ? .45 : 1);
        if (m.group.length > 1) { ctx.fillStyle = '#000b'; ctx.beginPath(); ctx.arc(X + TS * .38, Y - TS * .3, TS * .17, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(TS * .24)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.group.length, X + TS * .38, Y - TS * .29); }
      }
    } });
  }
  sprites.push({ y: D.py + .45, fn: () => { const X = sx(D.px), Y = sy(D.py), moving = Math.abs(D.x - D.px) + Math.abs(D.y - D.py) > .03;
    { const pt = activePet(); if (pt) petSprite(PETS[pt.k].e, X, Y, TS, t, D.face > 0 ? 1 : -1, 1, cosPublic().acc); }
    shadow(X, Y + TS * .4, TS * .36); heroSprite(X, Y - (moving ? Math.abs(Math.sin(t / 70)) * 4 : 0), leader().e, TS * .97, '#f2c14e', t, D.face > 0, 1, st.name || 'Tú', '#241a00', cosPublic()); } });
  sprites.sort((a, b) => a.y - b.y).forEach(s => s.fn());
  // Niebla
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (isVisible(x, y)) continue;
    ctx.fillStyle = isSeen(x, y) ? 'rgba(4,3,8,.62)' : '#000';
    ctx.fillRect(Math.floor(x * TS - camX), Math.floor(y * TS - camY), Math.ceil(TS) + 1, Math.ceil(TS) + 1);
  }
  // Luz de antorcha alrededor del grupo
  const X = sx(D.px), Y = sy(D.py), lg = ctx.createRadialGradient(X, Y, TS * 1.5, X, Y, TS * (VISION + .8));
  lg.addColorStop(0, 'rgba(255,170,60,0)'); lg.addColorStop(.7, 'rgba(0,0,0,.18)'); lg.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
  // Flechas en el borde: escalera de bajada o salida (si ya las viste)
  refreshHud(t); const placed = [];
  const goal = fl.down || (pr.done ? fl.exit : null);
  if (goal && isSeen(goal.x, goal.y)) { const gx = sx(goal.x), gy = sy(goal.y); if (offscreen(gx, gy)) edgeArrow(gx, gy, fl.down ? '🪜' : '🌀', `${fl.down ? 'Bajar' : 'Salida'} · ${Math.round(Math.hypot(goal.x - D.x, goal.y - D.y))} c`, '#9fd8ff', '#e2f4ff', 1, placed); }
  if (fl.up && isSeen(fl.up.x, fl.up.y)) { const ux = sx(fl.up.x), uy = sy(fl.up.y); if (offscreen(ux, uy)) edgeArrow(ux, uy, '🪜', `${D.f === 0 ? 'Salida' : 'Subir'} · ${Math.round(Math.hypot(fl.up.x - D.x, fl.up.y - D.y))} c`, '#f2c14e', '#ffe6a0', .8, placed); }
}

export function draw(t) {
  if (inDungeon()) { drawDungeon(t); return; }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0b0e18'; ctx.fillRect(0, 0, W, H);
  const TS = TILE * Z, CS = CH * TS;
  const camX = Math.round(P.px * TS + TS / 2 - W / 2), camY = Math.round(P.py * TS + TS / 2 - H / 2);
  const cx0 = Math.floor(camX / CS), cy0 = Math.floor(camY / CS), cx1 = Math.floor((camX + W) / CS), cy1 = Math.floor((camY + H) / CS);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const c = getChunk(cx, cy); if (!c.can) renderChunk(c); ctx.drawImage(c.can, Math.round(cx * CS - camX), Math.round(cy * CS - camY), Math.ceil(CS), Math.ceil(CS)); }
  const x0 = Math.floor(camX / TS) - 1, y0 = Math.floor(camY / TS) - 1, x1 = Math.ceil((camX + W) / TS) + 1, y1 = Math.ceil((camY + H) / TS) + 1;
  const sx = x => x * TS - camX + TS / 2, sy = y => y * TS - camY + TS / 2;
  const sprites = [], litVillages = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const f = feats.get(x + ',' + y); if (!f) continue;
    if (f.type === 'village') litVillages.push(f);
    if (f.type === 'village' && f.start) sprites.push({ y, fn: () => {
      // Ciudad Origen: castillo grande, brillo dorado suave y nombre en dorado
      const X = sx(x), Y = sy(y), r = TS * (1.25 + .08 * Math.sin(t / 500));
      const gr = ctx.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, 'rgba(242,193,78,.45)'); gr.addColorStop(1, 'rgba(242,193,78,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fill();
      shadow(X, Y + TS * .5, TS * .7); emoji('🏰', X, Y - TS * .1, TS * 1.65);
      // Mejoras de la ciudad (Versión 3 · Fase 5): cada proyecto con nivel se ve alrededor del castillo
      const ring = [['posada', -1.3, .55], ['tienda', 1.3, .55], ['herreria', -1.45, -.35], ['portal', 1.45, -.35], ['estatua', 0, 1.15]];
      if (cityLvl('muralla')) for (let i = 0; i < 4 + 2 * cityLvl('muralla'); i++) { const a = Math.PI * (.15 + .7 * i / (3 + 2 * cityLvl('muralla'))); emoji(cityLvl('muralla') >= 3 && i % 3 === 0 ? '🗼' : '🧱', X + Math.cos(a + Math.PI) * TS * 1.9, Y + TS * .3 - Math.sin(a) * TS * .4, TS * .42); }
      for (const [k, dx, dy] of ring) if (cityLvl(k)) emoji(CITY[k].e, X + dx * TS, Y + dy * TS, TS * (.45 + .08 * cityLvl(k)));
      if (cityLvl('estatua') && net.city) { const top = Object.entries(net.city.donors || {}).sort((a, b) => b[1] - a[1]).slice(0, cityLvl('estatua')).map(x => x[0]); if (top.length) label('🗿 ' + top.join(' · '), X, Y + TS * 1.6, 10, '#ffe6a0'); }
      ctx.font = `bold ${Math.max(13, Math.round(TS * .38))}px Georgia,serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = '#000c'; ctx.strokeText(f.name, X, Y - TS * 1.12); ctx.fillStyle = '#f2c14e'; ctx.fillText(f.name, X, Y - TS * 1.12);
    } });
    else if (f.type === 'village') sprites.push({ y, fn: () => {
      shadow(sx(x), sy(y) + TS * .38, TS * .55); emoji('🏘️', sx(x), sy(y), TS * 1.25);
      ctx.font = `bold ${Math.max(11, Math.round(TS * .3))}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#000a'; ctx.strokeText(f.name, sx(x), sy(y) - TS * .8); ctx.fillStyle = '#ffe6a0'; ctx.fillText(f.name, sx(x), sy(y) - TS * .8);
    } });
    else if (f.type === 'cave') sprites.push({ y, fn: () => {
      // Entrada de mazmorra: agujero oscuro con brillo morado, nombre y ✅ si ya se completó
      const X = sx(x), Y = sy(y), done = caveDone(f.id);
      ctx.fillStyle = 'rgba(10,6,16,.85)'; ctx.beginPath(); ctx.ellipse(X, Y + TS * .2, TS * .55, TS * .32, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(192,132,252,${.45 + .25 * Math.sin(t / 400)})`; ctx.lineWidth = 2.5; ctx.stroke();
      emoji('🕳️', X, Y, TS * .95);
      if (done) emoji('✅', X + TS * .42, Y - TS * .38, TS * .42);
      ctx.font = `bold ${Math.max(11, Math.round(TS * .28))}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#000c'; ctx.strokeText(f.name, X, Y - TS * .78); ctx.fillStyle = '#e9ddff'; ctx.fillText(f.name, X, Y - TS * .78);
    } });
    else if (f.type === 'node') sprites.push({ y: y - .2, fn: () => {
      // Punto de recolección (Versión 3 · Fase 6.1): tenue si está agotado
      const ok = nodeReady(f.id); ctx.fillStyle = ok ? 'rgba(255,240,180,.22)' : 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(sx(x), sy(y) + TS * .25, TS * .3, TS * .12, 0, 0, 7); ctx.fill();
      emoji(NODES[f.kind].e, sx(x), sy(y) + (ok ? Math.sin(t / 500 + x) * 1.5 : 0), TS * .5, ok ? .95 : .3);
    } });
    else if (f.type === 'chest' && !G.opened[f.id]) sprites.push({ y, fn: () => { shadow(sx(x), sy(y) + TS * .3, TS * .3); emoji('📦', sx(x), sy(y) + Math.sin(t / 300 + x) * 2, TS * .72); } });
    else if (f.type === 'shrine') sprites.push({ y, fn: () => {
      shadow(sx(x), sy(y) + TS * .35, TS * .35); emoji('⛩️', sx(x), sy(y), TS * .9, G.opened[f.id] ? .4 : 1);
      if (!G.opened[f.id]) { ctx.fillStyle = `rgba(194,123,255,${.25 + .15 * Math.sin(t / 250)})`; ctx.beginPath(); ctx.arc(sx(x), sy(y), TS * .6, 0, 7); ctx.fill(); }
    } });
  }
  for (const m of monsters.values()) {
    if (m.px < x0 || m.px > x1 || m.py < y0 || m.py > y1) continue;
    sprites.push({ y: m.py, fn: () => {
      const X = sx(m.px), Y = sy(m.py), e = EN[m.group[0]].e;
      if (m.boss) {
        const r = TS * (.85 + .08 * Math.sin(t / 200)); const gr = ctx.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, 'rgba(255,40,40,.55)'); gr.addColorStop(1, 'rgba(255,40,40,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fill();
        shadow(X, Y + TS * .45, TS * .5); emoji(e, X, Y - Math.abs(Math.sin(t / 400)) * 3, TS * 1.35); emoji('👑', X, Y - TS * .85, TS * .45);
      } else {
        ctx.beginPath(); ctx.ellipse(X, Y + TS * .36, TS * .38, TS * .14, 0, 0, 7); ctx.fillStyle = 'rgba(229,72,77,.22)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,90,90,.6)'; ctx.stroke();  // rojo = enemigo
        shadow(X, Y + TS * .35, TS * .28); emoji(e, X, Y - Math.abs(Math.sin(t / 260 + m.hx)) * 3, TS * .82, m.stun > 0 ? .45 : 1);
        if (m.group.length > 1) { ctx.fillStyle = '#000b'; ctx.beginPath(); ctx.arc(X + TS * .38, Y - TS * .3, TS * .17, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(TS * .24)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.group.length, X + TS * .38, Y - TS * .29); }
      }
    } });
  }
  // Pines de ubicación (visibles para todos durante 2 minutos)
  const now = Date.now();
  for (const pin of net.pins.values()) {
    if (pin.until < now || pin.x < x0 || pin.x > x1 || pin.y < y0 || pin.y > y1) continue;
    sprites.push({ y: pin.y - .01, fn: () => {
      const X = sx(pin.x), Y = sy(pin.y), k = (t / 900) % 1, fade = Math.min(1, (pin.until - now) / 10000);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = `rgba(255,95,162,${1 - k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(X, Y + TS * .3, TS * (.2 + k * .6), TS * (.08 + k * .22), 0, 0, 7); ctx.stroke();
      emoji('📍', X, Y - TS * .15 - Math.abs(Math.sin(t / 300)) * 4, TS * .85, fade);
      ctx.globalAlpha = fade; label(pin.name, X, Y - TS * .78, 11, '#ffc2dc'); ctx.globalAlpha = 1;
    } });
  }
  // Objetivo de la misión seguida (❗ sobre la casilla)
  const tq = tracked();
  if (tq && tq.target && tq.target.x >= x0 && tq.target.x <= x1 && tq.target.y >= y0 && tq.target.y <= y1) {
    sprites.push({ y: tq.target.y + .02, fn: () => { const X = sx(tq.target.x), Y = sy(tq.target.y); emoji('❗', X, Y - TS * 1.05 - Math.abs(Math.sin(t / 250)) * 5, TS * .6); } });
  }
  const onWater = tileAt(P.x, P.y).b === 'WATER';
  // 🌋 Jefe de mundo: gigante, con brillo de lava y su barra de vida compartida
  if (wbAlive()) { const q = wbPos(); if (q && q.x >= x0 - 1 && q.x <= x1 + 1 && q.y >= y0 - 1 && q.y <= y1 + 1) sprites.push({ y: q.y + .1, fn: () => {
    const X = sx(q.x), Y = sy(q.y), r = TS * (1.6 + .12 * Math.sin(t / 300)), w = net.wb;
    const gr = ctx.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, 'rgba(255,90,31,.6)'); gr.addColorStop(1, 'rgba(255,90,31,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fill();
    shadow(X, Y + TS * .6, TS * .8); emoji('🌋', X, Y - TS * .3 - Math.abs(Math.sin(t / 500)) * 3, TS * 2.1); emoji('👑', X, Y - TS * 1.5, TS * .5);
    const bw = TS * 2.2, bx = X - bw / 2, by = Y + TS * .75; ctx.fillStyle = '#000c'; ctx.fillRect(bx - 1, by - 1, bw + 2, 9); ctx.fillStyle = '#ff5a1f'; ctx.fillRect(bx, by, bw * w.hp / w.mhp, 7);
    label(`Titán de Lava · ${Math.round(100 * w.hp / w.mhp)}%`, X, by + 17, 11, '#ffd0b0');
  } }); }
  // Otros jugadores
  const away = [];
  for (const o of net.others.values()) {
    if (!visibleOther(o) || !mateOnMap(o)) continue;   // 👁️ modo de visibilidad (prefs.js)
    const X = sx(o.px), Y = sy(o.py);
    if (offscreen(X, Y)) { away.push(o); continue; }
    sprites.push({ y: o.py + .44, fn: () => {   // sobre lo demás de su casilla
      const moving = Math.abs(o.x - o.px) + Math.abs(o.y - o.py) > .03, a = o.online === false ? .5 : 1;
      shadow(X, Y + TS * .4, TS * .34);
      if (o.pet && o.biome !== 'WATER' && o.status !== 'dungeon') petSprite(o.pet, X, Y, TS, t, 1, a, o.cos && o.cos.acc);
      const om = o.mount && o.biome !== 'WATER' && o.status === 'map' ? o.mount : null, oup = om ? mountSprite(om, X, Y, TS, t, false, moving, a) : 0;
      heroSprite(X, Y - (om ? oup : moving ? Math.abs(Math.sin(t / 70)) * 4 : 0), o.biome === 'WATER' ? '⛵' : (o.leaderEmoji || '🙂'), TS * (om ? .78 : .95), mateColor(o.name), t, false, a,
        statusIcon(o.status) + o.name + (o.online === false ? ' 📴' : ''), '#0b0e18', o.cos || null);
      titleTag(o.title, X, Y + TS * .62, a);
    } });
  }
  // Tumba 🪦 propia (con brillo y "Tus objetos") y las de los compañeros ("🪦 de Nombre", no se pueden recoger)
  const tombs = [];
  if (G.tomb) tombs.push({ x: G.tomb.x, y: G.tomb.y, own: true });
  for (const o of net.others.values()) if (Array.isArray(o.tomb) && mateOnMap(o)) tombs.push({ x: o.tomb[0], y: o.tomb[1], name: o.name });
  for (const tb of tombs) {
    if (tb.x < x0 || tb.x > x1 || tb.y < y0 || tb.y > y1) continue;
    sprites.push({ y: tb.y, fn: () => {
      const X = sx(tb.x), Y = sy(tb.y), r = TS * (.75 + .1 * Math.sin(t / 350));
      const gr = ctx.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, tb.own ? 'rgba(255,60,60,.5)' : 'rgba(180,180,200,.35)'); gr.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fill();
      shadow(X, Y + TS * .32, TS * .3); emoji('🪦', X, Y, TS * .85);
      label(tb.own ? 'Tus objetos' : '🪦 de ' + tb.name, X, Y - TS * .62, 11, tb.own ? '#ffb3b3' : '#d8dbe8');
    } });
  }
  // Jugador propio
  sprites.push({ y: P.py + .45, fn: () => {    // sobre lo demás de su casilla
    const X = sx(P.px), Y = sy(P.py); const moving = Math.abs(P.x - P.px) + Math.abs(P.y - P.py) > .03;
    const bob = onWater ? Math.sin(t / 400) * 2 : -(moving ? Math.abs(Math.sin(t / 70)) * 4 : 0);
    { const pt = activePet(); if (pt && !onWater) petSprite(PETS[pt.k].e, X, Y, TS, t, P.face > 0 ? 1 : -1, 1, cosPublic().acc); }
    shadow(X, Y + TS * .4, TS * .36);
    // 18% más grande que un monstruo normal (TS*.82), anillo dorado con pulso y nombre en dorado
    const me = !onWater && mountEmoji(), up = me ? mountSprite(me, X, Y, TS, t, P.face > 0, moving, 1) : 0;
    heroSprite(X, Y + (me ? -up : bob), onWater ? '⛵' : leader().e, TS * (me ? .8 : .97), '#f2c14e', t, P.face > 0 && !onWater, 1, st.name || 'Tú', '#241a00', cosPublic());
    titleTag(G.title, X, Y + TS * .62, 1);
  } });
  sprites.sort((a, b) => a.y - b.y).forEach(s => s.fn());
  // ---- Día y noche (Versión 3 · Fase 3)
  const dk = darkness(), tw = twilight();
  if (tw > 0) { ctx.fillStyle = `rgba(255,120,50,${.13 * tw})`; ctx.fillRect(0, 0, W, H); }
  if (dk > 0) {
    const lm = (1 + .15 * cityLvl('muralla')) * (elix('vela') ? 1.4 : 1), X = sx(P.px), Y = sy(P.py), g = ctx.createRadialGradient(X, Y, TS * 2.2 * lm, X, Y, TS * 5.5 * lm);
    g.addColorStop(0, 'rgba(6,8,30,0)'); g.addColorStop(1, `rgba(6,8,30,${.8 * dk})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const f of litVillages) { const vx = sx(f.x), vy = sy(f.y), r = TS * (f.start ? 3.4 : 2.3), lg = ctx.createRadialGradient(vx, vy, 0, vx, vy, r);
      lg.addColorStop(0, `rgba(255,190,90,${.42 * dk})`); lg.addColorStop(1, 'rgba(255,190,90,0)'); ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(vx, vy, r, 0, 7); ctx.fill(); }
    ctx.restore();
    for (const f of litVillages) { const vx = sx(f.x), vy = sy(f.y); emoji('🏮', vx + TS * (f.start ? .95 : .7), vy + TS * .15 + Math.sin(t / 500 + f.x) * 1.5, TS * .42); if (f.start) emoji('🏮', vx - TS * .95, vy + TS * .15 + Math.sin(t / 520) * 1.5, TS * .42); }
  }
  // Globos del chat y de los mensajes rápidos (encima de todo). 🔕 Silenciar los oculta; los de los demás
  // solo se ven en el modo 👁️ "Mostrar todo". El texto se dibuja con fillText (nunca como HTML).
  if (net.myBubble && !chatMuted()) bubble(net.myBubble.text, sx(P.px), sy(P.py) - TS * 1.25);
  if (othersBubbles()) for (const o of net.others.values()) if (o.bubble && visibleOther(o) && mateOnMap(o) && !away.includes(o)) bubble(o.bubble.text, sx(o.px), sy(o.py) - TS * 1.25);
  if (!vign) { vign = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75); vign.addColorStop(0, 'rgba(0,0,0,0)'); vign.addColorStop(1, 'rgba(0,0,0,.5)'); }
  ctx.fillStyle = vign; ctx.fillRect(0, 0, W, H);
  // Indicadores fuera de pantalla: primero Ciudad Origen (dorado), luego la misión y los compañeros (su color)
  refreshHud(t);
  const placed = [], vx = sx(START.x), vy = sy(START.y);
  if (offscreen(vx, vy)) edgeArrow(vx, vy, '🏰', `Ciudad Origen · ${Math.round(Math.hypot(START.x - P.x, START.y - P.y))} c`, '#f2c14e', '#ffe6a0', 1, placed);
  // Mapas del tesoro (cofres marcados) y mercader ambulante 🐪
  for (const m of G.tmaps || []) { const mx = sx(m.x), my = sy(m.y); if (offscreen(mx, my)) edgeArrow(mx, my, '💰', `Tesoro · ${Math.round(Math.hypot(m.x - P.x, m.y - P.y))} c`, '#ffd34d', '#fff2b3', 1, placed); else { emoji('❌', mx, my + TS * .1, TS * .7); emoji('💰', mx, my - TS * .55 - Math.abs(Math.sin(t / 300)) * 4, TS * .55); } }
  { const mv = merchVillage(); if (mv) { const mx = sx(mv.x), my = sy(mv.y); if (offscreen(mx, my)) edgeArrow(mx, my, '🐪', `Mercader · ${Math.round(Math.hypot(mv.x - P.x, mv.y - P.y))} c`, '#e0a96d', '#ffe2c2', .9, placed); else emoji('🐪', mx + TS * .75, my - TS * .45, TS * .6); } }
  // Jefe de mundo (naranja, siempre que esté vivo)
  if (wbAlive()) { const q = wbPos(); if (q) { const wx = sx(q.x), wy = sy(q.y); if (offscreen(wx, wy)) edgeArrow(wx, wy, '🌋', `Titán · ${Math.round(Math.hypot(q.x - P.x, q.y - P.y))} c`, '#ff5a1f', '#ffd0b0', 1, placed); } }
  // Aldea más cercana (gris)
  { const v = nearestVillage(P.x, P.y); if (v) { const ax = sx(v.x), ay = sy(v.y); if (offscreen(ax, ay)) edgeArrow(ax, ay, '🏘️', `${v.name} · ${Math.round(Math.hypot(v.x - P.x, v.y - P.y))} c`, '#9aa3b5', '#e2e6ef', 1, placed); } }
  // Tumba (roja): distancia y minutos que quedan
  if (G.tomb) { const tx = sx(G.tomb.x), ty = sy(G.tomb.y); if (offscreen(tx, ty)) edgeArrow(tx, ty, '🪦', `${Math.round(Math.hypot(G.tomb.x - P.x, G.tomb.y - P.y))} c · ${tombMinutes()} min`, '#ff4040', '#ffc2c2', 1, placed); }
  // Invitación a un jefe en equipo (📣)
  for (const v of net.invites.values()) { if (v.until < Date.now()) continue; const ix = sx(v.boss.x), iy = sy(v.boss.y); if (offscreen(ix, iy)) edgeArrow(ix, iy, '📣', `${v.host} · ${Math.round(Math.hypot(v.boss.x - P.x, v.boss.y - P.y))} c`, '#a78bfa', '#e9ddff', 1, placed); }
  // Misión seguida (morado)
  if (tq && tq.target) { const qx = sx(tq.target.x), qy = sy(tq.target.y); if (offscreen(qx, qy)) edgeArrow(qx, qy, QICON[tq.type], `Misión · ${Math.round(Math.hypot(tq.target.x - P.x, tq.target.y - P.y))} c`, '#c084fc', '#ead5ff', 1, placed); }
  for (const o of away) edgeArrow(sx(o.px), sy(o.py), o.leaderEmoji || '🙂', `${o.name} · ${Math.round(Math.hypot(o.x - P.x, o.y - P.y))} c`, mateColor(o.name), '#ffffff', o.online === false ? .5 : 1, placed);
}
