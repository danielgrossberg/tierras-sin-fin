// Guardado local (localStorage). Todo en try/catch: si falla, se juega igual.
'use strict';
import { G, P, st } from './state.js';
import { CL, ADV, PETS } from './data.js';
import { pushSave } from './net.js';

export const saveKey = (code, name) => `tsf:${code}:${name}`;
const PREFS = 'tsf-prefs';

// Versión del formato de guardado. Al cambiar el formato: subir el número y agregar un paso en migrate().
export const SAVE_VERSION = 13;
export function migrate(o) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.roster) || !Array.isArray(o.party)) return null;
  const v = o.saveVersion || 1;
  if (v < 2) {
    // Etapa 1 → Etapa 2 (fase 0): contador de veces que el grupo cayó
    o.deaths = o.deaths || 0;
  }
  if (v < 3) {
    // Fase B: inventario de equipo compartido y ranuras por héroe
    o.inventory = o.inventory || [];
    for (const h of o.roster) h.equip = h.equip || {};
  }
  if (v < 4) {
    // Fase C: misiones, bote y aldeas descubiertas (Ciudad Origen siempre cuenta como descubierta)
    o.quests = o.quests || []; o.qtrack = o.qtrack || null; o.board = o.board || {}; o.boat = !!o.boat; o.extraFeats = o.extraFeats || [];
    o.vv = o.vv || {};
    if (o.start) o.vv['village@' + o.start.x + ',' + o.start.y] = { x: o.start.x, y: o.start.y, name: 'Ciudad Origen' };
  }
  if (v < 5) {
    // La aldea inicial pasó a llamarse Ciudad Origen: se renombra en el portal y en las misiones guardadas
    const ren = x => JSON.parse(JSON.stringify(x).replace(/Villa Origen/g, 'Ciudad Origen'));
    if (o.vv) o.vv = ren(o.vv);
    if (o.quests) o.quests = ren(o.quests);
  }
  if (v < 6) {
    // Versión 2: 6 clases nuevas. Se agregan al roster en nivel 1 (vida y magia se llenan al cargar: hp/mp = -1).
    // El grupo, el líder y todo el resto del progreso quedan igual. Además: tumba (vacía).
    const have = new Set(o.roster.map(h => h.cls));
    for (const k of Object.keys(CL)) if (!have.has(k)) {
      o.roster.push({ id: 'h' + o.roster.length, isHero: true, cls: k, name: CL[k].name, e: CL[k].e, lvl: 1, xp: 0, hp: -1, mp: -1, bonus: {}, buffs: {}, poison: 0, equip: {} });
    }
    o.tomb = o.tomb || null;
  }
  if (v < 7) {
    // Versión 3 · Fase 0: aldeas favoritas del portal (⭐). Todo lo demás queda igual.
    o.favs = o.favs || {};
  }
  if (v < 8) {
    // Versión 3 · Fase 1: progreso de las mazmorras y mazmorra actual (ninguna). Todo lo demás queda igual.
    o.dungeons = o.dungeons || {}; o.inDun = o.inDun || null;
  }
  if (v < 9) {
    // Versión 3 · Fase 2: talentos y clase avanzada por héroe (vacíos: los héroes que ya pasaron los niveles 5/10/15/20/30 los eligen al entrar)
    for (const h of o.roster) { h.tal = h.tal || {}; h.adv = h.adv || null; }
  }
  if (v < 10) {
    // Versión 3 · Fase 3: mascotas (ninguna todavía) y huevos
    o.pets = o.pets || []; o.pet = o.pet || null; o.eggs = o.eggs || [];
  }
  if (v < 13) {
    // Versión 3 · Fase 6.1: materiales, profesiones, puntos usados, comida y antídotos
    o.mats = o.mats || {}; o.prof = o.prof || {}; o.gath = o.gath || {}; o.food = o.food || null;
  }
  if (v < 12) {
    // Versión 3 · Fase 5: forja (fragmentos), elixires, apariencias, mapas del tesoro y mercader
    o.frags = o.frags || 0; o.elix = o.elix || {}; o.cos = o.cos || { owned: [] }; o.tmaps = o.tmaps || []; o.merch = o.merch || null;
  }
  if (v < 11) {
    // Versión 3 · Fase 4: logros (los que ya cumple se desbloquean al entrar), título, arena y jefe de mundo
    o.stats = o.stats || {}; o.ach = o.ach || {}; o.title = o.title || null; o.arena = o.arena || { pts: 0, w: 0, l: 0 }; o.wbClaim = o.wbClaim || null; o.wbSeen = o.wbSeen || null;
    // Lo que ya se sabe de antes: mazmorras completadas y distancia a la posición guardada
    o.stats.dungeons = o.stats.dungeons || Object.values(o.dungeons || {}).filter(d => d && d.done).length;
    if (o.pos && o.start) o.stats.maxDist = Math.max(o.stats.maxDist || 0, Math.round(Math.hypot(o.pos.x - o.start.x, o.pos.y - o.start.y)));
  }
  // Valores por defecto defensivos (por si falta algo en partidas antiguas)
  o.items = Object.assign({ pocion: 0, eter: 0, pluma: 0, antidoto: 0 }, o.items || {});
  o.mats = o.mats && typeof o.mats === 'object' ? o.mats : {}; o.prof = o.prof && typeof o.prof === 'object' ? o.prof : {}; o.gath = o.gath && typeof o.gath === 'object' ? o.gath : {};
  for (const k of ['opened', 'defeated', 'visited']) o[k] = o[k] || {};
  for (const k of ['gold', 'upA', 'upD', 'steps', 'bosses']) o[k] = o[k] || 0;
  o.inventory = Array.isArray(o.inventory) ? o.inventory : [];
  o.favs = o.favs && typeof o.favs === 'object' ? o.favs : {};
  o.dungeons = o.dungeons && typeof o.dungeons === 'object' ? o.dungeons : {};
  o.cos = o.cos && typeof o.cos === 'object' ? o.cos : { owned: [] }; o.cos.owned = Array.isArray(o.cos.owned) ? o.cos.owned : []; o.tmaps = Array.isArray(o.tmaps) ? o.tmaps : []; o.elix = o.elix && typeof o.elix === 'object' ? o.elix : {};
  o.stats = o.stats && typeof o.stats === 'object' ? o.stats : {}; o.ach = o.ach && typeof o.ach === 'object' ? o.ach : {}; o.arena = o.arena && typeof o.arena === 'object' ? o.arena : { pts: 0, w: 0, l: 0 };
  o.pets = Array.isArray(o.pets) ? o.pets.filter(q => q && PETS[q.k]) : []; o.eggs = Array.isArray(o.eggs) ? o.eggs : [];
  if (o.pet && !o.pets.some(q => q.id === o.pet)) o.pet = null;
  if (o.inDun && !(o.inDun.cave && o.inDun.cave.id)) o.inDun = null;
  o.quests = Array.isArray(o.quests) ? o.quests : []; o.vv = o.vv || {}; o.board = o.board || {}; o.extraFeats = Array.isArray(o.extraFeats) ? o.extraFeats : [];
  for (const h of o.roster) { h.bonus = h.bonus || {}; h.buffs = {}; h.poison = h.poison || 0; h.equip = h.equip || {}; h.tal = h.tal && typeof h.tal === 'object' ? h.tal : {}; if (h.adv && !ADV[h.adv]) h.adv = null; h.shield = 0; h.ward = 0; }
  o.saveVersion = SAVE_VERSION;
  return o;
}

