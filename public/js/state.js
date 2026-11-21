// Estado compartido entre módulos y funciones de los héroes.
// G es siempre el mismo objeto: al empezar o cargar partida se reemplaza su contenido.
'use strict';
import { CL, SK, ADV, ADV_LVL, TAL, TAL_LVLS, FOODS } from './data.js';
import { sfx } from './audio.js';
// Comida activa (Versión 3 · Fase 6.1): G.food = { k, until }
export const foodP = k => { const f = G.food; return f && f.until > Date.now() && FOODS[f.k] ? (FOODS[f.k].fx[k] || 0) : 0; };

// ================= Talentos y clase avanzada (Versión 3 · Fase 2) =================
// h.tal = { 5: 0|1, 10: 0|1, … } (índice de la opción elegida) · h.adv = 'paladin' | null
export const talList = h => { const t = TAL[h.cls], out = []; if (t && h.tal) for (const L of TAL_LVLS) { const i = h.tal[L]; if (i === 0 || i === 1) out.push(t[L][i]); } return out; };
// Suma de un efecto numérico de los talentos elegidos (0 si no tiene)
export function talFx(h, k) { if (!h || !h.isHero) return 0; let s = 0; for (const t of talList(h)) if (typeof t.fx[k] === 'number') s += t.fx[k]; return s; }
// Efectos por habilidad: skB (más daño) y skBurn (quema)
export function talSk(h, kind, sk) { if (!h || !h.isHero) return 0; let s = 0; for (const t of talList(h)) if (t.fx[kind] && t.fx[kind][sk]) s += t.fx[kind][sk]; return s; }
// Talento o clase avanzada pendiente de elegir
export const pendingTal = h => TAL[h.cls] ? TAL_LVLS.find(L => h.lvl >= L && !(h.tal && (h.tal[L] === 0 || h.tal[L] === 1))) || null : null;
export const pendingAdv = h => h.lvl >= ADV_LVL && !h.adv;
export const hasPending = h => !!(pendingTal(h) || pendingAdv(h));
// Título de la clase (avanzada si la tiene)
export const clsName = h => (h.adv && ADV[h.adv] ? ADV[h.adv].n : CL[h.cls].n);

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
// (con la mejora de la forja: +8% por nivel)
export function eqSum(h, k) { let s = 0; const e = h.equip; if (e) for (const sl in e) { const it = e[sl]; if (it && it.st && it.st[k]) s += Math.round(it.st[k] * (1 + .08 * (it.up || 0))); } return s; }
// Elixires activos (Versión 3 · Fase 5): G.elix = { clave: hora en que se acaba (ms) }
export const elix = k => !!(G.elix && G.elix[k] && G.elix[k] > Date.now());
// ¿Lleva puesto un legendario con este efecto?
export function heroFx(h, fx) { const e = h && h.isHero && h.equip; if (e) for (const sl in e) if (e[sl] && e[sl].fx === fx) return true; return false; }
export function hs(h, k) {
  const c = CL[h.cls];
  // Un héroe de otro jugador (combate cooperativo) trae sus propias mejoras de herrería (upA/upD)
  const ua = h.upA != null ? h.upA : G.upA, ud = h.upD != null ? h.upD : G.upD;
  // Clase avanzada: el crecimiento cambia un poco desde el nivel 15
  const a = h.adv && ADV[h.adv], ag = a && a.g[k] ? c.g[k] * (a.g[k] - 1) * Math.max(0, h.lvl - ADV_LVL) : 0;
  const v = Math.round(c.b[k] + c.g[k] * (h.lvl - 1) + ag) + (h.bonus[k] || 0) + (k === 'atk' ? ua * 2 : k === 'def' ? ud * 2 : 0) + eqSum(h, k);
  const p = talFx(h, k + 'P') + (k === 'mhp' && !h.remote && elix('coloso') ? .15 : 0) + (h.remote ? 0 : foodP(k + 'P'));   // talentos y Elixir del Coloso: +% a un stat
  return p ? Math.round(v * (1 + p)) : v;
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
  const h = { id: 'h' + i, isHero: true, cls, name: CL[cls].name, e: CL[cls].e, lvl: 1, xp: 0, hp: 0, mp: 0, bonus: {}, buffs: {}, poison: 0, equip: {}, tal: {}, adv: null };
  h.hp = hs(h, 'mhp'); h.mp = hs(h, 'mmp'); return h;
}
export const heroes = () => G.party.map(i => G.roster[i]);
export const alive = a => a.filter(u => u.hp > 0);
export const need = l => Math.round(12 * Math.pow(l, 1.7));
export const learned = h => [...CL[h.cls].sk, ...(h.adv && ADV[h.adv] ? ADV[h.adv].sk : [])].filter(k => SK[k].lv <= (h.skLvl || h.lvl));   // skLvl: nivel real en un duelo nivelado
export function gainXP(h, x) {
  // Elixir de Sabiduría (+30%) y descanso de la Posada mejorada (+10/20/30% por 10 min)
  x *= 1 + (elix('sabio') ? .3 : 0) + (elix('descanso') ? (G.restBonus || 0) : 0);
  const msgs = []; h.xp += Math.round(x);
  while (h.xp >= need(h.lvl)) {
    h.xp -= need(h.lvl); const om = S(h, 'mhp'), omm = S(h, 'mmp'); h.lvl++; if (!h.remote) sfx('level');
    if (h.hp > 0) h.hp += S(h, 'mhp') - om; h.mp += S(h, 'mmp') - omm;
    msgs.push(`⭐ <b>${h.name}</b> sube a nivel ${h.lvl}`);
    for (const k of CL[h.cls].sk) if (SK[k].lv === h.lvl) msgs.push(`✨ ${h.name} aprende <b>${SK[k].n}</b>`);
    if (h.adv && ADV[h.adv]) for (const k of ADV[h.adv].sk) if (SK[k].lv === h.lvl) msgs.push(`✨ ${h.name} aprende <b>${SK[k].n}</b>`);
    if (TAL_LVLS.includes(h.lvl)) msgs.push(`🌟 ${h.name} puede elegir un <b>talento</b> (👥 Grupo)`);
    if (h.lvl === ADV_LVL && !h.adv) msgs.push(`👑 ${h.name} puede elegir su <b>clase avanzada</b> (👥 Grupo)`);
  }
  return msgs;
}
// Partida nueva: oro y objetos iniciales
export const START_GOLD = 30;
export const startItems = () => ({ pocion: 3, eter: 1, pluma: 1, antidoto: 1 });

// (La muerte de todo el grupo ahora la maneja battle.js + tomb.js: se conserva el progreso y los objetos
//  quedan en una tumba 🪦. La regla anterior de "empezar de cero" se eliminó en la Versión 2.)
export const avgLvl = () => { const h = heroes(); return h.reduce((a, b) => a + b.lvl, 0) / h.length; };
export const leader = () => { const l = G.roster[G.leader]; return G.party.includes(G.leader) ? l : heroes()[0]; };
