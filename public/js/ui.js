// Interfaz: HUD, toasts, avisos online, modales (aldea, grupo, mapa) y panel de la sala.
'use strict';
import { $, esc, dirArrow } from './util.js';
import { B, CL, SK, IT, EN, CH, RGB, BLOCKO, QUICK } from './data.js';
import { G, P, START, st, held, S, heroes, alive, need, avgLvl, leader } from './state.js';
import { feats, monsters, getChunk, tileAt, dangerAt, ckey } from './world.js';
import { runSkill, useItem } from './battle.js';
import { save } from './storage.js';
import { net, sendQuick, placePin } from './net.js';

// Acciones que resuelve main.js (evita dependencias circulares con la pantalla de inicio)
export const hooks = { onNewGame: null, onExit: null };

// ================= Toasts =================
let toastT = null;
export function toast(html) { const t = $('#toast'); t.innerHTML = html; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2300); }
// Avisos online (apilados, visibles también en combate)
export function feed(html) {
  const f = $('#feed'); const d = document.createElement('div'); d.className = 'fitem'; d.innerHTML = html; f.appendChild(d);
  while (f.children.length > 3) f.firstChild.remove();
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 450); }, 3800);
}

// ================= HUD =================
const connIcon = () => !st.online ? '⚪' : net.status === 'on' ? '🟢' : '🟡';
const connText = () => !st.online ? 'Sin conexión' : net.status === 'on' ? 'Conectado' : 'Reconectando…';
export function updateHUD() {
  if (!st.inGame || st.titleOpen) return;
  $('#hud').innerHTML = heroes().map(h => { const mh = S(h, 'mhp'), mm = S(h, 'mmp'); return `<div class="mini ${h.hp <= 0 ? 'dead' : ''}"><span class="em emoji">${h.e}</span><div style="flex:1;min-width:0"><div class="nm">${h.name} <span class="mut">Nv ${h.lvl}</span> ${h.poison > 0 ? '☠️' : ''}</div><div class="bar"><i style="width:${100 * h.hp / mh}%"></i></div><div class="bar mp"><i style="width:${100 * h.mp / mm}%"></i></div></div></div>`; }).join('');
  const b = tileAt(P.x, P.y).b;
  const n = [...net.others.values()].filter(o => o.online !== false).length;
  $('#info').innerHTML = `<b>💰 ${G.gold}</b> · 🧪 ${G.items.pocion} · 🔷 ${G.items.eter} · 🪶 ${G.items.pluma}<br>${B[b].i} ${B[b].n} · Peligro Nv ~${dangerAt(P.x, P.y)}<br><span class="mut">📍 ${P.x - START.x}, ${START.y - P.y}</span> · <span title="${connText()}">${connIcon()} ${esc(st.room)}${st.online ? ` · 👥${n + 1}` : ''}</span>`;
  const badge = $('#socBadge'); if (badge) { badge.textContent = n ? n : ''; badge.classList.toggle('hidden', !n); }
}

