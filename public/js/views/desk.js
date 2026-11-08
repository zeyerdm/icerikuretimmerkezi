// Çalışma masası: ortada büyük içerik takvimi, solda görevler, sağda notlar (kompakt widget kartlar).
// Takvim, İçerik Takvimi sayfasının kendisidir (aylık/haftalık, özel günler, marka filtresi, planlama).
// Görev ve not kartları mevcut API ve pencereleri kullanır; tam sayfa listeler "Tümü" bağlantısıyla açılır.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, fmtDate, dateKey, addDays, startOfWeek, timeAgo, busy } from '../ui.js';
import { renderCalendar } from './calendar.js';
import { taskModal, noteModal } from './forms.js';

export async function renderDesk(view) {
  view.innerHTML = `
    ${pageHead({ title: 'Çalışma masası', desc: 'Takvimin, yapılacakların ve notların tek ekranda. Bir güne tıklayarak içerik planla.' })}
    <div class="desk">
      <aside class="widget desk-tasks" id="desk-tasks" aria-label="Görevler"></aside>
      <section class="desk-cal" id="desk-cal"></section>
      <aside class="widget desk-notes" id="desk-notes" aria-label="Notlar"></aside>
    </div>`;
  await Promise.all([
    renderCalendar(view.querySelector('#desk-cal'), { embedded: true }),
    taskWidget(view.querySelector('#desk-tasks')),
    noteWidget(view.querySelector('#desk-notes'))
  ]);
}

const head = (ic, title, count, href, extra = '') => `<div class="w-head"><span class="w-icon">${icon(ic)}</span><h2>${esc(title)}</h2>${count != null ? `<span class="w-count">${count}</span>` : ''}<span class="spacer"></span>${extra}<a class="small link" href="${href}">Tümü ›</a></div>`;

// --- Görevler: hızlı ekleme, tarihe göre gruplar, tek tıkla tamamla, ilerleme çubuğu
async function taskWidget(el) {
  let tasks = [];
  const today = dateKey(new Date());
  const weekEnd = dateKey(addDays(startOfWeek(new Date()), 6));
  const groupOf = t => !t.dueDate ? 'tarihsiz' : t.dueDate < today ? 'gecikmis' : t.dueDate === today ? 'bugun' : t.dueDate <= weekEnd ? 'hafta' : 'sonra';
  const GROUPS = [['gecikmis', 'Gecikmiş'], ['bugun', 'Bugün'], ['hafta', 'Bu hafta'], ['sonra', 'Daha sonra'], ['tarihsiz', 'Tarihsiz']];
  const row = t => `<li class="wt-row ${groupOf(t) === 'gecikmis' ? 'late' : ''}">
      <button class="check-btn" data-done="${esc(t.id)}" aria-label="Tamamlandı olarak işaretle: ${esc(t.title)}"></button>
      <button class="wt-main" data-edit="${esc(t.id)}"><span class="wt-title">${esc(t.title)}</span>
        <span class="wt-meta">${t.dueDate ? `<span>${icon('calendar')}${esc(fmtDate(t.dueDate + 'T12:00', { day: 'numeric', month: 'short' }))}</span>` : ''}<span class="prio prio-${esc(t.priority)}">${esc(t.priorityLabel)}</span>${t.brandName ? `<span class="brand-dot"><i style="background:${esc(t.brandColor || '#999')}"></i>${esc(t.brandName)}</span>` : ''}</span></button></li>`;

  async function draw() {
    tasks = (await api.tasks({})).tasks;
    const open = tasks.filter(t => !t.done);
    const done = tasks.length - open.length;
    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    el.innerHTML = `${head('tasks', 'Görevler', open.length, '#/gorevler', `<button class="btn btn-sm btn-ghost icon-btn" data-new aria-label="Ayrıntılı görev ekle" title="Ayrıntılı görev ekle">${icon('plus')}</button>`)}
      <div class="w-progress" title="${done} / ${tasks.length} tamamlandı"><span style="width:${pct}%"></span></div><div class="xsmall muted mb-2">${done} / ${tasks.length} tamamlandı</div>
      <form class="w-quick" id="wt-quick"><input class="input" name="title" placeholder="Görev ekle… (Enter)" maxlength="200" aria-label="Hızlı görev"><button class="btn icon-btn" type="submit" aria-label="Görev ekle">${icon('plus')}</button></form>
      <div class="w-scroll">${open.length ? GROUPS.map(([k, label]) => { const list = open.filter(t => groupOf(t) === k); return list.length ? `<div class="w-group ${k}">${label} <span>${list.length}</span></div><ul class="wt-list">${list.map(row).join('')}</ul>` : ''; }).join('')
        : '<div class="w-empty">' + icon('check') + '<span>Açık görev yok. Yukarıdan hızlıca ekleyebilirsin.</span></div>'}</div>`;
    el.querySelector('#wt-quick').addEventListener('submit', async e => {
      e.preventDefault();
      const v = e.target.title.value.trim();
      if (!v) return;
      try { await busy(e.submitter, () => api.createTask({ title: v })); await draw(); el.querySelector('#wt-quick [name=title]').focus(); } catch (err) { toast(err.message, 'error'); }
    });
  }
  el.onclick = async e => {
    const d = e.target.closest('[data-done]');
    if (d) { try { await api.updateTask(d.dataset.done, { status: 'tamamlandi' }); toast('Görev tamamlandı.', 'success'); draw(); } catch (err) { toast(err.message, 'error'); } return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) return taskModal({ task: tasks.find(t => t.id === ed.dataset.edit), onSaved: draw });
    if (e.target.closest('[data-new]')) return taskModal({ onSaved: draw });
  };
  await draw();
}

