// İçerik takvimi: aylık ve haftalık görünüm. Yönetim merkezinde bütün markalar (marka filtresiyle),
// marka çalışma alanında yalnızca o marka. Boş güne tıklayınca o gün için içerik planlanır.
import { api } from '../api.js';
import { esc, icon, toast, startOfDay, startOfWeek, addDays, sameDay, timeStr, TR_MONTHS, TR_DAYS_SHORT, fmtDate, pageHead, openModal, busy } from '../ui.js';
import { state } from '../app.js';
import { contentModal } from './forms.js';

const PREF = 'ium.calendar.mode';
const SPECIAL_PREF = 'ium.calendar.special';
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function renderCalendar(view, { brand, embedded = false, initialMode = null } = {}) {
  // Çalışma masasında varsayılan haftalık (ayrı tercih); tam sayfada aylık
  const prefKey = embedded ? 'ium.desk.calendar.mode' : PREF;
  let mode = embedded ? 'hafta' : 'ay';
  try { const v = localStorage.getItem(prefKey); if (v === 'hafta' || v === 'ay') mode = v; } catch { /* tercih okunamazsa varsayılan */ }
  if (initialMode) mode = initialMode;
  let cursor = startOfDay(new Date());
  let brandFilter = brand ? brand.id : '';
  let items = [];
  let unscheduled = [];
  let specials = [];
  let showSpecial = true;
  try { showSpecial = localStorage.getItem(SPECIAL_PREF) !== '0'; } catch { /* varsayılan: göster */ }

  function range() {
    if (mode === 'hafta') { const from = startOfWeek(cursor); return { from, to: addDays(from, 7) }; }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const from = startOfWeek(first);
    return { from, to: addDays(from, 42) };
  }

  async function load() {
    const { from, to } = range();
    const [inRange, noDate, sd] = await Promise.all([
      api.contents({ from: from.toISOString(), to: to.toISOString(), brandId: brandFilter }),
      api.contents({ unscheduled: '1', brandId: brandFilter }),
      showSpecial ? api.specialDays(iso(from), iso(addDays(to, -1))).catch(() => ({ days: [] })) : { days: [] }
    ]);
    items = inRange.contents;
    unscheduled = noDate.contents;
    specials = sd.days;
  }

  const title = () => {
    if (mode === 'ay') return `${TR_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    const from = startOfWeek(cursor);
    const to = addDays(from, 6);
    return `${from.getDate()} ${from.getMonth() !== to.getMonth() ? TR_MONTHS[from.getMonth()] + ' ' : ''}– ${to.getDate()} ${TR_MONTHS[to.getMonth()]} ${to.getFullYear()}`;
  };

  const chip = c => `<button class="cal-item status-${esc(c.status)}" data-item="${esc(c.id)}" draggable="true" style="--item-color:${esc(c.brandColor || '#7d6bf0')}" title="${esc(`${timeStr(c.scheduledAt)} · ${c.title} · ${c.brandName} · ${c.typeLabel} · ${c.statusLabel}`)}">
      <span class="ci-time">${timeStr(c.scheduledAt)}</span><span class="ci-title">${esc(c.title)}</span></button>`;

  // Tek günlük özel günler hücrede; dönemler yalnızca başladıkları gün (görünümde başlamıyorsa ilk gün)
  const daySpecials = day => {
    const k = iso(day);
    const { from } = range();
    return specials.filter(s => (!s.end && s.date === k) || (s.end && (s.date === k || (s.date < iso(from) && k === iso(from)))));
  };
  const spChip = s => `<button class="cal-special cat-${esc(s.category)}" data-special="${esc(s.date + '|' + s.name)}" title="${esc(`${s.name} · ${s.categoryLabel}${s.end ? ` · ${s.date} – ${s.end}` : ''}`)}">${s.end ? '◷' : '★'} ${esc(s.name)}</button>`;

  function monthGrid() {
    const { from } = range();
    const today = new Date();
    const cells = Array.from({ length: 42 }, (_, i) => addDays(from, i));
    return `<div class="cal-month" role="grid" aria-label="${esc(title())}">
      ${TR_DAYS_SHORT.map(d => `<div class="cal-dow" role="columnheader">${d}</div>`).join('')}
      ${cells.map(day => {
        const list = items.filter(c => sameDay(c.scheduledAt, day)).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
        const out = day.getMonth() !== cursor.getMonth();
        return `<div class="cal-cell ${out ? 'out' : ''} ${sameDay(day, today) ? 'today' : ''}" role="gridcell" tabindex="0" data-day="${day.getTime()}" aria-label="${esc(fmtDate(day, { day: 'numeric', month: 'long' }))}: ${list.length} içerik. İçerik planlamak için Enter">
          <div class="cal-num">${day.getDate()}</div>
          ${daySpecials(day).map(spChip).join('')}
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
        <div class="cw-body">${daySpecials(day).map(spChip).join('')}${list.map(c => `<button class="cw-item status-${esc(c.status)}" data-item="${esc(c.id)}" draggable="true" style="--item-color:${esc(c.brandColor || '#7d6bf0')}">
            <span class="ci-time">${timeStr(c.scheduledAt)}</span><b>${esc(c.title)}</b>
            <span class="cw-meta">${brand ? '' : esc(c.brandName) + ' · '}${esc(c.typeLabel)}</span><span class="st">${esc(c.statusLabel)}</span></button>`).join('')}
          <button class="cw-add" data-add="${day.getTime()}" aria-label="${esc(fmtDate(day))} için içerik planla">${icon('plus')}</button></div>
      </div>`;
    }).join('')}</div>`;
  }

  const unschedHtml = () => (unscheduled.length ? `<section class="cal-unsched mt-3"><div class="card-head"><h3>Tarihsiz içerikler</h3><span class="small muted">${unscheduled.length}</span></div>
        <div class="unsched">${unscheduled.map(c => `<button class="ag-item status-${esc(c.status)}" data-item="${esc(c.id)}" style="--item-color:${esc(c.brandColor || '#7d6bf0')}"><span class="ag-title">${esc(c.title)}</span><span class="ag-meta">${esc(c.brandName)} · ${esc(c.typeLabel)} · <span class="st">${esc(c.statusLabel)}</span></span></button>`).join('')}</div></section>` : '');

  async function draw() {
    await load();
    const statuses = state.meta.contentStatuses;
    view.innerHTML = `
      ${embedded ? '' : pageHead({
        title: brand ? 'Takvim' : 'İçerik Takvimi',
        desc: brand ? esc(brand.name) + ' markasının planlanan ve yayınlanan içerikleri. Bir güne tıklayarak içerik planla.' : 'Bütün markaların planlanan gönderileri. Boş bir güne tıklayarak içerik planla.',
        actions: `<button class="btn btn-primary" data-new>${icon('plus')}İçerik planla</button>`
      })}
      <div class="card cal-card${embedded ? ' desk-cal-card' : ''}">
        <div class="cal-toolbar">
          <div class="row">
            <button class="btn icon-btn" data-nav="-1" aria-label="Önceki">${icon('chevronLeft')}</button>
            <button class="btn" data-today>Bugün</button>
            <button class="btn icon-btn" data-nav="1" aria-label="Sonraki">${icon('chevronRight')}</button>
            <h2 class="cal-title">${esc(title())}</h2>
          </div>
          <div class="row">
            ${embedded ? `<button class="btn btn-primary" data-new>${icon('plus')}İçerik planla</button>` : ''}
            ${brand ? '' : `<select class="select w-auto" id="cal-brand" aria-label="Marka filtresi"><option value="">Bütün markalar</option>${state.brands.map(b => `<option value="${esc(b.id)}" ${b.id === brandFilter ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`}
            <label class="check"><input type="checkbox" id="cal-special" ${showSpecial ? 'checked' : ''}> Özel günler</label>
            <div class="seg" role="tablist" aria-label="Görünüm">
              <button role="tab" data-mode="ay" class="${mode === 'ay' ? 'active' : ''}" aria-selected="${mode === 'ay'}">Aylık</button>
              <button role="tab" data-mode="hafta" class="${mode === 'hafta' ? 'active' : ''}" aria-selected="${mode === 'hafta'}">Haftalık</button>
            </div>
          </div>
        </div>
        ${embedded ? '<div class="cal-scroll">' : ''}${mode === 'ay' ? monthGrid() : weekGrid()}
        <div class="cal-legend">${Object.entries(statuses).map(([k, v]) => `<span class="lg status-${k}"><i></i>${esc(v)}</span>`).join('')}
          ${brand ? '' : '<span class="small muted">Renkli çizgi: içeriğin markası</span>'}</div>
      ${embedded ? unschedHtml() + '</div>' : ''}</div>
      ${!embedded && unscheduled.length ? `<section class="card mt-5"><div class="card-head"><h3>Tarihsiz içerikler</h3><span class="small muted">${unscheduled.length}</span></div>
        <div class="unsched">${unscheduled.map(c => `<button class="ag-item status-${esc(c.status)}" data-item="${esc(c.id)}" style="--item-color:${esc(c.brandColor || '#7d6bf0')}"><span class="ag-title">${esc(c.title)}</span><span class="ag-meta">${esc(c.brandName)} · ${esc(c.typeLabel)} · <span class="st">${esc(c.statusLabel)}</span></span></button>`).join('')}</div></section>` : ''}`;

    view.querySelector('#cal-special').addEventListener('change', e => {
      showSpecial = e.target.checked;
      try { localStorage.setItem(SPECIAL_PREF, showSpecial ? '1' : '0'); } catch { /* tercih kaydedilemezse sorun değil */ }
      draw().catch(err => toast(err.message, 'error'));
    });
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

  // Özel gün penceresi: bilgi, içerik ipucu, "bu güne içerik planla" ve markanın asistanına fikir ürettirme
  function specialModal(s) {
    const brandId = brand ? brand.id : (brandFilter || (state.brands[0] && state.brands[0].id));
    const day = new Date(`${s.date}T12:00:00`);
    const m = openModal({
      title: s.name, submitLabel: 'Bu güne içerik planla',
      body: `<p><span class="tag">${esc(s.categoryLabel)}</span> ${esc(fmtDate(day, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }))}${s.end ? ` – ${esc(fmtDate(new Date(`${s.end}T12:00:00`), { day: 'numeric', month: 'long' }))}` : ''}</p>
        <p class="card-text mt-2"><b>İçerik ipucu:</b> ${esc(s.tip)}</p>
        ${s.category === 'dini' ? '<p class="xsmall muted mt-2">Dinî bayram tarihleri Diyanet takvimine göredir.</p>' : ''}
        ${brandId && state.brands.length ? `<div class="row mt-4">${brand ? '' : `<select class="select w-auto" id="sp-brand" aria-label="Marka">${state.brands.map(b => `<option value="${esc(b.id)}" ${b.id === brandId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`}
          <button type="button" class="btn" data-sp-ideas>${icon('sparkle')}Bu gün için 3 fikir üret</button></div><div class="xsmall muted mt-1" id="sp-note">Fikirler markanın fikir havuzuna kaydedilir.</div>` : ''}`,
      onSubmit: async () => {
        setTimeout(() => {
          try { contentModal({ date: day, title: `${s.name}: `, brandId: brand ? brand.id : ((m.form.querySelector('#sp-brand') || {}).value || brandId), lockBrand: Boolean(brand), onSaved: () => draw() }); } catch (err) { toast(err.message, 'error'); }
        }, 0);
      }
    });
    const ib = m.form.querySelector('[data-sp-ideas]');
    if (ib) ib.addEventListener('click', async () => {
      const bid = brand ? brand.id : ((m.form.querySelector('#sp-brand') || {}).value || brandId);
      try {
        const res = await busy(ib, () => api.sendChat(bid, `${s.date} tarihindeki "${s.name}" için markaya uygun 3 içerik fikri üret ve fikir havuzuna kaydet. İpucu: ${s.tip}`));
        const saved = (res.assistantMessage.actions || []).find(a => a.type === 'save_ideas' && a.ok !== false);
        m.form.querySelector('#sp-note').textContent = saved ? `${saved.ideas.length} fikir kaydedildi: ${saved.ideas.map(i => i.title).join(' · ')}` : res.assistantMessage.content;
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  view.onclick = async e => {
    const t = e.target;
    const sp = t.closest('[data-special]');
    if (sp) { const s = specials.find(x => `${x.date}|${x.name}` === sp.dataset.special); if (s) specialModal(s); return; }
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
      try { localStorage.setItem(prefKey, mode); } catch { /* tercih kaydedilemezse sorun değil */ }
      return draw();
    }
    const more = t.closest('[data-more]');
    if (more) { cursor = startOfDay(new Date(Number(more.dataset.more))); mode = 'hafta'; return draw(); }
    const add = t.closest('[data-add]');
    if (add) return plan(add.dataset.add);
    const cell = t.closest('.cal-cell');
    if (cell && !t.closest('button')) return plan(cell.dataset.day);
  };

  // S.3: Sürükle-bırak: içeriği başka bir güne taşı (saat aynı kalır)
  let dragId = null;
  const dropZone = t => t && t.closest && t.closest('.cal-cell[data-day], .cw-col[data-day]');
  view.ondragstart = e => {
    const it = e.target.closest && e.target.closest('[data-item][draggable]');
    if (!it) return;
    dragId = it.dataset.item;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragId); } catch { /* bazı tarayıcılar */ }
    it.classList.add('dragging');
  };
  view.ondragend = () => { dragId = null; view.querySelectorAll('.dragging, .drop-over').forEach(x => x.classList.remove('dragging', 'drop-over')); };
  view.ondragover = e => {
    const z = dragId && dropZone(e.target);
    if (!z) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    view.querySelectorAll('.drop-over').forEach(x => x !== z && x.classList.remove('drop-over'));
    z.classList.add('drop-over');
  };
  view.ondragleave = e => { const z = dropZone(e.target); if (z && !z.contains(e.relatedTarget)) z.classList.remove('drop-over'); };
  view.ondrop = async e => {
    const z = dragId && dropZone(e.target);
    if (!z) return;
    e.preventDefault();
    const id = dragId; dragId = null;
    z.classList.remove('drop-over');
    const c = items.find(x => x.id === id);
    if (!c || !c.scheduledAt) return;
    const from = new Date(c.scheduledAt); const day = new Date(Number(z.dataset.day));
    if (sameDay(from, day)) return;
    const to = new Date(day.getFullYear(), day.getMonth(), day.getDate(), from.getHours(), from.getMinutes());
    try {
      await api.updateContent(id, { scheduledAt: to.toISOString() });
      toast(`“${c.title}” ${fmtDate(to, { day: 'numeric', month: 'long' })} tarihine taşındı.`, 'success');
      await draw();
    } catch (err) { toast(err.message, 'error'); }
  };

  // Klavye: gün hücresinde Enter/boşluk içerik planlar
  view.onkeydown = e => {
    const cell = e.target.classList && e.target.classList.contains('cal-cell') ? e.target : null;
    if (cell && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); plan(cell.dataset.day); }
  };

  await draw();
}
