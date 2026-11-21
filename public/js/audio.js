// Música y efectos de sonido (Versión 3 · Fase 6.7).
// Todo se genera con Web Audio API (osciladores cuadrados, triangulares y ruido, como un chip clásico); no hay archivos de audio.
// Todas las melodías de este archivo son composiciones originales hechas para Tierras Sin Fin.
// - El audio arranca recién con el primer toque, clic o tecla (política de reproducción automática de los navegadores).
// - Se pausa cuando la pestaña o la app pasa a segundo plano.
// - Preferencias (volumen de música, de efectos y silencio) en el dispositivo: localStorage 'tsf:sound'.
'use strict';

const PREF_KEY = 'tsf:sound';
let pref = { music: .5, sfx: .7, mute: false };
try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); if (p && typeof p === 'object') pref = { music: num(p.music, .5), sfx: num(p.sfx, .7), mute: !!p.mute }; } catch (e) { /* sin almacenamiento */ }
function num(v, d) { return typeof v === 'number' && v >= 0 && v <= 1 ? v : d; }
function savePref() { try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch (e) { /* nada */ } }
export const soundPref = () => Object.assign({}, pref);

let ctx = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
function applyVol() {
  if (!ctx) return; const t = ctx.currentTime;
  master.gain.setTargetAtTime(pref.mute ? 0 : 1, t, .05);
  musicBus.gain.setTargetAtTime(pref.music * .55, t, .05);
  sfxBus.gain.setTargetAtTime(pref.sfx * .8, t, .02);
}
export function setSound(k, v) { if (k === 'mute') pref.mute = !!v; else if (k === 'music' || k === 'sfx') pref[k] = Math.max(0, Math.min(1, +v || 0)); savePref(); applyVol(); }
// Crear el contexto solo después de un gesto del usuario
function unlock() {
  if (ctx) { if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try { ctx = new AC(); } catch (e) { ctx = null; return; }
  master = ctx.createGain(); master.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVol(); sched = setInterval(schedule, 100);
  if (want) startTheme(want);
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlock, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); });
export const audioReady = () => !!ctx && ctx.state === 'running';

// ================= Síntesis =================
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(n) { const m = /^([A-G])(#|b)?(-?\d)$/.exec(n); if (!m) return null; return 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); }
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
function tone(dest, type, f, t, dur, vol, o = {}) {
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib; lg.gain.value = f * .012; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + .05); }
  const a = o.a || .008, r = Math.min(o.r || .06, dur * .6);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.setValueAtTime(vol * (o.sus || .8), t + Math.max(a, dur - r)); g.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(g); g.connect(dest); osc.start(t); osc.stop(t + dur + .02);
}
function noise(dest, t, dur, vol, o = {}) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = o.hp ? 'highpass' : 'bandpass'; f.frequency.value = o.freq || 1800; f.Q.value = o.q || .8;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * .5); s.stop(t + dur + .02);
}
function kick(dest, t, vol) { tone(dest, 'sine', 140, t, .16, vol, { to: 45, a: .002, r: .1 }); }

