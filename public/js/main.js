// Arranque: pantalla de inicio (sala + héroes), movimiento en el mapa, entrada y loop principal.
'use strict';
import { $, esc, pick, roomSeed, cleanName } from './util.js';
import { CL, B, IT, CH, BOONS, CODE_ALPHABET, SEA_POOL } from './data.js';
import { G, setG, P, START, st, held, S, mkHero, heroes, avgLvl, leader, START_GOLD, startItems } from './state.js';
import { resetWorld, findStart, tileAt, feats, mpos, monsters, playerBlocked, visitAround, spawnNearby, moveMonsters, inVillage, dangerAt } from './world.js';
import { resize, draw, clearCanvas } from './render.js';
import { startBattle, getBT } from './battle.js';
import { initUI, updateMini, dangerBox, confirmOk, toast, feed, updateHUD, openVillage, openParty, openMap, openBossConfirm, closeModal, isModalOpen, modalIs, toggleSocial, closeSocial, updatePlayersUI } from './ui.js';
import { net, ensureSocket, available, createRoom, joinRoom, leaveRoom, tick, wake, lerpOthers, uploadSave } from './net.js';
import { save, loadGame, removeGame, listSaves, loadPrefs, savePrefs, migrate, writeLocal, backupIfOld, SAVE_VERSION } from './storage.js';
import { rollLoot, addItem, itemLabel, RAR } from './items.js';
import { onArrive, clearQuestCache } from './quests.js';
import { onTomb, recoverTomb, tombExpired } from './tomb.js';
import { initCoop, coopVs, inCoopBattle } from './coop.js';

// ================= Movimiento en el mapa =================
const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
let lastBiome = null, lastToastStep = -99;
function move(dir) {
  const [dx, dy] = DIRS[dir]; if (dx) P.face = dx;
  const nx = P.x + dx, ny = P.y + dy;
  const m = mpos.get(nx + ',' + ny);
  if (m && !inVillage()) { if (m.boss) openBossConfirm(m, startBattle); else startBattle(m); return; }
  if (m) return;
  if (playerBlocked(nx, ny)) return;   // con bote se puede navegar por el mar
  P.x = nx; P.y = ny; G.steps++;
  visitAround();
  if (G.steps % 20 === 0 || Math.floor(nx / CH) !== Math.floor((nx - dx) / CH) || Math.floor(ny / CH) !== Math.floor((ny - dy) / CH)) spawnNearby();
  const b = tileAt(P.x, P.y).b;
  if (b !== lastBiome) { if (G.steps - lastToastStep > 6) { toast(`${B[b].i} ${B[b].n}<br><span style="font-size:13px;color:#cfd5ea">Peligro: Nv ~${dangerAt(P.x, P.y)}</span>`); lastToastStep = G.steps; } lastBiome = b; }
  const f = feats.get(nx + ',' + ny);
  if (f) {
    if (f.type === 'village') openVillage(f);
    else if (f.type === 'chest' && !G.opened[f.id]) openChest(f);
    else if (f.type === 'shrine' && !G.opened[f.id]) useShrine(f);
  }
  // Misiones de entrega y exploración: se cumplen al pisar el lugar
  if (onTomb() && recoverTomb()) { toast('🎒 ¡Recuperaste tus objetos!'); save('now'); }
  const done = onArrive(nx, ny);
  if (done.length) { feed(done.join('<br>')); save('now'); }
  const hit = moveMonsters(); updateHUD();
  if (hit && !st.busy) startBattle(hit);
  // En el mar: encuentros al azar (menos frecuentes que en tierra)
  else if (b === 'WATER' && !st.busy && Math.random() < 1 / 26) seaEncounter();
  if (G.steps % 15 === 0) save();
}
function seaEncounter() {
  const lvl = dangerAt(P.x, P.y), kraken = lvl >= 3 && Math.random() < 1 / 40;
  const n = 1 + Math.floor(Math.random() * (lvl >= 4 ? 3 : 2));
  const m = { id: 'sea@' + P.x + ',' + P.y + '#' + G.steps, sea: true, x: P.x, y: P.y, biome: 'WATER', lvl: kraken ? lvl + 1 : lvl, boss: kraken,
    group: kraken ? ['kraken', pick(SEA_POOL)] : Array.from({ length: n }, () => pick(SEA_POOL)) };
  if (kraken) openBossConfirm(m, startBattle); else startBattle(m);
}
function openChest(f) {
  G.opened[f.id] = 1; const d = Math.hypot(f.x - START.x, f.y - START.y), r = Math.random();
  // 50%: equipo del nivel de la zona (mejor rareza mientras más lejos)
  if (Math.random() < .5) {
    const it = rollLoot(dangerAt(f.x, f.y), Math.min(1, d / 400));
    if (addItem(it)) { toast(`📦 Cofre: ${itemLabel(it)}<br><span style="font-size:13px;color:${RAR[it.r].c}">${RAR[it.r].n} · Nv ${it.ilvl}</span>`); save(); return; }
    toast('🎒 Inventario lleno: el cofre tenía equipo, pero no cabe');
  }
  if (r < .55) { const g = Math.round((12 + Math.random() * 20) * (1 + d / 40) * (heroes().some(h => h.cls === 'enano') ? 1.25 : 1)); G.gold += g; toast(`📦 Cofre: +${g} de oro`); }
  else { const k = r < .8 ? 'pocion' : r < .93 ? 'eter' : 'pluma', n = k === 'pocion' ? 2 : 1; G.items[k] += n; toast(`📦 Cofre: ${IT[k].e} ${IT[k].n} ×${n}`); }
  save();
}
function useShrine(f) {
  G.opened[f.id] = 1; const b = pick(BOONS); for (const h of G.roster) h.bonus[b[0]] = (h.bonus[b[0]] || 0) + b[1];
  for (const h of heroes()) if (h.hp > 0) { h.hp = S(h, 'mhp'); h.mp = S(h, 'mmp'); h.poison = 0; }
  toast(`⛩️ Santuario antiguo<br><span style="font-size:14px">${b[2]} para todos los héroes · grupo restaurado</span>`); save();
}
// Estado que ven los demás
const curStatus = () => (getBT() || inCoopBattle()) ? 'battle' : (inVillage() || modalIs('village')) ? 'village' : 'map';
const myState = () => ({ x: P.x, y: P.y, leaderEmoji: leader().e, avgLvl: Math.round(avgLvl() * 10) / 10, biome: tileAt(P.x, P.y).b, status: curStatus(), tomb: G.tomb ? [G.tomb.x, G.tomb.y] : null, vs: coopVs() });

