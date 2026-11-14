// Combate por turnos. En la Etapa 1 cada jugador pelea sus propios combates (todo local).
// ETAPA 2 (no implementado): aquí se enchufará el combate cooperativo contra jefes.
//   - Al tocar un jefe: net 'boss:invite' para que los amigos cercanos se unan.
//   - 'battle:join' agregaría los héroes del amigo a BT y 'battle:action' sincronizaría
//     cada turno; el servidor sería la autoridad del orden de turnos y del azar.
'use strict';
import { $, sleep, clamp, pick } from './util.js';
import { CL, SK, IT, EN, BG } from './data.js';
import { G, P, START, held, st, S, heroes, alive, learned, gainXP, resetProgress } from './state.js';
import { monsters, mpos, spawnNearby, visitAround } from './world.js';
import { updateHUD, toast } from './ui.js';
import { save } from './storage.js';
import { notice } from './net.js';

let BT = null, eid = 0;
export const getBT = () => BT;

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
const allEnemiesAoE = async (u, ts, fn, o) => { for (const t of ts) if (t.hp > 0) await strike(u, t, fn(t), Object.assign({ fast: 1 }, o)); };
const RUN = {
  golpe: async (u, [t]) => { await strike(u, t, phys(u, t, 1.8)); },
  grito: async u => { for (const h of alive(heroes())) { h.buffs.atk = 3; popup(h, 'ATQ ↑', '#f2c14e'); } support(u); refresh(); await sleep(600); },
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
    if (Math.random() < .65) {
      t.stolen = 1; support(u);
      if (Math.random() < .65) { const g = Math.round(4 + t.g * (.6 + Math.random())); G.gold += g; popup(t, `+${g} oro`, '#f2c14e'); log(`${u.name} roba <b>${g} de oro</b>`); }
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
  bendicion: async u => { for (const h of alive(heroes())) { h.buffs.def = 3; popup(h, 'DEF ↑', '#9fd8ff'); } support(u); refresh(); await sleep(600); },
};
export async function runSkill(k, u, ts) { await RUN[k](u, ts); }

// ================= Enemigos y fórmulas =================
function mkEnemy(key, lvl) {
  const b = EN[key], k = lvl - 1, f = (1 + .13 * k) * (b.boss ? .95 : 1.1), hm = b.boss ? .9 : 1.1;
  const e = { id: 'e' + (eid++), isHero: false, key, name: b.n, e: b.e, tint: b.tint || '', lvl, boss: !!b.boss, mhp: Math.round(b.hp * hm * (1 + .3 * k)),
    atk: b.atk * f, def: b.def * f * .85, mag: (b.mag || 2) * f, spd: b.spd * (1 + .05 * k), xp: Math.round(b.xp * (1 + .25 * k)), g: Math.round(b.g * (1 + .2 * k)),
    sk: b.sk || [], magic: !!b.magic, undead: !!b.undead, buffs: {}, poison: 0, hp: 0 };
  e.hp = e.mhp; return e;
}
const uel = u => document.getElementById('u-' + u.id);
function log(m) { $('#b-log').innerHTML = m; }
function popup(u, txt, col) { const el = uel(u); if (!el) return; const s = document.createElement('div'); s.className = 'pop'; s.textContent = txt; s.style.color = col || '#fff'; el.appendChild(s); setTimeout(() => s.remove(), 1050); }
function anim(u, cls) { const el = uel(u); if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 450); }
const critOf = u => u.isHero ? CL[u.cls].crit : .05;
function phys(a, d, m, o = {}) {
  const atk = S(a, 'atk') * (a.buffs.atk > 0 ? 1.35 : 1), def = S(d, 'def') * (d.buffs.def > 0 ? 1.35 : 1);
  let v = Math.max(1, (atk * m - def * .5) * (.9 + Math.random() * .2));
  const crit = !!o.crit || Math.random() < (o.critC != null ? o.critC : critOf(a)); if (crit) v *= 1.75;
  return { dmg: Math.round(v), crit };
}
function magic(a, d, m) { const def = S(d, 'def') * (d.buffs.def > 0 ? 1.35 : 1); return { dmg: Math.max(1, Math.round((S(a, 'mag') * m - def * .2) * (.9 + Math.random() * .2))), crit: false, mag: true }; }
async function strike(a, d, r, o = {}) {
  if (d.hp <= 0) return 0;
  if (!r.mag && !o.sure && Math.random() < .05) { popup(d, '¡Falla!', '#ccc'); await sleep(o.fast ? 200 : 400); return 0; }
  let dmg = r.dmg; if (d.defending) dmg = Math.ceil(dmg / 2);
  const before = d.hp; d.hp = Math.max(0, d.hp - dmg); hurtEnemy(a, d, before);
  popup(d, (r.crit ? '¡CRÍTICO! ' : '') + dmg, r.crit ? '#ffd34d' : (o.col || (d.isHero ? '#ff6b6b' : '#ffffff')));
  anim(d, 'hit'); if (d.hp <= 0) kill(d); refresh();
  await sleep(o.fast ? 220 : 450); return dmg;
}
function kill(u) { u.hp = 0; u.poison = 0; u.buffs = {}; if (!u.isHero) { const el = uel(u); if (el) el.classList.add('dead'); } }
function heal(u, amt, by) { const mx = S(u, 'mhp'), b = u.hp; u.hp = Math.min(mx, u.hp + Math.round(amt)); credit(by, u.hp - b); popup(u, '+' + (u.hp - b), '#46c37b'); refresh(); return u.hp - b; }
export function useItem(k, t) {
  G.items[k]--;
  if (k === 'pocion') { heal(t, S(t, 'mhp') * .5); t.poison = 0; }
  else if (k === 'eter') { const mm = S(t, 'mmp'), b = t.mp; t.mp = Math.min(mm, t.mp + Math.round(mm * .5)); popup(t, '+' + (t.mp - b) + ' PM', '#6fb1ff'); }
  else if (k === 'pluma') { t.hp = Math.round(S(t, 'mhp') * .5); popup(t, '¡Revive!', '#46c37b'); }
  refresh();
}
const tags = u => (u.poison > 0 ? '☠️' : '') + (u.buffs.atk > 0 ? '⚔️' : '') + (u.buffs.def > 0 ? '🛡️' : '') + (u.defending ? '🔰' : '');

