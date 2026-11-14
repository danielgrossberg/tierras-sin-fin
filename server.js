// Tierras Sin Fin Online — servidor (Etapa 1)
// Express sirve los archivos estáticos y Socket.io maneja salas, presencia y mensajes.
// Las salas viven en memoria: no hay base de datos. El mundo NO se simula aquí;
// cada cliente lo genera con la semilla que sale del código de sala.
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { roomSeed, cleanName } from './public/js/util.js';
import { B, QUICK, LEADER_EMOJIS, MAX_PLAYERS, CODE_ALPHABET, PIN_TTL } from './public/js/data.js';

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

// ================= HTTP =================
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.get('/healthz', (req, res) => res.type('text').send('ok'));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  setHeaders(res, file) {
    if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    if (file.endsWith('manifest.json')) res.setHeader('Content-Type', 'application/manifest+json');
  },
}));
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000, maxHttpBufferSize: 4096 });

// ================= Salas en memoria =================
// rooms: código → { code, seed, players: Map(nombre → jugador), pins: Map(nombre → pin), emptySince, dirty }
const rooms = new Map();

const isCode = c => typeof c === 'string' && /^[A-Z]{4}$/.test(c) && [...c].every(ch => CODE_ALPHABET.includes(ch));
function newCode() {
  for (let i = 0; i < 200; i++) {
    let c = ''; for (let k = 0; k < 4; k++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}
function makeRoom(code) {
  const room = { code, seed: roomSeed(code), players: new Map(), pins: new Map(), emptySince: Date.now(), dirty: false };
  rooms.set(code, room); return room;
}
const publicPlayer = p => ({ name: p.name, x: p.x, y: p.y, leaderEmoji: p.leaderEmoji, avgLvl: p.avgLvl, biome: p.biome, status: p.status, online: p.online });
const publicPlayers = room => [...room.players.values()].map(publicPlayer);
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
  if (explicit) { removePlayer(room, p); return; }
  p.online = false; p.socketId = null;
  p.graceTimer = setTimeout(() => removePlayer(room, p), GRACE);
  markDirty(room); updateEmpty(room);
}

// Límite simple de frecuencia por socket y tipo de evento (ventana fija)
function allow(socket, key, max, windowMs) {
  const now = Date.now(); const rl = socket.data.rl || (socket.data.rl = {});
  let b = rl[key]; if (!b || now - b.t > windowMs) b = rl[key] = { t: now, n: 0 };
  return ++b.n <= max;
}
const isObj = d => d && typeof d === 'object' && !Array.isArray(d);
const isCoord = v => Number.isInteger(v) && Math.abs(v) < 1e7;
function validState(d) {
  if (!isObj(d)) return null;
  if (!isCoord(d.x) || !isCoord(d.y)) return null;
  if (!EMOJIS.has(d.leaderEmoji) || !BIOMES.has(d.biome) || !STATUSES.has(d.status)) return null;
  const lv = Number(d.avgLvl); if (!Number.isFinite(lv) || lv < 1 || lv > 999) return null;
  return { x: d.x, y: d.y, leaderEmoji: d.leaderEmoji, biome: d.biome, status: d.status, avgLvl: Math.round(lv * 10) / 10 };
}
function ctxOf(socket) {
  const room = rooms.get(socket.data.room); if (!room) return null;
  const p = room.players.get(socket.data.name); if (!p || p.socketId !== socket.id) return null;
  return { room, p };
}

// ================= Socket.io =================
io.on('connection', socket => {
  socket.data.room = null; socket.data.name = null;

  socket.on('room:create', (d, ack) => {
    if (typeof ack !== 'function') return;
    if (!allow(socket, 'create', 3, 10000)) return ack({ ok: false, error: 'Demasiados intentos. Espera un momento.' });
    if (rooms.size >= MAX_ROOMS) return ack({ ok: false, error: 'El servidor está lleno. Intenta más tarde.' });
    const code = newCode(); if (!code) return ack({ ok: false, error: 'No se pudo crear la sala.' });
    makeRoom(code);
    ack({ ok: true, code });
  });

  socket.on('room:join', (d, ack) => {
    if (typeof ack !== 'function') return;
    if (!allow(socket, 'join', 6, 10000)) return ack({ ok: false, error: 'Demasiados intentos. Espera un momento.' });
    if (!isObj(d)) return ack({ ok: false, error: 'Datos inválidos.' });
    const code = typeof d.code === 'string' ? d.code.toUpperCase() : '';
    const name = cleanName(d.name);
    if (!isCode(code)) return ack({ ok: false, error: 'Código de sala inválido.' });
    if (!name) return ack({ ok: false, error: 'Nombre inválido.' });
    let room = rooms.get(code);
    if (!room) {
      // Si el jugador ya tenía partida en esa sala (o se está reconectando), la recreamos:
      // el mundo sale de la semilla del código, así que es el mismo aunque el servidor se haya reiniciado.
      if (d.rejoin === true && rooms.size < MAX_ROOMS) room = makeRoom(code);
      else return ack({ ok: false, error: 'Sala no existe.' });
    }
    const existing = room.players.get(name);
    if (!existing && room.players.size >= MAX_PLAYERS) return ack({ ok: false, error: 'Sala llena.' });
    if (socket.data.room) leaveCurrent(socket, socket.data.room !== code);

    if (existing && existing.socketId && existing.socketId !== socket.id) {
      // El mismo nombre entra desde otra conexión: la nueva reemplaza a la vieja
      const old = io.sockets.sockets.get(existing.socketId);
      if (old) { old.data.room = null; old.leave(code); old.emit('room:replaced'); }
    }
    if (existing) clearTimeout(existing.graceTimer);
    const p = existing || { name, x: 0, y: 0, leaderEmoji: LEADER_EMOJIS[0], avgLvl: 1, biome: 'GRASS', status: 'lobby' };
    p.socketId = socket.id; p.online = true; p.graceTimer = null;
    room.players.set(name, p); room.emptySince = null;
    socket.join(code); socket.data.room = code; socket.data.name = name;
    ack({ ok: true, code, seed: room.seed, players: publicPlayers(room), pins: publicPins(room) });
    if (!existing) socket.to(code).emit('event:notice', { type: 'join', name, text: `${name} entró a la sala` });
    markDirty(room);
  });

  socket.on('room:leave', () => leaveCurrent(socket, true));

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

  // ================= ETAPA 2 (no implementado todavía) =================
  // Combates cooperativos contra jefes. Idea de protocolo:
  // socket.on('boss:invite',   d => { /* {bossId, x, y}: avisar a los jugadores cercanos */ });
  // socket.on('battle:join',   d => { /* {battleId}: sumar el grupo del amigo al combate */ });
  // socket.on('battle:action', d => { /* {battleId, action, target}: el servidor valida el turno,
  //                                       tira los dados y reenvía el resultado a todos */ });

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
}, 60 * 1000);

server.listen(PORT, () => console.log(`Tierras Sin Fin escuchando en http://localhost:${PORT}`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { io.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
