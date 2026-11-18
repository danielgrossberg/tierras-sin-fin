// Mazmorras (Versión 3 · Fase 1).
// - Las entradas 🕳️ las crea world.js (deterministas por semilla). Este módulo genera los pisos (salas y pasillos,
//   también deterministas con la semilla de la entrada), maneja la visión limitada, los monstruos de cueva, las
//   trampas, los cofres, las escaleras, el jefe del último piso y el portal de salida.
// - Mientras estás adentro, P (tu posición en el mundo) se queda en la ENTRADA: así la tumba, las coordenadas y lo
//   que ven los demás jugadores siguen funcionando. La posición dentro del piso está en D.x / D.y.
// - Progreso guardado en la partida: G.dungeons[id] = { seen: {piso: bits}, ch: {cofre: 1}, boss, done, deep }
//   y G.inDun = { cave, f, x, y } para volver al mismo lugar al recargar.
'use strict';
import { mulberry, hashI, pick, esc } from './util.js';
import { EN, CAVE } from './data.js';
import { G, P, START, st, S, heroes, alive, avgLvl, talFx } from './state.js';
import { spawnNearby, visitAround } from './world.js';
import { startBattle } from './battle.js';
import { openModal, closeModal, openBossConfirm, toast, feed, updateHUD } from './ui.js';
import { save } from './storage.js';
import { rollLoot, addItem, itemLabel, RAR } from './items.js';
import { onDungeonDone } from './quests.js';
import { activePet, owlRadius, stepEggs } from './pets.js';
import { bump } from './achievements.js';
import { PETS } from './data.js';

export const DW = 40, DH = 30, VISION = 5;
const idx = (x, y) => y * DW + x;
const inb = (x, y) => x >= 0 && y >= 0 && x < DW && y < DH;

