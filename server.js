// Tierras Sin Fin Online — servidor
// Express sirve los archivos estáticos y Socket.io maneja salas, presencia y mensajes.
// La presencia vive en memoria. Si hay DATABASE_URL (Neon), además se guardan las salas,
// los jugadores (nombre + PIN) y sus partidas; si no, todo queda en el navegador.
// El mundo NO se simula aquí: cada cliente lo genera con la semilla del código de sala.
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { roomSeed, cleanName } from './public/js/util.js';
import { B, QUICK, LEADER_EMOJIS, MAX_PLAYERS, CODE_ALPHABET, PIN_TTL } from './public/js/data.js';
import * as db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const EMPTY_TTL = 30 * 60 * 1000;   // una sala vacía se borra a los 30 minutos
const GRACE = 15 * 1000;            // tiempo para reconectar antes de "salir" de la sala
const MAX_ROOMS = 1000;
const STATUSES = new Set(['map', 'battle', 'village']);
const BIOMES = new Set(Object.keys(B));
const EMOJIS = new Set(LEADER_EMOJIS);
const QUICK_IDS = new Set(QUICK.map(q => q.id));
const NOTICE_TYPES = new Set(['level', 'boss', 'death']);
const MAX_SAVE = 200 * 1024;                     // tamaño máximo de una partida guardada (bytes)
const PIN_FAILS = 6, PIN_LOCK = 10 * 60 * 1000;  // intentos de PIN fallidos antes de bloquear 10 minutos

// ================= HTTP =================
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.get('/healthz', (req, res) => res.type('text').send('ok'));
// Para Render y para el cliente: indica si el guardado en servidor está activo
app.get('/health', (req, res) => res.set('Cache-Control', 'no-store').json({ ok: true, db: db.status(), rooms: rooms.size }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  setHeaders(res, file) {
    // Código del juego: el navegador siempre pregunta si cambió (ETag), así tras cada deploy
    // nadie queda con una mezcla de módulos viejos y nuevos. Los íconos sí se guardan 1 hora.
    if (/\.(html|js|css|json)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    if (file.endsWith('manifest.json')) res.setHeader('Content-Type', 'application/manifest+json');
  },
}));
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000, maxHttpBufferSize: 300 * 1024 }); // permite subir la partida (máx. 200 KB)

// ================= Salas en memoria =================
// rooms: código → { code, seed, players: Map(nombre → jugador), pins: Map(nombre → pin), emptySince, dirty }
const rooms = new Map();
const pinFails = new Map(); // "SALA|nombre" → {n intentos fallidos, t último intento}

