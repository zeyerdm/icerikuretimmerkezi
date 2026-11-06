// İçerik takvimi: aylık ve haftalık görünüm. Yönetim merkezinde bütün markalar (marka filtresiyle),
// marka çalışma alanında yalnızca o marka. Boş güne tıklayınca o gün için içerik planlanır.
import { api } from '../api.js';
import { esc, icon, toast, startOfDay, startOfWeek, addDays, sameDay, timeStr, TR_MONTHS, TR_DAYS_SHORT, fmtDate } from '../ui.js';
import { state } from '../app.js';
import { contentModal } from './forms.js';

const PREF = 'ium.calendar.mode';

export async function renderCalendar(view, { brand } = {}) {
  let mode = 'ay';
  try { mode = localStorage.getItem(PREF) === 'hafta' ? 'hafta' : 'ay'; } catch { /* tercih okunamazsa aylık */ }
  let cursor = startOfDay(new Date());
  let brandFilter = brand ? brand.id : '';
  let items = [];
  let unscheduled = [];

  function range() {
    if (mode === 'hafta') { const from = startOfWeek(cursor); return { from, to: addDays(from, 7) }; }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const from = startOfWeek(first);
    return { from, to: addDays(from, 42) };
  }

  async function load() {
    const { from, to } = range();
    const [inRange, noDate] = await Promise.all([
      api.contents({ from: from.toISOString(), to: to.toISOString(), brandId: brandFilter }),
      api.contents({ unscheduled: '1', brandId: brandFilter })
    ]);
    items = inRange.contents;
    unscheduled = noDate.contents;
  }

  const title = () => {
    if (mode === 'ay') return `${TR_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    const from = startOfWeek(cursor);
    const to = addDays(from, 6);
    return `${from.getDate()} ${from.getMonth() !== to.getMonth() ? TR_MONTHS[from.getMonth()] + ' ' : ''}– ${to.getDate()} ${TR_MONTHS[to.getMonth()]} ${to.getFullYear()}`;
  };

  const chip = c => `<button class="cal-item status-${esc(c.status)}" data-item="${esc(c.id)}" style="--item-color:${esc(c.brandColor || '#7d6bf0')}" title="${esc(`${timeStr(c.scheduledAt)} · ${c.title} · ${c.brandName} · ${c.typeLabel} · ${c.statusLabel}`)}">
      <span class="ci-time">${timeStr(c.scheduledAt)}</span><span class="ci-title">${esc(c.title)}</span></button>`;

  function monthGrid() {
    const { from } = range();
    const today = new Date();
    const cells = Array.from({ length: 42 }, (_, i) => addDays(from, i));
    return `<div class="cal-month" role="grid" aria-label="${esc(title())}">
      ${TR_DAYS_SHORT.map(d => `<div class="cal-dow" role="columnheader">${d}</div>`).join('')}
      ${cells.map(day => {
        const list = items.filter(c => sameDay(c.scheduledAt, day)).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
        const out = day.getMonth() !== cursor.getMonth();
        return `<div class="cal-cell ${out ? 'out' : ''} ${sameDay(day, today) ? 'today' : ''}" role="gridcell" data-day="${day.getTime()}" aria-label="${esc(fmtDate(day, { day: 'numeric', month: 'long' }))}: ${list.length} içerik">
          <div class="cal-num">${day.getDate()}</div>
          ${list.slice(0, 3).map(chip).join('')}
          ${list.length > 3 ? `<button class="cal-more" data-more="${day.getTime()}">+${list.length - 3} daha</button>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  function weekGrid() {
    const from = startOfWeek(cursor);
    const today = new Date();
    return `<div class="cal-week">${Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((day, i) => {
      const list = items.filter(c => sameDay(c.scheduledAt, day)).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
      return `<div class="cw-col ${sameDay(day, today) ? 'today' : ''}" data-day="${day.getTime()}">
        <div class="cw-head"><span>${TR_DAYS_SHORT[i]}</span><b>${day.getDate()}</b></div>
        <div class="cw-body">${list.map(c => `<button class="cw-item status-${esc(c.status)}" data-item="${esc(c.id)}" style="--item-color:${esc(c.brandColor || '#7d6bf0')}">
            <span class="ci-time">${timeStr(c.scheduledAt)}</span><b>${esc(c.title)}</b>
            <span class="cw-meta">${brand ? '' : esc(c.brandName) + ' · '}${esc(c.typeLabel)}</span><span class="st">${esc(c.statusLabel)}</span></button>`).join('')}
          <button class="cw-add" data-add="${day.getTime()}" aria-label="${esc(fmtDate(day))} için içerik planla">${icon('plus')}</button></div>
      </div>`;
    }).join('')}</div>`;
  }

  async function draw() {
    await load();
    const statuses = state.meta.contentStatuses;
    view.innerHTML = `
      <div class="page-head">
        <div><h1>${brand ? 'Takvim' : 'İçerik Takvimi'}</h1><p class="muted">${brand ? esc(brand.name) + ' markasının planlanan ve yayınlanan içerikleri.' : 'Bütün markaların planlanan gönderileri. Boş bir güne tıklayarak içerik planla.'}</p></div>
        <button class="btn btn-primary" data-new>${icon('plus')}İçerik planla</button>
      </div>
      <div class="card cal-card">
        <div class="cal-toolbar">
          <div class="row">
            <button class="btn btn-sm icon-btn" data-nav="-1" aria-label="Önceki">${icon('chevronLeft')}</button>
            <button class="btn btn-sm" data-today>Bugün</button>
            <button class="btn btn-sm icon-btn" data-nav="1" aria-label="Sonraki">${icon('chevronRight')}</button>
            <h2 class="cal-title">${esc(title())}</h2>
          </div>
          <div class="row">
            ${brand ? '' : `<select class="select" id="cal-brand" aria-label="Marka filtresi" style="width:auto"><option value="">Bütün markalar</option>${state.brands.map(b => `<option value="${esc(b.id)}" ${b.id === brandFilter ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`}
            <div class="seg" role="tablist" aria-label="Görünüm">
              <button role="tab" data-mode="ay" class="${mode === 'ay' ? 'active' : ''}" aria-selected="${mode === 'ay'}">Aylık</button>
              <button role="tab" data-mode="hafta" class="${mode === 'hafta' ? 'active' : ''}" aria-selected="${mode === 'hafta'}">Haftalık</button>
            </div>
          </div>
        </div>
        ${mode === 'ay' ? monthGrid() : weekGrid()}
        <div class="cal-legend">${Object.entries(statuses).map(([k, v]) => `<span class="lg status-${k}"><i></i>${esc(v)}</span>`).join('')}
          ${brand ? '' : '<span class="small muted">Renkli çizgi: içeriğin markası</span>'}</div>
      </div>
      ${unscheduled.length ? `<section class="card" style="margin-top:20px"><div class="card-head"><h3>Tarihsiz içerikler</h3><span class="small muted">${unscheduled.length}</span></div>
        <div class="unsched">${unscheduled.map(c => `<button class="ag-item status-${esc(c.status)}" data-item="${esc(c.id)}" style="--item-color:${esc(c.brandColor || '#7d6bf0')}"><span class="ag-title">${esc(c.title)}</span><span class="ag-meta">${esc(c.brandName)} · ${esc(c.typeLabel)} · <span class="st">${esc(c.statusLabel)}</span></span></button>`).join('')}</div></section>` : ''}`;

    const sel = view.querySelector('#cal-brand');
    if (sel) sel.addEventListener('change', () => { brandFilter = sel.value; draw().catch(err => toast(err.message, 'error')); });
  }

  const plan = day => {
    const d = new Date(Number(day));
    d.setHours(12, 0, 0, 0);
    try {
      contentModal({ date: d, brandId: brand ? brand.id : (brandFilter || null), lockBrand: Boolean(brand), onSaved: () => draw() });
    } catch (err) { toast(err.message, 'error'); }
  };

  view.onclick = async e => {
    const t = e.target;
    const item = t.closest('[data-item]');
    if (item) {
      const c = items.concat(unscheduled).find(x => x.id === item.dataset.item);
      return contentModal({ content: c, lockBrand: Boolean(brand), onSaved: () => draw() });
    }
    if (t.closest('[data-new]')) return plan(addDays(startOfDay(new Date()), 1).getTime());
    const nav = t.closest('[data-nav]');
    if (nav) {
      const step = Number(nav.dataset.nav);
      cursor = mode === 'ay' ? new Date(cursor.getFullYear(), cursor.getMonth() + step, 1) : addDays(cursor, 7 * step);
      return draw();
    }
    if (t.closest('[data-today]')) { cursor = startOfDay(new Date()); return draw(); }
    const m = t.closest('[data-mode]');
    if (m) {
      mode = m.dataset.mode;
      try { localStorage.setItem(PREF, mode); } catch { /* tercih kaydedilemezse sorun değil */ }
      return draw();
    }
    const more = t.closest('[data-more]');
    if (more) { cursor = startOfDay(new Date(Number(more.dataset.more))); mode = 'hafta'; return draw(); }
    const add = t.closest('[data-add]');
    if (add) return plan(add.dataset.add);
    const cell = t.closest('.cal-cell');
    if (cell && !t.closest('button')) return plan(cell.dataset.day);
  };

  await draw();
}
