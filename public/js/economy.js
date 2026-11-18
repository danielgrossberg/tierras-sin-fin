// Usos del oro (Versión 3 · Fase 5): forja, elixires, entrenador, mercader ambulante, mapas del tesoro,
// apariencias y proyectos compartidos de Ciudad Origen. La interfaz está en ui.js; aquí van las reglas.
'use strict';
import { mulberry, hashI, pick } from './util.js';
import { ELIX, ELIX_MS, FORGE_MAX, FORGE_RAR, FRAG_RAR, FRAG_VALUE, COS, ALT_EMOJIS, CITY, CITY_GOALS, MERCH_TMAP, MERCH_EGG, CH, CL, ADV } from './data.js';
import { G, P, START, st, S, heroes, avgLvl, need, gainXP, elix } from './state.js';
import { getChunk, feats, dangerAt, tileAt } from './world.js';
import { net, netAsk } from './net.js';
import { now as srvNow } from './daynight.js';
import { makeItem, rollLoot, RAR, RAR_KEYS, TYPES, LEGENDS, STAT_ORDER, extraValue, buyPrice, addItem } from './items.js';
import { addEgg } from './pets.js';
import { blockT } from './data.js';
import { addMount } from './mounts.js';
import { MOUNTS, MERCH_MOUNT } from './data.js';

const R = Math.round;
// ================= Proyectos de Ciudad Origen (estado del servidor en net.city) =================
export const cityLvl = k => (net.city && net.city.p && net.city.p[k] ? net.city.p[k].lvl : 0);

// ================= Forja =================
export const forgeCost = it => R(40 * Math.pow((it.up || 0) + 1, 1.6) * FORGE_RAR[it.r] * (1 + it.ilvl / 10));
// % de fallar: desde +5 (8% por nivel sobre +4); la Herrería mejorada lo baja
export const forgeFail = it => { const n = (it.up || 0) + 1; return n < 5 ? 0 : Math.max(0, (n - 4) * 8 - 5 * cityLvl('herreria')); };
// Los fragmentos 🔩 pagan hasta la mitad del costo (1 fragmento = 15 de oro)
export function forgePay(cost) { const fr = Math.min(G.frags || 0, Math.floor(cost * .5 / FRAG_VALUE)); return { gold: cost - fr * FRAG_VALUE, frags: fr }; }
export function forge(it) {
  if (!it || (it.up || 0) >= FORGE_MAX) return { ok: false, msg: 'Ya está al máximo (+10).' };
  const pay = forgePay(forgeCost(it)); if (G.gold < pay.gold) return { ok: false, msg: 'No te alcanza el oro.' };
  G.gold -= pay.gold; G.frags = (G.frags || 0) - pay.frags;
  if (Math.random() * 100 < forgeFail(it)) return { ok: true, fail: true, msg: `💥 ¡Falló! Se perdió el oro, pero ${it.n} sigue en +${it.up || 0}.` };
  it.up = (it.up || 0) + 1; G.stats = G.stats || {}; G.stats.forgeMax = Math.max(G.stats.forgeMax || 0, it.up);
  return { ok: true, msg: `⚒️ ¡${it.n} ahora es +${it.up}!` };
}
// Reforjar: vuelve a sortear UNA propiedad extra (no la principal)
const mainOf = it => { const T = TYPES[it.t]; return T.slot === 'armor' ? Object.keys(T.f) : T.slot === 'acc' ? [Object.keys(it.st)[0]] : [T.main]; };
export const extrasOf = it => Object.keys(it.st).filter(k => !mainOf(it).includes(k));
export const reforgeCost = it => R(80 * FORGE_RAR[it.r] * (1 + it.ilvl / 10));
export function reforge(it, k) {
  if (!it || !extrasOf(it).includes(k)) return { ok: false, msg: 'Esa propiedad no se puede reforjar.' };
  const c = reforgeCost(it); if (G.gold < c) return { ok: false, msg: 'No te alcanza el oro.' };
  G.gold -= c; delete it.st[k];
  const pool = STAT_ORDER.filter(x => !(x in it.st) && !mainOf(it).includes(x)), nk = pick(pool), Rr = RAR[it.r];
  it.st[nk] = extraValue(nk, it.ilvl, Rr, Math.random);
  return { ok: true, msg: `🔁 Nueva propiedad: ${nk}`, k: nk };
}
// Desarmar: el equipo que no sirve se convierte en fragmentos 🔩
export const dismantleGain = it => Math.max(1, R(FRAG_RAR[it.r] * (1 + it.ilvl / 10) * (1 + (it.up || 0) * .5)));
export function dismantle(i) { const it = G.inventory[i]; if (!it) return 0; const n = dismantleGain(it); G.inventory.splice(i, 1); G.frags = (G.frags || 0) + n; return n; }

