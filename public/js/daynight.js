// Día y noche (Versión 3 · Fase 3). Compartido por la sala: se calcula con la hora del SERVIDOR
// (net.js guarda la diferencia con el reloj del celular al entrar). Sin conexión se usa la hora local.
// Ciclo de 20 minutos: 14 de día y 6 de noche. Atardecer en el último minuto de día y amanecer en el
// primer minuto del día siguiente (transiciones suaves).
'use strict';

export const CYCLE = 20 * 60 * 1000, NIGHT_AT = 14 / 20, FADE = 1 / 20;   // fracciones del ciclo
let offset = 0;
export const setServerTime = serverNow => { if (Number.isFinite(serverNow)) offset = serverNow - Date.now(); };
export const now = () => Date.now() + offset;
// 0..1 dentro del ciclo (0 = amanecer)
export const phase = () => ((now() % CYCLE) + CYCLE) % CYCLE / CYCLE;
export const isNight = () => phase() >= NIGHT_AT;
// Oscuridad 0..1 para el dibujo (sube en el atardecer, baja en el amanecer)
export function darkness() {
  const p = phase();
  if (p >= NIGHT_AT) return 1;
  if (p >= NIGHT_AT - FADE) return (p - (NIGHT_AT - FADE)) / FADE;
  if (p < FADE) return 1 - p / FADE;
  return 0;
}
// Atardecer o amanecer (para un tinte naranjo)
export const twilight = () => { const d = darkness(); return d > 0 && d < 1 ? 1 - Math.abs(2 * d - 1) : 0; };
// Milisegundos hasta el próximo cambio (día → noche o noche → día)
export function untilChange() { const p = phase(); return Math.round(((p < NIGHT_AT ? NIGHT_AT : 1) - p) * CYCLE); }
export const clockText = () => { const s = Math.ceil(untilChange() / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// Monstruos de noche: +20% de stats y +30% de experiencia y botín
export const NIGHT_STATS = 1.2, NIGHT_REWARD = 1.3;
