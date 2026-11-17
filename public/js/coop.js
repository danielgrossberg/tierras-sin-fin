// Jefes en equipo (Versión 2 · Fase 3): 2 a 4 jugadores, 1 héroe por jugador.
// - El que encontró al jefe es el ANFITRIÓN: corre el combate con battle.js y transmite el estado.
// - Los INVITADOS ven el combate a partir de ese estado y mandan sus acciones (30 s por turno).
// - El servidor solo organiza la sesión y reenvía los mensajes (ver server.js).
'use strict';
import { $, esc } from './util.js';
import { CL, SK, IT, EN, BG, ADV, LEADER_EMOJIS } from './data.js';
import { G, P, START, st, S, heroes, learned, gainXP } from './state.js';
import { spawnNearby, visitAround, monsters, mpos } from './world.js';
import { net, coopAsk, coopSend, notice } from './net.js';
import { startBattle, getBT, skillCost } from './battle.js';
import { openModal, closeModal, isModalOpen, toast, feed, updateHUD } from './ui.js';
import { save } from './storage.js';
import { rollLoot, addItem, itemLabel, RAR } from './items.js';
import { petSnap, activePet, catBonus, petGainXP, addEgg } from './pets.js';
import { PETS } from './data.js';
import { onVictory } from './quests.js';
import { createTomb } from './tomb.js';
import { heroFx, talFx, talSk, clsName } from './state.js';
import { atkMulB, estimate, itemTargets, heroCardHTML } from './estimate.js';
import { ebarHTML, setBar, bossBar } from './hpbar.js';
import { inDungeon } from './dungeon.js';

const TURN_MS = 30000;
export const coop = { host: null, guest: null };
export const BOSS_MUL = n => 1 + .7 * (n - 1);   // vida del jefe según jugadores
// Daño de los enemigos según jugadores: el jefe está pensado contra un grupo de 3 héroes, y en equipo cada
// jugador trae solo 1; sin este ajuste, con 2 jugadores casi nunca se ganaba (ver README, simulación).
export const COOP_DMG = n => ({ 2: .55, 3: .75, 4: 1 })[n] || 1;
// Lo que el panel de jugadores muestra ("👑 vs Ogro Rey")
export function coopVs() {
  const B = getBT(); if (B && B.coop) return B.enemies[0] && B.enemies[0].name;
  return coop.guest && coop.guest.started ? coop.guest.boss.name : null;
}
export const inCoopBattle = () => !!(coop.guest && coop.guest.started);

// Héroe que se manda a la sesión (con sus mejoras de herrería)
// tal/adv: talentos y clase avanzada (Versión 3 · Fase 2) · gold: para Lluvia de Monedas
const snap = h => ({ id: h.id, cls: h.cls, name: h.name, e: h.e, lvl: h.lvl, hp: h.hp, mp: h.mp, bonus: h.bonus, equip: h.equip, poison: h.poison || 0, upA: G.upA, upD: G.upD, tal: h.tal || {}, adv: h.adv || null, gold: G.gold, pet: petSnap() });   // pet: la mascota acompaña al héroe elegido
const onlineMates = () => [...net.others.values()].filter(o => o.online !== false && o.status && o.status !== 'lobby' && o.status !== 'away');
export const canAskHelp = () => st.online && net.status === 'on' && onlineMates().length > 0;

// ================= Elegir 1 héroe (tarjetas) =================
function chooseHero(title, sub, cb) {
  const list = G.party.map(i => G.roster[i]);
  openModal(() => `<h2>${title}</h2><p class="mut" style="margin:0 0 8px">${sub}</p>
    <div class="pick">${list.map((h, i) => { const dead = h.hp <= 0, mh = S(h, 'mhp'), mm = S(h, 'mmp');
      return `<button class="pickc ${dead ? 'dead' : ''}" data-a="pick" data-k="${i}" ${dead ? 'disabled' : ''}><span class="emoji pe">${h.e}</span><b>${h.name}</b><small>${clsName(h)} · Nv ${h.lvl}</small>
        <span class="bar"><i style="width:${100 * h.hp / mh}%"></i></span><span class="bar mp"><i style="width:${100 * h.mp / mm}%"></i></span><small>${dead ? '💀 Caído' : `PV ${h.hp}/${mh} · PM ${h.mp}/${mm}`}</small></button>`; }).join('')}</div>
    <div class="row end"><button class="btn" data-a="back">Volver</button></div>`,
  (a, k) => { if (a === 'back') { closeModal(); return; } if (a === 'pick') { const h = list[+k]; if (!h || h.hp <= 0) return; closeModal(); cb(h); } });
}

