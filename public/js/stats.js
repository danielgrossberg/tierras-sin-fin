// Estadísticas del jugador (Versión 3 · Fase 6.3). Viven en G.stats (se guardan con la partida, también en el
// servidor) y algunas van al ranking de la sala (achievements.pushStats → stats:push).
// G.stats: playMs, earned, spent, maxHit {dmg, hero, skill}, healed, killsBy {clave: n}, deaths… (más los de logros)
// Por héroe: h.st = { battles, dmg, kills }
'use strict';
import { EN, SK, ACH } from './data.js';
import { G, st, clsName } from './state.js';
import { esc } from './util.js';

const S = () => (G.stats = G.stats || {});
// Tiempo jugado y oro ganado/gastado (se mira cada medio segundo; los cambios de oro se suman o restan)
let lastGold = null;
export function resetTrack() { lastGold = null; }
export function statsTick(dtMs) {
  if (!st.inGame || !G.roster) return;
  const s = S(); s.playMs = (s.playMs || 0) + Math.min(dtMs, 5000);
  if (lastGold === null) { lastGold = G.gold; return; }
  const d = G.gold - lastGold; if (d > 0) s.earned = (s.earned || 0) + d; else if (d < 0) s.spent = (s.spent || 0) - d; lastGold = G.gold;
}
const hst = h => (h.st = h.st || { battles: 0, dmg: 0, kills: 0 });
// Golpe a un enemigo (solo mis héroes): daño total, golpes finales y el golpe más fuerte
export function noteHit(h, dmg, killed, skill) {
  if (!h || !h.isHero || h.remote || dmg <= 0) return;
  const x = hst(h); x.dmg += dmg; if (killed) x.kills++;
  const s = S(); if (!s.maxHit || dmg > s.maxHit.dmg) s.maxHit = { dmg, hero: h.name, e: h.e, skill: skill && SK[skill] ? SK[skill].n : 'Ataque' };
}
export function noteHeal(by, amt) { if (by && by.isHero && !by.remote && amt > 0) { const s = S(); s.healed = (s.healed || 0) + amt; } }
export function noteKills(keys) { const s = S(); s.killsBy = s.killsBy || {}; for (const k of keys) s.killsBy[k] = (s.killsBy[k] || 0) + 1; }
export function noteBattle(party) { for (const h of party) if (h.isHero && !h.remote) hst(h).battles++; }
export function noteDeath() { G.deaths = (G.deaths || 0) + 1; }

// ================= Panel 📊 =================
const fmt = n => Math.round(n || 0).toLocaleString('es-CL');
export const playTime = ms => { const m = Math.floor((ms || 0) / 60000), h = Math.floor(m / 60); return h ? `${h} h ${m % 60} min` : `${m} min`; };
export function statsTabHTML() {
  const s = S(), kb = Object.entries(s.killsBy || {}).sort((a, b) => b[1] - a[1]), achN = Object.keys(G.ach || {}).length;
  const row = (l, v) => `<div class="strow"><span>${l}</span><b>${v}</b></div>`;
  const mh = s.maxHit;
  let h = `<div class="stgrid">
    <div class="sec"><h3>🧭 General</h3>${row('⏱️ Tiempo jugado', playTime(s.playMs))}${row('👣 Pasos', fmt(G.steps))}${row('📏 Distancia máxima', fmt(s.maxDist) + ' casillas')}${row('📅 Días jugados', fmt(s.dailyDays))}${row('🔥 Racha máxima', fmt(s.bestStreak) + ' días')}${row('🏆 Logros', `${achN} de ${ACH.length}`)}</div>
    <div class="sec"><h3>⚔️ Combate</h3>${row('👾 Monstruos derrotados', fmt(s.kills))}${row('👑 Jefes', fmt(G.bosses))}${row('🕳️ Mazmorras completadas', fmt(s.dungeons))}${row('💀 Caídas del grupo', fmt(G.deaths))}${row('💥 Golpe más fuerte', mh ? `${fmt(mh.dmg)} <small class="mut">${esc(mh.e || '')} ${esc(mh.hero)} · ${esc(mh.skill)}</small>` : '—')}${row('💚 Curación total', fmt(s.healed))}</div>
    <div class="sec"><h3>💰 Economía y oficios</h3>${row('Oro ganado', fmt(s.earned))}${row('Oro gastado', fmt(s.spent))}${row('🪨 Materiales recolectados', fmt(s.gathered))}${row('🛠️ Objetos fabricados', fmt(s.crafted))}</div>
  </div>
  <div class="sec"><h3>👾 Monstruos por tipo</h3>${kb.length ? `<div class="kbgrid">${kb.slice(0, 18).map(([k, n]) => `<div class="kb"><span class="emoji" style="filter:${EN[k] && EN[k].tint || 'none'}">${EN[k] ? EN[k].e : '❔'}</span><small>${EN[k] ? EN[k].n : k}</small><b>${fmt(n)}</b></div>`).join('')}</div>` : '<p class="mut small" style="margin:0">Aún no derrotas monstruos.</p>'}</div>
  <div class="sec"><h3>🧑 Por héroe</h3><div class="hstat"><div class="hsh"><span>Héroe</span><span>Combates</span><span>Daño</span><span>Golpes finales</span></div>
    ${G.roster.filter(x => x.st && x.st.battles).sort((a, b) => b.st.dmg - a.st.dmg).map(x => `<div class="hsr"><span>${x.e} ${esc(x.name)} <small class="mut">${clsName(x)}</small></span><span>${fmt(x.st.battles)}</span><span>${fmt(x.st.dmg)}</span><span>${fmt(x.st.kills)}</span></div>`).join('') || '<p class="mut small" style="margin:4px 0 0">Todavía no hay combates.</p>'}</div></div>
  <p class="mut small">Se guardan con tu partida (también en el servidor). Compárate con tus amigos en 🏆 Logros → Ranking.</p>`;
  return h;
}
