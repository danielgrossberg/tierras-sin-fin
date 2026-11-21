// Bestiario (Versión 3 · Fase 6.6): un libro de monstruos por jugador.
// G.seen = { clave: 1 } los que ya encontraste (antes se ven como silueta "???"). Los derrotados salen de G.stats.killsBy.
// Maestría: 25, 100 y 250 derrotados de un tipo → +3%, +6% y +10% de daño de tus héroes contra él.
'use strict';
import { EN, EN_DESC, POOL, SEA_POOL, NIGHT_POOL, CAVE, BOSS, B, MATS, MASTERY } from './data.js';
import { G } from './state.js';
import { esc } from './util.js';

export const BEST_KEYS = Object.keys(EN);
const kills = k => ((G.stats && G.stats.killsBy) || {})[k] || 0;
export const isSeen = k => !!(G.seen && G.seen[k]) || kills(k) > 0;
export const bestCount = () => BEST_KEYS.filter(isSeen).length;
export const bestPct = () => Math.floor(100 * bestCount() / BEST_KEYS.length);
export function markSeen(keys) { G.seen = G.seen || {}; for (const k of keys) if (k && EN[k]) G.seen[k] = 1; }
// Multiplicador de daño por maestría
export function mastery(k) { const n = kills(k); for (const [need, p] of MASTERY) if (n >= need) return 1 + p; return 1; }
const masteryLvl = k => { const n = kills(k); return MASTERY.filter(([need]) => n >= need).length; };
// Aviso al cruzar un umbral (lo llama stats.noteKills con los derrotados antes y después)
export function masteryMsgs(before) {
  const out = [];
  for (const [k, b] of Object.entries(before)) for (const [need, p] of MASTERY) if (b < need && kills(k) >= need) out.push(`📖 <b>Maestría</b> contra ${EN[k].e} ${EN[k].n}: ${need} derrotados · <b>+${Math.round(p * 100)}% de daño</b>`);
  return out;
}

// Grupo de cada monstruo para ordenar el libro
export function kindOf(k) {
  if (EN[k].boss) return 'boss';
  if (NIGHT_POOL.includes(k)) return 'night';
  if (!Object.values(POOL).some(l => l.includes(k)) && !SEA_POOL.includes(k)) return 'cave';
  return 'world';
}
export const KINDS = [['world', '🌾 Mundo'], ['night', '🌙 Noche'], ['cave', '🕳️ Mazmorras'], ['boss', '👑 Jefes']];
export function habitat(k) {
  const out = [];
  for (const [b, l] of Object.entries(POOL)) if (l.includes(k)) out.push(`${B[b].i} ${B[b].n}`);
  if (SEA_POOL.includes(k)) out.push('🌊 Mar (navegando)');
  if (NIGHT_POOL.includes(k)) out.push('🌙 Cualquier tierra firme');
  for (const c of Object.values(CAVE)) { if (c.pool.includes(k)) out.push(`🕳️ ${c.n}`); if (c.boss === k) out.push(`🕳️ Fondo de la ${c.n}`); }
  for (const [b, v] of Object.entries(BOSS)) if (v === k) out.push(`${B[b].i} ${B[b].n}`);
  if (k === 'titan') out.push('🌋 Cerca de Ciudad Origen, una vez por semana');
  return out;
}
const SKN = { brutal: '💥 Golpe Brutal (mucho daño)', veneno: '🟢 Mordida Venenosa (envenena)', drenar: '🩸 Drenar Vida (se cura)', fuego: '🔥 Aliento de Fuego (a todo el grupo)' };
function loot(k) {
  const e = EN[k], out = [];
  if (k === 'titan') return ['🎁 Premio semanal para todos los que lo dañaron (oro, equipo y fragmentos)'];
  if (!e.boss) {
    const m = e.undead && !e.magic ? ['hueso'] : (e.magic || e.undead) ? ['esencia'] : ['lobo', 'loboartico', 'lobosombra', 'oso', 'osopolar', 'jabali', 'cocodrilo', 'serpiente', 'serpmar', 'rata', 'escorpion', 'arana', 'sapo', 'cangrejo', 'golem'].includes(k) ? ['cuero', 'colmillo'] : ['cuero'];
    out.push(m.map(x => `${MATS[x].e} ${MATS[x].n}`).join(' o ') + ' (40%)');
    out.push('💰 Oro', '🧪 Poción o 🔷 Éter (a veces)', '⚔️ Equipo (15%)');
  } else out.push('🪶 Pluma Fénix y 🔷 Éter', '⚔️ Equipo Raro o mejor (siempre)', '🥚 Huevo de mascota (15%)', '🐴 Montura (muy rara)', '💰 Mucho oro');
  return out;
}
const stars = k => '⭐'.repeat(masteryLvl(k));