// ================= Anfitrión =================
export function askHelp(m) {
  if (!canAskHelp()) { toast('No hay compañeros conectados para pedir ayuda'); return; }
  const be = EN[m.group[0]];
  chooseHero('📣 Pedir ayuda', `Contra ${be.e} <b>${be.n}</b> (Nv ${m.lvl}) cada jugador pelea con <b>1 héroe</b>. Elige el tuyo:`, async h => {
    // Jefe de mazmorra: los demás lo ven en la ENTRADA de la mazmorra (coordenadas del mundo)
    const r = await coopAsk('boss:invite', { boss: { id: m.id, name: be.n, e: be.e, lvl: m.lvl, x: m.wx != null ? m.wx : m.x, y: m.wy != null ? m.wy : m.y }, hero: snap(h) });
    if (!r.ok) { toast('No se pudo pedir ayuda'); return; }
    coop.host = { id: r.id, m, hero: h, guests: [], until: Date.now() + (r.left || 90000) };
    openHostLobby();
  });
}
let lobbyTick = null;
function hostLobbyRender() {
  const H = coop.host; if (!H) return '';
  const left = Math.max(0, Math.ceil((H.until - Date.now()) / 1000)), be = EN[H.m.group[0]];
  return `<h2>📣 Pediste ayuda</h2>
    <p class="mut" style="margin:0">${be.e} <b>${be.n}</b> (Nv ${H.m.lvl}) · tu héroe: ${H.hero.e} <b>${H.hero.name}</b></p>
    <div class="lobbyt">${lobbyTime()}</div>
    <div class="sec lobbyg">${lobbyGuests()}</div>
    <div class="cfbtns3"><button class="btn gold big" data-a="start" ${H.guests.length ? '' : 'disabled'}>⚔️ ¡Comenzar!</button><button class="btn" data-a="solo">Pelear solo (grupo completo)</button><button class="btn" data-a="retreat">🏃 Retirarse</button></div>`;
}
// Partes que cambian (se actualizan sin redibujar los botones, para no perder un toque)
function lobbyTime() { const H = coop.host, left = Math.max(0, Math.ceil((H.until - Date.now()) / 1000)); return left ? `⏳ La invitación dura <b>${left} s</b>` : '⌛ La invitación terminó'; }
function lobbyGuests() {
  const H = coop.host;
  return `<h3>Se unieron (${H.guests.length}/3)</h3>${H.guests.length ? H.guests.map(g => `<div class="prow"><span class="emoji pe">${esc(g.hero.e)}</span><div class="pi"><b>${esc(g.name)}</b><div class="mut ps">${esc(g.hero.name)} · ${CL[g.hero.cls] ? CL[g.hero.cls].n : ''} · Nv ${g.hero.lvl}</div></div></div>`).join('') : '<p class="mut small" style="margin:0">Esperando compañeros…</p>'}
    <p class="mut small" style="margin:6px 0 0">La vida del jefe sube con cada jugador (×${BOSS_MUL(1 + H.guests.length).toFixed(1)}). Si peleas solo, usas tu grupo completo.</p>`;
}
function openHostLobby() {
  openModal(hostLobbyRender, async a => {
    const H = coop.host; if (!H) { closeModal(); return; }
    if (a === 'start') {
      const r = await coopAsk('boss:start', { id: H.id });
      if (!r.ok) { toast(r.error || 'Nadie se unió'); return; }
      stopLobbyTick(); closeModal();
      const guests = r.lobby.guests;
      // Nombre y emoji llegan desde la red: el servidor ya los limpia; aquí se vuelve a quitar cualquier <>&"
      const remotes = guests.map((g, i) => Object.assign({}, g.hero, { id: 'r' + i + '_' + g.hero.id, isHero: true, remote: true, owner: g.name, name: String(g.hero.name || 'Héroe').replace(/[<>&"']/g, '').slice(0, 16), adv: ADV[g.hero.adv] && ADV[g.hero.adv].cls === g.hero.cls ? g.hero.adv : null, e: CL[g.hero.cls] && LEADER_EMOJIS.includes(g.hero.e) ? g.hero.e : (CL[g.hero.cls] ? CL[g.hero.cls].e : '🙂'), buffs: {}, xp: 0, defending: false, stun: 0, tmp: 0, trap: 0, bonus: g.hero.bonus || {}, equip: g.hero.equip || {} }));
      const ctl = { id: H.id, me: st.name, gone: new Set(), waiters: new Map(),
        send: state => coopSend('battle:state', state),
        end: res => { coopSend('battle:end', res); coop.host = null; },
        waitAction(heroId, ms) { return new Promise(res => { const t = setTimeout(() => { ctl.waiters.delete(heroId); res(null); }, ms + 1500); ctl.waiters.set(heroId, a => { clearTimeout(t); ctl.waiters.delete(heroId); res(a); }); }); } };
      coop.host.ctl = ctl;
      startBattle(H.m, { party: [H.hero, ...remotes], coop: ctl, bossMul: BOSS_MUL(1 + remotes.length), dmgMul: COOP_DMG(1 + remotes.length) });
      return;
    }
    if (a === 'solo' || a === 'retreat') {
      coopSend('boss:cancel', { id: H.id }); coop.host = null; stopLobbyTick(); closeModal();
      if (a === 'solo') startBattle(H.m);
    }
  });
  stopLobbyTick(); lobbyTick = setInterval(() => { if (coop.host && isModalOpen()) refreshModal(); else stopLobbyTick(); }, 1000);
}
const stopLobbyTick = () => { clearInterval(lobbyTick); lobbyTick = null; };
// Volver a dibujar la ventana abierta (sin cerrar ni perder el estado)
function refreshModal() {
  if (!$('#mcontent') || !isModalOpen()) return;
  if (coop.host && !coop.host.ctl) {
    const t = $('#mcontent .lobbyt'), g = $('#mcontent .lobbyg'), b = $('#mcontent [data-a=start]');
    if (t) t.innerHTML = lobbyTime(); if (g) g.innerHTML = lobbyGuests(); if (b) b.disabled = !coop.host.guests.length;
  }
}

// ================= Invitado =================
// Aviso grande arriba de la pantalla con cuenta regresiva
let inviteTick = null;
function renderInvites() {
  const box = $('#invite'); if (!box) return;
  const now = Date.now();
  for (const [id, v] of net.invites) if (v.until < now) net.invites.delete(id);
  const v = [...net.invites.values()].pop();
  if (!v || coop.guest || coop.host || !st.inGame) { box.classList.add('hidden'); clearInterval(inviteTick); inviteTick = null; return; }
  const left = Math.ceil((v.until - now) / 1000), busy = !!getBT();
  box.innerHTML = `<div class="invt">📣 <b>${esc(v.host)}</b> encontró al ${esc(v.boss.e)} <b>${esc(v.boss.name)}</b> 👑 (Nv ${v.boss.lvl})</div>
    <div class="invs mut">⏳ ${left} s · cada jugador pelea con 1 héroe${busy ? ' · termina tu combate para unirte' : ''}</div>
    <div class="invb"><button class="btn gold" data-i="join" data-k="${esc(v.id)}" ${busy ? 'disabled' : ''}>⚔️ Unirse</button><button class="btn" data-i="no" data-k="${esc(v.id)}">Ahora no</button></div>`;
  box.classList.remove('hidden');
  if (!inviteTick) inviteTick = setInterval(renderInvites, 1000);
}
function joinInvite(id) {
  const v = net.invites.get(id); if (!v) return;
  if (getBT()) { toast('Termina tu combate para unirte'); return; }
  if (inDungeon()) { toast('🕳️ Sal de la mazmorra para unirte (usa una escalera)'); return; }
  if (isModalOpen()) closeModal();
  chooseHero('⚔️ Unirse al combate', `${esc(v.host)} pelea contra ${esc(v.boss.e)} <b>${esc(v.boss.name)}</b> (Nv ${v.boss.lvl}). Cada jugador usa <b>1 héroe</b>:`, async h => {
    const r = await coopAsk('boss:join', { id, hero: snap(h) });
    if (!r.ok) { toast(r.error || 'No se pudo unir'); net.invites.delete(id); renderInvites(); return; }
    net.invites.delete(id);
    coop.guest = { id, host: v.host, boss: v.boss, hero: h, pre: { hp: h.hp, mp: h.mp, poison: h.poison || 0 }, prev: { x: P.x, y: P.y }, started: false, seq: -1, built: false, myId: null };
    renderInvites(); openGuestWait();
  });
}
function guestWaitRender() {
  const g = coop.guest; if (!g) return '';
  return `<h2>⚔️ Te uniste</h2><p class="mut">Con ${g.hero.e} <b>${g.hero.name}</b> al combate de <b>${esc(g.host)}</b> contra ${esc(g.boss.e)} <b>${esc(g.boss.name)}</b> (Nv ${g.boss.lvl}).</p>
    <div class="lobbyt">⏳ Esperando que ${esc(g.host)} comience…</div>
    <div class="row end"><button class="btn" data-a="leave">Salir</button></div>`;
}
function openGuestWait() {
  openModal(guestWaitRender, a => { if (a === 'leave' && coop.guest) { coopSend('boss:leave', { id: coop.guest.id }); coop.guest = null; closeModal(); toast('Saliste del combate en equipo'); } });
}
// Comienza: el invitado "viaja" junto al jefe (los demás lo ven ahí) y abre la vista del combate
function guestStart(d) {
  const g = coop.guest; if (!g || d.id !== g.id) return;
  g.started = true; if (isModalOpen()) closeModal();
  st.busy = true;
  P.x = P.px = g.boss.x; P.y = P.py = g.boss.y + 1; spawnNearby(); visitAround();
  $('#battle').style.background = BG.GRASS; $('#battle').classList.remove('hidden'); document.body.classList.add('inbattle');
  $('#b-field').innerHTML = ''; $('#b-party').innerHTML = ''; $('#b-menu').innerHTML = '<div class="res">⚔️ ¡Comienza el combate en equipo!</div>'; $('#b-log').textContent = ''; bossBar(null);
  updateHUD();
}
// Dibuja el estado que manda el anfitrión
const gel = id => document.getElementById('g-' + id);
function gpop(id, txt, col) { const el = gel(id); if (!el) return; const s = document.createElement('div'); s.className = 'pop'; s.textContent = txt; s.style.color = col || '#fff'; el.appendChild(s); setTimeout(() => s.remove(), 1050); }
function guestState(s) {
  const g = coop.guest; if (!g || !g.started || s.id !== g.id) return;
  g.last = s;
  if (!g.built || g.nE !== s.enemies.length || g.nP !== s.party.length) {
    $('#battle').style.background = BG[s.bg] || BG.GRASS;
    $('#b-field').innerHTML = s.enemies.map(e => `<div class="enemy ${e.boss ? 'boss' : ''}" id="g-${esc(e.id)}"><span class="sp emoji" style="filter:${esc(e.tint || '')} drop-shadow(0 8px 6px #0007)">${esc(e.e)}</span><div class="en">${e.boss ? '👑 ' : ''}${esc(e.name)} <span class="lv">Nv ${e.lvl | 0}</span></div>${ebarHTML()}<div class="etags"></div></div>`).join('');
    bossBar(null);
    $('#b-party').innerHTML = s.party.map(h => `<div class="hcard" id="g-${h.id}"><div class="tags"></div><div class="top"><span class="em emoji">${esc(h.e)}</span><div style="min-width:0"><div class="nm">${esc(h.name)}</div><div class="sub">Nv ${h.lvl | 0} · ${esc(h.owner)}</div></div></div><div class="bar hpb"><i></i></div><div class="bar mp mpb"><i></i></div><div class="nums"><span class="hpt"></span><span class="mpt"></span></div></div>`).join('');
    // Mascotas del combate (cada una con el nombre de su dueño)
    if (Array.isArray(s.pets) && s.pets.length) $('#b-field').insertAdjacentHTML('beforeend', '<div id="b-pets">' + s.pets.filter(q => PETS[q.k]).map(q => `<div class="petb" id="g-${esc(q.id)}"><span class="emoji">${PETS[q.k].e}</span><small>Nv ${q.lvl | 0} · ${esc(q.owner)}</small></div>`).join('') + '</div>');
    if (s.night) $('#b-field').insertAdjacentHTML('beforeend', '<div id="b-night">🌙 Noche</div>');
    g.built = true; g.nE = s.enemies.length; g.nP = s.party.length;
    const mine = s.party.find(h => h.owner === st.name); g.myId = mine ? mine.id : null;
  }
  for (const e of s.enemies) { const el = gel(e.id); if (!el) continue; setBar(el.querySelector('.ebar'), e.hp, e.mhp); el.querySelector('.etags').textContent = e.tags; el.classList.toggle('dead', e.hp <= 0); }
  const boss = s.enemies.find(e => e.boss); if (boss) bossBar(boss);
  for (const h of s.party) {
    const el = gel(h.id); if (!el) continue;
    el.classList.toggle('dead', h.hp <= 0); el.classList.toggle('active', !!(s.turn && s.turn.id === h.id)); el.classList.toggle('mine', h.owner === st.name);
    el.querySelector('.hpb>i').style.width = (100 * h.hp / h.mhp) + '%'; el.querySelector('.mpb>i').style.width = (100 * h.mp / h.mmp) + '%';
    el.querySelector('.hpt').textContent = `PV ${h.hp}/${h.mhp}` + (h.tmp ? ` +${h.tmp}` : ''); el.querySelector('.mpt').textContent = `PM ${h.mp}/${h.mmp}`;
    el.querySelector('.tags').textContent = h.tags;
  }
  $('#b-log').innerHTML = s.log || '';
  for (const p of s.pops || []) gpop(p.id, p.txt, p.col);
  // Turno: el mío → menú con reloj; el de otro → reloj de espera
  const t = s.turn;
  if (t && t.seq !== g.seq) {
    g.seq = t.seq; g.until = Date.now() + (t.left || TURN_MS); g.sent = false;
    if (t.owner === st.name) guestMenu('main'); else $('#b-menu').innerHTML = `<div class="res">Turno de ${esc(t.e)} <b>${esc(t.name)}</b> · ${esc(t.owner)}</div>`;
    startGuestClock(t);
  }
  if (!t) stopGuestClock();
}
let gClock = null;
function startGuestClock(t) {
  stopGuestClock(); const el = $('#b-clock'); el.classList.remove('hidden');
  const show = () => { const g = coop.guest; if (!g) return stopGuestClock(); const s = Math.max(0, Math.ceil((g.until - Date.now()) / 1000));
    el.textContent = `⏳ ${s} s · ${t.owner === st.name ? '¡Tu turno!' : 'Turno de ' + t.e + ' ' + t.name + ' (' + t.owner + ')'}`; el.classList.toggle('mine', t.owner === st.name); };
  show(); gClock = setInterval(show, 500);
}
function stopGuestClock() { clearInterval(gClock); gClock = null; const el = $('#b-clock'); if (el) el.classList.add('hidden'); }
// Menú del invitado (mismo estilo que el del combate normal)
function guestMenu(stage, data) {
  const g = coop.guest, s = g && g.last; if (!g || !s || g.sent) return;
  const me = s.party.find(h => h.id === g.myId), h = g.hero; if (!me) return;
  const m = $('#b-menu'); m.innerHTML = '';
  const btn = (label, sub, fn, dis, full) => { const b = document.createElement('button'); b.className = 'btn' + (full ? ' full' : ''); b.innerHTML = label + (sub ? `<small>${sub}</small>` : ''); if (dis) b.disabled = true; b.onclick = fn; m.appendChild(b); };
  const send = (kind, key, target) => {
    g.sent = true; if (kind === 'skill' && key === 'cerveza') g.beer = true;
    coopSend('battle:action', { id: g.id, heroId: g.myId, kind, key: key || null, target: target || null });
    if (kind === 'item') G.items[key] = Math.max(0, (G.items[key] || 0) - 1);
    m.innerHTML = '<div class="res">✅ Acción enviada. Esperando al anfitrión…</div>';
  };
  // Estimados (Fase 0.5): con los stats de mi héroe, sus mejoras activas y la defensa de los enemigos que manda el anfitrión
  const A = { atk: S(h, 'atk') * atkMulB(me.buffs), atkRaw: S(h, 'atk'), mag: S(h, 'mag'), hp: me.hp, mhp: me.mhp, critMul: (heroFx(h, 'umbra') ? 2.5 : 1.75) + talFx(h, 'critDmg'),
    boost: k => talSk(h, 'skB', k), burnSk: k => talSk(h, 'skBurn', k), gold: G.gold, heal: talFx(h, 'healP'), steal: talFx(h, 'stealP'), lucky: talFx(h, 'luckyMin'), dance: talFx(h, 'danceExtra'), beer2: talFx(h, 'beer2') };
  const tOf = e => ({ def: Number(e.def) || 0, hp: e.hp, mhp: e.mhp, curse: !!e.cu, undead: !!e.ud, boss: !!e.boss });
  const est = k => estimate(k, A, s.enemies.filter(e => e.hp > 0).map(tOf));
  const hvOf = x => ({ hp: x.hp, mhp: x.mhp, mp: x.mp, mmp: x.mmp, poison: x.poison || 0 });
  const note = n => n ? `<span class="bnote2">${n}</span>` : '';
  const targets = (kind, then, ctx) => {
    const list = kind === 'enemy' ? s.enemies.filter(e => e.hp > 0) : kind === 'ally' ? s.party.filter(x => x.hp > 0) : kind === 'dead' ? s.party.filter(x => x.hp <= 0) : [];
    if (!list.length) { guestMenu('main'); toast('No hay objetivos válidos'); return; }
    m.innerHTML = '';
    for (const x of list) {
      const sub = kind === 'enemy' ? (ctx && ctx.enemy ? ctx.enemy(tOf(x)) : `PV ${x.hp}/${x.mhp}`) : kind === 'dead' ? (ctx && ctx.revive ? ctx.revive(hvOf(x)) : `PV 0/${x.mhp}`) : (ctx && ctx.ally ? ctx.ally(hvOf(x)) : `PV ${x.hp}/${x.mhp}`);
      btn(`${esc(x.e)} ${esc(x.name)}`, sub + (x.owner ? ' · ' + esc(x.owner) : ''), () => then(x.id));
    }
    btn('↩ Volver', '', () => guestMenu('main'), false, true);
  };
  // Objetos (Fase 0.4): tarjetas con PV/PM de todos los héroes del combate y vista previa
  const itemPick = k => {
    const rows = itemTargets(k, s.party.map(x => ({ x0: x, e: esc(x.e), name: esc(x.name), sub: esc(x.owner) + ' · Nv ' + (x.lvl | 0), H: hvOf(x) })));
    if (!rows.some(r => !r.dis)) { toast(k === 'pluma' ? 'No hay héroes caídos' : 'Nadie lo necesita ahora'); return; }
    m.innerHTML = '';
    for (const r of rows) { const b = document.createElement('button'); b.className = 'btn hpk' + (r.best ? ' best' : ''); b.innerHTML = heroCardHTML(r.x, r.prev, r.dis, r.best); if (r.dis) b.disabled = true; b.onclick = () => send('item', k, r.x.x0.id); m.appendChild(b); }
    btn('↩ Volver', '', () => guestMenu('item'), false, true);
  };
  if (stage === 'main') {
    const ea = est('atk');
    btn(me.bear ? '🐻 Zarpazo' : '⚔️ Atacar', ea.line + note(ea.note), () => targets('enemy', id => send('atk', null, id), ea));
    btn('✨ Habilidades', me.bear ? 'en forma de oso' : '', () => guestMenu('skill'), me.bear);
    btn('🎒 Objetos', 'tus objetos', () => guestMenu('item'));
    btn('🛡️ Defender', 'Recibe la mitad de daño', () => send('def'));
  } else if (stage === 'skill') {
    for (const k of learned(h)) { const c = skillCost(h, k), sk = SK[k], e = est(k);
      btn(sk.n, `${c} PM · ${e.line || sk.d}${note(e.note)}`, () => { if (['enemy', 'ally', 'dead'].includes(sk.t)) targets(sk.t, id => send('skill', k, id), e); else send('skill', k); }, me.mp < c || (k === 'cerveza' && g.beer)); }
    btn('↩ Volver', '', () => guestMenu('main'), false, true);
  } else if (stage === 'item') {
    for (const k of Object.keys(IT)) btn(`${IT[k].e} ${IT[k].n} ×${G.items[k] || 0}`, IT[k].d, () => itemPick(k), !G.items[k]);
    btn('↩ Volver', '', () => guestMenu('main'), false, true);
  }
}
// Fin del combate para el invitado
async function guestEnd(d) {
  const g = coop.guest; if (!g || d.id !== g.id) return;
  coop.guest = null; stopGuestClock();
  const h = g.hero, lines = [];
  if (!g.started) { if (isModalOpen()) closeModal(); toast(`⚠️ ${d.reason || 'El combate en equipo se canceló'}`); return; }
  let lost = false;
  if (d.result === 'cancel') {
    h.hp = g.pre.hp; h.mp = g.pre.mp; h.poison = g.pre.poison;     // sin penalización
    lines.push(`⚠️ <b>Combate cancelado</b>${d.reason ? ': ' + esc(d.reason) : ''}. No pierdes nada.`);
  } else if (d.result === 'win') {
    const mine = (d.heroes || []).find(x => x.owner === st.name);
    if (mine) { h.hp = Math.max(0, Math.min(S(h, 'mhp'), mine.hp)); h.mp = Math.max(0, Math.min(S(h, 'mmp'), mine.mp)); h.poison = mine.poison || 0; }
    lines.push(`🏆 <b>¡Victoria en equipo!</b> +${d.xp} XP · +${d.gold} de oro`);
    if (h.hp <= 0) { h.hp = Math.max(1, Math.round(S(h, 'mhp') * .25)); lines.push(`💚 ${h.name} se levanta con 25% de vida`); }
    const before = h.lvl; lines.push(...gainXP(h, d.xp)); if (h.lvl > before) notice('level', `${h.name} Nv ${h.lvl}`);
    const extra = (d.extra && d.extra[st.name]) || 0, cat = activePet() && activePet().k === 'gato' ? activePet() : null; G.gold += Math.round(d.gold * (cat ? 1 + catBonus(cat) : 1)) + extra; if (extra) lines.push(`💰 Robaste ${extra} de oro`);
    G.items.pluma++; G.items.eter++; G.bosses = (G.bosses || 0) + 1; lines.push('🎁 Botín del jefe: 🪶 Pluma Fénix y 🔷 Éter');
    if (Math.random() < .15) { addEgg('jefe'); lines.push('🥚 <b>¡Un huevo de mascota!</b> Eclosiona en 300 pasos.'); }
    lines.push(...petGainXP(activePet(), d.xp * .5));
    const b = d.boss || {}, it = rollLoot(b.lvl || 1, Math.min(1, Math.hypot((b.x || 0) - START.x, (b.y || 0) - START.y) / 400), 'raro');
    lines.push(addItem(it) ? `🎁 Equipo: ${itemLabel(it)} <small style="color:${RAR[it.r].c}">${RAR[it.r].n} · Nv ${it.ilvl}</small>` : `<span class="mut">🎒 Inventario lleno: dejaste ${itemLabel(it)}</span>`);
    if (b.id) { G.defeated[b.id] = G.steps; const mo = monsters.get(b.id); if (mo) { monsters.delete(b.id); mpos.delete(mo.x + ',' + mo.y); } }
    lines.push(...onVictory((b.keys || []).map(key => ({ key })), { id: b.id }));
  } else {
    // Se perdió: la regla de la tumba, con los objetos donde estaba antes del combate
    lost = true;
    P.x = g.prev.x; P.y = g.prev.y;
    const t = createTomb(g.prev.x, g.prev.y);
    for (const x of G.roster) { x.hp = S(x, 'mhp'); x.mp = S(x, 'mmp'); x.poison = 0; x.buffs = {}; }
    lines.push(`💀 <b>El equipo cayó…</b> Tus objetos quedaron donde estabas${t.created ? ' (tumba 🪦, 60 min)' : ''}. Despertarás en <b>Ciudad Origen</b>.`);
    notice('death', 'Ciudad Origen');
  }
  $('#b-menu').innerHTML = `<div class="res">${lines.join('<br>')}</div>`;
  const b = document.createElement('button'); b.className = 'btn gold full'; b.textContent = 'Continuar';
  b.onclick = () => {
    $('#battle').classList.add('hidden'); document.body.classList.remove('inbattle'); bossBar(null);
    if (lost) { P.x = P.px = START.x; P.y = P.py = START.y; } else { P.x = P.px = g.prev.x; P.y = P.py = g.prev.y; }   // vuelve a su posición
    spawnNearby(); visitAround(); st.busy = false; updateHUD(); save('now');
  };
  $('#b-menu').appendChild(b);
  save('now');
}

// ================= Eventos de la red =================
export function initCoop() {
  net.ev.coop = (ev, d) => {
    if (ev === 'boss:invite' && d && d.id) { net.invites.set(d.id, Object.assign({}, d, { until: Date.now() + (d.left || 90000) })); feed(`📣 <b>${esc(d.host)}</b> pide ayuda contra ${esc(d.boss.e)} <b>${esc(d.boss.name)}</b>`); renderInvites(); }
    else if (ev === 'boss:closed' && d) { net.invites.delete(d.id); renderInvites(); }
    else if (ev === 'boss:lobby' && coop.host && d.id === coop.host.id) { coop.host.guests = d.guests || []; if (d.guests && d.guests.length) feed(`⚔️ ${esc(d.guests[d.guests.length - 1].name)} se unió a tu combate`); refreshModal(); }
    else if (ev === 'boss:left' && d) {
      const B = getBT(); if (B && B.coop && B.coop.id === d.id) { B.coop.gone.add(d.name); for (const h of B.party) if (h.owner === d.name && B.coop.waiters.has(h.id)) B.coop.waiters.get(h.id)(null); feed(`📴 ${esc(d.name)} se desconectó: su héroe se defenderá solo`); }
      else if (coop.host && coop.host.id === d.id) { coop.host.guests = coop.host.guests.filter(g => g.name !== d.name); refreshModal(); }
    }
    else if (ev === 'battle:action' && d) { const B = getBT(); if (B && B.coop && B.coop.id === d.id) { const h = B.party.find(x => x.id === d.heroId); if (h && h.owner === d.from && B.coop.waiters.has(h.id)) B.coop.waiters.get(h.id)(d); } }
    else if (ev === 'boss:start') guestStart(d);
    else if (ev === 'battle:state') guestState(d);
    else if (ev === 'battle:end') guestEnd(d);
    else if (ev === 'disconnect' && coop.guest && coop.guest.started) guestEnd({ id: coop.guest.id, result: 'cancel', reason: 'se perdió la conexión' });
  };
  $('#invite').addEventListener('click', e => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    if (b.dataset.i === 'join') joinInvite(b.dataset.k); else { net.invites.delete(b.dataset.k); renderInvites(); }
  });
}
