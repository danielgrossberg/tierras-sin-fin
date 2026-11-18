// Interfaz: HUD, toasts, avisos online, modales (aldea, grupo, mapa) y panel de la sala.
'use strict';
import { $, esc, dirArrow, cardinal, cardinalWord, zoneOf } from './util.js';
import { B, CL, SK, IT, EN, CH, RGB, BLOCKO, QUICK, BOAT_PRICE } from './data.js';
import { G, P, START, st, held, S, heroes, alive, need, avgLvl, leader, changeEquip, talList, pendingTal, pendingAdv, hasPending, clsName, talSk, talFx } from './state.js';
import { ADV, ADV_LVL, TAL, TAL_LVLS, advOf, PETS, EGG_PRICE, EGG_STEPS, PET_MAX } from './data.js';
import { activePet, petLabel, petEffect, petNeed, addEgg } from './pets.js';
import { isNight, clockText, darkness } from './daynight.js';
import { achTabHTML, loadRank, setTitle, achCount } from './achievements.js';
import { challenge, coopBusy } from './coop.js';
import { wbAlive, wbPos, wbWhere } from './worldboss.js';
import { elixRows, forgeHTML, merchHTML, trainerHTML, cityBtnsHTML, cityHTML, cosHTML, shopAct, craftHTML } from './shopui.js';
import { MATS, PROFS, FOODS, NODES } from './data.js';
import { prof, profNeed, foodActive } from './gather.js';
import { cityLvl, giveElix, activeElix, elixLeft } from './economy.js';
import { ELIX } from './data.js';
import { feats, monsters, getChunk, tileAt, dangerAt, ckey, inVillage, isCoastal, spawnNearby, visitAround, nearestVillage as nearestV } from './world.js';
import { boardQuest, accept, abandon, track, tracked, active, isActive, progressText, rewardText, compass, MAX_ACTIVE, SLOTS_PER_BOARD, QICON, QNAME } from './quests.js';
import { runSkill, useItem, skillCost } from './battle.js';
import { statsOf } from './items.js';
import { INV_MAX, SLOTS, SLOT_KEYS, TYPES, RAR, STAT, LEGENDS, slotOf, canUse, sellPrice, buyPrice, statList, classesText, itemLabel, compare, addItem, shopStock, markBought } from './items.js';
import { save } from './storage.js';
import { tombMinutes } from './tomb.js';
import { paintMap, relCoords } from './minimap.js';
import { askHelp, canAskHelp } from './coop.js';
import { net, mateColor } from './net.js';
import { initChat, toggleSocial, closeSocial, refreshSocial } from './chat.js';
import { VIS, cycleVis, visMode } from './prefs.js';
import { estimate, itemTargets, heroCardHTML } from './estimate.js';
export { toggleSocial, closeSocial };
import { D, inDungeon } from './dungeon.js';

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
  $('#hudHeroes').innerHTML = heroes().map(h => { const mh = S(h, 'mhp'), mm = S(h, 'mmp'); return `<div class="mini ${h.hp <= 0 ? 'dead' : ''}"><span class="em emoji">${h.e}</span><div style="flex:1;min-width:0"><div class="nm">${h.name} <span class="mut">Nv ${h.lvl}</span> ${h.poison > 0 ? '☠️' : ''}</div><div class="bar"><i style="width:${100 * h.hp / mh}%"></i></div><div class="bar mp"><i style="width:${100 * h.mp / mm}%"></i></div></div></div>`; }).join('');
  const b = tileAt(P.x, P.y).b;
  const n = [...net.others.values()].filter(o => o.online !== false).length;
  const where = inDungeon() ? `🕳️ ${esc(D.cave.name)} · piso ${D.f + 1}/${D.cave.floors} · Nv ~${D.cave.lvl + D.f}` : `${B[b].i} ${B[b].n} · Peligro Nv ~${dangerAt(P.x, P.y)}`;
  $('#info').innerHTML = `<b>💰 ${G.gold}</b> · 🧪 ${G.items.pocion} · 🔷 ${G.items.eter} · 🪶 ${G.items.pluma}<br>${where}<br><span title="${connText()}">${connIcon()} ${esc(st.room)}${st.online ? ` · 👥${n + 1}` : ''}</span>`
    + (tracked() ? `<div class="qline">${QICON[tracked().type]} ${tracked().title} · <b>${progressText(tracked())}</b></div>` : '');
  // 🎒 con aviso si algún héroe del grupo tiene un talento o una clase avanzada por elegir
  const pb = $('#partyBadge'); if (pb) pb.classList.toggle('hidden', !heroes().some(hasPending));
  updateCoords();
}

// ================= Día y noche (Versión 3 · Fase 3): ☀️/🌙 y tiempo para el cambio =================
export function updateDayNight() {
  const el = $('#dn'); if (!el) return;
  if (!st.inGame || inDungeon()) { el.classList.add('hidden'); const ex = $('#elix'); if (ex && !st.inGame) ex.classList.add('hidden'); if (st.inGame) { const list = activeElix(); if (ex) { ex.innerHTML = list.map(k => `<span class="ech">${k === 'descanso' ? '😊' : ELIX[k].e} ${Math.ceil(elixLeft(k) / 60000)}′</span>`).join(''); ex.classList.toggle('hidden', !list.length); } } return; }   // en las mazmorras no hay día ni noche
  const n = isNight(), d = darkness();
  el.classList.remove('hidden'); el.classList.toggle('night', n);
  el.textContent = `${n ? '🌙' : d > 0 ? '🌇' : '☀️'} ${clockText()}`;
  el.title = n ? 'Noche: tiempo para el amanecer' : 'Día: tiempo para la noche';
  const ex = $('#elix'); if (ex) { const list = activeElix(), fd = foodActive(); ex.innerHTML = list.map(k => { const ms = elixLeft(k), sc = Math.ceil(ms / 1000); return `<span class="ech" title="${k === 'descanso' ? 'Bien descansados' : ELIX[k].n}">${k === 'descanso' ? '😊' : ELIX[k].e} ${Math.floor(sc / 60)}:${String(sc % 60).padStart(2, '0')}</span>`; }).join('') + (fd ? `<span class="ech" title="${FOODS[fd.k].n}">${FOODS[fd.k].e} ${Math.ceil((fd.until - Date.now()) / 60000)}′</span>` : ''); ex.classList.toggle('hidden', !list.length && !fd); }
}

// ================= Coordenadas (relativas a Ciudad Origen; este = X+, norte = Y+) =================
// En el celular la tarjeta parte plegada (una línea); al tocarla se despliega. Se recuerda por navegador.
let coordsOpen = null;
function coordsPref() {
  if (coordsOpen !== null) return coordsOpen;
  try { const v = localStorage.getItem('tsf-coords'); if (v === '1' || v === '0') return (coordsOpen = v === '1'); } catch (e) { /* nada */ }
  return (coordsOpen = !matchMedia('(max-width: 640px), (pointer: coarse)').matches);
}
export function toggleCoords() { coordsOpen = !coordsPref(); try { localStorage.setItem('tsf-coords', coordsOpen ? '1' : '0'); } catch (e) { /* nada */ } updateCoords(); }
const rel = (x, y) => `${x - START.x}, ${START.y - y}`;
// "36 casillas al NO" desde mi posición, con norte = arriba en la pantalla
function towards(x, y) {
  const dx = x - P.x, dn = P.y - y, d = Math.round(Math.hypot(dx, dn));
  return d ? `${d} casilla${d === 1 ? '' : 's'} al ${cardinal(dx, dn)}` : 'aquí';
}
const nearestVillage = () => nearestV(P.x, P.y);
const MATE_ST = { lobby: 'eligiendo héroes', away: 'fuera de línea' };
export function updateCoords() {
  const el = $('#coords'); if (!el || !st.inGame) return;
  const open = coordsPref();
  let h = inDungeon()
    ? `<div class="cbar"><span>🕳️ <b>Piso ${D.f + 1}/${D.cave.floors}</b>${G.tomb && !open ? ` · <span class="ctomb">🪦 ${tombMinutes()} min</span>` : ''}</span><span class="ctog">${open ? '▴' : '▾'}</span></div>`
    : `<div class="cbar"><span>📍 <b>Tú:</b> ${rel(P.x, P.y)}${G.tomb && !open ? ` · <span class="ctomb">🪦 ${tombMinutes()} min</span>` : ''}</span><span class="ctog">${open ? '▴' : '▾'}</span></div>`;
  if (open && inDungeon()) h += `<div class="crow">🕳️ <b>${esc(D.cave.name)}</b> · entrada en ${rel(P.x, P.y)}</div>`;
  if (open) {
    const v = nearestVillage();
    if (G.tomb) h += `<div class="crow ctomb">🪦 <b>Tus objetos:</b> ${rel(G.tomb.x, G.tomb.y)} · ${towards(G.tomb.x, G.tomb.y)} · ${tombMinutes()} min</div>`;
    h += `<div class="crow">🏰 <b>Ciudad Origen:</b> 0, 0 · ${towards(START.x, START.y)}</div>`;
    if (wbAlive()) { const w = net.wb, q = wbPos(); if (q) h += `<div class="crow cwb">🌋 <b>Titán de Lava:</b> ${Math.round(100 * w.hp / w.mhp)}% · ${rel(q.x, q.y)} · ${towards(q.x, q.y)}</div>`; }
    h += `<div class="crow">🏘️ ${v ? `<b>${esc(v.name)}:</b> ${rel(v.x, v.y)} · ${towards(v.x, v.y)}` : '<span class="mut">Aún no hay otras aldeas cerca</span>'}</div>`;
    for (const o of net.others.values()) {
      const col = mateColor(o.name), pos = o.status && !MATE_ST[o.status] && Number.isFinite(o.x);
      h += `<div class="crow"><i class="cdot" style="background:${col}"></i><b>${esc(o.name)}:</b> ${pos ? `${rel(o.x, o.y)} · ${towards(o.x, o.y)}${o.online === false ? ' · 📴' : ''}` : `<span class="mut">${MATE_ST[o.status] || 'sin posición'}</span>`}</div>`;
    }
  }
  el.innerHTML = h; el.classList.toggle('open', open);
}

