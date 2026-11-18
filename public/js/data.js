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
  WATER: 'linear-gradient(#5aa9e6,#c4e6f5 44%,#2f6fa8 45%,#0f3354)',
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
  // ---- Versión 2: seis clases nuevas (habilidades en los niveles 1, 3, 6 y 10) ----
  barbaro: { n: 'Bárbaro', name: 'Ulrik', e: '🪓', d: 'Mucho daño y poca defensa. Más peligroso con poca vida.', crit: .1,
    b: { mhp: 40, mmp: 8, atk: 11, def: 4, mag: 2, spd: 7 }, g: { mhp: 8, mmp: 1.1, atk: 2.5, def: 1, mag: .3, spd: 1 }, sk: ['hachazo', 'furia', 'torbellinob', 'desesperado'] },
  nigromante: { n: 'Nigromante', name: 'Mordek', e: '🧛', d: 'Magia oscura: roba vida, maldice e invoca esqueletos.', crit: .05,
    b: { mhp: 30, mmp: 22, atk: 4, def: 4, mag: 10, spd: 6 }, g: { mhp: 5.5, mmp: 3.8, atk: .6, def: .9, mag: 2.3, spd: 1 }, sk: ['drenarvida', 'maldicion', 'esqueleto', 'plaga'] },
  druida: { n: 'Druida', name: 'Silvano', e: '🧙‍♂️', d: 'Naturaleza: raíces, espinas y forma de oso.', crit: .06,
    b: { mhp: 36, mmp: 18, atk: 7, def: 5, mag: 8, spd: 6 }, g: { mhp: 7, mmp: 3, atk: 1.5, def: 1.2, mag: 1.8, spd: 1 }, sk: ['raices', 'espinas', 'oso', 'ira'] },
  enano: { n: 'Enano', name: 'Brom', e: '🧔', d: 'Tanque muy duro y lento. Con él en el grupo, +25% de oro.', crit: .06,
    b: { mhp: 48, mmp: 10, atk: 9, def: 10, mag: 2, spd: 3 }, g: { mhp: 9.5, mmp: 1.4, atk: 2, def: 2.2, mag: .3, spd: .5 }, sk: ['martillazo', 'piedra', 'cerveza', 'sismico'] },
  elfo: { n: 'Elfo', name: 'Aelar', e: '🧝‍♂️', d: 'Ágil: espada y magia. Esquiva el 15% de los golpes físicos.', crit: .1,
    b: { mhp: 32, mmp: 16, atk: 8, def: 5, mag: 7, spd: 10 }, g: { mhp: 6, mmp: 2.6, atk: 1.7, def: 1.1, mag: 1.6, spd: 1.6 }, sk: ['lunar', 'canto', 'danza', 'luzluna'] },
  goblin: { n: 'Goblin', name: 'Grik', e: '👺', d: 'Rápido, frágil y con suerte: +30% de botín y huye siempre de monstruos normales.', crit: .15,
    b: { mhp: 29, mmp: 12, atk: 8, def: 3, mag: 4, spd: 12 }, g: { mhp: 5.4, mmp: 1.8, atk: 1.8, def: .8, mag: .8, spd: 1.9 }, sk: ['punalsucio', 'trampa', 'bomba', 'suerte'] },
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
  // Bárbaro
  hachazo: { n: 'Hachazo', mp: 3, lv: 1, t: 'enemy', d: 'Daño físico ×1.8' },
  furia: { n: 'Furia', mp: 2, lv: 3, t: 'none', d: '+60% ATQ por 3 turnos (cuesta 10% de PV)' },
  torbellinob: { n: 'Torbellino', mp: 8, lv: 6, t: 'enemies', d: 'Daño físico a todos' },
  desesperado: { n: 'Golpe Desesperado', mp: 8, lv: 10, t: 'enemy', d: 'Más daño mientras menos PV le queden' },
  // Nigromante
  drenarvida: { n: 'Drenar Vida', mp: 4, lv: 1, t: 'enemy', d: 'Magia ×1.4 y se cura la mitad' },
  maldicion: { n: 'Maldición', mp: 5, lv: 3, t: 'enemy', d: 'El enemigo recibe +30% de daño por 3 turnos' },
  esqueleto: { n: 'Alzar Esqueleto', mp: 10, lv: 6, t: 'none', d: 'Un esqueleto aliado ataca al final de cada ronda (3 rondas)' },
  plaga: { n: 'Plaga', mp: 14, lv: 10, t: 'enemies', d: 'Magia a todos y veneno' },
  // Druida
  raices: { n: 'Raíces', mp: 4, lv: 1, t: 'enemy', d: 'Daño leve; el enemigo pierde su próximo turno' },
  espinas: { n: 'Espinas', mp: 5, lv: 3, t: 'none', d: 'Refleja 30% del daño que recibe (3 turnos)' },
  oso: { n: 'Forma de Oso', mp: 8, lv: 6, t: 'none', d: '3 turnos: +50% PV temporales, +50% ATQ y regeneración; solo ataques físicos' },
  ira: { n: 'Ira de la Naturaleza', mp: 14, lv: 10, t: 'enemies', d: 'Magia a todos y veneno' },
  // Enano
  martillazo: { n: 'Martillazo', mp: 3, lv: 1, t: 'enemy', d: 'Daño físico ×1.6, 30% de aturdir' },
  piedra: { n: 'Piel de Piedra', mp: 4, lv: 3, t: 'none', d: '+60% DEF por 3 turnos' },
  cerveza: { n: 'Cerveza Enana', mp: 5, lv: 6, t: 'none', d: 'Cura 35% PV y quita estados (1 vez por combate)' },
  sismico: { n: 'Golpe Sísmico', mp: 10, lv: 10, t: 'enemies', d: 'Daño físico ×1.2 a todos' },
  // Elfo
  lunar: { n: 'Espada Lunar', mp: 3, lv: 1, t: 'enemy', d: 'Daño físico + mágico combinado' },
  canto: { n: 'Canto del Bosque', mp: 6, lv: 3, t: 'none', d: '+30% VEL y +10% crítico al grupo (3 turnos)' },
  danza: { n: 'Danza de Espadas', mp: 8, lv: 6, t: 'enemies', d: '3 golpes a enemigos al azar' },
  luzluna: { n: 'Luz de Luna', mp: 14, lv: 10, t: 'enemies', d: 'Magia a todos, ×2 a no-muertos' },
  // Goblin
  punalsucio: { n: 'Puñal Sucio', mp: 3, lv: 1, t: 'enemy', d: 'Daño + veneno' },
  trampa: { n: 'Trampa', mp: 4, lv: 3, t: 'none', d: 'El próximo enemigo que lo ataque recibe daño y queda aturdido' },
  bomba: { n: 'Bomba Casera', mp: 8, lv: 6, t: 'enemies', d: 'Daño de fuego a todos' },
  suerte: { n: 'Golpe de Suerte', mp: 6, lv: 10, t: 'enemy', d: 'Daño al azar entre ×0.5 y ×4' },
  // ---- Versión 3 · Fase 2: habilidades de las clases avanzadas (niveles 15 y 22) ----
  escudosag: { n: 'Escudo Sagrado', mp: 8, lv: 15, t: 'none', d: 'Escudo al aliado más débil' },
  juicio: { n: 'Juicio', mp: 12, lv: 22, t: 'enemy', d: 'Daño sagrado; ×2 a no-muertos' },
  muroesc: { n: 'Muro de Escudos', mp: 10, lv: 15, t: 'none', d: '+35% DEF y un escudo pequeño al grupo' },
  carga: { n: 'Carga', mp: 14, lv: 22, t: 'enemy', d: 'Daño físico ×2.8 y aturde' },
  infierno: { n: 'Infierno', mp: 16, lv: 15, t: 'enemies', d: 'Magia a todos y quemadura' },
  novasolar: { n: 'Nova Solar', mp: 22, lv: 22, t: 'enemy', d: 'Magia ×4 a uno' },
  acelerar: { n: 'Acelerar', mp: 10, lv: 15, t: 'none', d: 'El grupo actúa primero por 2 turnos' },
  detener: { n: 'Detener el Tiempo', mp: 14, lv: 22, t: 'enemy', d: 'El enemigo pierde 2 turnos (jefes: 1)' },
  marca: { n: 'Marca de Caza', mp: 6, lv: 15, t: 'enemy', d: 'El enemigo recibe +40% de daño (3 turnos)' },
  tormenta: { n: 'Tormenta de Flechas', mp: 14, lv: 22, t: 'enemies', d: '5 flechas a enemigos al azar' },
  perforante: { n: 'Disparo Perforante', mp: 8, lv: 15, t: 'enemy', d: 'Daño físico ×1.8 que ignora la DEF' },
  tiromortal: { n: 'Tiro Mortal', mp: 18, lv: 22, t: 'enemy', d: '×4 con crítico seguro' },
  sombra: { n: 'Sombra', mp: 6, lv: 15, t: 'none', d: 'Esquiva todo hasta su próximo turno y su siguiente golpe es crítico' },
  milcortes: { n: 'Mil Cortes', mp: 16, lv: 22, t: 'enemies', d: '8 cortes rápidos a enemigos al azar' },
  saqueo: { n: 'Saqueo', mp: 6, lv: 15, t: 'enemy', d: 'Golpe ×1.4 y roba siempre el doble de oro' },
  golpebajo: { n: 'Golpe Bajo', mp: 10, lv: 22, t: 'enemy', d: 'Daño ×1.6 y aturde seguro' },
  resmasiva: { n: 'Resurrección Masiva', mp: 22, lv: 15, t: 'none', d: 'Revive a todos los caídos con 30% PV' },
  santuario: { n: 'Santuario', mp: 12, lv: 22, t: 'none', d: 'Regeneración al grupo (3 turnos)' },
  profecia: { n: 'Profecía', mp: 12, lv: 15, t: 'none', d: 'Anula el próximo golpe a cada aliado' },
  juiciodiv: { n: 'Juicio Divino', mp: 18, lv: 22, t: 'enemies', d: 'Magia a todos; ×2 a no-muertos' },
  frenesi: { n: 'Frenesí', mp: 8, lv: 15, t: 'none', d: '2 ataques por turno durante 3 turnos' },
  rabia: { n: 'Rabia Sangrienta', mp: 10, lv: 22, t: 'none', d: '30% de robo de vida (3 turnos)' },
  atronador: { n: 'Grito Atronador', mp: 10, lv: 15, t: 'enemies', d: 'Daño leve a todos y 30% de aturdir a cada uno' },
  estandarte: { n: 'Estandarte', mp: 12, lv: 22, t: 'none', d: '+35% ATQ al grupo por 4 turnos' },
  ejercito: { n: 'Ejército', mp: 16, lv: 15, t: 'none', d: 'Invoca 2 esqueletos (3 rondas)' },
  cadaver: { n: 'Explosión de Cadáver', mp: 12, lv: 22, t: 'none', d: '3 rondas: cada enemigo que muere daña a los demás' },
  pacto: { n: 'Pacto de Sangre', mp: 0, lv: 15, t: 'none', d: 'Pierde 20% PV y recupera 40% PM' },
  agonia: { n: 'Agonía', mp: 12, lv: 22, t: 'enemy', d: 'Daño creciente durante 3 turnos' },
  osomayor: { n: 'Forma de Oso Ancestral', mp: 10, lv: 15, t: 'none', d: '5 turnos: +70% PV temporales, +50% ATQ y regeneración' },
  terremoto: { n: 'Terremoto', mp: 16, lv: 22, t: 'enemies', d: 'Daño físico a todos y 30% de aturdir' },
  cadena: { n: 'Cadena de Rayos', mp: 12, lv: 15, t: 'enemy', d: 'Magia ×1.7 que rebota en 2 enemigos más' },
  lluviasan: { n: 'Lluvia Sanadora', mp: 16, lv: 22, t: 'allies', d: 'Cura al grupo y regenera 2 turnos' },
  montana: { n: 'Golpe de Montaña', mp: 14, lv: 15, t: 'enemy', d: 'Daño físico ×3 y aturde' },
  avalancha: { n: 'Avalancha', mp: 18, lv: 22, t: 'enemies', d: 'Daño físico ×1.5 a todos' },
  runafuego: { n: 'Runa de Fuego', mp: 10, lv: 15, t: 'none', d: 'Los golpes físicos del grupo queman (3 turnos)' },
  runapiedra: { n: 'Runa de Piedra', mp: 14, lv: 22, t: 'none', d: 'Escudo de 20% PV a todo el grupo' },
  torbelfico: { n: 'Torbellino Élfico', mp: 14, lv: 15, t: 'enemies', d: '6 golpes a enemigos al azar' },
  pasosombrio: { n: 'Paso Sombrío', mp: 6, lv: 22, t: 'none', d: 'Esquiva todo hasta su próximo turno' },
  estrella: { n: 'Estrella Fugaz', mp: 14, lv: 15, t: 'enemy', d: 'Magia ×3' },
  velo: { n: 'Velo Lunar', mp: 12, lv: 22, t: 'none', d: '+30% de esquivar al grupo (2 turnos)' },
  granbomba: { n: 'Gran Bomba', mp: 16, lv: 15, t: 'enemies', d: 'Bomba ×2 a todos y quemadura' },
  mina: { n: 'Mina', mp: 8, lv: 22, t: 'none', d: 'Daña fuerte al próximo enemigo que actúe' },
  soborno: { n: 'Soborno', mp: 4, lv: 15, t: 'enemy', d: 'Paga oro y un enemigo (no jefe) se va; da la experiencia igual' },
  monedas: { n: 'Lluvia de Monedas', mp: 12, lv: 22, t: 'enemies', d: 'Daño a todos según el oro que tienes' },
};

