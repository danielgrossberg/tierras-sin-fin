// Recolección y fabricación (Versión 3 · Fase 6.1).
// - Puntos de recolección en el mapa (deterministas por semilla; los crea world.js como feats de tipo 'node'):
//   ⛏️ veta junto a montañas · 🌿 hierbas · 🎣 pesca en la costa · 🪵 madera. También vetas en las mazmorras.
//   Se agotan al usarlos y reaparecen a los 15 minutos reales (por jugador: G.gath[id] = hora de uso).
// - Profesiones (G.prof): Minería, Herboristería, Pesca, Alquimia, Herrería y Cocina. Suben con el uso; a más nivel,
//   más cantidad, más probabilidad de material raro y más recetas.
// - Materiales en G.mats (hasta 999 de cada uno). Comida activa en G.food = { k, until }.
'use strict';
import { MATS, MAT_MAX, NODES, NODE_RESPAWN, PROFS, PROF_MAX, RECIPES, FOODS, GEAR_ILVL, IT, EN } from './data.js';
import { G, P, START } from './state.js';
import { rollRarity, makeItem, rollLoot, addItem, TYPES, RAR_KEYS } from './items.js';
import { giveElix } from './economy.js';
import { sfx } from './audio.js';

// ---- Nivel del material según la distancia (como el peligro)
export const tierAt = (x, y, max) => Math.min(max, Math.floor(Math.hypot(x - START.x, y - START.y) / 60));
export const nodeReady = id => !(G.gath && G.gath[id] && Date.now() - G.gath[id] < NODE_RESPAWN);
export const nodeLeft = id => G.gath && G.gath[id] ? Math.max(0, NODE_RESPAWN - (Date.now() - G.gath[id])) : 0;

// ---- Materiales
export const matN = k => (G.mats && G.mats[k]) || 0;
export function addMat(k, n) { if (!MATS[k] || n <= 0) return 0; G.mats = G.mats || {}; const before = matN(k); G.mats[k] = Math.min(MAT_MAX, before + n); return G.mats[k] - before; }
export const matLabel = (k, n) => `${MATS[k].e} ${MATS[k].n}${n != null ? ' ×' + n : ''}`;

// ---- Profesiones
export const profNeed = l => Math.round(40 * Math.pow(l, 1.3));
export const prof = k => { G.prof = G.prof || {}; return G.prof[k] || (G.prof[k] = { lvl: 1, xp: 0 }); };
export function profXP(k, x) {
  const p = prof(k), out = []; if (p.lvl >= PROF_MAX) return out;
  p.xp += Math.round(x);
  while (p.lvl < PROF_MAX && p.xp >= profNeed(p.lvl)) { p.xp -= profNeed(p.lvl); p.lvl++; out.push(`${PROFS[k].e} ${PROFS[k].n} sube a nivel ${p.lvl}`); }
  return out;
}

// ---- Recolectar en un punto (afuera: feat 'node'; en mazmorras: veta con tier propio)
export function gatherAt(node, tierOverride) {
  if (!node || !nodeReady(node.id)) return null;
  const N = NODES[node.kind], pk = N.prof, p = prof(pk);
  const tier = tierOverride != null ? Math.min(N.list.length - 1, tierOverride) : tierAt(node.x, node.y, N.list.length - 1);
  const mat = N.list[tier], amount = 1 + Math.floor(p.lvl / 5) + (Math.random() < .3 ? 1 : 0), got = [];
  got.push([mat, addMat(mat, amount)]);
  // Material raro: gema en las vetas, o el material del siguiente nivel
  const rare = .05 + .01 * p.lvl;
  if (Math.random() < rare) { const r = node.kind === 'ore' ? 'gema' : N.list[Math.min(N.list.length - 1, tier + 1)]; got.push([r, addMat(r, 1)]); }
  G.gath = G.gath || {}; G.gath[node.id] = Date.now();
  const ups = profXP(pk, 10 + 4 * tier);
  G.stats = G.stats || {}; G.stats.gathered = (G.stats.gathered || 0) + got.reduce((a, x) => a + x[1], 0);
  sfx('gather');
  return { got, ups };
}