// ================= Temas (datos) =================
// lead: "Nota:corcheas" separadas por espacios (R = silencio, | separa compases de 8 corcheas, solo para leer)
// roots: la fundamental de cada compás · bass: arp (arpegio), pulse (negras), drive (corcheas con octava), hold (redonda)
// drums: un patrón de 8 corcheas por compás (k bombo, s caja, h platillo, . nada)
const THEMES = {
  // 🏰 Ciudad Origen: alegre y de plaza (Do mayor)
  city: { bpm: 112, wave: 'square', bass: 'arp', drums: 'k.h.s.h.', roots: 'C3 F3 A2 G2 F2 G2 F2 C3',
    lead: 'E5:2 G5:1 A5:1 G5:2 E5:2 | D5:2 E5:1 F5:1 E5:4 | C5:2 D5:1 E5:1 G5:2 A5:2 | G5:6 R:2 | A5:2 G5:1 F5:1 E5:2 C5:2 | D5:2 F5:2 E5:4 | C5:1 D5:1 E5:2 D5:2 B4:2 | C5:6 R:2' },
  // 🏘️ Aldeas: tranquila, pastoral (Sol mayor)
  village: { bpm: 92, wave: 'triangle', bass: 'arp', drums: 'k...h...', roots: 'G2 C3 A2 D3 E2 A2 D3 G2',
    lead: 'B4:3 D5:1 G5:2 F#5:2 | E5:3 D5:1 B4:4 | C5:3 E5:1 A5:2 G5:2 | F#5:6 R:2 | G5:3 F#5:1 E5:2 D5:2 | C5:2 E5:2 D5:4 | B4:2 A4:2 C5:2 F#4:2 | G4:6 R:2' },
  // 🌾 Campo de día: heroica, de viaje (Re mayor)
  day: { bpm: 128, wave: 'square', bass: 'drive', drums: 'k.hsk.hs', roots: 'D3 A2 G2 D3 G2 D3 A2 D3',
    lead: 'D5:2 A4:1 D5:1 F#5:2 E5:1 D5:1 | E5:2 C#5:2 A4:4 | B4:2 D5:1 G5:1 F#5:2 E5:2 | F#5:6 R:2 | G5:2 F#5:1 E5:1 D5:2 B4:2 | A4:2 D5:2 F#5:2 A5:2 | G5:2 E5:2 C#5:2 E5:2 | D5:6 R:2' },
  // 🌙 Campo de noche: calma y misterio (La menor)
  night: { bpm: 80, wave: 'triangle', bass: 'hold', drums: '....h...', roots: 'A2 D3 F2 A2 C3 G2 E2 A2',
    lead: 'A4:4 C5:2 E5:2 | D5:4 C5:2 B4:2 | C5:4 A4:2 G4:2 | A4:8 | E5:4 F5:2 E5:2 | D5:3 C5:1 B4:4 | C5:2 B4:2 G#4:2 B4:2 | A4:8' },
  // 🕳️ Mazmorra: escasa y sombría (Re menor)
  dungeon: { bpm: 74, wave: 'square', soft: true, bass: 'pulse', drums: 'k.......', roots: 'D2 A2 D2 A2 Bb2 G2 A2 D2',
    lead: 'D5:2 R:2 F5:2 E5:2 | C#5:4 R:4 | D5:2 R:2 A4:2 Bb4:2 | A4:6 R:2 | F5:2 R:2 G5:2 F5:2 | E5:4 D5:4 | C#5:2 E5:2 A4:2 C#5:2 | D5:6 R:2' },
  // ⚔️ Combate: rápida y con empuje (Mi menor)
  battle: { bpm: 150, wave: 'square', bass: 'drive', drums: 'khskkhsh', roots: 'E2 E2 C3 B2 C3 A2 B2 B2',
    lead: 'E5:1 E5:1 G5:1 E5:1 B5:2 A5:2 | G5:1 F#5:1 E5:1 D5:1 E5:4 | C5:1 C5:1 E5:1 C5:1 G5:2 F#5:2 | E5:1 D5:1 C5:1 D5:1 B4:4 | E5:1 G5:1 B5:1 G5:1 C6:2 B5:2 | A5:1 G5:1 F#5:1 A5:1 G5:4 | F#5:2 D#5:2 F#5:2 A5:2 | B5:6 R:2' },
  // 👑 Jefe: oscura y pesada (Do menor)
  boss: { bpm: 138, wave: 'sawtooth', bass: 'drive', drums: 'kkskkhsk', roots: 'C2 Ab2 Eb2 G2 F2 Bb2 G2 G2',
    lead: 'C5:2 Eb5:2 D5:1 C5:1 G4:2 | Ab4:2 C5:2 Bb4:2 G4:2 | C5:2 Eb5:2 F5:1 G5:1 Ab5:2 | G5:6 R:2 | Ab5:2 G5:2 F5:2 Eb5:2 | D5:2 F5:2 Eb5:2 C5:2 | B4:2 D5:2 F5:2 Ab5:2 | G5:6 R:2' },
  // 🏆 Fanfarria de victoria (una vez)
  victory: { bpm: 150, wave: 'square', bass: 'pulse', drums: 'k.s.k.s.', roots: 'C3 C3', once: true,
    lead: 'G4:1 C5:1 E5:1 G5:3 E5:1 G5:1 | C6:6 R:2' },
  // 💀 Derrota (una vez)
  defeat: { bpm: 70, wave: 'triangle', bass: 'hold', drums: '........', roots: 'A2 A2', once: true,
    lead: 'E5:3 D5:1 C5:2 B4:2 | A4:8' },
};
const BASS = { arp: [0, 7, 12, 7, 0, 7, 12, 7], drive: [0, 12, 0, 12, 0, 12, 0, 12], pulse: [0, null, null, null, 0, null, null, null], hold: [0, null, null, null, null, null, null, null] };
const BASS_LEN = { arp: 1, drive: 1, pulse: 4, hold: 8 };
// Pasa el texto a una lista por corchea: { lead: [{m, d}|undefined], bass: [...], drum: 'k'|... }
const compiled = {};
function compile(name) {
  if (compiled[name]) return compiled[name];
  const T = THEMES[name], lead = [], bass = [], drum = [];
  let i = 0;
  for (const tok of T.lead.split(/\s+/)) { if (!tok || tok === '|') continue; const [n, d] = tok.split(':'); const len = +d || 1; if (n !== 'R') lead[i] = { m: midi(n), d: len }; i += len; }
  const roots = T.roots.split(/\s+/).map(midi), bars = Math.max(roots.length, Math.ceil(i / 8)), n = bars * 8;
  for (let b = 0; b < bars; b++) {
    const r = roots[b % roots.length], pat = BASS[T.bass];
    for (let k = 0; k < 8; k++) { if (pat[k] != null) bass[b * 8 + k] = { m: r + pat[k], d: BASS_LEN[T.bass] }; drum[b * 8 + k] = T.drums[k]; }
  }
  return (compiled[name] = { T, lead, bass, drum, n });
}