// ================= Pantalla de combate =================
function buildBattle(biome) {
  $('#battle').style.background = BG[biome] || BG.GRASS;
  $('#b-field').innerHTML = BT.enemies.map(e => `<div class="enemy ${e.boss ? 'boss' : ''}" id="u-${e.id}"><span class="sp emoji" style="filter:${e.tint} drop-shadow(0 8px 6px #0007)">${e.e}</span><div class="en">${e.boss ? '👑 ' : ''}${e.name} <span class="lv">Nv ${e.lvl}</span></div><div class="bar"><i></i></div><div class="etags"></div></div>`).join('');
  $('#b-party').innerHTML = heroes().map(h => `<div class="hcard" id="u-${h.id}"><div class="tags"></div><div class="top"><span class="em emoji">${h.e}</span><div style="min-width:0"><div class="nm">${h.name}</div><div class="sub">Nv <span class="lvn">${h.lvl}</span> · ${CL[h.cls].n}</div></div></div><div class="bar hpb"><i></i></div><div class="bar mp mpb"><i></i></div><div class="nums"><span class="hpt"></span><span class="mpt"></span></div></div>`).join('');
  $('#b-menu').innerHTML = ''; refresh();
}
export function refresh() {
  updateHUD(); if (!BT) return;
  for (const e of BT.enemies) { const el = uel(e); if (!el) continue; el.querySelector('.bar>i').style.width = (100 * e.hp / e.mhp) + '%'; el.querySelector('.etags').textContent = tags(e); }
  for (const h of heroes()) {
    const el = uel(h); if (!el) continue; const mh = S(h, 'mhp'), mm = S(h, 'mmp');
    el.classList.toggle('dead', h.hp <= 0); el.classList.toggle('active', BT.active === h);
    el.querySelector('.hpb>i').style.width = (100 * h.hp / mh) + '%'; el.querySelector('.mpb>i').style.width = (100 * h.mp / mm) + '%';
    el.querySelector('.hpt').textContent = `PV ${h.hp}/${mh}`; el.querySelector('.mpt').textContent = `PM ${h.mp}/${mm}`;
    el.querySelector('.tags').textContent = tags(h); el.querySelector('.lvn').textContent = h.lvl;
  }
}
function menu(opts) {
  return new Promise(res => {
    const m = $('#b-menu'); m.innerHTML = '';
    opts.forEach((o, i) => {
      const b = document.createElement('button'); b.className = 'btn' + (o.full ? ' full' : '');
      b.innerHTML = `<span class="mut kn">${i + 1}</span> ${o.l}` + (o.s ? `<small>${o.s}</small>` : '');
      if (o.dis) b.disabled = true; b.onclick = () => res(o.v); m.appendChild(b);
    });
  });
}
function pickTarget(kind) {
  return new Promise(res => {
    const cands = kind === 'enemy' ? alive(BT.enemies) : kind === 'ally' ? alive(heroes()) : kind === 'dead' ? heroes().filter(h => h.hp <= 0) : [];
    if (!cands.length) { res(null); return; }
    if (cands.length === 1 && kind === 'enemy') { res(cands[0]); return; }
    const cleanup = () => cands.forEach(c => { const el = uel(c); if (el) { el.classList.remove('target'); el.onclick = null; } });
    const done = v => { cleanup(); res(v); };
    cands.forEach(c => { const el = uel(c); if (!el) return; el.classList.add('target'); el.onclick = () => done(c); });
    log(kind === 'enemy' ? 'Elige un enemigo' : kind === 'dead' ? 'Elige a quién revivir' : 'Elige un aliado');
    menu([...cands.map(c => ({ v: c, l: `${c.e} ${c.name}`, s: `PV ${c.hp}/${S(c, 'mhp')}` })), { v: null, l: '↩ Cancelar', full: 1 }]).then(done);
  });
}
async function targetsFor(t) { if (t === 'none') return []; if (t === 'enemies') return alive(BT.enemies); if (t === 'allies') return alive(heroes()); const x = await pickTarget(t); return x ? [x] : null; }
async function heroTurn(h) {
  BT.active = h; refresh();
  while (true) {
    log(`Turno de <b>${h.e} ${h.name}</b>`);
    const c = await menu([{ v: 'atk', l: '⚔️ Atacar' }, { v: 'skill', l: '✨ Habilidades' }, { v: 'item', l: '🎒 Objetos' }, { v: 'def', l: '🛡️ Defender' }, { v: 'run', l: '🏃 Huir', full: 1 }]);
    if (c === 'atk') { const t = await pickTarget('enemy'); if (!t) continue; log(`${h.name} ataca a ${t.name}`); anim(h, 'act'); await strike(h, t, phys(h, t, 1)); return; }
    if (c === 'skill') {
      const list = learned(h).map(k => ({ v: k, l: SK[k].n, s: `${SK[k].mp} PM · ${SK[k].d}`, dis: h.mp < SK[k].mp })); list.push({ v: null, l: '↩ Volver', full: 1 });
      const k = await menu(list); if (!k) continue; const sk = SK[k]; const ts = await targetsFor(sk.t); if (ts === null) continue;
      h.mp -= sk.mp; log(`${h.name} usa <b>${sk.n}</b>`); anim(h, 'act'); refresh(); await sleep(300); await runSkill(k, h, ts); return;
    }
    if (c === 'item') {
      const list = Object.keys(IT).map(k => ({ v: k, l: `${IT[k].e} ${IT[k].n} ×${G.items[k] || 0}`, s: IT[k].d, dis: !G.items[k] })); list.push({ v: null, l: '↩ Volver', full: 1 });
      const k = await menu(list); if (!k) continue; const ts = await targetsFor(IT[k].t); if (!ts) continue;
      log(`${h.name} usa ${IT[k].e} ${IT[k].n} en ${ts[0].name}`); useItem(k, ts[0]); await sleep(600); return;
    }
    if (c === 'def') { h.defending = true; log(`${h.name} se pone en guardia`); popup(h, 'Defensa', '#9fd8ff'); refresh(); await sleep(450); return; }
    if (c === 'run') {
      if (BT.enemies.some(e => e.boss)) { log('¡No puedes huir de un jefe!'); await sleep(800); continue; }
      const ps = alive(heroes()).reduce((a, u) => a + S(u, 'spd'), 0) / alive(heroes()).length, es = alive(BT.enemies).reduce((a, u) => a + u.spd, 0) / alive(BT.enemies).length;
      if (Math.random() < clamp(.5 + (ps - es) * .03, .25, .9)) { log('🏃 ¡Escaparon!'); await sleep(700); return 'fled'; }
      log('¡No pudieron escapar!'); await sleep(700); return;
    }
  }
}
async function enemyTurn(e) {
  const ts = alive(heroes()); if (!ts.length) return;
  anim(e, 'lunge'); await sleep(220);
  const t = pick(ts); const s = e.sk.length && Math.random() < .35 ? pick(e.sk) : null;
  if (!s) { log(`${e.name} ataca a ${t.name}`); await strike(e, t, e.magic ? magic(e, t, 1) : phys(e, t, 1)); return; }
  if (s === 'brutal') { log(`${e.name} usa <b>Golpe Brutal</b> contra ${t.name}`); await strike(e, t, phys(e, t, 1.6)); }
  else if (s === 'veneno') { log(`${e.name} usa <b>Mordida Venenosa</b>`); const d = await strike(e, t, phys(e, t, .8)); if (d && t.hp > 0 && Math.random() < .65) { t.poison = 3; popup(t, '☠ Veneno', '#c27bff'); refresh(); } }
  else if (s === 'drenar') { log(`${e.name} <b>drena la vida</b> de ${t.name}`); const d = await strike(e, t, magic(e, t, 1.1), { col: '#c27bff' }); if (d) { const hh = Math.round(d / 2); e.hp = Math.min(e.mhp, e.hp + hh); popup(e, '+' + hh, '#46c37b'); refresh(); } }
  else if (s === 'fuego') { log(`${e.name} lanza <b>Aliento de Fuego</b>`); for (const h of ts) await strike(e, h, magic(e, h, .85), { fast: 1, col: '#ff9a3d' }); }
}
const outcome = () => !alive(BT.enemies).length ? 'win' : !alive(heroes()).length ? 'lose' : null;
async function runBattle() {
  while (true) {
    const order = [...alive(heroes()), ...alive(BT.enemies)].map(u => ({ u, i: S(u, 'spd') * (.75 + Math.random() * .5) })).sort((a, b) => b.i - a.i).map(o => o.u);
    for (const u of order) {
      const end = outcome(); if (end) return end;
      if (u.hp <= 0) continue;
      if (u.poison > 0) {
        const d = Math.max(1, Math.round(S(u, 'mhp') * .07)), before = u.hp; u.hp = Math.max(0, u.hp - d); u.poison--; hurtEnemy(u.poisonBy, u, before); popup(u, d, '#c27bff'); log(`${u.name} sufre por el veneno`);
        if (u.hp <= 0) kill(u); refresh(); await sleep(500); if (u.hp <= 0) continue;
      }
      u.defending = false;
      const r = u.isHero ? await heroTurn(u) : await enemyTurn(u);
      if (u.isHero) BT.acted.add(u.id);
      for (const k in u.buffs) if (u.buffs[k] > 0) u.buffs[k]--;
      BT.active = null; refresh();
      if (r === 'fled') return 'fled';
      await sleep(120);
    }
  }
}
function waitButton(label) { return new Promise(res => { const m = $('#b-menu'); const b = document.createElement('button'); b.className = 'btn gold full'; b.innerHTML = `<span class="kn">1</span> ${label}`; b.onclick = () => res(); m.appendChild(b); }); }

