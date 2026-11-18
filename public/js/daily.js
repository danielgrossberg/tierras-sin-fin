// Recompensa diaria (Versión 3 · Fase 6.2).
// El servidor decide el día (hora de Chile) y valida el cobro (un premio por jugador y por día). Aquí se muestra el
// calendario de 7 días y se entrega el premio que el servidor aprobó. Después del día 7 se repite con premios mejores.
'use strict';
import { ELIX, NODES } from './data.js';
import { G, st, heroes } from './state.js';
import { net, netAsk } from './net.js';
import { openModal, closeModal, isModalOpen, toast } from './ui.js';
import { rollLoot, addItem, itemLabel, RAR } from './items.js';
import { addEgg } from './pets.js';
import { giveElix } from './economy.js';
import { addMat, matLabel } from './gather.js';
import { save } from './storage.js';

export const DAYS = [
  { e: '💰', n: 'Oro' }, { e: '🧪', n: 'Pociones' }, { e: '🪨', n: 'Materiales' }, { e: '⚗️', n: 'Elixir' },
  { e: '💰', n: 'Más oro' }, { e: '🛡️', n: 'Equipo raro' }, { e: '🥚', n: 'Huevo o equipo épico' },
];
const mulOf = cycle => Math.min(2, 1 + .25 * cycle);   // "algo mejores" en cada ciclo
const maxLvl = () => Math.max(...G.roster.map(h => h.lvl));

// Entrega el premio del día (1..7) del ciclo dado. Devuelve líneas para mostrar.
export function grant(day, cycle) {
  const m = mulOf(cycle), lvl = maxLvl(), out = [];
  const gearLine = it => addItem(it) ? `${itemLabel(it)} <small style="color:${RAR[it.r].c}">${RAR[it.r].n} · Nv ${it.ilvl}</small>` : '🎒 Inventario lleno: no cupo el equipo';
  if (day === 1 || day === 5) { const g = Math.round((day === 1 ? 80 + 12 * lvl : 200 + 30 * lvl) * m); G.gold += g; out.push(`💰 +${g} de oro`); }
  if (day === 2) { const p = Math.round(3 * m), e = Math.round(1 * m), a = 2; G.items.pocion += p; G.items.eter += e; G.items.antidoto = (G.items.antidoto || 0) + a; out.push(`🧪 ${p} Pociones · 🔷 ${e} Éter · 💧 ${a} Antídotos`); }
  if (day === 3) {
    const t = Math.min(3, Math.floor(((G.stats && G.stats.maxDist) || 0) / 60)), n = Math.round(4 * m);
    for (const k of ['herb', 'ore', 'fish']) { const list = NODES[k].list, mat = list[Math.min(list.length - 1, t)]; out.push(matLabel(mat, addMat(mat, k === 'fish' ? Math.ceil(n / 2) : n))); }
  }
  if (day === 4) { const keys = Object.keys(ELIX), k = keys[Math.floor(Math.random() * keys.length)]; giveElix(k, Math.round(30 * m) * 60000); out.push(`${ELIX[k].e} ${ELIX[k].n} por ${Math.round(30 * m)} minutos`); }
  if (day === 6) out.push('🎁 ' + gearLine(rollLoot(lvl, .3, 'raro')));
  if (day === 7) {
    const egg = cycle >= 1 || Math.random() < .5, epic = cycle >= 1 || !egg;
    if (egg) { addEgg('diaria'); out.push('🥚 ¡Huevo de mascota! Eclosiona en 300 pasos'); }
    if (epic) out.push('🎁 ' + gearLine(rollLoot(lvl, .6, 'epico')));
  }
  return out;
}

// ---- Ventana del calendario
let V = null, RES = null, BUSY = false;
function render() {
  const v = V, cur = v.day, cyc = v.cycle;
  return `<div class="daily"><h2>🎁 Recompensa diaria</h2>
    <p class="mut" style="margin:0">${v.claimed ? 'Ya recogiste el premio de hoy. ¡Vuelve mañana!' : 'Entra cada día para que los premios suban.'}${cyc ? ` <b class="goldt">Ciclo ${cyc + 1}: premios ×${mulOf(cyc).toFixed(2).replace(/\.?0+$/, '')}</b>` : ''}</p>
    <div class="streak">🔥 <b>${v.claimed ? v.streak : v.next - 1}</b> día${(v.claimed ? v.streak : v.next - 1) === 1 ? '' : 's'} seguido${(v.claimed ? v.streak : v.next - 1) === 1 ? '' : 's'}${v.best ? ` · récord ${v.best}` : ''}</div>
    <div class="dcal">${DAYS.map((d, i) => { const n = i + 1, done = n < cur || (v.claimed && n === cur), now = n === cur && !v.claimed;
      return `<div class="dday ${done ? 'done' : ''} ${now ? 'now' : ''}"><small>Día ${n}</small><span class="emoji">${done ? '✅' : d.e}</span><small>${d.n}</small></div>`; }).join('')}</div>
    ${RES ? `<div class="pend">${RES}</div>` : ''}
    <div class="row end">${!v.claimed ? `<button class="btn gold big" data-a="claim" ${BUSY ? 'disabled' : ''}>🎁 Recoger día ${cur}</button>` : ''}<button class="btn" data-a="close">${v.claimed ? 'Cerrar' : 'Después'}</button></div></div>`;
}
export function openDaily(v) {
  V = v; RES = null; BUSY = false;
  openModal(render, handler);
}
async function handler(a) {
    if (a === 'close') { closeModal(); return; }
    if (a === 'claim' && !BUSY) {
      BUSY = true;
      const r = await netAsk('daily:claim', {});
      BUSY = false;
      if (!r || !r.ok) { RES = '⚠️ ' + ((r && r.error) || 'No se pudo cobrar (sin conexión).'); if (r && r.today) V = r; }
      else {
        const lines = grant(r.day, r.cycle); V = r;
        G.stats = G.stats || {}; G.stats.dailyDays = r.days; G.stats.bestStreak = r.best;
        RES = `<b>¡Día ${r.day}!</b><br>${lines.join('<br>')}`; save('now');
        toast(`🎁 Recompensa diaria · día ${r.day}<br><span style="font-size:13px">🔥 ${r.streak} día${r.streak === 1 ? '' : 's'} seguido${r.streak === 1 ? '' : 's'}</span>`);
      }
      if (isModalOpen()) openModal(render, handler);
    }
}
// Al entrar al juego: si hay premio por cobrar, se abre la ventana (cuando no haya otra abierta)
export async function checkDaily(force) {
  if (!net.joined) return null;
  const v = await netAsk('daily:get', {}); if (!v || !v.ok) return null;
  if (G.stats) { G.stats.dailyDays = v.days; G.stats.bestStreak = v.best; }
  if (v.claimed && !force) return v;
  for (let i = 0; i < 40 && (isModalOpen() || st.busy || !st.inGame); i++) await new Promise(r => setTimeout(r, 500));
  if (st.inGame && !isModalOpen()) openDaily(v);
  return v;
}
