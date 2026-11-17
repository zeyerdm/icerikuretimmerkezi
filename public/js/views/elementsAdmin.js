// Öğe kütüphanesi yönetimi (Ayarlar → Öğe kütüphanesi) ve Lisanslar sayfası.
// Yüklenen öğeler bütün markaların Post stüdyosu Öğeler panelinde görünür (yayımdaysa). Lisans alanı zorunludur;
// ticari ve kapalı kaynak kullanıma uymayan lisanslar sunucuda reddedilir.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState, busy } from '../ui.js';
import { settingsTabs } from './settings.js';
import { loadRegistry } from '../elements.js';
import { svgUrl } from '../stockPacks.js';

const licenseFields = (licenses, prefix) => `
  <div class="form-grid">
    <div class="field"><label for="${prefix}-lic">Lisans *</label><select class="input" id="${prefix}-lic" name="license" required><option value="">Seç…</option>${Object.entries(licenses).map(([k, v]) => `<option value="${esc(k)}">${esc(v.title)}</option>`).join('')}</select></div>
    <div class="field"><label for="${prefix}-author">Hak sahibi</label><input class="input" id="${prefix}-author" name="author" maxlength="120" placeholder="Ör. Ad Soyad / stüdyo"></div>
    <div class="field"><label for="${prefix}-src">Kaynak adresi</label><input class="input" id="${prefix}-src" name="sourceUrl" maxlength="400" placeholder="https://…"></div>
    <div class="field"><label for="${prefix}-attr">Atıf metni</label><input class="input" id="${prefix}-attr" name="attribution" maxlength="300" placeholder="Lisans atıf istiyorsa"></div>
  </div>
  <p class="xsmall muted">Kullanılamayan lisanslar: CC BY-SA (aynı lisansla paylaşma), CC BY-NC (ticari yasak), CC BY-ND (değiştirme yasak), GPL/AGPL, lisansı bilinmeyen.</p>`;