// ================= Elixires (30 min reales; varios a la vez) =================
export const elixPrice = k => R(ELIX[k].p * (1 + avgLvl() / 10));
export function giveElix(k, ms = ELIX_MS) { G.elix = G.elix || {}; G.elix[k] = Math.max(Date.now(), G.elix[k] || 0) + ms; }
export function buyElix(k) { const c = elixPrice(k); if (G.gold < c) return false; G.gold -= c; giveElix(k); return true; }
export const elixLeft = k => Math.max(0, ((G.elix && G.elix[k]) || 0) - Date.now());
export const activeElix = () => Object.keys(G.elix || {}).filter(k => elixLeft(k) > 0);

// ================= Entrenador (Ciudad Origen) =================
// Sube a los héroes de la taberna hasta 2 niveles por debajo del héroe de mayor nivel. Precio por nivel: 25 × nivel^1.5
export const trainMax = () => Math.max(...G.roster.map(h => h.lvl)) - 2;
export const trainCost = l => R(25 * Math.pow(l, 1.5));
export function trainTo(h, target) {
  let cost = 0; for (let l = h.lvl; l < target; l++) cost += trainCost(l);
  return cost;
}
export function train(h, target) {
  target = Math.min(target, trainMax()); if (h.lvl >= target) return false;
  const c = trainTo(h, target); if (G.gold < c) return false;
  G.gold -= c; while (h.lvl < target) gainXPraw(h, need(h.lvl) - h.xp);
  h.hp = S(h, 'mhp'); h.mp = S(h, 'mmp'); return c;
}
// Subir de nivel sin el bonus de los elixires
function gainXPraw(h, x) { h.xp += x; while (h.xp >= need(h.lvl)) { h.xp -= need(h.lvl); h.lvl++; } }

// ================= Mercader ambulante 🐪 (una aldea distinta cada día, la misma para toda la sala) =================
export const today = () => Math.floor(srvNow() / 86400000);
let merchCache = null;
export function merchVillage() {
  const d = today();
  if (merchCache && merchCache.day === d && merchCache.seed === st.seed) return merchCache.v;
  // Aldeas a menos de ~120 casillas de Ciudad Origen (sin contarla), en orden fijo; se elige una por día
  const c0x = Math.floor(START.x / CH), c0y = Math.floor(START.y / CH), list = [];
  for (let j = -8; j <= 8; j++) for (let i = -8; i <= 8; i++) getChunk(c0x + i, c0y + j);
  for (const f of feats.values()) if (f.type === 'village' && !f.start && Math.hypot(f.x - START.x, f.y - START.y) <= 125) list.push(f);
  list.sort((a, b) => a.x - b.x || a.y - b.y);
  const v = list.length ? list[hashI(d, 31, st.seed + 1234) % list.length] : null;
  merchCache = { day: d, seed: st.seed, v };
  return v;
}
// 4 a 6 artículos: equipo Épico o Legendario caro, huevo, elixir supremo y mapa del tesoro
export function merchStock() {
  const v = merchVillage(); if (!v) return [];
  const d = today(), r = mulberry(hashI(d, 97, st.seed + 4321)), lvl = dangerAt(v.x, v.y) + 3, out = [];
  out.push({ kind: 'tmap', n: 'Mapa del tesoro', e: '🗺️', d: 'Marca en el mapa un cofre muy valioso', p: R(MERCH_TMAP * (1 + lvl / 15)) });
  const ng = 1 + Math.floor(r() * 2);
  for (let i = 0; i < ng; i++) { const leg = r() < .3, it = rollLoot(lvl, 1, leg ? 'legendario' : 'epico', r); out.push({ kind: 'gear', it, p: R(buyPrice(it) * (leg ? 5 : 4)) }); }
  if (r() < .6) out.push({ kind: 'egg', n: 'Huevo de mascota', e: '🥚', d: 'Más barato que en Ciudad Origen', p: MERCH_EGG });
  out.push({ kind: 'supremo', n: 'Elixir Supremo', e: '⚗️', d: 'Sabiduría + Fortuna + Suerte por 30 min', p: R(420 * (1 + lvl / 10)) });
  if (out.length < 4 || r() < .5) { const k = pick(Object.keys(ELIX), r); out.push({ kind: 'elix', k, n: ELIX[k].n + ' ×2', e: ELIX[k].e, d: '1 hora de efecto', p: R(ELIX[k].p * 1.5 * (1 + lvl / 10)) }); }
  // Montura (Versión 3 · Fase 6.5): 1 de cada 4 días trae un Camello, un Lagarto o un Lobo Gigante (va al principio)
  if (r() < .25) { const k = pick(['camello', 'lagarto', 'lobog'], r); out.unshift({ kind: 'mount', k, n: MOUNTS[k].n, e: MOUNTS[k].e, d: MOUNTS[k].d, p: R(MERCH_MOUNT * (1 + lvl / 20)) }); }
  return out.slice(0, 6);
}
export const merchBought = i => !!(G.merch && G.merch.day === today() && G.merch.b.includes(i));
export function buyMerch(i) {
  const s = merchStock()[i]; if (!s || merchBought(i)) return null;
  if (G.gold < s.p) return { ok: false, msg: 'No te alcanza el oro.' };
  if (s.kind === 'gear' && !addItem(s.it)) return { ok: false, msg: 'Tu inventario está lleno.' };
  if (s.kind === 'mount' && (G.mounts || []).includes(s.k)) return { ok: false, msg: 'Ya tienes esa montura.' };
  G.gold -= s.p; G.merch = G.merch && G.merch.day === today() ? G.merch : { day: today(), b: [] }; G.merch.b.push(i);
  if (s.kind === 'egg') addEgg('mercader');
  if (s.kind === 'mount') addMount(s.k);
  if (s.kind === 'supremo') { giveElix('sabio'); giveElix('fortuna'); giveElix('suerte'); }
  if (s.kind === 'elix') giveElix(s.k, 2 * ELIX_MS);
  if (s.kind === 'tmap') return { ok: true, map: makeTreasure() };
  return { ok: true };
}
// Mapa del tesoro: un punto a 40–90 casillas de la aldea del mercader
function makeTreasure() {
  const v = merchVillage(), r = Math.random;
  for (let t = 0; t < 60; t++) {
    const a = r() * Math.PI * 2, d = 40 + r() * 50, x = R(v.x + Math.cos(a) * d), y = R(v.y + Math.sin(a) * d), tl = tileAt(x, y);
    if (blockT(tl) || feats.has(x + ',' + y)) continue;
    const m = { id: 'tm' + Date.now().toString(36), x, y, lvl: dangerAt(x, y) + 2 }; G.tmaps = G.tmaps || []; G.tmaps.push(m); return m;
  }
  return null;
}
// Al pisar el tesoro: oro, equipo Épico o mejor y, a veces, un huevo
export function digTreasure(x, y) {
  const i = (G.tmaps || []).findIndex(m => m.x === x && m.y === y); if (i < 0) return null;
  const m = G.tmaps.splice(i, 1)[0], gold = R((300 + 60 * m.lvl) * (.9 + Math.random() * .3)), it = rollLoot(m.lvl, 1, Math.random() < .35 ? 'legendario' : 'epico');
  G.gold += gold; const ok = addItem(it), egg = Math.random() < .25; if (egg) addEgg('tesoro');
  return { gold, it: ok ? it : null, egg };
}

