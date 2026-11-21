// Interfaz de los usos del oro (Versión 3 · Fase 5): elixires, forja, mercader ambulante, entrenador,
// apariencias y tablón de construcción de Ciudad Origen. ui.js las muestra dentro de la ventana de la aldea.
'use strict';
import { esc } from './util.js';
import { ELIX, COS, ALT_EMOJIS, ALT_PRICE, CITY, CITY_GOALS, FORGE_MAX, CL, FRAG_VALUE } from './data.js';
import { G, S, heroes, clsName, changeEquip } from './state.js';
import { net } from './net.js';
import { itemLabel, statList, statsOf, RAR, STAT, TYPES, SLOTS, INV_MAX } from './items.js';
import { forgeCost, forgeFail, forgePay, forge, extrasOf, reforgeCost, reforge, dismantleGain, dismantle, elixPrice, buyElix, elixLeft,
  trainMax, trainCost, trainTo, train, merchVillage, merchStock, merchBought, buyMerch, cosOwned, buyCos, wearCos, altOwned, buyAlt, baseE, setHeroE,
  donate, cityLvl } from './economy.js';

const fmt = n => Math.round(n).toLocaleString('es-CL');
const mmss = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---- Elixires (en la tienda de cualquier aldea)
export function elixRows() {
  return Object.entries(ELIX).map(([k, x]) => { const p = elixPrice(k), left = elixLeft(k);
    return `<div class="shop"><span><span class="emoji">${x.e}</span> <b>${x.n}</b> <small class="mut">${x.d} · 30 min${left ? ` · <b class="goldt">activo ${mmss(left)}</b>` : ''}</small></span><button class="btn sm" data-a="elix" data-k="${k}" ${G.gold < p ? 'disabled' : ''}>${left ? '+30 min' : 'Comprar'} · ${fmt(p)} oro</button></div>`; }).join('');
}

// ---- Forja (en la herrería)
let FSEL = null;   // { src: 'inv'|'eq', i, h, sl }
const allGear = () => [...heroes().flatMap(h => Object.entries(h.equip || {}).filter(([, it]) => it).map(([sl, it]) => ({ src: 'eq', h: G.roster.indexOf(h), sl, it, who: h.e + ' ' + h.name }))),
  ...(G.inventory || []).map((it, i) => ({ src: 'inv', i, it, who: 'Inventario' }))];
