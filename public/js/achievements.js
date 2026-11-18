// Logros, títulos y ranking de la sala (Versión 3 · Fase 4).
// - G.stats: contadores (monstruos, jefes limpios, mazmorras, cofres, distancia máxima, etc.)
// - G.ach = { id: fecha } · G.title = título elegido (se muestra bajo el nombre)
// - G.arena = { pts, w, l } (puntos de la arena PvP)
// Al desbloquear: aviso propio + aviso a la sala ("🏆 Dani consiguió «Matadragones»") y recompensa.
// El ranking lo arma el servidor con lo que manda cada jugador (stats:push) y lo guarda en la base de datos.
'use strict';
import { ACH, ACH_CATS } from './data.js';
import { G, P, START, talList } from './state.js';
import { esc } from './util.js';
import { notice, statsPush, netAsk, net } from './net.js';
import { rollLoot, addItem, itemLabel, RAR } from './items.js';
import { toast, feed } from './ui.js';
import { addMount } from './mounts.js';
import { MOUNTS } from './data.js';

const S0 = { kills: 0, nightKills: 0, cleanBoss: 0, dungeons: 0, coopWins: 0, chests: 0, maxDist: 0, legend: 0, wbHits: 0, wbKills: 0, pvpWins: 0 };
export const stats = () => (G.stats = Object.assign({}, S0, G.stats || {}));
export function bump(k, n = 1) { const s = stats(); s[k] = (s[k] || 0) + n; }
// Distancia máxima a Ciudad Origen (se llama al caminar)
export function noteDist() { const s = stats(), d = Math.round(Math.hypot(P.x - START.x, P.y - START.y)); if (d > s.maxDist) s.maxDist = d; }
// Objeto legendario conseguido (se llama al recibir equipo)
export const noteItem = it => { if (it && it.r === 'legendario') stats().legend = 1; };

const allGear = () => [...(G.inventory || []), ...G.roster.flatMap(h => Object.values(h.equip || {}))].filter(Boolean);
// Estadísticas completas para revisar los logros
function full() {
  const s = stats(), gear = allGear(), start = 'village@' + START.x + ',' + START.y;
  return Object.assign({}, s, {
    villages: Object.keys(G.vv || {}).filter(k => k !== start).length, boat: !!G.boat, bosses: G.bosses || 0, gold: G.gold || 0,
    pets: (G.pets || []).length, legend: s.legend || gear.some(i => i.r === 'legendario'), epics: gear.filter(i => i.r === 'epico' || i.r === 'legendario').length,
    lvl15: G.roster.filter(h => h.lvl >= 15).length, advs: G.roster.filter(h => h.adv).length, maxLvl: Math.max(...G.roster.map(h => h.lvl)),
    talents: G.roster.reduce((a, h) => a + talList(h).length, 0),
    cityDone: (net.city && net.city.credits && net.city.credits[net.name]) || 0, forgeMax: s.forgeMax || 0,
  });
}
// Progreso de los logros que se cuentan (para la barra)
const PROG = { forge10: ['forgeMax', 10], exp100: ['maxDist', 100], exp250: ['maxDist', 250], exp500: ['maxDist', 500], vil10: ['villages', 10], vil25: ['villages', 25], k100: ['kills', 100], k500: ['kills', 500], boss10: ['bosses', 10],
  night50: ['nightKills', 50], dun5: ['dungeons', 5], dun10: ['dungeons', 10], coop5: ['coopWins', 5], pets3: ['pets', 3], gold2k: ['gold', 2000], chest25: ['chests', 25], epic5: ['epics', 5], cls15: ['lvl15', 3], lvl30: ['maxLvl', 30], tal10: ['talents', 10], pvp10: ['pvpWins', 10] };
export const achCount = () => Object.keys(G.ach || {}).length;

// Revisa y desbloquea. Devuelve los logros nuevos.
export function checkAch() {
  if (!G.roster) return [];
  G.ach = G.ach || {}; const s = full(), got = [];
  for (const a of ACH) {
    if (G.ach[a.id]) continue;
    let ok = false; try { ok = !!a.need(s); } catch (e) { ok = false; }
    if (!ok) continue;
    G.ach[a.id] = Date.now(); got.push(a);
    let rw = '';
    if (a.reward && a.reward.gold) { G.gold += a.reward.gold; rw += ` · +${a.reward.gold} oro`; }
    if (a.reward && a.reward.item) { const it = rollLoot(Math.max(1, s.maxLvl), .5, a.reward.item); if (addItem(it)) { noteItem(it); rw += ' · ' + itemLabel(it); } }
    if (a.reward && a.reward.mount) { const mm = addMount(a.reward.mount); if (mm) rw += ` · ${MOUNTS[a.reward.mount].e} ${MOUNTS[a.reward.mount].n}`; }
    feed(`🏆 <b>¡Logro!</b> ${esc(a.n)} · título «${esc(a.title)}»${rw}`);
    notice('ach', a.n);
  }
  if (got.length) { toast(`🏆 ¡Logro!<br><span style="font-size:15px">${esc(got[0].n)}</span><br><span style="font-size:12px">Título: «${esc(got[0].title)}» (elígelo en 🎒 Grupo → Logros)</span>`); pushStats(true); }
  return got;
}
// Lo que se manda al servidor para el ranking (solo si cambió)
let lastPush = '', lastT = 0;
export function pushStats(force) {
  const s = stats(), a = G.arena || {}, d = { ach: achCount(), dist: s.maxDist || 0, bosses: G.bosses || 0, arena: a.pts || 0, wins: a.w || 0, title: G.title || null, lvl: Math.max(...G.roster.map(h => h.lvl)),
    kills: s.kills || 0, hit: s.maxHit ? s.maxHit.dmg : 0, play: Math.floor((s.playMs || 0) / 60000) };   // 6.3: monstruos, golpe más fuerte, minutos jugados
  const k = JSON.stringify(d); if (k === lastPush || (!force && Date.now() - lastT < 15000)) return;
  lastPush = k; lastT = Date.now(); statsPush(d);
}

