// Dibujo del mapa en Canvas 2D: chunks cacheados, sprites, otros jugadores, pines y flechas.
'use strict';
import { $, hash, shade, EF } from './util.js';
import { TILE, CH, B, EN } from './data.js';
import { G, P, START, st, leader } from './state.js';
import { getChunk, biomeAt, feats, monsters } from './world.js';
import { net } from './net.js';

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
function emoji(t, x, y, size, alpha) { ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.font = `${Math.round(size)}px ${EF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y); ctx.globalAlpha = 1; }
function shadow(x, y, w) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x, y, w, w * .35, 0, 0, 7); ctx.fill(); }
function label(txt, x, y, size, col) {
  ctx.font = `bold ${Math.round(size)}px system-ui,sans-serif,${EF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = '#000b'; ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y);
}
function rrect(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
// Globo de diálogo sobre un personaje
function bubble(txt, x, y) {
  const fs = 14; ctx.font = `600 ${fs}px system-ui,sans-serif,${EF}`;
  const w = Math.min(W - 16, ctx.measureText(txt).width + 18), h = fs + 14;
  const bx = Math.max(8, Math.min(W - 8 - w, x - w / 2)), by = y - h;
  ctx.fillStyle = 'rgba(255,255,255,.95)'; rrect(bx, by, w, h, 9); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 6, by + h - 1); ctx.lineTo(x + 6, by + h - 1); ctx.lineTo(x, by + h + 7); ctx.fill();
  ctx.fillStyle = '#1a1f36'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + w / 2, by + h / 2 + 1);
}
const statusIcon = s => s === 'battle' ? '⚔️ ' : s === 'village' ? '🏘️ ' : '';
const visibleOther = o => o.status && o.status !== 'lobby' && Number.isFinite(o.px);

// Rectángulos del HUD (se leen del DOM cada medio segundo, no en cada frame)
let hudRects = [], hudT = 0;
function refreshHud(t) {
  if (t - hudT < 500) return; hudT = t;
  hudRects = ['#hud', '#info', '#plist', '#dock', '#dpad', '#social'].map(s => document.querySelector(s)).filter(Boolean)
    .map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
}
const hitsBox = (x0, y0, x1, y1) => hudRects.some(r => x1 > r.left && x0 < r.right && y1 > r.top && y0 < r.bottom);
const hitsHud = (x, y) => hitsBox(x - 26, y - 30, x + 26, y + 30);

