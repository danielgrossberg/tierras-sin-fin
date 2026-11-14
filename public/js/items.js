// Equipo con rarezas: tipos, generación, nombres, botín y tienda de la aldea.
// Un objeto se guarda compacto: {id, t:tipo, r:rareza, ilvl, n:nombre, st:{stat:valor}, fx?:legendario}
'use strict';
import { mulberry, hashI, pick } from './util.js';
import { CL } from './data.js';
import { G, st } from './state.js';

export const INV_MAX = 40;
const ALL = Object.keys(CL);

export const SLOTS = {
  weapon: { n: 'Arma', i: '⚔️' },
  armor: { n: 'Armadura', i: '🛡️' },
  acc: { n: 'Accesorio', i: '💍' },
};
export const SLOT_KEYS = Object.keys(SLOTS);

// Tipos de objeto y qué clases los pueden usar
export const TYPES = {
  espada: { n: 'Espada', slot: 'weapon', e: '🗡️', cls: ['guerrero'], main: 'atk' },
  hacha: { n: 'Hacha', slot: 'weapon', e: '🪓', cls: ['guerrero'], main: 'atk' },
  baculo: { n: 'Báculo', slot: 'weapon', e: '🪄', cls: ['maga', 'sanadora'], main: 'mag' },
  arco: { n: 'Arco', slot: 'weapon', e: '🏹', cls: ['arquera'], main: 'atk' },
  dagas: { n: 'Dagas', slot: 'weapon', e: '🔪', cls: ['picaro'], main: 'atk' },
  pesada: { n: 'Coraza', slot: 'armor', e: '🛡️', cls: ['guerrero'], main: 'def', f: { def: 1.2, mhp: 1.5 } },
  ligera: { n: 'Armadura ligera', slot: 'armor', e: '🦺', cls: ALL, main: 'def', f: { def: .9, mhp: 1 } },
  tunica: { n: 'Túnica', slot: 'armor', e: '👘', cls: ['maga', 'sanadora'], main: 'def', f: { def: .7, mhp: .8, mmp: .6 } },
  anillo: { n: 'Anillo', slot: 'acc', e: '💍', cls: ALL, main: null },
  amuleto: { n: 'Amuleto', slot: 'acc', e: '📿', cls: ALL, main: null },
};

// Rarezas (probabilidad base en %)
export const RAR = {
  comun: { n: 'Común', c: '#b0b6c8', p: 60, m: 1, x: 0 },
  raro: { n: 'Raro', c: '#4da3ff', p: 28, m: 1.3, x: 1 },
  epico: { n: 'Épico', c: '#b36bff', p: 10, m: 1.7, x: 2 },
  legendario: { n: 'Legendario', c: '#ff9a3d', p: 2, m: 2.3, x: 3 },
};
export const RAR_KEYS = Object.keys(RAR);

export const STAT = {
  mhp: 'PV', mmp: 'PM', atk: 'ATQ', def: 'DEF', mag: 'MAG', spd: 'VEL',
  crit: '% crítico', ls: '% robo de vida', pres: '% res. veneno',
};
const STAT_ORDER = Object.keys(STAT);

// Legendarios con nombre propio y un efecto único (se aplican en battle.js)
export const LEGENDS = {
  brasa: { n: 'Colmillo de Brasa', t: 'espada', d: 'Los ataques físicos queman al enemigo 3 turnos' },
  egida: { n: 'Égida del Alba', t: 'pesada', d: '15% de bloquear todo el daño de un golpe' },
  eco: { n: 'Anillo del Eco', t: 'anillo', d: '20% de lanzar la habilidad dos veces' },
  mareas: { n: 'Báculo de las Mareas', t: 'baculo', d: 'Recupera 3 PM al inicio de cada turno' },
  viento: { n: 'Arco del Viento Norte', t: 'arco', d: '25% de disparar una flecha extra al atacar' },
  umbra: { n: 'Dagas de Umbra', t: 'dagas', d: 'Los críticos hacen ×2.5 en vez de ×1.75' },
  sabio: { n: 'Túnica del Sabio Errante', t: 'tunica', d: 'Las habilidades cuestan 25% menos PM' },
  fenix: { n: 'Amuleto del Fénix', t: 'amuleto', d: 'Una vez por combate, al caer revive con 30% PV' },
};

const MATERIAL = ['de Bronce', 'de Hierro', 'de Acero', 'de Mithril', 'de Adamantita'];
const SUFFIX = ['del Lobo', 'de la Tormenta', 'del Alba', 'de las Cenizas', 'del Halcón', 'de la Escarcha', 'del Coloso',
  'de la Luna', 'del Abismo', 'del Viajero', 'del Bosque', 'de la Marea', 'del Rey Caído', 'de las Dunas', 'del Trueno', 'de la Serpiente'];