// ================= Apariencias (solo visuales) =================
export const cosOwned = id => !!(G.cos && G.cos.owned && G.cos.owned.includes(id));
export function buyCos(id) { const c = COS[id]; if (!c || cosOwned(id) || G.gold < c.p) return false; G.gold -= c.p; G.cos = G.cos || { owned: [] }; G.cos.owned.push(id); G.cos[c.k] = id; return true; }
export function wearCos(id) { const c = COS[id]; if (!c || !cosOwned(id)) return; G.cos[c.k] = G.cos[c.k] === id ? null : id; }
export const altOwned = e => !!(G.cos && G.cos.alts && G.cos.alts.includes(e));
export function buyAlt(e, price) { if (!ALT_EMOJIS.includes(e) || altOwned(e) || G.gold < price) return false; G.gold -= price; G.cos = G.cos || { owned: [] }; G.cos.alts = G.cos.alts || []; G.cos.alts.push(e); return true; }
// Emoji propio del héroe (el de su clase avanzada o de su clase) o uno alternativo comprado
export const baseE = h => (h.adv && ADV[h.adv] ? ADV[h.adv].e : CL[h.cls].e);
export function setHeroE(h, e) { if (e === baseE(h) || altOwned(e)) h.e = e; }
// Lo que ven los demás (validado por el servidor)
export const cosPublic = () => { const c = G.cos || {}; return { ring: c.ring || null, aura: c.aura || null, frame: c.frame || null, acc: c.acc || null }; };

// ================= Donaciones a Ciudad Origen =================
export async function donate(k, amount) {
  if (!net.joined) return { ok: false, error: 'Necesitas conexión.' };
  amount = Math.floor(amount); if (!(amount > 0) || G.gold < amount) return { ok: false, error: 'No te alcanza el oro.' };
  const r = await netAsk('city:donate', { k, amount });
  if (r && r.ok) { G.gold -= r.used; if (r.city) net.city = r.city; }
  return r || { ok: false, error: 'El servidor no responde.' };
}
export const cityGoal = lvl => CITY_GOALS[lvl] || null;
export { CITY };
