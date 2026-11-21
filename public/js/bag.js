// 🎒 Mochila y venta (Versión 4 · Fase 1b).
// Se usa en dos lugares con el mismo código:
// - mode 'bag': la ventana 🎒 Mochila (dentro y fuera de las aldeas; vender solo si estás en una aldea).
// - mode 'shop': la pestaña "Vender" de la Tienda.
// Cuadrícula compacta por pestañas (Equipo · Objetos · Materiales · Especiales), ordenar, buscar, ficha desde abajo con
// comparación y acciones (Equipar, Usar, Vender, Desarmar, 🔒 Bloquear), selección múltiple, venta rápida y recompra.
// Bloqueo: it.lk = 1 en el equipo y G.lockK['i:pocion' | 'm:cobre'] en los montones. Nuevo: it.nw = 1 (punto).
'use strict';
import { IT, MATS, RECIPES, PROFS, FOODS } from './data.js';
import { prof, profNeed, foodActive } from './gather.js';
import { G, heroes, changeEquip } from './state.js';
import { INV_MAX, SLOTS, SLOT_KEYS, TYPES, RAR, STAT, LEGENDS, slotOf, canUse, sellPrice, statsOf, statList, classesText, itemLabel, compare, addItem } from './items.js';
import { dismantleGain } from './economy.js';
import { esc } from './util.js';

const RORD = { comun: 0, raro: 1, epico: 2, legendario: 3 };
export const B = { tab: 'equip', sort: 'new', q: '', sel: null, multi: false, picks: new Set(), qty: 1, hero: null, quick: null, dis: false, seenEquip: false };
// Recompra: lo último vendido en esta sesión (máx. 10), al mismo precio
export const SOLD = [];
export const BTABS = [['equip', '⚔️ Equipo'], ['items', '🧪 Objetos'], ['mats', '🪨 Materiales'], ['spec', '✨ Especiales']];
const SORTS = [['new', '🕒 Más nuevo'], ['rar', '💎 Rareza'], ['type', '🗂️ Tipo'], ['lvl', '📈 Nivel']];

// ---- Precios de venta (30% como el equipo) ----
export const itemSell = k => Math.max(1, Math.round(IT[k].p * .3));
export const matSell = k => { const m = MATS[k]; return m.t === 9 ? 25 : Math.max(1, Math.round(2 + m.t * 3 + (m.k === 'mon' ? 1 : 0))); };
const lockK = () => (G.lockK = G.lockK || {});
const isLocked = e => e.kind === 'gear' ? !!e.it.lk : !!lockK()[e.key];
const isNew = e => e.kind === 'gear' && !!e.it.nw;

