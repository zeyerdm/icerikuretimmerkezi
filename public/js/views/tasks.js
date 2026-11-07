// Görevler (yönetim merkezi): hızlı ekleme, son tarih ve önceliğe göre gruplama, marka filtresi, tamamlananlar
import { api } from '../api.js';
import { esc, icon, toast, fmtDate, dateKey, addDays, startOfWeek, pageHead, emptyState, busy } from '../ui.js';
import { state } from '../app.js';
import { taskModal } from './forms.js';

export async function renderTasks(view) {
  let brandFilter = '';
  let showDone = false;
  let tasks = [];

  const groupOf = t => {
    if (!t.dueDate) return 'tarihsiz';
    const today = dateKey(new Date());
    const weekEnd = dateKey(addDays(startOfWeek(new Date()), 6));
    if (t.dueDate < today) return 'gecikmis';
    if (t.dueDate === today) return 'bugun';
    if (t.dueDate <= weekEnd) return 'hafta';
    return 'sonra';
  };
  const GROUPS = [['gecikmis', 'Gecikmiş'], ['bugun', 'Bugün'], ['hafta', 'Bu hafta'], ['sonra', 'Daha sonra'], ['tarihsiz', 'Tarihsiz']];

  const row = t => `
    <li class="task-row ${t.done ? 'done' : ''}">
      <button class="check-btn ${t.done ? 'on' : ''}" data-toggle="${esc(t.id)}" aria-pressed="${t.done}" aria-label="${t.done ? 'Tamamlanmadı olarak işaretle' : 'Tamamlandı olarak işaretle'}: ${esc(t.title)}"></button>
      <div class="tr-main">
        <div class="tr-title">${esc(t.title)}</div>
        ${t.description ? `<div class="small muted">${esc(t.description)}</div>` : ''}
        <div class="task-meta">
          ${t.dueDate ? `<span class="due ${groupOf(t) === 'gecikmis' && !t.done ? 'late' : groupOf(t) === 'bugun' ? 'today' : ''}">${icon('calendar')}${esc(fmtDate(t.dueDate + 'T12:00', { day: 'numeric', month: 'short' }))}</span>` : ''}
          <span class="prio prio-${esc(t.priority)}">${esc(t.priorityLabel)}</span>
          ${t.brandName ? `<span class="brand-dot"><i style="background:${esc(t.brandColor || '#999')}"></i>${esc(t.brandName)}</span>` : ''}
        </div>
      </div>
      <select class="select tr-status" data-status="${esc(t.id)}" aria-label="Durum">${Object.entries(state.meta.taskStatuses).map(([k, v]) => `<option value="${k}" ${k === t.status ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
      <button class="btn btn-ghost icon-btn" data-edit="${esc(t.id)}" aria-label="Düzenle">${icon('edit')}</button>
    </li>`;

  async function draw() {
    tasks = (await api.tasks({ brandId: brandFilter })).tasks;
    const open = tasks.filter(t => !t.done);
    const done = tasks.filter(t => t.done);
    view.innerHTML = `
      ${pageHead({
        title: 'Görevler',
        desc: `${open.length} açık görev${done.length ? ` · ${done.length} tamamlandı` : ''}. Hızlı ekle, son tarihe göre takip et.`,
        actions: `<select class="select w-auto" id="task-brand" aria-label="Marka filtresi"><option value="">Bütün markalar</option>${state.brands.map(b => `<option value="${esc(b.id)}" ${b.id === brandFilter ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
          <button class="btn btn-primary" data-new>${icon('plus')}Yeni görev</button>`
      })}
      <form class="card quick-row" id="quick-task">
        <input class="input" name="title" placeholder="Görev ekle… (Enter)" maxlength="200" aria-label="Görev">
        <input class="input" type="date" name="dueDate" aria-label="Son tarih">
        <select class="select" name="priority" aria-label="Öncelik">${Object.entries(state.meta.taskPriorities).map(([k, v]) => `<option value="${k}" ${k === 'orta' ? 'selected' : ''}>${esc(v)} öncelik</option>`).join('')}</select>
        <select class="select" name="brandId" aria-label="İlgili marka"><option value="">Markasız</option>${state.brands.map(b => `<option value="${esc(b.id)}" ${b.id === brandFilter ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
        <button class="btn" type="submit">${icon('plus')}Ekle</button>
      </form>
      ${open.length ? GROUPS.map(([key, label]) => {
        const list = open.filter(t => groupOf(t) === key);
        return list.length ? `<section class="task-group"><h3 class="tg-title ${key}">${label} <span>${list.length}</span></h3><ul class="task-list card">${list.map(row).join('')}</ul></section>` : '';
      }).join('') : emptyState({ icon: 'check', title: brandFilter ? 'Bu markada açık görev yok' : 'Açık görev yok', text: 'Yukarıdaki satırdan hızlıca görev ekleyebilirsin.', card: true })}
      ${done.length ? `<section class="task-group"><button class="tg-toggle" data-show-done aria-expanded="${showDone}">${icon(showDone ? 'chevronDown' : 'chevronRight')}Tamamlanan görevler (${done.length})</button>
        ${showDone ? `<ul class="task-list card">${done.map(row).join('')}</ul>` : ''}</section>` : ''}`;

    view.querySelector('#quick-task').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (!String(fd.get('title')).trim()) return;
      try {
        await busy(e.submitter, () => api.createTask({ title: fd.get('title'), dueDate: fd.get('dueDate') || null, priority: fd.get('priority'), brandId: fd.get('brandId') || null }));
        toast('Görev eklendi.', 'success');
        await draw();
        view.querySelector('#quick-task [name=title]').focus();
      } catch (err) { toast(err.message, 'error'); }
    });
    view.querySelector('#task-brand').addEventListener('change', e => { brandFilter = e.target.value; draw(); });
    view.querySelectorAll('[data-status]').forEach(sel => sel.addEventListener('change', async () => {
      try { await api.updateTask(sel.dataset.status, { status: sel.value }); draw(); } catch (err) { toast(err.message, 'error'); }
    }));
  }

  view.onclick = async e => {
    const tog = e.target.closest('[data-toggle]');
    if (tog) {
      const t = tasks.find(x => x.id === tog.dataset.toggle);
      try { await api.updateTask(t.id, { status: t.done ? 'yapilacak' : 'tamamlandi' }); draw(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) return taskModal({ task: tasks.find(x => x.id === ed.dataset.edit), onSaved: draw });
    if (e.target.closest('[data-new]')) return taskModal({ brandId: brandFilter, onSaved: draw });
    if (e.target.closest('[data-show-done]')) { showDone = !showDone; draw(); }
  };

  await draw();
}
