// Interfaz: HUD, toasts, avisos online, modales (aldea, grupo, mapa) y panel de la sala.
'use strict';
import { $, esc, dirArrow } from './util.js';
import { B, CL, SK, IT, EN, CH, RGB, BLOCKO, QUICK, BOAT_PRICE } from './data.js';
import { G, P, START, st, held, S, heroes, alive, need, avgLvl, leader, changeEquip } from './state.js';
import { feats, monsters, getChunk, tileAt, dangerAt, ckey, inVillage, isCoastal, spawnNearby, visitAround } from './world.js';
import { boardQuest, accept, abandon, track, tracked, active, isActive, progressText, rewardText, compass, MAX_ACTIVE, SLOTS_PER_BOARD, QICON, QNAME } from './quests.js';
import { runSkill, useItem, skillCost } from './battle.js';
import { INV_MAX, SLOTS, SLOT_KEYS, TYPES, RAR, STAT, LEGENDS, slotOf, canUse, sellPrice, buyPrice, statList, classesText, itemLabel, compare, addItem, shopStock, markBought } from './items.js';
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
  $('#info').innerHTML = `<b>💰 ${G.gold}</b> · 🧪 ${G.items.pocion} · 🔷 ${G.items.eter} · 🪶 ${G.items.pluma}<br>${B[b].i} ${B[b].n} · Peligro Nv ~${dangerAt(P.x, P.y)}<br><span class="mut">📍 ${P.x - START.x}, ${START.y - P.y}</span> · <span title="${connText()}">${connIcon()} ${esc(st.room)}${st.online ? ` · 👥${n + 1}` : ''}</span>`
    + (tracked() ? `<div class="qline">${QICON[tracked().type]} ${tracked().title} · <b>${progressText(tracked())}</b></div>` : '');
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
    const away = o.status === 'away', lobby = o.status === 'lobby' || away, off = o.online === false;
    const bi = B[o.biome] || B.GRASS;
    const where = lobby ? '' : `${bi.i} ${bi.n}`;
    const dist = !lobby && st.inGame ? `<span class="pd">${Math.round(Math.hypot(o.x - P.x, o.y - P.y))} c ${dirArrow(o.x - P.x, o.y - P.y)}</span>` : '';
    rows.push(`<div class="prow ${off ? 'off' : ''}"><span class="emoji pe">${away ? '💤' : lobby ? '⏳' : esc(o.leaderEmoji || '🙂')}</span><div class="pi"><b>${esc(o.name)}</b> <span class="mut">${lobby ? '' : '· Nv ' + Number(o.avgLvl || 1).toFixed(1)}</span><div class="mut ps">${away ? '💤 fuera de línea' : off ? '📴 desconectado' : STATUS[o.status] || ''}${where ? ' · ' + where : ''}</div></div>${dist}</div>`);
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
let VF = null, VMSG = '', VSELL = false;
const upCost = n => Math.round(50 * Math.pow(n + 1, 1.5));
function restCost() { return VF.start ? 0 : Math.max(3, Math.round(avgLvl() * 4)); }
const zoneLvl = f => Math.max(1, dangerAt(f.x, f.y));
function villageRender() {
  const f = VF, cost = restCost(), ilvl = zoneLvl(f), stock = shopStock(f, ilvl), inv = G.inventory, full = inv.length >= INV_MAX;
  return `<h2>🏘️ ${f.name}</h2><p class="mut" style="margin:0">Refugio seguro: los monstruos no entran aquí. Tienes <b class="goldt">💰 ${G.gold}</b> de oro.</p>
  ${VMSG ? `<div class="pend" style="margin-top:10px">${VMSG}</div>` : ''}
  <div class="sec"><h3>🛏️ Posada</h3><div class="shop"><span>Restaura PV y PM, revive a los caídos y guarda la partida.</span><button class="btn gold" data-a="rest" ${G.gold < cost ? 'disabled' : ''}>Descansar (${cost ? cost + ' oro' : 'gratis'})</button></div></div>
  <div class="sec"><h3>🛒 Tienda</h3>${Object.keys(IT).map(k => `<div class="shop"><span><span class="emoji">${IT[k].e}</span> <b>${IT[k].n}</b> <small class="mut">${IT[k].d}</small></span><span><small class="mut">Tienes ${G.items[k]}</small> <button class="btn sm" data-a="buy" data-k="${k}" ${G.gold < IT[k].p ? 'disabled' : ''}>Comprar · ${IT[k].p} oro</button></span></div>`).join('')}</div>
  <div class="sec"><h3>⚔️ Armería <small class="mut">equipo común de la zona · Nv ${ilvl}</small></h3>
    ${stock.map(({ it, sold }, i) => `<div class="shop"><span class="ishop">${itemLabel(it)}<small class="mut">${statList(it.st).join(' · ')} · ${classesText(it)}</small></span>${sold ? '<span class="mut small">Vendido</span>' : `<button class="btn sm" data-a="buyeq" data-k="${i}" ${G.gold < buyPrice(it) || full ? 'disabled' : ''}>Comprar · ${buyPrice(it)} oro</button>`}</div>`).join('')}
    <div class="shop"><span>💰 <b>Vender equipo</b> <small class="mut">te pagan el 30% de su valor · ${inv.length}/${INV_MAX} en el inventario</small></span><button class="btn sm" data-a="togsell">${VSELL ? 'Ocultar' : 'Ver inventario'}</button></div>
    ${VSELL ? (inv.length ? inv.map((it, i) => `<div class="shop"><span class="ishop">${itemLabel(it)}<small style="color:${RAR[it.r].c}">${RAR[it.r].n} · Nv ${it.ilvl}</small></span><button class="btn sm" data-a="selleq" data-k="${i}">Vender · ${sellPrice(it)} oro</button></div>`).join('')
      : '<p class="mut small" style="margin:6px 0 0">No tienes equipo guardado. Lo que llevan puesto los héroes no se vende desde aquí.</p>') : ''}
  </div>
  ${boardHTML(f)}${dockHTML(f)}${portalHTML(f)}
  <div class="sec"><h3>⚒️ Herrería</h3>
    <div class="shop"><span>🗡️ <b>Afilar armas</b> <small class="mut">+2 de Ataque a todos (nivel actual ${G.upA})</small></span><button class="btn sm" data-a="upA" ${G.gold < upCost(G.upA) ? 'disabled' : ''}>${upCost(G.upA)} oro</button></div>
    <div class="shop"><span>🛡️ <b>Reforzar armaduras</b> <small class="mut">+2 de Defensa a todos (nivel actual ${G.upD})</small></span><button class="btn sm" data-a="upD" ${G.gold < upCost(G.upD) ? 'disabled' : ''}>${upCost(G.upD)} oro</button></div></div>
  <div class="sec"><h3>🍺 Taberna</h3><p class="mut" style="margin:0 0 8px;font-size:13px">Toca para sumar o sacar héroes del grupo (máximo 3). Los que esperan aquí ganan el 10% de la experiencia.</p>
    <div class="tav">${G.roster.map((h, i) => `<button class="tavh ${G.party.includes(i) ? 'on' : ''}" data-a="tog" data-k="${i}"><span class="emoji">${h.e}</span><b>${h.name}</b><small>${CL[h.cls].n} · Nv ${h.lvl}</small><small>${G.party.includes(i) ? '✅ En el grupo' : 'Esperando'}</small></button>`).join('')}</div></div>
  <div class="row end"><button class="btn" data-a="close">Salir de la aldea</button></div>`;
}
function villageAct(a, k) {
  VMSG = '';
  if (a === 'close') { closeModal(); return; }
  if (a === 'rest') { const c = restCost(); if (G.gold < c) return; G.gold -= c; for (const h of G.roster) { h.hp = S(h, 'mhp'); h.mp = S(h, 'mmp'); h.poison = 0; } G.lastVillage = { x: VF.x, y: VF.y }; save('now'); VMSG = '😴 El grupo descansó. ¡Todos recuperados! Partida guardada.'; }
  if (a === 'buy') { if (G.gold >= IT[k].p) { G.gold -= IT[k].p; G.items[k]++; save('now'); } }
  if (a === 'upA' || a === 'upD') { const key = a === 'upA' ? 'upA' : 'upD', c = upCost(G[key]); if (G.gold >= c) { G.gold -= c; G[key]++; save('now'); VMSG = a === 'upA' ? '🗡️ ¡Armas afiladas!' : '🛡️ ¡Armaduras reforzadas!'; } }
  if (a === 'buyeq') {
    const s = shopStock(VF, zoneLvl(VF))[+k];
    if (s && !s.sold && G.gold >= buyPrice(s.it)) {
      if (addItem(s.it)) { G.gold -= buyPrice(s.it); markBought(VF, +k); save('now'); VMSG = `Compraste ${itemLabel(s.it)}. Equípalo en 🎒 Grupo → Equipo.`; }
      else VMSG = '🎒 Tu inventario está lleno (40). Vende algo primero.';
    }
  }
  if (a === 'togsell') VSELL = !VSELL;
  // ---- Misiones, bote y portal (fase C) ----
  if (a === 'qacc') {
    const q = boardQuest(VF, +k);
    if (q && accept(q)) { save('now'); VMSG = `📜 Aceptaste: <b>${q.title}</b>. La flecha morada te guía.`; }
    else if (active().length >= MAX_ACTIVE) VMSG = `Ya tienes ${MAX_ACTIVE} misiones activas. Abandona o termina una primero.`;
  }
  if (a === 'boat' && !G.boat && G.gold >= BOAT_PRICE) { G.gold -= BOAT_PRICE; G.boat = true; save('now'); VMSG = '⛵ ¡Compraste un bote! Ahora puedes navegar por el mar (las montañas siguen bloqueadas).'; }
  if (a === 'travel') {
    const v = G.vv[k], cost = travelCost();
    if (v && G.gold >= cost) { G.gold -= cost; closeModal(); travelTo(v); return; }
  }
  if (a === 'selleq') { const it = G.inventory[+k]; if (it) { G.inventory.splice(+k, 1); G.gold += sellPrice(it); save('now'); VMSG = `Vendiste ${itemLabel(it)} por ${sellPrice(it)} de oro.`; } }
  if (a === 'tog') {
    const i = +k, ix = G.party.indexOf(i);
    if (ix >= 0) { if (G.party.length > 1) G.party.splice(ix, 1); else VMSG = 'Necesitas al menos un héroe en el grupo.'; }
    else { if (G.party.length < 3) G.party.push(i); else VMSG = 'El grupo ya tiene 3 héroes. Saca a alguien primero.'; }
    if (!G.party.includes(G.leader)) G.leader = G.party[0];
  }
  rerender();
}
export function openVillage(f) {
  VF = f; VMSG = ''; VSELL = false; G.lastVillage = G.lastVillage || { x: f.x, y: f.y };
  G.vv = G.vv || {}; if (!G.vv[f.id]) G.vv[f.id] = { x: f.x, y: f.y, name: f.name };   // aldea descubierta (portales)
  openModal(villageRender, villageAct);
}

