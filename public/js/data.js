// Datos del juego: biomas, clases, habilidades, objetos y bestiario.
// Copiados tal cual del juego de referencia. El servidor también importa este archivo
// para validar emojis, biomas y mensajes rápidos (una sola fuente de verdad).
'use strict';
import { hex2rgb } from './util.js';

export const TILE = 32, CH = 16, RESPAWN = 350;

// ================= Biomas =================
export const B = {
  WATER: { n: 'Mar', i: '🌊', c: '#2b5f93', block: 1 },
  SAND: { n: 'Costa', i: '🏖️', c: '#dcc68a' },
  GRASS: { n: 'Praderas', i: '🌾', c: '#5f9f48' },
  FOREST: { n: 'Bosque Profundo', i: '🌲', c: '#3b7438' },
  SNOW: { n: 'Tundra Helada', i: '❄️', c: '#dde7ee' },
  DESERT: { n: 'Desierto Ardiente', i: '🏜️', c: '#e0b469' },
  SWAMP: { n: 'Pantano Sombrío', i: '🐸', c: '#4f6b45' },
  ASH: { n: 'Tierras Malditas', i: '🔥', c: '#4a3a3a' },
  MOUNT: { n: 'Montañas', i: '⛰️', c: '#7d776f', block: 1 },
};
export const RGB = {}; for (const k in B) RGB[k] = hex2rgb(B[k].c);
export const BLOCKO = new Set(['tree', 'pine', 'cactus', 'rock', 'deadtree']);
export const blockT = t => !!(B[t.b].block || BLOCKO.has(t.o));
export const BG = {
  GRASS: 'linear-gradient(#7ec8f0,#bfe6f5 44%,#5a9c45 45%,#2f5e26)',
  FOREST: 'linear-gradient(#24452c,#4a7a4a 44%,#2f5229 45%,#122312)',
  DESERT: 'linear-gradient(#f2a75a,#f7dc9c 44%,#d9a35a 45%,#8f5f28)',
  SNOW: 'linear-gradient(#7f9bb8,#dce9f3 44%,#eef3f8 45%,#a9bccf)',
  SWAMP: 'linear-gradient(#2c3a2c,#5a6b4c 44%,#384a2e 45%,#161f13)',
  SAND: 'linear-gradient(#6fbde8,#cfeaf5 44%,#e3cf93 45%,#a98f50)',
  ASH: 'linear-gradient(#1c080a,#5a1e1e 44%,#3a2626 45%,#0f0808)',
};

// ================= Clases =================
export const CL = {
  guerrero: { n: 'Guerrero', name: 'Bruno', e: '🤺', d: 'Tanque resistente. Mucha vida y golpes potentes.', crit: .06,
    b: { mhp: 44, mmp: 8, atk: 10, def: 8, mag: 2, spd: 5 }, g: { mhp: 9, mmp: 1.2, atk: 2.3, def: 1.9, mag: .3, spd: .7 }, sk: ['golpe', 'grito', 'torbellino', 'titanico'] },
  maga: { n: 'Maga', name: 'Ivana', e: '🧙‍♀️', d: 'Magia devastadora contra uno o todos. Frágil.', crit: .05,
    b: { mhp: 28, mmp: 22, atk: 4, def: 3, mag: 11, spd: 6 }, g: { mhp: 5, mmp: 4, atk: .6, def: .8, mag: 2.5, spd: 1 }, sk: ['fuego', 'ventisca', 'rayo', 'meteoro'] },
  arquera: { n: 'Arquera', name: 'Kira', e: '🧝‍♀️', d: 'Rápida y precisa. Disparos múltiples y veneno.', crit: .12,
    b: { mhp: 34, mmp: 12, atk: 9, def: 5, mag: 4, spd: 9 }, g: { mhp: 6.5, mmp: 1.6, atk: 2.1, def: 1.1, mag: .7, spd: 1.5 }, sk: ['doble', 'flechaven', 'lluvia', 'halcon'] },
  picaro: { n: 'Pícaro', name: 'Tomás', e: '🥷', d: 'Críticos letales. Roba oro y objetos.', crit: .2,
    b: { mhp: 32, mmp: 10, atk: 8, def: 4, mag: 3, spd: 11 }, g: { mhp: 6, mmp: 1.5, atk: 1.9, def: 1, mag: .6, spd: 1.8 }, sk: ['robar', 'punalada', 'dagas', 'asesinar'] },
  sanadora: { n: 'Sanadora', name: 'Elena', e: '🧚‍♀️', d: 'Cura, revive y castiga a los no-muertos.', crit: .05,
    b: { mhp: 32, mmp: 20, atk: 5, def: 5, mag: 9, spd: 6 }, g: { mhp: 6, mmp: 3.6, atk: .8, def: 1.2, mag: 2.1, spd: 1 }, sk: ['curar', 'luz', 'curartodos', 'revivir', 'bendicion'] },
};