// ================= Generación de pisos =================
const floors = new Map();
export function floorOf(cave, f) {
  const key = cave.id + ':' + f; let fl = floors.get(key); if (fl) return fl;
  const r = mulberry(hashI(cave.x * 7 + f * 131, cave.y * 13 - f * 71, st.seed + 6100));
  const grid = new Uint8Array(DW * DH), rooms = [];   // 0 = muro · 1 = suelo
  const target = 6 + Math.floor(r() * 3) + f;
  for (let t = 0; t < 400 && rooms.length < target; t++) {
    const w = 4 + Math.floor(r() * 6), h = 4 + Math.floor(r() * 4);
    const x = 1 + Math.floor(r() * (DW - w - 2)), y = 1 + Math.floor(r() * (DH - h - 2));
    if (rooms.some(o => x < o.x + o.w + 1 && x + w + 1 > o.x && y < o.y + o.h + 1 && y + h + 1 > o.y)) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
  }
  for (const o of rooms) for (let j = o.y; j < o.y + o.h; j++) for (let i = o.x; i < o.x + o.w; i++) grid[idx(i, j)] = 1;
  // Pasillos: cada sala nueva se une a la más cercana ya conectada (árbol) + un pasillo extra para dar vueltas
  const carve = (a, b) => {
    let x = a.cx, y = a.cy; const hFirst = r() < .5;
    const sx = () => { while (x !== b.cx) { grid[idx(x, y)] = 1; x += Math.sign(b.cx - x); } };
    const sy = () => { while (y !== b.cy) { grid[idx(x, y)] = 1; y += Math.sign(b.cy - y); } };
    if (hFirst) { sx(); sy(); } else { sy(); sx(); } grid[idx(x, y)] = 1;
  };
  const conn = [rooms[0]], rest = rooms.slice(1);
  while (rest.length) {
    let bi = 0, bj = 0, bd = Infinity;
    rest.forEach((a, i) => conn.forEach((b, j) => { const d = Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy); if (d < bd) { bd = d; bi = i; bj = j; } }));
    carve(conn[bj], rest[bi]); conn.push(rest.splice(bi, 1)[0]);
  }
  if (rooms.length > 3) carve(rooms[1 + Math.floor(r() * (rooms.length - 1))], rooms[1 + Math.floor(r() * (rooms.length - 1))]);
  // Distancias desde la escalera de subida (la sala más lejana tiene la bajada o el jefe)
  const up = { x: rooms[0].cx, y: rooms[0].cy }, dist = new Int16Array(DW * DH).fill(-1), q = [idx(up.x, up.y)]; dist[q[0]] = 0;
  while (q.length) { const c = q.shift(), cx = c % DW, cy = (c / DW) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + a, ny = cy + b; if (inb(nx, ny) && grid[idx(nx, ny)] && dist[idx(nx, ny)] < 0) { dist[idx(nx, ny)] = dist[c] + 1; q.push(idx(nx, ny)); } } }
  const far = rooms.slice(1).reduce((a, b) => (dist[idx(b.cx, b.cy)] > dist[idx(a.cx, a.cy)] ? b : a), rooms[1] || rooms[0]);
  const last = f === cave.floors - 1, end = { x: far.cx, y: far.cy };
  const used = new Set([idx(up.x, up.y), idx(end.x, end.y)]);
  const inRoom = (x, y) => rooms.some(o => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);
  const spotIn = o => { for (let k = 0; k < 40; k++) { const x = o.x + Math.floor(r() * o.w), y = o.y + Math.floor(r() * o.h), i = idx(x, y); if (!used.has(i)) { used.add(i); return { x, y }; } } return null; };
  const others = rooms.filter(o => o !== rooms[0]);
  const C = CAVE[cave.kind] || CAVE.cripta, lvl = cave.lvl + f;
  // Cofres (1 o 2)
  const chests = []; for (let k = 0, n = 1 + (r() < .5 ? 1 : 0); k < n && others.length; k++) { const p = spotIn(pick(others, r)); if (p) chests.push({ id: f + ':c' + k, x: p.x, y: p.y }); }
  // Monstruos de cueva (el nivel sube 1 por piso)
  const pool = C.pool.filter(k => (EN[k].min || 1) <= lvl), spawns = [];
  for (let k = 0, n = 3 + f + Math.floor(r() * 2); k < n && others.length; k++) {
    const p = spotIn(pick(others, r)); if (!p) continue;
    const g = []; for (let m = 0, gn = 1 + Math.floor(r() * (lvl >= 4 ? 3 : 2)); m < gn; m++) g.push(pick(pool.length ? pool : C.pool, r));
    spawns.push({ id: cave.id + ':' + f + ':m' + k, x: p.x, y: p.y, lvl, group: g, boss: false });
  }
  // Trampas ocultas (en pasillos de preferencia)
  const corr = [], flo = [];
  for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) if (grid[idx(x, y)] && !used.has(idx(x, y)) && !(x >= rooms[0].x - 1 && x <= rooms[0].x + rooms[0].w && y >= rooms[0].y - 1 && y <= rooms[0].y + rooms[0].h)) (inRoom(x, y) ? flo : corr).push({ x, y });
  const traps = [];
  for (let k = 0, n = 2 + f; k < n; k++) {
    const list = corr.length && r() < .7 ? corr : flo; if (!list.length) break;
    const p = list.splice(Math.floor(r() * list.length), 1)[0]; used.add(idx(p.x, p.y));
    traps.push({ id: f + ':t' + k, x: p.x, y: p.y, type: r() < .5 ? 'spike' : 'gas' });
  }
  // Último piso: jefe en la sala más lejana (y el portal de salida aparece ahí al derrotarlo)
  let boss = null;
  if (last) {
    const g = [C.boss]; for (let m = 0, mn = 1 + Math.floor(r() * 2); m < mn; m++) g.push(pick(pool.length ? pool : C.pool, r));
    boss = { id: cave.id + ':boss', x: end.x, y: end.y, lvl: lvl + 1, group: g, boss: true };
  }
  fl = { key, f, grid, rooms, up, down: last ? null : end, exit: last ? end : null, chests, traps, spawns, boss, can: null, kind: cave.kind };
  floors.set(key, fl);
  return fl;
}

// ================= Estado mientras estás adentro =================
export const D = { on: false, cave: null, f: 0, x: 0, y: 0, px: 0, py: 0, face: 1, fl: null, seen: null, vis: new Set(),
  mons: new Map(), mpos: new Map(), dead: new Set(), trapSeen: new Map(), trapGone: new Set() };
