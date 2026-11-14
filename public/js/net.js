// Capa online (Socket.io): sala, presencia de otros jugadores, mensajes rápidos y pines.
// Regla de oro: nada de aquí puede bloquear la partida. Si no hay servidor, se juega solo.
'use strict';
import { esc, dirArrow } from './util.js';
import { QUICK, PIN_TTL } from './data.js';
import { P } from './state.js';

export const net = {
  socket: null,
  status: 'off',        // 'on' conectado · 'wait' reconectando · 'off' sin conexión / modo individual
  code: null, name: null, joined: false, replaced: false,
  others: new Map(),    // nombre → {name,x,y,px,py,leaderEmoji,avgLvl,biome,status,online,bubble}
  pins: new Map(),      // nombre → {name,x,y,until}
  myBubble: null,
  ev: {},               // callbacks que conecta main.js: players, feed, status
};
const fire = (k, ...a) => { const f = net.ev[k]; if (f) { try { f(...a); } catch (e) { console.warn(e); } } };
function setStatus(s) { if (net.status !== s) { net.status = s; fire('status', s); } }

export const available = () => typeof window !== 'undefined' && typeof window.io === 'function';

export function ensureSocket() {
  if (net.socket) return net.socket;
  if (!available()) return null;
  const s = window.io({ reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000, timeout: 8000 });
  s.on('connect', onConnect);
  s.on('disconnect', reason => {
    if (net.joined && !net.replaced) setStatus('wait');
    // Si el servidor nos cortó, Socket.io no reintenta solo: lo pedimos nosotros
    if (reason === 'io server disconnect' && !net.replaced) s.connect();
  });
  s.on('connect_error', () => { if (net.joined) setStatus('wait'); });
  s.on('players:update', d => { if (d && Array.isArray(d.players)) applyPlayers(d.players); });
  s.on('chat:quick', onChat);
  s.on('ping:place', onPin);
  s.on('event:notice', onNotice);
  s.on('room:replaced', () => {
    net.replaced = true; net.joined = false; net.others.clear(); setStatus('off');
    fire('feed', '⚠️ Entraste con este nombre desde otro lugar. Aquí sigues en modo individual.');
    fire('players'); s.disconnect();
  });
  // ETAPA 2 (no implementado): aquí se escucharán 'boss:invite', 'battle:join' y 'battle:action'
  // para los combates cooperativos contra jefes.
  net.socket = s;
  return s;
}

// Emite con respuesta (ack) y tiempo máximo; nunca lanza error
function ask(ev, data, ms = 7000) {
  return new Promise(res => {
    const s = ensureSocket();
    if (!s) return res({ ok: false, error: 'No hay conexión con el servidor.', timeout: true });
    s.timeout(ms).emit(ev, data, (err, r) => res(err ? { ok: false, error: 'El servidor no responde.', timeout: true } : (r || { ok: false, error: 'Respuesta inválida.' })));
  });
}

async function onConnect() {
  if (!net.code || net.replaced) return;
  // Reconexión: volvemos a entrar a la sala (si el servidor se reinició, la recrea)
  const wasWaiting = net.status === 'wait';
  const r = await ask('room:join', { code: net.code, name: net.name, rejoin: true });
  if (r.ok) {
    applyPlayers(r.players || []); applyPins(r.pins || []); lastKey = ''; setStatus('on');
    if (wasWaiting) fire('feed', '🟢 Conexión recuperada');
  } else { setStatus('wait'); fire('feed', '⚠️ ' + esc(r.error || 'No se pudo volver a la sala')); }
}

export async function createRoom() { return ask('room:create', {}); }
export async function joinRoom(code, name, rejoin) {
  const r = await ask('room:join', { code, name, rejoin: !!rejoin });
  if (r.ok) {
    net.code = code; net.name = name; net.joined = true; net.replaced = false;
    net.others.clear(); net.pins.clear(); applyPlayers(r.players || []); applyPins(r.pins || []);
    lastKey = ''; setStatus('on');
  }
  return r;
}
export function leaveRoom() {
  if (net.socket && net.joined && net.socket.connected) net.socket.emit('room:leave');
  net.joined = false; net.code = null; net.others.clear(); net.pins.clear(); net.myBubble = null;
  setStatus('off'); fire('players');
}
// Al volver a la app (desbloquear el celular) o recuperar red, reconectar de inmediato
export function wake() { if (net.socket && net.joined && !net.replaced && !net.socket.connected) net.socket.connect(); }