// ================= Lista de jugadores de la sala =================
const STATUS = { battle: '⚔️ en combate', village: '🏘️ en aldea', map: '🧭 explorando', lobby: '⏳ eligiendo héroes', dungeon: '🕳️ en una mazmorra' };
export function playersHTML(onlyOthers) {
  const rows = [];
  if (!onlyOthers && st.inGame) {
    const b = tileAt(P.x, P.y).b;
    rows.push(`<div class="prow me"><span class="emoji pe">${leader().e}</span><div class="pi"><b>${esc(st.name)}</b>${G.title ? ` <span class="ptitle">«${esc(G.title)}»</span>` : ''} <span class="mut">(tú) · Nv ${avgLvl().toFixed(1)}</span><div class="mut ps">${B[b].i} ${B[b].n}</div></div></div>`);
  }
  for (const o of net.others.values()) {
    const away = o.status === 'away', lobby = o.status === 'lobby' || away, off = o.online === false;
    const bi = B[o.biome] || B.GRASS;
    const where = lobby || o.status === 'dungeon' ? '' : `${bi.i} ${bi.n}`;
    const dist = !lobby && st.inGame ? `<span class="pd">${Math.round(Math.hypot(o.x - P.x, o.y - P.y))} c ${dirArrow(o.x - P.x, o.y - P.y)}</span>` : '';
    rows.push(`<div class="prow ${off ? 'off' : ''}"><span class="emoji pe">${away ? '💤' : lobby ? '⏳' : esc(o.leaderEmoji || '🙂')}</span><div class="pi"><b>${esc(o.name)}</b>${o.title ? ` <span class="ptitle">«${esc(o.title)}»</span>` : ''} <span class="mut">${lobby ? '' : '· Nv ' + Number(o.avgLvl || 1).toFixed(1)}</span><div class="mut ps">${away ? '💤 fuera de línea' : off ? '📴 desconectado' : o.vs ? '👑 vs ' + esc(o.vs) : o.status === 'dungeon' && o.dun ? '🕳️ en ' + esc(o.dun) : STATUS[o.status] || ''}${where ? ' · ' + where : ''}</div></div>${dist}</div>`);
  }
  if (!rows.length || (rows.length === 1 && !onlyOthers && st.inGame)) rows.push(`<div class="mut pempty">${st.online ? 'Comparte el código <b>' + esc(st.room) + '</b> para que tu amigo entre.' : 'Modo sin conexión.'}</div>`);
  return rows.join('');
}

// El panel de la sala (💬 Chat / 👥 Sala) vive en chat.js
export function updatePlayersUI() {
  refreshSocial();
  const pl = $('#plist'); if (pl) pl.innerHTML = st.inGame && net.others.size ? playersHTML(true) : '';
  updateHUD();
}

// ================= Modales =================
let MR = null, MH = null, MA = null;
export const isModalOpen = () => !!MR;
export function openModal(render, handler, after) { MR = render; MH = handler; MA = after || null; st.busy = true; held.clear(); closeSocial(); $('#modal').classList.remove('hidden'); rerender(); }
function rerender() { $('#mcontent').innerHTML = MR(); if (MA) MA(); updateHUD(); }
export function closeModal() { $('#modal').classList.add('hidden'); MR = MH = MA = null; st.busy = false; held.clear(); save(); }
export const modalIs = k => (k === 'party' && MR === partyRender) || (k === 'map' && MR === mapRender) || (k === 'village' && MR === villageView);

