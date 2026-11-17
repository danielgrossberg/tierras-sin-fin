// Estimaciones para los botones del combate (Versión 3 · Fase 0.5) y vista previa de objetos (0.4).
// Usa las MISMAS fórmulas que battle.js (que importa de aquí atkMulB/defMulB), pero sin el azar:
// el rango es la variación normal ×0.9–×1.1. Los críticos no se incluyen (se avisa con una nota).
// Todo es texto generado por el juego (números y nombres de habilidades): nunca texto de usuarios.
'use strict';

// Mejoras activas que cambian el ataque y la defensa (buffs)
export const atkMulB = b => (b && b.atk > 0 ? 1.35 : 1) * (b && b.fury > 0 ? 1.6 : 1) * (b && b.bear > 0 ? 1.5 : 1);
export const defMulB = b => (b && b.def > 0 ? 1.35 : 1) * (b && b.stone > 0 ? 1.6 : 1);
export const poisonTick = mhp => Math.max(1, Math.round(mhp * .07));

// A (atacante): { atk (con mejoras), atkRaw, mag, hp, mhp, critMul }
// T (objetivo): { def (con mejoras), hp, mhp, curse, undead, boss }
// Maldición (+30%, o más con talento) y Marca de Caza (+40%) sobre el daño recibido
const fin = (v, T) => { if (T.curse) v = Math.round(v * (T.curseM || 1.3)); if (T.mark) v = Math.round(v * 1.4); return v; };
const both = f => [f(.9), f(1.1)];
// A.bo: multiplicador de la habilidad en curso (talentos); lo fija estimate()
export const physR = (A, T, m, crit, pierce) => both(r => fin(Math.round(Math.max(1, (A.atk * m - (pierce ? 0 : T.def) * .5) * r) * (A.bo || 1) * (crit ? A.critMul : 1)), T));
export const magR = (A, T, m) => both(r => fin(Math.max(1, Math.round((A.mag * m - T.def * .2) * r * (A.bo || 1))), T));
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const P = m => (A, T) => physR(A, T, m), M = m => (A, T) => magR(A, T, m);
const bomb = k => (A, T) => both(r => fin(Math.max(1, Math.round((Math.max(A.atkRaw, A.mag) * k - T.def * .3) * r * (A.bo || 1))), T));

// Daño a un objetivo
const ONE = {
  atk: P(1), golpe: P(1.8), titanico: P(3), hachazo: P(1.8), martillazo: P(1.6), punalada: P(1.5), asesinar: P(2.5),
  flechaven: P(1), punalsucio: P(1), fuego: M(1.7), rayo: M(2.8), drenarvida: M(1.4), raices: M(.6),
  luz: (A, T) => magR(A, T, T.undead ? 3 : 1.5),
  lunar: (A, T) => add(physR(A, T, .8), magR(A, T, .8)),
  halcon: (A, T) => physR(A, T, 2.4, true),
  desesperado: (A, T) => physR(A, T, 1.4 + 2.6 * (1 - A.hp / A.mhp)),
  suerte: (A, T) => [physR(A, T, A.lucky ? 1.5 : .5)[0], physR(A, T, 4)[1]],
  // Versión 3 · Fase 2
  juicio: (A, T) => { const k = T.undead ? 2 : 1; return add(physR(A, T, 1.1 * k), magR(A, T, 1.1 * k)); },
  carga: P(2.8), novasolar: M(4), perforante: (A, T) => physR(A, T, 1.8, false, true), tiromortal: (A, T) => physR(A, T, 2.3, true),
  saqueo: P(1.4), golpebajo: P(1.6), montana: P(3), estrella: M(3), cadena: M(1.7),
};
// Varios golpes: [golpes, daño de cada uno]
const MULTI = { doble: [2, P(.9), '🏹'], danza: [3, P(.8), '🗡️'], tormenta: [5, P(.9), '🏹'], milcortes: [8, P(.6), '🗡️'], torbelfico: [6, P(.8), '⚔️'] };
const RANDOM_HITS = new Set(['danza', 'tormenta', 'milcortes', 'torbelfico']);
// A todos los enemigos
const AOE = {
  torbellino: P(1.1), torbellinob: P(1.1), lluvia: P(.9), sismico: P(1.2), dagas: P(.7),
  ventisca: M(1.1), meteoro: M(2), plaga: M(1), ira: M(1.2),
  luzluna: (A, T) => magR(A, T, T.undead ? 2.4 : 1.2),
  bomba: bomb(1),
  infierno: M(1.3), juiciodiv: (A, T) => magR(A, T, T.undead ? 2.6 : 1.3), atronador: P(.6), terremoto: P(1.2), avalancha: P(1.5), granbomba: bomb(2),
  monedas: (A, T) => both(r => fin(Math.max(1, Math.round((A.atkRaw * .6 + Math.sqrt(Math.max(0, A.gold || 0)) * 1.2 - T.def * .3) * r * (A.bo || 1))), T)),
};
const MAGIC = new Set(['fuego', 'rayo', 'drenarvida', 'raices', 'luz', 'ventisca', 'meteoro', 'plaga', 'ira', 'luzluna', 'bomba',
  'novasolar', 'estrella', 'cadena', 'infierno', 'juiciodiv', 'granbomba', 'monedas']);