// ================= Lista de jugadores de la sala =================
const STATUS = { battle: '⚔️ en combate', village: '🏘️ en aldea', map: '🧭 explorando', lobby: '⏳ eligiendo héroes' };
export function playersHTML(onlyOthers) {
  const rows = [];
  if (!onlyOthers && st.inGame) {
    const b = tileAt(P.x, P.y).b;
    rows.push(`<div class="prow me"><span class="emoji pe">${leader().e}</span><div class="pi"><b>${esc(st.name)}</b> <span class="mut">(tú) · Nv ${avgLvl().toFixed(1)}</span><div class="mut ps">${B[b].i} ${B[b].n}</div></div></div>`);
  }
  for (const o of net.others.values()) {
    const lobby = o.status === 'lobby', off = o.online === false;
    const bi = B[o.biome] || B.GRASS;
    const where = lobby ? '' : `${bi.i} ${bi.n}`;
    const dist = !lobby && st.inGame ? `<span class="pd">${Math.round(Math.hypot(o.x - P.x, o.y - P.y))} c ${dirArrow(o.x - P.x, o.y - P.y)}</span>` : '';
    rows.push(`<div class="prow ${off ? 'off' : ''}"><span class="emoji pe">${lobby ? '⏳' : esc(o.leaderEmoji || '🙂')}</span><div class="pi"><b>${esc(o.name)}</b> <span class="mut">${lobby ? '' : '· Nv ' + Number(o.avgLvl || 1).toFixed(1)}</span><div class="mut ps">${off ? '📴 desconectado' : STATUS[o.status] || ''}${where ? ' · ' + where : ''}</div></div>${dist}</div>`);
  }
  if (!rows.length || (rows.length === 1 && !onlyOthers && st.inGame)) rows.push(`<div class="mut pempty">${st.online ? 'Comparte el código <b>' + esc(st.room) + '</b> para que tu amigo entre.' : 'Modo sin conexión.'}</div>`);
  return rows.join('');
}

// Popover de la sala: jugadores + mensajes rápidos + marcar ubicación (no pausa el juego)
let socialOpen = false;
export function socialHTML() {
  return `<div class="sochead"><b>Sala ${esc(st.room)}</b><span class="mut">${connIcon()} ${connText()}</span><button class="btn sm" data-s="close" aria-label="Cerrar">✕</button></div>
  <div class="plist">${playersHTML(false)}</div>
  <div class="qgrid">${QUICK.map(q => `<button class="btn" data-s="q" data-k="${q.id}">${q.t}</button>`).join('')}</div>
  <button class="btn gold full" data-s="pin">📍 Marcar aquí</button>
  ${!st.online ? '<p class="mut small">Sin conexión: los mensajes y marcas solo los ves tú.</p>' : ''}`;
}
export function toggleSocial(force) {
  socialOpen = force == null ? !socialOpen : force;
  const el = $('#social'); el.classList.toggle('hidden', !socialOpen);
  if (socialOpen) el.innerHTML = socialHTML();
}
export const closeSocial = () => toggleSocial(false);
export function updatePlayersUI() {
  if (socialOpen) $('#social').innerHTML = socialHTML();
  const pl = $('#plist'); if (pl) pl.innerHTML = st.inGame && net.others.size ? playersHTML(true) : '';
  updateHUD();
}

// ================= Modales =================
let MR = null, MH = null, MA = null;
export const isModalOpen = () => !!MR;
export function openModal(render, handler, after) { MR = render; MH = handler; MA = after || null; st.busy = true; held.clear(); closeSocial(); $('#modal').classList.remove('hidden'); rerender(); }
function rerender() { $('#mcontent').innerHTML = MR(); if (MA) MA(); updateHUD(); }
export function closeModal() { $('#modal').classList.add('hidden'); MR = MH = MA = null; st.busy = false; held.clear(); save(); }
export const modalIs = k => (k === 'party' && MR === partyRender) || (k === 'map' && MR === mapRender) || (k === 'village' && MR === villageRender);

