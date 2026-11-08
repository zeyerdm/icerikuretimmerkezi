// Ortak pencereler: içerik planlama, görev ve not. Takvim, yönetim merkezi, fikir havuzu ve arşiv aynı pencereleri kullanır.
import { api } from '../api.js';
import { esc, openModal, dateKey, timeStr, toast } from '../ui.js';
import { aiModels, modelSelect, busyTimer, aiNote } from '../aiPicker.js';

const checkRow = (i, k) => `<li class="check-item"><label class="check"><input type="checkbox" data-ck-done ${i.done ? 'checked' : ''}> <span data-ck-label>${esc(i.label)}</span></label><button type="button" class="btn btn-sm btn-ghost icon-btn" data-ck-del="${k}" aria-label="Adımı sil">×</button></li>`;
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
  const checklist = c.checklist || [];
  const doneCount = checklist.filter(i => i.done).length;
  const modal = openModal({
    title: content ? 'İçeriği düzenle' : 'İçerik planla',
    submitLabel: content ? 'Kaydet' : 'Planla',
    body: `
      ${c.reelsId ? `<div class="notice notice-info mb-4"><div>Bu içerik bir Reels senaryosundan oluşturuldu.</div><a class="btn btn-sm" href="#/m/${esc(c.brandId)}/reels/${esc(c.reelsId)}" data-close>Senaryoyu aç</a></div>` : ''}
      ${c.postId ? `<div class="notice notice-info mb-4"><div>Bu içerik Post stüdyosundaki bir tasarıma bağlı.</div><a class="btn btn-sm" href="#/m/${esc(c.brandId)}/post/${esc(c.postId)}" data-close>Tasarımı aç</a></div>` : ''}
      <div class="form-grid">
        <div class="field full"><label for="c-title">Başlık *</label><input class="input" id="c-title" name="title" required maxlength="200" value="${esc(c.title || title || '')}" placeholder="Ör. Vize haftası kampanya postu"></div>
        <div class="field"><label for="c-brand">Marka</label><select class="select" id="c-brand" name="brandId" ${lockBrand ? 'disabled' : ''}>${brandOptions(selectedBrand)}</select></div>
        <div class="field"><label for="c-type">İçerik türü</label><select class="select" id="c-type" name="type">${options(m.contentTypes, c.type || 'post')}</select></div>
        <div class="field"><label for="c-date">Yayın tarihi</label><input class="input" type="date" id="c-date" name="date" value="${when ? dateKey(when) : ''}"></div>
        <div class="field"><label for="c-time">Saat</label><input class="input" type="time" id="c-time" name="time" value="${when ? timeStr(when) : '12:00'}"></div>
        <div class="field full"><label for="c-status">Durum</label><select class="select" id="c-status" name="status">${options(m.contentStatuses, c.status || 'taslak')}</select></div>
        <div class="field full"><label for="c-notes">Not</label><textarea class="textarea" id="c-notes" name="notes" maxlength="2000" placeholder="Görsel fikri, metin taslağı, hatırlatma…">${esc(c.notes || '')}</textarea></div>
      </div>
      ${content ? `<details class="disclosure mt-4" open>
        <summary>Yayın metni</summary>
        <div class="field"><label for="c-caption">Açıklama <span class="xsmall muted" id="c-cap-count">${(c.caption || '').length}/2200</span></label><textarea class="textarea" id="c-caption" name="caption" rows="6" maxlength="2200" placeholder="Instagram açıklaması">${esc(c.caption || '')}</textarea></div>
        <div class="field mt-3"><label for="c-tags">Hashtag'ler</label><input class="input" id="c-tags" name="hashtags" maxlength="600" value="${esc((c.hashtags || []).join(' '))}" placeholder="#ornek #marka"></div>
        <div class="field mt-3"><label for="c-first">İlk yorum</label><textarea class="textarea" id="c-first" name="firstComment" rows="2" maxlength="2200" placeholder="Paylaşınca markanın ilk yorumu">${esc(c.firstComment || '')}</textarea></div>
        <div class="row mt-3"><button type="button" class="btn btn-sm" data-c-write>AI ile yaz</button><span id="c-model"></span>
          <button type="button" class="btn btn-sm btn-ghost" data-c-copy="caption">Açıklama + hashtag kopyala</button><button type="button" class="btn btn-sm btn-ghost" data-c-copy="first">İlk yorumu kopyala</button></div>
        <div class="xsmall muted mt-1" id="c-write-note"></div>
      </details>
      <details class="disclosure mt-4" ${checklist.length && doneCount < checklist.length ? 'open' : ''}>
        <summary>Yapılacaklar <span class="muted" id="c-ck-count">${doneCount}/${checklist.length}</span></summary>
        <ul class="check-list" id="c-checklist">${checklist.map(checkRow).join('')}</ul>
        <div class="row mt-2"><input class="input input-sm grow" id="c-ck-new" maxlength="60" placeholder="Yeni adım ekle"><button type="button" class="btn btn-sm" data-ck-add>Ekle</button></div>
      </details>
      <details class="disclosure mt-4" ${c.metrics || c.status === 'yayinlandi' ? 'open' : ''}>
        <summary>Paylaşım sonucu${c.rate != null ? ` · etkileşim %${String(c.rate).replace('.', ',')}` : ''}</summary>
        <p class="xsmall muted mb-3">Instagram istatistiklerindeki sayıları gir. Asistan ve üretim ekranları en çok tutan giriş cümlelerinden ve temalardan öğrenir; Analizler'de "Ne işe yaradı" bölümü bunlardan hesaplanır.${c.metrics && c.metrics.at ? ` Son giriş: ${esc(new Date(c.metrics.at).toLocaleDateString('tr-TR'))}.` : ''}</p>
        <div class="form-grid metrics-grid">${Object.entries(m.metricFields).map(([k, label]) => `<div class="field"><label for="cm-${k}">${esc(label)}</label><input class="input" type="number" min="0" step="1" id="cm-${k}" name="m_${k}" value="${c.metrics && c.metrics[k] != null ? c.metrics[k] : ''}"></div>`).join('')}</div>
        <div class="form-grid mt-3">
          <div class="field full"><label for="c-hook">Giriş cümlesi (ilk saniye / ilk satır)</label><input class="input" id="c-hook" name="hook" maxlength="300" value="${esc(c.hook || '')}" placeholder="Ör. Vize sabahı bu kuyruğu gören herkes aynı şeyi düşündü…"></div>
          <div class="field full"><label for="c-theme">Tema</label><input class="input" id="c-theme" name="theme" maxlength="60" value="${esc(c.theme || '')}" placeholder="Ör. sınav haftası, kampanya, kulis"></div>
        </div>
      </details>` : ''}`,
    danger: content ? { label: 'Sil', confirm: 'Bu içerik silinsin mi?', onClick: async () => { await api.deleteContent(content.id); onSaved && onSaved(); } } : null,
    onSubmit: async fd => {
      const d = fd.get('date');
      // Tarih yerel saatle girilir, sunucuya ISO (UTC) olarak gider
      const scheduledAt = d ? new Date(`${d}T${fd.get('time') || '12:00'}`).toISOString() : null;
      const body = { title: fd.get('title'), type: fd.get('type'), status: fd.get('status'), notes: fd.get('notes'), scheduledAt };
      if (!lockBrand) body.brandId = fd.get('brandId'); else if (!content) body.brandId = selectedBrand;
      if (content) {
        const metrics = {};
        Object.keys(m.metricFields).forEach(k => { const v = fd.get('m_' + k); if (v !== null && v !== '') metrics[k] = Number(v); });
        Object.assign(body, { metrics: Object.keys(metrics).length ? metrics : null, hook: fd.get('hook') || '', theme: fd.get('theme') || '',
          caption: fd.get('caption') || '', hashtags: fd.get('hashtags') || '', firstComment: fd.get('firstComment') || '',
          checklist: [...document.querySelectorAll('#c-checklist .check-item')].map(li => ({ label: li.querySelector('[data-ck-label]').textContent, done: li.querySelector('[data-ck-done]').checked })) });
        await api.updateContent(content.id, body);
      }
      else await api.createContent(Object.assign(body, ideaId ? { ideaId } : {}));
      onSaved && onSaved();
    }
  });
  if (content) wireContentCard(modal.form, content);
}