// Guarda en el celular y, si hay guardado en servidor, programa la subida.
// mode: 'soon' (por defecto, junta cambios ~10 s), 'now' (~2 s) o 'urgent' (inmediato).
export function save(mode) {
  if (!st.inGame || !st.room) return false;
  G.pos = { x: P.x, y: P.y }; G.savedAt = Date.now(); G.saveVersion = SAVE_VERSION;
  let ok = true;
  try { localStorage.setItem(saveKey(st.room, st.name), JSON.stringify(G)); } catch (e) { ok = false; }
  pushSave(mode || 'soon');
  return ok;
}
// Escribe una partida (por ejemplo la que vino del servidor) como respaldo local
export function writeLocal(code, name, data) { try { localStorage.setItem(saveKey(code, name), JSON.stringify(data)); } catch (e) { /* nada */ } }
// Antes de migrar una partida de una versión anterior, se copia tal cual en "tsf:SALA:nombre:backup-vN"
// (no se borra nunca), para poder recuperarla si algo saliera mal.
export function backupIfOld(code, name, raw) {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw, v = (o && o.saveVersion) || 1;
    if (!o || v >= SAVE_VERSION) return;
    const k = saveKey(code, name) + ':backup-v' + v;
    if (!localStorage.getItem(k)) localStorage.setItem(k, typeof raw === 'string' ? raw : JSON.stringify(raw));
  } catch (e) { /* sin localStorage */ }
}
export function loadGame(code, name) {
  try {
    const s = localStorage.getItem(saveKey(code, name));
    if (!s) return null;
    backupIfOld(code, name, s);
    return migrate(JSON.parse(s));
  } catch (e) { return null; }
}
// Partidas guardadas en este navegador para un nombre (en cualquier sala), la más reciente primero
export function listSaves(name) {
  const out = [], low = String(name).toLowerCase();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i), m = /^tsf:([A-Z]{4}):(.+)$/.exec(k || '');
      if (!m || m[2].includes(':backup-') || m[2].toLowerCase() !== low) continue;
      try {
        const o = JSON.parse(localStorage.getItem(k));
        if (o && Array.isArray(o.roster) && Array.isArray(o.party)) out.push({ code: m[1], name: m[2], savedAt: o.savedAt || 0, steps: o.steps || 0, heroes: o.roster.filter((_, j) => o.party.includes(j)).map(h => h.e + ' Nv ' + h.lvl).join(' · ') });
      } catch (e) { /* partida dañada: se ignora */ }
    }
  } catch (e) { /* sin localStorage */ }
  return out.sort((a, b) => b.savedAt - a.savedAt || b.steps - a.steps);
}
export function removeGame(code, name) { try { localStorage.removeItem(saveKey(code, name)); } catch (e) { /* nada */ } }
export function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch (e) { return {}; } }
export function savePrefs(p) { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch (e) { /* nada */ } }
