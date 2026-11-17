// Barras de vida de los enemigos con números (Versión 3 · Fase 0.6).
// - "PV 34 / 60" dentro de la barra, con contorno oscuro para leerse sobre cualquier fondo.
// - Al recibir daño, el número baja animado y la parte perdida queda un momento en un color más claro.
// - Los jefes tienen además una barra grande arriba de la pantalla (#b-boss).
// La usan battle.js (combate normal y anfitrión) y coop.js (vista del invitado).
'use strict';
import { $ } from './util.js';

const fmt = n => Math.max(0, Math.round(n)).toLocaleString('es-CL');
export const ebarHTML = (big) => `<div class="ebar${big ? ' big' : ''}"><b class="ghost"></b><i></i><span class="ehp"></span></div>`;

function tween(el, from, to, mhp) {
  cancelAnimationFrame(el._raf);
  const s = el.querySelector('.ehp'), t0 = performance.now(), dur = 450;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), v = from + (to - from) * (1 - Math.pow(1 - k, 3));
    s.textContent = `PV ${fmt(v)} / ${fmt(mhp)}`; el._shown = v;
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}
// el: contenedor .ebar
export function setBar(el, hp, mhp) {
  if (!el) return;
  hp = Math.max(0, hp); mhp = Math.max(1, mhp);
  const pct = Math.min(100, 100 * hp / mhp), i = el.querySelector('i'), g = el.querySelector('.ghost'), s = el.querySelector('.ehp');
  const prev = el._hp;
  if (prev === hp && el._m === mhp) return;
  i.style.width = pct + '%';
  if (prev != null && hp < prev) {
    // La parte perdida se queda clara un momento y después se achica
    clearTimeout(el._gt); g.style.transition = 'none';
    el._gt = setTimeout(() => { g.style.transition = 'width .5s ease-out'; g.style.width = pct + '%'; }, 380);
    tween(el, el._shown != null ? el._shown : prev, hp, mhp);
  } else {
    clearTimeout(el._gt); g.style.transition = 'none'; g.style.width = pct + '%';
    cancelAnimationFrame(el._raf); el._shown = hp; s.textContent = `PV ${fmt(hp)} / ${fmt(mhp)}`;
  }
  el._hp = hp; el._m = mhp;
}

// Barra grande del jefe arriba de la pantalla
export function bossBar(e) {
  const box = $('#b-boss'); if (!box) return;
  if (!e) { box.classList.add('hidden'); box.innerHTML = ''; box._id = null; return; }
  if (box._id !== e.id) {
    box._id = e.id; box.classList.remove('hidden');
    const nm = document.createElement('div'); nm.className = 'bbn';
    nm.textContent = `👑 ${e.name}`; const lv = document.createElement('span'); lv.textContent = `Nv ${e.lvl}`; nm.appendChild(lv);
    box.innerHTML = ''; box.appendChild(nm); box.insertAdjacentHTML('beforeend', ebarHTML(true));
  }
  setBar(box.querySelector('.ebar'), e.hp, e.mhp);
}