// ================= Clases avanzadas (Versión 3 · Fase 2) =================
// Al nivel 15 cada héroe elige 1 de 2. Cambia el título y el ícono, ajusta un poco el crecimiento
// de stats desde el nivel 15 (g: multiplicador) y da 2 habilidades (niveles 15 y 22).
export const ADV = {
  paladin: { cls: 'guerrero', n: 'Paladín', e: '😇', d: 'Protege al grupo con luz sagrada.', g: { def: 1.1, mag: 1.6, atk: .95 }, sk: ['escudosag', 'juicio'] },
  caballero: { cls: 'guerrero', n: 'Caballero', e: '🏇', d: 'Muro de acero que carga contra el enemigo.', g: { def: 1.2, mhp: 1.1, spd: .9 }, sk: ['muroesc', 'carga'] },
  piromante: { cls: 'maga', n: 'Piromante', e: '🔥', d: 'Fuego que arrasa a todos.', g: { mag: 1.15, mhp: .95 }, sk: ['infierno', 'novasolar'] },
  cronomante: { cls: 'maga', n: 'Cronomante', e: '⏳', d: 'Controla el tiempo del combate.', g: { spd: 1.3, mmp: 1.15 }, sk: ['acelerar', 'detener'] },
  cazadora: { cls: 'arquera', n: 'Cazadora', e: '🏹', d: 'Marca a su presa y la acribilla.', g: { atk: 1.1, spd: 1.1 }, sk: ['marca', 'tormenta'] },
  francotiradora: { cls: 'arquera', n: 'Francotiradora', e: '🎯', d: 'Un disparo, una baja.', g: { atk: 1.2, def: .9 }, sk: ['perforante', 'tiromortal'] },
  asesino: { cls: 'picaro', n: 'Asesino', e: '🗡️', d: 'Desaparece y golpea donde duele.', g: { atk: 1.15, spd: 1.1, mhp: .95 }, sk: ['sombra', 'milcortes'] },
  ladron: { cls: 'picaro', n: 'Ladrón Maestro', e: '💰', d: 'Nada se le escapa.', g: { spd: 1.2, def: 1.05 }, sk: ['saqueo', 'golpebajo'] },
  sacerdotisa: { cls: 'sanadora', n: 'Sacerdotisa', e: '👼', d: 'Devuelve la vida a todo el grupo.', g: { mag: 1.1, mmp: 1.15 }, sk: ['resmasiva', 'santuario'] },
  oraculo: { cls: 'sanadora', n: 'Oráculo', e: '🔮', d: 'Ve el golpe antes de que llegue.', g: { mag: 1.15, def: 1.05 }, sk: ['profecia', 'juiciodiv'] },
  berserker: { cls: 'barbaro', n: 'Berserker', e: '💢', d: 'Golpea dos veces y se cura con la sangre.', g: { atk: 1.15, def: .9, mhp: 1.05 }, sk: ['frenesi', 'rabia'] },
  senorguerra: { cls: 'barbaro', n: 'Señor de la Guerra', e: '🚩', d: 'Su grito aturde y su estandarte inspira.', g: { mhp: 1.1, def: 1.1 }, sk: ['atronador', 'estandarte'] },
  senormuertos: { cls: 'nigromante', n: 'Señor de los Muertos', e: '☠️', d: 'Un ejército de huesos a su servicio.', g: { mag: 1.1, mmp: 1.1 }, sk: ['ejercito', 'cadaver'] },
  brujo: { cls: 'nigromante', n: 'Brujo', e: '🦹', d: 'Paga con sangre por un poder terrible.', g: { mag: 1.2, mhp: .95 }, sk: ['pacto', 'agonia'] },
  guardian: { cls: 'druida', n: 'Guardián de la Tierra', e: '🐻', d: 'El oso ancestral que hace temblar el suelo.', g: { mhp: 1.15, def: 1.1 }, sk: ['osomayor', 'terremoto'] },
  chaman: { cls: 'druida', n: 'Chamán de Tormentas', e: '⛈️', d: 'Rayos que saltan y lluvia que cura.', g: { mag: 1.15, mmp: 1.05 }, sk: ['cadena', 'lluviasan'] },
  rompemontanas: { cls: 'enano', n: 'Rompemontañas', e: '⛏️', d: 'Golpes que parten la roca.', g: { atk: 1.15 }, sk: ['montana', 'avalancha'] },
  runico: { cls: 'enano', n: 'Herrero Rúnico', e: '🔨', d: 'Runas que encienden y protegen al grupo.', g: { def: 1.1, mag: 1.5 }, sk: ['runafuego', 'runapiedra'] },
  danzante: { cls: 'elfo', n: 'Danzante de Espadas', e: '⚔️', d: 'Una tormenta de acero imposible de tocar.', g: { atk: 1.1, spd: 1.15 }, sk: ['torbelfico', 'pasosombrio'] },
  archimago: { cls: 'elfo', n: 'Archimago Élfico', e: '🌟', d: 'Estrellas y velos de luz de luna.', g: { mag: 1.2 }, sk: ['estrella', 'velo'] },
  bombardero: { cls: 'goblin', n: 'Bombardero', e: '💣', d: 'Si explota, mejor.', g: { atk: 1.05, mag: 1.3 }, sk: ['granbomba', 'mina'] },
  reygoblin: { cls: 'goblin', n: 'Rey Goblin', e: '👑', d: 'Todo se arregla con oro.', g: { spd: 1.1, mhp: 1.1 }, sk: ['soborno', 'monedas'] },
};
export const ADV_LVL = 15;
export const advOf = cls => Object.keys(ADV).filter(k => ADV[k].cls === cls);

