// Misiones de las aldeas (Fase C). Cada aldea tiene un tablón con 3 misiones generadas de forma
// determinista a partir de la aldea (misma aldea = mismas misiones para todos los jugadores de la sala).
// Al completar una, ese puesto del tablón se renueva. Máximo 5 misiones activas.
// Tipos: caza, entrega, exploración y jefe. (Mazmorra llegará con la fase F.)
'use strict';
import { mulberry, hashI, pick } from './util.js';
import { CH, EN, POOL, NODES, MATS } from './data.js';
import { G, st, P, START, heroes, gainXP } from './state.js';
import { getChunk, feats, tileAt, isBlocked, dangerAt, addFeat, vName } from './world.js';
import { rollLoot, addItem, itemLabel } from './items.js';
import { addEgg } from './pets.js';

export const MAX_ACTIVE = 5;
export const SLOTS_PER_BOARD = 3;
const TMULT = { hunt: 1, deliver: 1.3, explore: 1.2, boss: 2.5, dungeon: 2.8, gather: 1.1 };
export const QICON = { hunt: '🏹', deliver: '✉️', explore: '🧭', boss: '👑', dungeon: '🕳️', gather: '⛏️' };
export const QNAME = { hunt: 'Caza', deliver: 'Entrega', explore: 'Exploración', boss: 'Jefe', dungeon: 'Mazmorra', gather: 'Recolección' };
const DIRS = ['este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste', 'norte', 'noreste'];
export const compass = (dx, dy) => DIRS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];

const vid = v => 'village@' + v.x + ',' + v.y;
function boardN(v, slot) { const b = (G.board || {})[vid(v)]; return b ? b[slot] || 0 : 0; }

// ================= Búsqueda de lugares en el mundo =================
// Recorre chunks (en orden barajado con la semilla de la misión) buscando un lugar que cumpla `test`
function scan(v, rmin, rmax, rng, test, shuffle = true, limit = 260) {
  const c0x = Math.floor(v.x / CH), c0y = Math.floor(v.y / CH), R = Math.ceil(rmax / CH) + 1, cands = [];
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    const d = Math.hypot((c0x + i + .5) * CH - v.x, (c0y + j + .5) * CH - v.y);
    if (d >= rmin - CH && d <= rmax + CH) cands.push([c0x + i, c0y + j, d]);
  }
  if (shuffle) for (let i = cands.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [cands[i], cands[k]] = [cands[k], cands[i]]; }
  else cands.sort((a, b) => a[2] - b[2]);
  for (const [cx, cy] of cands.slice(0, limit)) {
    const c = getChunk(cx, cy), r = test(c);
    if (r) { const d = Math.hypot(r.x - v.x, r.y - v.y); if (d >= rmin && d <= rmax) return r; }
  }
  return null;
}
function featIn(c, type, exclude) {
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
    const x = c.cx * CH + i, y = c.cy * CH + j, f = feats.get(x + ',' + y);
    if (f && f.type === type && f.id !== exclude) return f;
  }
  return null;
}
// Si no hay un lugar natural, se crea uno (queda guardado en G.extraFeats para que exista al recargar)
function forceFeat(v, type, rmin, rmax, rng) {
  for (let t = 0; t < 40; t++) {
    const a = rng() * Math.PI * 2, d = rmin + rng() * (rmax - rmin);
    const x = Math.round(v.x + Math.cos(a) * d), y = Math.round(v.y + Math.sin(a) * d);
    getChunk(Math.floor(x / CH), Math.floor(y / CH));
    if (isBlocked(x, y) || feats.has(x + ',' + y)) continue;
    const f = { type, x, y }; if (type === 'village') f.name = vName(rng);
    G.extraFeats = G.extraFeats || []; G.extraFeats.push(f);
    return addFeat(type, x, y, f.name ? { name: f.name } : null);
  }
  return null;
}

