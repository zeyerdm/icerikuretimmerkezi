// Yönetim Merkezi: uygulama açılınca ilk görülen, markalardan bağımsız genel çalışma alanı.
// Sabit uygulama renkleriyle çizilir; bütün sayılar ve grafikler gerçek kayıtlardan hesaplanır.
import { api } from '../api.js';
import { esc, icon, toast, timeAgo, fmtDate, timeStr, columnChart, ring, sameDay, addDays, startOfDay, emptyState, busy } from '../ui.js';
import { state, refreshBrands, go, openDemoBrand } from '../app.js';
import * as S from '../stats.js';
import { contentModal, taskModal, noteModal } from './forms.js';
import { brandCard } from './brands.js';

export async function renderCenter(view) {
  view.innerHTML = '<div class="center" aria-busy="true"><div class="skeleton" style="height:200px"></div><div class="kpis">' + '<div class="skeleton" style="height:150px"></div>'.repeat(5) + '</div><div class="grid-2"><div class="skeleton" style="height:320px"></div><div class="skeleton" style="height:320px"></div></div></div>';
  const d = await api.dashboard();
  const k = S.counts(d);
  const week = S.thisWeek(d);
  const perf = S.performance(d);
  const soon = S.upcoming(d, 7);
  const openTasks = d.tasks.filter(t => !t.done);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
  const summary = [
    week.scheduledPending ? `bu hafta <b>${week.scheduledPending}</b> içerik yayın bekliyor` : null,
    k.overdueTasks ? `<b>${k.overdueTasks}</b> görevin süresi geçti` : (k.openTasks ? `<b>${k.openTasks}</b> açık görevin var` : null),
    perf.overdue ? `<b>${perf.overdue}</b> içerik tarihi geçtiği halde tamamlanmadı` : null
  ].filter(Boolean);

  view.innerHTML = `
    <div class="center">
      <section class="card welcome">
        <div class="w-orb"></div>
        ${d.brands.length ? `<div class="w-side" aria-label="Bu haftanın özeti">
          <div class="w-side-title">Bu hafta</div>
          <div class="w-side-stats"><div><b>${week.created}</b><span>üretim</span></div><div><b>${week.completed}</b><span>tamamlanan</span></div><div><b>${week.scheduledPending}</b><span>yayın bekliyor</span></div></div>
          ${d.activity[0] ? `<div class="w-side-last" title="${esc(d.activity[0].summary)}">${icon('refresh')}<span>${esc(d.activity[0].summary)}</span><em>${timeAgo(d.activity[0].createdAt)}</em></div>` : ''}
        </div>` : ''}
        <div class="w-text">
          <div class="w-slogan"><img src="/img/logo.svg" alt="">KREATİFHANE · Fikirden üretime, her şey tek merkezde</div>
          <div class="w-date">${esc(fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
          ${d.brands.length ? `
            <h1>${hello}! Bugün neler üretiyoruz?</h1>
            <p>${summary.length ? 'Özet: ' + summary.join(', ') + '.' : 'Her şey yolunda görünüyor. Yeni bir içerik planlayarak başlayabilirsin.'}</p>
            <div class="w-actions">
              <button class="btn btn-primary" data-act="plan">${icon('calendar')}İçerik planla</button>
              <button class="btn" data-act="task">${icon('tasks')}Görev ekle</button>
              <button class="btn" data-act="note">${icon('notes')}Not al</button>
              <a class="btn" href="#/marka/yeni">${icon('plus')}Yeni marka</a>
            </div>` : `
            <h1>İlk markanı oluştur</h1>
            <p>Burası senin yönetim merkezin: bütün markalarının takvimi, görevleri, notları ve üretim istatistikleri burada toplanır. Başlamak için bir marka oluştur.</p>
            <form id="onboard-form" class="w-onboard">
              <input class="input" name="name" placeholder="Marka adı" required maxlength="80" aria-label="Marka adı">
              <input class="input" name="sector" placeholder="Sektör (ör. kafe, yazılım)" maxlength="120" aria-label="Sektör">
              <button class="btn btn-primary" type="submit">Oluştur</button>
            </form>
            <div class="w-actions"><span class="small muted">Önce nasıl çalıştığını görmek mi istersin?</span><button class="btn btn-ghost" type="button" id="demo-btn">☕ Örnek markayla keşfet</button></div>`}
        </div>
      </section>

      <div class="kpis">
        ${kpi('k1', k.brands, 'Aktif marka', `${k.ideas} fikir havuzda`, 'brands')}
        ${kpi('k2', k.thisMonth, 'Bu ay üretilen', `toplam ${k.contents} içerik`, 'archive')}
        ${kpi('k3', k.published, 'Yayınlanan', 'durumu "Yayınlandı"', 'check')}
        ${kpi('k4', k.ready, 'Yayına hazır', 'tamamlandı, yayın bekliyor', 'palette')}
        ${kpi('k5', k.planned, 'Planlanan', 'ileri tarihli, bitmemiş', 'calendar')}
      </div>

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h3>Haftalık performans</h3><a class="small link" href="#/analizler">Tüm analizler ›</a></div>
          <div class="week-summary">
            ${ring(perf.completionRate)}
            <div class="ws-stats">
              <div><b>${week.created}</b><span>üretim (içerik ve fikir)</span></div>
              <div><b>${week.completed}</b><span>tamamlanan içerik</span></div>
              <div><b>${week.scheduled}</b><span>bu haftaya planlı</span></div>
            </div>
          </div>
          <p class="small muted chart-note">Halka: bütün içeriklerin tamamlanma oranı.</p>
          ${columnChart(week.days.map(x => ({ label: x.label, values: [x.created, x.completed] })),
            [{ name: 'Üretilen', color: 'var(--c-violet)' }, { name: 'Tamamlanan', color: 'var(--c-teal)' }],
            { height: 150, empty: 'Bu hafta henüz üretim yok. İlk içeriği planlayınca grafik dolmaya başlar.' })}
        </section>

        <section class="card">
          <div class="card-head"><h3>Yaklaşan içerikler</h3><a class="small link" href="#/takvim">Takvimi aç ›</a></div>
          ${agenda(soon)}
        </section>
      </div>

      <div class="grid-3">
        <section class="card mini-cal-card" id="mini-cal"></section>
        <section class="card">
          <div class="card-head"><h3>Görevler</h3><a class="small link" href="#/masa">Çalışma masası ›</a></div>
          <form id="quick-task" class="quick-add"><input class="input" name="title" placeholder="Hızlı görev ekle…" maxlength="200" aria-label="Hızlı görev"><button class="btn icon-btn" type="submit" aria-label="Görev ekle">${icon('plus')}</button></form>
          ${openTasks.length ? `<ul class="task-mini">${openTasks.slice(0, 6).map(taskRow).join('')}</ul>` : emptyState({ icon: 'check', title: 'Açık görev yok', text: 'Yukarıdan hızlıca ekleyebilirsin.', compact: true })}
        </section>
        <section class="card">
          <div class="card-head"><h3>Sabit notlar</h3><a class="small link" href="#/masa">Çalışma masası ›</a></div>
          ${d.pinnedNotes.length ? `<div class="note-mini">${d.pinnedNotes.map(n => `
            <button class="note-chip" data-note="${esc(n.id)}"><b>${esc(n.title || n.body.slice(0, 40))}</b><span>${esc(n.body.slice(0, 110))}${n.body.length > 110 ? '…' : ''}</span>${n.brandName ? `<em><i style="background:${esc(n.brandColor || '#999')}"></i>${esc(n.brandName)}</em>` : ''}</button>`).join('')}</div>`
            : emptyState({ icon: 'pin', title: 'Sabit not yok', text: 'Önemli notlarını sabitleyince burada görünür.', compact: true })}
          <div class="card-foot"><button class="btn btn-sm" data-act="note">${icon('plus')}Not al</button></div>
        </section>
      </div>

      <section class="card" id="upcoming-days"><div class="card-head"><h3>Yaklaşan özel günler</h3><a class="small link" href="#/takvim">Takvim ›</a></div><div class="skeleton" style="height:60px"></div></section>

      <section>
        <div class="section-head"><h2>Markalar</h2><div class="row">${d.brands.some(b => b.isDemo) || !d.brands.length ? '' : '<button class="btn btn-sm btn-ghost" data-act="demo">☕ Örnek marka ekle</button>'}<a class="btn btn-sm" href="#/markalar">Tümü</a></div></div>
        <div class="brand-grid">${d.brands.map(brandCard).join('')}<a class="card brand-new" href="#/marka/yeni"><div class="empty-icon">${icon('plus')}</div>Yeni marka oluştur</a></div>
      </section>
    </div>`;

  // Önümüzdeki 30 gün: özel günler ve başlayan dönemler (takvimden planlanır)
  (async () => {
    const box = view.querySelector('#upcoming-days');
    if (!box) return;
    const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    const now = new Date();
    try {
      const { days } = await api.specialDays(iso(now), iso(new Date(now.getTime() + 30 * 86400000)));
      const list = days.filter(x => x.date >= iso(now) || !x.end).slice(0, 8);
      box.querySelector('.skeleton').outerHTML = list.length
        ? `<div class="upcoming">${list.map(x => { const dt = new Date(`${x.date}T12:00:00`); const left = Math.round((dt - new Date(iso(now) + 'T12:00:00')) / 86400000); return `<a class="upcoming-day cat-${esc(x.category)}" href="#/takvim" title="${esc(x.tip)}"><b>${dt.getDate()}</b><span>${esc(fmtDate(dt, { month: 'short' }))}</span><div><div class="strong small">${esc(x.name)}</div><div class="xsmall muted">${left <= 0 ? 'bugün' : `${left} gün sonra`} · ${esc(x.categoryLabel)}</div></div></a>`; }).join('')}</div>`
        : '<p class="card-text">Önümüzdeki 30 günde özel gün yok.</p>';
    } catch { box.remove(); }
  })();

  miniCalendar(view.querySelector('#mini-cal'), d.contents);
  const refresh = () => renderCenter(view);
  const onboard = view.querySelector('#onboard-form');
  if (onboard) onboard.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(onboard);
    if (!String(fd.get('name')).trim()) { onboard.name.focus(); return toast('Marka adını yaz.', 'error'); }
    try {
      const { brand } = await busy(e.submitter || onboard.querySelector('[type=submit]'), () => api.createBrand({ name: fd.get('name'), sector: fd.get('sector') }));
      await refreshBrands();
      toast('Marka oluşturuldu. Şimdi kimliğini tamamlayalım.', 'success');
      go('#/m/' + brand.id + '/kimlik');
    } catch (err) { toast(err.message, 'error'); }
  });
  const demoBtn = view.querySelector('#demo-btn');
  if (demoBtn) demoBtn.addEventListener('click', () => busy(demoBtn, openDemoBrand).catch(err => toast(err.message, 'error')));
  view.querySelector('#quick-task').addEventListener('submit', async e => {
    e.preventDefault();
    const input = e.target.title;
    if (!input.value.trim()) return;
    try { await api.createTask({ title: input.value }); toast('Görev eklendi.', 'success'); refresh(); } catch (err) { toast(err.message, 'error'); }
  });

  view.onclick = async e => {
    const act = e.target.closest('[data-act]');
    try {
      if (act && act.dataset.act === 'plan') return contentModal({ date: addDays(startOfDay(new Date()), 1).setHours(12), onSaved: refresh });
      if (act && act.dataset.act === 'task') return taskModal({ onSaved: refresh });
      if (act && act.dataset.act === 'note') return noteModal({ onSaved: refresh });
      if (act && act.dataset.act === 'demo') return await busy(act, openDemoBrand);
    } catch (err) { return toast(err.message, 'error'); }
    const item = e.target.closest('[data-content]');
    if (item) {
      // Özet listede not alanı yok; düzenleme için içeriğin tamamı alınır
      const { contents } = await api.contents({});
      return contentModal({ content: contents.find(c => c.id === item.dataset.content), onSaved: refresh });
    }
    const done = e.target.closest('[data-task-done]');
    if (done) {
      try { await api.updateTask(done.dataset.taskDone, { status: 'tamamlandi' }); toast('Görev tamamlandı.', 'success'); refresh(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const taskEdit = e.target.closest('[data-task]');
    if (taskEdit) return taskModal({ task: d.tasks.find(t => t.id === taskEdit.dataset.task), onSaved: refresh });
    const note = e.target.closest('[data-note]');
    if (note) return noteModal({ note: d.pinnedNotes.find(n => n.id === note.dataset.note), onSaved: refresh });
    const open = e.target.closest('[data-open]');
    if (open) go('#/m/' + open.dataset.open);
  };
  view.onkeydown = e => {
    const card = e.target.closest && e.target.closest('[data-open]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go('#/m/' + card.dataset.open); }
  };
}

function kpi(cls, value, label, sub, iconName) {
  return `<div class="kpi ${cls}"><div class="kpi-icon">${icon(iconName)}</div><div class="kpi-num">${value}</div><div class="kpi-label">${esc(label)}</div><div class="kpi-sub">${esc(sub)}</div></div>`;
}

function taskRow(t) {
  const today = new Date().toISOString().slice(0, 10);
  const due = t.dueDate ? (t.dueDate < today ? `<span class="due late">Gecikti · ${esc(fmtDate(t.dueDate + 'T12:00', { day: 'numeric', month: 'short' }))}</span>` : t.dueDate === today ? '<span class="due today">Bugün</span>' : `<span class="due">${esc(fmtDate(t.dueDate + 'T12:00', { day: 'numeric', month: 'short' }))}</span>`) : '';
  return `<li><button class="check-btn" data-task-done="${esc(t.id)}" aria-label="Tamamlandı olarak işaretle: ${esc(t.title)}"></button>
    <button class="task-title" data-task="${esc(t.id)}"><span>${esc(t.title)}</span><span class="task-meta">${due}<span class="prio prio-${esc(t.priority)}">${esc(t.priorityLabel)}</span>${t.brandName ? `<span class="brand-dot"><i style="background:${esc(t.brandColor || '#999')}"></i>${esc(t.brandName)}</span>` : ''}</span></button></li>`;
}

function agenda(items) {
  if (!items.length) return emptyState({ icon: 'calendar', title: 'Önümüzdeki 7 gün boş', text: 'Takvimden ya da "İçerik planla" ile yeni içerik ekleyebilirsin.', compact: true });
  const groups = [];
  items.forEach(c => {
    const day = new Date(c.scheduledAt);
    let g = groups.find(x => sameDay(x.day, day));
    if (!g) groups.push(g = { day, items: [] });
    g.items.push(c);
  });
  const label = day => sameDay(day, new Date()) ? 'Bugün' : sameDay(day, addDays(new Date(), 1)) ? 'Yarın' : fmtDate(day, { weekday: 'long', day: 'numeric', month: 'short' });
  return `<div class="agenda">${groups.map(g => `
    <div class="ag-day"><div class="ag-label">${esc(label(g.day))}</div>
      ${g.items.map(c => `<button class="ag-item status-${esc(c.status)}" data-content="${esc(c.id)}" style="--item-color:${esc(c.brandColor || '#7d6bf0')}">
        <span class="ag-time">${timeStr(c.scheduledAt)}</span><span class="ag-title">${esc(c.title)}</span>
        <span class="ag-meta"><span class="brand-dot"><i style="background:${esc(c.brandColor || '#7d6bf0')}"></i>${esc(c.brandName)}</span><span class="tag">${esc(c.typeLabel)}</span><span class="status-badge status-${esc(c.status)}">${esc(c.statusLabel)}</span></span></button>`).join('')}
    </div>`).join('')}</div>`;
}

// Mini takvim: ayın günleri, içerik olan günlerde marka renginde noktalar; güne tıklayınca Çalışma masasındaki büyük takvim açılır
function miniCalendar(el, contents) {
  if (!el) return;
  let cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const draw = () => {
    const from = startOfWeekLocal(cursor);
    const today = new Date();
    const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
    const monthName = fmtDate(cursor, { month: 'long', year: 'numeric' });
    el.innerHTML = `<div class="card-head"><h3>Takvim</h3><a class="small link" href="#/masa">Çalışma masası ›</a></div>
      <div class="mc-bar"><button class="btn btn-sm btn-ghost icon-btn" data-mc="-1" aria-label="Önceki ay">${icon('chevronLeft')}</button><b>${esc(monthName)}</b><button class="btn btn-sm btn-ghost icon-btn" data-mc="1" aria-label="Sonraki ay">${icon('chevronRight')}</button></div>
      <div class="mc-grid">${['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map(x => `<span class="mc-dow">${x}</span>`).join('')}
        ${days.map(day => {
          const list = contents.filter(c => c.scheduledAt && sameDay(c.scheduledAt, day));
          const colors = [...new Set(list.map(c => c.brandColor || '#7d6bf0'))].slice(0, 3);
          return `<a class="mc-day ${day.getMonth() !== cursor.getMonth() ? 'out' : ''} ${sameDay(day, today) ? 'today' : ''} ${list.length ? 'has' : ''}" href="#/masa" title="${esc(fmtDate(day, { day: 'numeric', month: 'long' }))}${list.length ? ` · ${list.length} içerik: ${esc(list.map(c => c.title).slice(0, 3).join(', '))}` : ''}"><span>${day.getDate()}</span><i>${colors.map(c => `<b style="background:${esc(c)}"></b>`).join('')}</i></a>`;
        }).join('')}</div>`;
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-mc]');
    if (!b) return;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + Number(b.dataset.mc), 1);
    draw();
  });
  draw();
}

function startOfWeekLocal(d) {
  const x = startOfDay(d);
  return addDays(x, -((x.getDay() + 6) % 7));
}
