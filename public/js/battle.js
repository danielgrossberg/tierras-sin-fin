// Combate por turnos. Cada jugador pelea sus propios combates (todo local).
// Versión 2: 6 clases nuevas con estados (aturdido, maldición, espinas, forma de oso, invocación,
// regeneración, canto del bosque, furia, piel de piedra, trampa) y muerte con tumba 🪦.
// Jefes en equipo (Versión 2 · Fase 3): el anfitrión corre aquí el combate con los héroes de todos
// (BT.party); los héroes remotos esperan la acción de su jugador (remoteTurn) y el estado se transmite
// a los invitados (coopSnapshot). La invitación, la sala y la vista del invitado están en coop.js.
'use strict';
import { $, sleep, clamp, pick, esc } from './util.js';
import { CL, SK, IT, EN, BG } from './data.js';
import { atkMulB, defMulB, estimate, itemTargets, heroCardHTML } from './estimate.js';
import { ebarHTML, setBar, bossBar } from './hpbar.js';
import { G, P, START, held, st, S, heroes, alive, learned, gainXP, eqSum, heroFx, talFx, talSk, clsName } from './state.js';
import { createTomb } from './tomb.js';
import { monsters, mpos, spawnNearby, visitAround } from './world.js';
import { rollLoot, addItem, itemLabel, RAR } from './items.js';
import { onVictory } from './quests.js';
import { updateHUD, toast } from './ui.js';
import { save } from './storage.js';
import { notice } from './net.js';

let BT = null, eid = 0;
export const getBT = () => BT;
// Para las simulaciones de balance: una función que elige las opciones del menú sin tocar la pantalla
let AUTO = null;
export const setAutoPlayer = f => { AUTO = f; };
// Participantes del combate: el grupo propio o, en un jefe en equipo, 1 héroe por jugador
const party = () => (BT && BT.party) || heroes();
// Pasivas de grupo
const partyHas = cls => party().some(h => h.cls === cls);
const TURN_MS = 30000;   // tiempo por turno en los combates en equipo

// ================= Participación (para repartir la experiencia) =================
// Daño realmente aplicado, +25% PV máx. del enemigo por rematarlo, curación real
// y un monto fijo por apoyo (mejoras al grupo, revivir, robar).
function credit(u, v) { if (BT && u && u.isHero && v > 0) BT.pts[u.id] = (BT.pts[u.id] || 0) + v; }
const support = u => credit(u, BT ? BT.supp : 0);
function hurtEnemy(by, d, before) { if (d.isHero) return; credit(by, before - d.hp); if (d.hp <= 0) credit(by, d.mhp * .25); }
// Reparte X de experiencia entre los héroes del grupo según sus puntos
function splitXP(party, X) {
  const pts = party.map(h => Math.max(0, BT.pts[h.id] || 0));
  const elig = party.map(h => h.hp > 0 && BT.acted.has(h.id));     // vivos que actuaron: mínimo 5%
  const sum = pts.reduce((a, b) => a + b, 0);
  let sh;
  if (sum <= 0) { const n = elig.filter(Boolean).length || 1; sh = party.map((h, i) => elig[i] ? X / n : 0); }
  else {
    const floor = X * .05; sh = pts.map(p => X * p / sum);
    const low = sh.map((v, i) => elig[i] && v < floor), nLow = low.filter(Boolean).length;
    if (nLow) {
      const rest = X - floor * nLow, so = pts.reduce((a, p, i) => a + (low[i] ? 0 : p), 0);
      sh = sh.map((v, i) => low[i] ? floor : (so > 0 ? rest * pts[i] / so : 0));
    }
  }
  return sh.map(v => Math.round(v));
}

