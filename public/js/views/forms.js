// Ortak pencereler: içerik planlama, görev ve not. Takvim, yönetim merkezi, fikir havuzu ve arşiv aynı pencereleri kullanır.
import { api } from '../api.js';
import { esc, openModal, dateKey, timeStr, toast, busy } from '../ui.js';
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
        <div class="set-row mt-2" id="c-sets" aria-label="Hashtag grupları ve imzalar"></div>
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
      <details class="disclosure mt-4" id="c-review" ${c.status === 'onay' ? 'open' : ''}>
        <summary>Onay <span class="muted" id="c-rv-state">${c.status === 'onay' ? '· onay bekliyor' : ''}</span></summary>
        <p class="xsmall muted mb-2">Onaya gönder → yorum → onayla ya da düzeltme iste. Tek başına çalışıyorsan kendi son kontrolün olur: yapılacaklar bitmeden onay verilmez.</p>
        <ol class="review-list" id="c-rv-list"><li class="small muted">Yükleniyor…</li></ol>
        <div class="field mt-2"><label for="c-rv-note">Not / yorum</label><textarea class="textarea" id="c-rv-note" rows="2" maxlength="1000" placeholder="Ör. Görseldeki fiyat yanlış yazılmış"></textarea></div>
        <div class="row mt-2" id="c-rv-actions"></div>
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
  if (content) { wireContentCard(modal.form, content); wireReview(modal.form, content, onSaved); wireSets(modal.form, content.brandId); }
}