// ---- Lista de entradas de una pestaña ----
function entries(tab) {
  if (tab === 'equip') return G.inventory.map((it, i) => ({ kind: 'gear', key: 'g' + i, i, it, name: it.n, e: TYPES[it.t].e, c: RAR[it.r].c, r: RORD[it.r], lvl: it.ilvl, type: TYPES[it.t].slot + it.t, n: 1 }));
  if (tab === 'items') return Object.keys(IT).filter(k => G.items[k] > 0).map((k, j) => ({ kind: 'item', key: 'i:' + k, k, name: IT[k].n, e: IT[k].e, c: '#7fe0ff', r: 0, lvl: 0, type: 'i' + j, n: G.items[k] }));
  if (tab === 'mats') return Object.keys(MATS).filter(k => (G.mats || {})[k] > 0).map(k => ({ kind: 'mat', key: 'm:' + k, k, name: MATS[k].n, e: MATS[k].e, c: MATS[k].t === 9 ? '#b36bff' : '#9aa3c0', r: MATS[k].t, lvl: MATS[k].t, type: MATS[k].k, n: G.mats[k] }))
    .concat(G.frags ? [{ kind: 'frag', key: 'f', name: 'Fragmentos de forja', e: '🔩', c: '#9aa3c0', r: 0, lvl: 0, type: 'zz', n: G.frags }] : []);
  const out = (G.eggs || []).map((x, j) => ({ kind: 'egg', key: 'e' + j, j, name: 'Huevo de mascota', e: '🥚', c: '#f2c14e', r: 2, lvl: 0, type: 'egg', n: 1, left: x.left }));
  for (const [j, m] of (G.tmaps || []).entries()) out.push({ kind: 'map', key: 't' + j, j, name: 'Mapa del tesoro', e: '🗺️', c: '#f2c14e', r: 2, lvl: m.lvl || 0, type: 'map', n: 1, m });
  return out;
}
function sorted(list) {
  const l = list.slice();
  if (B.sort === 'new') l.reverse();   // el inventario está en orden de llegada
  else if (B.sort === 'rar') l.sort((a, b) => b.r - a.r || b.lvl - a.lvl);
  else if (B.sort === 'type') l.sort((a, b) => a.type < b.type ? -1 : a.type > b.type ? 1 : b.r - a.r);
  else if (B.sort === 'lvl') l.sort((a, b) => b.lvl - a.lvl || b.r - a.r);
  return l;
}
const sellable = e => (e.kind === 'gear' || e.kind === 'item' || e.kind === 'mat') && !isLocked(e);
const priceOf = (e, n) => e.kind === 'gear' ? sellPrice(e.it) : e.kind === 'item' ? itemSell(e.k) * n : e.kind === 'mat' ? matSell(e.k) * n : 0;
function find(key) { for (const t of ['equip', 'items', 'mats', 'spec']) { const e = entries(t).find(x => x.key === key); if (e) return e; } return null; }