// ================= Aldea =================
let VF = null, VMSG = '', VSELL = false;
const upCost = n => Math.round(50 * Math.pow(n + 1, 1.5));
function restCost() { return VF.start ? 0 : Math.max(1, Math.round(Math.max(3, Math.round(avgLvl() * 4)) * (1 - .25 * cityLvl('posada')))); }
// Tienda mejorada: descuento y más objetos en la armería
const disc = () => 1 - .1 * cityLvl('tienda'), shopP = n => Math.max(1, Math.round(n * disc()));
const armN = () => [4, 5, 6, 6][cityLvl('tienda')];
const zoneLvl = f => Math.max(1, dangerAt(f.x, f.y));
function villageRender() {
  const f = VF, cost = restCost(), ilvl = zoneLvl(f), stock = shopStock(f, ilvl, armN(), cityLvl('tienda') >= 3), inv = G.inventory, full = inv.length >= INV_MAX;
  return `<h2>🏘️ ${f.name}</h2><p class="mut" style="margin:0">Refugio seguro: los monstruos no entran aquí. Tienes <b class="goldt">💰 ${G.gold}</b> de oro.</p>
  ${VMSG ? `<div class="pend" style="margin-top:10px">${VMSG}</div>` : ''}
  <div class="sec"><h3>🛏️ Posada</h3><div class="shop"><span>Restaura PV y PM, revive a los caídos y guarda la partida.</span><button class="btn gold" data-a="rest" ${G.gold < cost ? 'disabled' : ''}>Descansar (${cost ? cost + ' oro' : 'gratis'})</button></div>
    ${heroes().filter(h => talList(h).length).map(h => { const i = G.roster.indexOf(h), c = talResetCost(h); return `<div class="shop"><span>🔄 <b>Reiniciar talentos</b> de ${h.e} ${h.name} <small class="mut">vuelve a elegirlos en 🎒 Grupo</small></span><button class="btn sm" data-a="talreset" data-k="${i}" ${G.gold < c ? 'disabled' : ''}>${c} oro</button></div>`; }).join('')}</div>
  <div class="sec"><h3>🛒 Tienda</h3>${Object.keys(IT).map(k => `<div class="shop"><span><span class="emoji">${IT[k].e}</span> <b>${IT[k].n}</b> <small class="mut">${IT[k].d}</small></span><span><small class="mut">Tienes ${G.items[k]}</small> <button class="btn sm" data-a="buy" data-k="${k}" ${G.gold < shopP(IT[k].p) ? 'disabled' : ''}>Comprar · ${shopP(IT[k].p)} oro</button></span></div>`).join('')}
    <h3 style="margin-top:10px">⚗️ Alquimista <small class="mut">elixires de 30 minutos; se pueden tener varios a la vez</small></h3>${elixRows()}</div>
  <div class="sec"><h3>⚔️ Armería <small class="mut">equipo común de la zona · Nv ${ilvl}</small></h3>
    ${stock.map(({ it, sold }, i) => `<div class="shop"><span class="ishop">${itemLabel(it)}<small class="mut">${statList(it.st).join(' · ')} · ${classesText(it)}</small></span>${sold ? '<span class="mut small">Vendido</span>' : `<button class="btn sm" data-a="buyeq" data-k="${i}" ${G.gold < shopP(buyPrice(it)) || full ? 'disabled' : ''}>Comprar · ${shopP(buyPrice(it))} oro</button>`}</div>`).join('')}
    <div class="shop"><span>💰 <b>Vender equipo</b> <small class="mut">te pagan el 30% de su valor · ${inv.length}/${INV_MAX} en el inventario</small></span><button class="btn sm" data-a="togsell">${VSELL ? 'Ocultar' : 'Ver inventario'}</button></div>
    ${VSELL ? (inv.length ? inv.map((it, i) => `<div class="shop"><span class="ishop">${itemLabel(it)}<small style="color:${RAR[it.r].c}">${RAR[it.r].n} · Nv ${it.ilvl}</small></span><button class="btn sm" data-a="selleq" data-k="${i}">Vender · ${sellPrice(it)} oro</button></div>`).join('')
      : '<p class="mut small" style="margin:6px 0 0">No tienes equipo guardado. Lo que llevan puesto los héroes no se vende desde aquí.</p>') : ''}
  </div>
  ${merchHTML(f)}<div class="sec"><h3>🛠️ Taller</h3><div class="shop"><span>⚗️ Alquimia · ⚒️ Herrería · 🍳 Cocina <small class="mut">fabrica pociones, elixires, equipo y comidas con tus materiales</small></span><button class="btn sm gold" data-a="craftview">Abrir taller</button></div></div>${boardHTML(f)}${dockHTML(f)}${portalHTML(f)}${stableHTML(f)}${f.start ? cityBtnsHTML() + trainerHTML() : ''}${arenaHTML(f)}
  <div class="sec"><h3>⚒️ Herrería</h3>
    <div class="shop"><span>🗡️ <b>Afilar armas</b> <small class="mut">+2 de Ataque a todos (nivel actual ${G.upA})</small></span><button class="btn sm" data-a="upA" ${G.gold < upCost(G.upA) ? 'disabled' : ''}>${upCost(G.upA)} oro</button></div>
    <div class="shop"><span>🛡️ <b>Reforzar armaduras</b> <small class="mut">+2 de Defensa a todos (nivel actual ${G.upD})</small></span><button class="btn sm" data-a="upD" ${G.gold < upCost(G.upD) ? 'disabled' : ''}>${upCost(G.upD)} oro</button></div>
    <div class="shop"><span>⚒️ <b>Forja</b> <small class="mut">mejora un objeto de +1 a +10, reforja propiedades o desarma lo que no sirve · 🔩 ${G.frags || 0}</small></span><button class="btn sm gold" data-a="forgeview">Abrir forja</button></div></div>
  <div class="sec"><h3>🍺 Taberna</h3><p class="mut" style="margin:0 0 8px;font-size:13px">Toca para sumar o sacar héroes del grupo (máximo 3). Los que esperan aquí ganan el 10% de la experiencia.</p>
    <div class="tav">${G.roster.map((h, i) => `<button class="tavh ${G.party.includes(i) ? 'on' : ''}" data-a="tog" data-k="${i}"><span class="emoji">${h.e}</span><b>${h.name}</b><small>${clsName(h)} · Nv ${h.lvl}${hasPending(h) ? " 🌟" : ""}</small><small>${G.party.includes(i) ? '✅ En el grupo' : 'Esperando'}</small></button>`).join('')}</div></div>
  <div class="row end"><button class="btn" data-a="close">Salir de la aldea</button></div>`;
}
async function villageAct(a, k) {
  VMSG = '';
  if (a === 'close') { closeModal(); return; }
  const sr = await shopAct(a, k);
  if (sr) { if (sr.view) VVIEW = sr.view; if (sr.msg) VMSG = sr.msg; if (sr.save) save('now'); if (MR === villageView) rerender(); if (sr.view) $('#mcontent').scrollTop = 0; return; }
  if (a === 'rest') { const c = restCost(); if (G.gold < c) return; G.gold -= c; for (const h of G.roster) { h.hp = S(h, 'mhp'); h.mp = S(h, 'mmp'); h.poison = 0; } G.lastVillage = { x: VF.x, y: VF.y };
    const pl = cityLvl('posada'); if (pl) { G.restBonus = .1 * pl; giveElix('descanso', 10 * 60 * 1000); }   // Posada mejorada: +10/20/30% de experiencia por 10 min
    save('now'); VMSG = '😴 El grupo descansó. ¡Todos recuperados! Partida guardada.' + (pl ? ` <b class="goldt">😊 Bien descansados: +${10 * pl}% de experiencia por 10 minutos.</b>` : ''); }
  if (a === 'buy') { const c = shopP(IT[k].p); if (G.gold >= c) { G.gold -= c; G.items[k]++; save('now'); } }
  if (a === 'talreset') { const h = G.roster[+k], c = h && talResetCost(h); if (h && G.gold >= c) { G.gold -= c; changeEquip(h, () => { h.tal = {}; }); save('now'); VMSG = `🔄 Talentos de ${h.name} reiniciados. Elígelos de nuevo en 🎒 Grupo → Héroes.`; } }
  if (a === 'upA' || a === 'upD') { const key = a === 'upA' ? 'upA' : 'upD', c = upCost(G[key]); if (G.gold >= c) { G.gold -= c; G[key]++; save('now'); VMSG = a === 'upA' ? '🗡️ ¡Armas afiladas!' : '🛡️ ¡Armaduras reforzadas!'; } }
  if (a === 'buyeq') {
    const s = shopStock(VF, zoneLvl(VF), armN(), cityLvl('tienda') >= 3)[+k];
    if (s && !s.sold && G.gold >= shopP(buyPrice(s.it))) {
      if (addItem(s.it)) { G.gold -= shopP(buyPrice(s.it)); markBought(VF, +k); save('now'); VMSG = `Compraste ${itemLabel(s.it)}. Equípalo en 🎒 Grupo → Equipo.`; }
      else VMSG = '🎒 Tu inventario está lleno (40). Vende algo primero.';
    }
  }
  if (a === 'togsell') VSELL = !VSELL;
  // Mascotas (Versión 3 · Fase 3)
  if (a === 'buyegg' && VF.start && G.gold >= EGG_PRICE) { G.gold -= EGG_PRICE; addEgg('tienda'); save('now'); VMSG = `🥚 Compraste un huevo de mascota. Eclosiona en ${EGG_STEPS} pasos.`; }
  if (a === 'petuse') { const q = (G.pets || []).find(x => x.id === k); if (q) { G.pet = q.id; save('now'); VMSG = `🐾 Ahora te acompaña ${PETS[q.k].e} ${PETS[q.k].n}.`; } }
  if (a === 'duel') { const i = k.indexOf(':'), mode = k.slice(0, i), to = k.slice(i + 1); closeModal(); challenge(to, mode); return; }
  if (a === 'petstay') { G.pet = null; save('now'); VMSG = '🐾 Tu mascota se quedó en el establo.'; }
  // ---- Misiones, bote y portal (fase C) ----
  if (a === 'qacc') {
    const q = boardQuest(VF, +k);
    if (q && accept(q)) { save('now'); VMSG = `📜 Aceptaste: <b>${q.title}</b>. La flecha morada te guía.`; }
    else if (active().length >= MAX_ACTIVE) VMSG = `Ya tienes ${MAX_ACTIVE} misiones activas. Abandona o termina una primero.`;
  }
  if (a === 'boat' && !G.boat && G.gold >= BOAT_PRICE) { G.gold -= BOAT_PRICE; G.boat = true; save('now'); VMSG = '⛵ ¡Compraste un bote! Ahora puedes navegar por el mar (las montañas siguen bloqueadas).'; }
  // ---- Portal (Versión 3 · Fase 0.1) ----
  if (a === 'portal') { VVIEW = 'portal'; PSEL = null; }
  if (a === 'pmap') { VVIEW = 'pmap'; PSEL = null; }
  if (a === 'vback') VVIEW = 'village';
  if (a === 'pzone') PZ = PZ === k ? '' : k;   // tocar la zona abierta la pliega
  if (a === 'fav' && G.vv[k] && k !== startId()) { G.favs = G.favs || {}; if (G.favs[k]) delete G.favs[k]; else G.favs[k] = 1; save(); }
  if (a === 'travel' && k.startsWith('sv:') && VF.start && cityLvl('portal') >= 1) {
    const [x, y] = k.slice(3).split(',').map(Number), sv = (net.city && net.city.vv || []).find(v => v[0] === x && v[1] === y), c = sharedCost();
    if (sv && G.gold >= c) { G.gold -= c; closeModal(); travelTo({ x, y, name: sv[2] }); return; }
  }
  if (a === 'travel') {
    const v = G.vv[k], cost = travelCost();
    if (v && k !== VF.id && G.gold >= cost) { G.gold -= cost; closeModal(); travelTo(v); return; }
  }
  if (a === 'selleq') { const it = G.inventory[+k]; if (it) { G.inventory.splice(+k, 1); G.gold += sellPrice(it); save('now'); VMSG = `Vendiste ${itemLabel(it)} por ${sellPrice(it)} de oro.`; } }
  if (a === 'tog') {
    const i = +k, ix = G.party.indexOf(i);
    if (ix >= 0) { if (G.party.length > 1) G.party.splice(ix, 1); else VMSG = 'Necesitas al menos un héroe en el grupo.'; }
    else { if (G.party.length < 3) G.party.push(i); else VMSG = 'El grupo ya tiene 3 héroes. Saca a alguien primero.'; }
    if (!G.party.includes(G.leader)) G.leader = G.party[0];
  }
  rerender();
  if (['portal', 'pmap', 'vback'].includes(a)) $('#mcontent').scrollTop = 0;
}
export function openVillage(f) {
  VF = f; VMSG = ''; VSELL = false; G.lastVillage = G.lastVillage || { x: f.x, y: f.y };
  G.vv = G.vv || {}; if (!G.vv[f.id]) G.vv[f.id] = { x: f.x, y: f.y, name: f.name };   // aldea descubierta (portales)
  VVIEW = 'village'; PZ = null; PSEL = null;
  openModal(villageView, villageAct, () => { if (VVIEW === 'pmap') drawPortalMap(); });
}