// ================= Reproductor con fundido =================
let sched = null, cur = null, want = null, fading = [], jingleUntil = 0;
function startTheme(name) {
  if (!ctx || !THEMES[name]) return;
  const now = ctx.currentTime, c = compile(name);
  if (cur) { const old = cur; old.g.gain.cancelScheduledValues(now); old.g.gain.setValueAtTime(old.g.gain.value, now); old.g.gain.linearRampToValueAtTime(0, now + 1.2); old.stopAt = now + 1.25; fading.push(old); }
  const g = ctx.createGain(); g.connect(musicBus); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(1, now + (c.T.once ? .05 : 1.2));
  cur = { name, c, g, step: 0, next: now + .08, spb: 60 / c.T.bpm / 2 };
  if (c.T.once) jingleUntil = now + c.n * cur.spb + .4;
}
function playStep(p, i, t) {
  const c = p.c, T = c.T, sp = p.spb, L = c.lead[i], Bs = c.bass[i], d = c.drum[i];
  const lv = T.soft ? .07 : T.wave === 'sawtooth' ? .06 : .09;
  if (L) { tone(p.g, T.wave, hz(L.m), t, L.d * sp * .95, lv, { vib: L.d >= 4 ? 5.5 : 0, r: .08 }); if (T.wave === 'square' && !T.soft) tone(p.g, 'triangle', hz(L.m - 12), t, L.d * sp * .9, .035); }
  if (Bs) tone(p.g, 'triangle', hz(Bs.m), t, Bs.d * sp * .9, .13, { r: .04 });
  if (d === 'k') kick(p.g, t, .22); else if (d === 's') noise(p.g, t, .12, .12, { freq: 1700, q: .7 }); else if (d === 'h') noise(p.g, t, .04, .05, { hp: 1, freq: 7000 });
}
function schedule() {
  if (!ctx || ctx.state !== 'running') return;
  const ahead = ctx.currentTime + .35;
  fading = fading.filter(p => { if (ctx.currentTime > p.stopAt) { p.g.disconnect(); return false; } return true; });
  for (const p of [cur, ...fading]) {
    if (!p || p.done) continue;
    while (p.next < ahead && (!p.stopAt || p.next < p.stopAt)) {
      playStep(p, p.step, p.next); p.step++; p.next += p.spb;
      if (p.step >= p.c.n) { if (p.c.T.once) { p.done = true; break; } p.step = 0; }
    }
  }
  // Al terminar una fanfarria vuelve el tema que corresponde
  if (cur && cur.done && ctx.currentTime > jingleUntil && want && !THEMES[want].once) startTheme(want);
}
// El juego dice qué tema corresponde (cada medio segundo); solo cambia si es distinto
export function setTheme(name) {
  if (!THEMES[name] || THEMES[name].once) return;
  want = name;
  if (!ctx) return;
  if (cur && cur.c.T.once && !cur.done) return;   // se respeta la fanfarria
  if (!cur || cur.name !== name || cur.done) startTheme(name);
}
export function jingle(name) { if (!THEMES[name] || !THEMES[name].once || !ctx) return; startTheme(name); }
export const curTheme = () => (cur ? cur.name : null);

