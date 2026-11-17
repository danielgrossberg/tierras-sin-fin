// Mascotas (Versión 3 · Fase 3).
// - Se consiguen como huevo 🥚 (botín raro de jefes, premio de misiones o compra en Ciudad Origen).
//   El huevo eclosiona a los 300 pasos y la mascota es al azar.
// - 1 mascota activa por jugador (G.pet); las demás quedan en el establo (G.pets). Suben de nivel con la
//   experiencia de los combates (máx. 20) y su efecto mejora. No mueren.
// Guardado: G.pets = [{ id, k, lvl, xp }], G.pet = id | null, G.eggs = [{ id, left, src }]
'use strict';
import { PETS, EGG_STEPS, PET_MAX } from './data.js';
import { G } from './state.js';

export const activePet = () => (G.pets || []).find(p => p.id === G.pet) || null;
export const petNeed = l => Math.round(40 * Math.pow(l, 1.5));
const mul = p => 1 + .06 * (p.lvl - 1);
// Valores del efecto según el nivel
export const catBonus = p => Math.min(.35, .15 + .01 * (p.lvl - 1));            // +% botín y oro
export const foxBonus = p => Math.min(20, 10 + .5 * (p.lvl - 1));                // +% huir y esquivar
export const owlRadius = p => 6 + Math.floor(p.lvl / 2);                          // casillas
export const turtleShield = p => Math.min(.4, .2 + .01 * (p.lvl - 1));           // % de la vida máx.
export const petPower = (p, lvl) => (6 + 2 * lvl) * mul(p);                       // daño base (lobo y dragoncito)
export function petEffect(p) {
  const k = p.k;
  if (k === 'lobo') return `Ataca a un enemigo al final de cada ronda (fuerza ×${mul(p).toFixed(2)})`;
  if (k === 'buho') return `Revela trampas y cofres a ${owlRadius(p)} casillas en el minimapa`;
  if (k === 'gato') return `+${Math.round(catBonus(p) * 100)}% de botín y oro`;
  if (k === 'dragon') return `Fuego a todos cada 2 rondas (fuerza ×${mul(p).toFixed(2)})`;
  if (k === 'tortuga') return `Escudo de ${Math.round(turtleShield(p) * 100)}% PV al héroe con menos vida (1 vez por combate)`;
  if (k === 'zorro') return `+${foxBonus(p)}% de huir y de esquivar`;
  return PETS[k] ? PETS[k].d : '';
}
export const petLabel = p => `${PETS[p.k].e} ${PETS[p.k].n} Nv ${p.lvl}`;
// Experiencia de combate (la mitad de la del combate)
export function petGainXP(p, x) {
  if (!p || p.lvl >= PET_MAX) return [];
  const out = []; p.xp += Math.round(x);
  while (p.lvl < PET_MAX && p.xp >= petNeed(p.lvl)) { p.xp -= petNeed(p.lvl); p.lvl++; out.push(`🐾 ${PETS[p.k].e} ${PETS[p.k].n} sube a nivel ${p.lvl}`); }
  if (p.lvl >= PET_MAX) p.xp = 0;
  return out;
}
// Huevos
export function addEgg(src) { G.eggs = G.eggs || []; G.eggs.push({ id: 'egg' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), left: EGG_STEPS, src: src || '' }); }
// Un paso del grupo: los huevos avanzan. Devuelve las mascotas que nacieron.
export function stepEggs() {
  if (!G.eggs || !G.eggs.length) return [];
  const born = [];
  for (const e of G.eggs) e.left--;
  for (const e of G.eggs.filter(x => x.left <= 0)) {
    const keys = Object.keys(PETS), k = keys[Math.floor(Math.random() * keys.length)];
    const p = { id: 'pet' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), k, lvl: 1, xp: 0 };
    G.pets = G.pets || []; G.pets.push(p); if (!activePet()) G.pet = p.id;
    born.push(p);
  }
  G.eggs = G.eggs.filter(x => x.left > 0);
  return born;
}
// Datos de la mascota activa para un combate en equipo (viaja con el héroe elegido)
export const petSnap = () => { const p = activePet(); return p ? { k: p.k, lvl: p.lvl } : null; };