const selIt = () => { if (!FSEL) return null; if (FSEL.src === 'eq') { const h = G.roster[FSEL.h]; return h && h.equip && h.equip[FSEL.sl]; } return (G.inventory || [])[FSEL.i]; };
export function forgeHTML() {
  const list = allGear(), it = selIt();
  let h = `<h2>⚒️ Forja</h2><p class="mut" style="margin:0">Cada nivel sube los stats ~8% (máx. +10). Desde +5 puede fallar: se pierde el oro, pero el objeto nunca se rompe ni baja. Tienes 💰 ${fmt(G.gold)} · 🔩 ${G.frags || 0} fragmentos (cada uno vale ${FRAG_VALUE} de oro y pagan hasta la mitad).${cityLvl('herreria') ? ` <b class="goldt">Herrería de Ciudad Origen Nv ${cityLvl('herreria')}: −${5 * cityLvl('herreria')} puntos de fallo.</b>` : ''}</p>`;
  if (it) {
    const up = it.up || 0, max = up >= FORGE_MAX, c = forgeCost(it), pay = forgePay(c), fail = forgeFail(it);
    const next = max ? null : Object.assign({}, it, { up: up + 1 });
    h += `<div class="isheet forge" style="border-color:${RAR[it.r].c}"><div class="ishead">${itemLabel(it)}<button class="btn sm" data-a="fclose" aria-label="Cerrar">✕</button></div>
      <div class="mut small">${RAR[it.r].n} · Nv ${it.ilvl} · ${SLOTS[TYPES[it.t].slot].n}</div>
      <div class="fstats">${statList(statsOf(it)).join(' · ')}${next ? `<br><span class="goldt">→ +${up + 1}: ${statList(statsOf(next)).join(' · ')}</span>` : ''}</div>
      ${max ? '<p class="goldt">Está al máximo (+10).</p>' : `<button class="btn gold full" data-a="fup" ${G.gold < pay.gold ? 'disabled' : ''}>⚒️ Mejorar a +${up + 1} · ${fmt(pay.gold)} oro${pay.frags ? ` + ${pay.frags} 🔩` : ''}${fail ? ` · ${fail}% de fallar` : ''}</button>`}
      ${extrasOf(it).length ? `<div class="fsub"><b>🔁 Reforjar</b> <small class="mut">vuelve a sortear una propiedad extra · ${fmt(reforgeCost(it))} oro</small><div class="frow">${extrasOf(it).map(k => `<button class="btn sm" data-a="fre" data-k="${k}" ${G.gold < reforgeCost(it) ? 'disabled' : ''}>${STAT[k]} ${it.st[k]}</button>`).join('')}</div></div>` : '<p class="mut small">Los objetos Comunes no tienen propiedades extra para reforjar.</p>'}
      ${FSEL.src === 'inv' ? `<button class="btn full" data-a="fdis">🔩 Desarmar: +${dismantleGain(it)} fragmentos${FSEL.drop ? ' · ⚠️ toca otra vez' : ''}</button>` : '<p class="mut small">Para desarmarlo, primero quítaselo al héroe.</p>'}
    </div>`;
  }
  h += `<div class="ilist">${list.map(x => `<button class="irow ${FSEL && FSEL.src === x.src && (x.src === 'inv' ? FSEL.i === x.i : FSEL.h === x.h && FSEL.sl === x.sl) ? 'on' : ''}" data-a="fsel" data-k="${x.src === 'inv' ? 'i:' + x.i : 'e:' + x.h + ':' + x.sl}" style="border-left-color:${RAR[x.it.r].c}"><span class="in">${itemLabel(x.it)}<small class="mut">${x.who} · ${RAR[x.it.r].n} · ${(x.it.up || 0) >= FORGE_MAX ? 'máximo' : `+1: ${fmt(forgeCost(x.it))} oro`}</small></span></button>`).join('') || '<p class="mut small">No tienes equipo.</p>'}</div>
  <div class="row end"><button class="btn gold" data-a="vback">← Volver a la aldea</button></div>`;
  return h;
}

// ---- Mercader ambulante (solo en su aldea de hoy)
export function merchHTML(f) {
  const v = merchVillage(); if (!v || v.id !== f.id) return '';
  return `<div class="sec merch"><h3>🐪 Mercader ambulante <small class="mut">hoy está aquí; mañana en otra aldea</small></h3>${merchStock().map((s, i) => {
    const done = merchBought(i), label = s.kind === 'gear' ? `${itemLabel(s.it)}<small class="mut">${RAR[s.it.r].n} · Nv ${s.it.ilvl} · ${statList(statsOf(s.it)).slice(0, 3).join(' · ')}</small>` : `<span><span class="emoji">${s.e}</span> <b>${s.n}</b></span><small class="mut">${s.d}</small>`;
    return `<div class="shop"><span class="ishop">${label}</span>${done ? '<span class="qon">✅ Comprado</span>' : `<button class="btn sm gold" data-a="merch" data-k="${i}" ${G.gold < s.p ? 'disabled' : ''}>${fmt(s.p)} oro</button>`}</div>`; }).join('')}</div>`;
}

// ---- Entrenador (Ciudad Origen): héroes de la taberna hasta 2 niveles bajo el mayor
export function trainerHTML() {
  const max = trainMax(), res = G.roster.filter((_, i) => !G.party.includes(i));
  return `<div class="sec"><h3>🎓 Entrenador <small class="mut">héroes de la taberna hasta Nv ${max} (2 menos que tu héroe más alto)</small></h3>
    ${res.map(h => { const i = G.roster.indexOf(h), c1 = h.lvl < max ? trainCost(h.lvl) : 0, cm = h.lvl < max ? trainTo(h, max) : 0;
      return `<div class="shop"><span>${h.e} <b>${h.name}</b> <small class="mut">${clsName(h)} · Nv ${h.lvl}</small></span>${h.lvl < max ? `<span class="arbtns"><button class="btn sm" data-a="train1" data-k="${i}" ${G.gold < c1 ? 'disabled' : ''}>+1 Nv · ${fmt(c1)}</button><button class="btn sm gold" data-a="trainmax" data-k="${i}" ${G.gold < cm ? 'disabled' : ''}>Nv ${max} · ${fmt(cm)}</button></span>` : '<span class="mut small">Listo</span>'}</div>`; }).join('') || '<p class="mut small">Todos tus héroes están en el grupo.</p>'}</div>`;
}