// ---- Tablón de misiones ----
function boardHTML(f) {
  const n = active().length;
  let rows = '';
  for (let s = 0; s < SLOTS_PER_BOARD; s++) {
    const q = boardQuest(f, s); if (!q) continue;
    const on = isActive(q.id);
    rows += `<div class="qrow"><div class="qi">${QICON[q.type]}</div><div class="qt"><b>${q.title}</b><small class="mut">${QNAME[q.type]} · Nv ${q.lvl} · ${q.desc}</small><small class="goldt">${rewardText(q.reward, q.type)}</small></div>
      ${on ? '<span class="qon">✅ En curso</span>' : `<button class="btn sm" data-a="qacc" data-k="${s}" ${n >= MAX_ACTIVE ? 'disabled' : ''}>Aceptar</button>`}</div>`;
  }
  return `<div class="sec"><h3>📜 Tablón de misiones <small class="mut">${n}/${MAX_ACTIVE} activas</small></h3>${rows}</div>`;
}
// ---- Arena PvP (Versión 3 · Fase 4): solo en Ciudad Origen, contra jugadores que también estén aquí ----
function arenaHTML(f) {
  if (!f.start) return '';
  const here = [...net.others.values()].filter(o => o.online !== false && o.x === START.x && o.y === START.y && (o.status === 'village' || o.status === 'map'));
  const a = G.arena || { pts: 0, w: 0, l: 0 };
  return `<div class="sec"><h3>⚔️ Arena <small class="mut">duelos amistosos: no se pierde nada</small></h3>
    <p class="mut small" style="margin:0 0 6px">Tus puntos: <b class="goldt">${a.pts}</b> · ${a.w} victorias · ${a.l} derrotas. Los stats se nivelan: el de menor nivel recibe una bonificación. 30 s por turno.</p>
    ${!st.online ? '<p class="mut small">La arena necesita conexión.</p>' : here.length ? here.map(o => `<div class="shop"><span>${esc(o.leaderEmoji || '🙂')} <b>${esc(o.name)}</b> <small class="mut">Nv ${Number(o.avgLvl || 1).toFixed(1)}${o.title ? ' · «' + esc(o.title) + '»' : ''}</small></span><span class="arbtns"><button class="btn sm gold" data-a="duel" data-k="1v1:${esc(o.name)}" ${coopBusy() ? 'disabled' : ''}>1 vs 1</button><button class="btn sm" data-a="duel" data-k="3v3:${esc(o.name)}" ${coopBusy() ? 'disabled' : ''}>3 vs 3</button></span></div>`).join('')
      : '<p class="mut small" style="margin:0">No hay otros jugadores en Ciudad Origen ahora. Pídele a tu amigo que venga 🏰.</p>'}</div>`;
}
// ---- Establo y huevos (Versión 3 · Fase 3) ----
function stableHTML(f) {
  const pets = G.pets || [], eggs = G.eggs || [], act = activePet();
  const rows = pets.map(q => `<div class="shop petrow ${act && act.id === q.id ? 'on' : ''}"><span class="ishop"><b>${petLabel(q)}${act && act.id === q.id ? ' · te acompaña' : ''}</b><small class="mut">${petEffect(q)}${q.lvl < PET_MAX ? ` · XP ${q.xp}/${petNeed(q.lvl)}` : ' · nivel máximo'}</small></span>${act && act.id === q.id ? '<button class="btn sm" data-a="petstay">Dejar aquí</button>' : `<button class="btn sm gold" data-a="petuse" data-k="${q.id}">Llevar</button>`}</div>`).join('');
  return `<div class="sec"><h3>🐾 Establo <small class="mut">1 mascota te acompaña; las demás esperan aquí</small></h3>
    ${f.start ? `<div class="shop"><span>🥚 <b>Huevo de mascota</b> <small class="mut">eclosiona en ${EGG_STEPS} pasos; la mascota es al azar</small></span><button class="btn sm" data-a="buyegg" ${G.gold < EGG_PRICE ? 'disabled' : ''}>Comprar · ${EGG_PRICE} oro</button></div>` : ''}
    ${eggs.map(e => `<div class="shop"><span>🥚 Huevo <small class="mut">faltan ${e.left} pasos</small></span><span class="eggbar"><i style="width:${Math.round(100 * (1 - e.left / EGG_STEPS))}%"></i></span></div>`).join('')}
    ${rows || `<p class="mut small" style="margin:4px 0 0">Aún no tienes mascotas. Los huevos 🥚 salen de los jefes y de las misiones de jefe y de mazmorra${f.start ? ', o cómpralos aquí' : ', y se compran en Ciudad Origen'}.</p>`}</div>`;
}
// ---- Muelle (solo aldeas costeras) ----
function dockHTML(f) {
  if (!isCoastal(f)) return '';
  return `<div class="sec"><h3>⛵ Muelle</h3><div class="shop"><span>${G.boat ? 'Ya tienes bote: camina hacia el mar para navegar.' : `<b>Bote</b> <small class="mut">navega por el mar (con encuentros marinos).</small>`}</span>${G.boat ? '<span class="qon">✅ Tuyo</span>' : `<button class="btn sm" data-a="boat" ${G.gold < BOAT_PRICE ? 'disabled' : ''}>Comprar · ${BOAT_PRICE} oro</button>`}</div></div>`;
}
// ---- Portal: viajar a otra aldea ya visitada (Versión 3 · Fase 0.1) ----
// Ciudad Origen fija arriba; ⭐ favoritas; el resto agrupado en 4 zonas (⬆️ Norte, ⬇️ Sur, ➡️ Este, ⬅️ Oeste)
// calculadas respecto a Ciudad Origen, cada una ordenada de la más cercana a la más lejana desde tu posición.
const travelCost = () => Math.round(5 * avgLvl());
const ZONES = [['N', '⬆️ Norte'], ['S', '⬇️ Sur'], ['E', '➡️ Este'], ['O', '⬅️ Oeste']];
let VVIEW = 'village', PZ = null, PSEL = null;   // vista de la ventana · zona abierta · aldea tocada en el mapa
const startId = () => 'village@' + START.x + ',' + START.y;
const zoneOfV = v => zoneOf(v.x - START.x, START.y - v.y);
// "18 casillas al sur de ti"
const fromYou = v => { const dx = v.x - P.x, dn = P.y - v.y, d = Math.round(Math.hypot(dx, dn)); return d ? `${d} casilla${d === 1 ? '' : 's'} al ${cardinalWord(dx, dn)} de ti` : 'aquí'; };
function portalEntries() {
  const own = Object.entries(G.vv || {}).map(([id, v]) => ({ id, v, d: Math.hypot(v.x - P.x, v.y - P.y), here: VF && id === VF.id, origin: id === startId() }));
  if (!(VF && VF.start && cityLvl('portal') >= 1 && net.city)) return own;
  const have = new Set(own.map(e => e.v.x + ',' + e.v.y));
  const shared = (net.city.vv || []).filter(v => !have.has(v[0] + ',' + v[1])).map(v => ({ id: 'sv:' + v[0] + ',' + v[1], v: { x: v[0], y: v[1], name: v[2] }, d: Math.hypot(v[0] - P.x, v[1] - P.y), shared: true }));
  return own.concat(shared);
}
// Portal mayor: desde Ciudad Origen a las aldeas de la sala (nivel 2: mitad de precio · nivel 3: gratis)
const sharedCost = () => cityLvl('portal') >= 3 ? 0 : cityLvl('portal') === 2 ? Math.round(travelCost() / 2) : travelCost();
function portalHTML(f) {
  const n = portalEntries().filter(e => !e.here).length;
  return `<div class="sec"><h3>🌀 Portal</h3><div class="shop"><span>Viaja al instante a una aldea que ya visitaste. <small class="mut">${n} destino${n === 1 ? '' : 's'} · ${travelCost()} oro por viaje</small></span><button class="btn gold" data-a="portal">🌀 Abrir portal</button></div></div>`;
}
// Una fila: estrella, nombre (con "…" si es largo), datos chicos debajo y "Viajar" siempre a la derecha
function prow(e, cost, cls) {
  const fav = !!(G.favs && G.favs[e.id]);
  const star = e.origin ? '<span class="pstar fixed emoji">🏰</span>' : e.shared ? '<span class="pstar fixed emoji">🤝</span>' : `<button class="pstar emoji ${fav ? 'on' : ''}" data-a="fav" data-k="${esc(e.id)}" aria-label="${fav ? 'Quitar de favoritas' : 'Marcar como favorita'}">${fav ? '⭐' : '☆'}</button>`;
  if (e.shared) cost = sharedCost();
  const info = e.here ? '📍 Estás aquí' : `${relCoords(e.v.x, e.v.y)} · ${fromYou(e.v)} · ${cost ? cost + ' oro' : 'gratis'}${e.shared ? ' · 🤝 de la sala' : ''}`;
  return `<div class="pv ${cls || ''} ${e.here ? 'here' : ''}">${star}<div class="pvi"><b>${esc(e.v.name)}</b><small>${e.here ? `${relCoords(e.v.x, e.v.y)} · ` : ''}${info}</small></div>
    <button class="btn pgo ${e.origin ? 'gold' : ''}" data-a="travel" data-k="${esc(e.id)}" ${e.here || G.gold < cost ? 'disabled' : ''}>${e.here ? '📍' : 'Viajar'}</button></div>`;
}
function portalRender() {
  const cost = travelCost(), all = portalEntries(), origin = all.find(e => e.origin);
  const rest = all.filter(e => !e.origin).sort((a, b) => a.d - b.d);
  const favs = rest.filter(e => G.favs && G.favs[e.id]);
  const byZ = { N: [], S: [], E: [], O: [] }; for (const e of rest) byZ[zoneOfV(e.v)].push(e);
  if (PZ === null) {   // por defecto: la zona donde está el jugador (en Ciudad Origen, la que tiene más aldeas)
    PZ = (P.x === START.x && P.y === START.y) ? ZONES.map(z => z[0]).sort((a, b) => byZ[b].length - byZ[a].length)[0] : zoneOf(P.x - START.x, START.y - P.y);
  }
  let h = `<h2>🌀 Portal</h2><p class="mut" style="margin:0">Desde <b>${esc(VF.name)}</b> · cada viaje cuesta <b class="goldt">${cost} oro</b> · tienes 💰 ${G.gold}</p>
  ${VMSG ? `<div class="pend" style="margin-top:8px">${VMSG}</div>` : ''}
  ${origin ? `<div class="porigin">${prow(origin, cost, 'big')}</div>` : ''}`;
  if (favs.length) h += `<div class="psec"><h3>⭐ Favoritas</h3>${favs.map(e => prow(e, cost)).join('')}</div>`;
  h += '<div class="pzones">' + ZONES.map(([z, label]) => {
    const open = PZ === z, list = byZ[z];
    return `<button class="pzh ${open ? 'on' : ''}" data-a="pzone" data-k="${z}" aria-expanded="${open}"><span>${label} <small>(${list.length})</small></span><span class="pzc">${open ? '▴' : '▾'}</span></button>
      ${open ? `<div class="pzl">${list.length ? list.map(e => prow(e, cost)).join('') :'<p class="mut small" style="margin:6px 4px">Aún no visitas aldeas en esta zona.</p>'}</div>` : ''}`;
  }).join('') + '</div>';
  if (!rest.length) h += '<p class="mut small">Visita otras aldeas para poder viajar entre ellas. Ciudad Origen siempre está disponible.</p>';
  h += `<div class="row end"><button class="btn" data-a="pmap">🗺️ Ver en mapa</button><button class="btn gold" data-a="vback">← Volver a la aldea</button></div>`;
  return h;
}
// ---- Vista "🗺️ Ver en mapa": las aldeas visitadas en un mapa; al tocar una aparece su tarjeta con "Viajar" ----
function portalMapRender() {
  const cost = travelCost(), sel = PSEL && portalEntries().find(e => e.id === PSEL);
  return `<h2>🗺️ Aldeas visitadas</h2><p class="mut" style="margin:0">Toca una aldea para viajar · cada viaje cuesta <b class="goldt">${cost} oro</b></p>
    <canvas id="pmap" aria-label="Mapa de aldeas visitadas"></canvas>
    <div class="pmsel">${sel ? prow(sel, cost, 'big') : '<p class="mut small" style="text-align:center;margin:4px 0">🏰 Ciudad Origen · ⭐ favoritas · 📍 tú</p>'}</div>
    <div class="row end"><button class="btn" data-a="portal">← Lista</button><button class="btn gold" data-a="vback">Volver a la aldea</button></div>`;
}
let pmapPts = [];
function drawPortalMap() {
  const c = $('#pmap'); if (!c) return;
  const css = c.clientWidth || 300, dpr = Math.min(2, window.devicePixelRatio || 1), Wd = Math.round(css * dpr);
  c.width = Wd; c.height = Wd; const g = c.getContext('2d'), u = Wd / css;
  const es = portalEntries(), pts = [...es.map(e => [e.v.x, e.v.y]), [P.x, P.y]];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(20, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.18;
  const to = (x, y) => [(.5 + (x - cx) / span) * Wd, (.5 + (y - cy) / span) * Wd];
  g.fillStyle = '#0e1120'; g.fillRect(0, 0, Wd, Wd);
  // Ejes que cruzan Ciudad Origen (dividen las 4 zonas)
  const o = to(START.x, START.y); g.strokeStyle = '#ffffff1a'; g.lineWidth = u;
  g.beginPath(); g.moveTo(0, o[1]); g.lineTo(Wd, o[1]); g.moveTo(o[0], 0); g.lineTo(o[0], Wd); g.stroke();
  const txt = (t, p, col, size) => { g.font = `bold ${Math.round(size * u)}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3 * u; g.strokeStyle = '#000'; g.strokeText(t, p[0], p[1]); g.fillStyle = col; g.fillText(t, p[0], p[1]); };
  pmapPts = [];
  for (const e of es) {
    const p = to(e.v.x, e.v.y), fav = G.favs && G.favs[e.id], on = e.id === PSEL;
    pmapPts.push({ id: e.id, x: p[0] / u, y: p[1] / u });
    g.beginPath(); g.arc(p[0], p[1], (e.origin ? 9 : on ? 8 : 6) * u, 0, 7);
    g.fillStyle = e.origin ? '#f2c14e' : fav ? '#ffd84d' : on ? '#7fe0ff' : 'rgba(242,193,78,.6)'; g.fill();
    g.lineWidth = (on ? 3 : 1.5) * u; g.strokeStyle = on ? '#fff' : '#000'; g.stroke();
    if (e.origin) { g.font = `${Math.round(11 * u)}px ${'"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'}`; g.fillStyle = '#000'; g.fillText('🏰', p[0], p[1]); }
    if (e.origin || fav || on || es.length <= 12) txt(e.v.name, [p[0], p[1] - 14 * u], e.origin ? '#f2c14e' : '#ffe6a0', 10);
  }
  const me = to(P.x, P.y); g.beginPath(); g.arc(me[0], me[1], 4.5 * u, 0, 7); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.5 * u; g.strokeStyle = '#000'; g.stroke();
  c.onclick = ev => {
    const r = c.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    let best = null, bd = 30; for (const p of pmapPts) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
    if (best) { PSEL = best.id; rerender(); }
  };
}
const msgBox = () => VMSG ? `<div class="pend" style="margin-top:8px">${VMSG}</div>` : '';
function villageView() { return VVIEW === 'portal' ? portalRender() : VVIEW === 'pmap' ? portalMapRender() : VVIEW === 'forge' ? msgBox() + forgeHTML() : VVIEW === 'city' ? msgBox() + cityHTML() : VVIEW === 'cos' ? msgBox() + cosHTML() : VVIEW === 'craft' ? msgBox() + craftHTML() : villageRender(); }
function travelTo(v) {
  P.x = P.px = v.x; P.y = P.py = v.y; spawnNearby(); visitAround(); save('now');
  toast(`🌀 Llegaste a ${v.name}`);
  const f = feats.get(v.x + ',' + v.y); if (f) setTimeout(() => openVillage(f), 350);
}

// ================= Grupo (pestañas: Héroes · Equipo · Objetos) =================
let PA = null, NGC = false, PT = 'heroes', PH = null, PI = null, PF = false;
// Puntaje aproximado de un objeto (para la flechita ▲▼ de la lista)
const score = it => Object.entries(statsOf(it)).reduce((a, [k, v]) => a + v * (k === 'mhp' ? 1 / 3 : k === 'mmp' ? .5 : ['crit', 'ls', 'pres'].includes(k) ? .4 : 1), 0);
// Elegir héroe para un objeto o una habilidad de apoyo (Versión 3 · Fase 0.4): tarjetas con PV/PM y vista previa
const hv = h => ({ hp: h.hp, mhp: S(h, 'mhp'), mp: h.mp, mmp: S(h, 'mmp'), poison: h.poison || 0 });
const cardOf = h => ({ h, e: h.e, name: esc(h.name), sub: `${clsName(h)} · Nv ${h.lvl}`, H: hv(h) });
function pendHTML() {
  if (!PA) return '';
  let rows;
  if (PA.kind === 'item') rows = itemTargets(PA.k, heroes().map(cardOf));
  else {
    const c = PA.caster, est = estimate(PA.sk, { atk: S(c, 'atk'), atkRaw: S(c, 'atk'), mag: S(c, 'mag'), hp: c.hp, mhp: S(c, 'mhp'), critMul: 1.75 }, []);
    rows = heroes().map(cardOf).filter(x => PA.t === 'dead' ? x.H.hp <= 0 : true).map(x => {
      if (PA.t === 'dead') return { x, prev: est.revive ? est.revive(x.H) : '' };
      if (x.H.hp <= 0) return { x, dis: '💀 Caído' };
      if (x.H.hp >= x.H.mhp && !x.H.poison) return { x, dis: 'Vida llena' };
      return { x, prev: est.ally ? est.ally(x.H) : '', need: x.H.hp / x.H.mhp };
    });
    const ok = rows.filter(r => !r.dis); const best = ok.length ? ok.reduce((a, b) => ((b.need || 0) < (a.need || 0) ? b : a)) : null; if (best) best.best = true;
  }
  const title = PA.kind === 'item' ? `¿En quién usas ${IT[PA.k].e} <b>${IT[PA.k].n}</b>? <small class="mut">tienes ${G.items[PA.k]}</small>` : `¿A quién le aplicas <b>${PA.label}</b>? <small class="mut">${PA.caster.e} ${PA.caster.name} · ${skillCost(PA.caster, PA.sk)} PM</small>`;
  return `<div class="pend"><div>${title}</div>
    <div class="pick hpkgrid">${rows.length ? rows.map(r => `<button class="pickc hpk ${r.best ? 'best' : ''}" data-a="tgt" data-k="${G.roster.indexOf(r.x.h)}" ${r.dis ? 'disabled' : ''}>${heroCardHTML(r.x, r.prev, r.dis, r.best)}</button>`).join('') : `<span class="mut">${PA.t === 'dead' ? 'No hay héroes caídos.' : 'No hay objetivos válidos.'}</span>`}</div>
    <button class="btn full" data-a="cancel">Cancelar</button></div>`;
}
const eqLine = x => `<div class="eqline">${SLOT_KEYS.map(sl => { const it = x.equip && x.equip[sl]; return it ? `<span class="emoji" title="${it.n}" style="border-color:${RAR[it.r].c}">${TYPES[it.t].e}</span>` : `<span class="emoji empty" title="${SLOTS[sl].n} vacía">${SLOTS[sl].i}</span>`; }).join('')}</div>`;
// ---- Talentos y clase avanzada (Versión 3 · Fase 2) ----
const talResetCost = h => 20 * h.lvl;
let ADVSEL = null;   // { i (héroe), k (clase elegida, falta confirmar) }
function growthText(a) { const N = { mhp: 'PV', mmp: 'PM', atk: 'ATQ', def: 'DEF', mag: 'MAG', spd: 'VEL' }; return Object.entries(a.g).map(([k, v]) => `${N[k]} ${v > 1 ? '▲' : '▼'}`).join(' · '); }
function advHTML(x, i) {
  if (x.adv && ADV[x.adv]) return '';
  if (x.lvl < ADV_LVL) return `<div class="talrow lock">🔒 Clase avanzada a nivel ${ADV_LVL}</div>`;
  const sel = ADVSEL && ADVSEL.i === i ? ADVSEL.k : null;
  return `<div class="advbox"><b>👑 Elige su clase avanzada</b> <small class="mut">(no se puede cambiar)</small>
    <div class="advopts">${advOf(x.cls).map(k => { const a = ADV[k]; return `<button class="advc ${sel === k ? 'on' : ''}" data-a="advsel" data-k="${i}:${k}"><span class="emoji advi">${a.e}</span><b>${a.n}</b><small>${a.d}</small>
      <small class="advsk">${a.sk.map(s => `✨ ${SK[s].n} <span class="mut">(Nv ${SK[s].lv})</span>: ${SK[s].d}`).join('<br>')}</small><small class="mut">${growthText(a)}</small></button>`; }).join('')}</div>
    ${sel ? `<button class="btn gold full" data-a="advok" data-k="${i}:${sel}">Confirmar: ${ADV[sel].e} ${ADV[sel].n}</button>` : ''}</div>`;
}
function talHTML(x, i) {
  const t = TAL[x.cls]; if (!t) return '';
  return `<div class="tals"><b class="talh">🌟 Talentos</b>${TAL_LVLS.map(L => {
    if (x.lvl < L) return `<div class="talrow lock">🔒 Nv ${L}</div>`;
    const c = x.tal && x.tal[L];
    if (c === 0 || c === 1) return `<div class="talrow"><span class="talL">Nv ${L}</span> <b>${t[L][c].n}</b> <small class="mut">${t[L][c].d}</small></div>`;
    return `<div class="talpick"><span class="talL">Nv ${L} · elige uno:</span><div class="talopts">${t[L].map((o, j) => `<button class="talc" data-a="tal" data-k="${i}:${L}:${j}"><b>${j ? '🛡️' : '⚔️'} ${o.n}</b><small>${o.d}</small></button>`).join('')}</div></div>`;
  }).join('')}</div>`;
}
function heroesTab() {
  const pend = heroes().filter(hasPending);
  let h = pendHTML() + (pend.length ? `<div class="pend">🌟 ${pend.map(x => `<b>${x.name}</b>`).join(', ')} ${pend.length > 1 ? 'tienen' : 'tiene'} ${pend.some(pendingAdv) ? 'una clase avanzada o un talento' : 'un talento'} por elegir. Baja hasta su tarjeta.</div>` : '') + '<div class="hgrid">' + heroes().map(x => {
    const i = G.roster.indexOf(x), mh = S(x, 'mhp'), mm = S(x, 'mmp');
    return `<div class="pc ${x.hp <= 0 ? 'dead' : ''} ${hasPending(x) ? 'haspend' : ''}"><div class="hd"><span class="emoji">${x.e}</span><div style="flex:1"><b>${x.name}</b> ${G.leader === i ? '<span class="goldt">★ Líder</span>' : ''}<div class="mut" style="font-size:12px">${clsName(x)}${x.adv ? ` <span class="advtag">${CL[x.cls].n}</span>` : ''} · Nivel ${x.lvl}${x.hp <= 0 ? ' · <span style="color:#ff6b6b">Caído</span>' : ''}</div></div>${G.leader !== i ? `<button class="btn sm" data-a="leader" data-k="${i}">Líder</button>` : ''}</div>
    ${eqLine(x)}
    <div style="font-size:11px;margin-top:6px" class="mut">PV ${x.hp}/${mh}</div><div class="bar"><i style="width:${100 * x.hp / mh}%"></i></div>
    <div style="font-size:11px;margin-top:3px" class="mut">PM ${x.mp}/${mm}</div><div class="bar mp"><i style="width:${100 * x.mp / mm}%"></i></div>
    <div style="font-size:11px;margin-top:3px" class="mut">XP ${x.xp}/${need(x.lvl)}</div><div class="bar xp"><i style="width:${100 * x.xp / need(x.lvl)}%"></i></div>
    <div class="stats"><div>ATQ<b>${S(x, 'atk')}</b></div><div>DEF<b>${S(x, 'def')}</b></div><div>MAG<b>${S(x, 'mag')}</b></div><div>VEL<b>${S(x, 'spd')}</b></div></div>
    <div class="skl">${[...CL[x.cls].sk, ...(x.adv && ADV[x.adv] ? ADV[x.adv].sk : [])].map(k => { const s = SK[k], c = skillCost(x, k); return s.lv <= x.lvl ? `✨ <b>${s.n}</b> <span class="mut">${c} PM</span>${s.field && x.hp > 0 ? ` <button class="btn sm" data-a="fskill" data-k="${i}:${k}" ${x.mp < c ? 'disabled' : ''}>Usar</button>` : ''}` : `<span class="no">🔒 ${s.n} (Nv ${s.lv})</span>`; }).join('<br>')}</div>
    ${advHTML(x, i)}${talHTML(x, i)}</div>`;
  }).join('') + '</div>';
  const res = G.roster.filter((_, i) => !G.party.includes(i));
  if (res.length) h += `<h3>Esperando en la taberna</h3><p class="mut" style="font-size:13px;margin:0">${res.map(x => `${x.e} ${x.name} (${clsName(x)}, Nv ${x.lvl})`).join(' · ')}<br>Cámbialos en la taberna de cualquier aldea.</p>`;
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
    return `<button class="irow ${PI && PI.src === 'inv' && PI.i === i ? 'on' : ''}" data-a="isel" data-k="${i}" style="border-left-color:${RAR[it.r].c}"><span class="in">${itemLabel(it)}<small class="mut">${RAR[it.r].n} · Nv ${it.ilvl} · ${statList(statsOf(it)).slice(0, 2).join(' · ')}</small></span>${badge}</button>`;
  }).join('')}</div>`
    : `<p class="mut small">${G.inventory.length ? 'Nada de esto lo puede usar ' + sel.name + '.' : 'Aún no tienes equipo. Cae de los monstruos (15%), de los jefes (siempre) y de los cofres (50%), y se compra en la armería de las aldeas.'}</p>`;
  if (PI) h += detailHTML(sel);
  return h;
}
// ---- Materiales y profesiones (Versión 3 · Fase 6.1) ----
function matsTab() {
  const f = foodActive(), groups = [['ore', '⛏️ Minerales'], ['herb', '🌿 Hierbas'], ['fish', '🎣 Pescados'], ['wood', '🪵 Madera'], ['mon', '🐾 De monstruos']];
  let h = `<div class="sec"><h3>Profesiones <small class="mut">de todo tu grupo</small></h3><div class="profs">${Object.entries(PROFS).map(([k, x]) => { const p = prof(k); return `<div class="prof"><span>${x.e} <b>${x.n}</b> Nv ${p.lvl}</span><span class="bar xp"><i style="width:${Math.round(100 * p.xp / profNeed(p.lvl))}%"></i></span></div>`; }).join('')}</div>
    ${f ? `<p class="small" style="margin:8px 0 0">Comida activa: ${FOODS[f.k].e} <b>${FOODS[f.k].n}</b> · ${FOODS[f.k].d} · ${Math.ceil((f.until - Date.now()) / 60000)} min</p>` : ''}</div>`;
  for (const [k, title] of groups) {
    const list = Object.entries(MATS).filter(([id, m]) => m.k === k && (G.mats || {})[id] > 0);
    h += `<div class="sec"><h3>${title}</h3>${list.length ? `<div class="mgrid">${list.map(([id, m]) => `<div class="mcell"><span class="emoji">${m.e}</span><b>${G.mats[id]}</b><small>${m.n}</small></div>`).join('')}</div>` : '<p class="mut small" style="margin:0">Nada todavía.</p>'}</div>`;
  }
  return h + '<p class="mut small">Los puntos de recolección (⛏️ 🌿 🎣 🪵) están en el mapa: párate encima y toca "Recolectar". Reaparecen a los 15 minutos. Los materiales se usan en el 🛠️ Taller de las aldeas y quedan en la tumba 🪦 si el grupo cae.</p>';
}
// ---- Registro de misiones ----
let QD = null;   // misión a la que se tocó "Abandonar" una vez (pide confirmación)
function questsTab() {
  const list = active();
  if (!list.length) return `<p class="mut small" style="margin-top:10px">No tienes misiones. Acepta hasta ${MAX_ACTIVE} en el 📜 tablón de cualquier aldea.</p>`;
  return `<div class="qlog">${list.map(q => { const on = G.qtrack === q.id; return `<div class="qcard ${on ? 'on' : ''}">
    <div class="qhead"><span class="qi">${QICON[q.type]}</span><div class="qt"><b>${q.title}</b><small class="mut">${QNAME[q.type]} · de ${q.from.name} · Nv ${q.lvl}</small></div><span class="qprog">${progressText(q)}</span></div>
    <small class="goldt">${rewardText(q.reward, q.type)}</small>
    <div class="qbtns"><button class="btn sm ${on ? 'gold' : ''}" data-a="qtrack" data-k="${q.id}" ${on ? 'disabled' : ''}>${on ? '🎯 Siguiendo' : '🎯 Seguir'}</button><button class="btn sm" data-a="qdrop" data-k="${q.id}">${QD === q.id ? '⚠️ ¿Abandonar? Toca otra vez' : 'Abandonar'}</button></div></div>`; }).join('')}</div>
  <p class="mut small">La misión que sigues aparece en la esquina superior derecha y con una flecha morada 📜 en el borde de la pantalla.</p>`;
}
function partyRender() {
  const tabs = [['heroes', '🧑 Héroes'], ['equip', `⚔️ Equipo <small>${G.inventory.length}</small>`], ['items', '🧪 Objetos'], ['mats', '🪨 Materiales'], ['quests', `📜 Misiones <small>${active().length}</small>`], ['ach', `🏆 Logros <small>${achCount()}</small>`]];
  const pet = activePet(), eggs = G.eggs || [];
  let h = `<h2>🎒 Grupo</h2><p class="mut" style="margin:0">💰 ${G.gold} de oro · Ataque +${G.upA * 2} y Defensa +${G.upD * 2} por la herrería</p>
  <p class="petline">${pet ? `🐾 Te acompaña <b>${petLabel(pet)}</b> <small class="mut">${petEffect(pet)}</small>` : '🐾 <span class="mut">Sin mascota (se eligen en el establo de las aldeas)</span>'}${eggs.length ? ` · 🥚 ${eggs.length} huevo${eggs.length > 1 ? 's' : ''} <small class="mut">(faltan ${Math.min(...eggs.map(e => e.left))} pasos)</small>` : ''}</p>
  <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${PT === k ? 'on' : ''}" data-a="tab" data-k="${k}">${l}</button>`).join('')}</div>`;
  h += PT === 'equip' ? equipTab() : PT === 'items' ? itemsTab() : PT === 'quests' ? questsTab() : PT === 'ach' ? achTabHTML() : PT === 'mats' ? matsTab() : heroesTab();
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
  if (a === 'title') { setTitle(k); save(); }
  if (a === 'daily') { closeModal(); const { checkDaily } = await import('./daily.js'); const v = await checkDaily(true); if (!v) toast('🎁 La recompensa diaria necesita conexión'); return; }
  if (a === 'rank') { rerender(); await loadRank(); }
  if (a === 'qtrack') track(k);
  if (a === 'qdrop') { if (QD !== k) QD = k; else { abandon(k); QD = null; save(); } }
  if (a === 'cancel') PA = null;
  // Talentos y clase avanzada
  if (a === 'tal') {
    const [hi, L, j] = k.split(':').map(Number), h = G.roster[hi];
    if (h && TAL[h.cls] && TAL[h.cls][L] && h.lvl >= L && !(h.tal && (h.tal[L] === 0 || h.tal[L] === 1))) {
      changeEquip(h, () => { h.tal = h.tal || {}; h.tal[L] = j; }); save('now'); toast(`🌟 ${h.name}: ${TAL[h.cls][L][j].n}`);
    }
  }
  if (a === 'advsel') { const [hi, ak] = k.split(':'); ADVSEL = { i: +hi, k: ak }; }
  if (a === 'advok') {
    const [hi, ak] = k.split(':'), h = G.roster[+hi];
    if (h && ADV[ak] && ADV[ak].cls === h.cls && h.lvl >= ADV_LVL && !h.adv) {
      changeEquip(h, () => { h.adv = ak; }); h.e = ADV[ak].e; ADVSEL = null; save('now');
      toast(`👑 ${h.name} ahora es <b>${ADV[ak].n}</b> ${ADV[ak].e}<br><span style="font-size:13px">Nueva habilidad: ${SK[ADV[ak].sk[0]].n}</span>`);
    }
  }
  if (a === 'ngcancel') NGC = false;
  if (a === 'leader') G.leader = +k;
  if (a === 'fskill') {
    const [ci, sk] = k.split(':'); const c = G.roster[+ci], s = SK[sk];
    if (s.t === 'allies') { c.mp -= skillCost(c, sk); await runSkill(sk, c, alive(heroes())); PA = null; } else PA = { kind: 'skill', caster: c, sk, t: s.t, label: s.n };
  }
  if (a === 'item') { PA = { kind: 'item', k, t: IT[k].t, label: IT[k].n }; }
  if (a === 'tgt' && PA) {
    const t = G.roster[+k];
    const okT = t && (PA.t === 'dead' ? t.hp <= 0 : t.hp > 0);   // nunca curar a un caído ni "revivir" a uno vivo
    if (!okT) { /* nada */ } else if (PA.kind === 'skill') { const c = skillCost(PA.caster, PA.sk); if (PA.caster.mp >= c) { PA.caster.mp -= c; await runSkill(PA.sk, PA.caster, [t]); toast(`✨ ${PA.label} → ${esc(t.name)}`); } }
    else if (G.items[PA.k] > 0) { useItem(PA.k, t); toast(`${IT[PA.k].e} ${IT[PA.k].n} → ${esc(t.name)}`); }
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
  if ((a === 'item' || a === 'fskill') && PA) { const p = $('#mcontent .pend'); if (p) p.scrollIntoView({ block: 'nearest' }); }
}
export function openParty(tab) { PA = null; NGC = false; PI = null; if (tab) PT = tab; openModal(partyRender, partyAct); }

// ================= Confirmación antes de pelear con un jefe =================
// Los jefes nunca inician el combate solos: el jugador decide.
// "📣 Pedir ayuda" abre el combate en equipo (coop.js).
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
    <p class="bnote">Si cae todo tu grupo, despertarás en Ciudad Origen y tus objetos quedarán en una tumba 🪦 por 60 minutos.</p>
    <div class="bbtns3"><button class="btn gold big" data-a="fight">⚔️ Pelear solo</button><button class="btn big help" data-a="help" ${canAskHelp() ? '' : 'disabled'}>📣 Pedir ayuda</button><button class="btn big" data-a="retreat">🏃 Retirarse</button></div>
    ${canAskHelp() ? '<p class="mut small" style="margin:6px 0 0">Con ayuda, cada jugador pelea con 1 héroe y la vida del jefe sube según cuántos sean.</p>' : '<p class="mut small" style="margin:6px 0 0">📣 Pedir ayuda se activa cuando hay compañeros conectados explorando.</p>'}
  </div>`;
}
export function openBossConfirm(m, onFight) {
  BC = { m, onFight };
  openModal(bossRender, a => {
    const c = BC;
    if (a === 'fight') { closeModal(); c.onFight(c.m); }
    else if (a === 'help') { closeModal(); askHelp(c.m); }
    else if (a === 'retreat') closeModal();
  });
}

