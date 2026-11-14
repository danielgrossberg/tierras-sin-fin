// Guardado local (localStorage). Todo en try/catch: si falla, se juega igual.
'use strict';
import { G, P, st } from './state.js';

export const saveKey = (code, name) => `tsf:${code}:${name}`;
const PREFS = 'tsf-prefs';

export function save() {
  if (!st.inGame || !st.room) return false;
  try { G.pos = { x: P.x, y: P.y }; localStorage.setItem(saveKey(st.room, st.name), JSON.stringify(G)); return true; }
  catch (e) { return false; }
}
export function loadGame(code, name) {
  try {
    const s = localStorage.getItem(saveKey(code, name)); const o = s ? JSON.parse(s) : null;
    return o && Array.isArray(o.roster) && Array.isArray(o.party) ? o : null;
  } catch (e) { return null; }
}
export function removeGame(code, name) { try { localStorage.removeItem(saveKey(code, name)); } catch (e) { /* nada */ } }
export function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch (e) { return {}; } }
export function savePrefs(p) { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch (e) { /* nada */ } }
