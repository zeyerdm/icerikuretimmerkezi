// Aşama 5.13: Dışa aktarma merkezi. Kütüphaneden, bilgisayardan ya da Post stüdyosu tasarımlarından seçilen görseller
// tarayıcıda kırpılır (1:1 / 4:5 / 9:16 / 16:9, ortadan), küçültülür, JPEG/WEBP/PNG'ye dönüştürülüp sıkıştırılır.
// Görsel yeniden çizilerek kodlandığı için EXIF/konum gibi meta veriler her zaman silinir. Sunucuya bir şey yüklenmez.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState } from '../ui.js';
import { state } from '../app.js';
import { drawSlide, resolveImages, loadImage } from '../postCanvas.js';
import { downloadBlob, safeName } from '../titlePng.js';
import { zipBlob } from '../zipWriter.js';

const RATIOS = { orijinal: 'Orijinal oran', '1:1': '1:1 kare', '4:5': '4:5 dikey gönderi', '9:16': '9:16 story / Reels', '16:9': '16:9 yatay' };
const WIDTHS = { 0: 'Orijinal boyut', 2160: 'En fazla 2160 px', 1440: 'En fazla 1440 px', 1080: 'En fazla 1080 px (Instagram)', 720: 'En fazla 720 px' };
const FORMATS = { 'image/jpeg': ['JPEG', 'jpg'], 'image/webp': ['WEBP', 'webp'], 'image/png': ['PNG', 'png'] };
const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