// ================= Aldea =================
let VF = null, VMSG = '';
const upCost = n => Math.round(50 * Math.pow(n + 1, 1.5));
function restCost() { return VF.start ? 0 : Math.max(3, Math.round(avgLvl() * 4)); }
function villageRender() {
  const f = VF, cost = restCost();
  return `<h2>🏘️ ${f.name}</h2><p class="mut" style="margin:0">Refugio seguro: los monstruos no entran aquí. Tienes <b class="goldt">💰 ${G.gold}</b> de oro.</p>
  ${VMSG ? `<div class="pend" style="margin-top:10px">${VMSG}</div>` : ''}
  <div class="sec"><h3>🛏️ Posada</h3><div class="shop"><span>Restaura PV y PM, revive a los caídos y guarda la partida.</span><button class="btn gold" data-a="rest" ${G.gold < cost ? 'disabled' : ''}>Descansar (${cost ? cost + ' oro' : 'gratis'})</button></div></div>
  <div class="sec"><h3>🛒 Tienda</h3>${Object.keys(IT).map(k => `<div class="shop"><span><span class="emoji">${IT[k].e}</span> <b>${IT[k].n}</b> <small class="mut">${IT[k].d}</small></span><span><small class="mut">Tienes ${G.items[k]}</small> <button class="btn sm" data-a="buy" data-k="${k}" ${G.gold < IT[k].p ? 'disabled' : ''}>Comprar · ${IT[k].p} oro</button></span></div>`).join('')}</div>
  <div class="sec"><h3>⚒️ Herrería</h3>
    <div class="shop"><span>🗡️ <b>Afilar armas</b> <small class="mut">+2 de Ataque a todos (nivel actual ${G.upA})</small></span><button class="btn sm" data-a="upA" ${G.gold < upCost(G.upA) ? 'disabled' : ''}>${upCost(G.upA)} oro</button></div>
    <div class="shop"><span>🛡️ <b>Reforzar armaduras</b> <small class="mut">+2 de Defensa a todos (nivel actual ${G.upD})</small></span><button class="btn sm" data-a="upD" ${G.gold < upCost(G.upD) ? 'disabled' : ''}>${upCost(G.upD)} oro</button></div></div>
  <div class="sec"><h3>🍺 Taberna</h3><p class="mut" style="margin:0 0 8px;font-size:13px">Toca para sumar o sacar héroes del grupo (máximo 3). Los que esperan aquí ganan la mitad de la experiencia.</p>
    <div class="tav">${G.roster.map((h, i) => `<button class="tavh ${G.party.includes(i) ? 'on' : ''}" data-a="tog" data-k="${i}"><span class="emoji">${h.e}</span><b>${h.name}</b><small>${CL[h.cls].n} · Nv ${h.lvl}</small><small>${G.party.includes(i) ? '✅ En el grupo' : 'Esperando'}</small></button>`).join('')}</div></div>
  <div class="row end"><button class="btn" data-a="close">Salir de la aldea</button></div>`;
}
function villageAct(a, k) {
  VMSG = '';
  if (a === 'close') { closeModal(); return; }
  if (a === 'rest') { const c = restCost(); if (G.gold < c) return; G.gold -= c; for (const h of G.roster) { h.hp = S(h, 'mhp'); h.mp = S(h, 'mmp'); h.poison = 0; } G.lastVillage = { x: VF.x, y: VF.y }; save(); VMSG = '😴 El grupo descansó. ¡Todos recuperados! Partida guardada.'; }
  if (a === 'buy') { if (G.gold >= IT[k].p) { G.gold -= IT[k].p; G.items[k]++; } }
  if (a === 'upA' || a === 'upD') { const key = a === 'upA' ? 'upA' : 'upD', c = upCost(G[key]); if (G.gold >= c) { G.gold -= c; G[key]++; VMSG = a === 'upA' ? '🗡️ ¡Armas afiladas!' : '🛡️ ¡Armaduras reforzadas!'; } }
  if (a === 'tog') {
    const i = +k, ix = G.party.indexOf(i);
    if (ix >= 0) { if (G.party.length > 1) G.party.splice(ix, 1); else VMSG = 'Necesitas al menos un héroe en el grupo.'; }
    else { if (G.party.length < 3) G.party.push(i); else VMSG = 'El grupo ya tiene 3 héroes. Saca a alguien primero.'; }
    if (!G.party.includes(G.leader)) G.leader = G.party[0];
  }
  rerender();
}
export function openVillage(f) { VF = f; VMSG = ''; G.lastVillage = G.lastVillage || { x: f.x, y: f.y }; openModal(villageRender, villageAct); }