// ================= Efectos de sonido =================
let lastFx = 0, lastBy = {};
export function sfx(k) {
  sfxLog.push(k); if (sfxLog.length > 60) sfxLog.shift();
  if (!ctx || ctx.state !== 'running' || pref.mute || pref.sfx <= 0) return;
  const now = ctx.currentTime;
  if (now - (lastBy[k] || 0) < .05) return;            // sin ráfagas del mismo sonido
  if (k === 'buy' && now - lastFx < .25) return;       // la compra no tapa a otro sonido recién hecho (fabricar, portal)
  lastBy[k] = now; lastFx = now;
  const o = sfxBus, t = now + .005;
  switch (k) {
    case 'hit': noise(o, t, .09, .35, { freq: 900, q: .9 }); tone(o, 'square', 160, t, .07, .12, { to: 70 }); break;
    case 'crit': noise(o, t, .14, .45, { freq: 1300, q: .6 }); tone(o, 'square', 330, t, .06, .14); tone(o, 'square', 660, t + .05, .1, .12, { to: 220 }); break;
    case 'magic': tone(o, 'sine', 500, t, .3, .14, { to: 1300, vib: 9 }); tone(o, 'triangle', 750, t + .05, .25, .08, { to: 1800 }); break;
    case 'heal': [72, 76, 79, 84].forEach((m, i) => tone(o, 'triangle', hz(m), t + i * .06, .18, .13)); break;
    case 'miss': noise(o, t, .16, .18, { freq: 2600, q: 2.5 }); break;
    case 'level': [67, 71, 74, 79, 83, 86].forEach((m, i) => tone(o, 'square', hz(m), t + i * .07, i === 5 ? .4 : .1, .1, { vib: i === 5 ? 6 : 0 })); break;
    case 'chest': tone(o, 'square', hz(76), t, .08, .1); tone(o, 'square', hz(81), t + .08, .08, .1); [88, 91, 96].forEach((m, i) => tone(o, 'triangle', hz(m), t + .18 + i * .05, .12, .08)); break;
    case 'gather': tone(o, 'triangle', hz(69), t, .07, .15, { to: hz(76) }); noise(o, t, .05, .1, { freq: 3000 }); break;
    case 'craft': tone(o, 'square', hz(88), t, .05, .09); tone(o, 'square', hz(88), t + .12, .05, .09); tone(o, 'triangle', hz(95), t + .24, .2, .1); break;
    case 'buy': tone(o, 'square', hz(83), t, .06, .09); tone(o, 'square', hz(88), t + .06, .18, .09); break;
    case 'portal': tone(o, 'sine', 220, t, .7, .16, { to: 1100, vib: 12 }); tone(o, 'triangle', 330, t + .1, .6, .08, { to: 1650 }); break;
    case 'chat': tone(o, 'sine', hz(84), t, .07, .06); tone(o, 'sine', hz(88), t + .07, .1, .05); break;
  }
}

// ================= Panel 🔊 =================
export function soundPanelHTML() {
  const pc = v => Math.round(v * 100);
  return `<div class="sndrow"><label for="sndMusic">🎵 Música</label><input id="sndMusic" type="range" min="0" max="100" step="5" value="${pc(pref.music)}" aria-label="Volumen de la música"><b id="sndMusicV">${pc(pref.music)}%</b></div>
    <div class="sndrow"><label for="sndSfx">🔔 Efectos</label><input id="sndSfx" type="range" min="0" max="100" step="5" value="${pc(pref.sfx)}" aria-label="Volumen de los efectos"><b id="sndSfxV">${pc(pref.sfx)}%</b></div>
    <button class="btn full ${pref.mute ? 'gold' : ''}" id="sndMute">${pref.mute ? '🔇 Sonido silenciado · tocar para activar' : '🔊 Silenciar todo'}</button>
    <p class="mut small" style="margin:6px 0 0">Música original hecha con sonidos de chip. Se guarda en este dispositivo.${ctx ? '' : ' El sonido empieza al tocar la pantalla.'}</p>`;
}
// Diagnóstico (para las pruebas automáticas): estado del audio y últimos efectos pedidos
export const sfxLog = [];
export function audioDebug() { return { state: ctx ? ctx.state : 'none', theme: cur ? cur.name : null, step: cur ? cur.step : 0, done: cur ? !!cur.done : false, want, fading: fading.length, pref: soundPref(), master: master ? master.gain.value : null }; }