// ================= Efectos de habilidades =================
const allEnemiesAoE = async (u, ts, fn, o) => { for (const t of ts) if (t.hp > 0) { const d = await strike(u, t, fn(t), Object.assign({ fast: 1 }, o)); if (o && o.burn && d && t.hp > 0) { t.burn = 3; t.burnBy = u; } } };
// Cerveza Enana: 1 vez por combate (2 con el talento Cerveza Doble)
const beerOut = h => BT.used.has('cerveza:' + h.id) && (!talFx(h, 'beer2') || BT.used.has('cerveza2:' + h.id));
const RUN = {
  golpe: async (u, [t]) => { await strike(u, t, phys(u, t, 1.8)); },
  grito: async u => { for (const h of alive(party())) { h.buffs.atk = 3; popup(h, 'ATQ ↑', '#f2c14e'); } support(u); refresh(); await sleep(600); },
  torbellino: (u, ts) => allEnemiesAoE(u, ts, t => phys(u, t, 1.1)),
  titanico: async (u, [t]) => { await strike(u, t, phys(u, t, 3)); },
  fuego: async (u, [t]) => { await strike(u, t, magic(u, t, 1.7), { col: '#ff9a3d' }); },
  ventisca: (u, ts) => allEnemiesAoE(u, ts, t => magic(u, t, 1.1), { col: '#9fd8ff' }),
  rayo: async (u, [t]) => { await strike(u, t, magic(u, t, 2.8), { col: '#fff27a' }); },
  meteoro: (u, ts) => allEnemiesAoE(u, ts, t => magic(u, t, 2), { col: '#ff6a3d' }),
  doble: async (u, [t]) => { await strike(u, t, phys(u, t, .9), { fast: 1 }); const t2 = t.hp > 0 ? t : pick(alive(BT.enemies)); if (t2) await strike(u, t2, phys(u, t2, .9)); },
  flechaven: async (u, [t]) => { const d = await strike(u, t, phys(u, t, 1)); if (d && t.hp > 0) { t.poison = 4; t.poisonBy = u; popup(t, '☠ Veneno', '#c27bff'); refresh(); await sleep(300); } },
  lluvia: (u, ts) => allEnemiesAoE(u, ts, t => phys(u, t, .9)),
  halcon: async (u, [t]) => { await strike(u, t, phys(u, t, 2.4, { crit: true }), { sure: 1 }); },
  robar: async (u, [t]) => {
    if (t.stolen) { popup(t, 'Ya no tiene nada', '#ccc'); await sleep(600); return; }
    if (Math.random() < .65 + talFx(u, 'stealP')) {
      t.stolen = 1; support(u);
      if (u.remote || Math.random() < .65) { const g = Math.round(4 + t.g * (.6 + Math.random())); if (u.remote) BT.extra[u.owner] = (BT.extra[u.owner] || 0) + g; else G.gold += g; popup(t, `+${g} oro`, '#f2c14e'); log(`${u.name} roba <b>${g} de oro</b>`); }
      else { const k = pick(['pocion', 'pocion', 'eter', 'pluma']); G.items[k]++; popup(t, IT[k].n, '#46c37b'); log(`${u.name} roba <b>${IT[k].e} ${IT[k].n}</b>`); }
    } else { popup(t, '¡Falló!', '#ccc'); }
    refresh(); await sleep(650);
  },
  punalada: async (u, [t]) => { await strike(u, t, phys(u, t, 1.5, { critC: .5 })); },
  dagas: async (u, ts) => { for (const t of ts) { if (t.hp <= 0) continue; const d = await strike(u, t, phys(u, t, .7), { fast: 1 }); if (d && t.hp > 0 && Math.random() < .5) { t.poison = 3; t.poisonBy = u; popup(t, '☠', '#c27bff'); } } refresh(); },
  asesinar: async (u, [t]) => {
    if (!t.boss && t.hp / t.mhp < .25) { credit(u, t.hp + t.mhp * .25); popup(t, '¡ELIMINADO!', '#ff4d4d'); anim(t, 'hit'); kill(t); refresh(); await sleep(600); }
    else await strike(u, t, phys(u, t, 2.5));
  },
  curar: async (u, [t]) => { heal(t, S(u, 'mag') * 2.2 + 12, u); t.poison = 0; refresh(); await sleep(500); },
  luz: async (u, [t]) => { await strike(u, t, magic(u, t, t.undead ? 3 : 1.5), { col: '#fff8c4' }); },
  curartodos: async (u, ts) => { for (const t of ts) { heal(t, S(u, 'mag') * 1.5 + 8, u); t.poison = 0; } refresh(); await sleep(600); },
  revivir: async (u, [t]) => { t.hp = Math.round(S(t, 'mhp') * .5); popup(t, '¡Revive!', '#46c37b'); support(u); refresh(); await sleep(600); },
  bendicion: async u => { for (const h of alive(party())) { h.buffs.def = 3; popup(h, 'DEF ↑', '#9fd8ff'); } support(u); refresh(); await sleep(600); },
  // ---- Bárbaro
  hachazo: async (u, [t]) => { await strike(u, t, phys(u, t, 1.8)); },
  furia: async u => { const c = talFx(u, 'furyFree') ? 0 : Math.max(1, Math.round(S(u, 'mhp') * .1)); u.hp = Math.max(1, u.hp - c); u.buffs.fury = 3; popup(u, '😡 Furia' + (c ? ' -' + c : ''), '#ff7a5c'); refresh(); await sleep(500); },
  torbellinob: (u, ts) => allEnemiesAoE(u, ts, t => phys(u, t, 1.1)),
  desesperado: async (u, [t]) => { const m = 1.4 + 2.6 * (1 - u.hp / S(u, 'mhp')); popup(u, '×' + m.toFixed(1), '#ff7a5c'); await strike(u, t, phys(u, t, m)); },
  // ---- Nigromante
  drenarvida: async (u, [t]) => { const d = await strike(u, t, magic(u, t, 1.4), { col: '#c27bff' }); if (d && u.hp > 0) heal(u, d * (talFx(u, 'drainFull') ? 1 : .5), u); },
  maldicion: async (u, [t]) => { t.buffs.curse = 3; t.curseP = talFx(u, 'curseP'); popup(t, '🔮 Maldito', '#c27bff'); support(u); refresh(); await sleep(500); },
  esqueleto: async u => { BT.summons = BT.summons.filter(x => x.owner !== u); BT.summons.push({ owner: u, turns: 3 + talFx(u, 'summonT') }); popup(u, '💀 ¡Esqueleto!', '#e8e2d0'); support(u); refresh(); await sleep(500); },
  plaga: async (u, ts) => { for (const t of ts) { if (t.hp <= 0) continue; const d = await strike(u, t, magic(u, t, 1), { fast: 1, col: '#9fe870' }); if (d && t.hp > 0) { t.poison = 3; t.poisonBy = u; } } refresh(); },
  // ---- Druida
  raices: async (u, [t]) => { const d = await strike(u, t, magic(u, t, .6), { col: '#7bd88f' }); if (d && t.hp > 0) { t.stun = 1; popup(t, '🌱 Atrapado', '#7bd88f'); } refresh(); },
  espinas: async u => { u.buffs.thorns = 3; popup(u, '🌵 Espinas', '#9fe870'); support(u); refresh(); await sleep(450); },
  oso: async u => { u.buffs.bear = 3; u.buffs.regen = 3; u.tmp = Math.round(S(u, 'mhp') * .5); popup(u, '🐻 +' + u.tmp, '#c9a36b'); refresh(); await sleep(500); },
  ira: async (u, ts) => { for (const t of ts) { if (t.hp <= 0) continue; const d = await strike(u, t, magic(u, t, 1.2), { fast: 1, col: '#7bd88f' }); if (d && t.hp > 0) { t.poison = 3; t.poisonBy = u; } } refresh(); },
  // ---- Enano
  martillazo: async (u, [t]) => { const d = await strike(u, t, phys(u, t, 1.6)); if (d && t.hp > 0 && Math.random() < .3 + talFx(u, 'stunUp')) { t.stun = 1; popup(t, '💫 Aturdido', '#ffe08a'); } refresh(); },
  piedra: async u => { u.buffs.stone = 3; popup(u, '🪨 DEF ↑', '#c7c2b8'); refresh(); await sleep(450); },
  cerveza: async u => { BT.used.add((BT.used.has('cerveza:' + u.id) ? 'cerveza2:' : 'cerveza:') + u.id); heal(u, S(u, 'mhp') * .35, u); u.poison = 0; u.burn = 0; u.stun = 0; delete u.buffs.curse; popup(u, '🍺', '#f2c14e'); refresh(); await sleep(500); },
  sismico: (u, ts) => allEnemiesAoE(u, ts, t => phys(u, t, 1.2)),
  // ---- Elfo
  lunar: async (u, [t]) => { const a = phys(u, t, .8), b = magic(u, t, .8); await strike(u, t, { dmg: a.dmg + b.dmg, crit: a.crit }, { col: '#cfe8ff' }); },
  canto: async u => { const sh = talFx(u, 'songHeal'); for (const h of alive(party())) { h.buffs.song = 3; popup(h, '🎵', '#9fe8b0'); if (sh) heal(h, S(h, 'mhp') * sh, u); } support(u); refresh(); await sleep(550); },
  danza: async u => { for (let i = 0, n = 3 + talFx(u, 'danceExtra'); i < n; i++) { const t = pick(alive(BT.enemies)); if (!t) break; await strike(u, t, phys(u, t, .8), { fast: 1 }); } },
  luzluna: (u, ts) => allEnemiesAoE(u, ts, t => magic(u, t, t.undead ? 2.4 : 1.2), { col: '#e6f0ff' }),
  // ---- Goblin
  punalsucio: async (u, [t]) => { const d = await strike(u, t, phys(u, t, 1)); if (d && t.hp > 0) { t.poison = 3; t.poisonBy = u; popup(t, '☠', '#c27bff'); } refresh(); },
  trampa: async u => { u.trap = 1; popup(u, '🪤 Trampa lista', '#ffe08a'); support(u); refresh(); await sleep(450); },
  bomba: (u, ts) => allEnemiesAoE(u, ts, t => { const pw = Math.max(S(u, 'atk'), S(u, 'mag')); return { dmg: Math.max(1, Math.round((pw - S(t, 'def') * defMul(t) * .3) * (.9 + Math.random() * .2) * skMul(u))), crit: false, mag: true }; }, { col: '#ff9a3d' }),
  // ---- Versión 3 · Fase 2: clases avanzadas
  escudosag: async u => { const t = alive(party()).sort((a, b) => a.hp / S(a, 'mhp') - b.hp / S(b, 'mhp'))[0]; if (!t) return; const v = Math.round(S(t, 'mhp') * .25 + S(u, 'mag') * 1.5); t.shield = Math.max(t.shield || 0, v); popup(t, '💠 +' + v, '#9fd8ff'); log(`${u.name} protege a ${t.name}`); support(u); refresh(); await sleep(550); },
  juicio: async (u, [t]) => { const k = t.undead ? 2 : 1, a = phys(u, t, 1.1 * k), b = magic(u, t, 1.1 * k); await strike(u, t, { dmg: a.dmg + b.dmg, crit: a.crit }, { col: '#fff8c4' }); },
  muroesc: async u => { for (const h of alive(party())) { h.buffs.def = Math.max(h.buffs.def || 0, 3); h.shield = Math.max(h.shield || 0, Math.round(S(h, 'mhp') * .1)); popup(h, '🛡️ DEF ↑', '#9fd8ff'); } support(u); refresh(); await sleep(600); },
  carga: async (u, [t]) => { const d = await strike(u, t, phys(u, t, 2.8)); if (d && t.hp > 0) { t.stun = Math.max(t.stun || 0, 1); popup(t, '💫 Aturdido', '#ffe08a'); } refresh(); },
  infierno: (u, ts) => allEnemiesAoE(u, ts, t => magic(u, t, 1.3), { col: '#ff6a3d', burn: 1 }),
  novasolar: async (u, [t]) => { await strike(u, t, magic(u, t, 4), { col: '#fff27a' }); },
  acelerar: async u => { for (const h of alive(party())) { h.buffs.haste = 3; popup(h, '⏩', '#bff0ff'); } support(u); refresh(); await sleep(550); },
  detener: async (u, [t]) => { t.stun = Math.max(t.stun || 0, t.boss ? 1 : 2); popup(t, '⏳ Detenido', '#bff0ff'); support(u); refresh(); await sleep(550); },
  marca: async (u, [t]) => { t.buffs.mark = 3; popup(t, '🎯 Marcado', '#ff9a3d'); support(u); refresh(); await sleep(450); },
  tormenta: async u => { for (let i = 0; i < 5; i++) { const t = pick(alive(BT.enemies)); if (!t) break; await strike(u, t, phys(u, t, .9), { fast: 1 }); } },
  perforante: async (u, [t]) => { await strike(u, t, phys(u, t, 1.8, { pierce: 1 }), { sure: 1 }); },
  tiromortal: async (u, [t]) => { await strike(u, t, phys(u, t, 2.3, { crit: true }), { sure: 1 }); },
  sombra: async u => { u.buffs.evade = 2; u.nextCrit = 1; popup(u, '👤 Sombra', '#b9b2c4'); refresh(); await sleep(450); },
  milcortes: async u => { for (let i = 0; i < 8; i++) { const t = pick(alive(BT.enemies)); if (!t) break; await strike(u, t, phys(u, t, .6), { fast: 1 }); } },
  saqueo: async (u, [t]) => {
    await strike(u, t, phys(u, t, 1.4));
    if (u.hp > 0 && !t.sacked) { t.sacked = 1; const g = Math.round((4 + t.g * (.6 + Math.random())) * 2); if (u.remote) BT.extra[u.owner] = (BT.extra[u.owner] || 0) + g; else G.gold += g; popup(t, `+${g} oro`, '#f2c14e'); log(`${u.name} saquea <b>${g} de oro</b>`); support(u); }
    refresh(); await sleep(400);
  },
  golpebajo: async (u, [t]) => { const d = await strike(u, t, phys(u, t, 1.6)); if (d && t.hp > 0) { t.stun = Math.max(t.stun || 0, 1); popup(t, '💫 Aturdido', '#ffe08a'); } refresh(); },
  resmasiva: async u => { const dead = party().filter(h => h.hp <= 0); for (const h of dead) { h.hp = Math.round(S(h, 'mhp') * .3); popup(h, '¡Revive!', '#46c37b'); } if (dead.length) support(u); log(dead.length ? `${u.name} revive a ${dead.length} aliado(s)` : 'No había caídos'); refresh(); await sleep(650); },
  santuario: async u => { for (const h of alive(party())) { h.buffs.regen = Math.max(h.buffs.regen || 0, 3); popup(h, '💚', '#46c37b'); } support(u); refresh(); await sleep(550); },
  profecia: async u => { for (const h of alive(party())) { h.ward = 1; popup(h, '✨', '#fff8c4'); } support(u); refresh(); await sleep(550); },
  juiciodiv: (u, ts) => allEnemiesAoE(u, ts, t => magic(u, t, t.undead ? 2.6 : 1.3), { col: '#fff8c4' }),
  frenesi: async u => { u.buffs.frenzy = 3; popup(u, '💢 Frenesí', '#ff7a5c'); refresh(); await sleep(450); },
  rabia: async u => { u.buffs.bloodrage = 3; popup(u, '🩸 Rabia', '#ff4d4d'); refresh(); await sleep(450); },
  atronador: async (u, ts) => { for (const t of ts) { if (t.hp <= 0) continue; const d = await strike(u, t, phys(u, t, .6), { fast: 1 }); if (d && t.hp > 0 && Math.random() < .3) { t.stun = Math.max(t.stun || 0, 1); popup(t, '💫', '#ffe08a'); } } refresh(); },
  estandarte: async u => { for (const h of alive(party())) { h.buffs.atk = Math.max(h.buffs.atk || 0, 4); popup(h, '🚩 ATQ ↑', '#f2c14e'); } support(u); refresh(); await sleep(600); },
  ejercito: async u => { BT.summons = BT.summons.filter(x => x.owner !== u); for (let i = 0; i < 2; i++) BT.summons.push({ owner: u, turns: 3 + talFx(u, 'summonT') }); popup(u, '💀💀 ¡Ejército!', '#e8e2d0'); support(u); refresh(); await sleep(550); },
  cadaver: async u => { BT.corpse = { owner: u, n: 3 }; popup(u, '💥 Cadáveres', '#c27bff'); support(u); refresh(); await sleep(450); },
  pacto: async u => { const c = Math.max(1, Math.round(S(u, 'mhp') * .2)), mm = S(u, 'mmp'), g = Math.max(0, Math.min(mm - u.mp, Math.round(mm * .4))); u.hp = Math.max(1, u.hp - c); u.mp += g; popup(u, `🩸 -${c} PV · +${g} PM`, '#c27bff'); refresh(); await sleep(500); },
  agonia: async (u, [t]) => { t.agony = { n: 3, base: Math.max(1, Math.round(S(u, 'mag') * .8 * skMul(u))), by: u }; popup(t, '💜 Agonía', '#c27bff'); support(u); refresh(); await sleep(450); },
  osomayor: async u => { u.buffs.bear = 5; u.buffs.regen = 5; u.tmp = Math.round(S(u, 'mhp') * .7); popup(u, '🐻 +' + u.tmp, '#c9a36b'); refresh(); await sleep(500); },
  terremoto: async (u, ts) => { for (const t of ts) { if (t.hp <= 0) continue; const d = await strike(u, t, phys(u, t, 1.2), { fast: 1 }); if (d && t.hp > 0 && Math.random() < .3) { t.stun = Math.max(t.stun || 0, 1); popup(t, '💫', '#ffe08a'); } } refresh(); },
  cadena: async (u, [t]) => { const hit = new Set(); let cur = t; for (const m of [1.7, 1.3, 1]) { if (!cur || cur.hp <= 0) cur = alive(BT.enemies).find(e => !hit.has(e)); if (!cur) break; hit.add(cur); await strike(u, cur, magic(u, cur, m), { fast: 1, col: '#fff27a' }); cur = alive(BT.enemies).find(e => !hit.has(e)); } },
  lluviasan: async (u, ts) => { for (const t of ts) { heal(t, S(u, 'mag') * 1.3 + 10, u); t.buffs.regen = Math.max(t.buffs.regen || 0, 2); } refresh(); await sleep(600); },
  montana: async (u, [t]) => { const d = await strike(u, t, phys(u, t, 3)); if (d && t.hp > 0) { t.stun = Math.max(t.stun || 0, 1); popup(t, '💫 Aturdido', '#ffe08a'); } refresh(); },
  avalancha: (u, ts) => allEnemiesAoE(u, ts, t => phys(u, t, 1.5)),
  runafuego: async u => { for (const h of alive(party())) { h.buffs.firerune = 3; popup(h, '🪔', '#ff9a3d'); } support(u); refresh(); await sleep(550); },
  runapiedra: async u => { for (const h of alive(party())) { const v = Math.round(S(h, 'mhp') * .2); h.shield = Math.max(h.shield || 0, v); popup(h, '💠 +' + v, '#9fd8ff'); } support(u); refresh(); await sleep(600); },
  torbelfico: async u => { for (let i = 0; i < 6; i++) { const t = pick(alive(BT.enemies)); if (!t) break; await strike(u, t, phys(u, t, .8), { fast: 1 }); } },
  pasosombrio: async u => { u.buffs.evade = 2; popup(u, '👤 Paso Sombrío', '#b9b2c4'); refresh(); await sleep(450); },
  estrella: async (u, [t]) => { await strike(u, t, magic(u, t, 3), { col: '#fff27a' }); },
  velo: async u => { for (const h of alive(party())) { h.buffs.veil = 3; popup(h, '🌙', '#cfe8ff'); } support(u); refresh(); await sleep(550); },
  granbomba: (u, ts) => allEnemiesAoE(u, ts, t => { const pw = Math.max(S(u, 'atk'), S(u, 'mag')); return { dmg: Math.max(1, Math.round((pw * 2 - S(t, 'def') * defMul(t) * .3) * (.9 + Math.random() * .2) * skMul(u))), crit: false, mag: true }; }, { col: '#ff9a3d', burn: 1 }),
  mina: async u => { BT.mine = { by: u }; popup(u, '💣 Mina lista', '#ffe08a'); support(u); refresh(); await sleep(450); },
  soborno: async (u, [t]) => {
    if (t.boss) { popup(t, 'No acepta sobornos', '#ccc'); await sleep(600); return; }
    const cost = bribeCost(t);
    if (u.remote || G.gold < cost) { popup(t, u.remote ? 'Solo en tu combate' : `Necesitas ${cost} oro`, '#ccc'); await sleep(650); return; }
    G.gold -= cost; credit(u, t.hp + t.mhp * .25); popup(t, `💰 -${cost} · ¡Se va!`, '#f2c14e'); log(`${u.name} soborna a ${t.name} con ${cost} de oro`); kill(t); refresh(); await sleep(650);
  },
  monedas: (u, ts) => allEnemiesAoE(u, ts, t => ({ dmg: Math.max(1, Math.round((S(u, 'atk') * .6 + Math.sqrt(Math.max(0, u.remote ? (u.gold || 0) : G.gold)) * 1.2 - S(t, 'def') * defMul(t) * .3) * (.9 + Math.random() * .2) * skMul(u))), crit: false }), { col: '#f2c14e' }),
  suerte: async (u, [t]) => { const m = talFx(u, 'luckyMin') ? 1.5 + Math.random() * 2.5 : .5 + Math.random() * 3.5; popup(u, '🍀 ×' + m.toFixed(1), '#9fe870'); await strike(u, t, phys(u, t, m)); },
};
// BT.sk: habilidad en curso (para los talentos que mejoran una habilidad concreta)
export async function runSkill(k, u, ts) { const prev = BT ? BT.sk : null; if (BT) BT.sk = k; try { await RUN[k](u, ts); } finally { if (BT) BT.sk = prev; } }
export const bribeCost = t => Math.round(10 + (t.g || 0) * 3);