// ================= Habilidades =================
// Solo los datos; el efecto de cada una (run) vive en battle.js
export const SK = {
  golpe: { n: 'Golpe Fuerte', mp: 3, lv: 1, t: 'enemy', d: 'Daño físico ×1.8' },
  grito: { n: 'Grito de Guerra', mp: 5, lv: 4, t: 'none', d: '+35% ataque al grupo' },
  torbellino: { n: 'Torbellino', mp: 8, lv: 8, t: 'enemies', d: 'Daño físico a todos' },
  titanico: { n: 'Golpe Titánico', mp: 14, lv: 14, t: 'enemy', d: 'Daño físico ×3' },
  fuego: { n: 'Bola de Fuego', mp: 4, lv: 1, t: 'enemy', d: 'Magia ×1.7' },
  ventisca: { n: 'Ventisca', mp: 8, lv: 3, t: 'enemies', d: 'Magia a todos' },
  rayo: { n: 'Rayo', mp: 10, lv: 7, t: 'enemy', d: 'Magia ×2.8' },
  meteoro: { n: 'Meteoro', mp: 20, lv: 13, t: 'enemies', d: 'Magia ×2 a todos' },
  doble: { n: 'Disparo Doble', mp: 3, lv: 1, t: 'enemy', d: 'Dos flechas ×0.9' },
  flechaven: { n: 'Flecha Venenosa', mp: 4, lv: 3, t: 'enemy', d: 'Daño + veneno' },
  lluvia: { n: 'Lluvia de Flechas', mp: 8, lv: 6, t: 'enemies', d: 'Daño físico a todos' },
  halcon: { n: 'Ojo de Halcón', mp: 10, lv: 11, t: 'enemy', d: '×2.4 con crítico seguro' },
  robar: { n: 'Robar', mp: 2, lv: 1, t: 'enemy', d: 'Roba oro u objetos' },
  punalada: { n: 'Puñalada', mp: 4, lv: 2, t: 'enemy', d: '×1.5 con 50% de crítico' },
  dagas: { n: 'Dagas Venenosas', mp: 7, lv: 5, t: 'enemies', d: 'Daño a todos + veneno' },
  asesinar: { n: 'Asesinar', mp: 12, lv: 10, t: 'enemy', d: '×2.5; elimina si tiene <25% PV' },
  curar: { n: 'Curar', mp: 4, lv: 1, t: 'ally', field: 1, d: 'Cura a un aliado y quita veneno' },
  luz: { n: 'Luz Sagrada', mp: 5, lv: 3, t: 'enemy', d: 'Magia ×1.5 (×3 a no-muertos)' },
  curartodos: { n: 'Curar a Todos', mp: 10, lv: 5, t: 'allies', field: 1, d: 'Cura a todo el grupo' },
  revivir: { n: 'Revivir', mp: 14, lv: 7, t: 'dead', field: 1, d: 'Revive con 50% PV' },
  bendicion: { n: 'Bendición', mp: 12, lv: 10, t: 'none', d: '+35% defensa al grupo' },
};

