// Mapas (Versión 2 · Fase 2): el mapa grande (🗺️) y el mini-minimapa siempre visible usan el mismo dibujo.
// Se dibuja a la resolución real de la pantalla (nítido en celulares con DPR 2) y el texto se mide en px de pantalla.
'use strict';
import { EF } from './util.js';
import { CH, RGB, BLOCKO } from './data.js';
import { G, P, START } from './state.js';
import { feats, monsters, getChunk, ckey, nearestVillage } from './world.js';
import { net, mateColor } from './net.js';
import { tracked } from './quests.js';

const offs = new Map();   // canvas pequeños reutilizables para el terreno (1 píxel = 1 casilla)
const rel = (x, y) => `${x - START.x}, ${START.y - y}`;

// c: <canvas>; R: radio en casillas; opts.labels: nombres y coordenadas de compañeros; opts.full: mapa grande
export function paintMap(c, R, opts = {}) {
  if (!c || !G.visited) return;
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
    if (f.type !== 'village' || f.start || !vis(f.x, f.y)) continue;
    const p = to(f.x, f.y); if (!inside(p)) continue;
    if (near && f.id === near.id) { const s = 5 * u; g.fillStyle = '#ffd84d'; g.fillRect(p[0] - s, p[1] - s, s * 2, s * 2); g.lineWidth = 2 * u; g.strokeStyle = '#fff'; g.strokeRect(p[0] - s, p[1] - s, s * 2, s * 2); if (opts.labels) text(f.name, [p[0], p[1] - 11 * u], 10 * u, '#ffe6a0'); }
    else { const s = 3 * u; g.fillStyle = 'rgba(242,193,78,.55)'; g.fillRect(p[0] - s, p[1] - s, s * 2, s * 2); }
  }
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
  // ---- Ciudad Origen: castillo dorado (siempre visible; en el borde indica la dirección)
  { const p0 = to(START.x, START.y), p = clampP(p0, 11 * u);
    dot(p, 9 * u, '#f2c14e'); glyph('🏰', p, 12 * u); if (!inside(p0, 11 * u)) edgeTri(p, p0, '#f2c14e'); }
  // ---- Compañeros: punto de su color, nombre y coordenadas (aunque estén fuera de lo explorado)
  for (const o of net.others.values()) {
    if (!o.status || o.status === 'lobby' || o.status === 'away' || !Number.isFinite(o.x)) continue;
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
