// Ortak pencereler: içerik planlama, görev ve not. Takvim, yönetim merkezi, fikir havuzu ve arşiv aynı pencereleri kullanır.
import { api } from '../api.js';
import { esc, openModal, dateKey, timeStr } from '../ui.js';
import { state } from '../app.js';

const options = (map, selected) => Object.entries(map).map(([k, v]) => `<option value="${esc(k)}" ${k === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
const brandOptions = (selected, { allowNone } = {}) =>
  (allowNone ? `<option value="">Markasız</option>` : '') +
  state.brands.map(b => `<option value="${esc(b.id)}" ${b.id === selected ? 'selected' : ''}>${esc(b.name)}</option>`).join('');

// İçerik planla / düzenle. lockBrand: marka çalışma alanından açıldıysa marka değiştirilemez.
export function contentModal({ content, date, brandId, lockBrand, title, ideaId, onSaved }) {
  if (!state.brands.length) throw new Error('Önce bir marka oluştur; içerikler bir markaya ait olur.');
  const c = content || {};
  const when = c.scheduledAt ? new Date(c.scheduledAt) : (date ? new Date(date) : null);
  const selectedBrand = c.brandId || brandId || (state.brands[0] && state.brands[0].id);
  const m = state.meta;
  openModal({
    title: content ? 'İçeriği düzenle' : 'İçerik planla',
    submitLabel: content ? 'Kaydet' : 'Planla',
    body: `
      <div class="form-grid">
        <div class="field full"><label for="c-title">Başlık *</label><input class="input" id="c-title" name="title" required maxlength="200" value="${esc(c.title || title || '')}" placeholder="Ör. Vize haftası kampanya postu"></div>
        <div class="field"><label for="c-brand">Marka</label><select class="select" id="c-brand" name="brandId" ${lockBrand ? 'disabled' : ''}>${brandOptions(selectedBrand)}</select></div>
        <div class="field"><label for="c-type">İçerik türü</label><select class="select" id="c-type" name="type">${options(m.contentTypes, c.type || 'post')}</select></div>
        <div class="field"><label for="c-date">Yayın tarihi</label><input class="input" type="date" id="c-date" name="date" value="${when ? dateKey(when) : ''}"></div>
        <div class="field"><label for="c-time">Saat</label><input class="input" type="time" id="c-time" name="time" value="${when ? timeStr(when) : '12:00'}"></div>
        <div class="field full"><label for="c-status">Durum</label><select class="select" id="c-status" name="status">${options(m.contentStatuses, c.status || 'taslak')}</select></div>
        <div class="field full"><label for="c-notes">Not</label><textarea class="textarea" id="c-notes" name="notes" maxlength="2000" placeholder="Görsel fikri, metin taslağı, hatırlatma…">${esc(c.notes || '')}</textarea></div>
      </div>`,
    danger: content ? { label: 'Sil', confirm: 'Bu içerik silinsin mi?', onClick: async () => { await api.deleteContent(content.id); onSaved && onSaved(); } } : null,
    onSubmit: async fd => {
      const d = fd.get('date');
      // Tarih yerel saatle girilir, sunucuya ISO (UTC) olarak gider
      const scheduledAt = d ? new Date(`${d}T${fd.get('time') || '12:00'}`).toISOString() : null;
      const body = { title: fd.get('title'), type: fd.get('type'), status: fd.get('status'), notes: fd.get('notes'), scheduledAt };
      if (!lockBrand) body.brandId = fd.get('brandId'); else if (!content) body.brandId = selectedBrand;
      if (content) await api.updateContent(content.id, body);
      else await api.createContent(Object.assign(body, ideaId ? { ideaId } : {}));
      onSaved && onSaved();
    }
  });
}

export function taskModal({ task, brandId, lockBrand, onSaved }) {
  const t = task || {};
  const m = state.meta;
  openModal({
    title: task ? 'Görevi düzenle' : 'Yeni görev',
    body: `
      <div class="form-grid">
        <div class="field full"><label for="t-title">Görev *</label><input class="input" id="t-title" name="title" required maxlength="200" value="${esc(t.title || '')}" placeholder="Ör. Kampanya görsellerini hazırla"></div>
        <div class="field full"><label for="t-desc">Açıklama</label><textarea class="textarea" id="t-desc" name="description" maxlength="2000">${esc(t.description || '')}</textarea></div>
        <div class="field"><label for="t-due">Son tarih</label><input class="input" type="date" id="t-due" name="dueDate" value="${esc(t.dueDate || '')}"></div>
        <div class="field"><label for="t-pri">Öncelik</label><select class="select" id="t-pri" name="priority">${options(m.taskPriorities, t.priority || 'orta')}</select></div>
        <div class="field"><label for="t-brand">İlgili marka</label><select class="select" id="t-brand" name="brandId" ${lockBrand ? 'disabled' : ''}>${brandOptions(t.brandId || brandId || '', { allowNone: true })}</select></div>
        <div class="field"><label for="t-status">Durum</label><select class="select" id="t-status" name="status">${options(m.taskStatuses, t.status || 'yapilacak')}</select></div>
      </div>`,
    danger: task ? { label: 'Sil', confirm: 'Bu görev silinsin mi?', onClick: async () => { await api.deleteTask(task.id); onSaved && onSaved(); } } : null,
    onSubmit: async fd => {
      const body = { title: fd.get('title'), description: fd.get('description'), dueDate: fd.get('dueDate') || null, priority: fd.get('priority'), status: fd.get('status') };
      body.brandId = lockBrand ? (t.brandId || brandId) : (fd.get('brandId') || null);
      if (task) await api.updateTask(task.id, body); else await api.createTask(body);
      onSaved && onSaved();
    }
  });
}

export function noteModal({ note, brandId, categories = [], onSaved }) {
  const n = note || {};
  openModal({
    title: note ? 'Notu düzenle' : 'Yeni not',
    body: `
      <div class="form-grid">
        <div class="field full"><label for="n-title">Başlık</label><input class="input" id="n-title" name="title" maxlength="120" value="${esc(n.title || '')}"></div>
        <div class="field full"><label for="n-body">Not *</label><textarea class="textarea" id="n-body" name="body" required maxlength="5000" style="min-height:140px">${esc(n.body || '')}</textarea></div>
        <div class="field"><label for="n-cat">Kategori</label><input class="input" id="n-cat" name="category" maxlength="40" list="note-cats" value="${esc(n.category || '')}" placeholder="Ör. Fikir, Toplantı"><datalist id="note-cats">${categories.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="field"><label for="n-brand">İlgili marka</label><select class="select" id="n-brand" name="brandId">${brandOptions(n.brandId || brandId || '', { allowNone: true })}</select></div>
        <label class="check full"><input type="checkbox" name="pinned" ${n.pinned ? 'checked' : ''}> Sabitle (en üstte görünsün)</label>
      </div>`,
    danger: note ? { label: 'Sil', confirm: 'Bu not silinsin mi?', onClick: async () => { await api.deleteNote(note.id); onSaved && onSaved(); } } : null,
    onSubmit: async fd => {
      const body = { title: fd.get('title'), body: fd.get('body'), category: fd.get('category'), brandId: fd.get('brandId') || null, pinned: fd.get('pinned') === 'on' };
      if (note) await api.updateNote(note.id, body); else await api.createNote(body);
      onSaved && onSaved();
    }
  });
}