// ---- Ciudad Origen: botones a la tienda de apariencias y al tablón de construcción
export function cityBtnsHTML() {
  const lv = Object.keys(CITY).reduce((a, k) => a + cityLvl(k), 0);
  return `<div class="sec"><h3>🏰 Ciudad Origen</h3>
    <div class="shop"><span>🏗️ <b>Tablón de construcción</b> <small class="mut">la sala dona oro para mejorar la ciudad · ${lv}/18 mejoras</small></span><button class="btn sm gold" data-a="cityview">Abrir</button></div>
    <div class="shop"><span>🎨 <b>Apariencias</b> <small class="mut">anillos, auras, marcos, emojis y accesorios (solo visuales)</small></span><button class="btn sm" data-a="cosview">Abrir</button></div></div>`;
}
// ---- Tablón de construcción
export function cityHTML() {
  const c = net.city;
  if (!net.joined || !c) return `<h2>🏗️ Tablón de construcción</h2><p class="mut">Necesitas conexión con el servidor: los proyectos son de toda la sala.</p><div class="row end"><button class="btn gold" data-a="vback">← Volver</button></div>`;
  const top = Object.entries(c.donors || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return `<h2>🏗️ Tablón de construcción</h2><p class="mut" style="margin:0">Todos los de la sala donan a los mismos proyectos (3 niveles cada uno). Tienes 💰 ${fmt(G.gold)}.</p>
    ${Object.entries(CITY).map(([k, x]) => { const p = c.p[k] || { lvl: 0, don: 0 }, done = p.lvl >= CITY_GOALS.length, goal = CITY_GOALS[p.lvl];
      return `<div class="sec cityp"><div class="cph"><span class="emoji">${x.e}</span><b>${x.n}</b><span class="cplv">${'★'.repeat(p.lvl)}${'☆'.repeat(3 - p.lvl)}</span></div>
        ${p.lvl ? `<small class="goldt">Ahora: ${x.d[p.lvl - 1]}</small>` : ''}
        ${done ? '<small class="mut">¡Completo!</small>' : `<small class="mut">Nivel ${p.lvl + 1}: ${x.d[p.lvl]}</small><span class="wbbar sm"><i style="width:${Math.round(100 * p.don / goal)}%"></i><span>${fmt(p.don)} / ${fmt(goal)}</span></span>
        <div class="frow">${[100, 500, 2000].map(n => `<button class="btn sm" data-a="don" data-k="${k}:${n}" ${G.gold < n ? 'disabled' : ''}>+${fmt(n)}</button>`).join('')}<button class="btn sm gold" data-a="don" data-k="${k}:${Math.min(G.gold, goal - p.don)}" ${G.gold < 1 ? 'disabled' : ''}>Completar (${fmt(Math.min(G.gold, goal - p.don))})</button></div>`}</div>`; }).join('')}
    <h3>🗿 Quienes más donaron</h3>${top.map(([n, v], i) => `<div class="rkrow ${n === net.name ? 'me' : ''}"><span>${['🥇', '🥈', '🥉', '4.', '5.'][i]} ${esc(n)}</span><b>${fmt(v)}</b></div>`).join('') || '<p class="mut small">Aún nadie dona.</p>'}
    <div class="row end"><button class="btn gold" data-a="vback">← Volver a la aldea</button></div>`;
}
// ---- Tienda de apariencias
export function cosHTML() {
  const c = G.cos || {}, groups = [['ring', '💫 Anillo bajo el héroe'], ['aura', '🌟 Aura del grupo'], ['frame', '🏷️ Marco del nombre'], ['acc', '🐾 Accesorio de la mascota']];
  let h = `<h2>🎨 Apariencias</h2><p class="mut" style="margin:0">Solo visuales: no dan ventajas. Tus compañeros las ven. Tienes 💰 ${fmt(G.gold)}.</p>`;
  for (const [k, title] of groups) h += `<div class="sec"><h3>${title}</h3>${Object.entries(COS).filter(([, x]) => x.k === k).map(([id, x]) => {
    const own = cosOwned(id), on = c[k] === id;
    return `<div class="shop"><span><span class="emoji">${x.e}</span> <b>${x.n}</b>${on ? ' <span class="qon">✅ Puesto</span>' : ''}</span>${own ? `<button class="btn sm ${on ? '' : 'gold'}" data-a="cwear" data-k="${id}">${on ? 'Quitar' : 'Poner'}</button>` : `<button class="btn sm" data-a="cbuy" data-k="${id}" ${G.gold < x.p ? 'disabled' : ''}>${fmt(x.p)} oro</button>`}</div>`; }).join('')}</div>`;
  h += `<div class="sec"><h3>😀 Emoji alternativo para tus héroes <small class="mut">se compra una vez (${fmt(ALT_PRICE)} oro) y se usa en cualquier héroe</small></h3>
    <div class="altgrid">${ALT_EMOJIS.map(e => `<button class="altb ${altOwned(e) ? 'own' : ''}" data-a="${altOwned(e) ? 'noop' : 'abuy'}" data-k="${e}" ${!altOwned(e) && G.gold < ALT_PRICE ? 'disabled' : ''}><span class="emoji">${e}</span><small>${altOwned(e) ? 'tuyo' : fmt(ALT_PRICE)}</small></button>`).join('')}</div>
    ${heroes().map(hh => { const i = G.roster.indexOf(hh), opts = [baseE(hh), ...ALT_EMOJIS.filter(altOwned)];
      return `<div class="shop"><span><b>${hh.name}</b> <small class="mut">${clsName(hh)}</small></span><span class="frow">${opts.map(e => `<button class="altb sm ${hh.e === e ? 'on' : ''}" data-a="aset" data-k="${i}:${e}"><span class="emoji">${e}</span></button>`).join('')}</span></div>`; }).join('')}</div>
    <div class="row end"><button class="btn gold" data-a="vback">← Volver a la aldea</button></div>`;
  return h;
}

// ---- Acciones (devuelve { msg, view } o null si no es de aquí)
export async function shopAct(a, k) {
  const cr = await craftAct(a, k); if (cr) return cr;
  if (a === 'elix') return buyElix(k) ? { msg: `${ELIX[k].e} ${ELIX[k].n}: activo por 30 minutos más.` } : { msg: 'No te alcanza el oro.' };
  if (a === 'forgeview') { FSEL = null; return { view: 'forge' }; }
  if (a === 'fsel') { const p = k.split(':'); FSEL = p[0] === 'i' ? { src: 'inv', i: +p[1] } : { src: 'eq', h: +p[1], sl: p[2] }; return {}; }
  if (a === 'fclose') { FSEL = null; return {}; }
  if (a === 'fup') { const it = selIt(); if (!it) return {}; const h = FSEL.src === 'eq' ? G.roster[FSEL.h] : null; let r; if (h) changeEquip(h, () => { r = forge(it); }); else r = forge(it); return { msg: r.msg, save: true }; }
  if (a === 'fre') { const it = selIt(); if (!it) return {}; const h = FSEL.src === 'eq' ? G.roster[FSEL.h] : null; let r; if (h) changeEquip(h, () => { r = reforge(it, k); }); else r = reforge(it, k); return { msg: r.ok ? `🔁 Reforjado: ${it.n} ahora tiene ${STAT[r.k]} ${it.st[r.k]}.` : r.msg, save: true }; }
  if (a === 'fdis') { if (!FSEL || FSEL.src !== 'inv') return {}; if (!FSEL.drop) { FSEL.drop = true; return {}; } const n = dismantle(FSEL.i); FSEL = null; return { msg: `🔩 Desarmado: +${n} fragmentos.`, save: true }; }
  if (a === 'merch') { const r = buyMerch(+k); if (!r) return {}; if (!r.ok) return { msg: r.msg }; return { msg: r.map ? '🗺️ ¡Mapa del tesoro! El cofre ✖️ quedó marcado en tu mapa y con una flecha.' : '🐪 ¡Comprado!', save: true }; }
  if (a === 'train1' || a === 'trainmax') { const h = G.roster[+k]; if (!h) return {}; const c = train(h, a === 'train1' ? h.lvl + 1 : trainMax()); return { msg: c ? `🎓 ${h.name} entrenó hasta Nv ${h.lvl} (${fmt(c)} oro).` : 'No se pudo entrenar.', save: true }; }
  if (a === 'cityview') return { view: 'city' };
  if (a === 'cosview') return { view: 'cos' };
  if (a === 'don') { const [pk, n] = k.split(':'); const r = await donate(pk, +n); return { msg: r.ok ? `🏗️ Donaste ${fmt(r.used)} de oro a ${CITY[pk].n}. ¡Gracias!` : r.error, save: !!r.ok }; }
  if (a === 'cbuy') return buyCos(k) ? { msg: `🎨 ${COS[k].n}: comprado y puesto.`, save: true } : { msg: 'No te alcanza el oro.' };
  if (a === 'cwear') { wearCos(k); return { save: true }; }
  if (a === 'abuy') return buyAlt(k, ALT_PRICE) ? { msg: `😀 Ahora puedes usar ${k} en tus héroes.`, save: true } : { msg: 'No te alcanza el oro.' };
  if (a === 'aset') { const [hi, e] = k.split(':'); const h = G.roster[+hi]; if (h) setHeroE(h, e); return { save: true }; }
  if (a === 'noop') return {};
  return null;
}

// ================= Taller: libro de recetas (Versión 3 · Fase 6.1) =================
import { RECIPES, MATS, PROFS, FOODS } from './data.js';
import { prof, profNeed, matN, canCraft, recipeOk, craft, outLabel, foodActive } from './gather.js';
let CT = 'alq';
export function craftHTML(o = {}) {
  if (o.tab) CT = o.tab;
  const tabs = [['alq', '⚗️ Alquimia'], ['herr', '⚒️ Herrería'], ['coc', '🍳 Cocina']], p = prof(CT);
  const f = foodActive();
  const head = o.bare ? `<h3 class="achcat">🛠️ Fabricar</h3>` : `<h2>🛠️ Taller</h2><p class="mut" style="margin:0">Fabrica con tus materiales. Tienes 💰 ${fmt(G.gold)}${G.frags ? ` · 🔩 ${G.frags}` : ''}.${f ? ` Comida activa: ${FOODS[f.k].e} ${FOODS[f.k].n} (${mmss(f.until - Date.now())}).` : ''}</p>
    <div class="tabs tabs3">${tabs.map(([k, l]) => `<button class="tab ${CT === k ? 'on' : ''}" data-a="ctab" data-k="${k}">${l}</button>`).join('')}</div>`;
  return `${head}
    <p class="small">${PROFS[CT].e} <b>${PROFS[CT].n} Nv ${p.lvl}</b> <span class="mut">· XP ${p.xp}/${profNeed(p.lvl)}</span></p>
    <div class="recipes">${RECIPES.filter(r => r.prof === CT).map(r => { const ok = recipeOk(r);
      return `<div class="recipe ${ok ? '' : 'lock'}"><div class="rtop"><b>${outLabel(r)}</b>${ok ? '' : `<span class="mut small">🔒 ${PROFS[r.prof].n} Nv ${r.lv}</span>`}</div>
        <div class="ring">${Object.entries(r.in).map(([k, n]) => `<span class="${matN(k) >= n ? 'have' : 'miss'}">${MATS[k].e} ${MATS[k].n} ${matN(k)}/${n}</span>`).join('')}${r.g ? `<span class="${G.gold >= r.g ? 'have' : 'miss'}">💰 ${r.g}</span>` : ''}</div>
        ${ok ? `<div class="frow"><button class="btn sm gold" data-a="craft" data-k="${r.id}:1" ${canCraft(r) ? '' : 'disabled'}>Fabricar</button><button class="btn sm" data-a="craft" data-k="${r.id}:5" ${canCraft(r, 5) ? '' : 'disabled'}>Fabricar ×5</button></div>` : ''}</div>`; }).join('')}</div>
    ${o.bare ? '' : '<div class="row end"><button class="btn gold" data-a="vback">← Volver a la aldea</button></div>'}`;
}
export async function craftAct(a, k) {
  if (a === 'craftview') return { view: 'craft' };
  if (a === 'ctab') { CT = k; return {}; }
  if (a === 'craft') {
    const [id, n] = k.split(':'); const r = craft(id, +n || 1); if (!r || !r.done) return { msg: 'Te faltan materiales u oro.' };
    const gear = r.res.filter(x => x && typeof x === 'object'), txt = r.res.filter(x => typeof x === 'string');
    return { msg: `🛠️ Fabricaste ${r.done > 1 ? r.done + ' × ' : ''}${outLabel(r.r)}${gear.length ? ': ' + gear.map(itemLabel).join(', ') : ''}${txt.length ? '<br>' + txt.join(' · ') : ''}`, save: true };
  }
  return null;
}