// ================= Generación =================
const cache = new Map();
export function boardQuest(v, slot) {
  for (let tries = 0; tries < 6; tries++) {
    const n = boardN(v, slot), key = vid(v) + '#' + slot + '#' + n;
    let q = cache.get(key);
    if (!q) { q = genQuest(v, slot, n); cache.set(key, q); }
    // Si el jefe de la misión ya fue derrotado (y no está aceptada), el puesto pasa a la siguiente misión
    if (q.type === 'boss' && G.defeated[q.bossId] !== undefined && !isActive(q.id)) { renew(v, slot); continue; }
    if (q.type === 'dungeon' && G.dungeons && G.dungeons[q.caveId] && G.dungeons[q.caveId].done && !isActive(q.id)) { renew(v, slot); continue; }
    return q;
  }
  return null;
}
function renew(v, slot) { G.board = G.board || {}; const b = G.board[vid(v)] || (G.board[vid(v)] = {}); b[slot] = (b[slot] || 0) + 1; }
export function clearQuestCache() { cache.clear(); }
function genQuest(v, slot, n) {
  const rng = mulberry(hashI(v.x * 31 + slot * 977, v.y * 17 + n * 7919, st.seed + 5003));
  const r = rng(); let want = r < .35 ? 'hunt' : r < .6 ? 'deliver' : r < .8 ? 'explore' : 'boss';
  // Versión 3 · Fase 1: ~15% de los puestos pasan a ser "Completa la mazmorra X". Usa un generador aparte
  // para que el resto de las misiones de cada tablón siga siendo la misma de antes.
  const rd = mulberry(hashI(v.x * 13 + slot * 101, v.y * 29 + n * 37, st.seed + 7177));
  if (want !== 'boss' && rd() < .15) want = 'dungeon';
  // Versión 3 · Fase 6.1: ~12% de los puestos pasan a ser "Recolecta X" (azar aparte: el resto no cambia)
  const rgq = mulberry(hashI(v.x * 7 + slot * 53, v.y * 11 + n * 97, st.seed + 7373));
  if (want !== 'boss' && want !== 'dungeon' && rgq() < .12) want = 'gather';
  const base = { id: vid(v) + '#' + slot + '#' + n, slot, from: { x: v.x, y: v.y, name: v.name } };
  let q = null;
  if (want === 'dungeon') {
    const t = scan(v, 25, 150, rd, c => { const f = featIn(c, 'cave'); return f && !(G.dungeons && G.dungeons[f.id] && G.dungeons[f.id].done) ? f : null; }, true, 400);
    if (t) q = { type: 'dungeon', target: { x: t.x, y: t.y, name: t.name }, caveId: t.id, title: `Completa la mazmorra ${t.name}`, desc: `${t.name} (${t.floors} pisos) está al ${compass(t.x - v.x, t.y - v.y)} de ${v.name}. Derrota a su jefe.` };
    else want = r < .35 ? 'hunt' : r < .6 ? 'deliver' : 'explore';
  }
  if (want === 'gather') {
    const kinds = ['ore', 'herb', 'fish', 'wood'], kind = kinds[Math.floor(rgq() * 4)], N = NODES[kind], t = Math.min(N.list.length - 1, Math.floor(Math.hypot(v.x - START.x, v.y - START.y) / 60));
    const mat = N.list[t], needN = 4 + Math.floor(rgq() * 5);
    q = { type: 'gather', mat, need: needN, title: `Recolecta ${needN} × ${MATS[mat].e} ${MATS[mat].n}`, desc: `En ${v.name} necesitan ${MATS[mat].n.toLowerCase()} (${N.e} ${N.n.toLowerCase()} de la zona).` };
  }
  if (want === 'deliver') {
    const t = scan(v, 40, 120, rng, c => featIn(c, 'village', vid(v))) || forceFeat(v, 'village', 40, 120, rng);
    if (t) q = { type: 'deliver', target: { x: t.x, y: t.y, name: t.name }, title: `Lleva una carta a ${t.name}`, desc: `Una carta urgente para ${t.name}, al ${compass(t.x - v.x, t.y - v.y)}.` };
  } else if (want === 'explore') {
    const t = scan(v, 20, 70, rng, c => featIn(c, 'shrine')) || forceFeat(v, 'shrine', 20, 70, rng);
    if (t) { const dir = compass(t.x - v.x, t.y - v.y); q = { type: 'explore', target: { x: t.x, y: t.y }, title: `Encuentra el santuario perdido al ${dir}`, desc: `Dicen que hay un santuario antiguo al ${dir} de ${v.name}.` }; }
  } else if (want === 'boss') {
    const t = scan(v, 0, 170, rng, c => c.spawns.find(s => s.boss && G.defeated[s.id] === undefined), false, 500);
    if (t) { const e = EN[t.group[0]]; q = { type: 'boss', target: { x: t.x, y: t.y }, bossId: t.id, title: `Derrota al ${e.n} de la región`, desc: `Un ${e.n} 👑 aterroriza la región, al ${compass(t.x - v.x, t.y - v.y)}.` }; }
  }
  if (!q && want === 'gather') want = 'hunt';
  if (!q) {   // caza (o si no se encontró lugar para el tipo pedido)
    const lvl = dangerAt(v.x, v.y), b = tileAt(v.x, v.y).b, pool = (POOL[b] || POOL.GRASS).filter(k => (EN[k].min || 1) <= lvl + 1);
    const key = pick(pool.length ? pool : POOL.GRASS, rng), need = 3 + Math.floor(rng() * 4);
    q = { type: 'hunt', key, need, title: `Derrota ${need} × ${EN[key].e} ${EN[key].n}`, desc: `Los ${EN[key].n.toLowerCase()} rondan cerca de ${v.name}.` };
  }
  // Recompensas: escalan con el peligro del objetivo y con el tipo
  const lvl = dangerAt(q.target ? q.target.x : v.x, q.target ? q.target.y : v.y), m = TMULT[q.type];
  q.lvl = lvl;
  q.reward = { gold: Math.round((20 + lvl * 12) * m), xp: Math.round((15 + lvl * 10) * m), gear: q.type === 'boss' || q.type === 'dungeon' ? 1 : q.type === 'hunt' ? .3 : .25 };
  return Object.assign(base, q);
}