// ================= Generación =================
const r1 = v => Math.max(1, Math.round(v));
function extraValue(k, ilvl, R, rng) {
  const b = (1 + ilvl * .6) * (1 + (R.m - 1) * .5) * (.8 + rng() * .4);
  if (k === 'mhp') return r1(b * 3);
  if (k === 'mmp') return r1(b * 2);
  if (k === 'crit') return Math.min(15, r1(2 + ilvl * .15));
  if (k === 'ls') return Math.min(12, r1(2 + ilvl * .12));
  if (k === 'pres') return Math.min(80, r1(20 + ilvl * 2));
  return r1(b);
}
export function makeItem(type, rarity, ilvl, rng = Math.random, legend = null) {
  const T = TYPES[type], R = RAR[rarity], base = (2 + ilvl * 1.2) * R.m, s = {};
  let main = T.main;
  if (T.slot === 'armor') for (const k in T.f) s[k] = r1(base * T.f[k]);
  else if (T.slot === 'acc') { main = pick(['atk', 'def', 'mag', 'spd', 'mhp', 'mmp'], rng); s[main] = r1(base * (main === 'mhp' ? 3 : main === 'mmp' ? 2 : 1)); }
  else s[main] = r1(base);
  // Propiedades extra al azar, sin repetir
  const pool = STAT_ORDER.filter(k => k !== main);
  for (let i = 0; i < R.x && pool.length; i++) {
    const k = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    s[k] = (s[k] || 0) + extraValue(k, ilvl, R, rng);
  }
  const name = legend ? LEGENDS[legend].n
    : rarity === 'comun' ? `${T.n} ${MATERIAL[Math.min(MATERIAL.length - 1, Math.floor((ilvl - 1) / 5))]}`
      : `${T.n} ${pick(SUFFIX, rng)}`;
  const it = { id: 'i' + Math.floor(rng() * 1e9).toString(36) + Date.now().toString(36).slice(-4), t: type, r: rarity, ilvl, n: name, st: s };
  if (legend) it.fx = legend;
  return it;
}
// Rareza al azar: mientras más lejos de Villa Origen (luck 0..1), mejores probabilidades
export function rollRarity(luck = 0, min = 'comun', rng = Math.random) {
  const w = { comun: 60 - 25 * luck, raro: 28 + 10 * luck, epico: 10 + 10 * luck, legendario: 2 + 5 * luck };
  const keys = RAR_KEYS.slice(RAR_KEYS.indexOf(min));
  let tot = keys.reduce((a, k) => a + w[k], 0), x = rng() * tot;
  for (const k of keys) { x -= w[k]; if (x <= 0) return k; }
  return keys[keys.length - 1];
}
// Botín: objeto de tipo y rareza al azar (los legendarios eligen uno de los 8 con nombre)
export function rollLoot(ilvl, luck = 0, min = 'comun', rng = Math.random) {
  const r = rollRarity(luck, min, rng);
  if (r === 'legendario') { const lg = pick(Object.keys(LEGENDS), rng); return makeItem(LEGENDS[lg].t, r, ilvl, rng, lg); }
  return makeItem(pick(Object.keys(TYPES), rng), r, ilvl, rng);
}

// ================= Consultas =================
export const slotOf = it => TYPES[it.t].slot;
export const canUse = (h, it) => TYPES[it.t].cls.includes(h.cls);
export const itemValue = it => Math.round((8 + it.ilvl * 5) * Math.pow(RAR[it.r].m, 2));
export const sellPrice = it => Math.max(1, Math.round(itemValue(it) * .3));
export const buyPrice = it => Math.round(itemValue(it) * 1.5);
export const statList = s => STAT_ORDER.filter(k => s[k]).map(k => `${STAT[k].startsWith('%') ? '+' + s[k] + STAT[k] : STAT[k] + ' +' + s[k]}`);
export const classesText = it => TYPES[it.t].cls.length === ALL.length ? 'Todas las clases' : TYPES[it.t].cls.map(c => CL[c].n).join(', ');
// Etiqueta con el color de la rareza
export const itemLabel = it => `<span class="emoji">${TYPES[it.t].e}</span> <b class="rr" style="color:${RAR[it.r].c}">${it.n}</b>`;
// Diferencias de stats contra lo que lleva equipado (para el botón "Comparar")
export function compare(it, cur) {
  const keys = STAT_ORDER.filter(k => (it.st[k] || 0) || (cur && cur.st[k]));
  return keys.map(k => ({ k, v: it.st[k] || 0, d: (it.st[k] || 0) - (cur ? cur.st[k] || 0 : 0) }));
}
export function addItem(it) {
  if (!G.inventory) G.inventory = [];
  if (G.inventory.length >= INV_MAX) return false;
  G.inventory.push(it); return true;
}

// ================= Armería de la aldea =================
// 4 objetos Comunes del nivel de la zona; se renuevan cada 400 pasos. Determinista por aldea.
export function shopStock(f, ilvl) {
  const period = Math.floor((G.steps || 0) / 400);
  const rng = mulberry(hashI(f.x, f.y, st.seed + 9001 + period));
  const types = Object.keys(TYPES), list = [];
  for (let i = 0; i < 4; i++) list.push(makeItem(pick(types, rng), 'comun', ilvl, rng));
  G.shop = G.shop || {};
  const rec = G.shop[f.id];
  if (!rec || rec.p !== period) G.shop[f.id] = { p: period, b: [] };
  return list.map((it, i) => ({ it, sold: G.shop[f.id].b.includes(i) }));
}
export function markBought(f, i) { G.shop[f.id].b.push(i); }
