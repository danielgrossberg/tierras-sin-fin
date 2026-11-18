// Monturas (Versión 3 · Fase 6.5).
// G.mounts: claves que tienes · G.mount: la activa (se elige en el establo) · G.riding: si vas montado.
// Se monta y desmonta con el botón 🐴 del HUD. No se cabalga en mazmorras, en el agua (ahí va el bote) ni en las aldeas:
// en esos lugares el héroe va a pie y vuelve a montar solo al salir. Al perder un combate se desmonta.
'use strict';
import { MOUNTS } from './data.js';
import { G, P } from './state.js';
import { tileAt, feats } from './world.js';
import { inDungeon } from './dungeon.js';

export const hasMounts = () => (G.mounts || []).length > 0;
export const activeMount = () => (G.mount && (G.mounts || []).includes(G.mount) && MOUNTS[G.mount] ? G.mount : null);
// Por qué no se puede montar aquí ('' = sí se puede)
export function rideBlock() {
  if (inDungeon()) return 'en las mazmorras';
  if (tileAt(P.x, P.y).b === 'WATER') return 'en el agua';
  if (feats.get(P.x + ',' + P.y)?.type === 'village') return 'dentro de las aldeas';
  return '';
}
export const riding = () => !!(G.riding && activeMount() && !rideBlock());
// Multiplicador de velocidad al caminar (menos tiempo entre pasos)
export function speedMul() {
  if (!riding()) return 1;
  const m = MOUNTS[G.mount], b = tileAt(P.x, P.y).b;
  let s = m.spd; if (b === 'DESERT' && m.desert) s = m.desert; if (b === 'SWAMP' && !m.swamp) s *= .5;
  return 1 + s;
}
// Lobo Gigante: los monstruos te ven a menos distancia (6 → 4 casillas)
export const sightRange = () => (riding() && MOUNTS[G.mount].stealth ? 4 : 6);
export const mountEmoji = () => (riding() ? MOUNTS[G.mount].e : null);

// Conseguir una montura. Devuelve el texto para mostrar o '' si ya la tenías.
export function addMount(k) {
  if (!MOUNTS[k]) return '';
  G.mounts = G.mounts || [];
  if (G.mounts.includes(k)) return '';
  G.mounts.push(k); if (!activeMount()) { G.mount = k; G.riding = true; }
  return `${MOUNTS[k].e} <b>¡Nueva montura: ${MOUNTS[k].n}!</b> <span class="mut">${MOUNTS[k].d}</span>`;
}
export function setMount(k) { if ((G.mounts || []).includes(k)) { G.mount = k; G.riding = true; return true; } return false; }
export function toggleRide() {
  if (!activeMount()) return { ok: false, msg: 'Aún no tienes montura. El 🐴 Caballo se compra en el establo de las aldeas.' };
  if (G.riding) { G.riding = false; return { ok: true, msg: `Desmontas de tu ${MOUNTS[G.mount].n}` }; }
  G.riding = true; const b = rideBlock();
  return { ok: true, msg: b ? `Montarás tu ${MOUNTS[G.mount].n} al salir (no se cabalga ${b})` : `${MOUNTS[G.mount].e} Montas tu ${MOUNTS[G.mount].n}` };
}
// Botín raro: jefes 4% (Camello, Lagarto o Lobo Gigante) y 0,5% Unicornio; jefes de mazmorra el doble
export function mountDrop(dun) {
  const r = Math.random(), x = dun ? 2 : 1;
  let k = null;
  if (r < .005 * x) k = 'unicornio';
  else if (r < .045 * x) { const pool = ['camello', 'lagarto', 'lobog'], left = pool.filter(q => !(G.mounts || []).includes(q)); k = (left.length ? left : pool)[Math.floor(Math.random() * (left.length || pool.length))]; }
  const msg = k ? addMount(k) : '';
  return msg ? [msg] : [];
}