// ================= Panel (🎒 Grupo → 🏆 Logros) =================
let RANK = null, RANKING = false;
export async function loadRank() {
  if (!net.joined) { RANK = { off: true }; return; }
  RANKING = true; const r = await netAsk('rank:get', {}); RANKING = false;
  RANK = r && r.ok ? r.list : { off: true };
}
function rankHTML() {
  if (!RANK) return `<button class="btn full" data-a="rank">📊 Ver ranking de la sala</button>`;
  if (RANK.off) return '<p class="mut small">El ranking necesita conexión con el servidor.</p>';
  const col = (title, key, fmt) => { const l = RANK.slice().sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, 5);
    return `<div class="rkcol"><b>${title}</b>${l.map((x, i) => `<div class="rkrow ${x.name === net.name ? 'me' : ''}"><span>${['🥇', '🥈', '🥉', '4.', '5.'][i]} ${esc(x.name)}</span><b>${fmt(x[key] || 0)}</b></div>`).join('') || '<small class="mut">—</small>'}</div>`; };
  return `<div class="rank">${col('🏆 Más logros', 'ach', v => v)}${col('🧭 Más lejos', 'dist', v => v + ' c')}${col('👑 Más jefes', 'bosses', v => v)}${col('⚔️ Arena', 'arena', v => v + ' pts')}${col('👾 Más monstruos', 'kills', v => v.toLocaleString('es-CL'))}${col('💥 Golpe más fuerte', 'hit', v => v.toLocaleString('es-CL'))}${col('⏱️ Más tiempo jugado', 'play', v => v >= 60 ? Math.floor(v / 60) + ' h' : v + ' min')}</div>
    <button class="btn sm" data-a="rank">🔄 Actualizar</button>`;
}
export function achTabHTML() {
  checkAch();
  const s = full(), have = G.ach || {}, titles = ACH.filter(a => have[a.id]);
  let h = `<div class="achhead"><b>🏆 ${achCount()} de ${ACH.length} logros</b><button class="btn sm gold" data-a="daily">🎁 Recompensa diaria</button><div class="titles"><span class="mut small">Título bajo tu nombre:</span>
    <button class="tchip ${!G.title ? 'on' : ''}" data-a="title" data-k="">Sin título</button>${titles.map(a => `<button class="tchip ${G.title === a.title ? 'on' : ''}" data-a="title" data-k="${a.id}">${esc(a.title)}</button>`).join('')}</div></div>`;
  for (const [cat, cn] of Object.entries(ACH_CATS)) {
    h += `<h3 class="achcat">${cn}</h3><div class="achlist">` + ACH.filter(a => a.cat === cat).map(a => {
      const ok = !!have[a.id], pg = PROG[a.id], v = pg ? Math.min(s[pg[0]] || 0, pg[1]) : 0;
      const rw = a.reward ? [a.reward.gold ? `💰 ${a.reward.gold}` : '', a.reward.item ? `🎁 ${a.reward.item === 'legendario' ? 'Legendario' : a.reward.item === 'epico' ? 'Épico' : 'Raro'}` : '', a.reward.mount ? `${MOUNTS[a.reward.mount].e} ${MOUNTS[a.reward.mount].n}` : ''].filter(Boolean).join(' · ') : '';
      return `<div class="achrow ${ok ? 'ok' : ''}"><span class="achi">${ok ? '🏆' : '🔒'}</span><div class="acht"><b>${esc(a.n)}</b><small>${esc(a.d)}</small><small class="goldt">«${esc(a.title)}»${rw ? ' · ' + rw : ''}</small>
        ${pg && !ok ? `<span class="bar xp"><i style="width:${Math.round(100 * v / pg[1])}%"></i></span><small class="mut">${v}/${pg[1]}</small>` : ''}</div></div>`;
    }).join('') + '</div>';
  }
  h += `<h3 class="achcat">📊 Ranking de la sala</h3>${RANKING ? '<p class="mut small">Cargando…</p>' : rankHTML()}`;
  return h;
}
export function setTitle(id) { const a = ACH.find(x => x.id === id); G.title = a && G.ach && G.ach[a.id] ? a.title : null; pushStats(true); }