// ================= Envío del estado propio (máx. 8/s y solo si cambió) =================
let lastKey = '', lastSent = 0;
export function tick(now, makeState) {
  if (!net.joined || !net.socket || !net.socket.connected) return;
  if (now - lastSent < 125) return;
  const s = makeState(); const key = JSON.stringify(s);
  if (key === lastKey) return;
  lastKey = key; lastSent = now; net.socket.emit('player:state', s);
}
const canSend = () => net.joined && net.socket && net.socket.connected;
export function sendQuick(id) {
  if (canSend()) net.socket.emit('chat:quick', { msgId: id });
  else { const q = QUICK.find(q => q.id === id); if (q) net.myBubble = { text: q.t, until: Date.now() + 4000 }; }
}
export function placePin(x, y) {
  if (canSend()) net.socket.emit('ping:place', { x, y });
  else net.pins.set('(tú)', { name: 'Tú', x, y, until: Date.now() + PIN_TTL });
}
export function notice(type, text) { if (canSend()) net.socket.emit('event:notice', { type, text }); }

// ================= Recepción =================
function applyPlayers(list) {
  const seen = new Set();
  for (const p of list) {
    if (!p || typeof p.name !== 'string' || p.name === net.name) continue;
    seen.add(p.name);
    let o = net.others.get(p.name);
    if (!o) { o = { px: p.x, py: p.y }; net.others.set(p.name, o); }
    const wasLobby = o.status === 'lobby';
    Object.assign(o, p);
    // Saltos grandes (derrota, primera posición): sin interpolar
    if (wasLobby || Math.abs(o.x - o.px) + Math.abs(o.y - o.py) > 8) { o.px = o.x; o.py = o.y; }
  }
  for (const k of [...net.others.keys()]) if (!seen.has(k)) net.others.delete(k);
  fire('players');
}
function applyPins(list) {
  const now = Date.now();
  for (const p of list) if (p && p.ttl > 0) net.pins.set(p.name, { name: p.name, x: p.x, y: p.y, until: now + Math.min(PIN_TTL, p.ttl || 0) });
}
const distTxt = (x, y) => `${Math.round(Math.hypot(x - P.x, y - P.y))} casillas ${dirArrow(x - P.x, y - P.y)}`;
function onChat(d) {
  const q = d && QUICK.find(q => q.id === d.msgId); if (!q) return;
  const b = { text: q.t, until: Date.now() + 4000 };
  if (d.name === net.name) { net.myBubble = b; return; }
  const o = net.others.get(d.name); if (o) o.bubble = b;
  fire('feed', `💬 <b>${esc(d.name)}</b>: ${esc(q.t)}`);
}
function onPin(d) {
  if (!d || !Number.isInteger(d.x) || !Number.isInteger(d.y)) return;
  net.pins.set(d.name, { name: d.name, x: d.x, y: d.y, until: Date.now() + Math.min(PIN_TTL, d.ttl || PIN_TTL) });
  if (d.name === net.name) fire('feed', '📍 Marcaste este lugar (visible 2 minutos)');
  else fire('feed', `📍 <b>${esc(d.name)}</b> marcó un lugar · ${distTxt(d.x, d.y)}`);
}
function onNotice(d) {
  if (!d || typeof d.text !== 'string') return;
  if (d.type === 'join') fire('feed', `👋 ${esc(d.text)}`);
  else if (d.type === 'leave') fire('feed', `🚪 ${esc(d.text)}`);
  else if (d.type === 'level') fire('feed', `⭐ <b>${esc(d.name)}</b> sube de nivel: ${esc(d.text)}`);
  else if (d.type === 'boss') fire('feed', `👑 <b>${esc(d.name)}</b> derrotó al jefe ${esc(d.text)}`);
  else if (d.type === 'death') fire('feed', `💀 <b>${esc(d.name)}</b> cayó y vuelve a empezar desde Villa Origen`);
}

// Interpolación de los otros jugadores (se llama en cada frame)
export function lerpOthers(dt) {
  const a = 1 - Math.exp(-dt * 10), now = Date.now();
  for (const o of net.others.values()) {
    o.px += (o.x - o.px) * a; o.py += (o.y - o.py) * a;
    if (o.bubble && o.bubble.until < now) o.bubble = null;
  }
  if (net.myBubble && net.myBubble.until < now) net.myBubble = null;
  for (const [k, p] of net.pins) if (p.until < now) net.pins.delete(k);
}

if (typeof window !== 'undefined') window.addEventListener('online', wake);
