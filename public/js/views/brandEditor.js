// Marka dijital kimliği: profil, görsel kimlik (renk, font, canlı önizleme) ve varlık kütüphanesi
import { api } from '../api.js';
import { esc, icon, toast, loadFonts, errorNotice, pageHead, emptyState, skeletonPage, busy } from '../ui.js';
import { state, refreshBrands, go, renderChrome } from '../app.js';

const LONG_FIELDS = new Set(['description', 'audience', 'character', 'tone', 'goals', 'competitors']);
const PLACEHOLDERS = {
  name: 'Ör. Kahve Durağı',
  sector: 'Ör. Kafe / kahve zinciri',
  description: 'Marka ne yapar, neyi farklı yapar?',
  audience: 'Kimlere sesleniyoruz? Yaş, ilgi alanı, ihtiyaçlar…',
  character: 'Marka bir insan olsaydı nasıl biri olurdu?',
  tone: 'Samimi mi, kurumsal mı? Esprili mi, ciddi mi? Hitap: sen/siz?',
  goals: 'Bilinirlik, satış, topluluk… İçeriklerden ne bekliyoruz?',
  competitors: 'Rakipler ve ilham alınan markalar',
  slogan: 'Ör. Her yudum bir mola'
};
const EMPTY_BRAND = { name: '', sector: '', description: '', audience: '', character: '', tone: '', goals: '', competitors: '', slogan: '', driveFolder: '', colors: { primary: '#5b55e6', secondary: [], backgrounds: ['#ffffff'], heading: '#1b1f3b', body: '#3a3f63' }, fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' } };
const MAX_COLORS = 6;

export async function renderBrandEditor(view, brandId, initialTab) {
  const isNew = brandId === 'yeni';
  let brand;
  let logoUrl = null;
  let driveOk = false;
  if (isNew) {
    brand = JSON.parse(JSON.stringify(EMPTY_BRAND));
    driveOk = (await api.settings()).drive.configured;
  } else {
    view.innerHTML = skeletonPage({ cards: 2, height: 420 });
    const [{ brand: b }, { assets }, settings] = await Promise.all([api.brand(brandId), api.assets(brandId, 'logo'), api.settings()]);
    brand = b;
    brand.driveFolder = b.driveFolderUrl || '';
    logoUrl = assets[0] ? assets[0].url : null;
    driveOk = settings.drive.configured;
  }
  const draft = JSON.parse(JSON.stringify(brand));
  let tab = isNew ? 'profil' : initialTab;
  let dirty = false;

  function shell() {
    view.innerHTML = `
      ${pageHead({
        title: isNew ? 'Yeni marka' : brand.name,
        desc: isNew ? 'Kimliği bir kez tanımla; bütün üretimler buna göre yapılsın.' : 'Dijital kimlik: asistan ve üretim araçları bu bilgileri kullanır.',
        actions: isNew ? '' : `<button class="btn btn-danger" data-action="delete">${icon('trash')}Markayı sil</button>`
      })}
      ${isNew ? '' : `<div class="tabs" role="tablist">
        ${[['profil', 'Marka profili'], ['gorsel', 'Görsel kimlik'], ['varliklar', 'Varlık kütüphanesi']].map(([id, label]) =>
          `<button role="tab" data-tab="${id}" class="${tab === id ? 'active' : ''}" aria-selected="${tab === id}">${label}</button>`).join('')}
      </div>`}
      <div id="tab-body"></div>`;
    renderTab();
  }

  function renderTab() {
    const body = view.querySelector('#tab-body');
    if (tab === 'varliklar') return renderAssets(body, brand, driveOk);
    body.innerHTML = `
      <div class="editor">
        <div>
          <div class="card">${tab === 'profil' ? profileForm() : visualForm()}</div>
          <div class="card save-bar">
            <span class="small muted" id="dirty-note">${dirty ? 'Kaydedilmemiş değişiklikler var' : (isNew ? 'Marka adı zorunlu; diğer alanları sonra da doldurabilirsin.' : 'Tüm değişiklikler kayıtlı')}</span>
            <button class="btn btn-primary" data-action="save">${isNew ? 'Markayı oluştur' : 'Kaydet'}</button>
          </div>
        </div>
        <aside class="preview">${previewCard()}</aside>
      </div>`;
    loadFonts([draft.fonts.heading, draft.fonts.body]);
  }

  function profileForm() {
    const fields = state.meta.profileFields;
    return `<div class="form-grid">${Object.entries(fields).map(([key, f]) => `
      <div class="field ${LONG_FIELDS.has(key) ? 'full' : ''}">
        <label for="f-${key}">${esc(f.label)}${f.required ? ' *' : ''}</label>
        ${LONG_FIELDS.has(key)
          ? `<textarea class="textarea" id="f-${key}" data-field="${key}" maxlength="${f.max}" placeholder="${esc(PLACEHOLDERS[key] || '')}">${esc(draft[key])}</textarea>`
          : `<input class="input" id="f-${key}" data-field="${key}" maxlength="${f.max}" value="${esc(draft[key])}" placeholder="${esc(PLACEHOLDERS[key] || '')}" ${f.required ? 'required' : ''}>`}
      </div>`).join('')}
      <div class="field full">
        <label for="f-drive">Google Drive klasörü</label>
        <div class="drive-row">
          <input class="input" id="f-drive" data-drive value="${esc(draft.driveFolder)}" placeholder="https://drive.google.com/drive/folders/…" autocomplete="off">
          ${isNew ? '' : `<button type="button" class="btn" data-action="drive-test" ${driveOk && brand.driveFolderId ? '' : 'disabled'}>Bağlantıyı test et</button>`}
        </div>
        <span class="hint">Bu markanın dosyaları bu klasöre gönderilir (şimdilik kütüphane görselleri; postlar, başlıklar ve senaryolar geldikçe onlar da). Drive'da klasörü aç, adres çubuğundaki linki kopyalayıp buraya yapıştır. İsteğe bağlı.${driveOk ? '' : ' Gönderebilmek için önce <a href="#/ayarlar">Ayarlar → Google Drive</a> bağlantısını kur.'}</span>
      </div></div>`;
  }

  const colorInput = (path, value, label) => `
    <div class="field"><label>${label}</label>
      <div class="color-field"><input type="color" data-color="${path}" value="${esc(value || '#ffffff')}" aria-label="${label}">
      <input class="input" data-hex="${path}" value="${esc(value)}" maxlength="7" placeholder="#RRGGBB"></div></div>`;

  const colorList = (key, label, hint) => `
    <div class="field full"><label>${label}</label>
      <div class="color-list">
        ${draft.colors[key].map((c, i) => `<span class="color-chip"><input type="color" data-list="${key}" data-index="${i}" value="${esc(c)}" aria-label="${label} ${i + 1}"><span class="small">${esc(c)}</span><button type="button" data-remove-color="${key}" data-index="${i}" aria-label="Kaldır">✕</button></span>`).join('')}
        ${draft.colors[key].length < MAX_COLORS ? `<button type="button" class="btn btn-sm" data-add-color="${key}">${icon('plus')}Renk ekle</button>` : ''}
      </div><span class="hint">${hint}</span></div>`;

  const fontSelect = (key, label) => `
    <div class="field"><label for="font-${key}">${label}</label>
      <select class="select" id="font-${key}" data-font="${key}">
        <option value="">Seçilmedi</option>
        ${state.meta.fonts.map(f => `<option ${draft.fonts[key] === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}
      </select></div>`;

  function visualForm() {
    return `
      <div class="form-grid">
        ${colorInput('primary', draft.colors.primary, 'Ana renk')}
        <div></div>
        ${colorList('secondary', 'İkincil renkler', `En fazla ${MAX_COLORS} renk.`)}
        ${colorList('backgrounds', 'Arka plan renkleri', 'Tasarımlarda zemin olarak kullanılır; ilki varsayılan zemindir.')}
        ${colorInput('heading', draft.colors.heading, 'Başlık yazı rengi')}
        ${colorInput('body', draft.colors.body, 'Gövde yazı rengi')}
        ${fontSelect('heading', 'Başlık fontu')}
        ${fontSelect('body', 'Gövde fontu')}
      </div>
      <p class="small muted mt-4">Logo, maskot, sticker ve görselleri <b>Varlık kütüphanesi</b> sekmesinden yükleyebilirsin.</p>`;
  }

  function previewCard() {
    const c = draft.colors;
    const bg = c.backgrounds[0] || '#ffffff';
    const bars = [c.primary, ...c.secondary].filter(Boolean).slice(0, 5);
    return `
      <div class="card">
        <div class="card-head"><h3>Canlı önizleme</h3><span class="small muted">Instagram post</span></div>
        <div class="post-preview" style="background:${esc(bg)}">
          <div class="row-between">
            ${logoUrl ? `<img class="pp-logo" src="${esc(logoUrl)}" alt="">` : `<div class="avatar" style="background:${esc(c.primary || '#5b55e6')}">${esc((draft.name || '?').charAt(0).toLocaleUpperCase('tr-TR'))}</div>`}
            <span class="small" style="color:${esc(c.body || '#3a3f63')};font-family:'${esc(draft.fonts.body)}',sans-serif;font-weight:700">${esc(draft.name || 'Marka adı')}</span>
          </div>
          <div class="pp-title" style="color:${esc(c.heading || '#1b1f3b')};font-family:'${esc(draft.fonts.heading)}',sans-serif">${esc(draft.slogan || 'Başlık burada görünür')}</div>
          <div class="pp-body" style="color:${esc(c.body || '#3a3f63')};font-family:'${esc(draft.fonts.body)}',sans-serif">${esc((draft.description || 'Gövde metni marka fontu ve rengiyle böyle görünür.').slice(0, 140))}</div>
          <div class="pp-bar">${bars.map(b => `<span style="background:${esc(b)}"></span>`).join('')}</div>
        </div>
      </div>`;
  }

  function markDirty() {
    dirty = true;
    const note = view.querySelector('#dirty-note');
    if (note) note.textContent = 'Kaydedilmemiş değişiklikler var';
    const pv = view.querySelector('.preview');
    if (pv) { pv.innerHTML = previewCard(); loadFonts([draft.fonts.heading, draft.fonts.body]); }
  }

  async function save(btn) {
    const payload = Object.assign({}, draft);
    delete payload.id; delete payload.createdAt; delete payload.updatedAt; delete payload.driveFolderId; delete payload.driveFolderUrl;
    btn.disabled = true;
    try {
      if (isNew) {
        const { brand: created } = await api.createBrand(payload);
        await refreshBrands();
        toast('Marka oluşturuldu.', 'success');
        go('#/m/' + created.id + '/kimlik/gorsel');
        return;
      }
      const { brand: saved } = await api.updateBrand(brand.id, payload);
      Object.assign(brand, saved, { driveFolder: saved.driveFolderUrl || '' });
      Object.assign(draft, { driveFolder: brand.driveFolder });
      dirty = false;
      await refreshBrands();
      toast('Marka kimliği kaydedildi.', 'success');
      shell();
    } catch (err) {
      toast(err.message, 'error');
    } finally { btn.disabled = false; }
  }

  view.oninput = e => {
    const t = e.target;
    if (t.dataset.field) { draft[t.dataset.field] = t.value; markDirty(); }
    else if (t.dataset.drive !== undefined) { draft.driveFolder = t.value; markDirty(); }
    else if (t.dataset.color) {
      draft.colors[t.dataset.color] = t.value;
      const hex = view.querySelector(`[data-hex="${t.dataset.color}"]`);
      if (hex) hex.value = t.value;
      markDirty();
    } else if (t.dataset.hex && /^#[0-9a-fA-F]{6}$/.test(t.value)) {
      draft.colors[t.dataset.hex] = t.value.toLowerCase();
      const picker = view.querySelector(`[data-color="${t.dataset.hex}"]`);
      if (picker) picker.value = t.value;
      markDirty();
    } else if (t.dataset.list) {
      draft.colors[t.dataset.list][Number(t.dataset.index)] = t.value;
      t.nextElementSibling.textContent = t.value;
      markDirty();
    }
  };

  view.onchange = e => {
    const t = e.target;
    if (t.dataset.font !== undefined && t.dataset.font) { draft.fonts[t.dataset.font] = t.value; markDirty(); }
    if (t.dataset.hex && t.value === '') { draft.colors[t.dataset.hex] = ''; markDirty(); }
  };

  view.onclick = async e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.tab) {
      if (t.dataset.tab === tab) return;
      if (dirty && !confirm('Kaydedilmemiş değişiklikler var. Kaydetmeden sekme değiştirilsin mi? Değişiklikler bu sayfada kalır, kaydetmeyi unutma.')) return;
      tab = t.dataset.tab;
      // Sekme adresi değişir ama sayfa yeniden yüklenmez (kaydedilmemiş değişiklikler korunur)
      history.replaceState(null, '', `#/m/${brand.id}${{ profil: '/kimlik', gorsel: '/kimlik/gorsel', varliklar: '/kutuphane' }[tab]}`);
      renderChrome();
      shell();
    } else if (t.dataset.action === 'save') save(t);
    else if (t.dataset.action === 'drive-test') {
      if (draft.driveFolder.trim() !== brand.driveFolder) return toast('Önce Kaydet\'e bas; sonra bağlantıyı test et.', 'error');
      t.disabled = true;
      try {
        const r = await api.testBrandDrive(brand.id);
        toast(`Drive klasörüne erişildi${r.folderName ? ': ' + r.folderName : ''}.`, 'success');
      } catch (err) { toast(err.message, 'error'); } finally { t.disabled = false; }
    }
    else if (t.dataset.addColor) {
      const list = draft.colors[t.dataset.addColor];
      if (list.length < MAX_COLORS) { list.push(t.dataset.addColor === 'backgrounds' ? '#ffffff' : '#888888'); markDirty(); renderTab(); }
    } else if (t.dataset.removeColor) {
      draft.colors[t.dataset.removeColor].splice(Number(t.dataset.index), 1);
      markDirty(); renderTab();
    } else if (t.dataset.action === 'delete') {
      if (!confirm(`"${brand.name}" markası; fikirleri, dosyaları, takvim içerikleri, görevleri, notları ve sohbet geçmişiyle birlikte kalıcı olarak silinsin mi?`)) return;
      try {
        await api.deleteBrand(brand.id);
        await refreshBrands();
        toast('Marka silindi.', 'success');
        go('#/markalar');
      } catch (err) { toast(err.message, 'error'); }
    }
  };

  shell();
}

