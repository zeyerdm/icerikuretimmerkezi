// 10.2 Kütüphane: markanın belirlenmiş varlıklarının sergilendiği yer (logolar, maskot pozları, yapılan tasarımlar,
// dışarıdan alınan referanslar). Burada marka bilgisi girilmez; bilgiler Marka kimliğinde. Görünüm sade bir galeri:
// bölüm seç, yükle, ara; ad, etiket ve referans rolü gibi ayrıntılar isteğe bağlı olarak "Ayrıntı" penceresinde.
// Görsel üretimi ve hazır şablonlar üretim ekranlarında (Prompt Studio), burada değil.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState, errorNotice, openModal, busy } from '../ui.js';
import { state, refreshBrands } from '../app.js';
import { INSPIRATION_NOTE, takeLibraryCategory } from '../inspiration.js';
import { ensureThumbs } from '../thumbs.js';

// Sunucudaki kategoriler değişmedi; kütüphane onları beş bölümde gösterir
export const LIB_GROUPS = [
  { id: 'logolar', label: 'Logolar', cats: ['logo'], hint: 'Markanın logoları ve logo varyasyonları.' },
  { id: 'maskot', label: 'Maskot', cats: ['mascot'], hint: 'Maskotun pozları. Maskotlu üretimlerde referans olur.' },
  { id: 'tasarimlar', label: 'Tasarımlarım', cats: ['ai_image'], hint: 'Üretilen görseller. Post stüdyosu tasarımları kendi sayfasında.' },
  { id: 'gorseller', label: 'Marka görselleri', cats: ['brand_image', 'product', 'illustration', 'sticker', 'background', 'other'], hint: 'Ürün fotoğrafları, mekân, sticker, arka planlar.' },
  { id: 'referanslar', label: 'Referanslar', cats: ['reference', 'inspiration'], hint: 'Dışarıdan alınan, beğenilen tasarımlar ve ilham görselleri (Ctrl+V ile yapıştırılanlar da burada).' }
];
const groupOfCat = cat => (LIB_GROUPS.find(g => g.cats.includes(cat)) || LIB_GROUPS[0]).id;