// ================= Mapa (grande) y mini-minimapa =================
function mapRender() {
  if (inDungeon()) return `<h2>🕳️ ${esc(D.cave.name)}</h2><p class="mut" style="margin:0">Piso <b>${D.f + 1} de ${D.cave.floors}</b> · solo se ve lo que ya recorriste</p>
    <canvas id="mm"></canvas><div class="legend"><span><i class="lg me"></i>Tú</span><span>🪜 Escaleras</span><span>📦 Cofre</span><span>⚠️ Trampa vista</span><span>👑 Jefe</span><span>🌀 Salida</span></div>
    <div class="row end"><button class="btn gold" data-a="close">Cerrar</button></div>`;
  return `<h2>🗺️ Mapa del mundo</h2><p class="mut" style="margin:0">📍 <b>Tú: ${relCoords(P.x, P.y)}</b> · Sala <b>${esc(st.room)}</b> · ${G.steps} pasos · ${G.bosses || 0} jefes derrotados</p>
  <canvas id="mm"></canvas><div class="legend">
    <span><i class="lg me"></i>Tú</span><span><i class="lg mate"></i>Compañeros</span><span>🏰 Ciudad Origen</span><span><i class="lg near"></i>Aldea más cercana</span><span><i class="lg vil"></i>Aldeas</span>
    <span>👑 Jefe</span><span>🕳️ Mazmorra</span><span>🪦 Tumba</span><span><i class="lg" style="background:#c084fc"></i>Misión</span><span><i class="lg" style="background:#ff5fa2"></i>Marcas</span><span><i class="lg" style="background:#c27bff"></i>Santuario</span></div>
  <p class="mut small" style="text-align:center;margin:4px 0 0">Solo se ve lo explorado. Lo que está fuera del mapa aparece en el borde con una flechita.</p>
  <div class="row end"><button class="btn gold" data-a="close">Cerrar</button></div>`;
}
export function openMap() { openModal(mapRender, a => { if (a === 'close') closeModal(); }, () => paintMap($('#mm'), 90, { labels: true, full: true })); }