// İçerik kartı: AI ile açıklama/hashtag/ilk yorum yazma, kopyalama, yapılacaklar listesi
async function wireContentCard(form, content) {
  const $ = s => form.querySelector(s);
  const cap = $('#c-caption');
  cap.addEventListener('input', () => { $('#c-cap-count').textContent = `${cap.value.length}/2200`; });
  const count = () => { const items = form.querySelectorAll('#c-checklist .check-item'); $('#c-ck-count').textContent = `${form.querySelectorAll('#c-checklist [data-ck-done]:checked').length}/${items.length}`; };
  form.addEventListener('change', e => { if (e.target.matches('[data-ck-done]')) count(); });
  const add = () => { const v = $('#c-ck-new').value.trim(); if (!v) return; $('#c-checklist').insertAdjacentHTML('beforeend', checkRow({ label: v.slice(0, 60), done: false }, Date.now())); $('#c-ck-new').value = ''; count(); };
  $('#c-ck-new').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const copy = async t => { try { await navigator.clipboard.writeText(t); toast('Kopyalandı.', 'success'); } catch { toast('Kopyalanamadı; metni seçip Ctrl+C ile kopyala.', 'error'); } };
  form.addEventListener('click', async e => {
    if (e.target.closest('[data-ck-add]')) return add();
    const del = e.target.closest('[data-ck-del]');
    if (del) { del.closest('.check-item').remove(); return count(); }
    const cp = e.target.closest('[data-c-copy]');
    if (cp) return copy(cp.dataset.cCopy === 'first' ? $('#c-first').value : `${cap.value}\n\n${$('#c-tags').value}`.trim());
    const w = e.target.closest('[data-c-write]');
    if (w) {
      try {
        const r = await busyTimer(w, () => api.writeContentText(content.id, ($('#c-model select') || {}).value || null));
        cap.value = r.caption; $('#c-tags').value = r.hashtags.join(' '); $('#c-first').value = r.firstComment;
        cap.dispatchEvent(new Event('input'));
        $('#c-write-note').textContent = `${aiNote(r.ai)} · Kaydet'e basınca saklanır.`;
      } catch (err) { toast(err.message, 'error'); }
    }
  });
  try {
    const models = await aiModels();
    if (!models.ov.providers.some(p => p.configured)) { form.querySelector('[data-c-write]').remove(); $('#c-write-note').textContent = 'AI bağlı değilse metni elle yazabilirsin.'; return; }
    $('#c-model').innerHTML = modelSelect(models, 'yazim', { id: 'c-model-pick' });
  } catch { /* model listesi gelmezse atanmış model kullanılır */ }
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
        <div class="field full"><label for="n-body">Not *</label><textarea class="textarea" id="n-body" name="body" required maxlength="5000" rows="6">${esc(n.body || '')}</textarea></div>
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