// ================= Enemigos y fórmulas =================
// Fase B: el escalado por nivel subió levemente (ATQ/DEF/MAG 13%→15% y PV 30%→35% por nivel)
// para compensar el equipo; a nivel 1 no cambia nada y a nivel 10 los enemigos son ~6-10% más duros.
function mkEnemy(key, lvl) {
  const b = EN[key], k = lvl - 1, f = (1 + .15 * k) * (b.boss ? .95 : 1.1), hm = b.boss ? .9 : 1.1;
  const e = { id: 'e' + (eid++), isHero: false, key, name: b.n, e: b.e, tint: b.tint || '', lvl, boss: !!b.boss, mhp: Math.round(b.hp * hm * (1 + .35 * k)),
    atk: b.atk * f, def: b.def * f * .85, mag: (b.mag || 2) * f, spd: b.spd * (1 + .05 * k), xp: Math.round(b.xp * (1 + .25 * k)), g: Math.round(b.g * (1 + .2 * k)),
    sk: b.sk || [], magic: !!b.magic, undead: !!b.undead, buffs: {}, poison: 0, hp: 0 };
  e.hp = e.mhp; return e;
}
const uel = u => document.getElementById('u-' + u.id);
function log(m) { $('#b-log').innerHTML = m; if (BT && BT.coop) { BT.lastLog = m; coopSync(); } }
// Estado que ven los invitados (se manda como mucho ~14 veces por segundo, y al instante al cambiar de turno)
function coopSnapshot() {
  return { id: BT.coop.id, bg: BT.m.biome, log: BT.lastLog || '', turn: BT.turn,
    // def/cu/ud: para que el invitado calcule los estimados de daño (Fase 0.5)
    enemies: BT.enemies.map(e => ({ id: e.id, e: e.e, name: e.name, lvl: e.lvl, boss: e.boss, tint: e.tint, hp: e.hp, mhp: e.mhp, tags: tags(e), def: Math.round(S(e, 'def') * defMul(e) * 10) / 10, cu: e.buffs.curse > 0, ud: !!e.undead })),
    party: party().map(h => ({ id: h.id, owner: h.owner || BT.coop.me, e: h.e, name: h.name, cls: h.cls, lvl: h.lvl, hp: h.hp, mhp: S(h, 'mhp'), mp: h.mp, mmp: S(h, 'mmp'), tmp: (h.tmp || 0) + (h.shield || 0), tags: tags(h), bear: h.buffs.bear > 0, poison: h.poison || 0, buffs: Object.assign({}, h.buffs) })),
    pops: BT.pops.splice(0) };
}
function coopSync(now) {
  if (!BT || !BT.coop) return;
  if (now) { clearTimeout(BT.syncT); BT.syncT = null; BT.coop.send(coopSnapshot()); return; }
  if (!BT.syncT) BT.syncT = setTimeout(() => { if (BT && BT.coop) { BT.syncT = null; BT.coop.send(coopSnapshot()); } }, 70);
}
// Reloj de turno (combates en equipo): 30 s; si se acaba, el héroe se defiende
function startClock(h) {
  BT.timedOut = false; clearTimeout(BT.clock); clearInterval(BT.clockI);
  BT.turn = { id: h.id, owner: h.owner || BT.coop.me, name: h.name, e: h.e, left: TURN_MS, seq: ++BT.turnSeq };
  const until = Date.now() + TURN_MS, show = () => { const el = $('#b-clock'); if (el) el.textContent = `⏳ ${Math.max(0, Math.ceil((until - Date.now()) / 1000))} s · Turno de ${h.e} ${h.name} (${BT.turn ? BT.turn.owner : ''})`; };
  show(); BT.clockI = setInterval(show, 500); $('#b-clock').classList.remove('hidden');
  if (!h.remote) BT.clock = setTimeout(() => { BT.timedOut = true; const r = BT.curRes; BT.curRes = null; if (r) r('__to'); }, TURN_MS);
  coopSync(true);
}
function stopClock() { if (!BT) return; clearTimeout(BT.clock); clearInterval(BT.clockI); BT.turn = null; BT.curRes = null; const el = $('#b-clock'); if (el) el.classList.add('hidden'); }
async function autoDefend(h, why) { h.defending = true; log(`${h.name} ${why || 'no alcanzó a elegir'}: se defiende`); popup(h, 'Defensa', '#9fd8ff'); refresh(); await sleep(450); }
function popup(u, txt, col) { if (BT && BT.coop) BT.pops.push({ id: u.id, txt: String(txt), col: col || '#fff' }); const el = uel(u); if (!el) return; const s = document.createElement('div'); s.className = 'pop'; s.textContent = txt; s.style.color = col || '#fff'; el.appendChild(s); setTimeout(() => s.remove(), 1050); }
function anim(u, cls) { const el = uel(u); if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 450); }
const critOf = u => (u.isHero ? CL[u.cls].crit + (eqSum(u, 'crit') + talFx(u, 'crit')) / 100 : .05) + (u.buffs.song > 0 ? .1 : 0);
const critMulOf = u => (heroFx(u, 'umbra') ? 2.5 : 1.75) + talFx(u, 'critDmg');
// Talentos que mejoran la habilidad que se está usando (+%)
const skMul = u => (u && u.isHero && BT && BT.sk ? 1 + talSk(u, 'skB', BT.sk) : 1);
// Estados que cambian el ataque / la defensa
// Mejoras activas + talentos (Furia Salvaje en forma de oso, Ira Creciente con poca vida)
const atkMul = u => atkMulB(u.buffs) * (u.isHero && u.buffs.bear > 0 && talFx(u, 'bearP') ? (1.5 + talFx(u, 'bearP')) / 1.5 : 1) * (u.isHero && talFx(u, 'lowHpAtk') && u.hp < S(u, 'mhp') * .5 ? 1 + talFx(u, 'lowHpAtk') : 1);
const defMul = u => defMulB(u.buffs);
// Datos para los estimados de los botones (estimate.js)
const attacker = h => ({ atk: S(h, 'atk') * atkMul(h), atkRaw: S(h, 'atk'), mag: S(h, 'mag'), hp: h.hp, mhp: S(h, 'mhp'), critMul: critMulOf(h), boost: k => talSk(h, 'skB', k), burnSk: k => talSk(h, 'skBurn', k), gold: h.remote ? (h.gold || 0) : G.gold,
  heal: talFx(h, 'healP'), steal: talFx(h, 'stealP'), lucky: talFx(h, 'luckyMin'), dance: talFx(h, 'danceExtra'), beer2: talFx(h, 'beer2') });