export const inDungeon = () => D.on;
export function dunProg(id) {
  G.dungeons = G.dungeons || {};
  return G.dungeons[id] || (G.dungeons[id] = { seen: {}, ch: {}, boss: 0, done: 0, deep: 0 });
}
export const caveDone = id => !!(G.dungeons && G.dungeons[id] && G.dungeons[id].done);
// Lo que ven los demás en el panel: "Cripta de Valdor (piso 2)"
export const dunLabel = () => D.on ? `${D.cave.name} (piso ${D.f + 1})` : null;
export const caveOf = f => ({ id: f.id, x: f.x, y: f.y, name: f.name, kind: f.kind, lvl: f.lvl, floors: f.floors });

// Pisos vistos: bits en hexadecimal (300 caracteres por piso)
const enc = a => { let s = ''; for (let i = 0; i < a.length; i += 4) s += (a[i] | a[i + 1] << 1 | a[i + 2] << 2 | a[i + 3] << 3).toString(16); return s; };
const dec = s => { const a = new Uint8Array(DW * DH); if (typeof s === 'string') for (let k = 0; k < s.length && k * 4 < a.length; k++) { const v = parseInt(s[k], 16) || 0; for (let b = 0; b < 4; b++) if (v >> b & 1) a[k * 4 + b] = 1; } return a; };

export const walkable = (x, y) => inb(x, y) && D.fl && D.fl.grid[idx(x, y)] === 1;
// Visión: ~5 casillas alrededor, sin ver a través de los muros
function lineClear(x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy, x = x0, y = y0;
  while (!(x === x1 && y === y1)) {
    if (!(x === x0 && y === y0) && !walkable(x, y)) return false;
    const e2 = 2 * e; if (e2 >= dy) { e += dy; x += sx; } if (e2 <= dx) { e += dx; y += sy; }
  }
  return true;
}
const hasScout = () => heroes().some(h => h.cls === 'picaro' || h.cls === 'goblin');
function updateVision() {
  D.vis.clear();
  for (let j = -VISION; j <= VISION; j++) for (let i = -VISION; i <= VISION; i++) {
    const x = D.x + i, y = D.y + j; if (!inb(x, y) || i * i + j * j > VISION * VISION + 1) continue;
    if (lineClear(D.x, D.y, x, y)) { D.vis.add(idx(x, y)); D.seen[idx(x, y)] = 1; }
  }
  // Trampas: con Pícaro o Goblin en el grupo, 50% de detectarlas al verlas por primera vez
  for (const t of D.fl.traps) if (D.vis.has(idx(t.x, t.y)) && !D.trapSeen.has(t.id)) D.trapSeen.set(t.id, hasScout() && Math.random() < (heroes().some(h => talFx(h, 'trapDet')) ? .9 : .5));   // talento Trampero: 90%
  // Búho: revela las trampas cercanas (aunque no las veas todavía)
  const owl = activePet(); if (owl && owl.k === 'buho') { const r = owlRadius(owl); for (const t of D.fl.traps) if (Math.hypot(t.x - D.x, t.y - D.y) <= r) D.trapSeen.set(t.id, true); }
  dunProg(D.cave.id).seen[D.f] = enc(D.seen);
}
// Búho: cofres y trampas dentro de su radio (para el minimapa)
export function owlSees(x, y) { const o = activePet(); return !!(o && o.k === 'buho' && D.on && Math.hypot(x - D.x, y - D.y) <= owlRadius(o)); }
export const isVisible = (x, y) => D.vis.has(idx(x, y));
export const isSeen = (x, y) => !!(D.seen && D.seen[idx(x, y)]);

function placeMonsters() {
  D.mons.clear(); D.mpos.clear();
  const pr = dunProg(D.cave.id), list = [...D.fl.spawns];
  if (D.fl.boss && !pr.boss) list.push(D.fl.boss);
  for (const s of list) {
    if (D.dead.has(s.id) || (s.x === D.x && s.y === D.y)) continue;
    const m = Object.assign({}, s, { hx: s.x, hy: s.y, px: s.x, py: s.y, stun: 0 });
    D.mons.set(m.id, m); D.mpos.set(m.x + ',' + m.y, m);
  }
}
function loadFloor(f, pos) {
  D.f = f; D.fl = floorOf(D.cave, f);
  const p = pos || D.fl.up; D.x = D.px = p.x; D.y = D.py = p.y;
  const pr = dunProg(D.cave.id); D.seen = dec(pr.seen[f]); pr.deep = Math.max(pr.deep || 0, f + 1);
  placeMonsters(); updateVision(); keepPos();
}
const keepPos = () => { G.inDun = { cave: D.cave, f: D.f, x: D.x, y: D.y }; };