// Flecha en el borde de la pantalla apuntando a algo fuera de vista (amigo o Villa Origen).
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
  const free = (x, y) => x >= L && x <= R && y >= T && y <= Bt && !hitsHud(x, y) && !labelHits(x, y) && !placed.some(p => Math.abs(p.x - x) < 150 && Math.abs(p.y - y) < 64); // 150: ancho del texto
  search: for (let depth = 0; depth <= Math.max(W, H) / 2; depth += 24) {
    for (let k = 0; k <= 40; k++) for (const sg of k ? [1, -1] : [1]) {
      const x = ax + along[0] * sg * k * 8 + inward[0] * depth, y = ay + along[1] * sg * k * 8 + inward[1] * depth;
      if (free(x, y)) { ax = x; ay = y; break search; }
    }
  }
  placed.push({ x: ax, y: ay });
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
export function draw(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0b0e18'; ctx.fillRect(0, 0, W, H);
  const TS = TILE * Z, CS = CH * TS;
  const camX = Math.round(P.px * TS + TS / 2 - W / 2), camY = Math.round(P.py * TS + TS / 2 - H / 2);
  const cx0 = Math.floor(camX / CS), cy0 = Math.floor(camY / CS), cx1 = Math.floor((camX + W) / CS), cy1 = Math.floor((camY + H) / CS);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const c = getChunk(cx, cy); if (!c.can) renderChunk(c); ctx.drawImage(c.can, Math.round(cx * CS - camX), Math.round(cy * CS - camY), Math.ceil(CS), Math.ceil(CS)); }
  const x0 = Math.floor(camX / TS) - 1, y0 = Math.floor(camY / TS) - 1, x1 = Math.ceil((camX + W) / TS) + 1, y1 = Math.ceil((camY + H) / TS) + 1;
  const sx = x => x * TS - camX + TS / 2, sy = y => y * TS - camY + TS / 2;
  const sprites = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const f = feats.get(x + ',' + y); if (!f) continue;
    if (f.type === 'village') sprites.push({ y, fn: () => {
      shadow(sx(x), sy(y) + TS * .38, TS * .55); emoji('🏘️', sx(x), sy(y), TS * 1.25);
      ctx.font = `bold ${Math.max(11, Math.round(TS * .3))}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#000a'; ctx.strokeText(f.name, sx(x), sy(y) - TS * .8); ctx.fillStyle = '#ffe6a0'; ctx.fillText(f.name, sx(x), sy(y) - TS * .8);
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
        shadow(X, Y + TS * .35, TS * .32); emoji(e, X, Y - Math.abs(Math.sin(t / 260 + m.hx)) * 3, TS * .82, m.stun > 0 ? .45 : 1);
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
  // Otros jugadores
  const away = [];
  for (const o of net.others.values()) {
    if (!visibleOther(o)) continue;
    const X = sx(o.px), Y = sy(o.py);
    if (offscreen(X, Y)) { away.push(o); continue; }
    sprites.push({ y: o.py, fn: () => {
      const moving = Math.abs(o.x - o.px) + Math.abs(o.y - o.py) > .03, a = o.online === false ? .45 : 1;
      shadow(X, Y + TS * .38, TS * .34);
      ctx.fillStyle = 'rgba(127,224,255,.22)'; ctx.beginPath(); ctx.ellipse(X, Y + TS * .38, TS * .42, TS * .15, 0, 0, 7); ctx.fill();
      emoji(o.leaderEmoji || '🙂', X, Y - (moving ? Math.abs(Math.sin(t / 70)) * 4 : 0), TS * .9, a);
      ctx.globalAlpha = a; label(statusIcon(o.status) + o.name, X, Y - TS * .72, 12, '#7fe0ff'); ctx.globalAlpha = 1;
    } });
  }
  // Jugador propio
  sprites.push({ y: P.py + .01, fn: () => {
    const X = sx(P.px), Y = sy(P.py); const moving = Math.abs(P.x - P.px) + Math.abs(P.y - P.py) > .03;
    shadow(X, Y + TS * .38, TS * .34); ctx.save(); ctx.translate(X, Y - (moving ? Math.abs(Math.sin(t / 70)) * 4 : 0)); if (P.face > 0) ctx.scale(-1, 1); emoji(leader().e, 0, 0, TS * .9); ctx.restore();
  } });
  sprites.sort((a, b) => a.y - b.y).forEach(s => s.fn());
  // Globos de mensajes rápidos (encima de todo)
  if (net.myBubble) bubble(net.myBubble.text, sx(P.px), sy(P.py) - TS * .6);
  for (const o of net.others.values()) if (o.bubble && visibleOther(o) && !away.includes(o)) bubble(o.bubble.text, sx(o.px), sy(o.py) - TS * 1);
  if (!vign) { vign = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75); vign.addColorStop(0, 'rgba(0,0,0,0)'); vign.addColorStop(1, 'rgba(0,0,0,.5)'); }
  ctx.fillStyle = vign; ctx.fillRect(0, 0, W, H);
  // Indicadores fuera de pantalla: primero Villa Origen (dorado), luego los amigos (celeste)
  refreshHud(t);
  const placed = [], vx = sx(START.x), vy = sy(START.y);
  if (offscreen(vx, vy)) edgeArrow(vx, vy, '🏘️', `Villa Origen · ${Math.round(Math.hypot(START.x - P.x, START.y - P.y))} c`, '#f2c14e', '#ffe6a0', 1, placed);
  for (const o of away) edgeArrow(sx(o.px), sy(o.py), o.leaderEmoji || '🙂', `${o.name} · ${Math.round(Math.hypot(o.x - P.x, o.y - P.y))} c`, '#7fe0ff', '#bff0ff', o.online === false ? .5 : 1, placed);
}