export async function renderElementsAdmin(view) {
  let { elements, categories, licenses } = await api.elements(true);
  let filter = { q: '', pack: '' };
  const catOpts = sel => Object.entries(categories).map(([k, v]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const thumb = e => (e.svg ? svgUrl(e.svg.replace(/currentColor/g, '#1b1f3b')) : esc(e.url));
  const draw = () => {
    const packs = [...new Set(elements.map(e => e.pack).filter(Boolean))];
    const q = filter.q.toLocaleLowerCase('tr');
    const list = elements.filter(e => (!filter.pack || e.pack === filter.pack) && (!q || `${e.name} ${e.tags.join(' ')} ${e.categoryLabel}`.toLocaleLowerCase('tr').includes(q)));
    view.querySelector('#el-list').innerHTML = `
      ${packs.length ? `<div class="chips mb-2"><button type="button" class="chip ${!filter.pack ? 'active' : ''}" data-el-pack="">Tümü (${elements.length})</button>${packs.map(p => `<button type="button" class="chip ${filter.pack === p ? 'active' : ''}" data-el-pack="${esc(p)}">${esc(p)} (${elements.filter(e => e.pack === p).length})</button>`).join('')}</div>` : ''}
      ${filter.pack ? `<div class="row mb-3"><span class="small muted grow">Paket: <b>${esc(filter.pack)}</b></span><button class="btn btn-sm" data-pack-act="publish">Hepsini yayımla</button><button class="btn btn-sm" data-pack-act="hide">Hepsini gizle</button><button class="btn btn-sm btn-ghost" data-pack-act="delete">${icon('trash')}Paketi sil</button></div>` : ''}
      ${list.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Öğeler"><table class="table"><thead><tr><th></th><th>Ad</th><th>Kategori</th><th>Lisans</th><th>Durum</th><th></th></tr></thead><tbody>
        ${list.map(e => `<tr data-id="${esc(e.id)}"><td><img class="el-adm-thumb" src="${thumb(e)}" alt=""></td>
          <td><input class="input input-sm" data-f="name" value="${esc(e.name)}" maxlength="80" aria-label="Ad"><input class="input input-sm mt-1" data-f="tags" value="${esc(e.tags.join(', '))}" placeholder="etiketler, virgülle" aria-label="Etiketler"><div class="xsmall muted">${esc(e.kind.toUpperCase())}${e.recolor ? ' · renk değişir' : ''}${e.pack ? ' · ' + esc(e.pack) : ''}</div></td>
          <td><select class="input input-sm" data-f="category" aria-label="Kategori">${catOpts(e.category)}</select></td>
          <td class="small">${esc(e.licenseTitle)}${e.author ? `<div class="xsmall muted">${esc(e.author)}</div>` : ''}${e.sourceUrl ? `<div class="xsmall"><a class="link" href="${esc(e.sourceUrl)}" target="_blank" rel="noopener">kaynak</a></div>` : ''}</td>
          <td><label class="row small"><input type="checkbox" data-f="published" ${e.published ? 'checked' : ''}> Yayında</label></td>
          <td class="nowrap"><button class="btn btn-sm" data-save>Kaydet</button><button class="btn btn-sm btn-ghost" data-del aria-label="Sil">${icon('trash')}</button></td></tr>`).join('')}
      </tbody></table></div>` : emptyState({ icon: 'image', title: elements.length ? 'Eşleşen öğe yok' : 'Henüz yüklenmiş öğe yok', text: 'Yukarıdan SVG/PNG/WebP/GIF ya da ZIP ile toplu yükle. Uygulamayla gelen paketler (yaklaşık 10.000 öğe) zaten Öğeler panelinde.', compact: true })}`;
  };
  view.innerHTML = `
    ${pageHead({ title: 'Ayarlar', desc: 'Bütün markaların Post stüdyosunda görünen öğeler. Her öğede lisans bilgisi zorunlu.' })}
    ${settingsTabs('ogeler')}
    <section class="card mt-4"><div class="card-head"><h3>Öğe yükle</h3></div>
      <form id="el-up" class="stack">
        <div class="form-grid">
          <div class="field"><label for="up-file">Dosya (SVG, PNG, WebP, GIF; en fazla 2 MB) ya da ZIP (en fazla 30 MB, 500 dosya)</label><input class="input" id="up-file" type="file" name="file" accept=".svg,.png,.webp,.gif,.zip,image/svg+xml,image/png,image/webp,image/gif,application/zip" required></div>
          <div class="field"><label for="up-name">Ad (tek dosyada)</label><input class="input" id="up-name" name="name" maxlength="80" placeholder="Boşsa dosya adı"></div>
          <div class="field"><label for="up-cat">Kategori</label><select class="input" id="up-cat" name="category">${catOpts('diger')}</select></div>
          <div class="field"><label for="up-pack">Paket</label><input class="input" id="up-pack" name="pack" maxlength="60" placeholder="Ör. Bahar koleksiyonu"></div>
          <div class="field"><label for="up-tags">Etiketler</label><input class="input" id="up-tags" name="tags" maxlength="300" placeholder="kalp, sevgi, kırmızı"></div>
          <div class="field"><label class="row small mt-4"><input type="checkbox" name="published" checked> Hemen yayımla</label></div>
        </div>
        ${licenseFields(licenses, 'up')}
        <p class="xsmall muted">ZIP'te klasör adı kategori olarak kullanılır (ör. <code>oklar/ok1.svg</code>). İsteğe bağlı <code>elements.json</code>: <code>[{"file":"ok1.svg","name":"Kıvrık ok","tags":["yön"],"category":"oklar"}]</code>. Tek renkli SVG'ler otomatik olarak renk değiştirilebilir olur.</p>
        <div><button class="btn btn-primary" type="submit">${icon('upload')}Yükle</button></div>
      </form>
    </section>
    <section class="card mt-4"><div class="card-head"><h3>Yüklenen öğeler <span class="small muted">${elements.length}</span></h3><input class="input input-sm" id="el-q" type="search" placeholder="Ara" aria-label="Öğelerde ara"></div>
      <div id="el-list"></div>
    </section>`;
  draw();
  const reload = async () => { ({ elements } = await api.elements(true)); draw(); };
  view.oninput = e => { if (e.target.id === 'el-q') { filter.q = e.target.value; draw(); } };
  view.onsubmit = async e => {
    if (e.target.id !== 'el-up') return;
    e.preventDefault();
    const f = new FormData(e.target); const file = f.get('file');
    if (!file || !file.size) return toast('Dosya seç.', 'error');
    const meta = { category: f.get('category'), pack: f.get('pack') || '', tags: f.get('tags') || '', published: f.get('published') ? '1' : '0', license: f.get('license') || '', author: f.get('author') || '', attribution: f.get('attribution') || '', sourceUrl: f.get('sourceUrl') || '' };
    const btn = e.target.querySelector('[type=submit]');
    try {
      await busy(btn, async () => {
        if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
          const r = await api.importElements(file, meta);
          toast(`${r.added} öğe eklendi${r.failed.length ? `, ${r.failed.length} dosya atlandı` : ''}.`, r.failed.length ? 'info' : 'success');
          if (r.failed.length) view.querySelector('#el-list').insertAdjacentHTML('beforebegin', `<details class="notice mb-3" open><summary>Atlanan dosyalar</summary><ul class="small">${r.failed.slice(0, 50).map(x => `<li><b>${esc(x.file)}</b>: ${esc(x.reason)}</li>`).join('')}</ul></details>`);
        } else {
          await api.uploadElement(file, { ...meta, name: f.get('name') || file.name.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ') });
          toast('Öğe eklendi.', 'success');
        }
      });
      e.target.reset(); await reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  view.onclick = async e => {
    const t = e.target;
    const pk = t.closest('[data-el-pack]'); if (pk) { filter.pack = pk.dataset.elPack; return draw(); }
    const pa = t.closest('[data-pack-act]');
    if (pa) {
      const act = pa.dataset.packAct;
      if (act === 'delete' && !confirm(`"${filter.pack}" paketindeki bütün öğeler silinsin mi? Bu işlem geri alınamaz.`)) return;
      try { await api.elementPack(filter.pack, act); if (act === 'delete') filter.pack = ''; toast('Paket güncellendi.', 'success'); await reload(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const row = t.closest('tr[data-id]'); if (!row) return;
    const id = row.dataset.id;
    if (t.closest('[data-save]')) {
      const v = k => row.querySelector(`[data-f="${k}"]`);
      try { await api.updateElement(id, { name: v('name').value, tags: v('tags').value, category: v('category').value, published: v('published').checked }); toast('Kaydedildi.', 'success'); await reload(); } catch (err) { toast(err.message, 'error'); }
    }
    if (t.closest('[data-del]')) {
      if (!confirm('Öğe silinsin mi? Bu öğeyi kullanan postlardaki görsel katmanları boş görünür.')) return;
      try { await api.deleteElement(id); toast('Silindi.', 'success'); await reload(); } catch (err) { toast(err.message, 'error'); }
    }
  };
}

export async function renderLicenses(view) {
  const [reg, { custom }] = await Promise.all([loadRegistry(), api.elementLicenses()]);
  view.innerHTML = `
    ${pageHead({ title: 'Ayarlar', desc: 'Öğe kütüphanesindeki paketlerin kaynakları ve lisansları.' })}
    ${settingsTabs('lisanslar')}
    <section class="card mt-4"><div class="card-head"><h3>Uygulamayla gelen paketler</h3></div>
      <div class="table-wrap" tabindex="0" role="region" aria-label="Paket lisansları"><table class="table"><thead><tr><th>Paket</th><th>Öğe</th><th>Kaynak</th><th>Lisans</th><th>Ticari kullanım</th></tr></thead><tbody>
        ${reg.packs.map(p => `<tr><td><b>${esc(p.name)}</b></td><td>${p.count}</td><td class="small">${esc(p.source)}${p.url ? `<div><a class="link xsmall" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url.replace(/^https:\/\//, ''))}</a></div>` : ''}</td>
          <td class="small">${esc(p.license.title)}${p.license.holder ? `<div class="xsmall muted">© ${esc(p.license.holder)}</div>` : ''}${p.license.note ? `<div class="xsmall muted">${esc(p.license.note)}</div>` : ''}</td><td>${p.license.commercial ? 'Uygun' : 'Uygun değil'}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="xsmall muted mt-2">Lisans metinleri: <a class="link" href="/vendor/packs/LICENSES.txt" target="_blank" rel="noopener">LICENSES.txt</a> · <a class="link" href="/vendor/packs/LICENSE-Apache-2.0.txt" target="_blank" rel="noopener">Apache 2.0</a></p>
    </section>
    <section class="card mt-4"><div class="card-head"><h3>Yüklenen öğeler</h3></div>
      ${custom.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Yüklenen öğe lisansları"><table class="table"><thead><tr><th>Lisans</th><th>Hak sahibi / atıf</th><th>Paket</th><th>Öğe</th></tr></thead><tbody>
        ${custom.map(c => `<tr><td class="small">${esc(c.licenseTitle)}</td><td class="small">${esc(c.author || '—')}${c.attribution ? `<div class="xsmall muted">${esc(c.attribution)}</div>` : ''}${c.sourceUrl ? `<div class="xsmall"><a class="link" href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">kaynak</a></div>` : ''}</td><td class="small">${esc(c.pack || '—')}</td><td>${c.count}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="small muted">Henüz yüklenmiş öğe yok.</p>'}
    </section>
    <section class="card mt-4"><div class="card-head"><h3>Alınmayan kaynaklar</h3></div>
      <ul class="small">${reg.skipped.map(s => `<li><b>${esc(s.name)}</b>: ${esc(s.reason)}</li>`).join('')}</ul>
    </section>`;
}