// ================= Panel: 👥 Grupo → 📖 Bestiario =================
export function bestTabHTML(sel) {
  if (sel && EN[sel] && isSeen(sel)) return entryHTML(sel);
  const n = bestCount(), pct = bestPct();
  let h = `<div class="sec besthead"><b>📖 ${n} de ${BEST_KEYS.length} monstruos · ${pct}%</b><span class="bar xp"><i style="width:${pct}%"></i></span>
    <small class="mut">Toca uno para ver su ficha. Logros al 25%, 50% y 100%. Maestría: 25 / 100 / 250 derrotados = +3% / +6% / +10% de daño contra ese monstruo.</small></div>`;
  for (const [kd, title] of KINDS) {
    const ks = BEST_KEYS.filter(k => kindOf(k) === kd);
    h += `<h3 class="achcat">${title} <small class="mut">${ks.filter(isSeen).length}/${ks.length}</small></h3><div class="bgrid">` + ks.map(k => {
      const s = isSeen(k), e = EN[k];
      return s ? `<button class="bcard" data-a="bsel" data-k="${k}"><span class="emoji" style="filter:${e.tint || 'none'}">${e.e}</span><small>${esc(e.n)}</small><b>${kills(k)}${stars(k) ? ' ' + stars(k) : ''}</b></button>`
        : `<div class="bcard unk" aria-label="Monstruo sin descubrir"><span class="emoji sil">${e.e}</span><small>???</small><b>&nbsp;</b></div>`;
    }).join('') + '</div>';
  }
  return h;
}
function entryHTML(k) {
  const e = EN[k], n = kills(k), ml = masteryLvl(k), next = MASTERY.slice().reverse().find(([need]) => n < need);
  const tags = [EN[k].boss ? '👑 Jefe' : '', NIGHT_POOL.includes(k) ? '🌙 Solo de noche' : '☀️🌙 De día y de noche', e.undead ? '💀 No-muerto' : '', e.magic ? '✨ Mágico' : ''].filter(Boolean);
  const sk = (e.sk || []).map(s => SKN[s] || s);
  return `<button class="btn sm" data-a="bsel" data-k="">← Volver al bestiario</button>
  <div class="sec bentry"><div class="bbig"><span class="emoji" style="filter:${e.tint || 'none'}">${e.e}</span></div>
    <h3 style="margin:4px 0">${esc(e.n)} ${stars(k)}</h3><p class="mut" style="margin:0 0 8px">${esc(EN_DESC[k] || '')}</p>
    <div class="btags">${tags.map(t => `<span>${t}</span>`).join('')}</div>
    <div class="strow"><span>🗺️ Dónde vive</span><b>${habitat(k).join('<br>') || '—'}</b></div>
    <div class="strow"><span>🎯 Habilidades</span><b>${sk.length ? sk.join('<br>') : 'Solo ataques normales'}</b></div>
    <div class="strow"><span>⚔️ Derrotados</span><b>${n}</b></div>
    <div class="strow"><span>📖 Maestría</span><b>${ml ? `+${Math.round(MASTERY[MASTERY.length - ml][1] * 100)}% de daño` : 'Sin maestría'}${next ? `<br><small class="mut">${next[0] - n} más para +${Math.round(next[1] * 100)}%</small>` : ''}</b></div>
    <div class="strow"><span>🎁 Botín posible</span><b>${n >= 10 ? loot(k).join('<br>') : `<span class="mut">Se revela con 10 derrotados (${n}/10)</span>`}</b></div>
  </div>`;
}