// --- Varlık kütüphanesi: kategoriye göre yükleme, etiketleme, silme ---
async function renderAssets(body, brand, driveOk) {
  const canSend = driveOk && Boolean(brand.driveFolderId);
  const cats = state.meta.assetCategories;
  let current = 'logo';

  async function draw() {
    body.innerHTML = `
      <div class="card">
        <div class="asset-cats">${Object.entries(cats).map(([id, label]) => `<button type="button" class="chip ${id === current ? 'active' : ''}" data-cat="${id}">${esc(label)}</button>`).join('')}</div>
        <label class="dropzone" id="dropzone">
          <input type="file" id="asset-file" accept="image/png,image/jpeg,image/webp,image/gif" multiple class="sr-only">
          <div>${icon('upload')}</div>
          <div class="strong">${esc(cats[current])} yükle</div>
          <div class="small">Sürükle bırak ya da tıkla · PNG, JPEG, WEBP, GIF · en fazla ${Math.round(state.meta.maxAssetBytes / 1048576)} MB${current === 'mascot' ? ' · Her poza bir ad ver (ör. Mutlu, Şaşkın)' : ''}</div>
        </label>
        <div id="asset-grid"><div class="skeleton mt-4" style="height:160px"></div></div>
      </div>`;
    // Yükleme alanı liste beklenmeden hemen bağlanır; seçilen dosya kaybolmaz
    wireUpload();
    const grid = body.querySelector('#asset-grid');
    try {
      const { assets } = await api.assets(brand.id, current);
      grid.innerHTML = assets.length
        ? `<div class="asset-grid">${assets.map(a => `
            <div class="asset">
              <div class="thumb"><img src="${esc(a.url)}" alt="${esc(a.label || a.categoryLabel)}" loading="lazy"></div>
              <div class="meta"><input class="input" data-asset-label="${esc(a.id)}" value="${esc(a.label)}" placeholder="Etiket" maxlength="80" aria-label="Etiket">
              <button class="btn btn-sm btn-ghost icon-btn" data-asset-delete="${esc(a.id)}" aria-label="Sil">${icon('trash')}</button></div>
              ${canSend || a.driveUrl ? `<div class="meta">${a.driveUrl ? `<a class="drive-link" href="${esc(a.driveUrl)}" target="_blank" rel="noopener">✓ Drive'da</a>` : ''}
                ${canSend ? `<button class="btn btn-sm${a.driveUrl ? ' btn-ghost' : ''}" data-asset-drive="${esc(a.id)}">${a.driveUrl ? 'Tekrar gönder' : 'Drive\'a gönder'}</button>` : ''}</div>` : ''}
            </div>`).join('')}</div>`
        : emptyState({ icon: 'image', title: 'Bu kategoride dosya yok', text: `Yüklediğin dosyalar yalnızca ${esc(brand.name)} markasında görünür.`, compact: true });
    } catch (err) { grid.innerHTML = errorNotice(err); }
    wireGrid();
  }

  async function upload(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    let ok = 0;
    for (const file of list) {
      if (file.size > state.meta.maxAssetBytes) { toast(`${file.name}: 10 MB'tan büyük.`, 'error'); continue; }
      const label = file.name.replace(/\.[^.]+$/, '').slice(0, 80);
      try { await api.uploadAsset(brand.id, file, current, label); ok++; } catch (err) { toast(`${file.name}: ${err.message}`, 'error'); }
    }
    if (ok) { toast(`${ok} dosya yüklendi.`, 'success'); await refreshBrands(); }
    draw();
  }

  function wireUpload() {
    const dz = body.querySelector('#dropzone');
    body.querySelector('#asset-file').addEventListener('change', e => upload(e.target.files));
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); upload(e.dataTransfer.files); });
    body.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { current = b.dataset.cat; draw(); }));
  }

  function wireGrid() {
    body.querySelectorAll('[data-asset-label]').forEach(inp => inp.addEventListener('change', async () => {
      try { await api.updateAsset(brand.id, inp.dataset.assetLabel, { label: inp.value }); toast('Etiket kaydedildi.', 'success'); } catch (err) { toast(err.message, 'error'); }
    }));
    body.querySelectorAll('[data-asset-drive]').forEach(btn => btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Gönderiliyor…';
      try { await api.sendAssetToDrive(brand.id, btn.dataset.assetDrive); toast('Dosya Google Drive klasörüne gönderildi.', 'success'); draw(); }
      catch (err) { toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Drive\'a gönder'; }
    }));
    body.querySelectorAll('[data-asset-delete]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Bu dosya silinsin mi?')) return;
      try { await api.deleteAsset(brand.id, btn.dataset.assetDelete); await refreshBrands(); draw(); } catch (err) { toast(err.message, 'error'); }
    }));
  }

  draw();
}
