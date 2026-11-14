// Guardado local (localStorage). Todo en try/catch: si falla, se juega igual.
'use strict';
import { G, P, st } from './state.js';
import { pushSave } from './net.js';

export const saveKey = (code, name) => `tsf:${code}:${name}`;
const PREFS = 'tsf-prefs';

// Versión del formato de guardado. Al cambiar el formato: subir el número y agregar un paso en migrate().
export const SAVE_VERSION = 4;
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
    // Fase C: misiones, bote y aldeas descubiertas (Villa Origen siempre cuenta como descubierta)
    o.quests = o.quests || []; o.qtrack = o.qtrack || null; o.board = o.board || {}; o.boat = !!o.boat; o.extraFeats = o.extraFeats || [];
    o.vv = o.vv || {};
    if (o.start) o.vv['village@' + o.start.x + ',' + o.start.y] = { x: o.start.x, y: o.start.y, name: 'Villa Origen' };
  }
  // Valores por defecto defensivos (por si falta algo en partidas antiguas)
  o.items = Object.assign({ pocion: 0, eter: 0, pluma: 0 }, o.items || {});
  for (const k of ['opened', 'defeated', 'visited']) o[k] = o[k] || {};
  for (const k of ['gold', 'upA', 'upD', 'steps', 'bosses']) o[k] = o[k] || 0;
  o.inventory = Array.isArray(o.inventory) ? o.inventory : [];
  o.quests = Array.isArray(o.quests) ? o.quests : []; o.vv = o.vv || {}; o.board = o.board || {}; o.extraFeats = Array.isArray(o.extraFeats) ? o.extraFeats : [];
  for (const h of o.roster) { h.bonus = h.bonus || {}; h.buffs = {}; h.poison = h.poison || 0; h.equip = h.equip || {}; }
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
export function loadGame(code, name) {
  try {
    const s = localStorage.getItem(saveKey(code, name));
    return s ? migrate(JSON.parse(s)) : null;
  } catch (e) { return null; }
}
// Partidas guardadas en este navegador para un nombre (en cualquier sala), la más reciente primero
export function listSaves(name) {
  const out = [], low = String(name).toLowerCase();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i), m = /^tsf:([A-Z]{4}):(.+)$/.exec(k || '');
      if (!m || m[2].toLowerCase() !== low) continue;
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