const tgtOf = e => ({ def: S(e, 'def') * defMul(e), hp: e.hp, mhp: S(e, 'mhp'), curse: e.buffs.curse > 0, curseM: 1.3 + (e.curseP || 0), mark: e.buffs.mark > 0, undead: !!e.undead, boss: !!e.boss, g: e.g || 0 });
const hvOf = h => ({ hp: h.hp, mhp: S(h, 'mhp'), mp: h.mp, mmp: S(h, 'mmp'), poison: h.poison || 0 });
const spdMul = u => u.buffs.song > 0 ? 1.3 : 1;
function phys(a, d, m, o = {}) {
  const atk = S(a, 'atk') * atkMul(a), def = o.pierce ? 0 : S(d, 'def') * defMul(d);   // pierce: ignora la DEF
  let v = Math.max(1, (atk * m - def * .5) * (.9 + Math.random() * .2)) * skMul(a);
  const forced = a.nextCrit > 0; if (forced) a.nextCrit = 0;   // Sombra: el siguiente golpe es crítico
  const crit = !!o.crit || forced || Math.random() < (o.critC != null ? o.critC : critOf(a)); if (crit) v *= critMulOf(a);
  return { dmg: Math.round(v), crit };
}
// Costo de una habilidad (la Túnica del Sabio Errante lo baja 25%)
export const skillCost = (h, k) => heroFx(h, 'sabio') ? Math.ceil(SK[k].mp * .75) : SK[k].mp;
// Un personaje llega a 0 PV: el Amuleto del Fénix lo levanta una vez por combate
function fall(u) {
  if (u.isHero && BT && heroFx(u, 'fenix') && !BT.fenix.has(u.id)) {
    BT.fenix.add(u.id); u.hp = Math.max(1, Math.round(S(u, 'mhp') * .3)); popup(u, '🔥 ¡Fénix!', '#ff9a3d'); return;
  }
  if (u.isHero && BT && talFx(u, 'lastStand') && !BT.fenix.has('ls:' + u.id)) { BT.fenix.add('ls:' + u.id); u.hp = 1; popup(u, '💪 ¡Resiste!', '#ffd34d'); return; }
  kill(u);
  if (!u.isHero && BT && BT.corpse && BT.corpse.n > 0 && !BT.exploding) corpseBlast();
}
// Explosión de Cadáver: al morir un enemigo, daño mágico a los demás (sin cadena)
function corpseBlast() {
  const o = BT.corpse.owner; if (!o || o.hp <= 0) return;
  BT.exploding = true;
  for (const e of alive(BT.enemies)) { const d = Math.max(1, Math.round(S(o, 'mag') * .9 - S(e, 'def') * defMul(e) * .2)), b = e.hp; e.hp = Math.max(0, e.hp - d); hurtEnemy(o, e, b); popup(e, '💥' + d, '#c27bff'); anim(e, 'hit'); if (e.hp <= 0) fall(e); }
  BT.exploding = false;
}
// Resistencia al veneno del equipo (0..80%)
const resists = u => u.isHero && Math.random() * 100 < eqSum(u, 'pres');
function magic(a, d, m) { const def = S(d, 'def') * defMul(d); return { dmg: Math.max(1, Math.round((S(a, 'mag') * m - def * .2) * (.9 + Math.random() * .2) * skMul(a))), crit: false, mag: true }; }
async function strike(a, d, r, o = {}) {
  if (d.hp <= 0) return 0;
  // Trampa del Goblin: el enemigo que lo ataca recibe daño y queda aturdido
  if (d.trap && !a.isHero && a.hp > 0) {
    d.trap = 0; const td = phys(d, a, 1.2).dmg, b0 = a.hp; a.hp = Math.max(0, a.hp - td); hurtEnemy(d, a, b0); a.stun = 1;
    popup(a, '🪤 ' + td, '#ffe08a'); anim(a, 'hit'); if (a.hp <= 0) { fall(a); refresh(); await sleep(400); return 0; }
  }
  if (!r.mag && !o.sure && Math.random() < .05) { popup(d, '¡Falla!', '#ccc'); await sleep(o.fast ? 200 : 400); return 0; }
  // Esquivar todo (Sombra, Paso Sombrío)
  if (d.buffs.evade > 0) { popup(d, '👤 ¡Esquiva!', '#cfe8ff'); await sleep(o.fast ? 220 : 400); return 0; }
  // Esquivar golpes físicos: Agilidad Élfica 15%, Velo Lunar +30% y talentos (máx. 75%)
  if (!r.mag && d.isHero) { const ev = (d.cls === 'elfo' ? 15 : 0) + (d.buffs.veil > 0 ? 30 : 0) + talFx(d, 'dodge'); if (ev > 0 && Math.random() * 100 < Math.min(75, ev)) { popup(d, '💨 ¡Esquiva!', '#cfe8ff'); await sleep(o.fast ? 220 : 400); return 0; } }
  // Égida del Alba: 15% de bloquear el golpe completo
  if (d.isHero && heroFx(d, 'egida') && Math.random() < .15) { popup(d, '🛡️ ¡Bloqueo!', '#ffe08a'); await sleep(o.fast ? 220 : 450); return 0; }
  // Profecía: anula el próximo golpe
  if (d.ward) { d.ward = 0; popup(d, '✨ ¡Anulado!', '#fff8c4'); refresh(); await sleep(o.fast ? 220 : 450); return 0; }
  let dmg = r.dmg; if (d.defending) dmg = Math.ceil(dmg / 2);
  if (d.buffs.curse > 0) dmg = Math.round(dmg * (1.3 + (d.curseP || 0)));   // Maldición: +30% de daño recibido (+50% con talento)
  if (d.buffs.mark > 0) dmg = Math.round(dmg * 1.4);                        // Marca de Caza: +40%
  if (a.isHero && !d.isHero && d.hp < d.mhp * .5 && talFx(a, 'execP')) dmg = Math.round(dmg * (1 + talFx(a, 'execP')));   // Ejecutor
  if (d.shield > 0) { const ab = Math.min(d.shield, dmg); d.shield -= ab; dmg -= ab; }   // Escudo 💠
  if (d.tmp > 0) { const ab = Math.min(d.tmp, dmg); d.tmp -= ab; dmg -= ab; } // PV temporales (Forma de Oso)
  const before = d.hp; d.hp = Math.max(0, d.hp - dmg); hurtEnemy(a, d, before);
  // Espinas: devuelve 30% del daño recibido al atacante
  if (d.buffs.thorns > 0 && !a.isHero && a.hp > 0 && dmg > 0) {
    const rd = Math.max(1, Math.round(dmg * (.3 + talFx(d, 'thornsP')))), b1 = a.hp; a.hp = Math.max(0, a.hp - rd); hurtEnemy(d, a, b1); popup(a, '🌵' + rd, '#9fe870'); if (a.hp <= 0) fall(a);
  }
  popup(d, (r.crit ? '¡CRÍTICO! ' : '') + dmg, r.crit ? '#ffd34d' : (o.col || (d.isHero ? '#ff6b6b' : '#ffffff')));
  // Robo de vida del equipo
  const ls = a.isHero ? eqSum(a, 'ls') + talFx(a, 'ls') + (a.buffs.bloodrage > 0 ? 30 : 0) : 0;   // equipo + talentos + Rabia Sangrienta
  if (ls > 0 && a.hp > 0 && !d.isHero) { const mx = S(a, 'mhp'), g = Math.min(mx - a.hp, Math.round((before - d.hp) * ls / 100)); if (g > 0) { a.hp += g; popup(a, '+' + g, '#46c37b'); } }
  // Colmillo de Brasa: los golpes físicos queman
  // Quemadura: Colmillo de Brasa y Runa de Fuego (golpes físicos) y talentos de habilidad (Bola de Fuego)
  if (!d.isHero && d.hp > 0 && a.isHero && ((!r.mag && (heroFx(a, 'brasa') || a.buffs.firerune > 0)) || (BT && BT.sk && talSk(a, 'skBurn', BT.sk)))) { d.burn = 3; d.burnBy = a; }
  anim(d, 'hit'); if (d.hp <= 0) fall(d); refresh();
  await sleep(o.fast ? 220 : 450); return dmg;
}
function kill(u) { u.hp = 0; u.poison = 0; u.burn = 0; u.stun = 0; u.tmp = 0; u.trap = 0; u.buffs = {}; if (BT) BT.summons = BT.summons.filter(s => s.owner !== u); if (!u.isHero) { const el = uel(u); if (el) el.classList.add('dead'); } }
function heal(u, amt, by) { if (by && by.isHero) amt *= 1 + talFx(by, 'healP'); const mx = S(u, 'mhp'), b = u.hp; u.hp = Math.min(mx, u.hp + Math.round(amt)); credit(by, u.hp - b); popup(u, '+' + (u.hp - b), '#46c37b'); refresh(); return u.hp - b; }
export function useItem(k, t) { G.items[k]--; itemEffect(k, t); }
function itemEffect(k, t) {
  if (k === 'pocion') { heal(t, S(t, 'mhp') * .5); t.poison = 0; }
  else if (k === 'eter') { const mm = S(t, 'mmp'), b = t.mp; t.mp = Math.min(mm, t.mp + Math.round(mm * .5)); popup(t, '+' + (t.mp - b) + ' PM', '#6fb1ff'); }
  else if (k === 'pluma') { t.hp = Math.round(S(t, 'mhp') * .5); popup(t, '¡Revive!', '#46c37b'); }
  refresh();
}
// Íconos de estado en las tarjetas de combate
const tags = u => (u.poison > 0 ? '☠️' : '') + (u.burn > 0 ? '🔥' : '') + (u.stun > 0 ? '💫' : '') + (u.buffs.curse > 0 ? '🔮' : '')
  + (u.buffs.atk > 0 ? '⚔️' : '') + (u.buffs.fury > 0 ? '😡' : '') + (u.buffs.def > 0 ? '🛡️' : '') + (u.buffs.stone > 0 ? '🪨' : '')
  + (u.buffs.thorns > 0 ? '🌵' : '') + (u.buffs.bear > 0 ? '🐻' : '') + (u.buffs.regen > 0 ? '💚' : '') + (u.buffs.song > 0 ? '🎵' : '')
  + (u.trap ? '🪤' : '') + (BT && BT.summons.some(s => s.owner === u) ? '💀' : '') + (u.defending ? '🔰' : '')
  + (u.shield > 0 ? '💠' : '') + (u.ward ? '✨' : '') + (u.buffs.mark > 0 ? '🎯' : '') + (u.buffs.haste > 0 ? '⏩' : '') + (u.buffs.frenzy > 0 ? '💢' : '') + (u.buffs.bloodrage > 0 ? '🩸' : '')
  + (u.buffs.veil > 0 ? '🌙' : '') + (u.buffs.evade > 0 ? '👤' : '') + (u.agony && u.agony.n > 0 ? '💜' : '') + (u.buffs.firerune > 0 ? '🪔' : '') + (u.nextCrit ? '⚡' : '');