// --- Notlar: hızlı not, arama, sabitlenenler üstte, tıklayınca düzenle
async function noteWidget(el) {
  let notes = [];
  let categories = [];
  let q = '';
  const card = n => `<article class="wn-card ${n.pinned ? 'pinned' : ''}">
      <button class="wn-main" data-edit="${esc(n.id)}"><b>${esc(n.title || n.body.split('\n')[0].slice(0, 60))}</b><span>${esc(n.body.slice(0, 140))}${n.body.length > 140 ? '…' : ''}</span>
        <em>${n.brandName ? `<i style="background:${esc(n.brandColor || '#999')}"></i>${esc(n.brandName)} · ` : ''}${timeAgo(n.updatedAt)}</em></button>
      <button class="btn btn-ghost icon-btn btn-sm pin-btn ${n.pinned ? 'on' : ''}" data-pin="${esc(n.id)}" aria-pressed="${n.pinned}" aria-label="${n.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}">${icon('pin')}</button></article>`;

  async function load() { const r = await api.notes({ q }); notes = r.notes; categories = r.categories; }
  function list() {
    const box = el.querySelector('#wn-list');
    box.innerHTML = notes.length ? notes.slice(0, 30).map(card).join('') : `<div class="w-empty">${icon('notes')}<span>${q ? 'Aramaya uyan not yok.' : 'Henüz not yok. Yukarıya yazıp kaydet.'}</span></div>`;
  }
  async function draw() {
    await load();
    el.innerHTML = `${head('notes', 'Notlar', notes.length, '#/notlar')}
      <form class="w-note" id="wn-quick"><textarea class="textarea" name="body" rows="2" placeholder="Hızlı not al…" maxlength="5000" aria-label="Hızlı not"></textarea>
        <div class="row"><label class="check small"><input type="checkbox" name="pinned"> Sabitle</label><span class="spacer"></span><button class="btn btn-sm btn-primary" type="submit">Not ekle</button></div></form>
      <input class="input w-search" id="wn-q" type="search" placeholder="Notlarda ara" aria-label="Notlarda ara" value="${esc(q)}">
      <div class="w-scroll" id="wn-list"></div>`;
    list();
    el.querySelector('#wn-quick').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (!String(fd.get('body')).trim()) return e.target.body.focus();
      try { await busy(e.submitter, () => api.createNote({ body: fd.get('body'), pinned: fd.get('pinned') === 'on' })); toast('Not kaydedildi.', 'success'); draw(); } catch (err) { toast(err.message, 'error'); }
    });
    let timer;
    el.querySelector('#wn-q').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(async () => { q = e.target.value.trim(); await load(); list(); }, 250); });
  }
  el.onclick = async e => {
    const pin = e.target.closest('[data-pin]');
    if (pin) { const n = notes.find(x => x.id === pin.dataset.pin); try { await api.updateNote(n.id, { pinned: !n.pinned }); await load(); list(); } catch (err) { toast(err.message, 'error'); } return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) noteModal({ note: notes.find(n => n.id === ed.dataset.edit), categories, onSaved: draw });
  };
  await draw();
}