// ---- Encabezado de herramientas: pestañas, ordenar y buscar ----
export function toolsHTML(mode) {
  const tabs = mode === 'shop' ? BTABS.slice(0, 3) : BTABS;
  if (mode === 'shop' && B.tab === 'spec') B.tab = 'equip';
  const cnt = t => entries(t).length;
  return `<div class="btabs" style="grid-template-columns:repeat(${tabs.length},minmax(0,1fr))">${tabs.map(([k, l]) => `<button class="tab ${B.tab === k ? 'on' : ''}" data-a="btab" data-k="${k}">${l} <small>${cnt(k)}</small></button>`).join('')}</div>
  <div class="btools"><input id="bagQ" class="bagq" type="search" placeholder="🔎 Buscar por nombre" value="${esc(B.q)}" autocomplete="off" aria-label="Buscar en la mochila"><button class="btn bsort" data-a="bsort">${SORTS.find(s => s[0] === B.sort)[1]}</button></div>`;
}
// ---- Cuadrícula ----
export function gridHTML(mode, opts = {}) {
  const list = sorted(entries(B.tab));
  if (B.tab === 'equip') B.seenEquip = true;
  const cell = e => {
    const pick = B.multi && B.picks.has(e.key), dis = B.multi && !sellable(e);
    return `<button class="bcell ${pick ? 'pick' : ''} ${dis ? 'off' : ''}" data-a="${B.multi ? 'bmt' : 'bpick'}" data-k="${e.key}" data-n="${esc(e.name.toLowerCase())}" style="border-color:${e.c}" ${dis ? 'disabled' : ''} aria-label="${esc(e.name)}${e.n > 1 ? ' ×' + e.n : ''}">
      <span class="emoji">${e.e}</span>${e.kind === 'gear' && e.it.up ? `<i class="bup">+${e.it.up}</i>` : ''}${e.n > 1 ? `<b class="bn">${e.n}</b>` : ''}${e.kind === 'gear' ? `<small class="blv">Nv ${e.lvl}</small>` : e.kind === 'egg' ? `<small class="blv">${e.left}p</small>` : ''}
      ${isNew(e) ? '<i class="bdot" aria-label="Nuevo"></i>' : ''}${isLocked(e) ? '<i class="block">🔒</i>' : ''}${pick ? '<i class="bchk">✓</i>' : ''}</button>`;
  };
  const empty = { equip: 'Aún no tienes equipo guardado. Cae de los monstruos y los cofres, y se compra en la armería.', items: 'No tienes objetos. Se compran en la Tienda o se fabrican en Alquimia.', mats: 'No tienes materiales. Recolecta ⛏️ 🌿 🎣 🪵 en el mapa o derrota monstruos.', spec: 'Aquí aparecen los huevos 🥚 y los mapas del tesoro 🗺️.' };
  let h = '';
  if (B.tab === 'equip' && mode === 'bag' && !B.multi) h += equippedHTML();
  if (B.tab === 'mats' && mode === 'bag') h += profsHTML();
  if (B.tab === 'equip') h += `<div class="bcap mut small">🎒 ${G.inventory.length}/${INV_MAX} lugares para equipo</div>`;
  h += list.length ? `<div class="bgrid">${list.map(cell).join('')}</div><p class="mut small bnone hidden">Nada coincide con la búsqueda.</p>` : `<p class="mut small">${empty[B.tab]}</p>`;
  return h;
}
// Profesiones del grupo (estaban en la pestaña Materiales del Grupo)
function profsHTML() {
  const f = foodActive();
  return `<div class="sec bprofs"><h3>Profesiones <small class="mut">de todo tu grupo</small></h3><div class="profs">${Object.entries(PROFS).map(([k, x]) => { const p = prof(k); return `<div class="prof"><span>${x.e} <b>${x.n}</b> Nv ${p.lvl}</span><span class="bar xp"><i style="width:${Math.round(100 * p.xp / profNeed(p.lvl))}%"></i></span></div>`; }).join('')}</div>
    ${f ? `<p class="small" style="margin:8px 0 0">Comida activa: ${FOODS[f.k].e} <b>${FOODS[f.k].n}</b> · ${FOODS[f.k].d} · ${Math.ceil((f.until - Date.now()) / 60000)} min</p>` : ''}</div>`;
}
// Equipo puesto del héroe elegido (para quitar y comparar)
function heroSel() { const hs = G.roster; if (B.hero == null || !hs[B.hero]) B.hero = G.party[0]; return hs[B.hero]; }
function equippedHTML() {
  const sel = heroSel(), order = [...G.party, ...G.roster.map((_, i) => i).filter(i => !G.party.includes(i))];
  return `<div class="hchips">${order.map(i => { const x = G.roster[i]; return `<button class="hchip ${i === B.hero ? 'on' : ''}" data-a="bhero" data-k="${i}"><span class="emoji">${x.e}</span> ${esc(x.name)}${G.party.includes(i) ? '' : ' 🍺'}</button>`; }).join('')}</div>
  <div class="bslots">${SLOT_KEYS.map(sl => { const it = sel.equip[sl]; return `<button class="bslot" data-a="bslot" data-k="${sl}" ${it ? `style="border-color:${RAR[it.r].c}"` : 'disabled'} aria-label="${SLOTS[sl].n}${it ? ': ' + esc(it.n) : ' vacío'}"><span class="emoji">${it ? TYPES[it.t].e : SLOTS[sl].i}</span><small>${it ? (it.up ? '+' + it.up : 'Nv ' + it.ilvl) : SLOTS[sl].n}</small></button>`; }).join('')}</div>`;
}