const isCode = c => typeof c === 'string' && /^[A-Z]{4}$/.test(c) && [...c].every(ch => CODE_ALPHABET.includes(ch));
function newCode() {
  for (let i = 0; i < 200; i++) {
    let c = ''; for (let k = 0; k < 4; k++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}
function makeRoom(code) {
  const room = { code, seed: roomSeed(code), players: new Map(), pins: new Map(), members: new Set(), coop: new Map(), emptySince: Date.now(), dirty: false };
  rooms.set(code, room); return room;
}
const publicPlayer = p => ({ name: p.name, x: p.x, y: p.y, leaderEmoji: p.leaderEmoji, avgLvl: p.avgLvl, biome: p.biome, status: p.status, online: p.online, tomb: p.tomb || null, vs: p.vs || null });
// Conectados + registrados en la base de datos que no están conectados (aparecen "fuera de línea")
function publicPlayers(room) {
  const list = [...room.players.values()].map(publicPlayer);
  for (const n of room.members) if (!room.players.has(n)) list.push({ name: n, status: 'away', online: false });
  return list;
}
function publicPins(room) {
  const now = Date.now();
  return [...room.pins.values()].filter(p => p.until > now).map(p => ({ name: p.name, x: p.x, y: p.y, ttl: p.until - now }));
}
const markDirty = room => { room.dirty = true; };
function updateEmpty(room) {
  const anyOnline = [...room.players.values()].some(p => p.online);
  if (anyOnline) room.emptySince = null; else if (!room.emptySince) room.emptySince = Date.now();
}
function removePlayer(room, p) {
  if (room.players.get(p.name) !== p) return;
  clearTimeout(p.graceTimer);
  room.players.delete(p.name);
  io.to(room.code).emit('event:notice', { type: 'leave', name: p.name, text: `${p.name} salió de la sala` });
  markDirty(room); updateEmpty(room);
}
// explicit=true: salió a propósito · false: se cortó la conexión (le damos un rato para volver)
function leaveCurrent(socket, explicit) {
  const code = socket.data.room; if (!code) return;
  socket.data.room = null; socket.leave(code);
  const room = rooms.get(code); if (!room) return;
  const p = room.players.get(socket.data.name);
  if (!p || p.socketId !== socket.id) return;
  coopLeave(room, p.name);
  if (explicit) { removePlayer(room, p); return; }
  p.online = false; p.socketId = null;
  p.graceTimer = setTimeout(() => removePlayer(room, p), GRACE);
  markDirty(room); updateEmpty(room);
}

// ================= Jefes en equipo (Versión 2 · Fase 3) =================
// El servidor solo organiza y reenvía: el anfitrión (quien encontró al jefe) corre el combate.
// room.coop: id → { id, host, boss, guests: Map(nombre → héroe), state: 'lobby'|'battle', created }
const INVITE_MS = 90 * 1000, MAX_COOP = 4;
const sendTo = (room, name, ev, data) => { const q = room.players.get(name); if (q && q.socketId) io.to(q.socketId).emit(ev, data); };
const coopLobby = c => ({ id: c.id, host: c.host, boss: c.boss, state: c.state, guests: [...c.guests.entries()].map(([n, h]) => ({ name: n, hero: h })), left: Math.max(0, c.created + INVITE_MS - Date.now()) });
function coopLeave(room, name) {
  for (const c of [...room.coop.values()]) {
    if (c.host === name) {   // se fue el anfitrión: se cancela para todos, sin penalización
      for (const g of c.guests.keys()) sendTo(room, g, 'battle:end', { id: c.id, result: 'cancel', reason: c.host + ' se desconectó' });
      io.to(room.code).emit('boss:closed', { id: c.id });
      room.coop.delete(c.id);
    } else if (c.guests.has(name)) {
      c.guests.delete(name);
      sendTo(room, c.host, 'boss:left', { id: c.id, name });   // su héroe se defenderá solo
      if (c.state === 'lobby') sendTo(room, c.host, 'boss:lobby', coopLobby(c));
    }
  }
}
// Héroe que se manda al combate (se limita a lo necesario)
function cleanHero(h) {
  if (!isObj(h) || typeof h.cls !== 'string' || !Number.isInteger(h.lvl) || h.lvl < 1 || h.lvl > 99) return null;
  return h;
}

// Límite simple de frecuencia por socket y tipo de evento (ventana fija)
function allow(socket, key, max, windowMs) {
  const now = Date.now(); const rl = socket.data.rl || (socket.data.rl = {});
  let b = rl[key]; if (!b || now - b.t > windowMs) b = rl[key] = { t: now, n: 0 };
  return ++b.n <= max;
}
const isObj = d => d && typeof d === 'object' && !Array.isArray(d);
// eslint-disable-next-line no-control-regex
const cleanText = (t, n) => Array.from(String(t).replace(/[\u0000-\u001f\u007f<>]/g, '').trim()).slice(0, n).join('');
const isCoord = v => Number.isInteger(v) && Math.abs(v) < 1e7;
function validState(d) {
  if (!isObj(d)) return null;
  if (!isCoord(d.x) || !isCoord(d.y)) return null;
  if (!EMOJIS.has(d.leaderEmoji) || !BIOMES.has(d.biome) || !STATUSES.has(d.status)) return null;
  const lv = Number(d.avgLvl); if (!Number.isFinite(lv) || lv < 1 || lv > 999) return null;
  // Tumba 🪦 (opcional): [x, y] enteros
  const tomb = Array.isArray(d.tomb) && d.tomb.length === 2 && isCoord(d.tomb[0]) && isCoord(d.tomb[1]) ? [d.tomb[0], d.tomb[1]] : null;
  // "👑 vs Jefe" mientras dura un combate cooperativo
  const vs = typeof d.vs === 'string' ? cleanText(d.vs, 30) || null : null;
  return { x: d.x, y: d.y, leaderEmoji: d.leaderEmoji, biome: d.biome, status: d.status, avgLvl: Math.round(lv * 10) / 10, tomb, vs };
}
function ctxOf(socket) {
  const room = rooms.get(socket.data.room); if (!room) return null;
  const p = room.players.get(socket.data.name); if (!p || p.socketId !== socket.id) return null;
  return { room, p };
}

// ================= Socket.io =================
io.on('connection', socket => {
  socket.data.room = null; socket.data.name = null;

  socket.on('room:create', async (d, ack) => {
    if (typeof ack !== 'function') return;
    if (!allow(socket, 'create', 3, 10000)) return ack({ ok: false, error: 'Demasiados intentos. Espera un momento.' });
    if (rooms.size >= MAX_ROOMS) return ack({ ok: false, error: 'El servidor está lleno. Intenta más tarde.' });
    let code = null;
    for (let i = 0; i < 20 && !code; i++) {
      const c = newCode(); if (!c) break;
      try { if (db.isReady() && await db.roomExists(c)) continue; } catch (e) { /* sin base de datos: basta con la memoria */ }
      code = c;
    }
    if (!code) return ack({ ok: false, error: 'No se pudo crear la sala.' });
    makeRoom(code);
    if (db.isReady()) db.createRoom(code).catch(e => console.warn('No se pudo guardar la sala:', e.message));
    ack({ ok: true, code });
  });

  socket.on('room:join', async (d, ack) => {
    if (typeof ack !== 'function') return;
    if (!allow(socket, 'join', 6, 10000)) return ack({ ok: false, error: 'Demasiados intentos. Espera un momento.' });
    if (!isObj(d)) return ack({ ok: false, error: 'Datos inválidos.' });
    const code = typeof d.code === 'string' ? d.code.toUpperCase() : '';
    let name = cleanName(d.name);
    const pin = typeof d.pin === 'string' && /^\d{4}$/.test(d.pin) ? d.pin : null;
    if (!isCode(code)) return ack({ ok: false, error: 'Código de sala inválido.' });
    if (!name) return ack({ ok: false, error: 'Nombre inválido.' });

    // ---- Identidad con PIN (solo si hay base de datos) ----
    let row = null;
    if (db.isReady()) {
      try {
        if (!rooms.has(code) && !(await db.roomExists(code))) {
          // Sala desconocida: se recrea solo si el jugador ya tenía partida local en ella
          if (d.rejoin === true) await db.createRoom(code); else return ack({ ok: false, error: 'Sala no existe.' });
        }
        const key = code + '|' + name.toLowerCase(), f = pinFails.get(key);
        if (f && f.n >= PIN_FAILS && Date.now() - f.t < PIN_LOCK) return ack({ ok: false, needPin: true, error: 'Demasiados intentos de PIN. Espera 10 minutos.' });
        row = await db.getPlayer(code, name);
        if (row) {
          if (!pin) return ack({ ok: false, needPin: true, error: `"${row.name}" ya existe en esta sala. Escribe su PIN de 4 dígitos.` });
          if (!(await db.checkPin(pin, row.pin_hash))) {
            const g = f && Date.now() - f.t < PIN_LOCK ? f : { n: 0, t: 0 }; g.n++; g.t = Date.now(); pinFails.set(key, g);
            return ack({ ok: false, needPin: true, error: 'PIN incorrecto.' });
          }
          pinFails.delete(key);
        } else {
          if (!pin) return ack({ ok: false, needPin: true, newName: true, error: 'Elige un PIN de 4 dígitos para proteger tu personaje.' });
          row = await db.createPlayer(code, name, await db.hashPin(pin));
          if (!row) return ack({ ok: false, needPin: true, error: 'Ese nombre se acaba de registrar. Escribe su PIN.' });
        }
        name = row.name; // mismo nombre aunque se escriba con otras mayúsculas
      } catch (e) { console.warn('Base de datos en room:join:', e.message); row = null; } // sigue sin guardado en servidor
    }
    if (!socket.connected) return;

    let room = rooms.get(code);
    if (!room) {
      // Si la sala está en la base de datos, o el jugador ya tenía partida en ella (o se está reconectando),
      // la recreamos: el mundo sale de la semilla del código, así que es el mismo aunque el servidor se haya reiniciado.
      if ((row || d.rejoin === true) && rooms.size < MAX_ROOMS) room = makeRoom(code);
      else return ack({ ok: false, error: 'Sala no existe.' });
    }
    if (row && !room.membersLoaded) { try { for (const n of await db.members(code)) room.members.add(n); room.membersLoaded = true; } catch (e) { /* nada */ } }
    if (row) room.members.add(row.name);
    const existing = room.players.get(name);
    if (!existing && room.players.size >= MAX_PLAYERS) return ack({ ok: false, error: 'Sala llena.' });
    if (socket.data.room) leaveCurrent(socket, socket.data.room !== code);

    if (existing && existing.socketId && existing.socketId !== socket.id) {
      // El mismo nombre entra desde otra conexión: la nueva reemplaza a la vieja
      const old = io.sockets.sockets.get(existing.socketId);
      if (old) { old.data.room = null; old.data.playerId = null; old.leave(code); old.emit('room:replaced'); }
    }
    if (existing) clearTimeout(existing.graceTimer);
    const p = existing || { name, x: 0, y: 0, leaderEmoji: LEADER_EMOJIS[0], avgLvl: 1, biome: 'GRASS', status: 'lobby' };
    p.socketId = socket.id; p.online = true; p.graceTimer = null;
    room.players.set(name, p); room.emptySince = null;
    socket.join(code); socket.data.room = code; socket.data.name = name; socket.data.playerId = row ? row.id : null;
    ack({ ok: true, code, name, seed: room.seed, players: publicPlayers(room), pins: publicPins(room),
      db: !!row, save: row ? row.data : null });
    if (!existing) socket.to(code).emit('event:notice', { type: 'join', name, text: `${name} entró a la sala` });
    markDirty(room);
  });

  socket.on('room:leave', () => leaveCurrent(socket, true));

  // Guardado de la partida en el servidor (si hay base de datos y el jugador entró con PIN)
  socket.on('save:push', async (d, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const c = ctxOf(socket);
    if (!c || !socket.data.playerId || !db.isReady()) return reply({ ok: false, error: 'Sin guardado en servidor.' });
    if (!allow(socket, 'save', 6, 10000)) return reply({ ok: false, error: 'Guardado demasiado seguido.' });
    if (!isObj(d) || !isObj(d.data) || !Array.isArray(d.data.roster) || !Array.isArray(d.data.party)) return reply({ ok: false, error: 'Partida inválida.' });
    let json; try { json = JSON.stringify(d.data); } catch (e) { return reply({ ok: false, error: 'Partida inválida.' }); }
    if (Buffer.byteLength(json) > MAX_SAVE) return reply({ ok: false, error: 'Partida demasiado grande.' });
    try { const stored = await db.saveData(socket.data.playerId, json, Number(d.data.savedAt) || 0); reply({ ok: true, stored }); }
    catch (e) { console.warn('save:push:', e.message); reply({ ok: false, error: 'Error de base de datos.' }); }
  });

  // Estado del jugador (posición, líder, nivel, bioma, estado). El cliente manda ~8/s como máximo.
  socket.on('player:state', d => {
    const c = ctxOf(socket); if (!c) return;
    if (!allow(socket, 'state', 12, 1000)) return;
    const v = validState(d); if (!v) return;
    Object.assign(c.p, v); markDirty(c.room);
  });

  socket.on('chat:quick', d => {
    const c = ctxOf(socket); if (!c || !isObj(d) || !QUICK_IDS.has(d.msgId)) return;
    if (!allow(socket, 'chat', 4, 4000)) return;
    io.to(c.room.code).emit('chat:quick', { name: c.p.name, msgId: d.msgId });
  });

  socket.on('ping:place', d => {
    const c = ctxOf(socket); if (!c || !isObj(d) || !isCoord(d.x) || !isCoord(d.y)) return;
    if (!allow(socket, 'ping', 3, 10000)) return;
    c.room.pins.set(c.p.name, { name: c.p.name, x: d.x, y: d.y, until: Date.now() + PIN_TTL }); // un pin por jugador
    io.to(c.room.code).emit('ping:place', { name: c.p.name, x: d.x, y: d.y, ttl: PIN_TTL });
  });

  socket.on('event:notice', d => {
    const c = ctxOf(socket); if (!c || !isObj(d) || !NOTICE_TYPES.has(d.type) || typeof d.text !== 'string') return;
    if (!allow(socket, 'notice', 5, 10000)) return;
    // eslint-disable-next-line no-control-regex
    const text = Array.from(d.text.replace(/[\u0000-\u001f\u007f<>]/g, '').trim()).slice(0, 80).join('');
    if (!text) return;
    socket.to(c.room.code).emit('event:notice', { type: d.type, name: c.p.name, text });
  });

  // ================= Jefes en equipo =================
  // boss:invite (anfitrión) → todos ven la invitación 90 s · boss:join / boss:leave (invitados)
  // boss:start / boss:cancel (anfitrión) · battle:state (anfitrión → invitados) · battle:action (invitado → anfitrión)
  // battle:end (anfitrión → invitados)
  socket.on('boss:invite', (d, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {}; const c0 = ctxOf(socket);
    if (!c0 || !isObj(d) || !isObj(d.boss) || !allow(socket, 'coop', 6, 10000)) return reply({ ok: false });
    const b = d.boss; if (!isCoord(b.x) || !isCoord(b.y) || !Number.isInteger(b.lvl)) return reply({ ok: false });
    coopLeave(c0.room, c0.p.name);   // un jugador solo puede tener una sesión a la vez
    const id = Math.random().toString(36).slice(2, 10);
    const boss = { id: cleanText(b.id, 40), name: cleanText(b.name, 30), e: cleanText(b.e, 8), lvl: b.lvl, x: b.x, y: b.y };
    const c = { id, host: c0.p.name, boss, guests: new Map(), state: 'lobby', created: Date.now() };
    c0.room.coop.set(id, c);
    socket.to(c0.room.code).emit('boss:invite', { id, host: c.host, boss, left: INVITE_MS });
    reply({ ok: true, id, left: INVITE_MS });
  });
  socket.on('boss:join', (d, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {}; const c0 = ctxOf(socket);
    if (!c0 || !isObj(d) || !allow(socket, 'coop', 6, 10000)) return reply({ ok: false, error: 'No se pudo unir.' });
    const c = c0.room.coop.get(d.id);
    if (!c || c.state !== 'lobby' || Date.now() > c.created + INVITE_MS) return reply({ ok: false, error: 'La invitación ya terminó.' });
    if (c.host === c0.p.name) return reply({ ok: false, error: 'Es tu propio jefe.' });
    if (!c.guests.has(c0.p.name) && c.guests.size + 1 >= MAX_COOP) return reply({ ok: false, error: 'Ya hay 4 jugadores.' });
    const hero = cleanHero(d.hero); if (!hero) return reply({ ok: false, error: 'Héroe inválido.' });
    c.guests.set(c0.p.name, hero);
    sendTo(c0.room, c.host, 'boss:lobby', coopLobby(c));
    reply({ ok: true, lobby: coopLobby(c) });
  });
  socket.on('boss:leave', d => {
    const c0 = ctxOf(socket); if (!c0 || !isObj(d)) return; const c = c0.room.coop.get(d.id);
    if (c && c.guests.delete(c0.p.name)) { if (c.state === 'lobby') sendTo(c0.room, c.host, 'boss:lobby', coopLobby(c)); else sendTo(c0.room, c.host, 'boss:left', { id: c.id, name: c0.p.name }); }
  });
  socket.on('boss:cancel', d => {
    const c0 = ctxOf(socket); if (!c0 || !isObj(d)) return; const c = c0.room.coop.get(d.id);
    if (!c || c.host !== c0.p.name) return;
    for (const g of c.guests.keys()) sendTo(c0.room, g, 'battle:end', { id: c.id, result: 'cancel', reason: c.host + ' decidió no pelear en equipo' });
    io.to(c0.room.code).emit('boss:closed', { id: c.id }); c0.room.coop.delete(c.id);
  });
  socket.on('boss:start', (d, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {}; const c0 = ctxOf(socket);
    if (!c0 || !isObj(d)) return reply({ ok: false }); const c = c0.room.coop.get(d.id);
    if (!c || c.host !== c0.p.name || c.state !== 'lobby' || !c.guests.size) return reply({ ok: false, error: 'Nadie se unió.' });
    c.state = 'battle';
    const lobby = coopLobby(c);
    for (const g of c.guests.keys()) sendTo(c0.room, g, 'boss:start', lobby);
    io.to(c0.room.code).emit('boss:closed', { id: c.id });   // la invitación desaparece para los demás
    reply({ ok: true, lobby });
  });
  socket.on('battle:state', d => {
    const c0 = ctxOf(socket); if (!c0 || !isObj(d)) return; const c = c0.room.coop.get(d.id);
    if (!c || c.host !== c0.p.name || c.state !== 'battle' || !allow(socket, 'bstate', 40, 1000)) return;
    for (const g of c.guests.keys()) sendTo(c0.room, g, 'battle:state', d);
  });
  socket.on('battle:action', d => {
    const c0 = ctxOf(socket); if (!c0 || !isObj(d)) return; const c = c0.room.coop.get(d.id);
    if (!c || !c.guests.has(c0.p.name) || c.state !== 'battle' || !allow(socket, 'baction', 6, 1000)) return;
    sendTo(c0.room, c.host, 'battle:action', Object.assign({}, d, { from: c0.p.name }));
  });
  socket.on('battle:end', d => {
    const c0 = ctxOf(socket); if (!c0 || !isObj(d)) return; const c = c0.room.coop.get(d.id);
    if (!c || c.host !== c0.p.name) return;
    for (const g of c.guests.keys()) sendTo(c0.room, g, 'battle:end', d);
    c0.room.coop.delete(c.id);
  });

  socket.on('disconnect', () => leaveCurrent(socket, false));
});

// Envío agrupado del estado de cada sala (máx. 10 veces por segundo)
setInterval(() => {
  for (const room of rooms.values()) if (room.dirty) { room.dirty = false; io.to(room.code).emit('players:update', { players: publicPlayers(room) }); }
}, 100);

// Limpieza: salas vacías por más de 30 minutos y pines vencidos
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    for (const [k, p] of room.pins) if (p.until <= now) room.pins.delete(k);
    if (room.emptySince && now - room.emptySince > EMPTY_TTL) {
      for (const p of room.players.values()) clearTimeout(p.graceTimer);
      rooms.delete(code);
    }
  }
  for (const [k, f] of pinFails) if (now - f.t > PIN_LOCK) pinFails.delete(k);
  for (const room of rooms.values()) for (const [id, c] of room.coop) if (c.state === 'lobby' && now - c.created > 5 * 60 * 1000) room.coop.delete(id);
}, 60 * 1000);

db.init(); // no bloquea: si la base no responde, el juego funciona igual y se reintenta
server.listen(PORT, () => console.log(`Tierras Sin Fin escuchando en http://localhost:${PORT}`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { io.close(); db.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