// ================= Objetos =================
export const IT = {
  pocion: { n: 'Poción', e: '🧪', d: 'Cura 50% PV y quita veneno', t: 'ally', p: 12 },
  eter: { n: 'Éter', e: '🔷', d: 'Recupera 50% PM', t: 'ally', p: 25 },
  pluma: { n: 'Pluma Fénix', e: '🪶', d: 'Revive con 50% PV', t: 'dead', p: 50 },
};

// ================= Bestiario =================
export const EN = {
  rata: { n: 'Rata Gigante', e: '🐀', hp: 14, atk: 8, def: 2, spd: 7, xp: 5, g: 4 },
  jabali: { n: 'Jabalí', e: '🐗', hp: 24, atk: 10, def: 4, spd: 4, xp: 8, g: 6, sk: ['brutal'] },
  abeja: { n: 'Avispa Asesina', e: '🐝', hp: 10, atk: 7, def: 1, spd: 12, xp: 5, g: 3, sk: ['veneno'] },
  lobo: { n: 'Lobo', e: '🐺', hp: 20, atk: 10, def: 3, spd: 10, xp: 8, g: 5 },
  arana: { n: 'Araña', e: '🕷️', hp: 18, atk: 9, def: 3, spd: 8, xp: 8, g: 6, sk: ['veneno'] },
  oso: { n: 'Oso Pardo', e: '🐻', hp: 38, atk: 13, def: 5, spd: 4, xp: 14, g: 10, sk: ['brutal'], min: 3 },
  murcielago: { n: 'Murciélago', e: '🦇', hp: 12, atk: 8, def: 2, mag: 6, spd: 13, xp: 6, g: 4, sk: ['drenar'] },
  escorpion: { n: 'Escorpión', e: '🦂', hp: 22, atk: 11, def: 7, spd: 6, xp: 10, g: 8, sk: ['veneno'] },
  serpiente: { n: 'Serpiente', e: '🐍', hp: 18, atk: 10, def: 3, spd: 9, xp: 8, g: 6, sk: ['veneno'] },
  momia: { n: 'Momia', e: '🧟', hp: 30, atk: 11, def: 5, mag: 6, spd: 3, xp: 12, g: 10, undead: 1, tint: 'sepia(.8)', min: 2 },
  loboartico: { n: 'Lobo Ártico', e: '🐺', hp: 26, atk: 12, def: 4, spd: 10, xp: 11, g: 7, tint: 'brightness(1.6) saturate(.2)' },
  osopolar: { n: 'Oso Polar', e: '🐻‍❄️', hp: 44, atk: 14, def: 6, spd: 4, xp: 16, g: 12, sk: ['brutal'], min: 3 },
  espectro: { n: 'Espectro de Hielo', e: '👻', hp: 20, atk: 6, def: 2, mag: 12, spd: 9, xp: 12, g: 9, sk: ['drenar'], undead: 1, magic: 1, tint: 'hue-rotate(180deg) saturate(3)' },
  sapo: { n: 'Sapo Venenoso', e: '🐸', hp: 20, atk: 9, def: 3, spd: 7, xp: 8, g: 6, sk: ['veneno'] },
  cocodrilo: { n: 'Cocodrilo', e: '🐊', hp: 34, atk: 14, def: 7, spd: 4, xp: 15, g: 11, sk: ['brutal'], min: 3 },
  zombi: { n: 'Zombi', e: '🧟', hp: 28, atk: 11, def: 3, spd: 3, xp: 10, g: 7, sk: ['veneno'], undead: 1 },
  cangrejo: { n: 'Cangrejo Coraza', e: '🦀', hp: 20, atk: 9, def: 9, spd: 5, xp: 9, g: 9 },
  esqueleto: { n: 'Esqueleto', e: '💀', hp: 26, atk: 13, def: 5, spd: 7, xp: 14, g: 12, undead: 1 },
  demonio: { n: 'Demonio', e: '👹', hp: 40, atk: 15, def: 6, mag: 10, spd: 8, xp: 20, g: 18, sk: ['fuego'], min: 4 },
  fantasma: { n: 'Fantasma', e: '👻', hp: 22, atk: 6, def: 2, mag: 13, spd: 9, xp: 13, g: 10, sk: ['drenar'], undead: 1, magic: 1 },
  // Jefes
  ogro: { n: 'Ogro Rey', e: '👹', hp: 100, atk: 16, def: 6, mag: 4, spd: 5, xp: 85, g: 110, sk: ['brutal'], boss: 1, tint: 'hue-rotate(90deg)' },
  rex: { n: 'Tirano de Arena', e: '🦖', hp: 110, atk: 17, def: 6, spd: 6, xp: 95, g: 100, sk: ['brutal'], boss: 1 },
  dragon: { n: 'Dragón Glacial', e: '🐉', hp: 95, atk: 15, def: 7, mag: 14, spd: 8, xp: 90, g: 120, sk: ['fuego', 'brutal'], boss: 1 },
  kraken: { n: 'Kraken', e: '🐙', hp: 95, atk: 14, def: 6, mag: 10, spd: 6, xp: 90, g: 110, sk: ['veneno', 'brutal'], boss: 1 },
  reyesq: { n: 'Rey Esqueleto', e: '💀', hp: 85, atk: 13, def: 7, mag: 12, spd: 7, xp: 85, g: 110, sk: ['drenar', 'fuego'], undead: 1, boss: 1, tint: 'drop-shadow(0 0 12px #ff3030)' },
};
export const POOL = { GRASS: ['rata', 'jabali', 'abeja', 'lobo'], FOREST: ['arana', 'lobo', 'oso', 'murcielago'], DESERT: ['escorpion', 'serpiente', 'momia'], SNOW: ['loboartico', 'osopolar', 'espectro'], SWAMP: ['sapo', 'cocodrilo', 'zombi'], SAND: ['cangrejo', 'serpiente', 'rata'], ASH: ['esqueleto', 'demonio', 'fantasma'] };
export const BOSS = { GRASS: 'ogro', FOREST: 'ogro', DESERT: 'rex', SNOW: 'dragon', SWAMP: 'kraken', SAND: 'kraken', ASH: 'reyesq' };

