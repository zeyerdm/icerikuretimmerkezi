// Post stüdyosu (ilk sürüm): konudan carousel/post üretimi ve katmanlı editör.
// Katmanı tıkla seç, sürükle taşı (ok tuşlarıyla ince ayar); yazı, renk, font, boyut sağ panelden; logo/maskot/görsel kütüphaneden.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState, busy, openModal, errorNotice, timeAgo } from '../ui.js';
import { state, go } from '../app.js';
import { aiModels, modelSelect, busyTimer, aiNote } from '../aiPicker.js';
import { drawSlide, resolveImages, slideBlob, hitTest } from '../postCanvas.js';
import { downloadBlob, safeName } from '../titlePng.js';
import { reviewBox } from './review.js';

const base = brand => `#/m/${encodeURIComponent(brand.id)}/post`;
const uid = () => Math.random().toString(36).slice(2, 10);

export async function renderPosts(view, brand, sub) {
  view.onclick = view.onchange = view.oninput = view.onkeydown = null;
  const models = await aiModels();
  if (sub) return renderEditor(view, brand, sub, models);
  const aiReady = models.ov.providers.some(p => p.configured);
  const { posts } = await api.posts(brand.id);
  const meta = state.meta.posts;
  view.innerHTML = `
    ${pageHead({
      title: 'Post stüdyosu', desc: `${esc(brand.name)} için carousel ve post tasarımları. Metinler marka diliyle yazılır; renk, font, logo ve maskot otomatik uygulanır.`,
      actions: `<button class="btn" data-blank>${icon('plus')}Boş tasarım</button>${aiReady ? `<button class="btn btn-primary" data-new>${icon('sparkle')}Konudan üret</button>` : ''}`
    })}
    ${aiReady ? '' : '<div class="notice mb-4"><div><strong>AI bağlı değil.</strong> Boş tasarımla başlayabilirsin; konudan metin yazdırmak için bir sağlayıcı bağla.</div><a class="btn btn-sm" href="#/ai/modeller">AI bağla</a></div>'}
    ${posts.length ? `<div class="post-grid">${posts.map(p => `
      <a class="card post-card" href="${base(brand)}/${esc(p.id)}">
        <div class="post-thumb"><canvas data-thumb="${esc(p.id)}" aria-hidden="true"></canvas></div>
        <div class="strong truncate">${esc(p.title)}</div>
        <div class="xsmall muted">${esc(p.kindLabel)} · ${p.data.slides.length} slayt · ${timeAgo(p.updatedAt)}</div>
      </a>`).join('')}</div>`
      : emptyState({ icon: 'palette', title: 'Henüz tasarım yok', text: 'Bir konu yaz; carousel slaytları marka renkleri, fontları, logosu ve maskotuyla hazırlansın. Sonra her şeyi düzenleyebilirsin.', action: aiReady ? `<button class="btn btn-primary" data-new>${icon('sparkle')}Konudan üret</button>` : '', card: true })}`;

  // Küçük resimler: ilk slayt
  for (const p of posts) {
    const c = view.querySelector(`[data-thumb="${CSS.escape(p.id)}"]`);
    if (!c) continue;
    resolveImages(p.data.slides[0]).then(() => { if (c.isConnected) drawSlide(c, p.data.slides[0], meta.formats[p.data.format]); });
  }

  view.onclick = e => {
    if (e.target.closest('[data-new]')) {
      return openModal({
        title: 'Konudan üret', submitLabel: 'Üret',
        body: `<div class="form-grid">
          <div class="field full"><label for="pc-topic">Konu *</label><textarea class="textarea" id="pc-topic" name="topic" required maxlength="1000" placeholder="Ör. Sınav haftasında odaklanmak için 5 ipucu"></textarea></div>
          <div class="field"><label for="pc-kind">Tür</label><select class="select" id="pc-kind" name="kind">${Object.entries(meta.kinds).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
          <div class="field"><label for="pc-format">Boyut</label><select class="select" id="pc-format" name="format">${Object.entries(meta.formats).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></div>
          <div class="field"><label for="pc-slides">Slayt sayısı (carousel)</label><input class="input" id="pc-slides" name="slides" type="number" min="3" max="10" value="6"></div>
          <div class="field"><label for="pc-model">Model</label>${modelSelect(models, 'yazim', { id: 'pc-model' })}</div>
        </div>`,
        onSubmit: async (fd, form) => {
          const res = await busyTimer(form.querySelector('[type=submit]'), () => api.createPost(brand.id, { topic: fd.get('topic'), kind: fd.get('kind'), format: fd.get('format'), slides: Number(fd.get('slides')), model: form.querySelector('#pc-model').value || null }));
          toast(aiNote(res.post.ai), 'success', 5000);
          go(base(brand) + '/' + res.post.id);
        }
      });
    }
    if (e.target.closest('[data-blank]')) {
      return openModal({
        title: 'Boş tasarım', submitLabel: 'Oluştur',
        body: `<div class="form-grid">
          <div class="field full"><label for="pb-title">Ad *</label><input class="input" id="pb-title" name="title" required maxlength="120" placeholder="Ör. Yeni menü duyurusu"></div>
          <div class="field"><label for="pb-kind">Tür</label><select class="select" id="pb-kind" name="kind">${Object.entries(meta.kinds).map(([k, v]) => `<option value="${k}" ${k === 'post' ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
          <div class="field"><label for="pb-format">Boyut</label><select class="select" id="pb-format" name="format">${Object.entries(meta.formats).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></div>
        </div>`,
        onSubmit: async fd => { const { post } = await api.createPost(brand.id, { blank: true, title: fd.get('title'), kind: fd.get('kind'), format: fd.get('format') }); go(base(brand) + '/' + post.id); }
      });
    }
  };
}

// ------------------------------------------------------------ Editör
async function renderEditor(view, brand, id, models) {
  const meta = state.meta.posts;
  let post;
  try { post = (await api.post(brand.id, id)).post; } catch (err) { view.innerHTML = errorNotice(err); return; }
  const aiReady = models.ov.providers.some(p => p.configured);
  const driveReady = Boolean(state.settings && state.settings.drive && state.settings.drive.configured && brand.driveFolderId);
  const fontList = [...new Set([brand.fonts.heading, brand.fonts.body, ...state.meta.fonts].filter(Boolean))];
  const palette = [...new Set([brand.colors.primary, ...(brand.colors.secondary || []), ...(brand.colors.backgrounds || []), brand.colors.heading, brand.colors.body, '#ffffff', '#1b1f3b'].filter(Boolean))];
  let data = JSON.parse(JSON.stringify(post.data));
  let current = 0;
  let selected = null;
  let dirty = false;
  let lastAi = null;
  const format = () => meta.formats[data.format];
  const slide = () => data.slides[current];
  const layer = () => slide().layers.find(l => l.id === selected) || null;

  function shell() {
    view.innerHTML = `
      ${pageHead({
        title: post.title,
        desc: `${esc(post.kindLabel)} · ${esc(format().label)}${post.modelLabel ? ` · metin: ${esc(post.modelLabel)}` : ''}`,
        actions: `<a class="btn btn-ghost" href="${base(brand)}">${icon('back')}Tasarımlar</a><button class="btn btn-primary" data-save>Kaydet</button>`
      })}
      ${lastAi ? `<div class="notice notice-ok mb-4"><div>${esc(aiNote(lastAi))}</div></div>` : ''}
      <div class="studio">
        <aside class="card studio-slides">
          <div class="card-head"><h3>Slaytlar</h3><span class="small muted">${data.slides.length}/10</span></div>
          <div id="slide-list" class="slide-list"></div>
          <div class="stack-sm mt-3">
            <button class="btn btn-sm" data-slide-add ${data.slides.length >= 10 ? 'disabled' : ''}>${icon('plus')}Slayt ekle</button>
            <button class="btn btn-sm" data-slide-dup ${data.slides.length >= 10 ? 'disabled' : ''}>Çoğalt</button>
            <div class="row"><button class="btn btn-sm icon-btn" data-slide-move="-1" aria-label="Yukarı taşı">${icon('chevronLeft')}</button><button class="btn btn-sm icon-btn" data-slide-move="1" aria-label="Aşağı taşı">${icon('chevronRight')}</button>
              <button class="btn btn-sm btn-ghost" data-slide-del ${data.slides.length <= 1 ? 'disabled' : ''}>${icon('trash')}Sil</button></div>
          </div>
        </aside>
        <section class="studio-stage">
          <div class="card stage-card">
            <div class="stage-wrap"><canvas id="stage" tabindex="0" aria-label="Slayt ${current + 1}; katman seçmek için tıkla, taşımak için sürükle, ince ayar için ok tuşları"></canvas></div>
            <div class="row mt-3">
              <button class="btn btn-sm" data-add="text">${icon('plus')}Metin</button>
              <button class="btn btn-sm" data-add="image">${icon('image')}Görsel / maskot</button>
              <button class="btn btn-sm" data-add="shape">Şekil</button>
              <span class="spacer"></span>
              <label class="small muted" for="slide-bg">Zemin</label><input type="color" id="slide-bg" value="${esc(slide().bg)}" aria-label="Slayt zemin rengi">
            </div>
          </div>
          <section class="card mt-4">
            <div class="card-head"><h3>Açıklama ve hashtag</h3></div>
            <div class="field"><label for="pc-caption">Instagram açıklaması</label><textarea class="textarea" id="pc-caption" rows="5" maxlength="3000">${esc(data.caption || '')}</textarea></div>
            <div class="field mt-3"><label for="pc-tags">Hashtag'ler</label><input class="input" id="pc-tags" value="${esc((data.hashtags || []).join(' '))}" maxlength="400"></div>
            <div id="pc-review" class="mt-3"></div>
          </section>
        </section>
        <aside class="stack studio-panel">
          <section class="card" id="layer-panel"></section>
          ${aiReady ? `<section class="card"><div class="card-head"><h3>Metni yeniden yaz</h3></div>
            <p class="card-text mb-3">Bütün slayt metinleri seçtiğin modelle yeniden yazılır; yerleşim marka şablonuyla baştan kurulur.</p>
            <div class="stack-sm">${modelSelect(models, 'yazim', { id: 'pw-model' })}<button class="btn" data-rewrite>${icon('refresh')}Yeniden yaz</button></div></section>` : ''}
          <section class="card"><div class="card-head"><h3>Dışa aktar</h3></div>
            <div class="stack-sm">
              <button class="btn" data-png="one">Bu slaytı PNG indir</button>
              <button class="btn" data-png="all" ${data.slides.length > 1 ? '' : 'hidden'}>Bütün slaytları indir</button>
              ${driveReady ? `<button class="btn" data-drive="one">Bu slaytı Drive'a gönder</button><button class="btn" data-drive="all" ${data.slides.length > 1 ? '' : 'hidden'}>Bütün slaytları Drive'a gönder</button>` : ''}
              ${post.content ? `<a class="btn" href="#/m/${esc(brand.id)}/takvim">${icon('calendar')}Takvimde</a>` : `<button class="btn" data-schedule>${icon('calendar')}Takvime ekle</button>`}
            </div></section>
          <section class="card"><button class="btn btn-danger w-full" data-delete>${icon('trash')}Tasarımı sil</button></section>
        </aside>
      </div>`;
    reviewBox(view.querySelector('#pc-review'), brand, models, () => `${view.querySelector('#pc-caption').value}\n\n${view.querySelector('#pc-tags').value}`, 'caption',
      improved => { view.querySelector('#pc-caption').value = improved; data.caption = improved; markDirty(); });
    wireStage();
    redraw();
  }

  function markDirty() { dirty = true; const b = view.querySelector('[data-save]'); if (b) b.textContent = 'Kaydet •'; }

  async function redraw() {
    const s = slide();
    await resolveImages(s);
    const c = view.querySelector('#stage');
    if (!c) return;
    drawSlide(c, s, format(), { selectedId: selected });
    drawList();
    drawPanel();
  }

  function drawList() {
    const list = view.querySelector('#slide-list');
    list.innerHTML = data.slides.map((s, i) => `<button class="slide-thumb ${i === current ? 'active' : ''}" data-slide="${i}" aria-label="Slayt ${i + 1}" aria-current="${i === current}"><canvas></canvas><span>${i + 1}</span></button>`).join('');
    list.querySelectorAll('canvas').forEach((c, i) => resolveImages(data.slides[i]).then(() => drawSlide(c, data.slides[i], format())));
  }

  function drawPanel() {
    const p = view.querySelector('#layer-panel');
    const l = layer();
    if (!l) {
      p.innerHTML = `<div class="card-head"><h3>Katman</h3></div><p class="card-text">Düzenlemek için slayttaki bir yazıya, görsele ya da şekle tıkla. Sürükleyerek taşıyabilir, ok tuşlarıyla (Shift ile 10 kat) ince ayar yapabilirsin.</p>`;
      return;
    }
    const swatches = (key, value) => `<div class="swatch-row">${palette.map(c => `<button type="button" class="swatch-btn ${c === value ? 'on' : ''}" style="background:${esc(c)}" data-swatch="${key}" data-color="${esc(c)}" aria-label="${esc(c)}"></button>`).join('')}<input type="color" data-prop="${key}" value="${esc(value)}" aria-label="Özel renk"></div>`;
    p.innerHTML = `<div class="card-head"><h3>${l.type === 'text' ? 'Metin' : l.type === 'image' ? 'Görsel' : 'Şekil'}</h3>
      <div class="row"><button class="btn btn-sm icon-btn btn-ghost" data-order="-1" aria-label="Geri gönder" title="Geri gönder">${icon('chevronLeft')}</button><button class="btn btn-sm icon-btn btn-ghost" data-order="1" aria-label="Öne getir" title="Öne getir">${icon('chevronRight')}</button><button class="btn btn-sm icon-btn btn-ghost" data-layer-del aria-label="Katmanı sil">${icon('trash')}</button></div></div>
      <div class="stack-sm">
      ${l.type === 'text' ? `
        <div class="field"><label for="lp-text">Yazı</label><textarea class="textarea" id="lp-text" data-prop="text" rows="4" maxlength="1000">${esc(l.text)}</textarea></div>
        <div class="form-grid">
          <div class="field"><label for="lp-size">Boyut</label><input class="input" id="lp-size" type="number" min="10" max="300" data-prop="size" value="${l.size}"></div>
          <div class="field"><label for="lp-w">Genişlik</label><input class="input" id="lp-w" type="number" min="40" max="2000" data-prop="w" value="${l.w}"></div>
          <div class="field"><label for="lp-font">Font</label><select class="select" id="lp-font" data-prop="font">${fontList.map(f => `<option ${f === l.font ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
          <div class="field"><label for="lp-weight">Kalınlık</label><select class="select" id="lp-weight" data-prop="weight">${[400, 500, 600, 700, 800, 900].map(w => `<option value="${w}" ${w === l.weight ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
        </div>
        <div class="field"><span class="field-label">Hizalama</span><div class="seg">${[['left', 'Sol'], ['center', 'Orta'], ['right', 'Sağ']].map(([k, v]) => `<button type="button" data-align="${k}" class="${l.align === k ? 'active' : ''}">${v}</button>`).join('')}</div></div>
        <div class="field"><span class="field-label">Renk</span>${swatches('color', l.color)}</div>`
      : l.type === 'image' ? `
        <div class="form-grid"><div class="field"><label for="lp-iw">Genişlik</label><input class="input" id="lp-iw" type="number" min="10" max="4000" data-prop="w" value="${l.w}"></div>
          <div class="field"><label for="lp-ih">Yükseklik</label><input class="input" id="lp-ih" type="number" min="10" max="4000" data-prop="h" value="${l.h}"></div></div>
        <button class="btn btn-sm" data-replace-image>Görseli değiştir</button>`
      : `<div class="form-grid"><div class="field"><label for="lp-sw">Genişlik</label><input class="input" id="lp-sw" type="number" min="1" max="4000" data-prop="w" value="${l.w}"></div>
          <div class="field"><label for="lp-sh">Yükseklik</label><input class="input" id="lp-sh" type="number" min="1" max="4000" data-prop="h" value="${l.h}"></div>
          <div class="field"><label for="lp-r">Köşe</label><input class="input" id="lp-r" type="number" min="0" max="1000" data-prop="radius" value="${l.radius || 0}"></div></div>
        <div class="field"><span class="field-label">Renk</span>${swatches('color', l.color)}</div>`}
      <div class="form-grid"><div class="field"><label for="lp-x">X</label><input class="input" id="lp-x" type="number" data-prop="x" value="${l.x}"></div><div class="field"><label for="lp-y">Y</label><input class="input" id="lp-y" type="number" data-prop="y" value="${l.y}"></div></div>
      </div>`;
  }

  // Tuval: tıklayınca seç, sürükleyince taşı, ok tuşlarıyla kaydır
  function wireStage() {
    const c = view.querySelector('#stage');
    let drag = null;
    const point = e => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }; };
    c.addEventListener('pointerdown', e => {
      const p = point(e);
      const hit = hitTest(c, slide(), p.x, p.y);
      selected = hit ? hit.id : null;
      if (hit) { drag = { id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y, moved: false }; c.setPointerCapture(e.pointerId); }
      c.focus();
      redraw();
    });
    c.addEventListener('pointermove', e => {
      if (!drag) return;
      const p = point(e);
      const l = slide().layers.find(x => x.id === drag.id);
      l.x = Math.round(p.x - drag.dx); l.y = Math.round(p.y - drag.dy);
      drag.moved = true;
      drawSlide(c, slide(), format(), { selectedId: selected });
    });
    const end = () => { if (drag && drag.moved) { markDirty(); redraw(); } drag = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('dblclick', () => { const t = view.querySelector('#lp-text'); if (t) t.focus(); });
    c.addEventListener('keydown', e => {
      const l = layer();
      if (!l) return;
      const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (k) { e.preventDefault(); const s = e.shiftKey ? 10 : 1; l.x += k[0] * s; l.y += k[1] * s; markDirty(); redraw(); }
      if (e.key === 'Delete') { slide().layers = slide().layers.filter(x => x.id !== l.id); selected = null; markDirty(); redraw(); }
    });
  }

  function pickAsset(onPick) {
    api.assets(brand.id).then(({ assets }) => {
      const m = openModal({
        title: 'Kütüphaneden görsel', submitLabel: 'Kapat',
        body: assets.length ? `<div class="asset-grid">${assets.map(a => `<button type="button" class="asset asset-pick" data-pick="${esc(a.id)}"><div class="thumb"><img src="${esc(a.url)}" alt=""></div><div class="meta small">${esc(a.label || a.categoryLabel)}</div></button>`).join('')}</div>`
          : emptyState({ icon: 'image', title: 'Kütüphane boş', text: `<a class="link" href="#/m/${esc(brand.id)}/kutuphane">Kütüphaneye</a> logo, maskot pozu veya görsel yükle.`, compact: true }),
        onSubmit: async () => {}
      });
      m.form.addEventListener('click', e => {
        const b = e.target.closest('[data-pick]');
        if (!b) return;
        onPick(assets.find(a => a.id === b.dataset.pick));
        m.close();
      });
    }).catch(err => toast(err.message, 'error'));
  }

  async function exportSlides(which, to) {
    const list = which === 'all' ? data.slides.map((s, i) => [s, i]) : [[slide(), current]];
    for (const [s, i] of list) {
      const blob = await slideBlob(s, format());
      const name = `${post.title} ${list.length > 1 || data.slides.length > 1 ? `slayt ${i + 1}` : ''}`.trim();
      if (to === 'drive') await api.driveUpload(brand.id, blob, name, 'image/png');
      else downloadBlob(blob, `${safeName(name)}.png`);
    }
  }

  view.oninput = e => {
    const t = e.target;
    if (t.id === 'pc-caption') { data.caption = t.value; markDirty(); return; }
    if (t.id === 'pc-tags') { data.hashtags = t.value.split(/[\s,]+/).filter(Boolean).map(h => h.replace(/^#?/, '#')); markDirty(); return; }
    if (t.id === 'slide-bg') { slide().bg = t.value; markDirty(); drawSlide(view.querySelector('#stage'), slide(), format(), { selectedId: selected }); return; }
    const prop = t.dataset.prop;
    const l = layer();
    if (!prop || !l) return;
    l[prop] = ['text', 'font', 'color'].includes(prop) ? t.value : Number(t.value);
    markDirty();
    drawSlide(view.querySelector('#stage'), slide(), format(), { selectedId: selected });
  };
  view.onchange = e => { if (e.target.dataset.prop || e.target.id === 'slide-bg') redraw(); };

  view.onclick = async e => {
    const t = e.target;
    const s = t.closest('[data-slide]');
    if (s) { current = Number(s.dataset.slide); selected = null; view.querySelector('#slide-bg').value = slide().bg; return redraw(); }
    if (t.closest('[data-slide-add]')) { data.slides.splice(current + 1, 0, { bg: (brand.colors.backgrounds || [])[0] || '#ffffff', layers: [] }); current++; selected = null; markDirty(); return shell(); }
    if (t.closest('[data-slide-dup]')) { const copy = JSON.parse(JSON.stringify(slide())); copy.layers.forEach(l => { l.id = uid(); }); data.slides.splice(current + 1, 0, copy); current++; markDirty(); return shell(); }
    if (t.closest('[data-slide-del]')) { if (!confirm('Bu slayt silinsin mi?')) return; data.slides.splice(current, 1); current = Math.max(0, current - 1); selected = null; markDirty(); return shell(); }
    const mv = t.closest('[data-slide-move]');
    if (mv) { const j = current + Number(mv.dataset.slideMove); if (j < 0 || j >= data.slides.length) return; [data.slides[current], data.slides[j]] = [data.slides[j], data.slides[current]]; current = j; markDirty(); return redraw(); }
    const add = t.closest('[data-add]');
    if (add) {
      const F = format();
      if (add.dataset.add === 'text') { const l = { id: uid(), type: 'text', role: 'text', text: 'Yeni metin', x: 90, y: Math.round(F.h / 2), w: 800, size: 56, color: brand.colors.heading || '#1b1f3b', font: brand.fonts.heading || 'Poppins', weight: 700, align: 'left' }; slide().layers.push(l); selected = l.id; markDirty(); return redraw(); }
      if (add.dataset.add === 'shape') { const l = { id: uid(), type: 'shape', shape: 'rect', x: 90, y: 90, w: 300, h: 300, color: brand.colors.primary || '#5b55e6', radius: 24 }; slide().layers.push(l); selected = l.id; markDirty(); return redraw(); }
      return pickAsset(a => { const l = { id: uid(), type: 'image', src: a.url, assetId: a.id, x: 120, y: 120, w: 420, h: 420 }; slide().layers.push(l); selected = l.id; markDirty(); redraw(); });
    }
    const sw = t.closest('[data-swatch]');
    if (sw && layer()) { layer()[sw.dataset.swatch] = sw.dataset.color; markDirty(); return redraw(); }
    const al = t.closest('[data-align]');
    if (al && layer()) { layer().align = al.dataset.align; markDirty(); return redraw(); }
    const ord = t.closest('[data-order]');
    if (ord && layer()) { const arr = slide().layers; const i = arr.findIndex(x => x.id === selected); const j = i + Number(ord.dataset.order); if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; markDirty(); return redraw(); }
    if (t.closest('[data-layer-del]')) { slide().layers = slide().layers.filter(x => x.id !== selected); selected = null; markDirty(); return redraw(); }
    if (t.closest('[data-replace-image]') && layer()) return pickAsset(a => { Object.assign(layer(), { src: a.url, assetId: a.id }); markDirty(); redraw(); });
    const save = t.closest('[data-save]');
    if (save) {
      try { post = (await busy(save, () => api.savePost(brand.id, post.id, { data }))).post; data = JSON.parse(JSON.stringify(post.data)); dirty = false; toast('Tasarım kaydedildi.', 'success'); shell(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const rw = t.closest('[data-rewrite]');
    if (rw) {
      if (dirty && !confirm('Kaydedilmemiş değişiklikler var; yeniden yazınca yerleşim de baştan kurulur. Devam edilsin mi?')) return;
      try { const res = await busyTimer(rw, () => api.rewritePost(brand.id, post.id, { model: (view.querySelector('#pw-model') || {}).value || null })); post = res.post; lastAi = res.post.ai; data = JSON.parse(JSON.stringify(post.data)); current = 0; selected = null; dirty = false; shell(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const png = t.closest('[data-png]');
    if (png) return busy(png, () => exportSlides(png.dataset.png, 'download')).catch(err => toast(err.message, 'error'));
    const dr = t.closest('[data-drive]');
    if (dr) { try { await busy(dr, () => exportSlides(dr.dataset.drive, 'drive')); toast('Google Drive klasörüne gönderildi.', 'success'); } catch (err) { toast(err.message, 'error'); } return; }
    const sch = t.closest('[data-schedule]');
    if (sch) {
      const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0);
      try { await busy(sch, () => api.schedulePost(brand.id, post.id, d.toISOString())); post = (await api.post(brand.id, post.id)).post; toast('Takvime yarın 12:00 için eklendi; takvimden tarihini değiştirebilirsin.', 'success', 5000); shell(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (t.closest('[data-delete]')) {
      if (!confirm(`"${post.title}" tasarımı silinsin mi?`)) return;
      try { await api.deletePost(brand.id, post.id); toast('Tasarım silindi.', 'success'); go(base(brand)); } catch (err) { toast(err.message, 'error'); }
    }
  };
  shell();
}