// Veneno que dejan: turnos (y probabilidad si no es seguro)
const DOT = { flechaven: [4, 1], punalsucio: [3, 1], plaga: [3, 1], ira: [3, 1], dagas: [3, .5] };
// Quemadura (6% de la vida máx. por turno, 3 turnos)
const BURN = new Set(['infierno', 'granbomba']);

const rng = ([lo, hi]) => (lo === hi ? `${lo}` : `${lo}–${hi}`);
const avgOf = (list, f) => { if (!list.length) return null; const rs = list.map(f); return [Math.round(rs.reduce((a, r) => a + r[0], 0) / rs.length), Math.round(rs.reduce((a, r) => a + r[1], 0) / rs.length)]; };
const left = (T, r) => { if (r[0] >= T.hp) return '💀 lo derrota'; return `PV ${T.hp}/${T.mhp} → ≈ ${Math.max(0, T.hp - Math.round((r[0] + r[1]) / 2))} PV`; };
const healTo = (H, n) => `PV ${H.hp}/${H.mhp} → ≈ ${Math.min(H.mhp, H.hp + n)}/${H.mhp}`;
const critNote = A => `crítico ×${A.critMul === 2.5 ? '2.5' : '1.75'}`;

// Estimado de una acción ('atk' o una habilidad) para el héroe A contra los enemigos vivos Ts.
// Devuelve { line, note, enemy(T) → texto del botón del objetivo, ally(H) → texto, revive(H) → texto }
export function estimate(k, A0, Ts) {
  const out = { line: '', note: '' };
  // Talentos que mejoran esta habilidad (+%) y los que la hacen quemar
  const A = Object.assign({}, A0, { bo: 1 + (A0.boost ? A0.boost(k) || 0 : 0) });
  if (ONE[k]) {
    const f = ONE[k], avg = avgOf(Ts, T => f(A, T));
    out.line = avg ? `${MAGIC.has(k) ? '✨' : '⚔️'} Daño ≈ ${rng(avg)}` : '';
    out.enemy = T => {
      if (k === 'asesinar' && !T.boss && T.hp / T.mhp < .25) return `PV ${T.hp}/${T.mhp} · 💀 lo elimina`;
      return left(T, f(A, T));
    };
    if (k === 'halcon') out.note = 'crítico seguro (incluido)';
    else if (k === 'punalada') out.note = '50% de ' + critNote(A);
    else if (!MAGIC.has(k)) out.note = critNote(A);
    if (k === 'suerte') out.line += ' (al azar)';
    if (k === 'martillazo') out.line += ' · 30% 💫';
    if (k === 'raices') out.line += ' · 💫 pierde su turno';
    if (k === 'asesinar') out.line += ' · elimina si tiene <25% PV';
    if (k === 'drenarvida' && avg) out.line += ` · 💚 +${Math.round((avg[0] + avg[1]) / 4)}`;
    if (k === 'luz' || k === 'luzluna' || k === 'juicio') out.line += ' (más a no-muertos)';
    if (k === 'carga' || k === 'montana' || k === 'golpebajo') out.line += ' · 💫 aturde';
    if (k === 'perforante') out.line += ' · ignora la DEF';
    if (k === 'cadena') out.line += ' · rebota en 2 más';
    if (k === 'saqueo') out.line += ' · 💰 roba el doble';
  } else if (MULTI[k]) {
    const [n0, f, ic] = MULTI[k], n = n0 + (k === 'danza' && A.dance ? A.dance : 0), avg = avgOf(Ts, T => f(A, T));
    out.line = avg ? `${ic} ${n} × ≈ ${rng(avg)}${RANDOM_HITS.has(k) ? ' al azar' : ''}` : '';
    out.note = critNote(A);
    if (k === 'doble') out.enemy = T => { const r = f(A, T); return left(T, [r[0] * 2, r[1] * 2]); };
  } else if (AOE[k]) {
    const f = AOE[k], avg = avgOf(Ts, T => f(A, T));
    out.line = avg ? `💥 ≈ ${rng(avg)} a cada enemigo` : '';
    if (!MAGIC.has(k)) out.note = critNote(A);
    if (k === 'atronador' || k === 'terremoto') out.line += ' · 30% 💫';
    if (k === 'juiciodiv') out.line += ' (×2 a no-muertos)';
  }
  if ((BURN.has(k) || (A0.burnSk && A0.burnSk(k))) && Ts.length) {
    const avgM = Ts.reduce((a, T) => a + T.mhp, 0) / Ts.length;
    out.line += ` · 🔥 +${Math.max(1, Math.round(avgM * .06))} por turno durante 3 turnos`;
  }
  if (DOT[k]) {
    const [n, p] = DOT[k], avgM = Ts.length ? Ts.reduce((a, T) => a + T.mhp, 0) / Ts.length : 0;
    if (avgM) out.line += ` · ☠️ +${poisonTick(avgM)} por turno durante ${n} turnos${p < 1 ? ' (50%)' : ''}`;
  }
  if (out.line) return out;
  // Curación y efectos sin daño
  const hpT = (H, n) => healTo(H, n);
  switch (k) {
    case 'curar': { const n = Math.round((A.mag * 2.2 + 12) * (1 + (A.heal || 0))); out.line = `💚 Cura ≈ ${n} · quita veneno`; out.ally = H => hpT(H, n); break; }
    case 'curartodos': { const n = Math.round((A.mag * 1.5 + 8) * (1 + (A.heal || 0))); out.line = `💚 ≈ ${n} a cada uno`; break; }
    case 'revivir': out.line = '🪶 Revive con 50% PV'; out.revive = H => `💀 → ≈ ${Math.round(H.mhp * .5)}/${H.mhp} PV`; break;
    case 'cerveza': out.line = `💚 Cura ≈ ${Math.round(A.mhp * .35 * (1 + (A.heal || 0)))} y quita estados · ${A.beer2 ? '2 veces' : '1 vez'}`; break;
    case 'grito': out.line = '+35% ATQ al grupo · 3 turnos'; break;
    case 'bendicion': out.line = '+35% DEF al grupo · 3 turnos'; break;
    case 'furia': out.line = `+60% ATQ · 3 turnos · cuesta ${Math.max(1, Math.round(A.mhp * .1))} PV`; break;
    case 'espinas': out.line = 'Refleja 30% del daño · 3 turnos'; break;
    case 'oso': out.line = `🐻 +${Math.round(A.mhp * .5)} PV temporales · +50% ATQ · 3 turnos`; break;
    case 'piedra': out.line = '+60% DEF · 3 turnos'; break;
    case 'canto': out.line = '+30% VEL y +10% crítico al grupo · 3 turnos'; break;
    case 'maldicion': out.line = '🔮 +30% de daño recibido · 3 turnos'; out.enemy = T => `PV ${T.hp}/${T.mhp}${T.curse ? ' · ya maldito' : ''}`; break;
    case 'trampa': { const avg = avgOf(Ts, T => physR(A, T, 1.2)); out.line = `🪤 Devuelve ≈ ${avg ? rng(avg) : '?'} y aturde`; break; }
    case 'esqueleto': {
      const avg = avgOf(Ts, T => both(r => fin(Math.max(1, Math.round((A.mag * .9 + A.atkRaw * .4 - T.def * .4) * r)), T)));
      out.line = `💀 ≈ ${avg ? rng(avg) : '?'} por ronda · 3 rondas`; break;
    }
    case 'robar': out.line = `💰 ${Math.round((.65 + (A.steal || 0)) * 100)}% de robar oro u objetos`; out.enemy = T => `PV ${T.hp}/${T.mhp}`; break;
    // ---- Versión 3 · Fase 2
    case 'escudosag': out.line = `💠 Escudo ≈ ${Math.round(A.mag * 1.5)} + 25% PV al aliado más débil`; break;
    case 'muroesc': out.line = '+35% DEF y 💠 escudo de 10% PV al grupo · 3 turnos'; break;
    case 'acelerar': out.line = '⏩ El grupo actúa primero · 2 turnos'; break;
    case 'detener': out.line = '⏳ Pierde 2 turnos (jefes: 1)'; out.enemy = T => `PV ${T.hp}/${T.mhp} · pierde ${T.boss ? 1 : 2} turno${T.boss ? '' : 's'}`; break;
    case 'marca': out.line = '🎯 +40% de daño recibido · 3 turnos'; out.enemy = T => `PV ${T.hp}/${T.mhp}${T.mark ? ' · ya marcado' : ''}`; break;
    case 'sombra': out.line = '👤 Esquiva todo 1 turno · ⚡ siguiente golpe crítico'; break;
    case 'resmasiva': out.line = '🪶 Revive a todos los caídos con 30% PV'; break;
    case 'santuario': out.line = '💚 Regenera 6% PV por turno al grupo · 3 turnos'; break;
    case 'profecia': out.line = '✨ Anula el próximo golpe a cada aliado'; break;
    case 'frenesi': out.line = '💢 2 ataques por turno · 3 turnos'; break;
    case 'rabia': out.line = '🩸 30% de robo de vida · 3 turnos'; break;
    case 'estandarte': out.line = '🚩 +35% ATQ al grupo · 4 turnos'; break;
    case 'ejercito': { const avg = avgOf(Ts, T => both(r => fin(Math.max(1, Math.round((A.mag * .9 + A.atkRaw * .4 - T.def * .4) * r)), T))); out.line = `💀💀 2 × ≈ ${avg ? rng(avg) : '?'} por ronda · 3 rondas`; break; }
    case 'cadaver': out.line = `💥 Cada enemigo que muere hace ≈ ${Math.round(A.mag * .9)} a los demás · 3 rondas`; break;
    case 'pacto': out.line = `🩸 −${Math.max(1, Math.round(A.mhp * .2))} PV → +40% PM`; break;
    case 'agonia': { const b = Math.max(1, Math.round(A.mag * .8 * A.bo)); out.line = `💜 ${b} → ${Math.round(b * 1.5)} → ${b * 2} en 3 turnos`; break; }
    case 'osomayor': out.line = `🐻 +${Math.round(A.mhp * .7)} PV temporales · +50% ATQ · 5 turnos`; break;
    case 'lluviasan': { const n = Math.round((A.mag * 1.3 + 10) * (1 + (A.heal || 0))); out.line = `💚 ≈ ${n} a cada uno + regeneración 2 turnos`; break; }
    case 'runafuego': out.line = '🪔 Los golpes físicos del grupo queman · 3 turnos'; break;
    case 'runapiedra': out.line = '💠 Escudo de 20% PV a todo el grupo'; break;
    case 'pasosombrio': out.line = '👤 Esquiva todo hasta su próximo turno'; break;
    case 'velo': out.line = '🌙 +30% de esquivar al grupo · 2 turnos'; break;
    case 'mina': { const avg = avgOf(Ts, T => physR(A, T, 2)); out.line = `💣 ≈ ${avg ? rng(avg) : '?'} al próximo enemigo que actúe`; break; }
    case 'soborno': {
      const ok = Ts.filter(T => !T.boss); const c = ok.length ? Math.round(ok.reduce((a, T) => a + 10 + T.g * 3, 0) / ok.length) : 0;
      out.line = ok.length ? `💰 Cuesta ≈ ${c} oro · el enemigo se va` : 'Los jefes no aceptan sobornos';
      out.enemy = T => T.boss ? '👑 No acepta sobornos' : `💰 ${Math.round(10 + T.g * 3)} oro${(A.gold || 0) < Math.round(10 + T.g * 3) ? ' · no te alcanza' : ''}`; break;
    }
    default: out.line = '';
  }
  return out;
}

