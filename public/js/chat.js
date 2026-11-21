// Panel de la sala (Versión 3 · Fase 0.2): pestañas 💬 Chat y 👥 Sala.
// - Chat: mensajes con emoji del líder, nombre en su color, hora y texto; mensajes del sistema en gris;
//   acceso a los mensajes rápidos (⚡); "🔕 Silenciar" oculta los globos y el contador de no leídos.
// - Sala: jugadores conectados y "📍 Marcar aquí" (lo que antes era todo el panel).
// SEGURIDAD: el texto de los jugadores nunca entra con innerHTML: se arma con textContent.
// En el celular es un panel que sube desde abajo (mitad de la pantalla) y se acomoda sobre el teclado.
'use strict';
import { $, esc, unesc } from './util.js';
import { QUICK } from './data.js';
import { P, st, leader } from './state.js';
import { net, sendQuick, placePin, sendChat, mateColor, CHAT_MAX } from './net.js';
import { playersHTML, feed, toast } from './ui.js';
import { chatMuted, toggleMute } from './prefs.js';
import { sfx } from './audio.js';

let tab = 'chat', unread = 0, built = false, sendLock = 0;
const el = () => $('#social');
export const isSocialOpen = () => !!el() && !el().classList.contains('hidden');
const connIcon = () => !st.online ? '⚪' : net.status === 'on' ? '🟢' : '🟡';
const connText = () => !st.online ? 'Sin conexión' : net.status === 'on' ? 'Conectado' : 'Reconectando…';
const isMine = m => m.name === (net.name || st.name) || (m.id && m.id[0] === 'l');
const hhmm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