export async function renderExporter(view, brand) {
  view.onclick = view.onchange = view.oninput = null;
  let opts = { ratio: '4:5', width: 1080, type: 'image/jpeg', quality: 85 };
  try { Object.assign(opts, JSON.parse(localStorage.getItem('ium.export.opts') || '{}')); } catch { /* varsayılanlar */ }
  let tab = 'kutuphane';
  const items = []; // { key, name, size, load: () => Promise<CanvasImageSource>, out?: {blob, w, h} }
  const [{ assets }, { posts }] = await Promise.all([api.assets(brand.id), api.posts(brand.id)]);
  const formats = state.meta.posts.formats;

  function draw() {
    view.innerHTML = `
      ${pageHead({ title: 'Dışa aktarma merkezi', desc: 'Görselleri paylaşım ölçüsüne kırp, küçült, formatını değiştir ve sıkıştır. Meta veriler (EXIF, konum, cihaz) her zaman temizlenir. İşlem bu tarayıcıda yapılır; dosyalar sunucuya yüklenmez.' })}
      <div class="exp-layout">
        <div class="card">
          <div class="tabs mb-3">${[['kutuphane', 'Kütüphane'], ['tasarim', 'Post tasarımları'], ['bilgisayar', 'Bilgisayardan']].map(([k, l]) => `<button type="button" class="tab ${tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
          <div id="exp-src">${srcHtml()}</div>
        </div>
        <div class="card">
          <h3 class="mb-3">Ayarlar</h3>
          <div class="form-grid">
            <div class="field"><label for="ex-ratio">Kırpma</label><select class="select" id="ex-ratio">${Object.entries(RATIOS).map(([k, v]) => `<option value="${k}" ${opts.ratio === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
            <div class="field"><label for="ex-width">Boyut</label><select class="select" id="ex-width">${Object.entries(WIDTHS).map(([k, v]) => `<option value="${k}" ${+opts.width === +k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
            <div class="field"><label for="ex-type">Format</label><select class="select" id="ex-type">${Object.entries(FORMATS).map(([k, [l]]) => `<option value="${k}" ${opts.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="field"><label for="ex-q">Kalite <span id="ex-qv">${opts.quality}</span></label><input type="range" id="ex-q" min="40" max="100" step="1" value="${opts.quality}" ${opts.type === 'image/png' ? 'disabled title="PNG kayıpsızdır"' : ''}></div>
          </div>
          <div class="row mt-3"><span class="small muted">${items.length} görsel seçili</span><span class="spacer"></span>
            ${items.length ? `<button class="btn btn-ghost btn-sm" data-clear>Temizle</button><button class="btn btn-primary" data-zip>${icon('download')}Hepsini ZIP indir</button>` : ''}</div>
          <div id="exp-out" class="exp-out mt-3">${items.length ? items.map(outRow).join('') : emptyState({ icon: 'download', title: 'Henüz görsel seçilmedi', text: 'Soldan kütüphane görsellerini, tasarımları ya da bilgisayarındaki dosyaları ekle.', compact: true })}</div>
        </div>
      </div>`;
    process();
  }

  function srcHtml() {
    const picked = new Set(items.map(i => i.key));
    if (tab === 'kutuphane') return assets.length ? `<div class="exp-pick">${assets.map(a => `<button type="button" class="exp-thumb ${picked.has('a' + a.id) ? 'on' : ''}" data-asset="${esc(a.id)}" title="${esc(a.label || a.categoryLabel)}"><img src="${esc(a.thumbUrl || a.url)}" alt="" loading="lazy"><span>${esc(a.label || a.categoryLabel)}</span></button>`).join('')}</div>`
      : emptyState({ icon: 'image', title: 'Kütüphane boş', compact: true });
    if (tab === 'tasarim') return posts.length ? `<div class="exp-list">${posts.map(p => `<button type="button" class="exp-post ${picked.has('p' + p.id + ':0') ? 'on' : ''}" data-post="${esc(p.id)}">${icon('palette')}<span class="strong">${esc(p.title)}</span><span class="xsmall muted">${p.data.slides.length} slayt · ${esc(p.data.format)}</span></button>`).join('')}</div><p class="xsmall muted mt-2">Tasarımın bütün slaytları eklenir.</p>`
      : emptyState({ icon: 'palette', title: 'Tasarım yok', compact: true });
    return `<label class="dropzone" id="exp-drop"><input type="file" id="exp-file" accept="image/png,image/jpeg,image/webp,image/gif" multiple class="sr-only"><div>${icon('upload')}</div><div class="strong">Dosya seç ya da sürükle bırak</div><div class="small">Dosyalar yalnızca bu tarayıcıda işlenir, kaydedilmez.</div></label>`;
  }

  function outRow(it) {
    const o = it.out;
    return `<div class="exp-row" data-key="${esc(it.key)}"><div class="exp-prev">${o ? `<img src="${esc(o.url)}" alt="">` : '<div class="skeleton" style="height:100%"></div>'}</div>
      <div class="exp-info"><div class="strong small">${esc(it.name)}</div><div class="xsmall muted">${o ? `${o.w}×${o.h} · ${it.size ? kb(it.size) + ' → ' : ''}<b>${kb(o.blob.size)}</b>${it.size && o.blob.size < it.size ? ` (%${Math.round(100 - o.blob.size / it.size * 100)} küçük)` : ''}` : 'Hazırlanıyor…'}</div></div>
      ${o ? `<button class="btn btn-sm btn-ghost icon-btn" data-dl="${esc(it.key)}" aria-label="İndir" title="İndir">${icon('download')}</button>` : ''}
      <button class="btn btn-sm btn-ghost icon-btn" data-rm="${esc(it.key)}" aria-label="Çıkar" title="Çıkar">${icon('x')}</button></div>`;
  }

  // Tek görseli ayarlara göre işler: ortadan kırp → küçült → kodla (meta veri taşınmaz)
  // o: işin başladığı andaki ayarların kopyası (işlem sürerken ayar değişirse çıktı eski ayarla damgalanmasın)
  async function render(it, o) {
    const src = await it.load();
    if (!src) throw new Error(it.name + ': görsel açılamadı.');
    const sw = src.naturalWidth || src.width; const sh = src.naturalHeight || src.height;
    let cw = sw; let ch = sh;
    if (o.ratio !== 'orijinal') {
      const [a, b] = o.ratio.split(':').map(Number);
      if (sw / sh > a / b) cw = Math.round(sh * a / b); else ch = Math.round(sw * b / a);
    }
    const k = +o.width && cw > +o.width ? +o.width / cw : 1;
    const c = document.createElement('canvas');
    c.width = Math.round(cw * k); c.height = Math.round(ch * k);
    const ctx = c.getContext('2d');
    if (o.type === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); } // JPEG saydamlık taşımaz
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, o.type, o.quality / 100));
    if (it.out) URL.revokeObjectURL(it.out.url);
    it.out = { blob, w: c.width, h: c.height, url: URL.createObjectURL(blob) };
  }

  let run = 0;
  async function process() {
    const my = ++run;
    for (const it of items) {
      if (my !== run) return;
      if (it.out && it.outKey === JSON.stringify(opts)) continue;
      const o = Object.assign({}, opts);
      try { await render(it, o); it.outKey = JSON.stringify(o); } catch (err) { toast(err.message, 'error'); continue; }
      const row = view.querySelector(`[data-key="${CSS.escape(it.key)}"]`);
      if (row && my === run) row.outerHTML = outRow(it);
    }
  }

  const fileName = it => `${safeName(it.name.replace(/\.[^.]+$/, '')) || 'gorsel'}_${opts.ratio === 'orijinal' ? 'orijinal' : opts.ratio.replace(':', 'x')}.${FORMATS[opts.type][1]}`;
  const addItem = it => { if (!items.some(x => x.key === it.key)) items.push(it); };

  function addFiles(files) {
    [...files].filter(f => /^image\//.test(f.type)).forEach(f => {
      const url = URL.createObjectURL(f);
      addItem({ key: 'f' + f.name + f.size + f.lastModified, name: f.name, size: f.size, load: () => loadImage(url) });
    });
    draw();
  }

  view.onclick = async e => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; return draw(); }
    const a = e.target.closest('[data-asset]');
    if (a) {
      const as = assets.find(x => x.id === a.dataset.asset);
      const key = 'a' + as.id;
      const i = items.findIndex(x => x.key === key);
      if (i >= 0) items.splice(i, 1); else addItem({ key, name: as.label || as.categoryLabel, size: as.size, load: () => loadImage(as.url) });
      return draw();
    }
    const p = e.target.closest('[data-post]');
    if (p) {
      const post = posts.find(x => x.id === p.dataset.post);
      const on = items.some(x => x.key.startsWith('p' + post.id + ':'));
      if (on) { for (let i = items.length - 1; i >= 0; i--) if (items[i].key.startsWith('p' + post.id + ':')) items.splice(i, 1); }
      else post.data.slides.forEach((s, n) => addItem({ key: `p${post.id}:${n}`, name: `${post.title} ${n + 1}`, size: 0,
        load: async () => { await resolveImages(s); return drawSlide(document.createElement('canvas'), s, formats[post.data.format]); } }));
      return draw();
    }
    const rm = e.target.closest('[data-rm]');
    if (rm) { const i = items.findIndex(x => x.key === rm.dataset.rm); if (i >= 0) items.splice(i, 1); return draw(); }
    if (e.target.closest('[data-clear]')) { items.length = 0; return draw(); }
    const dl = e.target.closest('[data-dl]');
    if (dl) { const it = items.find(x => x.key === dl.dataset.dl); return downloadBlob(it.out.blob, fileName(it)); }
    const z = e.target.closest('[data-zip]');
    if (z) {
      const ready = items.filter(x => x.out && x.outKey === JSON.stringify(opts));
      if (ready.length < items.length) return toast('Görseller hâlâ hazırlanıyor, birazdan tekrar dene.');
      const used = new Map();
      const files = ready.map(it => { let n = fileName(it); const c = used.get(n) || 0; used.set(n, c + 1); if (c) n = n.replace(/(\.\w+)$/, `_${c + 1}$1`); return { name: n, blob: it.out.blob }; });
      downloadBlob(await zipBlob(files), `${safeName(brand.name)}_disa_aktarim.zip`);
    }
  };
  view.onchange = e => {
    if (e.target.id === 'exp-file') return addFiles(e.target.files);
    const map = { 'ex-ratio': 'ratio', 'ex-width': 'width', 'ex-type': 'type', 'ex-q': 'quality' };
    if (!map[e.target.id]) return;
    opts[map[e.target.id]] = e.target.id === 'ex-ratio' || e.target.id === 'ex-type' ? e.target.value : +e.target.value;
    try { localStorage.setItem('ium.export.opts', JSON.stringify(opts)); } catch { /* tercih kaydedilemezse sorun değil */ }
    draw();
  };
  view.oninput = e => { if (e.target.id === 'ex-q') view.querySelector('#ex-qv').textContent = e.target.value; };
  view.ondragover = e => { if (e.target.closest('#exp-drop')) e.preventDefault(); };
  view.ondrop = e => { if (!e.target.closest('#exp-drop')) return; e.preventDefault(); addFiles(e.dataTransfer.files); };
  draw();
}