// ================= Pantalla de combate =================
function buildBattle(biome) {
  $('#battle').style.background = BG[biome] || BG.GRASS;
  $('#b-field').innerHTML = BT.enemies.map(e => `<div class="enemy ${e.boss ? 'boss' : ''}" id="u-${e.id}"><span class="sp emoji" style="filter:${e.tint} drop-shadow(0 8px 6px #0007)">${e.e}</span><div class="en">${e.boss ? '👑 ' : ''}${e.name} <span class="lv">Nv ${e.lvl}</span></div>${ebarHTML()}<div class="etags"></div></div>`).join('');
  // Los héroes de otros jugadores traen nombre desde la red: siempre escapado
  $('#b-party').innerHTML = party().map(h => `<div class="hcard" id="u-${h.id}"><div class="tags"></div><div class="top"><span class="em emoji">${esc(h.e)}</span><div style="min-width:0"><div class="nm">${esc(h.name)}</div><div class="sub">Nv <span class="lvn">${h.lvl}</span> · ${esc(h.owner ? h.owner : clsName(h))}</div></div></div><div class="bar hpb"><i></i></div><div class="bar mp mpb"><i></i></div><div class="nums"><span class="hpt"></span><span class="mpt"></span></div></div>`).join('');
  $('#b-menu').innerHTML = ''; bossBar(null); refresh();
}
export function refresh() {
  updateHUD(); if (!BT) return;
  for (const e of BT.enemies) { const el = uel(e); if (!el) continue; setBar(el.querySelector('.ebar'), e.hp, e.mhp); el.querySelector('.etags').textContent = tags(e); }
  const boss = BT.enemies.find(e => e.boss); if (boss) bossBar(boss);
  for (const h of party()) {
    const el = uel(h); if (!el) continue; const mh = S(h, 'mhp'), mm = S(h, 'mmp');
    el.classList.toggle('dead', h.hp <= 0); el.classList.toggle('active', BT.active === h);
    el.querySelector('.hpb>i').style.width = (100 * h.hp / mh) + '%'; el.querySelector('.mpb>i').style.width = (100 * h.mp / mm) + '%';
    el.querySelector('.hpt').textContent = `PV ${h.hp}/${mh}` + (h.tmp > 0 ? ` +${h.tmp}` : '') + (h.shield > 0 ? ` 💠${h.shield}` : ''); el.querySelector('.mpt').textContent = `PM ${h.mp}/${mm}`;
    el.querySelector('.tags').textContent = tags(h); el.querySelector('.lvn').textContent = h.lvl;
  }
  coopSync();
}
function menu(opts) {
  if (AUTO) return Promise.resolve(AUTO(opts, BT));
  return new Promise(res => {
    if (BT && BT.coop) BT.curRes = res;
    const m = $('#b-menu'); m.innerHTML = '';
    opts.forEach((o, i) => {
      // o.l: nombre · o.s: línea chica (costo y estimado) · o.n: nota chica (crítico) · o.h: tarjeta completa (héroes)
      const b = document.createElement('button'); b.className = 'btn' + (o.full ? ' full' : '') + (o.cls ? ' ' + o.cls : '');
      b.innerHTML = o.h ? `<span class="mut kn">${i + 1}</span>${o.h}` : `<span class="mut kn">${i + 1}</span> ${o.l}` + (o.s ? `<small>${o.s}</small>` : '') + (o.n ? `<small class="bnote2">${o.n}</small>` : '');
      if (o.dis) b.disabled = true; b.onclick = () => res(o.v); m.appendChild(b);
    });
  });
}
// ctx (opcional): estimado de la acción → texto de cada botón de objetivo (Fase 0.5)
function pickTarget(kind, ctx) {
  return new Promise(res => {
    const cands = kind === 'enemy' ? alive(BT.enemies) : kind === 'ally' ? alive(party()) : kind === 'dead' ? party().filter(h => h.hp <= 0) : [];
    if (!cands.length) { res(null); return; }
    if (cands.length === 1 && kind === 'enemy') { res(cands[0]); return; }
    const cleanup = () => cands.forEach(c => { const el = uel(c); if (el) { el.classList.remove('target'); el.onclick = null; } });
    const done = v => { cleanup(); res(v); };
    cands.forEach(c => { const el = uel(c); if (!el) return; el.classList.add('target'); el.onclick = () => done(c); });
    log(kind === 'enemy' ? 'Elige un enemigo' : kind === 'dead' ? 'Elige a quién revivir' : 'Elige un aliado');
    const sub = c => kind === 'enemy' ? (ctx && ctx.enemy ? ctx.enemy(tgtOf(c)) : `PV ${c.hp}/${S(c, 'mhp')}`)
      : kind === 'dead' ? (ctx && ctx.revive ? ctx.revive(hvOf(c)) : `PV 0/${S(c, 'mhp')}`)
      : (ctx && ctx.ally ? ctx.ally(hvOf(c)) : `PV ${c.hp}/${S(c, 'mhp')}`);
    menu([...cands.map(c => ({ v: c, l: `${esc(c.e)} ${esc(c.name)}`, s: sub(c) })), { v: null, l: '↩ Cancelar', full: 1 }]).then(done);
  });
}
async function targetsFor(t, ctx) { if (t === 'none') return []; if (t === 'enemies') return alive(BT.enemies); if (t === 'allies') return alive(party()); const x = await pickTarget(t, ctx); return x ? [x] : null; }
// Objetos (Fase 0.4): tarjetas con PV/PM y vista previa; el que más lo necesita, resaltado
function pickItemTarget(k) {
  return new Promise(res => {
    const rows = itemTargets(k, party().map(h => ({ h, e: esc(h.e), name: esc(h.name), sub: esc(h.owner ? h.owner : clsName(h)) + ' · Nv ' + h.lvl, H: hvOf(h) })));
    const ok = rows.filter(r => !r.dis);
    if (!ok.length) { log(k === 'pluma' ? 'No hay héroes caídos' : 'Nadie lo necesita ahora'); res(null); return; }
    const cleanup = () => ok.forEach(r => { const el = uel(r.x.h); if (el) { el.classList.remove('target'); el.onclick = null; } });
    const done = v => { cleanup(); res(v); };
    ok.forEach(r => { const el = uel(r.x.h); if (!el) return; el.classList.add('target'); el.onclick = () => done(r.x.h); });
    log(`¿En quién usas ${IT[k].e} ${IT[k].n}?`);
    menu([...rows.map(r => ({ v: r.x.h, h: heroCardHTML(r.x, r.prev, r.dis, r.best), dis: !!r.dis, cls: 'hpk' + (r.best ? ' best' : '') })), { v: null, l: '↩ Cancelar', full: 1 }]).then(done);
  });
}
// Estimado de una acción del héroe contra los enemigos vivos
const estFor = (h, k) => estimate(k, attacker(h), alive(BT.enemies).map(tgtOf));
const skillSub = (h, k) => { const e = estFor(h, k); return `${skillCost(h, k)} PM · ${e.line || SK[k].d}`; };
// Anillo del Eco: 20% de repetir la habilidad gratis
async function echo(h, k, sk, ts) {
  if (heroFx(h, 'eco') && h.hp > 0 && sk.t !== 'dead' && alive(BT.enemies).length && Math.random() < .2) {
    let ts2 = ts;
    if (sk.t === 'enemies') ts2 = alive(BT.enemies);
    else if (sk.t === 'allies') ts2 = alive(party());
    else if (sk.t === 'enemy' && ts[0].hp <= 0) ts2 = alive(BT.enemies).slice(0, 1);
    else if (sk.t === 'ally' && ts[0].hp <= 0) ts2 = [];
    if (ts2.length || sk.t === 'none') { popup(h, '🔁 ¡Eco!', '#ffd34d'); log(`¡Eco! ${h.name} repite <b>${sk.n}</b>`); await sleep(300); await runSkill(k, h, ts2); }
  }
}
// Turno de un héroe de otro jugador (jefes en equipo): se espera su acción hasta 30 s
async function remoteTurn(h) {
  BT.active = h; startClock(h); refresh();
  log(`Turno de <b>${h.e} ${h.name}</b> · ${h.owner}`);
  const a = BT.coop.gone.has(h.owner) ? null : await BT.coop.waitAction(h.id, TURN_MS);
  stopClock();
  if (!a) return autoDefend(h, BT.coop.gone.has(h.owner) ? 'se desconectó' : 'no alcanzó a elegir');
  const en = id => BT.enemies.find(e => e.id === id && e.hp > 0) || alive(BT.enemies)[0];
  const al = id => party().find(x => x.id === id && x.hp > 0), dd = id => party().find(x => x.id === id && x.hp <= 0);
  if (a.kind === 'atk') {
    const t = en(a.target); if (!t) return autoDefend(h);
    log(`${h.name} ataca a ${t.name}`); anim(h, 'act'); await strike(h, t, phys(h, t, 1));
    if (t.hp > 0 && heroFx(h, 'viento') && Math.random() < .25) { popup(h, '🌬️ ¡Flecha extra!', '#bff0ff'); await strike(h, t, phys(h, t, .6), { fast: 1 }); }
    await frenzyHit(h, t);
    return;
  }
  if (a.kind === 'skill' && SK[a.key]) {
    const k = a.key, sk = SK[k];
    if (!learned(h).includes(k) || h.mp < skillCost(h, k) || h.buffs.bear > 0 || (k === 'cerveza' && beerOut(h))) return autoDefend(h, 'no pudo usar la habilidad');
    const ts = sk.t === 'none' ? [] : sk.t === 'enemies' ? alive(BT.enemies) : sk.t === 'allies' ? alive(party()) : sk.t === 'enemy' ? [en(a.target)] : sk.t === 'ally' ? [al(a.target)] : [dd(a.target)];
    if (ts.some(x => !x)) return autoDefend(h, 'eligió un objetivo que ya no sirve');
    payMP(h, k); log(`${h.name} usa <b>${sk.n}</b>`); anim(h, 'act'); refresh(); await sleep(300); await runSkill(k, h, ts); await echo(h, k, sk, ts);
    return;
  }
  if (a.kind === 'item' && IT[a.key]) {
    const t = IT[a.key].t === 'dead' ? dd(a.target) : al(a.target); if (!t) return autoDefend(h);
    log(`${h.name} usa ${IT[a.key].e} ${IT[a.key].n} en ${t.name}`); itemEffect(a.key, t); await sleep(600); return;
  }
  h.defending = true; log(`${h.name} se pone en guardia`); popup(h, 'Defensa', '#9fd8ff'); refresh(); await sleep(450);
}
// Frenesí: un segundo ataque
async function frenzyHit(h, t) { if (h.buffs.frenzy > 0 && h.hp > 0 && alive(BT.enemies).length) { const t2 = t && t.hp > 0 ? t : pick(alive(BT.enemies)); popup(h, '💢', '#ff7a5c'); await strike(h, t2, phys(h, t2, 1), { fast: 1 }); } }
// Pagar PM (talento: % de no gastarlos)
function payMP(h, k) { const c = skillCost(h, k); h.mp -= c; const sv = talFx(h, 'mpSave'); if (sv && c > 0 && Math.random() < sv) { h.mp += c; popup(h, '✨ PM gratis', '#6fb1ff'); } }
async function heroTurn(h) {
  if (h.remote) return remoteTurn(h);
  BT.active = h;
  if (BT.coop) startClock(h);
  // Báculo de las Mareas: +3 PM al empezar el turno
  if (heroFx(h, 'mareas')) { const mm = S(h, 'mmp'), g = Math.min(3, mm - h.mp); if (g > 0) { h.mp += g; popup(h, '+' + g + ' PM', '#6fb1ff'); } }
  refresh();
  while (true) {
    log(`Turno de <b>${h.e} ${h.name}</b>`);
    const bear = h.buffs.bear > 0;   // Forma de Oso: solo ataques físicos
    const ea = estFor(h, 'atk');
    const c = await menu([{ v: 'atk', l: bear ? '🐻 Zarpazo' : '⚔️ Atacar', s: ea.line, n: ea.note }, { v: 'skill', l: bear ? '✨ Habilidades (oso)' : '✨ Habilidades', dis: bear }, { v: 'item', l: '🎒 Objetos' }, { v: 'def', l: '🛡️ Defender', s: 'Recibe la mitad de daño' }, { v: 'run', l: '🏃 Huir', full: 1 }]);
    if (BT.timedOut) return autoDefend(h);
    if (c === 'atk') {
      const t = await pickTarget('enemy', estFor(h, 'atk')); if (BT.timedOut) return autoDefend(h); if (!t) continue; log(`${h.name} ataca a ${t.name}`); anim(h, 'act'); await strike(h, t, phys(h, t, 1));
      // Arco del Viento Norte: 25% de flecha extra
      if (t.hp > 0 && heroFx(h, 'viento') && Math.random() < .25) { popup(h, '🌬️ ¡Flecha extra!', '#bff0ff'); await strike(h, t, phys(h, t, .6), { fast: 1 }); }
      await frenzyHit(h, t);
      return;
    }
    if (c === 'skill') {
      const once = k => k === 'cerveza' && beerOut(h);
      const list = learned(h).map(k => ({ v: k, l: SK[k].n, s: once(k) ? 'Ya usada en este combate' : skillSub(h, k), n: once(k) ? '' : estFor(h, k).note, dis: h.mp < skillCost(h, k) || once(k) })); list.push({ v: null, l: '↩ Volver', full: 1 });
      const k = await menu(list); if (BT.timedOut) return autoDefend(h); if (!k) continue; const sk = SK[k]; const ts = await targetsFor(sk.t, estFor(h, k)); if (BT.timedOut) return autoDefend(h); if (ts === null) continue;
      payMP(h, k); log(`${h.name} usa <b>${sk.n}</b>`); anim(h, 'act'); refresh(); await sleep(300); await runSkill(k, h, ts);
      await echo(h, k, sk, ts);
      return;
    }
    if (c === 'item') {
      const list = Object.keys(IT).map(k => ({ v: k, l: `${IT[k].e} ${IT[k].n} ×${G.items[k] || 0}`, s: IT[k].d, dis: !G.items[k] })); list.push({ v: null, l: '↩ Volver', full: 1 });
      const k = await menu(list); if (BT.timedOut) return autoDefend(h); if (!k) continue;
      const t = AUTO ? (await targetsFor(IT[k].t) || [])[0] : await pickItemTarget(k); if (BT.timedOut) return autoDefend(h); if (!t) continue;
      log(`${h.name} usa ${IT[k].e} ${IT[k].n} en ${esc(t.name)}`); useItem(k, t); await sleep(600); return;
    }
    if (c === 'def') { h.defending = true; log(`${h.name} se pone en guardia`); popup(h, 'Defensa', '#9fd8ff'); refresh(); await sleep(450); return; }
    if (c === 'run') {
      if (BT.enemies.some(e => e.boss)) { log('¡No puedes huir de un jefe!'); await sleep(800); continue; }
      if (partyHas('goblin')) { log('🏃 ¡El goblin encontró una salida!'); await sleep(700); return 'fled'; }   // pasiva del Goblin
      const ps = alive(party()).reduce((a, u) => a + S(u, 'spd'), 0) / alive(party()).length, es = alive(BT.enemies).reduce((a, u) => a + u.spd, 0) / alive(BT.enemies).length;
      if (Math.random() < clamp(.5 + (ps - es) * .03, .25, .9)) { log('🏃 ¡Escaparon!'); await sleep(700); return 'fled'; }
      log('¡No pudieron escapar!'); await sleep(700); return;
    }
  }
}
async function enemyTurn(e) {
  if (BT.mine && BT.mine.by.hp > 0) { const mn = BT.mine; BT.mine = null; log(`💥 ¡La mina de ${mn.by.name} explota bajo ${e.name}!`); await strike(mn.by, e, phys(mn.by, e, 2), { sure: 1, col: '#ff9a3d' }); if (e.hp <= 0) return; }
  const ts = alive(party()); if (!ts.length) return;
  anim(e, 'lunge'); await sleep(220);
  const t = pick(ts); const s = e.sk.length && Math.random() < .35 ? pick(e.sk) : null;
  if (!s) { log(`${e.name} ataca a ${t.name}`); await strike(e, t, e.magic ? magic(e, t, 1) : phys(e, t, 1)); return; }
  if (s === 'brutal') { log(`${e.name} usa <b>Golpe Brutal</b> contra ${t.name}`); await strike(e, t, phys(e, t, 1.6)); }
  else if (s === 'veneno') { log(`${e.name} usa <b>Mordida Venenosa</b>`); const d = await strike(e, t, phys(e, t, .8)); if (d && t.hp > 0 && Math.random() < .65) { if (resists(t)) popup(t, 'Resiste el veneno', '#9fe8b0'); else { t.poison = 3; popup(t, '☠ Veneno', '#c27bff'); } refresh(); } }
  else if (s === 'drenar') { log(`${e.name} <b>drena la vida</b> de ${t.name}`); const d = await strike(e, t, magic(e, t, 1.1), { col: '#c27bff' }); if (d) { const hh = Math.round(d / 2); e.hp = Math.min(e.mhp, e.hp + hh); popup(e, '+' + hh, '#46c37b'); refresh(); } }
  else if (s === 'fuego') { log(`${e.name} lanza <b>Aliento de Fuego</b>`); for (const h of ts) await strike(e, h, magic(e, h, .85), { fast: 1, col: '#ff9a3d' }); }
}
const outcome = () => !alive(BT.enemies).length ? 'win' : !alive(party()).length ? 'lose' : null;
async function runBattle() {
  while (true) {
    const order = [...alive(party()), ...alive(BT.enemies)].map(u => ({ u, i: S(u, 'spd') * spdMul(u) * (.75 + Math.random() * .5), h: u.buffs.haste > 0 ? 1 : 0 })).sort((a, b) => b.h - a.h || b.i - a.i).map(o => o.u);
    for (const u of order) {
      const end = outcome(); if (end) return end;
      if (u.hp <= 0) continue;
      if (u.poison > 0) {
        const d = Math.max(1, Math.round(S(u, 'mhp') * .07 * (1 + (u.poisonBy && u.poisonBy.isHero ? talFx(u.poisonBy, 'poisonP') : 0)))), before = u.hp; u.hp = Math.max(0, u.hp - d); u.poison--; hurtEnemy(u.poisonBy, u, before); popup(u, d, '#c27bff'); log(`${u.name} sufre por el veneno`);
        if (u.hp <= 0) fall(u); refresh(); await sleep(500); if (u.hp <= 0) continue;
      }
      if (u.burn > 0) {   // quemadura (Colmillo de Brasa)
        const d = Math.max(1, Math.round(S(u, 'mhp') * .06)), before = u.hp; u.hp = Math.max(0, u.hp - d); u.burn--; hurtEnemy(u.burnBy, u, before); popup(u, '🔥' + d, '#ff9a3d'); log(`${u.name} se quema`);
        if (u.hp <= 0) fall(u); refresh(); await sleep(450); if (u.hp <= 0) continue;
      }
      // Agonía: daño creciente (×1, ×1.5, ×2)
      if (u.agony && u.agony.n > 0) {
        const ag = u.agony, d = Math.max(1, Math.round(ag.base * (1 + .5 * (3 - ag.n)))), before = u.hp; u.hp = Math.max(0, u.hp - d); ag.n--; hurtEnemy(ag.by, u, before); popup(u, '💜' + d, '#c27bff'); log(`${u.name} sufre la agonía`);
        if (u.hp <= 0) fall(u); refresh(); await sleep(450); if (u.hp <= 0) continue;
      }
      u.defending = false;
      // Talentos al empezar el turno: regeneración y PM
      if (u.isHero) {
        const rg = talFx(u, 'regen'); if (rg) { const g = Math.min(S(u, 'mhp') - u.hp, Math.max(1, Math.round(S(u, 'mhp') * rg))); if (g > 0) { u.hp += g; popup(u, '💚+' + g, '#46c37b'); } }
        const mr = talFx(u, 'mpRegen'); if (mr) { const g = Math.min(S(u, 'mmp') - u.mp, mr); if (g > 0) u.mp += g; }
      }
      if (u.buffs.regen > 0) { const g = Math.min(S(u, 'mhp') - u.hp, Math.max(1, Math.round(S(u, 'mhp') * .06))); if (g > 0) { u.hp += g; popup(u, '💚+' + g, '#46c37b'); } }
      let r;
      if (u.stun > 0) { u.stun--; popup(u, '💫 Aturdido', '#ffe08a'); log(`${u.name} está aturdido y pierde el turno`); refresh(); await sleep(500); }
      else r = u.isHero ? await heroTurn(u) : await enemyTurn(u);
      if (BT.coop) stopClock();
      if (u.isHero) BT.acted.add(u.id);
      for (const k in u.buffs) if (u.buffs[k] > 0) u.buffs[k]--;
      if (!(u.buffs.bear > 0)) u.tmp = 0;      // se acabó la Forma de Oso
      BT.active = null; refresh();
      if (r === 'fled') return 'fled';
      await sleep(120);
    }
    if (BT.corpse && --BT.corpse.n <= 0) BT.corpse = null;
    // Al final de cada ronda atacan las invocaciones (Alzar Esqueleto)
    for (const sm of [...BT.summons]) {
      if (outcome()) break;
      const t = pick(alive(BT.enemies)); if (!t || sm.owner.hp <= 0) continue;
      log(`💀 El esqueleto de ${sm.owner.name} ataca a ${t.name}`);
      const pw = S(sm.owner, 'mag') * .9 + S(sm.owner, 'atk') * .4;
      await strike(sm.owner, t, { dmg: Math.max(1, Math.round((pw - S(t, 'def') * defMul(t) * .4) * (.9 + Math.random() * .2))), crit: false, mag: true }, { col: '#e8e2d0' });
      if (--sm.turns <= 0) BT.summons = BT.summons.filter(x => x !== sm);
    }
  }
}
function waitButton(label) { if (AUTO) return Promise.resolve(); return new Promise(res => { const m = $('#b-menu'); const b = document.createElement('button'); b.className = 'btn gold full'; b.innerHTML = `<span class="kn">1</span> ${label}`; b.onclick = () => res(); m.appendChild(b); }); }