// Mini-minimapa (esquina izquierda, bajo los héroes): plegable; al tocarlo se abre el mapa grande
let miniOpen = null, miniT = 0;
function miniPref() {
  if (miniOpen !== null) return miniOpen;
  try { const v = localStorage.getItem('tsf-mini'); if (v === '1' || v === '0') return (miniOpen = v === '1'); } catch (e) { /* nada */ }
  return (miniOpen = !matchMedia('(max-height: 480px)').matches);   // en horizontal parte plegado
}
export function updateMini(t) {
  const box = $('#minimap'); if (!box || !st.inGame) return;
  const open = miniPref(); box.classList.toggle('open', open);
  if (open && (t === undefined || t - miniT > 300)) { miniT = t || 0; paintMap($('#mini'), 18); }
}
function toggleMini() { miniOpen = !miniPref(); try { localStorage.setItem('tsf-mini', miniOpen ? '1' : '0'); } catch (e) { /* nada */ } updateMini(); }

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
  initChat();
  // 👁️ Mostrar u ocultar a los demás jugadores (3 modos, se guarda en el dispositivo)
  const visBtn = () => { const v = VIS[visMode()], b = $('#bVis'); if (!b) return; b.querySelector('.vi').textContent = v.i; b.title = v.n; b.setAttribute('aria-label', 'Ver jugadores: ' + v.n); };
  visBtn();
  $('#bVis').onclick = () => { const v = VIS[cycleVis()]; visBtn(); toast(`${v.i} ${v.n}<br><span style="font-size:13px;color:#cfd5ea">${v.d}</span>`); updateMini(); };
  $('#bParty').onclick = () => { if (!st.busy) openParty(); };
  $('#bMap').onclick = () => { if (!st.busy) openMap(); };
  $('#bSocial').onclick = () => toggleSocial();
  $('#coords').onclick = () => toggleCoords();
  $('#mini').onclick = () => { if (!st.busy) openMap(); };
  $('#miniTog').onclick = e => { e.stopPropagation(); toggleMini(); };
  $('#miniBtn').onclick = () => toggleMini();
  $('#bSave').onclick = () => { toast(save('now') ? '💾 Partida guardada' : '⚠️ No se pudo guardar en este navegador'); };
}
