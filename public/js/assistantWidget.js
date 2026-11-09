// U.6: AI Asistanı sağ altta açılır-kapanır pencere. Her marka sayfasında aynı sohbet: o markanın kimliği, hafızası ve
// içerikleriyle çalışır (sunucudaki asistan servisi ve sohbet geçmişi aynen kullanılır). Sayfa açıkken kullanılmaya devam eder.
import { api } from './api.js';
import { esc, icon, toast, errorNotice, busy as busyBtn } from './ui.js';
import { state, refreshBrands, route, parseRoute } from './app.js';
import { messageHtml, renderMessages } from './views/home.js';

const CHIPS = [
  'Haftaya 5 Reels fikri üret',
  'Son fikre göre carousel tasarla',
  'Satış odaklı 3 fikir üret',
  'Yaklaşan özel günler için fikir öner',
  'Son fikirlerden hangisiyle başlamalıyım?'
];
const OPEN_KEY = 'ium.assistant.open';
let host = null;
let brand = null;
let loadedFor = null;
let sending = false;

function isOpen() { return host && !host.querySelector('.ai-panel').hidden; }
function setOpen(open, remember = true) {
  if (!host) return;
  host.querySelector('.ai-panel').hidden = !open;
  host.querySelector('.ai-fab').setAttribute('aria-expanded', String(open));
  host.classList.toggle('is-open', open);
  if (remember) { try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* tercih kaydedilemezse sorun değil */ } }
  if (open) { load(); setTimeout(() => { const i = host.querySelector('#chat-input'); if (i && !i.disabled) i.focus(); }, 0); }
}

