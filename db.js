// Guardado en servidor (Neon / Postgres). Solo se activa si existe DATABASE_URL.
// Sin DATABASE_URL (por ejemplo en local) todo sigue funcionando con localStorage.
// ⚠️ Esta base de datos es EXCLUSIVA de Tierras Sin Fin: nunca usar la de otro proyecto.
import pg from 'pg';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const URL_ENV = process.env.DATABASE_URL || '';
export const configured = !!URL_ENV;
let pool = null, ready = false;
export const isReady = () => ready;
export const status = () => !configured ? 'off' : ready ? 'ok' : 'error';

function poolConfig() {
  const u = new URL(URL_ENV);
  const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname) || u.searchParams.get('sslmode') === 'disable';
  // El SSL lo configuramos aquí (Neon lo exige); quitamos los parámetros de la URL para evitar conflictos
  for (const k of ['sslmode', 'channel_binding']) u.searchParams.delete(k);
  return { connectionString: u.toString(), ssl: local ? false : { rejectUnauthorized: true }, max: Number(process.env.DB_POOL_MAX) || 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  data JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS players_room_name ON players (room_code, lower(name));
-- Versión 3 · Fase 0.2: chat de la sala (se guardan los últimos 100 mensajes por sala)
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'msg',
  name TEXT,
  emoji TEXT,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_room_id ON chat_messages (room_code, id DESC);
-- Versión 3 · Fase 4: ranking de la sala (logros, distancia, jefes, arena) y jefe de mundo semanal
CREATE TABLE IF NOT EXISTS player_stats (
  room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS player_stats_room_name ON player_stats (room_code, lower(name));
-- Versión 3 · Fase 5: proyectos de Ciudad Origen (donaciones de la sala) y aldeas compartidas
CREATE TABLE IF NOT EXISTS city_state (
  room_code TEXT PRIMARY KEY REFERENCES rooms(code) ON DELETE CASCADE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Versión 3 · Fase 6.2: recompensa diaria (racha por jugador, validada en el servidor)
CREATE TABLE IF NOT EXISTS daily_rewards (
  room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_room_name ON daily_rewards (room_code, lower(name));
CREATE TABLE IF NOT EXISTS world_boss (
  room_code TEXT PRIMARY KEY REFERENCES rooms(code) ON DELETE CASCADE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
export const CHAT_KEEP = 100;

// Conecta y crea las tablas. Si falla, reintenta cada minuto sin tumbar el servidor.
export async function init(log = console.log) {
  if (!configured) { log('Base de datos: sin DATABASE_URL → solo guardado local'); return false; }
  try {
    if (!pool) { pool = new pg.Pool(poolConfig()); pool.on('error', e => { ready = false; log('Base de datos: error de conexión: ' + e.message); setTimeout(() => init(log), 60000); }); }
    await pool.query(SCHEMA);
    ready = true; log('Base de datos: conectada');
    return true;
  } catch (e) {
    ready = false; log('Base de datos: no disponible (' + e.message + '). Reintento en 1 minuto.');
    setTimeout(() => init(log), 60000);
    return false;
  }
}
export async function close() { if (pool) await pool.end().catch(() => {}); }

// ================= PIN (scrypt con sal) =================
export async function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pin, salt, 32);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function checkPin(pin, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = await scrypt(pin, Buffer.from(saltHex, 'hex'), 32), want = Buffer.from(keyHex, 'hex');
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}

// ================= Consultas =================
export async function roomExists(code) {
  const r = await pool.query('SELECT 1 FROM rooms WHERE code = $1', [code]); return r.rowCount > 0;
}
export async function createRoom(code) {
  await pool.query('INSERT INTO rooms (code) VALUES ($1) ON CONFLICT (code) DO NOTHING', [code]);
}
export async function getPlayer(code, name) {
  const r = await pool.query('SELECT id, name, pin_hash, data, updated_at FROM players WHERE room_code = $1 AND lower(name) = lower($2)', [code, name]);
  return r.rows[0] || null;
}
// Devuelve la fila nueva, o null si otro la creó al mismo tiempo
export async function createPlayer(code, name, pinHash) {
  const r = await pool.query(
    `INSERT INTO players (room_code, name, pin_hash) VALUES ($1, $2, $3)
     ON CONFLICT (room_code, lower(name)) DO NOTHING RETURNING id, name, pin_hash, data, updated_at`, [code, name, pinHash]);
  return r.rows[0] || null;
}
export async function members(code) {
  const r = await pool.query('SELECT name FROM players WHERE room_code = $1 ORDER BY id', [code]);
  return r.rows.map(x => x.name);
}
// ================= Chat (últimos 100 mensajes por sala) =================
export async function chatHistory(code) {
  const r = await pool.query(
    `SELECT id, kind, name, emoji, text, (extract(epoch from created_at) * 1000)::bigint AS t
     FROM chat_messages WHERE room_code = $1 ORDER BY id DESC LIMIT ${CHAT_KEEP}`, [code]);
  return r.rows.reverse().map(x => ({ id: 'd' + x.id, kind: x.kind, name: x.name, e: x.emoji, text: x.text, t: Number(x.t) }));
}
export async function chatAdd(code, m) {
  await pool.query('INSERT INTO chat_messages (room_code, kind, name, emoji, text) VALUES ($1, $2, $3, $4, $5)', [code, m.kind, m.name || null, m.e || null, m.text]);
  // Deja solo los últimos 100 de esta sala
  await pool.query(
    `DELETE FROM chat_messages WHERE room_code = $1 AND id < (
       SELECT min(id) FROM (SELECT id FROM chat_messages WHERE room_code = $1 ORDER BY id DESC LIMIT ${CHAT_KEEP}) t)`, [code]);
}

// ================= Ranking y jefe de mundo (Versión 3 · Fase 4) =================
export async function saveStats(code, name, data) {
  await pool.query(`INSERT INTO player_stats (room_code, name, data) VALUES ($1, $2, $3::jsonb)
    ON CONFLICT (room_code, lower(name)) DO UPDATE SET data = EXCLUDED.data, name = EXCLUDED.name, updated_at = now()`, [code, name, JSON.stringify(data)]);
}
export async function roomStats(code) {
  const r = await pool.query('SELECT name, data FROM player_stats WHERE room_code = $1', [code]);
  return r.rows.map(x => ({ name: x.name, data: x.data }));
}
export async function getWB(code) { const r = await pool.query('SELECT data FROM world_boss WHERE room_code = $1', [code]); return r.rows[0] ? r.rows[0].data : null; }
export async function saveWB(code, data) {
  await pool.query(`INSERT INTO world_boss (room_code, data) VALUES ($1, $2::jsonb)
    ON CONFLICT (room_code) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [code, JSON.stringify(data)]);
}

export async function getCity(code) { const r = await pool.query('SELECT data FROM city_state WHERE room_code = $1', [code]); return r.rows[0] ? r.rows[0].data : null; }
export async function saveCity(code, data) {
  await pool.query(`INSERT INTO city_state (room_code, data) VALUES ($1, $2::jsonb)
    ON CONFLICT (room_code) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [code, JSON.stringify(data)]);
}

export async function getDaily(code, name) { const r = await pool.query('SELECT data FROM daily_rewards WHERE room_code = $1 AND lower(name) = lower($2)', [code, name]); return r.rows[0] ? r.rows[0].data : null; }
export async function saveDaily(code, name, data) {
  await pool.query(`INSERT INTO daily_rewards (room_code, name, data) VALUES ($1, $2, $3::jsonb)
    ON CONFLICT (room_code, lower(name)) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [code, name, JSON.stringify(data)]);
}

// Solo guarda si la partida que llega no es más vieja que la guardada (evita que un celular viejo pise a uno nuevo)
export async function saveData(id, json, savedAt) {
  const r = await pool.query(
    `UPDATE players SET data = $2::jsonb, updated_at = now()
     WHERE id = $1 AND (data IS NULL OR COALESCE((data->>'savedAt')::bigint, 0) <= $3)`, [id, json, savedAt]);
  return r.rowCount > 0;
}
