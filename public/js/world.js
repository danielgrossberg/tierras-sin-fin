// Mundo procedural infinito por chunks. Todo es determinista a partir de la semilla
// (que sale del código de sala), así que cada jugador genera el mismo mundo en su celular.
'use strict';
import { hash, hashI, mulberry, fbm, pick } from './util.js';
import { CH, B, blockT, EN, POOL, BOSS, SYL1, SYL2, VSUF, RESPAWN } from './data.js';
import { st, G, P, START } from './state.js';

export const chunks = new Map(), feats = new Map(), monsters = new Map(), mpos = new Map();
export function resetWorld() { chunks.clear(); feats.clear(); monsters.clear(); mpos.clear(); }

// ================= Generación de casillas =================
export function genTile(x, y) {
  const seed = st.seed, d = Math.hypot(x, y);
  const e = fbm(x / 38, y / 38, seed, 5) + Math.max(0, .1 - d / 500);
  const m = fbm(x / 55 + 100, y / 55, seed + 7, 3), t = fbm(x / 90, y / 90 + 50, seed + 13, 3);
  const r = hash(x, y, seed + 3);
  let b, o = null;
  if (e < .38) b = 'WATER';
  else if (e < .415) b = 'SAND';
  else if (e > .69) b = 'MOUNT';
  else if (d > 170 && fbm(x / 70, y / 70, seed + 21, 2) > .56 - Math.min(.12, (d - 170) / 1500)) b = 'ASH';
  else if (t < .38) b = 'SNOW';
  else if (t > .6 && m < .48) b = 'DESERT';
  else if (m > .6 && t > .44) b = 'SWAMP';
  else if (m > .52) b = 'FOREST';
  else b = 'GRASS';
  switch (b) {
    case 'GRASS': o = r < .035 ? 'tree' : r < .10 ? 'flower' : null; break;
    case 'FOREST': o = r < .30 ? 'tree' : r < .34 ? 'flower' : null; break;
    case 'SNOW': o = r < .11 ? 'pine' : r < .13 ? 'rock' : null; break;
    case 'DESERT': o = r < .03 ? 'cactus' : r < .05 ? 'rock' : null; break;
    case 'SWAMP': o = r < .07 ? 'deadtree' : r < .17 ? 'reed' : null; break;
    case 'ASH': o = r < .05 ? 'rock' : r < .09 ? 'bones' : null; break;
    case 'SAND': o = r < .03 ? 'shell' : null; break;
  }
  return { b, o };
}
export const ckey = (cx, cy) => cx + ',' + cy;
export function getChunk(cx, cy) { const c = chunks.get(ckey(cx, cy)); return c || makeChunk(cx, cy); }
export function tileAt(x, y) { const cx = Math.floor(x / CH), cy = Math.floor(y / CH); return getChunk(cx, cy).tiles[(y - cy * CH) * CH + (x - cx * CH)]; }
export function biomeAt(x, y) {
  const c = chunks.get(ckey(Math.floor(x / CH), Math.floor(y / CH)));
  if (c) return c.tiles[(y - c.cy * CH) * CH + (x - c.cx * CH)].b;
  return genTile(x, y).b;
}
export const isBlocked = (x, y) => blockT(tileAt(x, y));
// El jugador con bote puede navegar por el mar (las montañas siguen bloqueadas)
export function playerBlocked(x, y) { const t = tileAt(x, y); return t.b === 'WATER' ? !G.boat : blockT(t); }
// Aldea costera: hay mar a 3 casillas o menos
export function isCoastal(f) { for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (tileAt(f.x + i, f.y + j).b === 'WATER') return true; return false; }
export function vName(r) { return pick(SYL1, r) + pick(SYL2, r) + (r() < .3 ? ' ' + pick(VSUF, r) : ''); }
export function addFeat(type, x, y, extra) { const f = Object.assign({ type, x, y, id: type + '@' + x + ',' + y }, extra || {}); feats.set(x + ',' + y, f); return f; }
export function dangerAt(x, y) { return Math.max(1, Math.floor(1 + Math.hypot(x - START.x, y - START.y) / 14)); }