// ================= Estado de las misiones del jugador =================
export const active = () => G.quests || (G.quests = []);
export const isActive = id => active().some(q => q.id === id);
export const tracked = () => active().find(q => q.id === G.qtrack) || null;
export function accept(q) {
  if (isActive(q.id) || active().length >= MAX_ACTIVE) return false;
  active().push(Object.assign({}, q, { have: 0 }));
  if (!tracked()) G.qtrack = q.id;
  return true;
}
export function abandon(id) { G.quests = active().filter(q => q.id !== id); if (G.qtrack === id) G.qtrack = active()[0] ? active()[0].id : null; }
export function track(id) { G.qtrack = id; }
export const progressText = q => q.type === 'hunt' || q.type === 'gather' ? `${q.have}/${q.need}` : q.target ? `${Math.round(Math.hypot(q.target.x - P.x, q.target.y - P.y))} c` : '';
export const rewardText = (r, type) => `💰 ${r.gold} · ⭐ ${r.xp} XP${r.gear >= 1 ? ' · 🎁 equipo' : r.gear ? ` · ${Math.round(r.gear * 100)}% equipo` : ''}${type === 'boss' || type === 'dungeon' ? ' · 30% 🥚' : ''}`;

// Completa una misión: recompensa, renueva el puesto del tablón y devuelve líneas para mostrar
function complete(q) {
  G.quests = active().filter(x => x.id !== q.id);
  renew(q.from, q.slot);
  if (G.qtrack === q.id) G.qtrack = active()[0] ? active()[0].id : null;
  G.gold += q.reward.gold;
  const party = heroes().filter(h => h.hp > 0), each = party.length ? q.reward.xp / party.length : 0, lines = [];
  for (const h of party) lines.push(...gainXP(h, each));
  let gear = '';
  if (Math.random() < q.reward.gear) { const it = rollLoot(q.lvl, 0, q.type === 'boss' || q.type === 'dungeon' ? 'raro' : 'comun'); gear = addItem(it) ? ' · ' + itemLabel(it) : ' · (inventario lleno)'; }
  // Mascotas: las misiones de jefe y de mazmorra pueden dar un huevo (30%)
  let egg = ''; if ((q.type === 'boss' || q.type === 'dungeon') && Math.random() < .3) { addEgg('misión'); egg = ' · 🥚 huevo de mascota'; }
  return [`📜 <b>¡Misión cumplida!</b> ${q.title}<br><span style="font-size:14px">+${q.reward.gold} oro · +${q.reward.xp} XP${gear}${egg}</span>`, ...lines];
}
// Tras ganar un combate: avanza las cacerías y completa los jefes
export function onVictory(enemies, m) {
  const out = [];
  for (const q of [...active()]) {
    if (q.type === 'hunt') { q.have = Math.min(q.need, q.have + enemies.filter(e => e.key === q.key).length); if (q.have >= q.need) out.push(...complete(q)); }
    else if (q.type === 'boss' && m && m.id === q.bossId) out.push(...complete(q));
  }
  return out;
}
// Al recolectar: avanza "Recolecta X"
export function onGather(mat, n) {
  const out = [];
  for (const q of [...active()]) if (q.type === 'gather' && q.mat === mat) { q.have = Math.min(q.need, q.have + n); if (q.have >= q.need) out.push(...complete(q)); }
  return out;
}
// Al completar una mazmorra (jefe derrotado)
export function onDungeonDone(caveId) {
  const out = [];
  for (const q of [...active()]) if (q.type === 'dungeon' && q.caveId === caveId) out.push(...complete(q));
  return out;
}
// Al pisar una casilla: entregas y exploraciones
export function onArrive(x, y) {
  const out = [];
  for (const q of [...active()]) if ((q.type === 'deliver' || q.type === 'explore') && q.target.x === x && q.target.y === y) out.push(...complete(q));
  return out;
}