// ================= Grupo =================
let PA = null, NGC = false;
function partyRender() {
  let h = `<h2>🎒 Grupo</h2><p class="mut" style="margin:0">💰 ${G.gold} de oro · Ataque +${G.upA * 2} y Defensa +${G.upD * 2} por la herrería</p>`;
  if (PA) {
    const cands = PA.t === 'dead' ? heroes().filter(x => x.hp <= 0) : PA.t === 'ally' ? alive(heroes()) : [];
    h += `<div class="pend">Elige el objetivo de <b>${PA.label}</b>: ${cands.length ? cands.map(c => `<button class="btn sm" data-a="tgt" data-k="${G.roster.indexOf(c)}">${c.e} ${c.name} (${c.hp}/${S(c, 'mhp')})</button>`).join(' ') : '<span class="mut">no hay objetivos válidos</span>'} <button class="btn sm" data-a="cancel">Cancelar</button></div>`;
  }
  h += '<div class="hgrid">' + heroes().map(x => {
    const i = G.roster.indexOf(x), mh = S(x, 'mhp'), mm = S(x, 'mmp');
    return `<div class="pc ${x.hp <= 0 ? 'dead' : ''}"><div class="hd"><span class="emoji">${x.e}</span><div style="flex:1"><b>${x.name}</b> ${G.leader === i ? '<span class="goldt">★ Líder</span>' : ''}<div class="mut" style="font-size:12px">${CL[x.cls].n} · Nivel ${x.lvl}${x.hp <= 0 ? ' · <span style="color:#ff6b6b">Caído</span>' : ''}</div></div>${G.leader !== i ? `<button class="btn sm" data-a="leader" data-k="${i}">Líder</button>` : ''}</div>
    <div style="font-size:11px;margin-top:6px" class="mut">PV ${x.hp}/${mh}</div><div class="bar"><i style="width:${100 * x.hp / mh}%"></i></div>
    <div style="font-size:11px;margin-top:3px" class="mut">PM ${x.mp}/${mm}</div><div class="bar mp"><i style="width:${100 * x.mp / mm}%"></i></div>
    <div style="font-size:11px;margin-top:3px" class="mut">XP ${x.xp}/${need(x.lvl)}</div><div class="bar xp"><i style="width:${100 * x.xp / need(x.lvl)}%"></i></div>
    <div class="stats"><div>ATQ<b>${S(x, 'atk')}</b></div><div>DEF<b>${S(x, 'def')}</b></div><div>MAG<b>${S(x, 'mag')}</b></div><div>VEL<b>${S(x, 'spd')}</b></div></div>
    <div class="skl">${CL[x.cls].sk.map(k => { const s = SK[k]; return s.lv <= x.lvl ? `✨ <b>${s.n}</b> <span class="mut">${s.mp} PM</span>${s.field && x.hp > 0 ? ` <button class="btn sm" data-a="fskill" data-k="${i}:${k}" ${x.mp < s.mp ? 'disabled' : ''}>Usar</button>` : ''}` : `<span class="no">🔒 ${s.n} (Nv ${s.lv})</span>`; }).join('<br>')}</div></div>`;
  }).join('') + '</div>';
  h += `<h3>Objetos</h3>${Object.keys(IT).map(k => `<div class="shop"><span><span class="emoji">${IT[k].e}</span> <b>${IT[k].n}</b> ×${G.items[k]} <small class="mut">${IT[k].d}</small></span><button class="btn sm" data-a="item" data-k="${k}" ${G.items[k] ? '' : 'disabled'}>Usar</button></div>`).join('')}`;
  const res = G.roster.filter((_, i) => !G.party.includes(i));
  if (res.length) h += `<h3>Esperando en la taberna</h3><p class="mut" style="font-size:13px;margin:0">${res.map(x => `${x.e} ${x.name} (${CL[x.cls].n}, Nv ${x.lvl})`).join(' · ')}<br>Cámbialos en la taberna de cualquier aldea.</p>`;
  h += `<div class="row end"><button class="btn" data-a="exit">🚪 Salir al inicio</button><button class="btn" data-a="newgame">${NGC ? '⚠️ ¿Seguro? Se borra la partida' : 'Nueva partida'}</button><button class="btn gold" data-a="close">Cerrar</button></div>`;
  return h;
}
async function partyAct(a, k) {
  if (a !== 'newgame') NGC = false;
  if (a === 'close') { PA = null; closeModal(); return; }
  if (a === 'exit') { PA = null; closeModal(); if (hooks.onExit) hooks.onExit(); return; }
  if (a === 'newgame') { if (!NGC) { NGC = true; rerender(); return; } NGC = false; closeModal(); if (hooks.onNewGame) hooks.onNewGame(); return; }
  if (a === 'cancel') PA = null;
  if (a === 'leader') G.leader = +k;
  if (a === 'fskill') {
    const [ci, sk] = k.split(':'); const c = G.roster[+ci], s = SK[sk];
    if (s.t === 'allies') { c.mp -= s.mp; await runSkill(sk, c, alive(heroes())); PA = null; } else PA = { kind: 'skill', caster: c, sk, t: s.t, label: s.n };
  }
  if (a === 'item') { PA = { kind: 'item', k, t: IT[k].t, label: IT[k].n }; }
  if (a === 'tgt' && PA) {
    const t = G.roster[+k];
    if (PA.kind === 'skill') { const s = SK[PA.sk]; if (PA.caster.mp >= s.mp) { PA.caster.mp -= s.mp; await runSkill(PA.sk, PA.caster, [t]); } }
    else if (G.items[PA.k] > 0) useItem(PA.k, t);
    PA = null;
  }
  if (MR === partyRender) rerender();
}
export function openParty() { PA = null; NGC = false; openModal(partyRender, partyAct); }