// ================= Talentos (Versión 3 · Fase 2) =================
// En los niveles 5, 10, 20 y 30 cada héroe elige 1 de 2 pasivas: [ofensiva, defensiva o de utilidad].
// fx: efectos que leen state.js (stats en %) y battle.js. Las claves están explicadas en README.md.
export const TAL_LVLS = [5, 10, 20, 30];
const T = (id, n, d, fx) => ({ id, n, d, fx });
export const TAL = {
  guerrero: {
    5: [T('sangre', 'Sed de Sangre', '+10% ATQ y 5% de robo de vida', { atkP: .1, ls: 5 }), T('hierro', 'Piel de Hierro', '+15% DEF', { defP: .15 })],
    10: [T('certero', 'Golpe Certero', 'Golpe Fuerte y Golpe Titánico hacen +25%', { skB: { golpe: .25, titanico: .25 } }), T('vital', 'Vitalidad', '+15% PV máximos', { mhpP: .15 })],
    20: [T('furiag', 'Furia del Guerrero', '+8% de crítico', { crit: 8 }), T('bastion', 'Bastión', 'Empieza cada combate con un escudo de 15% PV', { startShield: .15 })],
    30: [T('masacre', 'Masacre', '+15% ATQ', { atkP: .15 }), T('inque', 'Inquebrantable', 'Una vez por combate queda con 1 PV en vez de caer', { lastStand: 1 })],
  },
  maga: {
    5: [T('afilada', 'Mente Afilada', '+12% MAG', { magP: .12 }), T('reserva', 'Reserva Arcana', '+20% PM máximos', { mmpP: .2 })],
    10: [T('quema', 'Quemadura', 'Bola de Fuego quema 3 turnos', { skBurn: { fuego: 1 } }), T('ecomag', 'Eco Mágico', '15% de no gastar PM', { mpSave: .15 })],
    20: [T('tormarc', 'Tormenta Arcana', 'Ventisca y Meteoro hacen +20%', { skB: { ventisca: .2, meteoro: .2 } }), T('barrera', 'Barrera', 'Empieza cada combate con un escudo de 20% PV', { startShield: .2 })],
    30: [T('absoluto', 'Poder Absoluto', '+15% MAG', { magP: .15 }), T('medita', 'Meditación', 'Recupera 3 PM al empezar su turno', { mpRegen: 3 })],
  },
  arquera: {
    5: [T('agudo', 'Ojo Agudo', '+6% de crítico', { crit: 6 }), T('ligeros', 'Pies Ligeros', '+10% de esquivar golpes físicos', { dodge: 10 })],
    10: [T('venpot', 'Veneno Potente', 'El veneno que aplica hace +50%', { poisonP: .5 }), T('rapidez', 'Rapidez', '+15% VEL', { spdP: .15 })],
    20: [T('punteria', 'Puntería', '+12% ATQ', { atkP: .12 }), T('instinto', 'Instinto', '+15% PV máximos', { mhpP: .15 })],
    30: [T('letal', 'Disparo Letal', 'Los críticos hacen ×2.25', { critDmg: .5 }), T('camuflaje', 'Camuflaje', '+15% de esquivar golpes físicos', { dodge: 15 })],
  },
  picaro: {
    5: [T('filo', 'Filo Oculto', '+8% de crítico', { crit: 8 }), T('manos', 'Manos Rápidas', 'Robar acierta +25%', { stealP: .25 })],
    10: [T('venenos', 'Venenos', 'El veneno que aplica hace +50%', { poisonP: .5 }), T('evasion', 'Evasión', '+12% de esquivar golpes físicos', { dodge: 12 })],
    20: [T('ejecutor', 'Ejecutor', '+20% de daño a enemigos con menos de 50% PV', { execP: .2 }), T('botin', 'Botín Extra', '+20% de oro en los combates', { goldP: .2 })],
    30: [T('critlet', 'Críticos Letales', 'Los críticos hacen ×2.25', { critDmg: .5 }), T('sombraviva', 'Sombra Viva', '+15% de esquivar golpes físicos', { dodge: 15 })],
  },
  sanadora: {
    5: [T('luzard', 'Luz Ardiente', 'Luz Sagrada hace +30%', { skB: { luz: .3 } }), T('benditas', 'Manos Benditas', '+20% de curación', { healP: .2 })],
    10: [T('fervor', 'Fervor', '+12% MAG', { magP: .12 }), T('ecosag', 'Eco Sagrado', '15% de no gastar PM', { mpSave: .15 })],
    20: [T('ira_s', 'Ira Celestial', '+8% de crítico y +10% ATQ', { crit: 8, atkP: .1 }), T('aura', 'Aura de Vida', 'Regenera 4% PV al empezar su turno', { regen: .04 })],
    30: [T('milagro', 'Milagro', '+30% de curación', { healP: .3 }), T('angel', 'Ángel Guardián', 'Una vez por combate queda con 1 PV en vez de caer', { lastStand: 1 })],
  },
  barbaro: {
    5: [T('sangreb', 'Sed de Sangre', '6% de robo de vida', { ls: 6 }), T('gruesa', 'Piel Gruesa', '+15% PV máximos', { mhpP: .15 })],
    10: [T('ira_b', 'Ira Creciente', '+25% ATQ con menos de 50% PV', { lowHpAtk: .25 }), T('rugido', 'Rugido', 'Furia ya no cuesta vida', { furyFree: 1 })],
    20: [T('pesada', 'Hacha Pesada', '+12% ATQ', { atkP: .12 }), T('aguante', 'Aguante', '+12% DEF', { defP: .12 })],
    30: [T('carnicero', 'Carnicero', '+8% de crítico y críticos ×2', { crit: 8, critDmg: .25 }), T('imparable', 'Imparable', 'Una vez por combate queda con 1 PV en vez de caer', { lastStand: 1 })],
  },
  nigromante: {
    5: [T('hambre', 'Hambre Oscura', 'Drenar Vida cura el 100% del daño', { drainFull: 1 }), T('velo_n', 'Velo Sombrío', '+12% DEF', { defP: .12 })],
    10: [T('peste', 'Peste', 'El veneno que aplica hace +50%', { poisonP: .5 }), T('huesos', 'Huesos Fuertes', 'El esqueleto dura 2 rondas más', { summonT: 2 })],
    20: [T('oscuro', 'Poder Oscuro', '+15% MAG', { magP: .15 }), T('alma', 'Alma Robada', 'Recupera 3 PM al empezar su turno', { mpRegen: 3 })],
    30: [T('maldprof', 'Maldición Profunda', 'Su Maldición hace +50% de daño recibido (en vez de +30%)', { curseP: .2 }), T('inmortal', 'Inmortal', 'Una vez por combate queda con 1 PV en vez de caer', { lastStand: 1 })],
  },
  druida: {
    5: [T('afiladas', 'Espinas Afiladas', 'Espinas refleja 50% (en vez de 30%)', { thornsP: .2 }), T('savia', 'Savia', 'Regenera 3% PV al empezar su turno', { regen: .03 })],
    10: [T('salvaje', 'Furia Salvaje', 'En forma de oso, +25% ATQ extra', { bearP: .25 }), T('raicesp', 'Raíces Profundas', 'Raíces hace +60%', { skB: { raices: .6 } })],
    20: [T('gaia', 'Ira de Gaia', 'Ira de la Naturaleza hace +25%', { skB: { ira: .25 } }), T('corteza', 'Corteza', '+15% DEF', { defP: .15 })],
    30: [T('natsalv', 'Naturaleza Salvaje', '+12% ATQ y MAG', { atkP: .12, magP: .12 }), T('renacer', 'Renacer', 'Una vez por combate queda con 1 PV en vez de caer', { lastStand: 1 })],
  },
  enano: {
    5: [T('martpes', 'Martillo Pesado', 'Martillazo aturde 50% de las veces', { stunUp: .2 }), T('roca', 'Roca Viva', '+15% DEF', { defP: .15 })],
    10: [T('fuerzam', 'Fuerza de la Montaña', '+12% ATQ', { atkP: .12 }), T('barba', 'Barba de Hierro', 'Empieza cada combate con un escudo de 15% PV', { startShield: .15 })],
    20: [T('runag', 'Golpe Rúnico', '+8% de crítico y +10% ATQ', { crit: 8, atkP: .1 }), T('cerveza2', 'Cerveza Doble', 'Cerveza Enana se puede usar 2 veces por combate', { beer2: 1 })],
    30: [T('bolsa', 'Bolsa de Oro', '+20% de oro en los combates', { goldP: .2 }), T('fortaleza', 'Fortaleza', '+20% PV máximos', { mhpP: .2 })],
  },
  elfo: {
    5: [T('hoja', 'Hoja Lunar', 'Espada Lunar hace +25%', { skB: { lunar: .25 } }), T('gracia', 'Gracia Élfica', '+10% de esquivar golpes físicos', { dodge: 10 })],
    10: [T('agil', 'Agilidad', '+15% VEL', { spdP: .15 }), T('cantosan', 'Canto Sanador', 'Canto del Bosque también cura 10% PV al grupo', { songHeal: .1 })],
    20: [T('ojobosque', 'Ojo del Bosque', '+8% de crítico', { crit: 8 }), T('sabia', 'Sabiduría Antigua', '+12% MAG', { magP: .12 })],
    30: [T('danzap', 'Danza Perfecta', 'Danza de Espadas da 4 golpes', { danceExtra: 1 }), T('espiritu', 'Espíritu Libre', '+15% de esquivar golpes físicos', { dodge: 15 })],
  },
  goblin: {
    5: [T('polvora', 'Pólvora Extra', 'Bomba Casera hace +30%', { skB: { bomba: .3 } }), T('hondos', 'Bolsillos Hondos', '+15% de oro en los combates', { goldP: .15 })],
    10: [T('suerteg', 'Suerte de Goblin', '+8% de crítico', { crit: 8 }), T('escurri', 'Escurridizo', '+10% de esquivar golpes físicos', { dodge: 10 })],
    20: [T('afortun', 'Golpe Afortunado', 'Golpe de Suerte nunca baja de ×1.5', { luckyMin: 1 }), T('trampero', 'Trampero', 'Detecta 90% de las trampas de las mazmorras', { trapDet: 1 })],
    30: [T('rata', 'Rata Lista', '+15% ATQ y +10% VEL', { atkP: .15, spdP: .1 }), T('esquivo', 'Esquivo', '+15% de esquivar golpes físicos', { dodge: 15 })],
  },
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
  // Versión 3 · Fase 3: monstruos nocturnos (solo aparecen de noche)
  vampiro: { n: 'Murciélago Vampiro', e: '🦇', hp: 18, atk: 10, def: 3, mag: 9, spd: 14, xp: 11, g: 9, sk: ['drenar'], tint: 'hue-rotate(320deg) saturate(2.2) brightness(.9)' },
  lobosombra: { n: 'Lobo de Sombra', e: '🐺', hp: 28, atk: 13, def: 4, spd: 11, xp: 13, g: 9, sk: ['brutal'], tint: 'brightness(.45) contrast(1.4) drop-shadow(0 0 6px #7c3aed)' },
  espectro2: { n: 'Espectro Errante', e: '👻', hp: 24, atk: 7, def: 3, mag: 13, spd: 9, xp: 14, g: 11, sk: ['drenar'], undead: 1, magic: 1, tint: 'hue-rotate(200deg) saturate(2) opacity(.85)' },
  // Versión 3 · Fase 1: monstruos de cueva
  golem: { n: 'Gólem', e: '🗿', hp: 40, atk: 12, def: 11, spd: 2, xp: 16, g: 12, sk: ['brutal'], min: 2 },
  minero: { n: 'Minero Fantasma', e: '👻', hp: 22, atk: 10, def: 3, mag: 9, spd: 8, xp: 12, g: 14, sk: ['drenar'], undead: 1, tint: 'sepia(1) saturate(2.5) brightness(1.1)' },
  serpmar: { n: 'Serpiente Marina', e: '🐍', hp: 26, atk: 12, def: 4, spd: 9, xp: 12, g: 10, sk: ['veneno'], tint: 'hue-rotate(160deg) saturate(1.4)' },
  // Jefes
  ogro: { n: 'Ogro Rey', e: '👹', hp: 100, atk: 16, def: 6, mag: 4, spd: 5, xp: 85, g: 110, sk: ['brutal'], boss: 1, tint: 'hue-rotate(90deg)' },
  rex: { n: 'Tirano de Arena', e: '🦖', hp: 110, atk: 17, def: 6, spd: 6, xp: 95, g: 100, sk: ['brutal'], boss: 1 },
  dragon: { n: 'Dragón Glacial', e: '🐉', hp: 95, atk: 15, def: 7, mag: 14, spd: 8, xp: 90, g: 120, sk: ['fuego', 'brutal'], boss: 1 },
  kraken: { n: 'Kraken', e: '🐙', hp: 95, atk: 14, def: 6, mag: 10, spd: 6, xp: 90, g: 110, sk: ['veneno', 'brutal'], boss: 1 },
  reyesq: { n: 'Rey Esqueleto', e: '💀', hp: 85, atk: 13, def: 7, mag: 12, spd: 7, xp: 85, g: 110, sk: ['drenar', 'fuego'], undead: 1, boss: 1, tint: 'drop-shadow(0 0 12px #ff3030)' },
  // Jefe de mundo semanal (Versión 3 · Fase 4): la vida real la lleva el servidor
  titan: { n: 'Titán de Lava', e: '🌋', hp: 400, atk: 16, def: 8, mag: 14, spd: 5, xp: 160, g: 0, sk: ['fuego', 'brutal'], boss: 1, tint: 'drop-shadow(0 0 14px #ff5a1f)' },
  // Jefes de mazmorra (Versión 3 · Fase 1)
  liche: { n: 'Señor de la Cripta', e: '💀', hp: 95, atk: 13, def: 7, mag: 14, spd: 7, xp: 100, g: 125, sk: ['drenar', 'fuego'], undead: 1, boss: 1, tint: 'drop-shadow(0 0 12px #a855f7)' },
  reinaarana: { n: 'Reina Araña', e: '🕷️', hp: 100, atk: 15, def: 6, spd: 9, xp: 100, g: 120, sk: ['veneno', 'brutal'], boss: 1, tint: 'hue-rotate(300deg) saturate(2) drop-shadow(0 0 10px #ff3060)' },
  golemrey: { n: 'Gólem Ancestral', e: '🗿', hp: 120, atk: 16, def: 10, spd: 3, xp: 105, g: 130, sk: ['brutal'], boss: 1, tint: 'sepia(.6) saturate(2) drop-shadow(0 0 10px #f2c14e)' },
};
// ================= Logros (Versión 3 · Fase 4) =================
// Cada logro da un título (se muestra bajo el nombre) y a veces oro u objetos. need(s): s = estadísticas del jugador.
export const ACH_CATS = { exp: '🧭 Exploración', fight: '⚔️ Combate', dun: '🕳️ Mazmorras', coop: '🤝 Cooperativo', col: '💎 Colección', cls: '🌟 Clases', world: '🌋 Mundo y arena' };
const A = (id, cat, n, d, title, need, reward) => ({ id, cat, n, d, title, need, reward: reward || null });
export const ACH = [
  A('exp100', 'exp', 'Primeros Pasos', 'Llega a 100 casillas de Ciudad Origen', 'el Caminante', s => s.maxDist >= 100, { gold: 100 }),
  A('exp250', 'exp', 'Más Allá', 'Llega a 250 casillas de Ciudad Origen', 'el Explorador', s => s.maxDist >= 250, { gold: 300 }),
  A('exp500', 'exp', 'Fin del Mapa', 'Llega a 500 casillas de Ciudad Origen', 'el Trotamundos', s => s.maxDist >= 500, { gold: 800, item: 'epico' }),
  A('vil10', 'exp', 'Cartógrafo', 'Descubre 10 aldeas', 'el Cartógrafo', s => s.villages >= 10, { gold: 200 }),
  A('vil25', 'exp', 'Viajero Incansable', 'Descubre 25 aldeas', 'el Viajero', s => s.villages >= 25, { gold: 500 }),
  A('boat', 'exp', 'A Toda Vela', 'Consigue un bote', 'el Navegante', s => s.boat),
  A('k100', 'fight', 'Cazador', 'Derrota 100 monstruos', 'el Cazador', s => s.kills >= 100, { gold: 150 }),
  A('k500', 'fight', 'Implacable', 'Derrota 500 monstruos', 'el Implacable', s => s.kills >= 500, { gold: 600, item: 'raro' }),
  A('boss1', 'fight', 'Primer Jefe', 'Derrota a tu primer jefe', 'Matajefes', s => s.bosses >= 1, { gold: 150 }),
  A('boss10', 'fight', 'Matadragones', 'Derrota 10 jefes', 'Matadragones', s => s.bosses >= 10, { gold: 800, item: 'epico' }),
  A('clean', 'fight', 'Intocable', 'Derrota a un jefe sin que caiga nadie del grupo', 'el Intocable', s => s.cleanBoss >= 1, { gold: 200 }),
  A('night50', 'fight', 'Criatura de la Noche', 'Derrota 50 monstruos de noche', 'el Nocturno', s => s.nightKills >= 50, { gold: 300 }),
  A('dun1', 'dun', 'Espeleólogo', 'Completa 1 mazmorra', 'el Espeleólogo', s => s.dungeons >= 1, { gold: 200 }),
  A('dun5', 'dun', 'Saqueador de Criptas', 'Completa 5 mazmorras', 'Saqueador de Criptas', s => s.dungeons >= 5, { gold: 600, item: 'epico' }),
  A('dun10', 'dun', 'Señor de las Profundidades', 'Completa 10 mazmorras', 'Señor de las Profundidades', s => s.dungeons >= 10, { gold: 1200, item: 'legendario' }),
  A('coop1', 'coop', 'Compañero', 'Gana tu primer jefe en equipo', 'el Compañero', s => s.coopWins >= 1, { gold: 150 }),
  A('coop5', 'coop', 'Hermanos de Armas', 'Gana 5 jefes en equipo', 'Hermano de Armas', s => s.coopWins >= 5, { gold: 500, item: 'epico' }),
  A('legend', 'col', 'Afortunado', 'Consigue un objeto legendario', 'el Afortunado', s => s.legend),
  A('pets3', 'col', 'Domador', 'Ten 3 mascotas', 'el Domador', s => s.pets >= 3, { gold: 300 }),
  A('gold2k', 'col', 'Bolsillos Llenos', 'Junta 2000 de oro', 'el Rico', s => s.gold >= 2000),
  A('chest25', 'col', 'Buscatesoros', 'Abre 25 cofres', 'el Buscatesoros', s => s.chests >= 25, { gold: 250 }),
  A('epic5', 'col', 'Coleccionista', 'Ten 5 objetos Épicos o mejores', 'el Coleccionista', s => s.epics >= 5, { gold: 300 }),
  A('cls15', 'cls', 'Maestro de Clases', 'Lleva 3 clases distintas a nivel 15', 'el Maestro', s => s.lvl15 >= 3, { gold: 500 }),
  A('adv1', 'cls', 'Evolución', 'Elige tu primera clase avanzada', 'el Elegido', s => s.advs >= 1, { gold: 200 }),
  A('lvl30', 'cls', 'Leyenda Viva', 'Lleva un héroe a nivel 30', 'el Legendario', s => s.maxLvl >= 30, { gold: 1000, item: 'legendario' }),
  A('tal10', 'cls', 'Sabio', 'Elige 10 talentos en total', 'el Sabio', s => s.talents >= 10, { gold: 300 }),
  A('wb1', 'world', 'Defensor del Reino', 'Haz daño al jefe de mundo', 'Defensor del Reino', s => s.wbHits >= 1, { gold: 200 }),
  A('wbkill', 'world', 'Azote de Titanes', 'Ayuda a derrotar al jefe de mundo', 'Azote de Titanes', s => s.wbKills >= 1),
  A('pvp1', 'world', 'Duelista', 'Gana un duelo en la arena', 'el Duelista', s => s.pvpWins >= 1, { gold: 100 }),
  A('pvp10', 'world', 'Campeón de la Arena', 'Gana 10 duelos en la arena', 'Campeón de la Arena', s => s.pvpWins >= 10, { gold: 1000, item: 'epico' }),
];
export const TITLES = ACH.map(a => a.title);
// ================= Jefe de mundo semanal (Versión 3 · Fase 4) =================
export const WB_KEY = 'titan', WB_ROUNDS = 10, WEEK_MS = 7 * 24 * 3600 * 1000, WB_EPOCH = Date.UTC(2026, 0, 5);   // lunes
export const wbWeek = now => Math.floor((now - WB_EPOCH) / WEEK_MS);
// Vida y nivel según cuántas veces ya lo derrotaron en la sala (reaparece más fuerte)
export const wbStats = gen => ({ lvl: 12 + 4 * gen, mhp: Math.round(6000 * (1 + .5 * gen)) });