// ---- Tablón de misiones ----
function boardHTML(f) {
  const n = active().length;
  let rows = '';
  for (let s = 0; s < SLOTS_PER_BOARD; s++) {
    const q = boardQuest(f, s); if (!q) continue;
    const on = isActive(q.id);
    rows += `<div class="qrow"><div class="qi">${QICON[q.type]}</div><div class="qt"><b>${q.title}</b><small class="mut">${QNAME[q.type]} · Nv ${q.lvl} · ${q.desc}</small><small class="goldt">${rewardText(q.reward)}</small></div>
      ${on ? '<span class="qon">✅ En curso</span>' : `<button class="btn sm" data-a="qacc" data-k="${s}" ${n >= MAX_ACTIVE ? 'disabled' : ''}>Aceptar</button>`}</div>`;
  }
  return `<div class="sec"><h3>📜 Tablón de misiones <small class="mut">${n}/${MAX_ACTIVE} activas</small></h3>${rows}</div>`;
}
// ---- Muelle (solo aldeas costeras) ----
function dockHTML(f) {
  if (!isCoastal(f)) return '';
  return `<div class="sec"><h3>⛵ Muelle</h3><div class="shop"><span>${G.boat ? 'Ya tienes bote: camina hacia el mar para navegar.' : `<b>Bote</b> <small class="mut">navega por el mar (con encuentros marinos). Se pierde si cae todo el grupo.</small>`}</span>${G.boat ? '<span class="qon">✅ Tuyo</span>' : `<button class="btn sm" data-a="boat" ${G.gold < BOAT_PRICE ? 'disabled' : ''}>Comprar · ${BOAT_PRICE} oro</button>`}</div></div>`;
}
// ---- Portal: viajar a otra aldea ya visitada ----
const travelCost = () => Math.round(5 * avgLvl());
function portalHTML(f) {
  const list = Object.entries(G.vv || {}).filter(([id]) => id !== f.id).map(([id, v]) => ({ id, v, d: Math.round(Math.hypot(v.x - f.x, v.y - f.y)) })).sort((a, b) => a.d - b.d);
  const cost = travelCost();
  return `<div class="sec"><h3>🌀 Portal <small class="mut">viaja a una aldea que ya visitaste · ${cost} oro</small></h3>
    ${list.length ? list.map(({ id, v, d }) => `<div class="shop"><span>🏘️ <b>${v.name}</b> <small class="mut">${d} casillas al ${compass(v.x - f.x, v.y - f.y)}</small></span><button class="btn sm" data-a="travel" data-k="${id}" ${G.gold < cost ? 'disabled' : ''}>Viajar</button></div>`).join('')
      : '<p class="mut small" style="margin:0">Visita otras aldeas para poder viajar entre ellas.</p>'}</div>`;
}
function travelTo(v) {
  P.x = P.px = v.x; P.y = P.py = v.y; spawnNearby(); visitAround(); save('now');
  toast(`🌀 Llegaste a ${v.name}`);
  const f = feats.get(v.x + ',' + v.y); if (f) setTimeout(() => openVillage(f), 350);
}