// ================= Objetos sobre un héroe (0.4) =================
// H: { hp, mhp, mp, mmp, poison }. Devuelve { show, dis (motivo), prev (vista previa), need (0 = lo necesita más) }
export function itemPreview(k, H) {
  const dead = H.hp <= 0;
  if (k === 'pluma') return dead ? { show: true, prev: `🪶 Revive → ${Math.round(H.mhp * .5)}/${H.mhp} PV`, need: 0 } : { show: false };
  if (dead) return { show: true, dis: '💀 Caído', need: 9 };
  if (k === 'pocion') {
    if (H.hp >= H.mhp && !(H.poison > 0)) return { show: true, dis: 'Vida llena', need: 9 };
    const g = Math.min(H.mhp - H.hp, Math.round(H.mhp * .5));
    return { show: true, prev: `🧪 +${g} PV → ${H.hp + g}/${H.mhp}${H.poison > 0 ? ' · quita veneno' : ''}`, need: H.hp / H.mhp - (H.poison > 0 ? .05 : 0) };
  }
  if (k === 'eter') {
    if (H.mp >= H.mmp) return { show: true, dis: 'Magia llena', need: 9 };
    const g = Math.min(H.mmp - H.mp, Math.round(H.mmp * .5));
    return { show: true, prev: `🔷 +${g} PM → ${H.mp + g}/${H.mmp}`, need: H.mp / H.mmp };
  }
  return { show: true, prev: '', need: 1 };
}
// Lista de tarjetas para elegir héroe: marca al que más lo necesita (best)
export function itemTargets(k, list) {
  const rows = list.map(x => Object.assign({ x }, itemPreview(k, x.H))).filter(r => r.show);
  const ok = rows.filter(r => !r.dis); const best = ok.length ? ok.reduce((a, b) => (b.need < a.need ? b : a)) : null;
  for (const r of rows) r.best = r === best;
  return rows;
}
// Tarjeta HTML de un héroe (emoji, nombre y clase, barras y números de PV/PM, vista previa o motivo).
// name/sub DEBEN venir ya escapados por quien llama.
export function heroCardHTML({ e, name, sub, H }, prev, dis, best) {
  const pct = (a, b) => Math.max(0, Math.min(100, 100 * a / Math.max(1, b)));
  return `<span class="hpk-top"><span class="emoji hpk-e">${e}</span><span class="hpk-n"><b>${name}</b><small>${sub}</small></span>${best ? '<span class="hpk-best">⭐ Lo necesita</span>' : ''}</span>
    <span class="bar"><i style="width:${pct(H.hp, H.mhp)}%"></i></span><span class="bar mp"><i style="width:${pct(H.mp, H.mmp)}%"></i></span>
    <small class="hpk-nums">PV ${Math.max(0, H.hp)}/${H.mhp} · PM ${H.mp}/${H.mmp}</small>
    <small class="hpk-prev ${dis ? 'no' : ''}">${dis || prev || ''}</small>`;
}