export async function renderLibrary(view, brand) {
  view.onclick = view.onkeydown = view.oninput = view.onchange = null;
  const cats = state.meta.assetCategories;
  const driveOk = Boolean(state.settings && state.settings.drive && state.settings.drive.configured);
  const canSend = driveOk && Boolean(brand.driveFolderId);
  const aiOn = Boolean(state.settings && state.settings.ai && state.settings.ai.configured);
  const start = takeLibraryCategory();
  let group = start ? groupOfCat(start) : 'logolar';
  let query = '';
  let all = [];

  view.innerHTML = `${pageHead({ title: 'Kütüphane', desc: `${esc(brand.name)} markasının logoları, maskotu, tasarımları ve referansları tek yerde. Marka bilgileri <a href="#/m/${esc(brand.id)}/kimlik">Marka kimliğinde</a>.` })}
    <nav class="tabs lib-tabs" aria-label="Kütüphane bölümleri"></nav>
    <div class="card"><div id="lib-body"></div></div>`;
  const tabs = view.querySelector('.lib-tabs');
  const body = view.querySelector('#lib-body');

  const count = g => all.filter(a => g.cats.includes(a.category)).length;
  function drawTabs() {
    tabs.innerHTML = LIB_GROUPS.map(g => `<button type="button" data-group="${g.id}" class="${g.id === group ? 'active' : ''}" aria-pressed="${g.id === group}">${esc(g.label)} <span class="muted">${count(g)}</span></button>`).join('');
  }

  function draw() {
    const g = LIB_GROUPS.find(x => x.id === group);
    const q = query.toLocaleLowerCase('tr-TR');
    const list = all.filter(a => g.cats.includes(a.category) && (!q || [a.label, a.pack, a.ocrText, a.categoryLabel, ...a.tags].join(' ').toLocaleLowerCase('tr-TR').includes(q)));
    drawTabs();
    body.innerHTML = `
      <div class="lib-head"><p class="small muted">${esc(g.hint)}${g.id === 'tasarimlar' ? ` <a href="#/m/${esc(brand.id)}/post">Post stüdyosu tasarımları →</a>` : ''}</p>
        <input class="input w-auto" type="search" id="lib-q" placeholder="Ara" aria-label="Kütüphanede ara" value="${esc(query)}"></div>
      <label class="dropzone dropzone-sm" id="dropzone">
        <input type="file" id="asset-file" accept="image/png,image/jpeg,image/webp,image/gif" multiple class="sr-only">
        <span>${icon('upload')}</span><span class="strong">${esc(g.label)} yükle</span><span class="small muted">Sürükle bırak ya da tıkla · en fazla ${Math.round(state.meta.maxAssetBytes / 1048576)} MB</span>
      </label>
      <div class="row mt-2 lib-upload-opts">${g.cats.length > 1 ? `<label class="small" for="lib-cat">Tür</label><select class="select w-auto input-sm" id="lib-cat">${g.cats.map(c => `<option value="${c}">${esc(cats[c])}</option>`).join('')}</select>` : ''}
        <span class="spacer"></span><button type="button" class="btn btn-sm btn-ghost" data-pack-upload>${icon('upload')}ZIP ya da paket yükle</button></div>
      ${list.length
        ? `<div class="lib-grid">${list.map(a => `
          <figure class="lib-item asset" data-asset-id="${esc(a.id)}">
            <div class="thumb"><img src="${esc(a.thumbUrl || a.url)}" alt="${esc(a.label || a.categoryLabel)}" loading="lazy"></div>
            <figcaption><span class="strong truncate" title="${esc(a.label)}">${esc(a.label || a.categoryLabel)}</span>${g.cats.length > 1 ? `<span class="xsmall muted">${esc(a.categoryLabel)}</span>` : ''}${a.driveUrl ? '<a class="xsmall drive-link" href="' + esc(a.driveUrl) + '" target="_blank" rel="noopener">✓ Drive\'da</a>' : ''}</figcaption>
            <div class="lib-actions">
              <a class="btn btn-sm btn-ghost icon-btn" href="${esc(a.url)}" download="${esc((a.label || 'gorsel').replace(/[\\/:*?"<>|]+/g, '-'))}" aria-label="İndir" title="İndir">${icon('download')}</a>
              ${canSend ? `<button type="button" class="btn btn-sm btn-ghost" data-drive="${esc(a.id)}" title="Markanın Drive klasörüne gönder">Drive'a gönder</button>` : ''}
              <button type="button" class="btn btn-sm btn-ghost" data-detail="${esc(a.id)}">Ayrıntı</button>
              <button type="button" class="btn btn-sm btn-ghost icon-btn" data-del="${esc(a.id)}" aria-label="Sil" title="Çöp kutusuna taşı">${icon('trash')}</button>
            </div>
          </figure>`).join('')}</div>`
        : emptyState({ icon: 'image', title: q ? 'Eşleşen dosya yok' : `${g.label} bölümü boş`, text: q ? 'Aramayı değiştir.' : 'Yukarıdan yükleyebilirsin.', compact: true })}
      ${g.id === 'referanslar' ? '<div class="card-section mt-5" id="insp-notes"></div>' : ''}`;
    ensureThumbs(brand.id, list, a => { const img = body.querySelector(`[data-asset-id="${CSS.escape(a.id)}"] img`); if (img) img.src = a.thumbUrl; });
    if (g.id === 'referanslar') drawInspirationNotes(body.querySelector('#insp-notes'), brand);
    wire();
  }

  async function load() {
    try { all = (await api.assets(brand.id)).assets; draw(); } catch (err) { body.innerHTML = errorNotice(err); }
  }

  async function upload(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    const g = LIB_GROUPS.find(x => x.id === group);
    const cat = (body.querySelector('#lib-cat') || {}).value || g.cats[0];
    let ok = 0;
    for (const file of list) {
      if (file.size > state.meta.maxAssetBytes) { toast(`${file.name}: ${Math.round(state.meta.maxAssetBytes / 1048576)} MB'tan büyük.`, 'error'); continue; }
      try { await api.uploadAsset(brand.id, file, cat, file.name.replace(/\.[^.]+$/, '').slice(0, 80)); ok++; } catch (err) { toast(`${file.name}: ${err.message}`, 'error'); }
    }
    if (ok) { toast(`${ok} dosya yüklendi.`, 'success'); await refreshBrands(); }
    load();
  }

  function packModal() {
    const g = LIB_GROUPS.find(x => x.id === group);
    openModal({
      title: `${g.label}: paket yükle`, submitLabel: 'Yükle',
      body: `<div class="form-grid">
        ${g.cats.length > 1 ? `<div class="field"><label for="pk-cat">Tür</label><select class="select" id="pk-cat" name="cat">${g.cats.map(c => `<option value="${c}">${esc(cats[c])}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label for="pk-name">Paket adı *</label><input class="input" id="pk-name" name="pack" required maxlength="60" placeholder="Ör. Kış sticker'ları"></div>
        <div class="field full"><label for="pk-files">Dosyalar *</label><input class="input" id="pk-files" name="files" type="file" multiple accept=".zip,application/zip,image/png,image/jpeg,image/webp,image/gif" required>
          <span class="hint">Bir ZIP arşivi (en fazla 200 görsel, 60 MB) ya da birden çok görsel. ZIP içindeki alt klasör adları etiket olur.</span></div></div>`,
      onSubmit: async (fd, form) => {
        const pack = String(fd.get('pack') || '').trim();
        const cat = fd.get('cat') || g.cats[0];
        const files = Array.from(form.querySelector('#pk-files').files);
        if (!pack || !files.length) throw new Error('Paket adı ve dosya gerekli.');
        let added = 0; let skipped = 0;
        for (const f of files) {
          if (/\.zip$/i.test(f.name) || f.type === 'application/zip') { const r = await api.uploadAssetPack(brand.id, f, cat, pack); added += r.added.length; skipped += r.skipped; }
          else { try { await api.uploadAsset(brand.id, f, cat, f.name.replace(/\.[^.]+$/, '').slice(0, 80), pack); added++; } catch { skipped++; } }
        }
        toast(`${added} görsel "${pack}" paketine eklendi${skipped ? `, ${skipped} dosya atlandı` : ''}.`, added ? 'success' : 'error', 5000);
        await refreshBrands();
        load();
      }
    });
  }

  // İsteğe bağlı ayrıntılar: ad, etiketler, @ ile anılınca referans rolü, görseldeki yazıyı okuma, paketi silme
  function detailModal(a) {
    const m = openModal({
      title: a.label || a.categoryLabel, submitLabel: 'Kaydet',
      body: `<div class="lib-detail"><img src="${esc(a.url)}" alt=""><div class="form-grid">
        <div class="field full"><label for="ld-label">Ad</label><input class="input" id="ld-label" name="label" maxlength="80" value="${esc(a.label)}"></div>
        <div class="field"><label for="ld-cat">Tür</label><select class="select" id="ld-cat" name="category">${Object.entries(cats).map(([k, v]) => `<option value="${k}" ${a.category === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="field"><label for="ld-role">Görsel üretiminde @${esc(a.mention)} anılınca</label><select class="select" id="ld-role" name="refRole"><option value="">Varsayılan</option>${[['kimlik', 'Kimlik (kişi/maskot aynı kalsın)'], ['nesne', 'Nesne (ürün aynı kalsın)'], ['stil', 'Stil (yalnız tarz alınsın)']].map(([k, v]) => `<option value="${k}" ${a.refRole === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field full"><label for="ld-tags">Etiketler (aramada kullanılır)</label><input class="input" id="ld-tags" name="tags" maxlength="300" value="${esc(a.tags.join(', '))}"></div>
        ${a.ocrText ? `<p class="xsmall muted full">Görselde okunan yazı: “${esc(a.ocrText.slice(0, 200))}”</p>` : ''}
        <div class="row full">${aiOn ? `<button type="button" class="btn btn-sm" data-ld-ocr>${icon('sparkle')}${a.analyzedAt ? 'Yeniden oku' : 'Yazıyı oku ve etiketle'}</button>` : ''}
          ${a.pack ? `<button type="button" class="btn btn-sm btn-ghost" data-ld-pack>${icon('trash')}"${esc(a.pack)}" paketini sil</button>` : ''}</div>
      </div></div>`,
      onSubmit: async fd => {
        await api.updateAsset(brand.id, a.id, { label: fd.get('label'), tags: fd.get('tags'), refRole: fd.get('refRole'), category: fd.get('category') });
        toast('Kaydedildi.', 'success');
        load();
      }
    });
    m.form.addEventListener('click', async e => {
      const ocr = e.target.closest('[data-ld-ocr]');
      if (ocr) {
        try { const r = await busy(ocr, () => api.analyzeAsset(brand.id, a.id)); m.form.querySelector('#ld-tags').value = r.asset.tags.join(', '); if (!m.form.querySelector('#ld-label').value && r.asset.label) m.form.querySelector('#ld-label').value = r.asset.label; toast(`${r.asset.tags.length} etiket önerildi · ${r.ai.modelLabel}`, 'success'); } catch (err) { toast(err.message, 'error'); }
        return;
      }
      if (e.target.closest('[data-ld-pack]')) {
        if (!confirm(`"${a.pack}" paketindeki bütün dosyalar çöp kutusuna taşınsın mı? 30 gün içinde geri alabilirsin.`)) return;
        try { const r = await api.deleteAssetPack(brand.id, a.pack); toast(`${r.removed} dosya çöp kutusuna taşındı.`, 'success'); m.form.querySelector('[data-close]').click(); await refreshBrands(); load(); } catch (err) { toast(err.message, 'error'); }
      }
    });
  }

  function wire() {
    const dz = body.querySelector('#dropzone');
    body.querySelector('#asset-file').addEventListener('change', e => upload(e.target.files));
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); upload(e.dataTransfer.files); });
    let t = null;
    body.querySelector('#lib-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { query = e.target.value.trim(); draw(); const i = body.querySelector('#lib-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    body.querySelector('[data-pack-upload]').addEventListener('click', packModal);
  }

  tabs.addEventListener('click', e => { const b = e.target.closest('[data-group]'); if (b && b.dataset.group !== group) { group = b.dataset.group; query = ''; draw(); } });
  body.addEventListener('click', async e => {
    const find = id => all.find(a => a.id === id);
    const d = e.target.closest('[data-detail]');
    if (d) return detailModal(find(d.dataset.detail));
    const dr = e.target.closest('[data-drive]');
    if (dr) {
      try { await busy(dr, () => api.sendAssetToDrive(brand.id, dr.dataset.drive)); toast('Dosya Google Drive klasörüne gönderildi.', 'success'); load(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      if (!confirm('Bu dosya çöp kutusuna taşınsın mı? 30 gün içinde geri alabilirsin.')) return;
      try { await api.deleteAsset(brand.id, del.dataset.del); await refreshBrands(); load(); } catch (err) { toast(err.message, 'error'); }
    }
  });
  // Kütüphane açıkken Ctrl+V ile yapıştırılan ilham hemen görünür
  const onInspiration = () => { if (!view.isConnected) return document.removeEventListener('ium:inspiration', onInspiration); load(); };
  document.addEventListener('ium:inspiration', onInspiration);
  body.innerHTML = '<div class="skeleton" style="height:220px"></div>';
  await load();
}

// Referanslar bölümünde: yapıştırılan link ve metinler ("İlham" kategorili marka notları)
async function drawInspirationNotes(el, brand) {
  if (!el) return;
  try {
    const { notes } = await api.notes({ brandId: brand.id, category: INSPIRATION_NOTE });
    el.innerHTML = `<h3 class="mb-2">Link ve metinler <span class="muted small">${notes.length}</span></h3>` + (notes.length
      ? `<div class="insp-list">${notes.map(n => {
          const link = /^https?:\/\/\S+$/i.test(n.body.trim());
          return `<div class="insp-item">${link ? `<a href="${esc(n.body.trim())}" target="_blank" rel="noopener noreferrer" class="strong">${esc(n.title || n.body)}</a><div class="xsmall muted">${esc(n.body.trim())}</div>` : `<div class="grow"><div class="strong">${esc(n.title)}</div><div class="small">${esc(n.body.slice(0, 240))}</div></div>`}
            <button type="button" class="btn btn-sm btn-ghost icon-btn" data-insp-del="${esc(n.id)}" aria-label="Sil">${icon('trash')}</button></div>`;
        }).join('')}</div>`
      : '<div class="small muted">Henüz link ya da metin yok. Bir linki kopyalayıp bu markanın herhangi bir sayfasında (yazı alanı dışında) Ctrl+V yapman yeterli.</div>');
    el.onclick = async e => {
      const d = e.target.closest('[data-insp-del]');
      if (!d) return;
      try { await api.deleteNote(d.dataset.inspDel); drawInspirationNotes(el, brand); } catch (err) { toast(err.message, 'error'); }
    };
  } catch (err) { el.innerHTML = errorNotice(err); }
}
