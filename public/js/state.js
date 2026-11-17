// Estado compartido entre módulos y funciones de los héroes.
// G es siempre el mismo objeto: al empezar o cargar partida se reemplaza su contenido.
'use strict';
import { CL, SK } from './data.js';

export const G = {};
export function setG(o) { for (const k of Object.keys(G)) delete G[k]; Object.assign(G, o); }

export const P = { x: 0, y: 0, px: 0, py: 0, face: 1 };   // posición del jugador (px/py = suavizada)
export const START = { x: 0, y: 0 };                        // Ciudad Origen
export const st = { seed: 1, busy: false, titleOpen: true, inGame: false, room: null, name: '', online: false };

// Direcciones mantenidas (teclado o cruceta)
export const held = [];
held.clear = function () { this.length = 0; };

// ================= Héroes =================
// Suma de un stat en el equipo puesto (incluye % crítico, robo de vida, res. veneno)
export function eqSum(h, k) { let s = 0; const e = h.equip; if (e) for (const sl in e) { const it = e[sl]; if (it && it.st && it.st[k]) s += it.st[k]; } return s; }
// ¿Lleva puesto un legendario con este efecto?
export function heroFx(h, fx) { const e = h && h.isHero && h.equip; if (e) for (const sl in e) if (e[sl] && e[sl].fx === fx) return true; return false; }
export function hs(h, k) {
  const c = CL[h.cls];
  // Un héroe de otro jugador (combate cooperativo) trae sus propias mejoras de herrería (upA/upD)
  const ua = h.upA != null ? h.upA : G.upA, ud = h.upD != null ? h.upD : G.upD;
  return Math.round(c.b[k] + c.g[k] * (h.lvl - 1)) + (h.bonus[k] || 0) + (k === 'atk' ? ua * 2 : k === 'def' ? ud * 2 : 0) + eqSum(h, k);
}
export const S = (u, k) => u.isHero ? hs(u, k) : u[k];
// Tras cambiar equipo, la vida/magia actual no puede pasar del nuevo máximo
export function clampHero(h) { h.hp = Math.min(h.hp, hs(h, 'mhp')); h.mp = Math.min(h.mp, hs(h, 'mmp')); }
// Cambia el equipo de un héroe: si sube el máximo de PV/PM, la vida/magia actual sube lo mismo (como al subir de nivel)
export function changeEquip(h, fn) {
  const om = hs(h, 'mhp'), omm = hs(h, 'mmp'); fn();
  const dm = hs(h, 'mhp') - om, dmm = hs(h, 'mmp') - omm;
  if (h.hp > 0 && dm > 0) h.hp += dm; if (dmm > 0) h.mp += dmm;
  clampHero(h);
}
export function mkHero(cls, i) {
  const h = { id: 'h' + i, isHero: true, cls, name: CL[cls].name, e: CL[cls].e, lvl: 1, xp: 0, hp: 0, mp: 0, bonus: {}, buffs: {}, poison: 0, equip: {} };
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
// Partida nueva: oro y objetos iniciales
export const START_GOLD = 30;
export const startItems = () => ({ pocion: 3, eter: 1, pluma: 1 });

// (La muerte de todo el grupo ahora la maneja battle.js + tomb.js: se conserva el progreso y los objetos
//  quedan en una tumba 🪦. La regla anterior de "empezar de cero" se eliminó en la Versión 2.)
export const avgLvl = () => { const h = heroes(); return h.reduce((a, b) => a + b.lvl, 0) / h.length; };
export const leader = () => { const l = G.roster[G.leader]; return G.party.includes(G.leader) ? l : heroes()[0]; };
