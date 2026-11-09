// Yönetim Merkezi: uygulama açılınca ilk görülen, markalardan bağımsız genel çalışma alanı.
// Sabit uygulama renkleriyle çizilir; bütün sayılar ve grafikler gerçek kayıtlardan hesaplanır.
import { api } from '../api.js';
import { esc, icon, toast, timeAgo, fmtDate, timeStr, columnChart, ring, sameDay, addDays, startOfDay, emptyState, busy } from '../ui.js';
import { state, refreshBrands, go, openDemoBrand } from '../app.js';
import * as S from '../stats.js';
import { contentModal, taskModal, noteModal } from './forms.js';

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

  const today = new Date().toISOString().slice(0, 10);
  const lateTasks = openTasks.filter(t => t.dueDate && t.dueDate < today);
  const todayTasks = openTasks.filter(t => t.dueDate === today);
  const restTasks = openTasks.filter(t => !t.dueDate || t.dueDate > today);
  const lateContents = d.contents.filter(c => !c.done && c.scheduledAt && new Date(c.scheduledAt) < new Date()).length;
  const notesP = api.notes({}).catch(() => ({ notes: [] }));

  view.innerHTML = `
    <div class="center ops">
      <section class="card welcome">
        <div class="w-orb"></div><span class="w-deco d1">✦</span><span class="w-deco d2">★</span><span class="w-deco d3">✿</span>
        ${d.brands.length ? `<div class="w-side" aria-label="Bu haftanın özeti">
          <div class="w-side-top"><span class="w-side-title">Bu hafta</span><span class="kpi k1" title="Yönetilen marka"><span class="kpi-num">${k.brands}</span> aktif marka</span></div>
          <div class="w-side-body">${ring(perf.completionRate, 52)}
            <div class="w-side-stats"><div><b>${week.created}</b><span>üretim</span></div><div><b>${week.completed}</b><span>tamamlanan</span></div><div><b>${week.scheduledPending}</b><span>yayın bekliyor</span></div></div></div>
          ${d.activity[0] ? `<div class="w-side-last" title="${esc(d.activity[0].summary)}">${icon('refresh')}<span>${esc(d.activity[0].summary)}</span><em>${timeAgo(d.activity[0].createdAt)}</em></div>` : ''}
        </div>` : ''}
        <div class="w-text">
          <div class="w-slogan"><img src="/img/logo.svg" alt="">KREATİFHANE · Fikirden üretime, her şey tek merkezde</div>
          <div class="w-date">${esc(fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
          ${d.brands.length ? `
            <h1>${hello}! Bugün neler üretiyoruz?</h1>
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

      <div class="ops-three">
        <section class="card ops-col tone-violet">
          <div class="card-head"><h3><span class="h-ic">${icon('tasks')}</span>Bugünün işleri <span class="count">${openTasks.length}</span></h3><a class="small link" href="#/gorevler">Tüm görevler ›</a></div>
          <form id="quick-task" class="input-plus"><input class="input" name="title" placeholder="Hızlı görev ekle…" maxlength="200" aria-label="Hızlı görev"><button type="submit" aria-label="Görev ekle">${icon('plus')}</button></form>
          <div class="ops-scroll">${openTasks.length ? `<ul class="task-mini">${[...lateTasks, ...todayTasks, ...restTasks].map(taskRow).join('')}</ul>`
            : emptyCta('check', 'Bugün için görev yok', 'Yapılacakları buraya ekle; gecikenler kırmızıyla öne çıkar.', 'İlk görevini ekle', 'focus-task')}</div>
        </section>
        <section class="card ops-col tone-mint">
          <div class="card-head"><h3><span class="h-ic">${icon('calendar')}</span>Yaklaşan içerikler <span class="count">${soon.length}</span></h3><a class="small link" href="#/masa">Takvim ›</a></div>
          <div class="ops-scroll">${soon.length ? agenda(soon) : emptyCta('calendar', 'Önümüzdeki 7 gün boş', 'Yayın akışını doldurmak için bir içerik planla.', 'Hemen planla', 'plan')}</div>
        </section>
        <section class="card ops-col tone-peach" id="upcoming-days"><div class="card-head"><h3><span class="h-ic">${icon('star')}</span>Yaklaşan özel günler</h3><a class="small link" href="#/masa">Takvim ›</a></div><div class="ops-scroll"><div class="skeleton" style="height:120px"></div></div></section>
      </div>
      <div class="ops-two">
        <section class="card tone-sky">
          <div class="card-head"><h3><span class="h-ic">${icon('chart')}</span>Haftalık performans</h3><a class="small link" href="#/analizler">Tüm analizler ›</a></div>
          ${week.created || week.completed ? columnChart(week.days.map(x => ({ label: x.label, values: [x.created, x.completed] })),
            [{ name: 'Üretilen', color: 'var(--c-violet)' }, { name: 'Tamamlanan', color: 'var(--st-pub)' }], { height: 120 })
            : emptyCta('chart', 'Bu hafta henüz üretim yok', 'Fikir ekledikçe ve içerikleri tamamladıkça grafik dolar.', 'İçerik planla', 'plan')}
        </section>
        <section class="card tone-lemon" id="recent-notes"><div class="card-head"><h3><span class="h-ic">${icon('notes')}</span>Son notlar</h3><a class="small link" href="#/notlar">Tüm notlar ›</a></div><div class="skeleton" style="height:60px"></div></section>
      </div>
    </div>`;

  // Son notlar: sabitlenenler önce, en fazla 2
  notesP.then(({ notes }) => {
    const box = view.querySelector('#recent-notes');
    if (!box) return;
    const list = (notes || []).slice(0, 2);
    box.querySelector('.skeleton').outerHTML = list.length ? `<div class="note-mini">${list.map(n => `
      <button class="note-chip" data-note-any="${esc(n.id)}"><b>${esc(n.title || n.body.split('\n')[0].slice(0, 60))}</b><span>${esc(n.body.slice(0, 120))}${n.body.length > 120 ? '…' : ''}</span>${n.brandName ? `<em><i style="background:${esc(n.brandColor || '#999')}"></i>${esc(n.brandName)}</em>` : ''}</button>`).join('')}</div>`
      : emptyCta('notes', 'Henüz not yok', 'Fikirlerini ve toplantı notlarını burada tut.', 'Not al', 'note');
    box._notes = notes || [];
  });

  // Önümüzdeki 30 gün: özel günler; her birinde "Planla" o güne başlıklı içerik penceresi açar
  (async () => {
    const box = view.querySelector('#upcoming-days');
    if (!box) return;
    const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    const now = new Date();
    try {
      const { days } = await api.specialDays(iso(now), iso(new Date(now.getTime() + 45 * 86400000)));
      const list = days.filter(x => x.date >= iso(now) || !x.end).slice(0, 5);
      box._days = list;
      box.querySelector('.skeleton').outerHTML = list.length
        ? `<ul class="sd-list">${list.map((x, i) => { const dt = new Date(`${x.date}T12:00:00`); const left = Math.round((dt - new Date(iso(now) + 'T12:00:00')) / 86400000); return `<li class="sd-item cat-${esc(x.category)}" title="${esc(x.tip)}"><span class="sd-date"><b>${dt.getDate()}</b>${esc(fmtDate(dt, { month: 'short' }))}</span><span class="sd-name"><b>${esc(x.name)}</b><em>${left <= 0 ? 'bugün' : `${left} gün sonra`} · ${esc(x.categoryLabel)}</em></span>${d.brands.length ? `<button class="btn btn-sm" data-sd="${i}">Planla</button>` : ''}</li>`; }).join('')}</ul>`
        : '<p class="card-text">Önümüzdeki 45 günde özel gün yok.</p>';
    } catch { box.remove(); }
  })();

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

  // Oluştur menüsü dışarı tıklayınca / Esc ile kapanır
  const closeCreate = ev => { const pop = view.querySelector('.create-pop'); if (!pop || pop.hidden) return; if (ev.type === 'keydown' ? ev.key === 'Escape' : !ev.target.closest('.create-menu')) { pop.hidden = true; view.querySelector('[data-create]').setAttribute('aria-expanded', 'false'); } };
  document.addEventListener('click', closeCreate, true);
  document.addEventListener('keydown', closeCreate);
  window.addEventListener('hashchange', () => { document.removeEventListener('click', closeCreate, true); document.removeEventListener('keydown', closeCreate); }, { once: true });

  view.onclick = async e => {
    const act = e.target.closest('[data-act]');
    if (act && view.querySelector('.create-pop')) view.querySelector('.create-pop').hidden = true;
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
    const note = e.target.closest('[data-note-any]');
    if (note) { const box = view.querySelector('#recent-notes'); return noteModal({ note: (box._notes || []).find(n => n.id === note.dataset.noteAny), onSaved: refresh }); }
    const cb = e.target.closest('[data-create]');
    if (cb) { const pop = view.querySelector('.create-pop'); pop.hidden = !pop.hidden; cb.setAttribute('aria-expanded', String(!pop.hidden)); return; }
    if (act && act.dataset.act === 'focus-task') return view.querySelector('#quick-task input').focus();
    const sd = e.target.closest('[data-sd]');
    if (sd) {
      const x = view.querySelector('#upcoming-days')._days[Number(sd.dataset.sd)];
      try { return contentModal({ date: new Date(`${x.date}T12:00:00`), title: `${x.name}: `, onSaved: refresh }); } catch (err) { return toast(err.message, 'error'); }
    }
    const open = e.target.closest('[data-open]');
    if (open) go('#/m/' + open.dataset.open);
  };
  view.onkeydown = e => {
    const card = e.target.closest && e.target.closest('[data-open]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go('#/m/' + card.dataset.open); }
  };
}

function kpi(cls, value, label, iconName, tone) {
  return `<div class="kpi ${cls} ${tone}"><span class="kpi-icon">${icon(iconName)}</span><span class="kpi-num">${value}</span><span class="kpi-label">${esc(label)}</span></div>`;
}

// Boş durum: küçük ikon, ne yapılacağını söyleyen kısa metin ve gerçek bir eylem düğmesi
function emptyCta(ic, title, text, cta, act) {
  return `<div class="empty-cta"><span class="ec-icon">${icon(ic)}</span><div><b>${esc(title)}</b><p>${esc(text)}</p></div><button class="btn btn-sm btn-primary" data-act="${act}">${icon('plus')}${esc(cta)}</button></div>`;
}

function taskRow(t) {
  const today = new Date().toISOString().slice(0, 10);
  const due = t.dueDate ? (t.dueDate < today ? `<span class="due late">Gecikti · ${esc(fmtDate(t.dueDate + 'T12:00', { day: 'numeric', month: 'short' }))}</span>` : t.dueDate === today ? '<span class="due today">Bugün</span>' : `<span class="due">${esc(fmtDate(t.dueDate + 'T12:00', { day: 'numeric', month: 'short' }))}</span>`) : '';
  return `<li class="${t.dueDate && t.dueDate < today ? 'is-late' : t.dueDate === today ? 'is-today' : ''}"><button class="check-btn" data-task-done="${esc(t.id)}" aria-label="Tamamlandı olarak işaretle: ${esc(t.title)}"></button>
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