// Entrar (o volver a entrar al recargar con resume = true)
export function enterDungeon(cave, f = 0, pos = null, resume = false) {
  D.on = true; D.cave = cave; D.dead.clear(); D.trapSeen.clear(); D.trapGone.clear(); D.face = 1;
  loadFloor(Math.max(0, Math.min(cave.floors - 1, f | 0)), pos && walkable2(cave, f, pos) ? pos : null);
  save('now'); updateHUD();
  if (!resume) setTimeout(() => toast(`🕳️ ${esc(cave.name)}<br><span style="font-size:14px">Piso 1 de ${cave.floors} · ¡cuidado con las trampas!</span>`), 200);
}
const walkable2 = (cave, f, p) => { const fl = floorOf(cave, f); return inb(p.x, p.y) && fl.grid[idx(p.x, p.y)] === 1; };
// Salir (por la escalera, por el portal o al caer): vuelves a la entrada en el mundo
export function exitDungeon(msg) {
  if (!D.on) return;
  D.on = false; D.mons.clear(); D.mpos.clear(); D.vis.clear(); G.inDun = null;
  spawnNearby(); visitAround(); save('now'); updateHUD();
  if (msg) toast(msg);
}
// Al caer todo el grupo dentro: la tumba va en la entrada (afuera) y se sale de la mazmorra
export function leaveForDeath() { const spot = { x: D.cave.x, y: D.cave.y }; exitDungeon(); return spot; }

// ================= Combates =================
function fight(m) {
  updateVision();
  const luck = Math.min(1, Math.hypot(D.cave.x - START.x, D.cave.y - START.y) / 400 + .1);
  Object.assign(m, { biome: 'CAVE', dun: true, wx: D.cave.x, wy: D.cave.y, luck, onWin: () => monsterDown(m), onLose: leaveForDeath });
  if (m.boss) openBossConfirm(m, startBattle); else startBattle(m);
}
// Monstruo derrotado (lo llama battle.js). Devuelve líneas para la pantalla de victoria.
function monsterDown(m) {
  D.mons.delete(m.id); D.mpos.delete(m.x + ',' + m.y);
  if (!m.boss) { D.dead.add(m.id); return []; }   // los normales reaparecen la próxima vez que entres
  const pr = dunProg(D.cave.id); if (!pr.done) bump('dungeons'); pr.boss = 1; pr.done = 1;
  return [`✅ <b>¡Mazmorra completada!</b> Apareció un portal de salida 🌀`, ...onDungeonDone(D.cave.id)];
}
function moveMons() {
  let hit = null;
  for (const m of D.mons.values()) {
    if (m.stun > 0) { m.stun--; continue; }
    if (m.boss) continue;
    const dx = D.x - m.x, dy = D.y - m.y, md = Math.abs(dx) + Math.abs(dy);
    let opts = [];
    if (md <= VISION && isVisible(m.x, m.y) && Math.random() < .7) { const ax = [Math.sign(dx), 0], ay = [0, Math.sign(dy)]; opts = (Math.abs(dx) >= Math.abs(dy) ? [ax, ay] : [ay, ax]).filter(o => o[0] || o[1]); }
    else if (Math.random() < .25) { const d = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]); if (Math.abs(m.x + d[0] - m.hx) <= 4 && Math.abs(m.y + d[1] - m.hy) <= 4) opts = [d]; }
    for (const [sx, sy] of opts) {
      const nx = m.x + sx, ny = m.y + sy;
      if (nx === D.x && ny === D.y) { if (!hit) hit = m; break; }
      if (walkable(nx, ny) && !D.mpos.has(nx + ',' + ny) && !isStairs(nx, ny)) { D.mpos.delete(m.x + ',' + m.y); m.x = nx; m.y = ny; D.mpos.set(nx + ',' + ny, m); break; }
    }
  }
  return hit;
}
const same = (a, x, y) => a && a.x === x && a.y === y;
const isStairs = (x, y) => same(D.fl.up, x, y) || same(D.fl.down, x, y) || same(D.fl.exit, x, y);