// ================= Confirmación antes de pelear con un jefe =================
// Los jefes nunca inician el combate solos: el jugador decide.
// ETAPA 2 fase D: aquí se agregará el botón "📣 Pedir ayuda".
let BC = null;
function bossRender() {
  const m = BC.m, b = EN[m.group[0]], al = avgLvl(), danger = m.lvl - al >= 2;
  const escort = m.group.slice(1).map(k => `${EN[k].e} ${EN[k].n}`);
  return `<div class="bossc">
    <div class="bcrown emoji">👑</div>
    <div class="bsprite emoji" style="filter:${b.tint || 'none'} drop-shadow(0 8px 6px #0007)">${b.e}</div>
    <h2>${b.n}</h2>
    <div class="blv"><span>Nivel del jefe <b>${m.lvl}</b></span><span>Tu grupo <b>Nv ${al.toFixed(1)}</b></span></div>
    ${escort.length ? `<p class="mut small">Lo acompañan: ${escort.join(', ')}</p>` : ''}
    ${danger ? '<div class="bwarn">⚠️ Muy peligroso</div>' : ''}
    <p class="bnote">Si todo tu grupo cae, vuelves a empezar desde cero.</p>
    <div class="bbtns"><button class="btn gold big" data-a="fight">⚔️ Pelear</button><button class="btn big" data-a="retreat">🏃 Retirarse</button></div>
  </div>`;
}
export function openBossConfirm(m, onFight) {
  BC = { m, onFight };
  openModal(bossRender, a => {
    const c = BC;
    if (a === 'fight') { closeModal(); c.onFight(c.m); }
    else if (a === 'retreat') closeModal();
  });
}

