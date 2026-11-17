// Preferencias de este dispositivo (Versión 3 · Fase 0): ver a los demás jugadores 👁️ y silenciar el chat 🔕.
// Se guardan en localStorage (no en la partida). Todo en try/catch: si falla, se usan los valores por defecto.
'use strict';
import { coopVs } from './coop.js';

const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* nada */ } };

// ---- Mostrar u ocultar a los demás jugadores (3 modos) ----
export const VIS = {
  all: { i: '👁️', n: 'Mostrar todo', d: 'Ves a los demás en el mapa, sus flechas y sus globos' },
  mini: { i: '🗺️', n: 'Solo en el minimapa', d: 'Los demás solo aparecen en el minimapa' },
  none: { i: '🚫', n: 'Ocultar todo', d: 'No ves a los demás en el mapa ni en el minimapa' },
};
const ORDER = ['all', 'mini', 'none'];
let vis = load('tsf-vis', 'all'); if (!VIS[vis]) vis = 'all';
export const visMode = () => vis;
export function cycleVis() { vis = ORDER[(ORDER.indexOf(vis) + 1) % ORDER.length]; keep('tsf-vis', vis); return vis; }
// Mientras dura un combate cooperativo, los compañeros de ese combate se ven igual
const sameCoop = o => { const v = coopVs(); return !!(v && o && o.vs === v); };
export const mateOnMap = o => vis === 'all' || sameCoop(o);
export const mateOnMini = o => vis !== 'none' || sameCoop(o);

// ---- Silenciar chat: oculta los globos y el contador de no leídos (los mensajes siguen llegando) ----
let muted = load('tsf-mute', '0') === '1';
export const chatMuted = () => muted;
export function toggleMute() { muted = !muted; keep('tsf-mute', muted ? '1' : '0'); return muted; }
export const othersBubbles = () => vis === 'all' && !muted;