// ================= Movimiento =================
const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
export function dungeonMove(dir) {
  const [dx, dy] = DIRS[dir]; if (dx) D.face = dx;
  const nx = D.x + dx, ny = D.y + dy;
  if (!walkable(nx, ny)) return;
  const m = D.mpos.get(nx + ',' + ny); if (m) { fight(m); return; }
  D.x = nx; D.y = ny; G.steps++;
  for (const p of stepEggs()) { toast(`🐣 ¡Nació tu mascota!<br><span style="font-size:15px">${PETS[p.k].e} ${PETS[p.k].n}</span>`); save('now'); }
  updateVision(); keepPos();
  const fl = D.fl, pr = dunProg(D.cave.id);
  if (same(fl.up, nx, ny)) stairsMenu('up');
  else if (same(fl.down, nx, ny)) stairsMenu('down');
  else if (same(fl.exit, nx, ny) && pr.done) stairsMenu('exit');
  const ch = fl.chests.find(c => same(c, nx, ny)); if (ch && !pr.ch[ch.id]) openChest(ch);
  const tr = fl.traps.find(t => same(t, nx, ny)); if (tr) stepTrap(tr);
  const hit = moveMons(); if (hit && !st.busy) fight(hit);
  if (G.steps % 15 === 0) save();
  updateHUD();
}
function openChest(c) {
  const ilvl = D.cave.lvl + D.f, luck = Math.min(1, Math.hypot(D.cave.x - START.x, D.cave.y - START.y) / 400);
  const it = rollLoot(ilvl, luck, 'comun', Math.random, 1);   // +1 nivel de rareza garantizado
  if (!addItem(it)) { toast('🎒 Inventario lleno: el cofre sigue aquí. Vende o tira algo y vuelve.'); return; }
  dunProg(D.cave.id).ch[c.id] = 1; bump('chests');
  const g = Math.round((15 + ilvl * 6) * (.8 + Math.random() * .4)); G.gold += g;
  toast(`📦 Cofre de mazmorra: ${itemLabel(it)}<br><span style="font-size:13px;color:${RAR[it.r].c}">${RAR[it.r].n} · Nv ${it.ilvl}</span> <span style="font-size:13px">· +${g} oro</span>`);
  save();
}
function stepTrap(t) {
  if (D.trapGone.has(t.id)) return;
  if (D.trapSeen.get(t.id)) { toast(t.type === 'spike' ? '🦶 Esquivas la trampa de púas' : '🦶 Esquivas la trampa de gas'); return; }
  D.trapGone.add(t.id);
  const hs = alive(heroes());
  if (t.type === 'spike') {
    for (const h of hs) h.hp = Math.max(1, h.hp - Math.max(1, Math.round(S(h, 'mhp') * .12)));
    toast('🔺 ¡Trampa de púas!<br><span style="font-size:13px">El grupo pierde 12% de vida</span>');
  } else {
    for (const h of hs) h.poison = Math.max(h.poison || 0, 3);
    toast('☁️ ¡Trampa de gas!<br><span style="font-size:13px">El grupo queda envenenado ☠️</span>');
  }
  updateHUD();
}