// ================= Grupo (pestañas: Héroes · Equipo · Objetos) =================
let PA = null, NGC = false, PT = 'heroes', PH = null, PI = null, PF = false;
// Puntaje aproximado de un objeto (para la flechita ▲▼ de la lista)
const score = it => Object.entries(it.st).reduce((a, [k, v]) => a + v * (k === 'mhp' ? 1 / 3 : k === 'mmp' ? .5 : ['crit', 'ls', 'pres'].includes(k) ? .4 : 1), 0);
function pendHTML() {
  if (!PA) return '';
  const cands = PA.t === 'dead' ? heroes().filter(x => x.hp <= 0) : PA.t === 'ally' ? alive(heroes()) : [];
  return `<div class="pend">Elige el objetivo de <b>${PA.label}</b>: ${cands.length ? cands.map(c => `<button class="btn sm" data-a="tgt" data-k="${G.roster.indexOf(c)}">${c.e} ${c.name} (${c.hp}/${S(c, 'mhp')})</button>`).join(' ') : '<span class="mut">no hay objetivos válidos</span>'} <button class="btn sm" data-a="cancel">Cancelar</button></div>`;
}
const eqLine = x => `<div class="eqline">${SLOT_KEYS.map(sl => { const it = x.equip && x.equip[sl]; return it ? `<span class="emoji" title="${it.n}" style="border-color:${RAR[it.r].c}">${TYPES[it.t].e}</span>` : `<span class="emoji empty" title="${SLOTS[sl].n} vacía">${SLOTS[sl].i}</span>`; }).join('')}</div>`;
function heroesTab() {
  let h = pendHTML() + '<div class="hgrid">' + heroes().map(x => {
    const i = G.roster.indexOf(x), mh = S(x, 'mhp'), mm = S(x, 'mmp');
    return `<div class="pc ${x.hp <= 0 ? 'dead' : ''}"><div class="hd"><span class="emoji">${x.e}</span><div style="flex:1"><b>${x.name}</b> ${G.leader === i ? '<span class="goldt">★ Líder</span>' : ''}<div class="mut" style="font-size:12px">${CL[x.cls].n} · Nivel ${x.lvl}${x.hp <= 0 ? ' · <span style="color:#ff6b6b">Caído</span>' : ''}</div></div>${G.leader !== i ? `<button class="btn sm" data-a="leader" data-k="${i}">Líder</button>` : ''}</div>
    ${eqLine(x)}
    <div style="font-size:11px;margin-top:6px" class="mut">PV ${x.hp}/${mh}</div><div class="bar"><i style="width:${100 * x.hp / mh}%"></i></div>
    <div style="font-size:11px;margin-top:3px" class="mut">PM ${x.mp}/${mm}</div><div class="bar mp"><i style="width:${100 * x.mp / mm}%"></i></div>
    <div style="font-size:11px;margin-top:3px" class="mut">XP ${x.xp}/${need(x.lvl)}</div><div class="bar xp"><i style="width:${100 * x.xp / need(x.lvl)}%"></i></div>
    <div class="stats"><div>ATQ<b>${S(x, 'atk')}</b></div><div>DEF<b>${S(x, 'def')}</b></div><div>MAG<b>${S(x, 'mag')}</b></div><div>VEL<b>${S(x, 'spd')}</b></div></div>
    <div class="skl">${CL[x.cls].sk.map(k => { const s = SK[k], c = skillCost(x, k); return s.lv <= x.lvl ? `✨ <b>${s.n}</b> <span class="mut">${c} PM</span>${s.field && x.hp > 0 ? ` <button class="btn sm" data-a="fskill" data-k="${i}:${k}" ${x.mp < c ? 'disabled' : ''}>Usar</button>` : ''}` : `<span class="no">🔒 ${s.n} (Nv ${s.lv})</span>`; }).join('<br>')}</div></div>`;
  }).join('') + '</div>';
  const res = G.roster.filter((_, i) => !G.party.includes(i));
  if (res.length) h += `<h3>Esperando en la taberna</h3><p class="mut" style="font-size:13px;margin:0">${res.map(x => `${x.e} ${x.name} (${CL[x.cls].n}, Nv ${x.lvl})`).join(' · ')}<br>Cámbialos en la taberna de cualquier aldea.</p>`;
  return h;
}
function itemsTab() {
  return pendHTML() + `<div class="sec">${Object.keys(IT).map(k => `<div class="shop"><span><span class="emoji">${IT[k].e}</span> <b>${IT[k].n}</b> ×${G.items[k]} <small class="mut">${IT[k].d}</small></span><button class="btn sm" data-a="item" data-k="${k}" ${G.items[k] ? '' : 'disabled'}>Usar</button></div>`).join('')}</div>`;
}
function detailHTML(sel) {
  const it = PI.src === 'inv' ? G.inventory[PI.i] : sel.equip[PI.slot];
  if (!it) { PI = null; return ''; }
  const T = TYPES[it.t], R = RAR[it.r], inv = PI.src === 'inv', cur = inv ? sel.equip[T.slot] : null, ok = canUse(sel, it);
  const rows = compare(it, cur).map(({ k, v, d }) => `<div class="cmp"><span>${STAT[k]}</span><b>${v}</b>${inv ? `<em class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' + d : d < 0 ? d : '='}</em>` : ''}</div>`).join('');
  return `<div class="isheet" style="border-color:${R.c}">
    <div class="ishead">${itemLabel(it)}<button class="btn sm" data-a="iclose" aria-label="Cerrar">✕</button></div>
    <div class="mut small">${R.n} · Nv ${it.ilvl} · ${SLOTS[T.slot].n} · ${classesText(it)}</div>
    ${it.fx ? `<div class="ifx">✨ ${LEGENDS[it.fx].d}</div>` : ''}
    ${inv ? `<div class="mut small" style="margin-top:6px">${cur ? `Comparado con lo que lleva ${sel.name}: <span style="color:${RAR[cur.r].c}">${cur.n}</span>` : `${sel.name} no lleva nada en esta ranura.`}</div>` : ''}
    <div class="cmpg">${rows}</div>
    ${!ok ? `<div class="warnline">${sel.name} (${CL[sel.cls].n}) no puede usar este objeto.</div>` : ''}
    <div class="ibtns">${inv
      ? `<button class="btn gold" data-a="equip" ${ok ? '' : 'disabled'}>Equipar a ${sel.name}</button>${inVillage() ? `<button class="btn" data-a="sell">Vender · ${sellPrice(it)} oro</button>` : `<button class="btn" data-a="drop">${PI.drop ? '⚠️ ¿Tirar? Toca otra vez' : 'Tirar'}</button>`}`
      : `<button class="btn" data-a="unequip" ${G.inventory.length >= INV_MAX ? 'disabled' : ''}>Quitar y guardar</button>`}</div>
  </div>`;
}
function equipTab() {
  if (PH == null || !G.roster[PH]) PH = G.party[0];
  const sel = G.roster[PH], order = [...G.party, ...G.roster.map((_, i) => i).filter(i => !G.party.includes(i))];
  const list = G.inventory.map((it, i) => ({ it, i })).reverse().filter(x => !PF || canUse(sel, x.it));
  let h = `<div class="hchips">${order.map(i => { const x = G.roster[i]; return `<button class="hchip ${i === PH ? 'on' : ''}" data-a="hsel" data-k="${i}"><span class="emoji">${x.e}</span> ${x.name}${G.party.includes(i) ? '' : ' 🍺'}</button>`; }).join('')}</div>
  <div class="slots">${SLOT_KEYS.map(sl => { const it = sel.equip[sl]; return `<button class="slot ${PI && PI.src === 'eq' && PI.slot === sl ? 'on' : ''}" data-a="esel" data-k="${sl}" ${it ? `style="border-color:${RAR[it.r].c}"` : 'disabled'}><small class="mut">${SLOTS[sl].i} ${SLOTS[sl].n}</small>${it ? `<span class="sn">${itemLabel(it)}</span>` : '<span class="mut">— vacío —</span>'}</button>`; }).join('')}</div>
  <div class="stats six"><div>PV<b>${S(sel, 'mhp')}</b></div><div>PM<b>${S(sel, 'mmp')}</b></div><div>ATQ<b>${S(sel, 'atk')}</b></div><div>DEF<b>${S(sel, 'def')}</b></div><div>MAG<b>${S(sel, 'mag')}</b></div><div>VEL<b>${S(sel, 'spd')}</b></div></div>
  <div class="invhead"><b>Inventario del grupo</b> <span class="mut small">${G.inventory.length}/${INV_MAX}</span><button class="btn sm" data-a="pf">${PF ? '✅ Solo para ' + sel.name : 'Mostrar todo'}</button></div>`;
  h += list.length ? `<div class="ilist">${list.map(({ it, i }) => {
    const cur = sel.equip[slotOf(it)], ok = canUse(sel, it), d = score(it) - (cur ? score(cur) : 0);
    const badge = !ok ? '<span class="ib no" title="No lo puede usar">✖</span>' : d > 0 ? '<span class="ib up" title="Mejor que lo equipado">▲</span>' : d < 0 ? '<span class="ib down" title="Peor que lo equipado">▼</span>' : '<span class="ib">=</span>';
    return `<button class="irow ${PI && PI.src === 'inv' && PI.i === i ? 'on' : ''}" data-a="isel" data-k="${i}" style="border-left-color:${RAR[it.r].c}"><span class="in">${itemLabel(it)}<small class="mut">${RAR[it.r].n} · Nv ${it.ilvl} · ${statList(it.st).slice(0, 2).join(' · ')}</small></span>${badge}</button>`;
  }).join('')}</div>`
    : `<p class="mut small">${G.inventory.length ? 'Nada de esto lo puede usar ' + sel.name + '.' : 'Aún no tienes equipo. Cae de los monstruos (15%), de los jefes (siempre) y de los cofres (50%), y se compra en la armería de las aldeas.'}</p>`;
  if (PI) h += detailHTML(sel);
  return h;
}
// ---- Registro de misiones ----
let QD = null;   // misión a la que se tocó "Abandonar" una vez (pide confirmación)
function questsTab() {
  const list = active();
  if (!list.length) return `<p class="mut small" style="margin-top:10px">No tienes misiones. Acepta hasta ${MAX_ACTIVE} en el 📜 tablón de cualquier aldea.</p>`;
  return `<div class="qlog">${list.map(q => { const on = G.qtrack === q.id; return `<div class="qcard ${on ? 'on' : ''}">
    <div class="qhead"><span class="qi">${QICON[q.type]}</span><div class="qt"><b>${q.title}</b><small class="mut">${QNAME[q.type]} · de ${q.from.name} · Nv ${q.lvl}</small></div><span class="qprog">${progressText(q)}</span></div>
    <small class="goldt">${rewardText(q.reward)}</small>
    <div class="qbtns"><button class="btn sm ${on ? 'gold' : ''}" data-a="qtrack" data-k="${q.id}" ${on ? 'disabled' : ''}>${on ? '🎯 Siguiendo' : '🎯 Seguir'}</button><button class="btn sm" data-a="qdrop" data-k="${q.id}">${QD === q.id ? '⚠️ ¿Abandonar? Toca otra vez' : 'Abandonar'}</button></div></div>`; }).join('')}</div>
  <p class="mut small">La misión que sigues aparece en la esquina superior derecha y con una flecha morada 📜 en el borde de la pantalla.</p>`;
}
function partyRender() {
  const tabs = [['heroes', '🧑 Héroes'], ['equip', `⚔️ Equipo <small>${G.inventory.length}</small>`], ['items', '🧪 Objetos'], ['quests', `📜 Misiones <small>${active().length}</small>`]];
  let h = `<h2>🎒 Grupo</h2><p class="mut" style="margin:0">💰 ${G.gold} de oro · Ataque +${G.upA * 2} y Defensa +${G.upD * 2} por la herrería</p>
  <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${PT === k ? 'on' : ''}" data-a="tab" data-k="${k}">${l}</button>`).join('')}</div>`;
  h += PT === 'equip' ? equipTab() : PT === 'items' ? itemsTab() : PT === 'quests' ? questsTab() : heroesTab();
  if (NGC) h += dangerBox('Nueva partida', 'data-a="newgame2"', 'data-a="ngcancel"');
  h += `<div class="row end"><button class="btn" data-a="exit">🚪 Salir al inicio</button>${NGC ? '' : '<button class="btn" data-a="newgame">Nueva partida</button>'}<button class="btn gold" data-a="close">Cerrar</button></div>`;
  return h;
}
async function partyAct(a, k) {
  if (a !== 'newgame' && a !== 'newgame2') NGC = false;
  if (a === 'close') { PA = null; PI = null; closeModal(); return; }
  if (a === 'exit') { PA = null; PI = null; closeModal(); if (hooks.onExit) hooks.onExit(); return; }
  // Nueva partida: primero se muestra el aviso; solo se borra si se escribió CONFIRMAR
  if (a === 'newgame') { NGC = true; rerender(); const i = $('#cfIn'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } return; }
  if (a === 'newgame2') {
    if (!confirmOk($('#cfIn') && $('#cfIn').value)) return;
    NGC = false; closeModal(); if (hooks.onNewGame) hooks.onNewGame(); return;
  }
  if (a === 'tab') { PT = k; PI = null; PA = null; QD = null; }
  if (a === 'qtrack') track(k);
  if (a === 'qdrop') { if (QD !== k) QD = k; else { abandon(k); QD = null; save(); } }
  if (a === 'cancel') PA = null;
  if (a === 'ngcancel') NGC = false;
  if (a === 'leader') G.leader = +k;
  if (a === 'fskill') {
    const [ci, sk] = k.split(':'); const c = G.roster[+ci], s = SK[sk];
    if (s.t === 'allies') { c.mp -= skillCost(c, sk); await runSkill(sk, c, alive(heroes())); PA = null; } else PA = { kind: 'skill', caster: c, sk, t: s.t, label: s.n };
  }
  if (a === 'item') { PA = { kind: 'item', k, t: IT[k].t, label: IT[k].n }; }
  if (a === 'tgt' && PA) {
    const t = G.roster[+k];
    if (PA.kind === 'skill') { const c = skillCost(PA.caster, PA.sk); if (PA.caster.mp >= c) { PA.caster.mp -= c; await runSkill(PA.sk, PA.caster, [t]); } }
    else if (G.items[PA.k] > 0) useItem(PA.k, t);
    PA = null;
  }
  // ---- Equipo ----
  const sel = G.roster[PH];
  if (a === 'hsel') { PH = +k; PI = null; }
  if (a === 'isel') PI = { src: 'inv', i: +k };
  if (a === 'esel') PI = { src: 'eq', slot: k };
  if (a === 'iclose') PI = null;
  if (a === 'pf') PF = !PF;
  if (a === 'equip' && PI && PI.src === 'inv' && sel) {
    const it = G.inventory[PI.i];
    if (it && canUse(sel, it)) {
      const sl = slotOf(it), prev = sel.equip[sl];
      changeEquip(sel, () => { G.inventory.splice(PI.i, 1); sel.equip[sl] = it; if (prev) G.inventory.push(prev); });
      PI = { src: 'eq', slot: sl }; save();
    }
  }
  if (a === 'unequip' && PI && PI.src === 'eq' && sel) {
    const it = sel.equip[PI.slot];
    if (it && G.inventory.length < INV_MAX) { const sl = PI.slot; changeEquip(sel, () => { delete sel.equip[sl]; G.inventory.push(it); }); PI = null; save(); }
  }
  if (a === 'sell' && PI && PI.src === 'inv' && inVillage()) {
    const it = G.inventory[PI.i]; if (it) { G.inventory.splice(PI.i, 1); G.gold += sellPrice(it); PI = null; save('now'); toast(`💰 +${sellPrice(it)} de oro`); }
  }
  if (a === 'drop' && PI && PI.src === 'inv') { if (!PI.drop) PI.drop = true; else { G.inventory.splice(PI.i, 1); PI = null; save(); } }
  if (MR === partyRender) rerender();
}
export function openParty(tab) { PA = null; NGC = false; PI = null; if (tab) PT = tab; openModal(partyRender, partyAct); }

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
  <canvas id="mm"></canvas><div class="legend"><span class="sq" style="background:#fff"></span>Tú<span class="sq" style="background:#7fe0ff"></span>Amigos<span class="sq" style="background:#ff5fa2"></span>Marcas<span class="sq" style="background:#c084fc"></span>Misión<span class="sq" style="background:#f2c14e"></span>Aldea<span class="sq" style="background:#ff3b3b"></span>Jefe<span class="sq" style="background:#c27bff"></span>Santuario</div>
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
  const tq = tracked(); if (tq && tq.target) edge(tq.target.x, tq.target.y, '#c084fc', 2);
  for (const o of net.others.values()) if (o.status && o.status !== 'lobby' && o.status !== 'away') edge(o.x, o.y, '#7fe0ff', 2);
  g.fillStyle = '#000'; g.fillRect(R - 2, R - 2, 5, 5); g.fillStyle = '#fff'; g.fillRect(R - 1, R - 1, 3, 3);
}
export function openMap() { openModal(mapRender, a => { if (a === 'close') closeModal(); }, drawMinimap); }

// ================= Confirmación para borrar la partida =================
// Para evitar perder todo por un toque accidental, hay que escribir la palabra CONFIRMAR.
export const CONFIRM_WORD = 'CONFIRMAR';
export const confirmOk = v => String(v || '').trim().toUpperCase() === CONFIRM_WORD;
// go / cancel: atributos de los botones (data-a="…" en la ventana del grupo, id="…" en la pantalla de héroes)
export function dangerBox(title, go, cancel) {
  return `<div class="danger">
    <b>⚠️ ${title}</b>
    <p>Se borra la partida guardada${net.db ? ' (también en el servidor)' : ''}: héroes y niveles, oro, objetos, equipo, misiones y bote. <b>No se puede deshacer.</b></p>
    <label for="cfIn">Para continuar, escribe <b>${CONFIRM_WORD}</b>:</label>
    <input id="cfIn" class="cfin" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="escribe aquí">
    <div class="cfbtns"><button class="btn" ${cancel}>Cancelar</button><button class="btn dangerbtn" data-cf="go" ${go} disabled>Borrar y empezar de nuevo</button></div>
  </div>`;
}

// ================= Inicialización de eventos de la interfaz =================
export function initUI(h) {
  Object.assign(hooks, h);
  // El botón de borrar solo se activa cuando la palabra está bien escrita
  document.addEventListener('input', e => {
    if (e.target.id !== 'cfIn') return;
    const go = e.target.closest('.danger').querySelector('[data-cf=go]'); if (go) go.disabled = !confirmOk(e.target.value);
  });
  document.addEventListener('keydown', e => {
    if (e.target.id !== 'cfIn' || e.key !== 'Enter') return;
    const go = e.target.closest('.danger').querySelector('[data-cf=go]'); if (go && !go.disabled) go.click();
  });
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
  $('#bSave').onclick = () => { toast(save('now') ? '💾 Partida guardada' : '⚠️ No se pudo guardar en este navegador'); };
}