export async function startBattle(m) {
  if (st.busy) return; st.busy = true; held.clear();
  const ens = m.group.map((k, i) => mkEnemy(k, Math.max(1, m.boss && i > 0 ? m.lvl - 2 : m.lvl)));
  const supp = Math.round(.15 * ens.reduce((a, e) => a + e.mhp, 0) / ens.length);
  BT = { m, enemies: ens, active: null, pts: {}, acted: new Set(), supp };
  buildBattle(m.biome); $('#battle').classList.remove('hidden'); document.body.classList.add('inbattle');
  log(m.boss ? `⚠️ ¡Un jefe se alza: <b>${ens[0].name}</b>!` : `¡Aparecen ${ens.map(e => e.e + ' ' + e.name).join(', ')}!`);
  await sleep(1000);
  const res = await runBattle();
  for (const h of G.roster) { h.buffs = {}; h.defending = false; }
  if (res === 'win') await victory();
  else if (res === 'lose') await defeat();
  else m.stun = 5;
  $('#battle').classList.add('hidden'); document.body.classList.remove('inbattle'); BT = null; st.busy = false; held.clear(); updateHUD(); save();
}
async function victory() {
  const m = BT.m; const xp = BT.enemies.reduce((a, e) => a + e.xp, 0); const gold = Math.round(BT.enemies.reduce((a, e) => a + e.g, 0) * (.8 + Math.random() * .4));
  G.gold += gold; const lines = [`🏆 <b>¡Victoria!</b> +${xp} XP · +${gold} de oro`];
  // Experiencia según participación; los que esperan en la taberna reciben el 10%
  const party = heroes(), before = party.map(h => h.lvl), shares = splitXP(party, xp), lvMsgs = [];
  party.forEach((h, i) => lvMsgs.push(...gainXP(h, shares[i])));
  for (let i = 0; i < G.roster.length; i++) if (!G.party.includes(i)) gainXP(G.roster[i], xp * .1);
  lines.push(`<div class="xpl">${party.map((h, i) => `<div class="xpr"><span class="emoji">${h.e}</span><span class="xpn">${h.name}${h.hp <= 0 ? ' 💀' : ''}</span><span class="bar xp"><i style="width:${xp ? Math.round(100 * shares[i] / xp) : 0}%"></i></span><b class="goldt">+${shares[i]} XP</b></div>`).join('')}</div>`);
  lines.push(...lvMsgs);
  if (m.boss) { G.items.pluma++; G.items.eter++; G.bosses = (G.bosses || 0) + 1; lines.push('🎁 Botín del jefe: 🪶 Pluma Fénix y 🔷 Éter'); }
  else if (Math.random() < .25) { const k = Math.random() < .8 ? 'pocion' : 'eter'; G.items[k]++; lines.push(`🎁 Encontraste: ${IT[k].e} ${IT[k].n}`); }
  if (party.some(h => h.hp <= 0)) lines.push('<span class="mut">Los héroes caídos siguen caídos: revívelos en una posada o con una Pluma Fénix.</span>');
  monsters.delete(m.id); mpos.delete(m.x + ',' + m.y); G.defeated[m.id] = G.steps;
  // Avisos para los demás jugadores de la sala
  const ups = heroes().filter((h, i) => h.lvl > before[i]).map(h => `${h.name} Nv ${h.lvl}`);
  if (ups.length) notice('level', ups.join(', '));
  if (m.boss) notice('boss', BT.enemies[0].name);
  log(lines[0]); $('#b-menu').innerHTML = `<div class="res">${lines.join('<br>')}</div>`;
  await waitButton('Continuar');
}
// Todo el grupo cayó: se empieza de cero en Villa Origen (ver resetProgress en state.js).
// ETAPA 2 fase D: en combates cooperativos esto solo aplica si el combate completo se pierde.
async function defeat() {
  log('💀 Tu grupo ha caído…');
  $('#b-menu').innerHTML = `<div class="res">💀 <b>Tu grupo ha caído…</b> Comienzas de nuevo en <b>Villa Origen</b>.<br><span class="mut">Pierdes niveles, experiencia, oro, objetos, mejoras de herrería y bonificaciones de santuarios. Conservas el mapa explorado, los cofres abiertos y los jefes derrotados.</span></div>`;
  await waitButton('Volver a empezar');
  resetProgress();
  BT.m.stun = 8; P.x = P.px = START.x; P.y = P.py = START.y; spawnNearby(); visitAround();
  save();                                   // guardar de inmediato el estado reiniciado
  notice('death', 'Villa Origen');
  setTimeout(() => toast('🏘️ Villa Origen<br><span style="font-size:14px">Tu grupo vuelve a empezar desde nivel 1</span>'), 400);
}