// ================= Entrada: teclado =================
const KEYMAP = { arrowup: 'u', w: 'u', arrowdown: 'd', s: 'd', arrowleft: 'l', a: 'l', arrowright: 'r', d: 'r' };
addEventListener('keydown', e => {
  if (st.titleOpen || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (getBT()) {
    const n = parseInt(k, 10); const btns = [...document.querySelectorAll('#b-menu button')];
    if (n >= 1 && n <= 9 && btns[n - 1] && !btns[n - 1].disabled) { btns[n - 1].click(); e.preventDefault(); }
    else if ((k === 'enter' || k === ' ') && btns.length === 1) { btns[0].click(); e.preventDefault(); }
    else if (k === 'escape') { const c = btns.find(b => /Cancelar|Volver/.test(b.textContent)); if (c) c.click(); }
    return;
  }
  if (isModalOpen()) { if (k === 'escape' || (k === 'g' && modalIs('party')) || (k === 'm' && modalIs('map'))) closeModal(); return; }
  // Una tecla que quedó apretada mientras se abría una ventana no vuelve a caminar sola
  if (KEYMAP[k]) { e.preventDefault(); if (e.repeat && !held.includes(KEYMAP[k])) return; if (!held.includes(KEYMAP[k])) { held.push(KEYMAP[k]); tapDir = KEYMAP[k]; } }
  else if (k === 'g') openParty(); else if (k === 'm') openMap(); else if (k === 'c') toggleSocial(); else if (k === 'escape') closeSocial();
});
addEventListener('keyup', e => { const d = KEYMAP[e.key.toLowerCase()]; if (d) { const i = held.indexOf(d); if (i >= 0) held.splice(i, 1); } });
addEventListener('blur', () => held.clear());

// ================= Entrada: cruceta táctil (mantener presionado para caminar) =================
// Toda la cruceta funciona como un joystick: la dirección sale del ángulo del dedo,
// así que se puede deslizar entre flechas sin levantar el dedo.
const dpad = $('#dpad'); let dpPointer = null, dpDir = null, lastMove = 0, tapDir = null; // tapDir: un toque corto igual avanza una casilla
function dpSet(d) {
  if (dpDir === d && (d === null || held.includes(d))) return;
  if (dpDir) { const i = held.indexOf(dpDir); if (i >= 0) held.splice(i, 1); }
  dpDir = d; if (d && !held.includes(d)) { held.push(d); tapDir = d; }
  dpad.querySelectorAll('[data-d]').forEach(b => b.classList.toggle('on', b.dataset.d === d));
}
function dirAt(e) {
  const r = dpad.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  if (Math.hypot(dx, dy) < r.width * .12) return dpDir; // zona muerta al centro
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'd' : 'u');
}
dpad.addEventListener('pointerdown', e => { e.preventDefault(); dpPointer = e.pointerId; try { dpad.setPointerCapture(e.pointerId); } catch (_) { /* nada */ } lastMove = 0; dpSet(dirAt(e)); });
dpad.addEventListener('pointermove', e => { if (e.pointerId === dpPointer) dpSet(dirAt(e)); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) dpad.addEventListener(ev, e => { if (e.pointerId === dpPointer) { dpPointer = null; dpSet(null); } });
addEventListener('contextmenu', e => { if (e.target.tagName !== 'INPUT') e.preventDefault(); });
document.addEventListener('gesturestart', e => e.preventDefault()); // evita zoom con pellizco en iOS

// ================= Loop principal =================
let lastT = 0;
function frame(t) {
  const dt = Math.min(.05, (t - lastT) / 1000 || 0); lastT = t;
  if (st.inGame && !st.titleOpen) {
    if (st.busy) tapDir = null;
    else if ((held.length || tapDir) && t - lastMove > 140) { move(held.length ? held[held.length - 1] : tapDir); lastMove = t; tapDir = null; }
    const a = 1 - Math.exp(-dt * 20); P.px += (P.x - P.px) * a; P.py += (P.y - P.py) * a;
    if (Math.abs(P.x - P.px) > 3 || Math.abs(P.y - P.py) > 3) { P.px = P.x; P.py = P.y; }
    for (const m of monsters.values()) { m.px += (m.x - m.px) * a; m.py += (m.y - m.py) * a; }
    lerpOthers(dt);
    if (t - lastTombCheck > 2000) { lastTombCheck = t; checkTomb(); }
    draw(t);
    updateMini(t);
    tick(t, myState);
  }
  requestAnimationFrame(frame);
}

// ================= Partidas =================
let lastTombCheck = 0;
function checkTomb() { if (tombExpired()) { toast('⌛ Se acabaron los 60 minutos: los objetos de tu tumba 🪦 se perdieron'); save('now'); updateHUD(); } }
function enterWorld() {
  st.titleOpen = false; st.inGame = true; $('#title').classList.add('hidden');
  ['#hud', '#topright', '#dock', '#dpad'].forEach(s => $(s).classList.remove('hidden'));
  P.px = P.x; P.py = P.y; visitAround(); spawnNearby(); lastBiome = tileAt(P.x, P.y).b; lastToastStep = -99;
  updateHUD(); updatePlayersUI(); checkTomb(); updateMini(); save('now');
}
function newGame(sel) {
  st.seed = roomSeed(st.room); clearQuestCache(); resetWorld(); Object.assign(START, { x: 0, y: 0 }); Object.assign(START, findStart());
  const keys = Object.keys(CL);
  setG({ saveVersion: SAVE_VERSION, deaths: 0, inventory: [], quests: [], qtrack: null, board: {}, boat: false, extraFeats: [], vv: { ['village@' + START.x + ',' + START.y]: { x: START.x, y: START.y, name: 'Ciudad Origen' } }, seed: st.seed, room: st.room, start: { x: START.x, y: START.y }, gold: START_GOLD, items: startItems(), roster: keys.map((k, i) => mkHero(k, i)), party: sel.map(k => keys.indexOf(k)), leader: keys.indexOf(sel[0]),
    upA: 0, upD: 0, opened: {}, defeated: {}, steps: 0, lastVillage: { x: START.x, y: START.y }, visited: {}, bosses: 0 });
  P.x = START.x; P.y = START.y; enterWorld();
  setTimeout(() => toast('🏰 Ciudad Origen<br><span style="font-size:14px">Explora en cualquier dirección. ¡Cuidado con los monstruos!</span>'), 300);
}
function continueGame(s) {
  clearQuestCache(); setG(migrate(s)); st.seed = roomSeed(st.room); Object.assign(START, G.start || findStart()); resetWorld();
  if (!G.start) G.start = { x: START.x, y: START.y };
  G.vv = G.vv || {}; const sid = 'village@' + START.x + ',' + START.y;   // Ciudad Origen siempre está en el portal
  if (!G.vv[sid]) G.vv[sid] = { x: START.x, y: START.y, name: 'Ciudad Origen' };
  for (const h of G.roster) { if (h.hp < 0) h.hp = S(h, 'mhp'); if (h.mp < 0) h.mp = S(h, 'mmp'); }   // héroes nuevos (Versión 2)
  P.x = G.pos ? G.pos.x : START.x; P.y = G.pos ? G.pos.y : START.y; enterWorld();
}

// ================= Pantalla de inicio =================
function hideGameUI() { ['#hud', '#topright', '#dock', '#dpad', '#battle', '#modal', '#social'].forEach(s => $(s).classList.add('hidden')); }
function showLobby(msg) {
  st.titleOpen = true; st.inGame = false; st.busy = false; held.clear(); hideGameUI(); clearCanvas();
  $('#title').classList.remove('hidden'); $('#scrLobby').classList.remove('hidden'); $('#scrHeroes').classList.add('hidden');
  const pr = loadPrefs(); if (!$('#nameIn').value && pr.name) $('#nameIn').value = pr.name;
  if (!$('#codeIn').value && pr.code) $('#codeIn').value = pr.code;
  if (!$('#pinIn').value && pr.pin) $('#pinIn').value = pr.pin;
  lobbyMsg(msg || ''); lockLobby(false); $('#lobbyConfirm').innerHTML = '';
}
function lobbyMsg(html, kind) { const m = $('#lobbyMsg'); m.innerHTML = html; m.className = 'msg' + (kind ? ' ' + kind : ''); }
function lockLobby(on) { for (const id of ['#createBtn', '#joinBtn', '#offlineBtn']) $(id).disabled = on; }
const readCode = () => { const c = $('#codeIn').value.toUpperCase().replace(/[^A-Z]/g, ''); return c.length === 4 && [...c].every(ch => CODE_ALPHABET.includes(ch)) ? c : null; };
function readName() {
  const n = cleanName($('#nameIn').value);
  if (!n) { lobbyMsg('Escribe tu nombre (máximo 12 caracteres).', 'err'); $('#nameIn').focus(); return null; }
  $('#nameIn').value = n; return n;
}
// PIN de 4 dígitos (solo cuando el servidor tiene guardado en base de datos)
let dbOn = false;
const readPin = () => { const p = $('#pinIn').value.trim(); return /^\d{4}$/.test(p) ? p : null; };
function showPin(focus) { $('#pinRow').classList.remove('hidden'); if (focus) $('#pinIn').focus(); }
const randomCode = () => Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
const offlineHint = ' <button class="btn sm" id="offHint">Jugar sin conexión</button>';

async function enterRoom(code, name) {
  const pin = readPin();
  // ¿Hay partida local para esta sala? (sin importar mayúsculas en el nombre)
  const mine = listSaves(name).find(x => x.code === code);
  const r = await joinRoom(code, name, !!mine, pin);
  if (!r.ok) {
    lockLobby(false);
    if (r.needPin) { $('#codeIn').value = code; showPin(true); $('#pinIn').select(); }
    lobbyMsg(esc(r.error || 'No se pudo entrar a la sala.') + (r.timeout ? offlineHint : ''), 'err');
    const b = $('#offHint'); if (b) b.onclick = () => $('#offlineBtn').click();
    return;
  }
  const canon = net.name || name;   // el servidor puede devolver el nombre con sus mayúsculas originales
  // ¿Qué partida usar? La más reciente entre la del servidor y la de este celular.
  const local = loadGame(code, canon) || (canon !== name ? loadGame(code, name) : null) || (mine ? loadGame(code, mine.name) : null);
  if (net.serverSave) backupIfOld(code, canon, JSON.stringify(net.serverSave));   // copia intacta antes de migrar
  const server = net.serverSave ? migrate(net.serverSave) : null;
  if (server && (!local || (server.savedAt || 0) >= (local.savedAt || 0))) writeLocal(code, canon, server);
  else if (local) { writeLocal(code, canon, local); uploadSave(local); } // primera vez: se sube la partida local
  st.room = code; st.name = canon; st.online = true; savePrefs({ name: canon, code, pin: pin || undefined });
  $('#nameIn').value = canon; showHeroes();
  if (net.db) feed('☁️ Tu partida se guarda en el servidor');
}
// Si ya hay una partida guardada con este nombre, crear una sala nueva empieza desde cero en OTRO mundo:
// se avisa y se pregunta (la partida anterior no se borra; sigue en su sala).
let createOk = false;
function warnNewRoom(name) {
  const saves = listSaves(name); if (!saves.length) return false;
  const s = saves[0], more = saves.length - 1;
  $('#lobbyConfirm').innerHTML = `<div class="danger warn">
    <b>⚠️ Ya tienes una partida como ${esc(s.name)}</b>
    <p>Está en la sala <b>${s.code}</b> (${s.heroes} · ${s.steps} pasos)${more ? ` y tienes ${more} partida${more > 1 ? 's' : ''} más en otras salas` : ''}.</p>
    <p>Si creas una sala nueva, <b>empiezas desde cero en otro mundo</b>: tus héroes, niveles, oro y equipo no se traspasan. Tu partida no se borra: para seguirla, entra con el código <b>${s.code}</b>.</p>
    <p><b>¿Quieres crear una sala nueva igual?</b></p>
    <div class="cfbtns"><button class="btn gold" id="lcKeep">No, seguir en ${s.code}</button><button class="btn dangerbtn" id="lcNew">Sí, crear sala nueva</button></div>
  </div>`;
  $('#lcKeep').onclick = () => { $('#lobbyConfirm').innerHTML = ''; $('#codeIn').value = s.code; $('#nameIn').value = s.name; $('#joinBtn').click(); };
  $('#lcNew').onclick = () => { $('#lobbyConfirm').innerHTML = ''; createOk = true; $('#createBtn').click(); };
  $('#lobbyConfirm').scrollIntoView({ block: 'center' });
  return true;
}
$('#createBtn').onclick = async () => {
  const name = readName(); if (!name) return;
  if (!available()) { lobbyMsg('No se pudo cargar la conexión con el servidor.' + offlineHint, 'err'); const b = $('#offHint'); if (b) b.onclick = () => $('#offlineBtn').click(); return; }
  if (dbOn && !readPin()) { showPin(true); lobbyMsg('Elige un PIN de 4 dígitos para proteger tu personaje.', 'err'); return; }
  if (!createOk && warnNewRoom(name)) { lobbyMsg(''); return; }
  createOk = false; $('#lobbyConfirm').innerHTML = '';
  lockLobby(true); lobbyMsg('Creando sala…');
  const r = await createRoom();
  if (!r.ok) { lockLobby(false); lobbyMsg(esc(r.error || 'No se pudo crear la sala.') + offlineHint, 'err'); const b = $('#offHint'); if (b) b.onclick = () => $('#offlineBtn').click(); return; }
  lobbyMsg('Entrando a la sala…'); await enterRoom(r.code, name);
};
$('#joinBtn').onclick = async () => {
  $('#lobbyConfirm').innerHTML = '';
  const name = readName(); if (!name) return;
  const code = readCode(); if (!code) { lobbyMsg('El código tiene 4 letras (sin O ni I). Ej: KTRX', 'err'); $('#codeIn').focus(); return; }
  if (!available()) { lobbyMsg('No se pudo cargar la conexión con el servidor.' + offlineHint, 'err'); const b = $('#offHint'); if (b) b.onclick = () => $('#offlineBtn').click(); return; }
  lockLobby(true); lobbyMsg('Conectando…'); await enterRoom(code, name);
};
$('#offlineBtn').onclick = () => {
  const name = readName(); if (!name) return;
  const code = readCode() || randomCode();
  if (net.joined) leaveRoom();
  st.room = code; st.name = name; st.online = false; savePrefs({ name, code }); showHeroes();
};
$('#codeIn').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); });
$('#codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinBtn').click(); });
$('#pinIn').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
$('#pinIn').addEventListener('keydown', e => { if (e.key === 'Enter') (readCode() ? $('#joinBtn') : $('#createBtn')).click(); });
// ¿El servidor tiene guardado en base de datos? Si sí, se pide PIN.
fetch('health', { cache: 'no-store' }).then(r => r.json()).then(h => { dbOn = h && h.db === 'ok'; if (dbOn) showPin(false); }).catch(() => { /* sin servidor: modo individual */ });