// ================= Ventanas =================
// Entrada en el mapa: nombre, nivel recomendado, pisos · 🕳️ Entrar / 🏃 Retirarse
export function openCaveMenu(f) {
  const cave = caveOf(f), C = CAVE[cave.kind] || CAVE.cripta, pr = (G.dungeons || {})[cave.id], al = avgLvl(), danger = cave.lvl - al >= 2;
  openModal(() => `<div class="bossc">
    <div class="bsprite emoji" style="font-size:72px">🕳️</div>
    <h2>${esc(cave.name)}</h2>
    <div class="blv"><span>${C.n}</span><span>Nivel recomendado <b>${cave.lvl}</b></span><span><b>${cave.floors}</b> pisos</span><span>Tu grupo <b>Nv ${al.toFixed(1)}</b></span></div>
    ${pr && pr.done ? '<div class="dundone">✅ Completada · los monstruos reaparecen para subir de nivel</div>' : pr && pr.deep ? `<p class="mut small">Llegaste hasta el piso ${pr.deep} de ${cave.floors}.</p>` : ''}
    ${danger ? '<div class="bwarn">⚠️ Muy peligrosa para tu nivel</div>' : ''}
    <p class="bnote">Adentro solo ves unas 5 casillas. Hay trampas ocultas${heroes().some(h => h.cls === 'picaro' || h.cls === 'goblin') ? ' (tu Pícaro/Goblin puede detectarlas)' : ''}, cofres con mejor equipo y un jefe en el último piso. Si cae tu grupo, la tumba 🪦 queda en esta entrada.</p>
    <div class="bbtns"><button class="btn gold big" data-a="enter">🕳️ Entrar</button><button class="btn big" data-a="no">🏃 Retirarse</button></div></div>`,
  a => { if (a === 'enter') { closeModal(); enterDungeon(cave); } else if (a === 'no') closeModal(); });
}
// Escaleras (y portal): bajar, subir o salir de la mazmorra desde cualquier piso
function stairsMenu(kind) {
  const n = D.cave.floors, f = D.f;
  const body = kind === 'exit' ? '<p>🌀 El portal de salida te lleva a la entrada de la mazmorra.</p>'
    : kind === 'down' ? `<p>🪜 Escalera hacia el <b>piso ${f + 2} de ${n}</b>${f + 2 === n ? ' (el jefe espera ahí 👑)' : ''}.</p>`
      : f === 0 ? '<p>🪜 Escalera hacia la superficie.</p>' : `<p>🪜 Escalera hacia el <b>piso ${f} de ${n}</b>.</p>`;
  openModal(() => `<h2>${kind === 'exit' ? '🌀 Portal de salida' : '🪜 Escalera'}</h2><p class="mut" style="margin:0">${esc(D.cave.name)} · piso ${f + 1} de ${n}</p>${body}
    <div class="cfbtns3">${kind === 'down' ? `<button class="btn gold big" data-a="down">⬇️ Bajar al piso ${f + 2}</button>` : ''}${kind === 'up' && f > 0 ? `<button class="btn gold big" data-a="up">⬆️ Subir al piso ${f}</button>` : ''}
    <button class="btn ${kind === 'exit' || (kind === 'up' && f === 0) ? 'gold big' : ''}" data-a="out">🚪 Salir de la mazmorra</button><button class="btn" data-a="stay">Quedarme aquí</button></div>`,
  a => {
    if (a === 'stay') { closeModal(); return; }
    closeModal();
    if (a === 'down') { loadFloor(f + 1, null); save('now'); toast(`🪜 Piso ${f + 2} de ${n}${f + 2 === n ? '<br><span style="font-size:14px">El jefe está en este piso 👑</span>' : ''}`); }
    else if (a === 'up') { const prev = floorOf(D.cave, f - 1); loadFloor(f - 1, prev.down); save('now'); toast(`🪜 Piso ${f} de ${n}`); }
    else if (a === 'out') exitDungeon(`🚪 Saliste de ${esc(D.cave.name)}`);
    updateHUD();
  });
}
// Al recargar la partida estando adentro
export function resumeDungeon() {
  const s = G.inDun; if (!s || !s.cave || !s.cave.id || !CAVE[s.cave.kind]) { G.inDun = null; return false; }
  enterDungeon(s.cave, s.f, { x: s.x, y: s.y }, true); return true;
}
// Al empezar o cargar otra partida (puede ser otra sala, con otra semilla)
export function resetDungeon() { D.on = false; D.mons.clear(); D.mpos.clear(); D.vis.clear(); D.dead.clear(); floors.clear(); }
// Movimiento suave (lo llama el loop principal)
export function dunLerp(a) {
  D.px += (D.x - D.px) * a; D.py += (D.y - D.py) * a;
  if (Math.abs(D.x - D.px) > 3 || Math.abs(D.y - D.py) > 3) { D.px = D.x; D.py = D.y; }
  for (const m of D.mons.values()) { m.px += (m.x - m.px) * a; m.py += (m.y - m.py) * a; }
}