// ================= Noche y mascotas (Versión 3 · Fase 3) =================
export const NIGHT_POOL = ['vampiro', 'lobosombra', 'espectro2'];
// Mascotas: el efecto mejora con el nivel (máx. 20). El búho no pelea: revela cosas en el minimapa.
export const PETS = {
  lobo: { n: 'Lobo', e: '🐺', d: 'Ataca a un enemigo al final de cada ronda' },
  buho: { n: 'Búho', e: '🦉', d: 'Revela trampas y cofres cercanos en el minimapa' },
  gato: { n: 'Gato', e: '🐈', d: '+15% de botín y oro' },
  dragon: { n: 'Dragoncito', e: '🐲', d: 'Pequeño daño de fuego a todos cada 2 rondas' },
  tortuga: { n: 'Tortuga', e: '🐢', d: 'Escudo al héroe con menos vida una vez por combate' },
  zorro: { n: 'Zorro', e: '🦊', d: '+10% de probabilidad de huir y de esquivar' },
};
export const PET_EMOJIS = Object.values(PETS).map(p => p.e);
export const EGG_STEPS = 300, EGG_PRICE = 800, PET_MAX = 20;

// ================= Mazmorras (Versión 3 · Fase 1) =================
// Tipo de cueva: monstruos, jefe, nombres ({V} = nombre inventado) y colores del piso
export const CAVE = {
  cripta: { n: 'Cripta', pool: ['esqueleto', 'zombi', 'fantasma', 'murcielago'], boss: 'liche', names: ['Cripta de {V}', 'Catacumbas de {V}', 'Cripta Olvidada', 'Cripta del Silencio'], wall: '#241f2c', floor: '#4b4655', line: '#5d5768' },
  gruta: { n: 'Gruta', pool: ['arana', 'murcielago', 'serpiente', 'golem'], boss: 'reinaarana', names: ['Gruta de {V}', 'Gruta Sombría', 'Cueva de los Ecos', 'Cueva de {V}'], wall: '#1b2620', floor: '#3e4b40', line: '#4f5d50' },
  mina: { n: 'Mina', pool: ['minero', 'golem', 'murcielago', 'rata'], boss: 'golemrey', names: ['Mina de {V}', 'Mina Olvidada', 'Minas Profundas', 'Socavón de {V}'], wall: '#2e2419', floor: '#5a4a38', line: '#6c5a45' },
};
BG.CAVE = 'linear-gradient(#07060b,#221d2b 44%,#3a3444 45%,#110f16)';
export const POOL = { GRASS: ['rata', 'jabali', 'abeja', 'lobo'], FOREST: ['arana', 'lobo', 'oso', 'murcielago'], DESERT: ['escorpion', 'serpiente', 'momia'], SNOW: ['loboartico', 'osopolar', 'espectro'], SWAMP: ['sapo', 'cocodrilo', 'zombi'], SAND: ['cangrejo', 'serpiente', 'rata'], ASH: ['esqueleto', 'demonio', 'fantasma'] };
// En el mar (con bote): encuentros al azar, menos frecuentes; muy rara vez el Kraken
export const SEA_POOL = ['cangrejo', 'serpmar', 'serpmar'];
export const BOAT_PRICE = 300;
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
// Emojis de líder válidos: los de las clases y los de las clases avanzadas
export const LEADER_EMOJIS = [...Object.values(CL).map(c => c.e), ...Object.values(ADV).map(a => a.e)];
export const MAX_PARTY = 3;
export const MAX_PLAYERS = 4;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I ni O (ni números)
export const PIN_TTL = 120000; // 2 minutos
