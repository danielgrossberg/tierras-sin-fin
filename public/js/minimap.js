// Mapas (Versión 2 · Fase 2): el mapa grande (🗺️) y el mini-minimapa siempre visible usan el mismo dibujo.
// Se dibuja a la resolución real de la pantalla (nítido en celulares con DPR 2) y el texto se mide en px de pantalla.
'use strict';
import { EF } from './util.js';
import { CH, RGB, BLOCKO } from './data.js';
import { G, P, START } from './state.js';
import { feats, monsters, getChunk, ckey, nearestVillage } from './world.js';
import { net, mateColor } from './net.js';
import { tracked } from './quests.js';
import { mateOnMini } from './prefs.js';
import { D, DW, DH, inDungeon, isSeen, isVisible, dunProg, caveDone, owlSees } from './dungeon.js';
import { activePet, owlRadius } from './pets.js';
import { CAVE } from './data.js';
import { wbAlive, wbPos } from './worldboss.js';
import { merchVillage } from './economy.js';

// Dentro de una mazmorra: el piso entero, solo lo recorrido (lo que ves ahora más claro)
function paintDungeon(c, opts) {
  const css = c.clientWidth || 120, dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.max(2, Math.ceil(css * dpr / DW)), W = DW * px, Hh = DH * px;
  if (c.width !== W || c.height !== W) { c.width = W; c.height = W; }
  const g = c.getContext('2d'), u = W / css, oy = Math.round((W - Hh) / 2), C = CAVE[D.cave.kind] || CAVE.cripta, fl = D.fl, pr = dunProg(D.cave.id);
  g.fillStyle = '#07060b'; g.fillRect(0, 0, W, W);
  for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
    if (!isSeen(x, y)) continue;
    const floor = fl.grid[y * DW + x] === 1;
    g.fillStyle = floor ? (isVisible(x, y) ? '#b9b2c4' : C.floor) : C.line;
    g.fillRect(x * px, oy + y * px, px, px);
  }
  const at = (p, r, fill) => { g.beginPath(); g.arc((p.x + .5) * px, oy + (p.y + .5) * px, r, 0, 7); g.fillStyle = fill; g.fill(); g.lineWidth = u; g.strokeStyle = '#000'; g.stroke(); };
  const glyph = (t, p, size) => { g.font = `${Math.round(size)}px ${EF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.fillText(t, (p.x + .5) * px, oy + (p.y + .5) * px); };
  const s = Math.max(7 * u, px * 1.6);
  for (const p of [fl.up, fl.down].filter(Boolean)) if (isSeen(p.x, p.y)) glyph('🪜', p, s);
  if (fl.exit && pr.done && isSeen(fl.exit.x, fl.exit.y)) glyph('🌀', fl.exit, s);
  for (const ch of fl.chests) if (!pr.ch[ch.id] && (isSeen(ch.x, ch.y) || owlSees(ch.x, ch.y))) glyph('📦', ch, s * .9);   // 🦉 el búho los revela
  for (const t of fl.traps) if ((D.trapSeen.get(t.id) || D.trapGone.has(t.id)) && isSeen(t.x, t.y)) glyph('⚠️', t, s * .8);
  for (const m of D.mons.values()) if (m.boss ? isSeen(m.x, m.y) : isVisible(m.x, m.y)) { if (m.boss) glyph('👑', m, s); else at(m, 2.5 * u, '#ff4d4d'); }
  at({ x: D.x, y: D.y }, 4 * u, '#fff');
  if (!opts.full) { g.lineWidth = 2 * u; g.strokeStyle = '#000a'; g.strokeRect(0, 0, W, W); }
}

const offs = new Map();   // canvas pequeños reutilizables para el terreno (1 píxel = 1 casilla)
const rel = (x, y) => `${x - START.x}, ${START.y - y}`;

// c: <canvas>; R: radio en casillas; opts.labels: nombres y coordenadas de compañeros; opts.full: mapa grande
export function paintMap(c, R, opts = {}) {
  if (!c || !G.visited) return;
  if (inDungeon()) { paintDungeon(c, opts); return; }
  const N = R * 2 + 1, css = c.clientWidth || 120, dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.max(2, Math.ceil(css * dpr / N)), W = N * px;
  if (c.width !== W) { c.width = W; c.height = W; }
  const g = c.getContext('2d'), u = W / css;           // u = píxeles internos por píxel de pantalla
  // ---- Terreno explorado
  let off = offs.get(N); if (!off) { off = document.createElement('canvas'); off.width = off.height = N; offs.set(N, off); }
  const og = off.getContext('2d'), img = og.createImageData(N, N), d = img.data;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = P.x - R + i, y = P.y - R + j, cx = Math.floor(x / CH), cy = Math.floor(y / CH), o = (j * N + i) * 4; let col = [14, 17, 30];
    if (G.visited[ckey(cx, cy)]) { const t = getChunk(cx, cy).tiles[(y - cy * CH) * CH + (x - cx * CH)]; col = RGB[t.b]; if (t.o && BLOCKO.has(t.o)) col = col.map(v => v * .72); }
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false; g.drawImage(off, 0, 0, W, W);
  // ---- Ayudas de posición
  const to = (x, y) => [(x - P.x + R + .5) * px, (y - P.y + R + .5) * px];
  const inside = (p, m = 0) => p[0] >= m && p[1] >= m && p[0] <= W - m && p[1] <= W - m;
  const clampP = (p, m) => [Math.max(m, Math.min(W - m, p[0])), Math.max(m, Math.min(W - m, p[1]))];
  const vis = (x, y) => G.visited[ckey(Math.floor(x / CH), Math.floor(y / CH))];
  const dot = (p, r, fill, stroke = '#000') => { g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.fillStyle = fill; g.fill(); g.lineWidth = Math.max(1, 1.5 * u); g.strokeStyle = stroke; g.stroke(); };
  const glyph = (t, p, size) => { g.font = `${Math.round(size)}px ${EF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.fillText(t, p[0], p[1]); };
  const text = (t, p, size, col, align = 'center') => { g.font = `bold ${Math.round(size)}px system-ui,sans-serif`; g.textAlign = align; g.textBaseline = 'middle'; g.lineWidth = 3 * u; g.strokeStyle = '#000'; g.strokeText(t, p[0], p[1]); g.fillStyle = col; g.fillText(t, p[0], p[1]); };
  // Flechita en el borde cuando el objetivo está fuera del recuadro
  const edgeTri = (p, target, col) => {
    const a = Math.atan2(target[1] - W / 2, target[0] - W / 2), s = 6 * u;
    g.save(); g.translate(p[0], p[1]); g.rotate(a); g.beginPath(); g.moveTo(s * 1.6, 0); g.lineTo(s * .4, -s); g.lineTo(s * .4, s); g.closePath();
    g.fillStyle = col; g.fill(); g.lineWidth = u; g.strokeStyle = '#000'; g.stroke(); g.restore();
  };
  const m = 9 * u;
  // ---- Aldeas: la más cercana resaltada; las demás más tenues
  const near = nearestVillage(P.x, P.y);
  for (const f of feats.values()) {
    if (f.type === 'shrine' && !G.opened[f.id] && vis(f.x, f.y)) { const p = to(f.x, f.y); if (inside(p)) dot(p, 2.2 * u, '#c27bff'); continue; }
    // Mazmorras: punto oscuro con 🕳️ (✅ si ya la completaste)
    if (f.type === 'cave' && vis(f.x, f.y)) { const p = to(f.x, f.y); if (inside(p)) { const done = caveDone(f.id); dot(p, 4.5 * u, done ? '#2f8f4e' : '#3a1f4d', done ? '#9fe8b0' : '#c084fc'); glyph(done ? '✅' : '🕳️', p, 7 * u); if (opts.labels) text(f.name, [p[0], p[1] - 10 * u], 9 * u, '#e9ddff'); } continue; }
    if (f.type !== 'village' || f.start || !vis(f.x, f.y)) continue;
    const p = to(f.x, f.y); if (!inside(p)) continue;
    if (near && f.id === near.id) { const s = 5 * u; g.fillStyle = '#ffd84d'; g.fillRect(p[0] - s, p[1] - s, s * 2, s * 2); g.lineWidth = 2 * u; g.strokeStyle = '#fff'; g.strokeRect(p[0] - s, p[1] - s, s * 2, s * 2); if (opts.labels) text(f.name, [p[0], p[1] - 11 * u], 10 * u, '#ffe6a0'); }
    else { const s = 3 * u; g.fillStyle = 'rgba(242,193,78,.55)'; g.fillRect(p[0] - s, p[1] - s, s * 2, s * 2); }
  }
  // ---- 🦉 Búho: cofres cercanos (aunque no los hayas visto)
  { const o = activePet(); if (o && o.k === 'buho') { const r = owlRadius(o); for (const f of feats.values()) if (f.type === 'chest' && !G.opened[f.id] && Math.hypot(f.x - P.x, f.y - P.y) <= r) { const p = to(f.x, f.y); if (inside(p)) glyph('📦', p, 8 * u); } } }
  // ---- Jefes conocidos (vistos en zonas exploradas o marcados por una misión)
  const bosses = new Map();
  for (const mo of monsters.values()) if (mo.boss && vis(mo.x, mo.y)) bosses.set(mo.id, mo);
  const tq = tracked();
  if (tq && tq.type === 'boss') bosses.set(tq.bossId, { x: tq.target.x, y: tq.target.y });
  for (const b of bosses.values()) { const p = to(b.x, b.y); if (!inside(p)) continue; dot(p, 5 * u, '#ff3b3b'); glyph('👑', [p[0], p[1] - 1 * u], 8 * u); }
  // ---- Marcas, misión y tumba
  const now = Date.now();
  for (const pin of net.pins.values()) if (pin.until > now) { const p = to(pin.x, pin.y); if (inside(p)) dot(p, 3.5 * u, '#ff5fa2'); }
  if (tq && tq.target) { const p0 = to(tq.target.x, tq.target.y), p = clampP(p0, m); dot(p, 4 * u, '#c084fc'); if (!inside(p0, m)) edgeTri(p, p0, '#c084fc'); }
  if (G.tomb) { const p0 = to(G.tomb.x, G.tomb.y), p = clampP(p0, m); dot(p, 7 * u, 'rgba(255,48,48,.85)'); glyph('🪦', p, 9 * u); if (!inside(p0, m)) edgeTri(p, p0, '#ff4040'); }
  // ---- Invitaciones a jefes en equipo (📣)
  for (const v of net.invites.values()) { if (v.until < now) continue; const p0 = to(v.boss.x, v.boss.y), p = clampP(p0, m); dot(p, 7 * u, '#7c3aed'); glyph('📣', p, 9 * u); if (!inside(p0, m)) edgeTri(p, p0, '#a78bfa'); }
  // ---- Tesoros 💰 y mercader 🐪
  for (const tm of G.tmaps || []) { const p0 = to(tm.x, tm.y), p = clampP(p0, m); dot(p, 5 * u, '#ffd34d'); glyph('💰', p, 8 * u); if (!inside(p0, m)) edgeTri(p, p0, '#ffd34d'); }
  { const mv = merchVillage(); if (mv) { const p0 = to(mv.x, mv.y); if (inside(p0)) glyph('🐪', [p0[0] + 6 * u, p0[1] - 6 * u], 9 * u); } }
  // ---- 🌋 Jefe de mundo (siempre visible; en el borde indica la dirección)
  if (wbAlive()) { const q = wbPos(); if (q) { const p0 = to(q.x, q.y), p = clampP(p0, 11 * u); dot(p, 8 * u, '#ff5a1f'); glyph('🌋', p, 11 * u); if (!inside(p0, 11 * u)) edgeTri(p, p0, '#ff5a1f'); if (opts.labels) text('Titán de Lava', [p[0], p[1] - 12 * u], 10 * u, '#ffd0b0'); } }
  // ---- Ciudad Origen: castillo dorado (siempre visible; en el borde indica la dirección)
  { const p0 = to(START.x, START.y), p = clampP(p0, 11 * u);
    dot(p, 9 * u, '#f2c14e'); glyph('🏰', p, 12 * u); if (!inside(p0, 11 * u)) edgeTri(p, p0, '#f2c14e'); }
  // ---- Compañeros: punto de su color, nombre y coordenadas (aunque estén fuera de lo explorado)
  for (const o of net.others.values()) {
    if (!o.status || o.status === 'lobby' || o.status === 'away' || !Number.isFinite(o.x)) continue;
    if (!mateOnMini(o)) continue;   // 👁️ "Ocultar todo"
    const col = mateColor(o.name), p0 = to(o.x, o.y), p = clampP(p0, m);
    g.globalAlpha = o.online === false ? .5 : 1;
    dot(p, 5 * u, col); if (!inside(p0, m)) edgeTri(p, p0, col);
    if (opts.labels) {
      const right = p[0] < W * .7, ty = Math.max(8 * u, Math.min(W - 8 * u, p[1]));
      text(`${o.name} ${rel(o.x, o.y)}`, [p[0] + (right ? 8 : -8) * u, ty], 10 * u, '#fff', right ? 'left' : 'right');
    }
    g.globalAlpha = 1;
  }
  // ---- Tú (centro)
  dot([W / 2, W / 2], 4.5 * u, '#fff');
  // Límite del área (mini)
  if (!opts.full) { g.lineWidth = 2 * u; g.strokeStyle = '#000a'; g.strokeRect(0, 0, W, W); }
}
export { rel as relCoords };