// Selección de héroes (igual que en la referencia)
let SEL = ['guerrero', 'maga', 'sanadora'];
function renderClasses() {
  $('#clsel').innerHTML = Object.keys(CL).map(k => { const c = CL[k]; return `<div class="cls ${SEL.includes(k) ? 'sel' : ''}" data-c="${k}"><div class="em emoji">${c.e}</div><b>${c.name}</b><span class="goldt" style="font-size:13px">${c.n}</span><small>${c.d}</small><div class="st">PV ${c.b.mhp} · PM ${c.b.mmp} · ATQ ${c.b.atk} · MAG ${c.b.mag}</div></div>`; }).join('');
  document.querySelectorAll('.cls').forEach(el => el.onclick = () => { const k = el.dataset.c, i = SEL.indexOf(k); if (i >= 0) { if (SEL.length > 1) SEL.splice(i, 1); } else if (SEL.length < 3) SEL.push(k); else { SEL.shift(); SEL.push(k); } renderClasses(); });
  $('#startBtn').textContent = `⚔️ Comenzar aventura (${SEL.length} ${SEL.length === 1 ? 'héroe' : 'héroes'})`;
}
function renderRoomInfo() {
  if ($('#scrHeroes').classList.contains('hidden')) return;
  $('#roomCode').textContent = st.room;
  $('#roomConn').textContent = !st.online ? '⚪ Sin conexión (juego individual)' : net.status === 'on' ? '🟢 Conectado' : '🟡 Reconectando…';
  const names = [`${esc(st.name)} (tú)`, ...[...net.others.values()].map(o => esc(o.name) + (o.online === false ? ' 📴' : ''))];
  $('#roomPlayers').innerHTML = st.online ? `👥 En la sala: ${names.join(', ')}` : '';
  $('#shareBtn').classList.toggle('hidden', !st.online);
}
function showHeroes() {
  st.titleOpen = true; st.inGame = false; st.busy = false; hideGameUI(); clearCanvas();
  $('#title').classList.remove('hidden'); $('#scrLobby').classList.add('hidden'); $('#scrHeroes').classList.remove('hidden');
  renderClasses(); renderRoomInfo(); $('#ngConfirm').innerHTML = '';
  const s = loadGame(st.room, st.name);
  $('#contWrap').innerHTML = s ? `<button class="btn gold big" id="contBtn">▶ Continuar (${s.roster.filter((_, i) => s.party.includes(i)).map(h => h.e + ' Nv ' + h.lvl).join(' · ')} · ${s.steps} pasos)</button><p class="mut small" style="text-align:center;margin:6px 0 0">Comenzar una aventura nueva borra la partida guardada (se pide confirmar).</p>` : '';
  if (s) $('#contBtn').onclick = () => continueGame(s);
}
// Si ya hay una partida guardada, empezar otra la borra: se pide escribir CONFIRMAR
$('#startBtn').onclick = () => {
  if (!loadGame(st.room, st.name)) { newGame(SEL.slice()); return; }
  const box = $('#ngConfirm');
  box.innerHTML = dangerBox('¿Empezar una aventura nueva?', 'id="cfGo"', 'id="cfCancel"');
  $('#cfCancel').onclick = () => { box.innerHTML = ''; };
  $('#cfGo').onclick = () => { if (!confirmOk($('#cfIn').value)) return; box.innerHTML = ''; removeGame(st.room, st.name); newGame(SEL.slice()); };
  box.scrollIntoView({ block: 'center' }); $('#cfIn').focus();
};
$('#leaveBtn').onclick = () => { $('#ngConfirm').innerHTML = ''; leaveRoom(); showLobby(); };
$('#shareBtn').onclick = async () => {
  const text = `¡Juguemos Tierras Sin Fin! Sala ${st.room}`, url = location.origin;
  try { if (navigator.share) { await navigator.share({ title: 'Tierras Sin Fin', text, url }); return; } } catch (_) { return; }
  try { await navigator.clipboard.writeText(`${text} → ${url}`); feed('📋 Código copiado'); } catch (_) { feed(`Código de sala: <b>${esc(st.room)}</b>`); }
};

// ================= Conexión con la capa online =================
net.ev.players = () => { updatePlayersUI(); renderRoomInfo(); };
net.ev.feed = html => feed(html);
net.ev.status = () => { updateHUD(); updatePlayersUI(); renderRoomInfo(); };
net.ev.saveData = () => st.inGame ? G : null;   // lo que se sube al servidor

initCoop();
initUI({
  onNewGame: () => { removeGame(st.room, st.name); showHeroes(); },
  onExit: () => { save('urgent'); leaveRoom(); showLobby(); },
});

// Autoguardado al minimizar o bloquear el celular; reconexión al volver
document.addEventListener('visibilitychange', () => { if (document.hidden) { save('urgent'); held.clear(); } else wake(); });
addEventListener('pagehide', () => save('urgent'));
addEventListener('resize', resize);

resize();
if (available()) ensureSocket();   // conecta en segundo plano; si falla, igual se puede jugar
showLobby();
requestAnimationFrame(frame);