// ================= Santuarios y nombres de aldeas =================
export const BOONS = [['mhp', 8, '+8 PV máximos'], ['mmp', 4, '+4 PM máximos'], ['atk', 2, '+2 Ataque'], ['def', 2, '+2 Defensa'], ['mag', 2, '+2 Magia'], ['spd', 2, '+2 Velocidad']];
export const SYL1 = ['Al', 'Bel', 'Cor', 'Dun', 'El', 'Fen', 'Gal', 'Hor', 'Is', 'Kal', 'Lor', 'Mar', 'Nor', 'Ol', 'Pra', 'Quel', 'Ros', 'Sil', 'Tor', 'Ul', 'Val', 'Zar', 'Bri', 'Vel'];
export const SYL2 = ['dor', 'mar', 'via', 'lia', 'ton', 'gard', 'ria', 'ven', 'mir', 'sur', 'nar', 'bel', 'quen', 'ras', 'lon'];
export const VSUF = ['del Valle', 'del Río', 'Alta', 'Vieja', 'del Norte', 'del Sur'];

// ================= Online =================
export const QUICK = [
  { id: 'ven', t: '¡Ven acá!' },
  { id: 'jefe', t: 'Encontré un jefe 👑' },
  { id: 'aldea', t: 'Aldea aquí 🏘️' },
  { id: 'ayuda', t: 'Necesito ayuda' },
  { id: 'ok', t: '👍' },
  { id: 'risa', t: '😂' },
];
export const LEADER_EMOJIS = Object.values(CL).map(c => c.e);
export const MAX_PARTY = 3;
export const MAX_PLAYERS = 4;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I ni O (ni números)
export const PIN_TTL = 120000; // 2 minutos
