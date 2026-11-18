// Jefe de mundo semanal (Versión 3 · Fase 4): 🌋 Titán de Lava.
// - Aparece cada semana en una posición determinista (semilla de la sala + número de semana), a 60–100 casillas
//   de Ciudad Origen. Todos los jugadores le bajan la MISMA vida, que guarda el servidor (net.wb).
// - Cada intento dura máx. 10 rondas; luego "se retira" y el daño queda registrado (wb:hit).
// - Al derrotarlo, cada jugador que aportó recibe oro, equipo Épico o Legendario según su daño y el logro/título.
'use strict';
import { mulberry, hashI, esc, cardinalWord } from './util.js';
import { EN, WB_KEY, WB_ROUNDS, blockT } from './data.js';
import { G, P, START, st, heroes, S } from './state.js';
import { tileAt, feats } from './world.js';
import { net, netAsk } from './net.js';
import { now as srvNow } from './daynight.js';
import { openModal, closeModal, toast, feed, updateHUD } from './ui.js';
import { startBattle } from './battle.js';
import { askHelp, canAskHelp } from './coop.js';
import { rollLoot, addItem, itemLabel, RAR } from './items.js';
import { bump, noteItem } from './achievements.js';
import { save } from './storage.js';

// ---- Posición de esta semana
let posCache = null;
export function wbPos() {
  const w = net.wb; if (!w) return null;
  if (posCache && posCache.week === w.week && posCache.seed === st.seed) return posCache.p;
  const r = mulberry(hashI(w.week, 77, st.seed + 8800)), a = r() * Math.PI * 2, d = 60 + r() * 40;
  const cx = Math.round(START.x + Math.cos(a) * d), cy = Math.round(START.y + Math.sin(a) * d);
  let p = { x: cx, y: cy };
  search: for (let rad = 0; rad < 30; rad++) for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) {
    if (Math.max(Math.abs(i), Math.abs(j)) !== rad) continue;
    const x = cx + i, y = cy + j, t = tileAt(x, y);
    if (!blockT(t) && t.b !== 'WATER' && !feats.has(x + ',' + y)) { p = { x, y }; break search; }
  }
  posCache = { week: w.week, seed: st.seed, p };
  return p;
}
export const wbAlive = () => !!(net.wb && !net.wb.killed && net.wb.hp > 0);
export const isWBTile = (x, y) => { if (!wbAlive()) return false; const p = wbPos(); return p && p.x === x && p.y === y; };
const fmt = n => Math.round(n).toLocaleString('es-CL');
export const wbWhere = () => { const p = wbPos(); if (!p) return ''; const dx = p.x - P.x, dn = P.y - p.y, d = Math.round(Math.hypot(dx, dn)); return d ? `${d} casillas al ${cardinalWord(dx, dn)}` : 'aquí'; };

// ---- Ventana del jefe de mundo
function contribHTML(w) {
  const l = Object.entries(w.contrib || {}).sort((a, b) => b[1] - a[1]), tot = l.reduce((a, x) => a + x[1], 0);
  if (!l.length) return '<p class="mut small">Nadie lo ha atacado esta semana.</p>';
  return `<div class="wbc">${l.slice(0, 8).map(([n, v]) => `<div class="rkrow ${n === net.name ? 'me' : ''}"><span>${esc(n)}</span><b>${fmt(v)} · ${Math.round(100 * v / tot)}%</b></div>`).join('')}</div>`;
}
function wbRender() {
  const w = net.wb, e = EN[WB_KEY], pct = w ? Math.round(100 * w.hp / w.mhp) : 0;
  return `<div class="bossc"><div class="bcrown emoji">🌋</div><div class="bsprite emoji" style="filter:${e.tint}">${e.e}</div><h2>${e.n}</h2>
    <div class="blv"><span>Nivel <b>${w.lvl}</b></span><span>Semana <b>${w.week}</b></span>${w.gen ? `<span>Más fuerte ×${w.gen + 1}</span>` : ''}</div>
    <div class="wbbar"><i style="width:${pct}%"></i><span>PV ${fmt(w.hp)} / ${fmt(w.mhp)}</span></div>
    <p class="bnote">Vida compartida por toda la sala. Cada intento dura máximo ${WB_ROUNDS} rondas; después el titán se retira y tu daño queda registrado. Si cae tu grupo, aplica la tumba 🪦.</p>
    <h3 style="margin:8px 0 4px">Aporte de cada jugador</h3>${contribHTML(w)}
    <div class="bbtns3"><button class="btn gold big" data-a="fight">⚔️ Atacar con tu grupo</button><button class="btn big help" data-a="help" ${canAskHelp() ? '' : 'disabled'}>📣 Pedir ayuda</button><button class="btn big" data-a="retreat">🏃 Retirarse</button></div></div>`;
}
export async function openWorldBoss() {
  if (!net.joined) { toast('🌋 El jefe de mundo necesita conexión con el servidor'); return; }
  const r = await netAsk('wb:get', {}); if (r && r.ok) net.wb = r.wb;
  if (!wbAlive()) { toast('🌋 El titán ya fue derrotado esta semana'); return; }
  openModal(wbRender, async a => {
    if (a === 'retreat') { closeModal(); return; }
    const m = wbMonster(); closeModal();
    if (a === 'fight') startBattle(m);
    else if (a === 'help') askHelp(m);
  });
}
// Monstruo para el combate (la vida la pone battle.js desde m.wb)
export function wbMonster() {
  const w = net.wb, p = wbPos();
  return { id: 'wb@' + w.week, x: p.x, y: p.y, wx: p.x, wy: p.y, lvl: w.lvl, biome: tileAt(p.x, p.y).b, group: [WB_KEY], boss: true, luck: .6, wb: { week: w.week, hp: w.hp, mhp: w.mhp } };
}
// Daño de un intento: lo manda al servidor (parts = { nombre: daño })
export async function wbReport(week, parts) {
  if (!net.joined) return null;
  const r = await netAsk('wb:hit', { week, parts });
  if (r && r.wb) net.wb = r.wb;
  return r;
}
// ---- Al cambiar el estado (al entrar o cuando alguien le pega): anuncio y recompensa si cayó
export function onWB() {
  const w = net.wb; if (!w || !st.inGame) return;
  if (G.wbSeen !== w.week && !w.killed) { G.wbSeen = w.week; feed(`🌋 <b>¡Apareció el Titán de Lava!</b> Está a ${wbWhere()} · vida compartida por toda la sala`); }
  const mine = (w.contrib || {})[net.name] || 0;
  if (w.killed && mine > 0 && G.wbClaim !== w.week) {
    G.wbClaim = w.week;
    const tot = Object.values(w.contrib).reduce((a, v) => a + v, 0) || 1, share = mine / tot;
    const gold = Math.round((400 + 2200 * share) * (1 + .5 * w.gen)); G.gold += gold;
    const it = rollLoot(w.lvl, 1, share >= .25 || Math.random() < .3 ? 'legendario' : 'epico'); const ok = addItem(it); if (ok) noteItem(it);
    bump('wbKills');
    toast(`🌋 ¡El Titán de Lava cayó!<br><span style="font-size:14px">Tu aporte: ${Math.round(share * 100)}% · +${fmt(gold)} oro</span>`);
    feed(`🎁 Recompensa del titán: ${ok ? itemLabel(it) : 'inventario lleno'} · +${fmt(gold)} oro`);
    save('now'); updateHUD();
  }
}
export { WB_ROUNDS };