// ================= Mapa =================
function mapRender() {
  return `<h2>🗺️ Mapa del mundo</h2><p class="mut" style="margin:0">Solo se ve lo que has explorado. Sala <b>${esc(st.room)}</b> · ${G.steps} pasos · ${G.bosses || 0} jefes derrotados</p>
  <canvas id="mm"></canvas><div class="legend"><span class="sq" style="background:#fff"></span>Tú<span class="sq" style="background:#7fe0ff"></span>Amigos<span class="sq" style="background:#ff5fa2"></span>Marcas<span class="sq" style="background:#f2c14e"></span>Aldea<span class="sq" style="background:#ff3b3b"></span>Jefe<span class="sq" style="background:#c27bff"></span>Santuario</div>
  <div class="row end"><button class="btn gold" data-a="close">Cerrar</button></div>`;
}
function drawMinimap() {
  const c = $('#mm'); if (!c) return; const R = 90, N = R * 2 + 1; c.width = N; c.height = N; const g = c.getContext('2d'); const img = g.createImageData(N, N), d = img.data;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = P.x - R + i, y = P.y - R + j, cx = Math.floor(x / CH), cy = Math.floor(y / CH), k = ckey(cx, cy), o = (j * N + i) * 4; let col = [14, 17, 30];
    if (G.visited[k]) { const ch = getChunk(cx, cy); const t = ch.tiles[(y - cy * CH) * CH + (x - cx * CH)]; col = RGB[t.b]; if (t.o && BLOCKO.has(t.o)) col = col.map(v => v * .72); }
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const vis = (x, y) => G.visited[ckey(Math.floor(x / CH), Math.floor(y / CH))];
  for (const f of feats.values()) {
    const i = f.x - P.x + R, j = f.y - P.y + R; if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1 || !vis(f.x, f.y)) continue;
    if (f.type === 'village') { g.fillStyle = '#f2c14e'; g.fillRect(i - 1, j - 1, 3, 3); } else if (f.type === 'shrine' && !G.opened[f.id]) { g.fillStyle = '#c27bff'; g.fillRect(i, j, 2, 2); }
  }
  for (const m of monsters.values()) if (m.boss && vis(m.x, m.y)) { const i = m.x - P.x + R, j = m.y - P.y + R; g.fillStyle = '#ff3b3b'; g.fillRect(i - 1, j - 1, 3, 3); }
  // Marcas y amigos (si están fuera del área, se pegan al borde)
  const edge = (x, y, col, s) => { const i = Math.max(2, Math.min(N - 3, x - P.x + R)), j = Math.max(2, Math.min(N - 3, y - P.y + R)); g.fillStyle = '#000'; g.fillRect(i - s, j - s, s * 2 + 1, s * 2 + 1); g.fillStyle = col; g.fillRect(i - s + 1, j - s + 1, s * 2 - 1, s * 2 - 1); };
  const now = Date.now();
  for (const p of net.pins.values()) if (p.until > now) edge(p.x, p.y, '#ff5fa2', 2);
  for (const o of net.others.values()) if (o.status && o.status !== 'lobby') edge(o.x, o.y, '#7fe0ff', 2);
  g.fillStyle = '#000'; g.fillRect(R - 2, R - 2, 5, 5); g.fillStyle = '#fff'; g.fillRect(R - 1, R - 1, 3, 3);
}
export function openMap() { openModal(mapRender, a => { if (a === 'close') closeModal(); }, drawMinimap); }

// ================= Inicialización de eventos de la interfaz =================
export function initUI(h) {
  Object.assign(hooks, h);
  $('#modal').addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if (b && MH && !b.disabled) { MH(b.dataset.a, b.dataset.k); return; }
    if (e.target.id === 'modal' && MR) closeModal();
  });
  $('#social').addEventListener('click', e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    const a = b.dataset.s;
    if (a === 'close') closeSocial();
    else if (a === 'q') { sendQuick(b.dataset.k); closeSocial(); }
    else if (a === 'pin') { placePin(P.x, P.y); if (!st.online) feed('📍 Marcaste este lugar (visible 2 minutos)'); closeSocial(); }
  });
  $('#bParty').onclick = () => { if (!st.busy) openParty(); };
  $('#bMap').onclick = () => { if (!st.busy) openMap(); };
  $('#bSocial').onclick = () => toggleSocial();
  $('#bSave').onclick = () => { toast(save() ? '💾 Partida guardada' : '⚠️ No se pudo guardar en este navegador'); };
}