// ================= Chunks: aldeas, cofres, santuarios y monstruos =================
function makeChunk(cx, cy) {
  const seed = st.seed;
  const c = { cx, cy, tiles: new Array(CH * CH), spawns: [], can: null };
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) c.tiles[j * CH + i] = genTile(cx * CH + i, cy * CH + j);
  chunks.set(ckey(cx, cy), c);
  const r = mulberry(hashI(cx, cy, seed + 777));
  const free = () => {
    for (let k = 0; k < 24; k++) {
      const i = Math.floor(r() * CH), j = Math.floor(r() * CH), t = c.tiles[j * CH + i], x = cx * CH + i, y = cy * CH + j;
      if (!blockT(t) && !feats.has(x + ',' + y) && !(x === START.x && y === START.y)) return { x, y, t };
    }
    return null;
  };
  const inStart = Math.floor(START.x / CH) === cx && Math.floor(START.y / CH) === cy;
  if (inStart) addFeat('village', START.x, START.y, { name: 'Villa Origen', start: 1 });
  else if (r() < .075) { const p = free(); if (p) addFeat('village', p.x, p.y, { name: vName(r) }); }
  let nc = r() < .38 ? 1 : 0; if (r() < .12) nc++;
  for (let k = 0; k < nc; k++) { const p = free(); if (p) addFeat('chest', p.x, p.y); }
  if (r() < .045) { const p = free(); if (p) addFeat('shrine', p.x, p.y); }
  // Monstruos
  const nm = Math.floor(r() * 3) + (Math.hypot(cx * CH - START.x, cy * CH - START.y) > 45 ? 1 : 0);
  for (let k = 0; k < nm; k++) {
    const p = free(); if (!p) continue;
    const d = Math.hypot(p.x - START.x, p.y - START.y); if (d < 8) continue;
    const lvl = Math.max(1, Math.floor(1 + d / 14 + r() * 1.5));
    const pool = POOL[p.t.b] || POOL.GRASS; const ok = pool.filter(k => (EN[k].min || 1) <= lvl); const pl = ok.length ? ok : [pool[0]];
    const n = 1 + Math.floor(r() * (lvl >= 4 ? 3 : 2)) + (lvl >= 10 && r() < .4 ? 1 : 0);
    const group = []; for (let q = 0; q < n; q++) group.push(pick(pl, r));
    c.spawns.push({ id: 'm@' + p.x + ',' + p.y, x: p.x, y: p.y, biome: p.t.b, lvl, group, boss: false });
  }
  // Jefes (con corona)
  const cd = Math.hypot(cx * CH - START.x, cy * CH - START.y);
  if (cd > 55 && r() < .04) {
    const p = free();
    if (p) {
      const lvl = Math.max(3, Math.floor(1 + Math.hypot(p.x - START.x, p.y - START.y) / 14)) + 1;
      const pool = POOL[p.t.b] || POOL.GRASS; const group = [BOSS[p.t.b] || 'ogro']; const mn = Math.floor(r() * 3);
      for (let q = 0; q < mn; q++) group.push(pick(pool, r));
      c.spawns.push({ id: 'b@' + p.x + ',' + p.y, x: p.x, y: p.y, biome: p.t.b, lvl, group, boss: true });
    }
  }
  // Lugares creados por misiones (Fase C) que no existían en el mundo: se guardan en G.extraFeats
  if (G.extraFeats) for (const f of G.extraFeats) {
    if (Math.floor(f.x / CH) === cx && Math.floor(f.y / CH) === cy && !feats.has(f.x + ',' + f.y)) addFeat(f.type, f.x, f.y, f.name ? { name: f.name } : null);
  }
  return c;
}
// Los monstruos son individuales por jugador en la Etapa 1 (G.defeated es local)
function spawnChunk(c) {
  for (const s of c.spawns) {
    if (monsters.has(s.id)) continue;
    const dt = G.defeated[s.id];
    if (dt !== undefined) { if (s.boss || G.steps - dt < RESPAWN) continue; delete G.defeated[s.id]; }
    const k = s.x + ',' + s.y; if (mpos.has(k) || (s.x === P.x && s.y === P.y)) continue;
    const m = Object.assign({}, s, { hx: s.x, hy: s.y, px: s.x, py: s.y, stun: 0 });
    monsters.set(m.id, m); mpos.set(k, m);
  }
}
export function spawnNearby() { const pcx = Math.floor(P.x / CH), pcy = Math.floor(P.y / CH); for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) spawnChunk(getChunk(pcx + i, pcy + j)); }
export function visitAround() { const pcx = Math.floor(P.x / CH), pcy = Math.floor(P.y / CH); for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) G.visited[ckey(pcx + i, pcy + j)] = 1; }
export function findStart() {
  for (let pass = 0; pass < 2; pass++) for (let rad = 0; rad < 160; rad++) for (let i = -rad; i <= rad; i++) for (let j = -rad; j <= rad; j++) {
    if (Math.max(Math.abs(i), Math.abs(j)) !== rad) continue; const t = genTile(i, j);
    if ((pass === 1 || t.b === 'GRASS') && !blockT(t) && !t.o) {
      let ok = 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!blockT(genTile(i + a, j + b))) ok++;
      if (ok >= 3) return { x: i, y: j };
    }
  }
  return { x: 0, y: 0 };
}

// ================= Movimiento de monstruos =================
export const inVillage = () => feats.get(P.x + ',' + P.y)?.type === 'village';
function canMonsterGo(x, y) { if (isBlocked(x, y) || mpos.has(x + ',' + y)) return false; const f = feats.get(x + ',' + y); return !(f && f.type === 'village'); }
export function moveMonsters() {
  let hit = null; const safe = inVillage();
  for (const m of monsters.values()) {
    if (Math.abs(m.x - P.x) > 22 || Math.abs(m.y - P.y) > 22) continue;
    if (m.stun > 0) { m.stun--; continue; }
    if (m.boss) continue;
    const dx = P.x - m.x, dy = P.y - m.y, md = Math.abs(dx) + Math.abs(dy);
    let opts = [];
    if (md <= 6 && !safe && Math.random() < .7) { const ax = [Math.sign(dx), 0], ay = [0, Math.sign(dy)]; opts = Math.abs(dx) >= Math.abs(dy) ? [ax, ay] : [ay, ax]; opts = opts.filter(o => o[0] || o[1]); }
    else if (Math.random() < .3) { const d = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]); if (Math.abs(m.x + d[0] - m.hx) <= 5 && Math.abs(m.y + d[1] - m.hy) <= 5) opts = [d]; }
    for (const [sx, sy] of opts) {
      const nx = m.x + sx, ny = m.y + sy;
      if (nx === P.x && ny === P.y) { if (!safe && !hit) hit = m; break; }
      if (canMonsterGo(nx, ny)) { mpos.delete(m.x + ',' + m.y); m.x = nx; m.y = ny; mpos.set(nx + ',' + ny, m); break; }
    }
  }
  return hit;
}
