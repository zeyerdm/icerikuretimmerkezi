// U.3: Çalışma masası. Üstte önümüzdeki 7 günün yayın şeridi, altta yan yana görevler ve notlar.
// Görev ve not bölümleri kendi sayfalarıyla aynı bileşenlerdir (aynı işlevler); aylık görünüm Takvim sayfasında kalır.
import { api } from '../api.js';
import { esc, icon, pageHead, fmtDate, timeStr, addDays, startOfDay, sameDay } from '../ui.js';
import { renderTasks } from './tasks.js';
import { renderNotes } from './notes.js';
import { contentModal } from './forms.js';

export async function renderDesk(view) {
  const today = startOfDay(new Date());
  const end = addDays(today, 7);
  const iso = d => d.toISOString();
  const { contents } = await api.contents({ from: iso(today), to: iso(end) });
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  view.innerHTML = `
    ${pageHead({ title: 'Çalışma masası', desc: 'Bu haftanın yayınları, yapılacakların ve notların tek ekranda.', actions: `<a class="btn" href="#/takvim">${icon('calendar')}Takvimi aç</a>` })}
    <section class="card week-strip" aria-label="Önümüzdeki 7 gün">
      ${days.map(d => {
        const list = contents.filter(c => c.scheduledAt && sameDay(new Date(c.scheduledAt), d)).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
        return `<div class="ws-day ${sameDay(d, today) ? 'is-today' : ''}"><div class="ws-date"><b>${d.getDate()}</b><span>${esc(sameDay(d, today) ? 'Bugün' : fmtDate(d, { weekday: 'short' }))}</span></div>
          ${list.length ? list.map(c => `<button class="ws-item status-${esc(c.status)}" data-content="${esc(c.id)}" style="--item-color:${esc(c.brandColor || '#7d6bf0')}" title="${esc(c.brandName)} · ${esc(c.typeLabel)} · ${esc(c.statusLabel)}"><span class="ws-time">${timeStr(c.scheduledAt)}</span><span class="ws-title">${esc(c.title)}</span></button>`).join('') : '<span class="ws-empty">—</span>'}
        </div>`;
      }).join('')}
    </section>
    <div class="desk-cols">
      <section class="desk-col" id="desk-tasks"></section>
      <section class="desk-col" id="desk-notes"></section>
    </div>`;
  view.querySelector('.week-strip').addEventListener('click', e => {
    const b = e.target.closest('[data-content]');
    if (b) contentModal({ content: contents.find(c => c.id === b.dataset.content), onSaved: () => renderDesk(view) });
  });
  await Promise.all([renderTasks(view.querySelector('#desk-tasks'), { embedded: true }), renderNotes(view.querySelector('#desk-notes'), { embedded: true })]);
}