// 8.15 Hashtag grupları ve imza kapanışları: tek tıkla ekleme; "Setleri düzenle" ile marka için yönetilir
async function wireSets(form, brandId) {
  const box = form.querySelector('#c-sets');
  let sets = { hashtagGroups: [], signatures: [] };
  const draw = () => {
    box.innerHTML = `${sets.hashtagGroups.map(g => `<button type="button" class="chip" data-tag-group="${esc(g.id)}" title="${esc(g.tags.join(' '))}">#️⃣ ${esc(g.name)} <span class="muted">${g.tags.length}</span></button>`).join('')}
      ${sets.signatures.map(x => `<button type="button" class="chip" data-sig="${esc(x.id)}" title="${esc(x.text)}">✍️ ${esc(x.name)}</button>`).join('')}
      <button type="button" class="btn btn-sm btn-ghost" data-sets-edit>${sets.hashtagGroups.length || sets.signatures.length ? 'Setleri düzenle' : '+ Hashtag grubu / imza ekle'}</button>`;
  };
  try { sets = (await api.captionSets(brandId)).sets; } catch { /* setler gelmezse yalnız düzenle düğmesi */ }
  draw();
  box.addEventListener('click', e => {
    const g = e.target.closest('[data-tag-group]');
    if (g) {
      const grp = sets.hashtagGroups.find(x => x.id === g.dataset.tagGroup);
      const input = form.querySelector('#c-tags');
      const cur = input.value.split(/\s+/).filter(Boolean);
      const low = new Set(cur.map(t => t.toLocaleLowerCase('tr-TR')));
      input.value = [...cur, ...grp.tags.filter(t => !low.has(t.toLocaleLowerCase('tr-TR')))].join(' ');
      return;
    }
    const sg = e.target.closest('[data-sig]');
    if (sg) {
      const x = sets.signatures.find(y => y.id === sg.dataset.sig);
      const cap = form.querySelector('#c-caption');
      if (!cap.value.includes(x.text)) { cap.value = cap.value.trim() ? `${cap.value.trimEnd()}\n\n${x.text}` : x.text; cap.dispatchEvent(new Event('input')); }
      return;
    }
    if (e.target.closest('[data-sets-edit]')) setsEditor(brandId, sets, next => { sets = next; draw(); });
  });
}

function setsEditor(brandId, sets, onSaved) {
  const gRow = (g = {}) => `<div class="set-edit" data-g><input class="input input-sm" data-g-name maxlength="40" placeholder="Grup adı (ör. Kampüs)" value="${esc(g.name || '')}" aria-label="Grup adı"><input class="input input-sm grow" data-g-tags maxlength="1200" placeholder="#kahve #kampus #vize" value="${esc((g.tags || []).join(' '))}" aria-label="Hashtag'ler"><input type="hidden" data-g-id value="${esc(g.id || '')}"><button type="button" class="btn btn-sm btn-ghost icon-btn" data-row-del aria-label="Sil">✕</button></div>`;
  const sRow = (x = {}) => `<div class="set-edit" data-s><input class="input input-sm" data-s-name maxlength="40" placeholder="İmza adı (ör. Kapanış)" value="${esc(x.name || '')}" aria-label="İmza adı"><textarea class="textarea grow" data-s-text rows="2" maxlength="300" placeholder="Ör. Kampüsteki kahve durağın ☕ Bio'daki linkten menüye bak!" aria-label="İmza metni">${esc(x.text || '')}</textarea><input type="hidden" data-s-id value="${esc(x.id || '')}"><button type="button" class="btn btn-sm btn-ghost icon-btn" data-row-del aria-label="Sil">✕</button></div>`;
  const m = openModal({
    title: 'Hashtag grupları ve imzalar', submitLabel: 'Kaydet',
    body: `<p class="small muted mb-3">İçerik kartında tek tıkla eklenir. Marka hafızasındaki yasaklı kelimeler kullanılamaz.</p>
      <h4 class="mb-2">Hashtag grupları</h4><div class="stack-sm" id="se-groups">${(sets.hashtagGroups.length ? sets.hashtagGroups : [{}]).map(gRow).join('')}</div>
      <button type="button" class="btn btn-sm mt-2" data-add-g>+ Grup</button>
      <h4 class="mt-4 mb-2">İmza kapanışları</h4><div class="stack-sm" id="se-sigs">${(sets.signatures.length ? sets.signatures : [{}]).map(sRow).join('')}</div>
      <button type="button" class="btn btn-sm mt-2" data-add-s>+ İmza</button>`,
    onSubmit: async (fd, form) => {
      const body = {
        hashtagGroups: [...form.querySelectorAll('[data-g]')].map(r => ({ id: r.querySelector('[data-g-id]').value, name: r.querySelector('[data-g-name]').value, tags: r.querySelector('[data-g-tags]').value })),
        signatures: [...form.querySelectorAll('[data-s]')].map(r => ({ id: r.querySelector('[data-s-id]').value, name: r.querySelector('[data-s-name]').value, text: r.querySelector('[data-s-text]').value }))
      };
      const { sets: next } = await api.saveCaptionSets(brandId, body);
      toast('Setler kaydedildi.', 'success');
      onSaved(next);
    }
  });
  m.form.addEventListener('click', e => {
    if (e.target.closest('[data-add-g]')) return m.form.querySelector('#se-groups').insertAdjacentHTML('beforeend', gRow());
    if (e.target.closest('[data-add-s]')) return m.form.querySelector('#se-sigs').insertAdjacentHTML('beforeend', sRow());
    const del = e.target.closest('[data-row-del]');
    if (del) del.closest('.set-edit').remove();
  });
}

// 8.11 Onay akışı: geçmiş, durumuna göre düğmeler; açık yapılacak varsa onay için ayrıca sorulur
async function wireReview(form, content, onSaved) {
  const $ = s => form.querySelector(s);
  let status = content.status;
  const when = iso => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const drawList = list => {
    $('#c-rv-list').innerHTML = list.length ? list.map(r => `<li class="rv-${esc(r.action)}"><b>${esc(r.label)}</b> <span class="xsmall muted">${esc(when(r.createdAt))}</span>${r.note ? `<div class="small">${esc(r.note)}</div>` : ''}</li>`).join('') : '<li class="small muted">Henüz onay geçmişi yok.</li>';
  };
  const drawActions = () => {
    const btn = (a, label, primary) => `<button type="button" class="btn btn-sm ${primary ? 'btn-primary' : ''}" data-rv="${a}">${label}</button>`;
    $('#c-rv-actions').innerHTML = (status === 'onay' ? btn('onayla', 'Onayla', true) + btn('duzelt', 'Düzeltme iste') : btn('gonder', 'Onaya gönder', true)) + btn('yorum', 'Yorum ekle');
    $('#c-rv-state').textContent = status === 'onay' ? '· onay bekliyor' : '';
  };
  drawActions();
  try { drawList((await api.contentReviews(content.id)).reviews); } catch { drawList([]); }
  $('#c-rv-actions').addEventListener('click', async e => {
    const b = e.target.closest('[data-rv]');
    if (!b) return;
    const checklist = [...form.querySelectorAll('#c-checklist .check-item')].map(li => ({ label: li.querySelector('[data-ck-label]').textContent, done: li.querySelector('[data-ck-done]').checked }));
    const body = { action: b.dataset.rv, note: $('#c-rv-note').value, checklist };
    let r;
    try { r = await busy(b, () => api.reviewContent(content.id, body)); } catch (err) {
      if (err.code !== 'CHECKLIST_OPEN') return toast(err.message, 'error');
      if (!confirm(err.message)) return;
      try { r = await busy(b, () => api.reviewContent(content.id, Object.assign(body, { force: true }))); } catch (e2) { return toast(e2.message, 'error'); }
    }
    status = r.content.status;
    content.status = status;
    const sel = $('#c-status'); if (sel) sel.value = status; // Kaydet'e basılırsa durum geri dönmesin
    $('#c-rv-note').value = '';
    drawList(r.reviews);
    drawActions();
    toast(r.reviews[r.reviews.length - 1].label + '.', 'success');
    if (onSaved) onSaved();
  });
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