// ---- Ficha desde abajo ----
export function sheetHTML(mode, ctx = {}) {
  if (B.quick) return quickHTML();
  if (!B.sel) return '';
  let e = B.sel.slot ? { kind: 'slot', slot: B.sel.slot } : find(B.sel.key);
  if (!e) { B.sel = null; return ''; }
  const canSell = ctx.canSell, body = [];
  let title, act = '';
  if (e.kind === 'slot') {
    const sel = heroSel(), it = sel.equip[e.slot]; if (!it) { B.sel = null; return ''; }
    title = itemLabel(it);
    body.push(`<div class="mut small">${RAR[it.r].n} · Nv ${it.ilvl} · ${SLOTS[e.slot].n} · lo lleva ${esc(sel.name)}</div>`, it.fx ? `<div class="ifx">✨ ${LEGENDS[it.fx].d}</div>` : '', `<div class="cmpg">${compare(it, null).map(({ k, v }) => `<div class="cmp"><span>${STAT[k]}</span><b>${v}</b></div>`).join('')}</div>`);
    act = `<button class="btn" data-a="bunequip" ${G.inventory.length >= INV_MAX ? 'disabled' : ''}>Quitar y guardar</button>`;
  } else if (e.kind === 'gear') {
    const it = e.it, cand = [...G.party, ...G.roster.map((_, i) => i).filter(i => !G.party.includes(i))].filter(i => canUse(G.roster[i], it));
    if (it.nw) delete it.nw;
    if (B.hero == null || !canUse(G.roster[B.hero], it)) B.hero = cand[0] != null ? cand[0] : G.party[0];
    const sel = G.roster[B.hero], cur = sel.equip[slotOf(it)], ok = canUse(sel, it);
    title = itemLabel(it);
    body.push(`<div class="mut small">${RAR[it.r].n} · Nv ${it.ilvl} · ${SLOTS[slotOf(it)].n} · ${classesText(it)}</div>`, it.fx ? `<div class="ifx">✨ ${LEGENDS[it.fx].d}</div>` : '');
    if (cand.length) body.push(`<div class="hchips">${cand.map(i => { const x = G.roster[i]; return `<button class="hchip ${i === B.hero ? 'on' : ''}" data-a="bhero" data-k="${i}"><span class="emoji">${x.e}</span> ${esc(x.name)}</button>`; }).join('')}</div>`);
    body.push(`<div class="mut small">${cur ? `Comparado con lo que lleva ${esc(sel.name)}: <span style="color:${RAR[cur.r].c}">${esc(cur.n)}</span>` : `${esc(sel.name)} no lleva nada en esta ranura.`}</div>`,
      `<div class="cmpg">${compare(it, cur).map(({ k, v, d }) => `<div class="cmp"><span>${STAT[k]}</span><b>${v}</b><em class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' + d : d < 0 ? d : '='}</em></div>`).join('')}</div>`);
    if (!cand.length) body.push(`<div class="warnline">Ningún héroe tuyo puede usar este objeto.</div>`);
    const lk = !!it.lk, frags = dismantleGain(it);
    act = `${mode === 'bag' ? `<button class="btn gold" data-a="bequip" ${ok ? '' : 'disabled'}>Equipar a ${esc(sel.name)}</button>` : ''}
      ${canSell ? `<button class="btn" data-a="bsell" ${lk ? 'disabled' : ''}>💰 Vender · ${sellPrice(it)} oro</button>` : ''}
      <button class="btn" data-a="bdis" ${lk ? 'disabled' : ''}>${B.dis ? `⚠️ ¿Desarmar? +${frags} 🔩` : `🔩 Desarmar (+${frags})`}</button>
      <button class="btn" data-a="block">${lk ? '🔓 Desbloquear' : '🔒 Bloquear'}</button>`;
  } else if (e.kind === 'item' || e.kind === 'mat') {
    const it = e.kind === 'item' ? IT[e.k] : MATS[e.k], lk = isLocked(e), n = e.n; B.qty = Math.max(1, Math.min(B.qty, n));
    title = `<span class="emoji">${e.e}</span> <b>${esc(e.name)}</b> ×${n}`;
    if (e.kind === 'item') body.push(`<div class="mut small">${esc(it.d)}</div>`);
    else { const uses = RECIPES.filter(r => r.in[e.k]).length; body.push(`<div class="mut small">${({ ore: '⛏️ Mineral', herb: '🌿 Hierba', fish: '🎣 Pescado', wood: '🪵 Madera', mon: '🐾 De monstruos' })[it.k] || 'Material'} · se usa en ${uses} receta${uses === 1 ? '' : 's'} del taller</div>`); }
    if (canSell) body.push(`<div class="bqty"><span>Cantidad</span><button class="btn" data-a="bqty" data-k="-10" aria-label="Menos 10">−10</button><button class="btn" data-a="bqty" data-k="-1" aria-label="Menos 1">−</button><b>${B.qty}</b><button class="btn" data-a="bqty" data-k="1" aria-label="Más 1">+</button><button class="btn" data-a="bqty" data-k="max" aria-label="Todos">Todo</button></div>`);
    act = `${e.kind === 'item' && mode === 'bag' ? `<button class="btn gold" data-a="buse">Usar</button>` : ''}
      ${canSell ? `<button class="btn" data-a="bsell" ${lk ? 'disabled' : ''}>💰 Vender ${B.qty} · ${priceOf(e, B.qty)} oro</button>` : ''}
      <button class="btn" data-a="block">${lk ? '🔓 Desbloquear' : '🔒 Bloquear'}</button>`;
  } else if (e.kind === 'frag') {
    title = '<span class="emoji">🔩</span> <b>Fragmentos de forja</b> ×' + e.n;
    body.push('<div class="mut small">Salen de desarmar equipo. Se usan en la ⚒️ Forja para mejorar objetos.</div>');
  } else if (e.kind === 'egg') {
    title = '<span class="emoji">🥚</span> <b>Huevo de mascota</b>';
    body.push(`<div class="mut small">Eclosiona caminando: faltan <b>${e.left}</b> pasos. La mascota es al azar.</div>`);
  } else if (e.kind === 'map') {
    title = '<span class="emoji">🗺️</span> <b>Mapa del tesoro</b>';
    body.push(`<div class="mut small">El cofre ✖️ está marcado en tu mapa (Nv ${e.m.lvl}). Camina hasta él para desenterrarlo.</div>`);
  }
  return `<div class="bshade" data-a="bsclose"></div><div class="bsheet" role="dialog" aria-label="Ficha del objeto"><div class="ishead">${title}<button class="btn bx" data-a="bsclose" aria-label="Cerrar">✕</button></div>
    <div class="bsb">${body.join('')}${ctx.extra || ''}</div>${act ? `<div class="ibtns">${act}</div>` : ''}</div>`;
}
// Venta rápida: confirmación con la lista
function quickList(level) { const max = level === 'rare' ? 1 : 0; return entries('equip').filter(e => e.r <= max && !e.it.lk); }
function quickHTML() {
  const l = quickList(B.quick), tot = l.reduce((a, e) => a + sellPrice(e.it), 0);
  return `<div class="bshade" data-a="bsclose"></div><div class="bsheet" role="dialog" aria-label="Venta rápida"><div class="ishead"><b>💰 Vender todo lo ${B.quick === 'rare' ? 'común y raro' : 'común'}</b><button class="btn bx" data-a="bsclose" aria-label="Cerrar">✕</button></div>
    <div class="bsb">${l.length ? `<p class="small" style="margin:0 0 6px">Se venden <b>${l.length}</b> objeto${l.length === 1 ? '' : 's'} por <b class="goldt">${tot} oro</b>. Nunca se incluye lo 🔒 bloqueado ni lo que llevan puesto.</p><div class="qlist">${l.map(e => `<div>${itemLabel(e.it)} <small class="mut">Nv ${e.lvl} · ${sellPrice(e.it)} oro</small></div>`).join('')}</div>` : '<p class="mut small">No hay nada que vender con ese filtro.</p>'}</div>
    <div class="ibtns"><button class="btn" data-a="bsclose">Cancelar</button>${l.length ? `<button class="btn gold" data-a="bquickok">Vender ${l.length} · ${tot} oro</button>` : ''}</div></div>`;
}
// Selección múltiple: total de lo marcado
export function multiTotal() { let n = 0, g = 0; for (const k of B.picks) { const e = find(k); if (e && sellable(e)) { n++; g += priceOf(e, e.n); } } return { n, g }; }
export function rebuyHTML() {
  if (!SOLD.length) return '';
  return `<div class="sec"><h3>↩️ Recompra <small class="mut">lo que vendiste hace poco, al mismo precio</small></h3>${SOLD.map((s, i) => `<div class="shop"><span>${s.kind === 'gear' ? itemLabel(s.it) : `<span class="emoji">${s.e}</span> <b>${esc(s.n)}</b> ×${s.q}`}</span><button class="btn sm" data-a="brebuy" data-k="${i}" ${G.gold < s.p || (s.kind === 'gear' && G.inventory.length >= INV_MAX) ? 'disabled' : ''}>Recomprar · ${s.p} oro</button></div>`).join('')}</div>`;
}

// ---- Vender (con registro para recomprar) ----
function sold(s) { SOLD.unshift(s); if (SOLD.length > 10) SOLD.length = 10; }
function sellEntry(e, q) {
  if (!sellable(e)) return 0;
  if (e.kind === 'gear') { const i = G.inventory.indexOf(e.it); if (i < 0) return 0; G.inventory.splice(i, 1); const p = sellPrice(e.it); G.gold += p; sold({ kind: 'gear', it: e.it, p }); return p; }
  q = Math.max(1, Math.min(q, e.n)); const p = priceOf(e, q);
  if (e.kind === 'item') G.items[e.k] -= q; else G.mats[e.k] -= q;
  G.gold += p; sold({ kind: e.kind, k: e.k, q, p, e: e.e, n: e.name }); return p;
}

// ---- Acciones (devuelve { msg, use, changed }) ----
export function bagAct(a, k, mode, ctx = {}) {
  if (a !== 'bdis') B.dis = false;
  if (a === 'btab') { B.tab = k; B.sel = null; B.picks.clear(); return { changed: true }; }
  if (a === 'bsort') { const i = SORTS.findIndex(s => s[0] === B.sort); B.sort = SORTS[(i + 1) % SORTS.length][0]; return { changed: true }; }
  if (a === 'bpick') { B.sel = { key: k }; B.qty = 1; return { changed: true }; }
  if (a === 'bslot') { B.sel = { slot: k }; return { changed: true }; }
  if (a === 'bhero') { B.hero = +k; return { changed: true }; }
  if (a === 'bsclose') { B.sel = null; B.quick = null; return { changed: true }; }
  if (a === 'bqty') { const e = B.sel && find(B.sel.key); if (e) B.qty = k === 'max' ? e.n : Math.max(1, Math.min(e.n, B.qty + +k)); return { changed: true }; }
  if (a === 'block') {
    const e = B.sel && find(B.sel.key); if (!e) return {};
    if (e.kind === 'gear') { if (e.it.lk) delete e.it.lk; else e.it.lk = 1; } else { const L = lockK(); if (L[e.key]) delete L[e.key]; else L[e.key] = 1; }
    return { changed: true, save: true, msg: isLocked(e) ? `🔒 ${esc(e.name)} bloqueado: no se puede vender ni desarmar.` : `🔓 ${esc(e.name)} desbloqueado.` };
  }
  if (a === 'bsell') {
    if (!ctx.canSell) return {};
    const e = B.sel && find(B.sel.key); if (!e) return {};
    const p = sellEntry(e, B.qty); if (!p) return {};
    B.sel = e.kind === 'gear' || e.n - B.qty <= 0 ? null : B.sel; B.qty = 1;
    return { changed: true, save: true, sold: true, msg: `💰 Vendiste ${esc(e.name)} por ${p} de oro.` };
  }
  if (a === 'bdis') {
    const e = B.sel && find(B.sel.key); if (!e || e.kind !== 'gear' || e.it.lk) return {};
    if (!B.dis) { B.dis = true; return { changed: true }; }
    B.dis = false; const i = G.inventory.indexOf(e.it), n = dismantleGain(e.it); G.inventory.splice(i, 1); G.frags = (G.frags || 0) + n; B.sel = null;
    return { changed: true, save: true, msg: `🔩 Desarmaste ${esc(e.name)}: +${n} fragmentos.` };
  }
  if (a === 'bequip') {
    const e = B.sel && find(B.sel.key), sel = G.roster[B.hero]; if (!e || e.kind !== 'gear' || !sel || !canUse(sel, e.it)) return {};
    const it = e.it, sl = slotOf(it), prev = sel.equip[sl];
    changeEquip(sel, () => { G.inventory.splice(G.inventory.indexOf(it), 1); sel.equip[sl] = it; if (prev) G.inventory.push(prev); });
    B.sel = null; return { changed: true, save: true, msg: `⚔️ ${esc(sel.name)} se equipó ${esc(it.n)}.` };
  }
  if (a === 'bunequip') {
    const sel = heroSel(), sl = B.sel && B.sel.slot, it = sl && sel.equip[sl]; if (!it || G.inventory.length >= INV_MAX) return {};
    changeEquip(sel, () => { delete sel.equip[sl]; G.inventory.push(it); }); B.sel = null;
    return { changed: true, save: true, msg: `🎒 ${esc(it.n)} volvió a la mochila.` };
  }
  if (a === 'buse') { const e = B.sel && find(B.sel.key); if (!e || e.kind !== 'item') return {}; B.sel = null; return { changed: true, use: e.k }; }
  // Selección múltiple
  if (a === 'bmulti') { B.multi = !B.multi; B.picks.clear(); B.sel = null; return { changed: true }; }
  if (a === 'bmt') { if (B.picks.has(k)) B.picks.delete(k); else B.picks.add(k); return { changed: true }; }
  if (a === 'bmsell') {
    if (!ctx.canSell) return {};
    const list = [...B.picks].map(find).filter(e => e && sellable(e)); let g = 0;
    for (const e of list) g += sellEntry(e, e.n);
    B.picks.clear(); B.multi = false;
    return { changed: true, save: true, sold: true, msg: list.length ? `💰 Vendiste ${list.length} objeto${list.length === 1 ? '' : 's'} por ${g} de oro.` : '' };
  }
  // Venta rápida
  if (a === 'bquick') { B.quick = k; B.sel = null; return { changed: true }; }
  if (a === 'bquickok') {
    if (!ctx.canSell || !B.quick) return {};
    const l = quickList(B.quick); let g = 0; for (const e of l) g += sellEntry(e, 1);
    B.quick = null; return { changed: true, save: true, sold: true, msg: `💰 Venta rápida: ${l.length} objeto${l.length === 1 ? '' : 's'} por ${g} de oro.` };
  }
  if (a === 'brebuy') {
    const s = SOLD[+k]; if (!s || G.gold < s.p) return {};
    if (s.kind === 'gear') { if (!addItem(s.it)) return { msg: '🎒 La mochila está llena.' }; }
    else if (s.kind === 'item') G.items[s.k] = (G.items[s.k] || 0) + s.q; else { G.mats = G.mats || {}; G.mats[s.k] = (G.mats[s.k] || 0) + s.q; }
    G.gold -= s.p; SOLD.splice(+k, 1);
    return { changed: true, save: true, msg: `↩️ Recompraste ${s.kind === 'gear' ? esc(s.it.n) : esc(s.n) + ' ×' + s.q} por ${s.p} de oro.` };
  }
  return null;
}
// Al cerrar la mochila: lo nuevo ya se vio
export function bagClosed() { if (B.seenEquip) for (const it of G.inventory) delete it.nw; B.seenEquip = false; B.sel = null; B.quick = null; B.multi = false; B.picks.clear(); }
// Buscador: filtra sin volver a dibujar (no se pierde el teclado)
export function wireBag(root) {
  const q = root.querySelector('#bagQ'); if (!q) return;
  const apply = () => { const t = B.q.trim().toLowerCase(); let vis = 0; root.querySelectorAll('.bcell').forEach(c => { const ok = !t || c.dataset.n.includes(t); c.classList.toggle('hidden', !ok); if (ok) vis++; }); const none = root.querySelector('.bnone'); if (none) none.classList.toggle('hidden', vis > 0 || !t); };
  q.addEventListener('input', () => { B.q = q.value; apply(); });
  apply();
}