function draw() {
  const aiReady = state.settings.ai.configured;
  host.innerHTML = `
    <section class="ai-panel chat card" aria-label="AI asistanı" hidden>
      <div class="chat-head">
        <div class="ai-badge">✦</div>
        <div class="grow"><h3>AI Asistanı</h3><div class="xsmall muted">${esc(brand.name)} marka hafızasıyla çalışıyor</div></div>
        <button class="btn btn-sm btn-ghost" data-action="new-chat" title="Sohbet geçmişini sil">${icon('refresh')}Yeni sohbet</button>
        <button class="btn btn-sm btn-ghost icon-btn" data-ai-close aria-label="Asistanı kapat">${icon('x')}</button>
      </div>
      <div class="chat-body" id="chat-body"><div class="msg msg-assistant msg-typing">Yükleniyor…</div></div>
      <div class="chat-foot">
        ${aiReady ? `<div class="chips">${CHIPS.map(c => `<button type="button" class="chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>`
          : '<div class="notice"><div><strong>AI bağlı değil.</strong> Asistan için bir yapay zekâ sağlayıcısı bağla.</div><a class="btn btn-sm" href="#/ai/modeller">Sağlayıcı bağla</a></div>'}
        <form class="composer" id="composer">
          <textarea class="textarea" id="chat-input" rows="1" placeholder="${aiReady ? 'Örn: Bu marka için haftaya 5 fikir üret' : 'Önce AI bağlantısını kur'}" ${aiReady ? '' : 'disabled'} maxlength="4000"></textarea>
          <button class="btn btn-primary" type="submit" ${aiReady ? '' : 'disabled'} aria-label="Gönder">${icon('send')}</button>
        </form>
      </div>
    </section>
    <button class="ai-fab" aria-expanded="false" aria-label="AI Asistanı" title="AI Asistanı">✦<span>Asistan</span></button>`;
  loadedFor = null;
}

async function load() {
  if (!brand || loadedFor === brand.id) return;
  const id = brand.id;
  loadedFor = id;
  try {
    const chat = await api.chat(id);
    if (!brand || brand.id !== id) return;
    renderMessages(host.querySelector('#chat-body'), chat.messages, brand);
  } catch (err) { host.querySelector('#chat-body').innerHTML = `<div class="msg msg-assistant">${errorNotice(err)}</div>`; loadedFor = null; }
}

export async function askAssistant(text) {
  if (!host || !brand) return;
  setOpen(true);
  await load();
  return send(text);
}
export function openAssistant() { setOpen(true); }

async function send(text) {
  const message = String(text || '').trim();
  if (!message || sending || !brand) return;
  const body = host.querySelector('#chat-body');
  const input = host.querySelector('#chat-input');
  const btn = host.querySelector('#composer button');
  const b = brand;
  sending = true; btn.disabled = true; input.value = '';
  if (body.querySelector('.msg-assistant:only-child')) body.innerHTML = '';
  body.insertAdjacentHTML('beforeend', messageHtml({ role: 'user', content: message }, b));
  body.insertAdjacentHTML('beforeend', '<div class="msg msg-assistant msg-typing" id="typing">Düşünüyorum…</div>');
  body.scrollTop = body.scrollHeight;
  try {
    const res = await api.sendChat(b.id, message);
    body.querySelector('#typing').remove();
    body.insertAdjacentHTML('beforeend', messageHtml(res.assistantMessage, b));
    body.scrollTop = body.scrollHeight;
    // Fikir kaydedildiyse marka ana sayfasındaki listeler de güncellensin
    const saved = (res.assistantMessage.actions || []).some(a => a.ok !== false && ['save_ideas', 'update_idea'].includes(a.type));
    if (saved) { await refreshBrands(); const r = parseRoute(); if (r.layer === 'brand' && r.page === 'home' && r.brandId === b.id) route(); }
  } catch (err) {
    const t = body.querySelector('#typing'); if (t) t.remove();
    if (body.lastElementChild) body.lastElementChild.remove(); // gönderilemeyen mesaj geri alınır, metin kutuya döner
    input.value = message;
    body.insertAdjacentHTML('beforeend', `<div class="msg msg-assistant">${errorNotice(err)}</div>`);
    if (err.code === 'AI_NOT_CONFIGURED') toast('AI bağlı değil: Yapay zekâ sayfasından bir sağlayıcı bağla.', 'error');
  } finally {
    sending = false; btn.disabled = false; input.focus();
  }
}

// Marka sayfasına girince (ya da marka değişince) asistan o markaya bağlanır; marka dışında gizlenir
export function mountAssistant(current, { page } = {}) {
  if (!current) { if (host) host.hidden = true; brand = null; return; }
  if (!host) {
    host = document.createElement('div');
    host.className = 'ai-widget';
    document.body.appendChild(host);
    host.addEventListener('click', async e => {
      if (e.target.closest('.ai-fab')) return setOpen(!isOpen());
      if (e.target.closest('[data-ai-close]')) return setOpen(false);
      const chip = e.target.closest('[data-chip]');
      if (chip) return send(chip.dataset.chip);
      const nc = e.target.closest('[data-action="new-chat"]');
      if (nc) {
        if (!confirm('Bu markanın sohbet geçmişi silinsin mi? Kaydedilen fikirler silinmez.')) return;
        try { await busyBtn(nc, () => api.clearChat(brand.id)); loadedFor = null; load(); } catch (err) { toast(err.message, 'error'); }
      }
    });
    host.addEventListener('submit', e => { if (e.target.id === 'composer') { e.preventDefault(); send(host.querySelector('#chat-input').value); } });
    host.addEventListener('keydown', e => {
      if (e.target.id === 'chat-input' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e.target.value); }
      if (e.key === 'Escape' && isOpen()) setOpen(false);
    });
    host.addEventListener('input', e => { if (e.target.id === 'chat-input') { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'; } });
  }
  host.hidden = false;
  const changed = !brand || brand.id !== current.id;
  brand = current;
  if (changed) draw();
  // Açık/kapalı tercihi hatırlanır; hiç seçilmediyse marka ana sayfasında açık başlar
  let pref = null;
  try { pref = localStorage.getItem(OPEN_KEY); } catch { /* yok */ }
  // Telefonda kendiliğinden açılmaz (ekranı kaplamasın)
  const auto = pref === null && page === 'home' && !(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
  if (changed) setOpen(pref === '1' || auto, false);
  else if (auto && !isOpen()) setOpen(true, false);
}