// ================= Estructura (se arma una sola vez; después solo se actualizan partes) =================
function build() {
  const box = el(); built = true;
  box.innerHTML = `<div class="sochead">
      <div class="stabs" role="tablist"><button class="stab" role="tab" data-s="tab" data-k="chat">💬 Chat</button><button class="stab" role="tab" data-s="tab" data-k="sala">👥 Sala <small class="scount"></small></button></div>
      <button class="btn sico smute" data-s="mute"></button><button class="btn sico" data-s="close" aria-label="Cerrar">✕</button></div>
    <div class="spane" data-p="chat">
      <div class="clist" role="log" aria-live="polite"></div>
      <div class="cquick hidden">${QUICK.map(q => `<button class="btn" data-s="q" data-k="${q.id}">${esc(q.t)}</button>`).join('')}</div>
      <div class="cerr hidden"></div>
      <form class="cform" autocomplete="off"><button type="button" class="btn sico" data-s="qk" aria-label="Mensajes rápidos" title="Mensajes rápidos">⚡</button><input class="cin" maxlength="${CHAT_MAX}" enterkeyhint="send" placeholder="Escribe un mensaje…" aria-label="Mensaje"><button type="submit" class="btn gold csend">Enviar</button></form>
    </div>
    <div class="spane" data-p="sala">
      <div class="sconn mut small"></div>
      <div class="plist"></div>
      <button class="btn gold full" data-s="pin">📍 Marcar aquí</button>
      <p class="mut small soff"></p>
    </div>`;
  box.querySelector('.cform').addEventListener('submit', e => { e.preventDefault(); doSend(); });
  const inp = box.querySelector('.cin');
  inp.addEventListener('focus', () => { setTimeout(() => { fitKeyboard(); scrollEnd(true); }, 250); });
  inp.addEventListener('keydown', e => { if (e.key === 'Escape') { inp.blur(); closeSocial(); } });
  renderAll(); setTab(tab);
}
function setTab(k) {
  tab = k; const box = el();
  box.querySelectorAll('.stab').forEach(b => { const on = b.dataset.k === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  box.querySelectorAll('.spane').forEach(p => p.classList.toggle('hidden', p.dataset.p !== k));
  if (k === 'chat') { unread = 0; scrollEnd(true); } else refreshSala();
  updateBadge(); updateHead();
}
function updateHead() {
  const box = el(); if (!built) return;
  const n = [...net.others.values()].filter(o => o.online !== false && o.status !== 'away').length;
  box.querySelector('.scount').textContent = st.online ? `(${n + 1})` : '';
  const mb = box.querySelector('.smute'); const m = chatMuted();
  mb.textContent = m ? '🔕' : '🔔'; mb.title = m ? 'Chat silenciado: toca para activar los globos y el contador' : 'Silenciar chat (oculta los globos y el contador)';
  mb.setAttribute('aria-label', mb.title); mb.classList.toggle('on', m);
}
function refreshSala() {
  const box = el(); if (!built) return;
  box.querySelector('.sconn').textContent = `Sala ${st.room || ''} · ${connIcon()} ${connText()}`;
  box.querySelector('[data-p=sala] .plist').innerHTML = playersHTML(false);   // playersHTML escapa los nombres
  box.querySelector('.soff').textContent = st.online ? '' : 'Sin conexión: los mensajes y marcas solo los ves tú.';
}

// ================= Mensajes =================
function msgNode(m) {
  const d = document.createElement('div');
  if (m.kind === 'sys') { d.className = 'cmsg sys'; d.textContent = unesc(m.text); return d; }
  d.className = 'cmsg' + (isMine(m) ? ' me' : '') + (m.kind === 'quick' ? ' quick' : '');
  const head = document.createElement('div'); head.className = 'chead';
  const e = document.createElement('span'); e.className = 'ce emoji'; e.textContent = m.e || '🙂';
  const n = document.createElement('b'); n.className = 'cn'; n.textContent = m.name || '?';
  n.style.color = isMine(m) ? '#f2c14e' : mateColor(m.name);
  const t = document.createElement('span'); t.className = 'ct'; t.textContent = hhmm(m.t);
  head.append(e, n, t);
  const x = document.createElement('div'); x.className = 'cx'; x.textContent = unesc(m.text);
  d.append(head, x); return d;
}
function renderAll() {
  const list = el().querySelector('.clist'); list.textContent = '';
  if (!net.chat.length) { const p = document.createElement('p'); p.className = 'cempty mut small'; p.textContent = st.online ? 'Aún no hay mensajes. ¡Saluda a tu equipo!' : 'Sin conexión: los mensajes solo los ves tú.'; list.appendChild(p); }
  for (const m of net.chat) list.appendChild(msgNode(m));
  scrollEnd(true);
}
function nearEnd(list) { return list.scrollHeight - list.scrollTop - list.clientHeight < 60; }
function scrollEnd(force) { const list = el() && el().querySelector('.clist'); if (list && (force || nearEnd(list))) list.scrollTop = list.scrollHeight; }
// Evento de net.js: m = mensaje nuevo, o null = historial completo (al entrar o reconectar)
function onChat(m) {
  if (!m) { unread = 0; if (built) renderAll(); updateBadge(); return; }
  if (built) {
    const list = el().querySelector('.clist'), stick = nearEnd(list) || isMine(m);
    const empty = list.querySelector('.cempty'); if (empty) empty.remove();
    list.appendChild(msgNode(m)); while (list.children.length > 100) list.firstChild.remove();
    if (stick) list.scrollTop = list.scrollHeight;
  }
  if (m.kind !== 'sys' && !isMine(m) && !(isSocialOpen() && tab === 'chat')) { unread++; updateBadge(); }
  if (m.kind !== 'sys' && !isMine(m) && !chatMuted()) sfx('chat');
}
function updateBadge() {
  const b = $('#socBadge'); if (!b) return;
  const show = unread > 0 && !chatMuted();
  b.textContent = unread > 9 ? '9+' : String(unread); b.classList.toggle('hidden', !show);
}
async function doSend() {
  const box = el(), inp = box.querySelector('.cin'), err = box.querySelector('.cerr');
  const text = inp.value;
  if (Date.now() < sendLock) { showErr('Espera un segundo entre mensajes.'); return; }
  if (!text.trim()) { showErr('Escribe algo primero.'); return; }
  sendLock = Date.now() + 1000; box.querySelector('.csend').disabled = true;
  setTimeout(() => { const s = el().querySelector('.csend'); if (s) s.disabled = false; }, 1000);
  const r = await sendChat(text, { name: st.name, e: st.inGame ? leader().e : null });
  if (r.ok) { inp.value = ''; err.classList.add('hidden'); } else showErr(r.error || 'No se pudo enviar.');
}
function showErr(t) { const e = el().querySelector('.cerr'); e.textContent = t; e.classList.remove('hidden'); clearTimeout(showErr.t); showErr.t = setTimeout(() => e.classList.add('hidden'), 3000); }

// ================= Abrir / cerrar =================
export function toggleSocial(force) {
  const box = el(); if (!box) return;
  const open = force == null ? !isSocialOpen() : force;
  if (open && !built) build();
  box.classList.toggle('hidden', !open);
  if (open) { refreshSala(); updateHead(); setTab(tab); fitKeyboard(); }
  else { const i = box.querySelector('.cin'); if (i) i.blur(); box.querySelector('.cquick') && box.querySelector('.cquick').classList.add('hidden'); }
}
export const closeSocial = () => { if (isSocialOpen()) toggleSocial(false); };
// Lo llama ui.updatePlayersUI cuando cambia la lista de jugadores
export function refreshSocial() { if (isSocialOpen()) { refreshSala(); updateHead(); } }

// El teclado del celular: el panel se apoya justo encima (visualViewport) para que el campo de texto se vea
function fitKeyboard() {
  const box = el(), vv = window.visualViewport; if (!box || !isSocialOpen() || !vv) return;
  if (!matchMedia('(max-width: 640px), (pointer: coarse)').matches) { box.style.bottom = ''; box.style.height = ''; return; }
  const kb = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
  box.style.bottom = kb + 'px';
  box.style.height = Math.round(Math.min(innerHeight * .55, vv.height - 12)) + 'px';
}

export function initChat() {
  net.ev.chat = onChat;
  if (window.visualViewport) { visualViewport.addEventListener('resize', fitKeyboard); visualViewport.addEventListener('scroll', fitKeyboard); }
  addEventListener('resize', fitKeyboard);
  el().addEventListener('click', e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    const a = b.dataset.s;
    if (a === 'close') closeSocial();
    else if (a === 'tab') setTab(b.dataset.k);
    else if (a === 'qk') el().querySelector('.cquick').classList.toggle('hidden');
    else if (a === 'q') { sendQuick(b.dataset.k); el().querySelector('.cquick').classList.add('hidden'); }
    else if (a === 'pin') { placePin(P.x, P.y); if (!st.online) feed('📍 Marcaste este lugar (visible 2 minutos)'); closeSocial(); }
    else if (a === 'mute') { const m = toggleMute(); updateHead(); updateBadge(); toast(m ? '🔕 Chat silenciado<br><span style="font-size:13px">Sin globos ni contador. Los mensajes siguen llegando aquí.</span>' : '🔔 Chat activado'); }
  });
}
export const chatUnread = () => unread;
