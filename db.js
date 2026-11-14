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
`;

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
// Solo guarda si la partida que llega no es más vieja que la guardada (evita que un celular viejo pise a uno nuevo)
export async function saveData(id, json, savedAt) {
  const r = await pool.query(
    `UPDATE players SET data = $2::jsonb, updated_at = now()
     WHERE id = $1 AND (data IS NULL OR COALESCE((data->>'savedAt')::bigint, 0) <= $3)`, [id, json, savedAt]);
  return r.rowCount > 0;
}
