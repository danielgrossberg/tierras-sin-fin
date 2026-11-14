// Estado compartido entre módulos y funciones de los héroes.
// G es siempre el mismo objeto: al empezar o cargar partida se reemplaza su contenido.
'use strict';
import { CL, SK } from './data.js';

export const G = {};
export function setG(o) { for (const k of Object.keys(G)) delete G[k]; Object.assign(G, o); }

export const P = { x: 0, y: 0, px: 0, py: 0, face: 1 };   // posición del jugador (px/py = suavizada)
export const START = { x: 0, y: 0 };                        // Villa Origen
export const st = { seed: 1, busy: false, titleOpen: true, inGame: false, room: null, name: '', online: false };

// Direcciones mantenidas (teclado o cruceta)
export const held = [];
held.clear = function () { this.length = 0; };

// ================= Héroes =================
export function hs(h, k) {
  const c = CL[h.cls];
  return Math.round(c.b[k] + c.g[k] * (h.lvl - 1)) + (h.bonus[k] || 0) + (k === 'atk' ? G.upA * 2 : k === 'def' ? G.upD * 2 : 0);
}
export const S = (u, k) => u.isHero ? hs(u, k) : u[k];
export function mkHero(cls, i) {
  const h = { id: 'h' + i, isHero: true, cls, name: CL[cls].name, e: CL[cls].e, lvl: 1, xp: 0, hp: 0, mp: 0, bonus: {}, buffs: {}, poison: 0 };
  h.hp = hs(h, 'mhp'); h.mp = hs(h, 'mmp'); return h;
}
export const heroes = () => G.party.map(i => G.roster[i]);
export const alive = a => a.filter(u => u.hp > 0);
export const need = l => Math.round(12 * Math.pow(l, 1.7));
export const learned = h => CL[h.cls].sk.filter(k => SK[k].lv <= h.lvl);
export function gainXP(h, x) {
  const msgs = []; h.xp += Math.round(x);
  while (h.xp >= need(h.lvl)) {
    h.xp -= need(h.lvl); const om = S(h, 'mhp'), omm = S(h, 'mmp'); h.lvl++;
    if (h.hp > 0) h.hp += S(h, 'mhp') - om; h.mp += S(h, 'mmp') - omm;
    msgs.push(`⭐ <b>${h.name}</b> sube a nivel ${h.lvl}`);
    for (const k of CL[h.cls].sk) if (SK[k].lv === h.lvl) msgs.push(`✨ ${h.name} aprende <b>${SK[k].n}</b>`);
  }
  return msgs;
}
export const avgLvl = () => { const h = heroes(); return h.reduce((a, b) => a + b.lvl, 0) / h.length; };
export const leader = () => { const l = G.roster[G.leader]; return G.party.includes(G.leader) ? l : heroes()[0]; };