// opts.party: participantes (por defecto el grupo propio) · opts.coop: datos del jefe en equipo (coop.js)
// opts.bossMul: multiplica la vida del jefe (1 + 0.7 × (jugadores − 1))
// opts.dmgMul: ajusta el daño de los enemigos (jefes en equipo, ver coop.js)
export async function startBattle(m, opts = {}) {
  if (st.busy) return; st.busy = true; held.clear();
  const ens = m.group.map((k, i) => mkEnemy(k, Math.max(1, m.boss && i > 0 ? m.lvl - 2 : m.lvl)));
  if (opts.bossMul && ens[0] && ens[0].boss) { ens[0].mhp = Math.round(ens[0].mhp * opts.bossMul); ens[0].hp = ens[0].mhp; }
  if (opts.dmgMul) for (const e of ens) { e.atk *= opts.dmgMul; e.mag *= opts.dmgMul; }
  const supp = Math.round(.15 * ens.reduce((a, e) => a + e.mhp, 0) / ens.length);
  BT = { m, enemies: ens, active: null, pts: {}, acted: new Set(), supp, fenix: new Set(), summons: [], used: new Set(),
    party: opts.party || heroes(), coop: opts.coop || null, pops: [], extra: {}, turnSeq: 0, turn: null };
  // Talentos: escudo al empezar (Bastión, Barrera, Barba de Hierro)
  for (const h of BT.party) { h.shield = 0; h.ward = 0; h.nextCrit = 0; const ss = talFx(h, 'startShield'); if (ss && h.hp > 0) h.shield = Math.round(S(h, 'mhp') * ss); }
  buildBattle(m.biome); $('#battle').classList.remove('hidden'); document.body.classList.add('inbattle');
  log(m.boss ? `⚠️ ¡Un jefe se alza: <b>${ens[0].name}</b>!${BT.coop ? ' · ¡En equipo!' : ''}` : `¡Aparecen ${ens.map(e => e.e + ' ' + e.name).join(', ')}!`);
  coopSync(true);
  await sleep(1000);
  const res = await runBattle();
  for (const h of G.roster) { h.buffs = {}; h.defending = false; h.stun = 0; h.tmp = 0; h.trap = 0; h.shield = 0; h.ward = 0; h.nextCrit = 0; h.agony = null; }
  if (BT.coop) await coopFinish(res);
  else if (res === 'win') await victory();
  else if (res === 'lose') await defeat();
  else m.stun = 5;
  stopClock(); bossBar(null); $('#battle').classList.add('hidden'); document.body.classList.remove('inbattle'); BT = null; st.busy = false; held.clear(); updateHUD(); save('now');
}
async function victory() {
  const m = BT.m; const xp = BT.enemies.reduce((a, e) => a + e.xp, 0);
  const loot = partyHas('goblin') ? 1.3 : 1;   // pasiva del Goblin: +30% de botín
  const gold = Math.round(BT.enemies.reduce((a, e) => a + e.g, 0) * (.8 + Math.random() * .4) * (partyHas('enano') ? 1.25 : 1) * (1 + Math.min(.5, heroes().reduce((a, h) => a + talFx(h, 'goldP'), 0))));   // pasiva del Enano: +25% de oro · talentos de oro
  G.gold += gold; const lines = [`🏆 <b>¡Victoria!</b> +${xp} XP · +${gold} de oro`];
  // Experiencia según participación; los que esperan en la taberna reciben el 10%
  const team = heroes(), before = team.map(h => h.lvl), shares = splitXP(team, xp), lvMsgs = [];
  team.forEach((h, i) => lvMsgs.push(...gainXP(h, shares[i])));
  for (let i = 0; i < G.roster.length; i++) if (!G.party.includes(i)) gainXP(G.roster[i], xp * .1);
  lines.push(`<div class="xpl">${team.map((h, i) => `<div class="xpr"><span class="emoji">${h.e}</span><span class="xpn">${h.name}${h.hp <= 0 ? ' 💀' : ''}</span><span class="bar xp"><i style="width:${xp ? Math.round(100 * shares[i] / xp) : 0}%"></i></span><b class="goldt">+${shares[i]} XP</b></div>`).join('')}</div>`);
  lines.push(...lvMsgs);
  if (m.boss) { G.items.pluma++; G.items.eter++; G.bosses = (G.bosses || 0) + 1; lines.push('🎁 Botín del jefe: 🪶 Pluma Fénix y 🔷 Éter'); }
  else if (Math.random() < .25 * loot) { const k = Math.random() < .8 ? 'pocion' : 'eter'; G.items[k]++; lines.push(`🎁 Encontraste: ${IT[k].e} ${IT[k].n}`); }
  // Equipo: 15% en combates normales; los jefes siempre sueltan uno (mínimo Raro)
  if (m.boss || Math.random() < .15 * loot) {
    const luck = m.luck != null ? m.luck : Math.min(1, Math.hypot(m.x - START.x, m.y - START.y) / 400);
    const it = rollLoot(m.lvl, luck, m.boss ? 'raro' : 'comun');
    lines.push(addItem(it) ? `🎁 Equipo: ${itemLabel(it)} <small style="color:${RAR[it.r].c}">${RAR[it.r].n} · Nv ${it.ilvl}</small>`
      : `<span class="mut">🎒 Inventario lleno (40): dejaste ${itemLabel(it)}</span>`);
  }
  if (team.some(h => h.hp <= 0)) lines.push('<span class="mut">Los héroes caídos siguen caídos: revívelos en una posada o con una Pluma Fénix.</span>');
  if (!m.sea && !m.dun) { monsters.delete(m.id); mpos.delete(m.x + ',' + m.y); G.defeated[m.id] = G.steps; }  // los del mar y de mazmorra no se registran
  if (m.onWin) lines.push(...(m.onWin() || []));   // mazmorras: el monstruo cae y, si era el jefe, se completa
  // Misiones: cacerías y jefes
  lines.push(...onVictory(BT.enemies, m));
  // Avisos para los demás jugadores de la sala
  const ups = heroes().filter((h, i) => h.lvl > before[i]).map(h => `${h.name} Nv ${h.lvl}`);
  if (ups.length) notice('level', ups.join(', '));
  if (m.boss) notice('boss', BT.enemies[0].name);
  log(lines[0]); $('#b-menu').innerHTML = `<div class="res">${lines.join('<br>')}</div>`;
  await waitButton('Continuar');
}
// Fin de un jefe en equipo (anfitrión): manda el resultado a los invitados y aplica el propio.
// Ganar: cada jugador recibe la experiencia completa y su propio botín; si su héroe cayó, revive con 25%.
// Perder: cada jugador despierta en Ciudad Origen con la regla de la tumba 🪦.
async function coopFinish(res) {
  const m = BT.m, xp = BT.enemies.reduce((a, e) => a + e.xp, 0), gold = Math.round(BT.enemies.reduce((a, e) => a + e.g, 0) * (.8 + Math.random() * .4));
  const win = res === 'win';
  BT.coop.end({ id: BT.coop.id, result: win ? 'win' : 'lose', xp, gold, extra: BT.extra,
    boss: { id: m.id, lvl: m.lvl, name: BT.enemies[0].name, keys: BT.enemies.map(e => e.key), x: m.x, y: m.y },
    heroes: party().filter(h => h.remote).map(h => ({ owner: h.owner, hp: h.hp, mp: h.mp, poison: h.poison || 0 })) });
  if (!win) { await defeat(); return; }
  const lines = [`🏆 <b>¡Victoria en equipo!</b> +${xp} XP · +${gold} de oro`];
  for (const h of party().filter(x => !x.remote)) {
    if (h.hp <= 0) { h.hp = Math.max(1, Math.round(S(h, 'mhp') * .25)); lines.push(`💚 ${h.name} se levanta con 25% de vida`); }
    const before = h.lvl; lines.push(...gainXP(h, xp)); if (h.lvl > before) notice('level', `${h.name} Nv ${h.lvl}`);
  }
  G.gold += gold; G.items.pluma++; G.items.eter++; G.bosses = (G.bosses || 0) + 1; lines.push('🎁 Botín del jefe: 🪶 Pluma Fénix y 🔷 Éter');
  const it = rollLoot(m.lvl, m.luck != null ? m.luck : Math.min(1, Math.hypot(m.x - START.x, m.y - START.y) / 400), 'raro');
  lines.push(addItem(it) ? `🎁 Equipo: ${itemLabel(it)} <small style="color:${RAR[it.r].c}">${RAR[it.r].n} · Nv ${it.ilvl}</small>` : `<span class="mut">🎒 Inventario lleno: dejaste ${itemLabel(it)}</span>`);
  if (!m.dun) { monsters.delete(m.id); mpos.delete(m.x + ',' + m.y); G.defeated[m.id] = G.steps; }
  if (m.onWin) lines.push(...(m.onWin() || []));
  lines.push(...onVictory(BT.enemies, m));
  notice('boss', BT.enemies[0].name);
  log(lines[0]); $('#b-menu').innerHTML = `<div class="res">${lines.join('<br>')}</div>`;
  await waitButton('Continuar');
}
// Todo el grupo cayó (Versión 2): despiertan en Ciudad Origen con todos revividos; se conservan niveles,
// experiencia, oro y mejoras; los objetos (pociones, inventario y equipo puesto) quedan en una tumba 🪦 por 60 minutos.
async function defeat() {
  const old = !!G.tomb;
  log('💀 Tu grupo ha caído…');
  $('#b-menu').innerHTML = `<div class="res">💀 <b>Tu grupo ha caído…</b> Tus objetos quedaron donde caíste. Despertarás en <b>Ciudad Origen</b>.<br>
    <span class="mut">Conservas niveles, experiencia, oro y mejoras. Tienes <b>60 minutos</b> para volver a la tumba 🪦 y recuperar tus objetos y tu equipo.</span>
    ${old ? '<br><span style="color:#ff8a8a">⚠️ Tu tumba anterior y sus objetos se pierden.</span>' : ''}</div>`;
  await waitButton('Despertar');
  // En una mazmorra, la tumba queda en la entrada (afuera) y se sale de la mazmorra
  const spot = BT.m.onLose ? BT.m.onLose() : { x: P.x, y: P.y };
  const t = createTomb(spot.x, spot.y);
  for (const h of G.roster) { h.hp = S(h, 'mhp'); h.mp = S(h, 'mmp'); h.poison = 0; h.burn = 0; h.stun = 0; h.tmp = 0; h.trap = 0; h.buffs = {}; h.defending = false; }
  BT.m.stun = 8;   // el monstruo queda donde estaba (con vida llena) y no persigue por unos pasos
  P.x = P.px = START.x; P.y = P.py = START.y; spawnNearby(); visitAround();
  save('now');
  notice('death', 'Ciudad Origen');
  setTimeout(() => toast(`🏰 Ciudad Origen<br><span style="font-size:14px">${t.created ? 'Tus objetos te esperan en la tumba 🪦 (60 min)' : 'Tu grupo despertó a salvo'}</span>`), 400);
}