// ---- Materiales de monstruos (botín de combate)
const BEAST = new Set(['lobo', 'loboartico', 'lobosombra', 'oso', 'osopolar', 'jabali', 'cocodrilo', 'serpiente', 'serpmar', 'rata', 'escorpion', 'arana', 'sapo', 'cangrejo', 'golem']);
export function monsterMat(key) {
  const e = EN[key]; if (!e) return null;
  if (e.undead && !e.magic) return 'hueso';
  if (e.magic || e.undead) return 'esencia';
  if (BEAST.has(key)) return Math.random() < .5 ? 'cuero' : 'colmillo';
  return 'cuero';
}
// 40% por enemigo (mínimo 1 si cae algo)
export function battleMats(keys) {
  const got = {};
  for (const k of keys) { if (Math.random() < .4) { const m = monsterMat(k); if (m) got[m] = (got[m] || 0) + 1 + (Math.random() < .25 ? 1 : 0); } }
  const out = []; for (const [m, n] of Object.entries(got)) { const a = addMat(m, n); if (a) out.push([m, a]); }
  return out;
}

// ---- Fabricar
export const recipeOk = r => prof(r.prof).lvl >= r.lv;
export const canCraft = (r, times = 1) => recipeOk(r) && G.gold >= r.g * times && Object.entries(r.in).every(([k, n]) => matN(k) >= n * times);
export function craft(id, times = 1) {
  const r = RECIPES.find(x => x.id === id); if (!r) return null;
  let done = 0; const res = [];
  for (let i = 0; i < times; i++) {
    if (!canCraft(r)) break;
    if (r.out.gear && (G.inventory || []).length >= 40) { res.push('🎒 Inventario lleno'); break; }
    for (const [k, n] of Object.entries(r.in)) G.mats[k] -= n;
    G.gold -= r.g; done++;
    const o = r.out, p = prof(r.prof);
    if (o.item) { G.items[o.item] = (G.items[o.item] || 0) + o.n; }
    else if (o.elix) giveElix(o.elix);
    else if (o.food) G.food = { k: o.food, until: Date.now() + 30 * 60 * 1000 };   // una comida activa a la vez (reemplaza la anterior)
    else if (o.frags) G.frags = (G.frags || 0) + o.frags;
    else if (o.gear) {
      // Equipo según el material; mejor rareza con más nivel de Herrería
      const types = Object.keys(TYPES).filter(t => TYPES[t].slot === o.gear);
      let rr = rollRarity(Math.min(1, p.lvl / 30), 'comun'); if (Math.random() < p.lvl * .015) rr = RAR_KEYS[Math.min(3, RAR_KEYS.indexOf(rr) + 1)];
      const it = rr === 'legendario' ? rollLoot(GEAR_ILVL[o.t], 1, 'legendario') : makeItem(types[Math.floor(Math.random() * types.length)], rr, GEAR_ILVL[o.t]);
      addItem(it); res.push(it);
    }
    res.push(...profXP(r.prof, 15 + 5 * (o.t || 0) + r.lv));
  }
  if (done) { G.stats = G.stats || {}; G.stats.crafted = (G.stats.crafted || 0) + done; }
  if (done) sfx('craft');
  return { r, done, res };
}
// Resultado legible de una receta
export function outLabel(r) {
  const o = r.out;
  if (o.item) return `${IT[o.item].e} ${IT[o.item].n}${o.n > 1 ? ' ×' + o.n : ''}`;
  if (o.elix) return `Elixir: ${o.elix === 'vela' ? '🕯️ Vela de Exploración' : o.elix === 'coloso' ? '🛡️ Coloso' : o.elix === 'sabio' ? '📗 Sabiduría' : o.elix === 'fortuna' ? '💰 Fortuna' : '🍀 Suerte'} (30 min)`;
  if (o.food) return `${FOODS[o.food].e} ${FOODS[o.food].n} · ${FOODS[o.food].d} (30 min)`;
  if (o.frags) return `🔩 ${o.frags} fragmentos para la forja`;
  if (o.gear) return `${o.gear === 'weapon' ? '⚔️ Arma' : o.gear === 'armor' ? '🛡️ Armadura' : '💍 Accesorio'} Nv ${GEAR_ILVL[o.t]} (rareza al azar; mejor con más Herrería)`;
  return '';
}
// Comida activa
export const foodActive = () => (G.food && G.food.until > Date.now() ? G.food : null);
export const foodFx = k => { const f = foodActive(); return f && FOODS[f.k] && FOODS[f.k].fx[k] || 0; };
