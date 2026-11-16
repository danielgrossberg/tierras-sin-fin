// Tumba 🪦 (Versión 2): cuando cae todo el grupo, sus objetos quedan donde cayó.
// - Se guarda en G.tomb = { x, y, at (hora de la muerte, ms), items, inventory, gear: [{h, slot, it}] }
// - Dura 60 minutos reales (el tiempo corre aunque se cierre el juego).
// - Una sola tumba a la vez: si se vuelve a caer, la anterior se pierde.
'use strict';
import { G, P, heroes, changeEquip } from './state.js';
import { blockT } from './data.js';
import { tileAt, mpos, feats } from './world.js';

export const TOMB_MS = 60 * 60 * 1000;
export const tombLeft = () => G.tomb ? Math.max(0, G.tomb.at + TOMB_MS - Date.now()) : 0;
export const tombMinutes = () => Math.ceil(tombLeft() / 60000);

// Casilla caminable más cercana (sin mar ni obstáculos, sin jefe ni aldea encima)
function freeSpot(x, y) {
  const ok = (a, b) => { const t = tileAt(a, b), m = mpos.get(a + ',' + b), f = feats.get(a + ',' + b);
    return !blockT(t) && !(m && m.boss) && !(f && f.type === 'village'); };
  for (let r = 0; r <= 12; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
    if (ok(x + i, y + j)) return { x: x + i, y: y + j };
  }
  return { x, y };
}

// Crea la tumba con todo lo que el grupo lleva y lo saca del grupo. Devuelve si se perdió una tumba anterior.
export function createTomb(x, y) {
  const lostOld = !!G.tomb;
  const items = Object.assign({}, G.items), inventory = G.inventory || [], gear = [];
  for (const h of heroes()) for (const slot in (h.equip || {})) if (h.equip[slot]) gear.push({ h: h.id, slot, it: h.equip[slot] });
  const has = Object.values(items).some(n => n > 0) || inventory.length || gear.length;
  G.tomb = null;
  if (has) { const s = freeSpot(x, y); G.tomb = { x: s.x, y: s.y, at: Date.now(), items, inventory, gear }; }
  G.items = { pocion: 0, eter: 0, pluma: 0 }; G.inventory = [];
  for (const h of heroes()) changeEquip(h, () => { h.equip = {}; });
  return { lostOld, created: !!G.tomb };
}

// Al pisar la tumba: todo vuelve. El equipo se vuelve a poner si esa ranura sigue libre; si no, va al inventario.
export function recoverTomb() {
  const t = G.tomb; if (!t) return false;
  for (const k in t.items) G.items[k] = (G.items[k] || 0) + t.items[k];
  G.inventory = (G.inventory || []).concat(t.inventory || []);
  for (const g of t.gear || []) {
    const h = G.roster.find(x => x.id === g.h);
    if (h && !(h.equip && h.equip[g.slot])) changeEquip(h, () => { h.equip = h.equip || {}; h.equip[g.slot] = g.it; });
    else G.inventory.push(g.it);
  }
  G.tomb = null;
  return true;
}
export const onTomb = () => !!G.tomb && G.tomb.x === P.x && G.tomb.y === P.y;
// ¿Venció? (se revisa al cargar y cada pocos segundos)
export function tombExpired() { if (G.tomb && tombLeft() <= 0) { G.tomb = null; return true; } return false; }
