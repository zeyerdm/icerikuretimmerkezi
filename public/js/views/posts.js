// Post stüdyosu (ilk sürüm): konudan carousel/post üretimi ve katmanlı editör.
// Katmanı tıkla seç, sürükle taşı (ok tuşlarıyla ince ayar); yazı, renk, font, boyut sağ panelden; logo/maskot/görsel kütüphaneden.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState, busy, openModal, errorNotice, timeAgo } from '../ui.js';
import { state, go } from '../app.js';
import { aiModels, modelSelect, busyTimer, streamBusy, aiNote } from '../aiPicker.js';
import { drawSlide, resolveImages, slideBlob, hitTest } from '../postCanvas.js';
import { downloadBlob, safeName, drawTitle, ensureTitleFonts } from '../titlePng.js';
import { reviewBox } from './review.js';
import { youtubePreview } from './youtube.js';

const base = brand => `#/m/${encodeURIComponent(brand.id)}/post`;
const uid = () => Math.random().toString(36).slice(2, 10);

export async function renderPosts(view, brand, sub) {
  view.onclick = view.onchange = view.oninput = view.onkeydown = null;
  const models = await aiModels();
  if (sub === 'izgara') return renderGrid(view, brand);
  if (sub) return renderEditor(view, brand, sub, models);
  const aiReady = models.ov.providers.some(p => p.configured);
  const [{ posts }, { templates }, { templates: sharedTpls }] = await Promise.all([api.posts(brand.id), api.postTemplates(brand.id), api.sharedTemplates(brand.id)]);
  const meta = state.meta.posts;
  view.innerHTML = `
    ${pageHead({
      title: 'Post stüdyosu', desc: `${esc(brand.name)} için post, carousel, story, Reels kapağı, reklam ve bilgi grafiği tasarımları. Metinler marka diliyle yazılır; renk, font, logo ve maskot otomatik uygulanır.`,
      actions: `<a class="btn btn-ghost" href="${base(brand)}/izgara">${icon('grid')}Izgara önizlemesi</a><button class="btn" data-blank>${icon('plus')}Boş tasarım</button>${aiReady ? `<button class="btn" data-ref>${icon('image')}Referanstan şablon</button><button class="btn btn-primary" data-new>${icon('sparkle')}Konudan üret</button>` : ''}`
    })}
    ${aiReady ? '' : '<div class="notice mb-4"><div><strong>AI bağlı değil.</strong> Boş tasarımla başlayabilirsin; konudan metin yazdırmak için bir sağlayıcı bağla.</div><a class="btn btn-sm" href="#/ai/modeller">AI bağla</a></div>'}
    ${posts.length ? `<div class="post-grid">${posts.map(p => `
      <a class="card post-card" href="${base(brand)}/${esc(p.id)}">
        <div class="post-thumb"><canvas data-thumb="${esc(p.id)}" aria-hidden="true"></canvas></div>
        <div class="strong truncate">${esc(p.title)}</div>
        <div class="xsmall muted">${esc(p.kindLabel)} · ${p.data.slides.length} slayt · ${timeAgo(p.updatedAt)}</div>
      </a>`).join('')}</div>`
      : emptyState({ icon: 'palette', title: 'Henüz tasarım yok', text: 'Bir konu yaz; carousel slaytları marka renkleri, fontları, logosu ve maskotuyla hazırlansın. Sonra her şeyi düzenleyebilirsin.', action: aiReady ? `<button class="btn btn-primary" data-new>${icon('sparkle')}Konudan üret</button>` : '', card: true })}`;

  if (templates.length) {
    view.insertAdjacentHTML('beforeend', `<section class="card mt-4"><div class="card-head"><h3>Şablonlar</h3><span class="small muted">${templates.length}</span></div>
      <div class="post-grid">${templates.map(t => `<div class="post-card tpl-card">
        <div class="post-thumb"><canvas data-tpl-thumb="${esc(t.id)}" aria-hidden="true"></canvas></div>
        <div class="strong truncate">${esc(t.name)}</div><div class="xsmall muted">${esc(t.kindLabel)}</div>
        <div class="row mt-2"><button class="btn btn-sm" data-use-tpl="${esc(t.id)}">Bu şablonla başla</button><button class="btn btn-sm btn-ghost icon-btn" data-del-tpl="${esc(t.id)}" aria-label="Şablonu sil">${icon('trash')}</button></div>
      </div>`).join('')}</div></section>`);
    for (const t of templates) {
      const c = view.querySelector(`[data-tpl-thumb="${CSS.escape(t.id)}"]`);
      if (c && t.data.slides) resolveImages(t.data.slides[0]).then(() => { if (c.isConnected) drawSlide(c, t.data.slides[0], meta.formats[t.data.format]); });
    }
  }

  // Ortak şablon kütüphanesi: bütün markalarda kullanılır; önizleme bu markanın renk, font, logo ve maskotuyla
  view.insertAdjacentHTML('beforeend', `<section class="card mt-4"><div class="card-head"><h3>Ortak şablon kütüphanesi</h3><span class="small muted">${sharedTpls.length} · bütün markalarda</span></div>
    ${sharedTpls.length ? `<p class="small muted mb-3">Önizlemeler ${esc(brand.name)} markasının renkleri, yazı tipleri, logosu ve maskotuyla gösteriliyor.</p><div class="post-grid">${sharedTpls.map(t => `<div class="post-card tpl-card">
      <div class="post-thumb"><canvas data-shared-thumb="${esc(t.id)}" aria-hidden="true"></canvas></div>
      <div class="strong truncate">${esc(t.name)}</div><div class="xsmall muted">${esc(t.kindLabel)}${t.sourceBrandName ? ` · ${esc(t.sourceBrandName)} markasından` : ''}</div>
      <div class="row mt-2"><button class="btn btn-sm" data-use-shared="${esc(t.id)}">Bu markada kullan</button><button class="btn btn-sm btn-ghost icon-btn" data-del-shared="${esc(t.id)}" aria-label="Ortak şablonu sil">${icon('trash')}</button></div>
    </div>`).join('')}</div>` : '<p class="card-text">Henüz ortak şablon yok. Bir tasarımın düzenleyicisinde Dosya → "Ortak şablon kütüphanesine kaydet" ile ekle; sonra her markada o markanın kimliğiyle kullanılır.</p>'}</section>`);
  for (const t of sharedTpls) {
    const c = view.querySelector(`[data-shared-thumb="${CSS.escape(t.id)}"]`);
    if (c && t.data) resolveImages(t.data.slides[0]).then(() => { if (c.isConnected) drawSlide(c, t.data.slides[0], meta.formats[t.data.format]); });
  }

  // Küçük resimler: ilk slayt
  for (const p of posts) {
    const c = view.querySelector(`[data-thumb="${CSS.escape(p.id)}"]`);
    if (!c) continue;
    resolveImages(p.data.slides[0]).then(() => { if (c.isConnected) drawSlide(c, p.data.slides[0], meta.formats[p.data.format]); });
  }

  // Tür seçilince boyut o türün varsayılanına geçer; slayt sayısı yalnız carousel'de görünür
  const wireKind = m => {
    const k = m.form.querySelector('[name=kind]');
    const f = m.form.querySelector('[name=format]');
    const sl = m.form.querySelector('[data-slides-field]');
    const sync = () => { if (f) f.value = meta.kindDefaults[k.value].format; if (sl) sl.hidden = k.value !== 'carousel'; };
    k.addEventListener('change', sync);
    sync();
  };
  view.onclick = async e => {
    const useTpl = e.target.closest('[data-use-tpl]');
    if (useTpl) {
      const t = templates.find(x => x.id === useTpl.dataset.useTpl);
      try { const { post } = await api.createPost(brand.id, { blank: true, templateId: t.id, title: t.name }); go(base(brand) + '/' + post.id); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const useSh = e.target.closest('[data-use-shared]');
    if (useSh) {
      try { const { post } = await api.useSharedTemplate(brand.id, useSh.dataset.useShared); go(base(brand) + '/' + post.id); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const delSh = e.target.closest('[data-del-shared]');
    if (delSh) {
      if (!confirm('Ortak şablon bütün markalardan kaldırılsın mı? Ondan oluşturulan tasarımlar etkilenmez.')) return;
      try { await api.deleteSharedTemplate(delSh.dataset.delShared); renderPosts(view, brand, null); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const delTpl = e.target.closest('[data-del-tpl]');
    if (delTpl) {
      if (!confirm('Şablon silinsin mi? Ondan oluşturulan tasarımlar etkilenmez.')) return;
      try { await api.deleteTemplate(brand.id, delTpl.dataset.delTpl); renderPosts(view, brand, null); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (e.target.closest('[data-ref]')) return referenceFlow(brand, models, () => renderPosts(view, brand, null));
    if (e.target.closest('[data-new]')) {
      const m = openModal({
        title: 'Konudan üret', submitLabel: 'Üret',
        body: `<div class="form-grid">
          <div class="field full"><label for="pc-topic">Konu *</label><textarea class="textarea" id="pc-topic" name="topic" required maxlength="1000" placeholder="Ör. Sınav haftasında odaklanmak için 5 ipucu"></textarea></div>
          <div class="field"><label for="pc-kind">Tür</label><select class="select" id="pc-kind" name="kind">${Object.entries(meta.kinds).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
          <div class="field"><label for="pc-format">Boyut</label><select class="select" id="pc-format" name="format">${Object.entries(meta.formats).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></div>
          <div class="field" data-slides-field><label for="pc-slides">Slayt sayısı (carousel)</label><input class="input" id="pc-slides" name="slides" type="number" min="3" max="10" value="6"></div>
          <div class="field"><label for="pc-model">Model</label>${modelSelect(models, 'yazim', { id: 'pc-model' })}</div>
        </div>`,
        onSubmit: async (fd, form) => {
          const res = await streamBusy(form.querySelector('[type=submit]'), st => api.createPost(brand.id, { topic: fd.get('topic'), kind: fd.get('kind'), format: fd.get('format'), slides: Number(fd.get('slides')), model: form.querySelector('#pc-model').value || null }, st));
          toast(aiNote(res.post.ai), 'success', 5000);
          go(base(brand) + '/' + res.post.id);
        }
      });
      return wireKind(m);
    }
    if (e.target.closest('[data-blank]')) {
      const m = openModal({
        title: 'Boş tasarım', submitLabel: 'Oluştur',
        body: `<div class="form-grid">
          <div class="field full"><label for="pb-title">Ad *</label><input class="input" id="pb-title" name="title" required maxlength="120" placeholder="Ör. Yeni menü duyurusu"></div>
          <div class="field"><label for="pb-kind">Tür</label><select class="select" id="pb-kind" name="kind">${Object.entries(meta.kinds).map(([k, v]) => `<option value="${k}" ${k === 'post' ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
          <div class="field"><label for="pb-format">Boyut</label><select class="select" id="pb-format" name="format">${Object.entries(meta.formats).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></div>
          ${templates.length ? `<div class="field full"><label for="pb-tpl">Şablon (isteğe bağlı)</label><select class="select" id="pb-tpl" name="templateId"><option value="">Marka şablonuyla boş başla</option>${templates.map(t => `<option value="${esc(t.id)}">${esc(t.name)} · ${esc(t.kindLabel)}</option>`).join('')}</select></div>` : ''}
        </div>`,
        onSubmit: async fd => { const { post } = await api.createPost(brand.id, { blank: true, title: fd.get('title'), kind: fd.get('kind'), format: fd.get('format'), templateId: fd.get('templateId') || null }); go(base(brand) + '/' + post.id); }
      });
      return wireKind(m);
    }
  };
}

// ------------------------------------------------------------ Instagram ızgara önizlemesi
// Takvimdeki tasarımlar ve Reels, en yenisi sol üstte olacak şekilde profil ızgarasında (3 sütun, 4:5 hücre) gösterilir.
// 9:16 tasarımlar ve Reels kapakları Instagram'daki gibi ortadan kırpılır. Reels'in kapak tasarımı yoksa ekran başlığı
// marka renginde kapak gibi çizilir. Takvimde olmayan tasarımlar istenirse "taslak" olarak en üste eklenir.
async function renderGrid(view, brand) {
  view.onclick = view.onchange = null;
  const meta = state.meta.posts;
  let withDrafts = false;
  try { withDrafts = localStorage.getItem('ium.grid.drafts') === '1'; } catch { /* varsayılan */ }
  const [{ posts }, { reels }, { contents }, logos] = await Promise.all([api.posts(brand.id), api.reelsList(brand.id), api.contents({ brandId: brand.id }), api.assets(brand.id, 'logo')]);
  const logo = logos.assets[0];
  // YouTube kapakları Instagram ızgarasına girmez
  const igPosts = posts.filter(p => p.kind !== 'youtube');
  const postById = new Map(igPosts.map(p => [p.id, p]));
  const reelsById = new Map(reels.map(r => [r.id, r]));

  function items() {
    const sched = contents.filter(c => (c.postId && postById.has(c.postId)) || (c.reelsId && reelsById.has(c.reelsId)))
      .sort((a, b) => new Date(b.scheduledAt || 0) - new Date(a.scheduledAt || 0))
      .map(c => ({ key: c.id, when: c.scheduledAt, status: c.statusLabel, post: c.postId ? postById.get(c.postId) : null, reels: c.reelsId ? reelsById.get(c.reelsId) : null, title: c.title }));
    if (!withDrafts) return sched;
    const used = new Set(sched.filter(x => x.post).map(x => x.post.id));
    const drafts = igPosts.filter(p => !used.has(p.id)).map(p => ({ key: 'd' + p.id, when: null, status: 'Taslak', post: p, title: p.title, draft: true }));
    return drafts.concat(sched);
  }

  function draw() {
    const list = items();
    view.innerHTML = `
      ${pageHead({ title: 'Izgara önizlemesi', desc: 'Planlanan gönderilerin Instagram profilinde nasıl duracağı (en yeni sol üstte). Renk dengesi ve tekrar eden düzenleri paylaşmadan önce gör.',
        actions: `<label class="check"><input type="checkbox" id="gr-drafts" ${withDrafts ? 'checked' : ''}> Takvimde olmayan tasarımları da göster</label><a class="btn btn-ghost" href="${base(brand)}">${icon('back')}Post stüdyosu</a>` })}
      <div class="ig-phone">
        <div class="ig-head">${logo ? `<img class="ig-avatar" src="${esc(logo.url)}" alt="">` : `<div class="ig-avatar ig-avatar-txt" style="background:${esc(brand.colors.primary || '#5b55e6')}">${esc(brand.name.charAt(0))}</div>`}
          <div><div class="strong">${esc(brand.name)}</div><div class="xsmall muted">${esc(brand.slogan || brand.sector || '')}</div><div class="xsmall">${list.length} gönderi</div></div></div>
        ${list.length ? `<div class="ig-grid">${list.map(x => `<a class="ig-cell ${x.draft ? 'is-draft' : ''}" href="${x.post ? `${base(brand)}/${esc(x.post.id)}` : `#/m/${esc(brand.id)}/reels/${esc(x.reels.id)}`}" title="${esc(x.title)}${x.when ? ' · ' + esc(new Date(x.when).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })) : ''} · ${esc(x.status)}">
            <canvas data-cell="${esc(x.key)}" width="1080" height="1350"></canvas>
            ${x.reels ? `<span class="ig-badge">${icon('film')}</span>` : x.post && x.post.data.slides.length > 1 ? `<span class="ig-badge">${icon('grid')}</span>` : ''}
            <span class="ig-date">${x.draft ? 'taslak' : x.when ? esc(new Date(x.when).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })) : 'tarihsiz'}</span></a>`).join('')}</div>`
          : `<div class="p-4">${emptyState({ icon: 'grid', title: 'Izgarada gösterilecek gönderi yok', text: 'Post stüdyosundaki tasarımları ya da Reels senaryolarını takvime ekledikçe burada sıralanır. Yukarıdaki kutuyla takvimde olmayan tasarımları da görebilirsin.', compact: true })}</div>`}
      </div>`;
    list.forEach(x => drawCell(x));
  }

  // Hücre: tasarımın ilk slaytı ya da Reels kapağı, 4:5'e ortadan kırpılmış (cover)
  async function drawCell(x) {
    const c = view.querySelector(`[data-cell="${CSS.escape(x.key)}"]`);
    if (!c) return;
    const ctx = c.getContext('2d');
    const src = document.createElement('canvas');
    if (x.post) {
      const F = meta.formats[x.post.data.format];
      await resolveImages(x.post.data.slides[0]);
      drawSlide(src, x.post.data.slides[0], F);
    } else {
      src.width = 1080; src.height = 1920;
      const s = src.getContext('2d');
      s.fillStyle = brand.colors.primary || '#5b55e6'; s.fillRect(0, 0, 1080, 1920);
      await ensureTitleFonts();
      const t = drawTitle(document.createElement('canvas'), { title: x.reels.screenTitle || x.reels.title, keyword: '', style: 'marka', colors: brand.colors });
      s.drawImage(t, 0, 0);
    }
    if (!c.isConnected) return;
    const k = Math.max(1080 / src.width, 1350 / src.height);
    const w = src.width * k; const h = src.height * k;
    ctx.drawImage(src, (1080 - w) / 2, (1350 - h) / 2, w, h);
  }

  view.onchange = e => {
    if (e.target.id !== 'gr-drafts') return;
    withDrafts = e.target.checked;
    try { localStorage.setItem('ium.grid.drafts', withDrafts ? '1' : '0'); } catch { /* tercih kaydedilemezse sorun değil */ }
    draw();
  };
  draw();
}

// ------------------------------------------------------------ Tasarım referansı → şablon
// Örnek tasarım (kütüphanedeki "Tasarım referansı" görselleri ya da yeni yüklenen) görseli okuyabilen modelle incelenir;
// renk paleti, font önerisi ve yerleşim çıkarılıp düzenlenebilir şablon olarak kaydedilir.
async function referenceFlow(brand, models, refresh) {
  let refs;
  try { refs = (await api.assets(brand.id, 'reference')).assets; } catch (err) { return toast(err.message, 'error'); }
  let picked = refs[0] ? refs[0].id : null;
  const m = openModal({
    title: 'Referanstan şablon', submitLabel: 'İncele ve şablona çevir',
    body: `<p class="small muted mb-3">Beğendiğin bir tasarımın ekran görüntüsünü seç ya da yükle. Model renk paletini, font benzerlerini ve yerleşimi çıkarır; metinler kopyalanmaz, görsel alanlarına markanın kendi logo ve maskotu konur.</p>
      <div class="asset-grid" id="ref-grid">${refs.map(a => `<button type="button" class="asset asset-pick ${a.id === picked ? 'is-picked' : ''}" data-ref-pick="${esc(a.id)}"><div class="thumb"><img src="${esc(a.url)}" alt=""></div><div class="meta small">${esc(a.label || 'Referans')}</div></button>`).join('')}</div>
      <label class="btn btn-sm mt-3">${icon('upload')}Yeni referans yükle<input type="file" id="ref-file" accept="image/png,image/jpeg,image/webp" class="sr-only"></label>
      <div class="form-grid mt-3">
        <div class="field"><label for="ref-name">Şablon adı</label><input class="input" id="ref-name" name="name" maxlength="80" placeholder="Ör. Minimal duyuru"></div>
        <div class="field"><label for="ref-model">Model (görseli okuyabilen)</label>${modelSelect(models, 'yazim', { id: 'ref-model' })}</div>
      </div>
      <p class="xsmall muted mt-1">Claude, GPT-5, Gemini ve görsel destekli OpenRouter modelleri görseli okur.</p>`,
    onSubmit: async (fd, form) => {
      if (!picked) throw new Error('Önce bir referans görsel seç ya da yükle.');
      const res = await busyTimer(form.querySelector('[type=submit]'), () => api.analyzeDesign(brand.id, { assetId: picked, name: fd.get('name'), model: form.querySelector('#ref-model').value || null }), 'İnceliyor');
      showResult(res);
    }
  });
  m.form.addEventListener('click', e => {
    const b = e.target.closest('[data-ref-pick]');
    if (!b) return;
    picked = b.dataset.refPick;
    m.form.querySelectorAll('[data-ref-pick]').forEach(x => x.classList.toggle('is-picked', x === b));
  });
  m.form.querySelector('#ref-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { asset } = await api.uploadAsset(brand.id, file, 'reference', file.name.replace(/\.[^.]+$/, '').slice(0, 80));
      picked = asset.id;
      m.form.querySelectorAll('[data-ref-pick]').forEach(x => x.classList.remove('is-picked'));
      m.form.querySelector('#ref-grid').insertAdjacentHTML('afterbegin', `<button type="button" class="asset asset-pick is-picked" data-ref-pick="${esc(asset.id)}"><div class="thumb"><img src="${esc(asset.url)}" alt=""></div><div class="meta small">${esc(asset.label || 'Referans')}</div></button>`);
    } catch (err) { toast(err.message, 'error'); }
  });

  function showResult(res) {
    const a = res.analysis;
    openModal({
      title: `Şablon hazır: ${res.template.name}`, submitLabel: 'Bu şablonla tasarım aç',
      body: `${a.summary ? `<p>${esc(a.summary)}</p>` : ''}
        <dl class="kv mt-3"><dt>Ruh hâli</dt><dd>${esc(a.mood || '—')}</dd><dt>Boyut</dt><dd>${esc(a.format)}</dd><dt>Fontlar</dt><dd>${esc(a.fonts.heading)} / ${esc(a.fonts.body)}</dd></dl>
        ${a.palette.length ? `<div class="swatch-row mt-3">${a.palette.map(p => `<span class="swatch-btn" style="background:${esc(p.hex)}" title="${esc(p.hex)} · ${esc(p.role)}"></span>`).join('')}<span class="xsmall muted">${a.palette.map(p => esc(p.hex)).join(' ')}</span></div>` : ''}
        ${a.tips.length ? `<ul class="issue-list mt-3">${a.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        <p class="xsmall muted mt-3">${esc(aiNote(res.ai).replace('yazıldı', 'incelendi'))} · Şablon Post stüdyosundaki "Şablonlar" listesine eklendi.</p>`,
      onSubmit: async () => {
        const { post } = await api.createPost(brand.id, { blank: true, templateId: res.template.id, title: res.template.name });
        go(base(brand) + '/' + post.id);
      }
    });
    refresh();
  }
}

// ------------------------------------------------------------ Editör (Canva benzeri yerleşim)
// Tam ekran: üstte Dosya / Yeniden boyutlandır / Paylaş menüleri; solda araç rayı ve tıklandıkça açılıp kapanan panel;
// ortada sabit tasarım alanı (sayfa kaymaz); altta sayfa şeridi ve yakınlaştırma; sağda yalnızca bir öğe seçiliyken ayarlar.
const RAIL = [
  ['metin', 'Metin', 'edit'], ['ogeler', 'Öğeler', 'palette'], ['marka', 'Marka', 'identity'], ['yuklemeler', 'Yüklemeler', 'upload'],
  ['sablonlar', 'Şablonlar', 'grid'], ['zemin', 'Zemin', 'image'], ['ai', 'AI', 'sparkle'], ['aciklama', 'Açıklama', 'notes']
];

async function renderEditor(view, brand, id, models) {
  const meta = state.meta.posts;
  let post;
  try { post = (await api.post(brand.id, id)).post; } catch (err) { view.innerHTML = errorNotice(err); return; }
  document.body.classList.add('editor-mode');
  const aiReady = models.ov.providers.some(p => p.configured);
  const driveReady = Boolean(state.settings && state.settings.drive && state.settings.drive.configured && brand.driveFolderId);
  const fontList = [...new Set([brand.fonts.heading, brand.fonts.body, ...state.meta.fonts].filter(Boolean))];
  const palette = [...new Set([brand.colors.primary, ...(brand.colors.secondary || []), ...(brand.colors.backgrounds || []), brand.colors.heading, brand.colors.body, '#ffffff', '#1b1f3b'].filter(Boolean))];
  let data = JSON.parse(JSON.stringify(post.data));
  let current = 0;
  let selected = null;
  let dirty = false;
  let panel = 'metin';
  let zoom = 100;
  let assetCache = null;
  const format = () => meta.formats[data.format];
  const slide = () => data.slides[current];
  const layer = () => slide().layers.find(l => l.id === selected) || null;
  const $ = s => view.querySelector(s);

  function shell() {
    view.innerHTML = `
      <div class="ed">
        <header class="ed-top">
          <a class="ed-top-btn" href="${base(brand)}" title="Tasarımlar">${icon('back')}<span>Tasarımlar</span></a>
          <div class="ed-menu"><button type="button" class="ed-top-btn" data-menu="dosya" aria-haspopup="true">Dosya</button>
            <div class="ed-drop" data-drop="dosya" hidden>
              <div class="ed-drop-head"><b>${esc(post.title)}</b><span class="xsmall">${esc(post.kindLabel)} · ${esc(format().label)} · ${format().w}×${format().h} px</span></div>
              <button type="button" data-act="rename">${icon('edit')}Adını değiştir</button>
              <button type="button" data-act="save">${icon('check')}Kaydet <span class="ed-hint" id="ed-save-state">${dirty ? 'Kaydedilmemiş değişiklik' : 'Değişiklikler kaydedildi'}</span></button>
              <button type="button" data-act="template">${icon('grid')}Marka şablonu olarak kaydet</button>
              <button type="button" data-act="share-template">${icon('grid')}Ortak şablon kütüphanesine kaydet <span class="ed-hint">bütün markalar</span></button>
              ${post.content ? `<a href="#/m/${esc(brand.id)}/takvim">${icon('calendar')}Takvimde gör</a>` : `<button type="button" data-act="schedule">${icon('calendar')}Takvime ekle</button>`}
              <a href="${base(brand)}">${icon('plus')}Yeni tasarım oluştur</a>
              <hr><button type="button" class="danger" data-act="delete">${icon('trash')}Tasarımı sil</button>
            </div></div>
          <div class="ed-menu"><button type="button" class="ed-top-btn" data-menu="boyut" aria-haspopup="true">Yeniden boyutlandır</button>
            <div class="ed-drop" data-drop="boyut" hidden>${Object.entries(meta.formats).map(([k, v]) => `<button type="button" data-format="${k}" class="${k === data.format ? 'on' : ''}">${esc(v.label)} <span class="ed-hint">${v.w}×${v.h}</span></button>`).join('')}</div></div>
          <span class="spacer"></span>
          <h1 class="ed-title" title="${esc(post.title)}">${esc(post.title)}</h1>
          <button type="button" class="ed-top-btn ed-save" data-act="save">${dirty ? 'Kaydet •' : 'Kaydet'}</button>
          <div class="ed-menu"><button type="button" class="ed-share" data-menu="paylas" aria-haspopup="true">Paylaş</button>
            <div class="ed-drop right" data-drop="paylas" hidden>
              <div class="ed-drop-head"><b>Tasarımı paylaş</b></div>
              <div class="ed-share-grid">
                ${post.kind === 'youtube' ? `<button type="button" data-act="yt-preview">${icon('eye')}<span>YouTube önizlemesi</span></button>` : ''}
                <button type="button" data-png="one">${icon('download')}<span>Bu slaytı PNG indir</span></button>
                ${data.slides.length > 1 ? `<button type="button" data-png="all">${icon('download')}<span>Bütün slaytları indir</span></button>` : ''}
                ${driveReady ? `<button type="button" data-drive="one">${icon('upload')}<span>Bu slaytı Drive'a gönder</span></button>${data.slides.length > 1 ? `<button type="button" data-drive="all">${icon('upload')}<span>Bütün slaytları Drive'a gönder</span></button>` : ''}` : ''}
                ${post.content ? '' : `<button type="button" data-act="schedule">${icon('calendar')}<span>Takvime ekle</span></button>`}
                <button type="button" data-act="template">${icon('grid')}<span>Marka şablonu</span></button>
                <button type="button" data-act="share-template">${icon('grid')}<span>Ortak kütüphane</span></button>
              </div>
              ${driveReady ? '' : '<p class="xsmall muted mt-2">Drive\'a göndermek için markanın Drive klasörünü bağla.</p>'}
            </div></div>
        </header>
        <div class="ed-body ${panel ? 'has-panel' : ''} ${selected ? 'has-props' : ''}">
          <nav class="ed-rail" aria-label="Araçlar">${RAIL.map(([k, label, ic]) => `<button type="button" class="${panel === k ? 'active' : ''}" data-rail="${k}" aria-pressed="${panel === k}">${icon(ic)}<span>${label}</span></button>`).join('')}</nav>
          <aside class="ed-panel" ${panel ? '' : 'hidden'}><div id="ed-panel-body"></div><button type="button" class="ed-collapse" data-rail-close aria-label="Paneli kapat">${icon('chevronLeft')}</button></aside>
          <main class="ed-stage" id="ed-stage-area">
            <div class="ed-canvas-wrap"><canvas id="stage" tabindex="0" aria-label="Slayt; öğe seçmek için tıkla, taşımak için sürükle, ince ayar için ok tuşları"></canvas></div>
          </main>
          <aside class="ed-props" id="layer-panel" ${selected ? '' : 'hidden'}></aside>
        </div>
        <footer class="ed-bottom">
          <div class="ed-pages" id="slide-list"></div>
          <div class="ed-page-actions">
            <button type="button" class="btn btn-sm" data-slide-add ${data.slides.length >= 10 ? 'disabled' : ''} title="Slayt ekle">${icon('plus')}Slayt ekle</button>
            <button type="button" class="btn btn-sm btn-ghost" data-slide-dup ${data.slides.length >= 10 ? 'disabled' : ''}>Çoğalt</button>
            <button type="button" class="btn btn-sm btn-ghost icon-btn" data-slide-move="-1" aria-label="Sola taşı">${icon('chevronLeft')}</button>
            <button type="button" class="btn btn-sm btn-ghost icon-btn" data-slide-move="1" aria-label="Sağa taşı">${icon('chevronRight')}</button>
            <button type="button" class="btn btn-sm btn-ghost icon-btn" data-slide-del ${data.slides.length <= 1 ? 'disabled' : ''} aria-label="Slaytı sil">${icon('trash')}</button>
          </div>
          <span class="spacer"></span>
          <label class="ed-zoom"><input type="range" id="ed-zoom" min="40" max="200" step="10" value="${zoom}" aria-label="Yakınlaştırma"><span id="ed-zoom-val">%${zoom}</span></label>
          <span class="small muted">${current + 1} / ${data.slides.length}</span>
        </footer>
      </div>`;
    wireStage();
    drawPanelBody();
    redraw();
  }

  function markDirty() {
    dirty = true;
    const b = $('.ed-save'); if (b) b.textContent = 'Kaydet •';
    const st = $('#ed-save-state'); if (st) st.textContent = 'Kaydedilmemiş değişiklik';
  }

  // Tasarım alanı ekrana sığar; yakınlaştırma bunun yüzdesidir
  function fit() {
    const c = $('#stage');
    const area = $('#ed-stage-area');
    if (!c || !area) return;
    const F = format();
    const k = Math.min((area.clientWidth - 48) / F.w, (area.clientHeight - 48) / F.h) * (zoom / 100);
    c.style.width = `${Math.max(120, Math.round(F.w * k))}px`;
    c.style.height = `${Math.max(120, Math.round(F.h * k))}px`;
  }

  async function redraw() {
    const s = slide();
    await resolveImages(s);
    const c = $('#stage');
    if (!c) return;
    drawSlide(c, s, format(), { selectedId: selected });
    fit();
    drawList();
    drawProps();
  }
  const quick = () => { const c = $('#stage'); if (c) drawSlide(c, slide(), format(), { selectedId: selected }); };

  function drawList() {
    const list = $('#slide-list');
    list.innerHTML = data.slides.map((s, i) => `<button type="button" class="slide-thumb ${i === current ? 'active' : ''}" data-slide="${i}" aria-label="Slayt ${i + 1}" aria-current="${i === current}"><canvas></canvas><span>${i + 1}</span></button>`).join('');
    list.querySelectorAll('canvas').forEach((c, i) => resolveImages(data.slides[i]).then(() => drawSlide(c, data.slides[i], format())));
  }

  // Seçim değişince sağ panel açılır/kapanır (yerleşim değişir, tasarım alanı yeniden sığdırılır)
  function setSelected(id) {
    selected = id;
    $('.ed-body').classList.toggle('has-props', Boolean(id));
    $('#layer-panel').hidden = !id;
  }

  function drawProps() {
    const p = $('#layer-panel');
    const l = layer();
    if (!l) { p.innerHTML = ''; return; }
    const swatches = (key, value) => `<div class="swatch-row">${palette.map(c => `<button type="button" class="swatch-btn ${c === value ? 'on' : ''}" style="background:${esc(c)}" data-swatch="${key}" data-color="${esc(c)}" aria-label="${esc(c)}"></button>`).join('')}<input type="color" data-prop="${key}" value="${esc(value)}" aria-label="Özel renk"></div>`;
    p.innerHTML = `<div class="ed-props-head"><h3>${l.type === 'text' ? 'Metin' : l.type === 'image' ? 'Görsel' : l.type === 'qr' ? 'QR kod' : l.shape === 'circle' ? 'Daire' : 'Şekil'}</h3>
      <div class="row"><button type="button" class="btn btn-sm icon-btn btn-ghost" data-order="-1" aria-label="Geri gönder" title="Geri gönder">${icon('chevronLeft')}</button><button type="button" class="btn btn-sm icon-btn btn-ghost" data-order="1" aria-label="Öne getir" title="Öne getir">${icon('chevronRight')}</button><button type="button" class="btn btn-sm icon-btn btn-ghost" data-layer-dup aria-label="Çoğalt" title="Çoğalt">${icon('plus')}</button><button type="button" class="btn btn-sm icon-btn btn-ghost" data-layer-del aria-label="Katmanı sil" title="Sil">${icon('trash')}</button><button type="button" class="btn btn-sm icon-btn btn-ghost" data-deselect aria-label="Kapat" title="Kapat">${icon('x')}</button></div></div>
      <div class="stack-sm">
      ${l.type === 'text' ? `
        <div class="field"><label for="lp-text">Yazı</label><textarea class="textarea" id="lp-text" data-prop="text" rows="3" maxlength="1000">${esc(l.text)}</textarea></div>
        <div class="form-grid">
          <div class="field"><label for="lp-font">Font</label><select class="select" id="lp-font" data-prop="font">${fontList.map(f => `<option ${f === l.font ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
          <div class="field"><label for="lp-weight">Kalınlık</label><select class="select" id="lp-weight" data-prop="weight">${[400, 500, 600, 700, 800, 900].map(w => `<option value="${w}" ${w === l.weight ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
          <div class="field"><label for="lp-size">Boyut</label><input class="input" id="lp-size" type="number" min="10" max="300" data-prop="size" value="${l.size}"></div>
          <div class="field"><label for="lp-w">Genişlik</label><input class="input" id="lp-w" type="number" min="40" max="2000" data-prop="w" value="${l.w}"></div>
        </div>
        <div class="field"><span class="field-label">Hizalama</span><div class="seg">${[['left', 'Sol'], ['center', 'Orta'], ['right', 'Sağ']].map(([k, v]) => `<button type="button" data-align="${k}" class="${l.align === k ? 'active' : ''}">${v}</button>`).join('')}</div></div>
        <div class="field"><span class="field-label">Renk</span>${swatches('color', l.color)}</div>`
      : l.type === 'qr' ? `
        <div class="field"><label for="lp-qr">Link ya da metin</label><textarea class="textarea" id="lp-qr" data-prop="text" rows="2" maxlength="200">${esc(l.text)}</textarea></div>
        <div class="field"><label for="lp-qw">Boyut</label><input class="input" id="lp-qw" type="number" min="80" max="2000" data-prop="w" value="${l.w}"></div>
        <div class="field"><span class="field-label">Renk (koyu renk seç; zemin her zaman beyaz kalır)</span>${swatches('color', l.color || '#000000')}</div>
        <p class="xsmall muted">Paylaşmadan önce telefon kamerasıyla okutup dene.</p>`
      : l.type === 'image' ? `
        <div class="form-grid"><div class="field"><label for="lp-iw">Genişlik</label><input class="input" id="lp-iw" type="number" min="10" max="4000" data-prop="w" value="${l.w}"></div>
          <div class="field"><label for="lp-ih">Yükseklik</label><input class="input" id="lp-ih" type="number" min="10" max="4000" data-prop="h" value="${l.h}"></div></div>
        <button type="button" class="btn btn-sm" data-replace-image>Görseli değiştir</button>`
      : `<div class="form-grid"><div class="field"><label for="lp-sw">Genişlik</label><input class="input" id="lp-sw" type="number" min="1" max="4000" data-prop="w" value="${l.w}"></div>
          <div class="field"><label for="lp-sh">Yükseklik</label><input class="input" id="lp-sh" type="number" min="1" max="4000" data-prop="h" value="${l.h}"></div>
          ${l.shape === 'circle' ? '' : `<div class="field"><label for="lp-r">Köşe</label><input class="input" id="lp-r" type="number" min="0" max="1000" data-prop="radius" value="${l.radius || 0}"></div>`}</div>
        <div class="field"><span class="field-label">Renk</span>${swatches('color', l.color)}</div>`}
      <div class="field"><label for="lp-op">Saydamlık: ${l.opacity != null ? l.opacity : 100}%</label><input type="range" id="lp-op" min="10" max="100" step="5" data-prop="opacity" value="${l.opacity != null ? l.opacity : 100}"></div>
      <div class="form-grid"><div class="field"><label for="lp-x">X</label><input class="input" id="lp-x" type="number" data-prop="x" value="${l.x}"></div><div class="field"><label for="lp-y">Y</label><input class="input" id="lp-y" type="number" data-prop="y" value="${l.y}"></div></div>
      </div>`;
  }

  // ---- Sol panel içerikleri
  async function assets() { if (!assetCache) assetCache = (await api.assets(brand.id)).assets; return assetCache; }
  const assetGrid = (list, empty) => (list.length
    ? `<div class="ed-asset-grid">${list.map(a => `<button type="button" class="ed-asset" data-add-asset="${esc(a.id)}" title="${esc(a.label || a.categoryLabel)}"><img src="${esc(a.url)}" alt="${esc(a.label || '')}" loading="lazy"></button>`).join('')}</div>`
    : `<p class="small muted">${empty}</p>`);

  async function drawPanelBody() {
    const box = $('#ed-panel-body');
    if (!box || !panel) return;
    const title = (RAIL.find(r => r[0] === panel) || [])[1];
    const head = `<h3 class="ed-panel-title">${esc(title)}</h3>`;
    if (panel === 'metin') {
      box.innerHTML = `${head}<div class="stack-sm">
        <button type="button" class="ed-text-add h1" data-add="text" data-preset="title">Başlık ekle</button>
        <button type="button" class="ed-text-add h2" data-add="text" data-preset="sub">Alt başlık ekle</button>
        <button type="button" class="ed-text-add" data-add="text" data-preset="body">Gövde metni ekle</button></div>
        <p class="xsmall muted mt-3">Fontlar: ${esc(brand.fonts.heading || 'Poppins')} / ${esc(brand.fonts.body || 'Inter')} (marka kimliğinden)</p>`;
      return;
    }
    if (panel === 'ogeler') {
      const list = await assets();
      const stickers = list.filter(a => a.category === 'sticker');
      const packs = [...new Set(stickers.map(a => a.pack).filter(Boolean))];
      box.innerHTML = `${head}<h4 class="ed-sub">Şekiller</h4>
        <div class="ed-shapes"><button type="button" data-add="shape" title="Dikdörtgen"><span class="sh rect"></span></button><button type="button" data-add="shape" data-preset="rounded" title="Yuvarlak köşe"><span class="sh rounded"></span></button><button type="button" data-add="circle" title="Daire"><span class="sh circle"></span></button><button type="button" data-add="shape" data-preset="line" title="Çizgi"><span class="sh line"></span></button></div>
        <h4 class="ed-sub">QR kod</h4>
        <div class="row mb-3"><input class="input input-sm" id="ed-qr-text" placeholder="Link ya da metin (ör. kampanya sayfası)" maxlength="200" aria-label="QR kod metni"><button type="button" class="btn btn-sm" data-add="qr">${icon('plus')}Ekle</button></div>
        <h4 class="ed-sub">Sticker'lar</h4>
        ${packs.length ? `<div class="chips mb-2"><button type="button" class="chip active" data-sticker-pack="">Tümü</button>${packs.map(p => `<button type="button" class="chip" data-sticker-pack="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}
        <div id="ed-stickers">${assetGrid(stickers, `Henüz sticker yok. <a class="link" href="#/m/${esc(brand.id)}/kutuphane">Kütüphaneye</a> paket olarak yükleyebilirsin.`)}</div>`;
      return;
    }
    if (panel === 'marka') {
      const list = await assets();
      box.innerHTML = `${head}<h4 class="ed-sub">Logo</h4>${assetGrid(list.filter(a => a.category === 'logo'), 'Logo yüklenmemiş.')}
        <h4 class="ed-sub">Maskot pozları</h4>${assetGrid(list.filter(a => a.category === 'mascot'), 'Maskot pozu yok.')}
        <h4 class="ed-sub">Marka renkleri</h4><div class="swatch-row">${palette.map(c => `<button type="button" class="swatch-btn" style="background:${esc(c)}" data-brand-color="${esc(c)}" title="Seçili öğeye ya da zemine uygula" aria-label="${esc(c)}"></button>`).join('')}</div>
        <p class="xsmall muted mt-1">Renge tıklayınca seçili öğeye, öğe seçili değilse slayt zeminine uygulanır.</p>`;
      return;
    }
    if (panel === 'yuklemeler') {
      const list = await assets();
      const cats = [...new Map(list.map(a => [a.category, a.categoryLabel])).entries()];
      box.innerHTML = `${head}<label class="btn btn-sm w-full mb-3">${icon('upload')}Dosya yükle<input type="file" id="ed-upload" accept="image/png,image/jpeg,image/webp,image/gif" multiple class="sr-only"></label>
        ${cats.length > 1 ? `<div class="chips mb-2"><button type="button" class="chip active" data-up-cat="">Tümü</button>${cats.map(([k, v]) => `<button type="button" class="chip" data-up-cat="${esc(k)}">${esc(v)}</button>`).join('')}</div>` : ''}
        <div id="ed-uploads">${assetGrid(list, 'Kütüphane boş.')}</div>`;
      box.querySelector('#ed-upload').addEventListener('change', async e => {
        for (const f of e.target.files) { try { await api.uploadAsset(brand.id, f, 'brand_image', f.name.replace(/\.[^.]+$/, '').slice(0, 80)); } catch (err) { toast(`${f.name}: ${err.message}`, 'error'); } }
        assetCache = null; drawPanelBody();
      });
      return;
    }
    if (panel === 'sablonlar') {
      const [{ templates: own }, { templates: sh }] = await Promise.all([api.postTemplates(brand.id), api.sharedTemplates(brand.id)]);
      const templates = own.map(t => Object.assign(t, { scope: 'Marka' })).concat(sh.map(t => Object.assign(t, { scope: 'Ortak' })));
      box.innerHTML = `${head}<button type="button" class="btn btn-sm w-full mb-2" data-act="template">${icon('plus')}Marka şablonu olarak kaydet</button><button type="button" class="btn btn-sm w-full mb-3" data-act="share-template">${icon('plus')}Ortak kütüphaneye kaydet</button>
        ${templates.length ? `<div class="ed-tpl-grid">${templates.map(t => `<button type="button" class="ed-tpl" data-apply-tpl="${esc(t.id)}" title="Bu slayta uygula"><canvas data-tpl-c="${esc(t.id)}"></canvas><span>${esc(t.name)} <em class="muted">· ${t.scope}</em></span></button>`).join('')}</div>
          <p class="xsmall muted mt-2">Şablona tıklayınca ilk slaydı bu slaydın yerine konur (geri almak için kaydetmeden çık).</p>` : '<p class="small muted">Henüz şablon yok. Post stüdyosunda "Referanstan şablon" ile ya da bu tasarımı kaydederek oluşturabilirsin.</p>'}`;
      box._tpls = templates;
      templates.forEach(t => { const c = box.querySelector(`[data-tpl-c="${CSS.escape(t.id)}"]`); if (c && t.data.slides) resolveImages(t.data.slides[0]).then(() => drawSlide(c, t.data.slides[0], meta.formats[t.data.format] || format())); });
      return;
    }
    if (panel === 'zemin') {
      const bi = slide().bgImage;
      box.innerHTML = `${head}<div class="field"><label for="slide-bg">Zemin rengi</label><div class="swatch-row">${palette.map(c => `<button type="button" class="swatch-btn ${c === slide().bg ? 'on' : ''}" style="background:${esc(c)}" data-bg-color="${esc(c)}" aria-label="${esc(c)}"></button>`).join('')}<input type="color" id="slide-bg" value="${esc(slide().bg)}" aria-label="Slayt zemin rengi"></div></div>
        <h4 class="ed-sub">Zemin görseli</h4>
        ${bi ? `<div class="seg mb-2">${[['cover', 'Kapla'], ['contain', 'Sığdır']].map(([k, v]) => `<button type="button" data-bg-fit="${k}" class="${bi.fit === k ? 'active' : ''}">${v}</button>`).join('')}</div>
          <label class="small" for="bg-dim">Karartma</label><input type="range" id="bg-dim" min="0" max="80" step="5" value="${bi.dim || 0}">
          <div class="row mt-2"><button type="button" class="btn btn-sm" data-bg-image>Değiştir</button><button type="button" class="btn btn-sm btn-ghost" data-bg-remove>Kaldır</button></div>`
        : `<button type="button" class="btn btn-sm" data-bg-image>${icon('image')}Kütüphaneden zemin görseli seç</button>`}`;
      return;
    }
    if (panel === 'ai') {
      box.innerHTML = `${head}${aiReady ? `<p class="small muted mb-2">Bütün slayt metinleri seçtiğin modelle yeniden yazılır; yerleşim marka şablonuyla baştan kurulur.</p>
        <div class="stack-sm">${modelSelect(models, 'yazim', { id: 'pw-model' })}<button type="button" class="btn" data-rewrite>${icon('refresh')}Metni yeniden yaz</button></div>`
        : '<div class="notice"><div>AI bağlı değil.</div><a class="btn btn-sm" href="#/ai/modeller">AI bağla</a></div>'}`;
      return;
    }
    if (panel === 'aciklama') {
      box.innerHTML = `${head}<div class="field"><label for="pc-caption">Instagram açıklaması</label><textarea class="textarea" id="pc-caption" rows="8" maxlength="3000">${esc(data.caption || '')}</textarea></div>
        <div class="field mt-3"><label for="pc-tags">Hashtag'ler</label><input class="input" id="pc-tags" value="${esc((data.hashtags || []).join(' '))}" maxlength="400"></div>
        <div id="pc-review" class="mt-3"></div>`;
      reviewBox(box.querySelector('#pc-review'), brand, models, () => `${box.querySelector('#pc-caption').value}\n\n${box.querySelector('#pc-tags').value}`, 'caption',
        improved => { box.querySelector('#pc-caption').value = improved; data.caption = improved; markDirty(); });
    }
  }

  function openPanel(k) {
    panel = panel === k ? null : k; // aynı araca tekrar tıklayınca panel kapanır
    view.querySelectorAll('[data-rail]').forEach(b => { b.classList.toggle('active', b.dataset.rail === panel); b.setAttribute('aria-pressed', String(b.dataset.rail === panel)); });
    $('.ed-panel').hidden = !panel;
    $('.ed-body').classList.toggle('has-panel', Boolean(panel));
    drawPanelBody();
    fit();
  }

  // Tuval: tıklayınca seç, sürükleyince taşı, ok tuşlarıyla kaydır
  function wireStage() {
    const c = $('#stage');
    let drag = null;
    const point = e => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }; };
    c.addEventListener('pointerdown', e => {
      const p = point(e);
      const hit = hitTest(c, slide(), p.x, p.y);
      setSelected(hit ? hit.id : null);
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
      quick();
    });
    const end = () => { if (drag && drag.moved) { markDirty(); redraw(); } drag = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('dblclick', () => { const t = $('#lp-text'); if (t) t.focus(); });
    c.addEventListener('keydown', e => {
      const l = layer();
      if (!l) return;
      const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (k) { e.preventDefault(); const s = e.shiftKey ? 10 : 1; l.x += k[0] * s; l.y += k[1] * s; markDirty(); redraw(); }
      if (e.key === 'Delete') { slide().layers = slide().layers.filter(x => x.id !== l.id); setSelected(null); markDirty(); redraw(); }
      if (e.key === 'Escape') { setSelected(null); redraw(); }
    });
    // Pencere boyutu değişince tasarım alanı yeniden sığdırılır
    if (view._ro) view._ro.disconnect();
    view._ro = new ResizeObserver(() => fit());
    view._ro.observe($('#ed-stage-area'));
  }

  function pickAsset(onPick, only = null) {
    assets().then(all => {
      const list = only ? all.filter(a => a.category === only) : all;
      const m = openModal({
        title: 'Kütüphaneden görsel', submitLabel: 'Kapat',
        body: list.length ? `<div class="asset-grid">${list.map(a => `<button type="button" class="asset asset-pick" data-pick="${esc(a.id)}"><div class="thumb"><img src="${esc(a.url)}" alt=""></div><div class="meta small">${esc(a.label || a.categoryLabel)}</div></button>`).join('')}</div>`
          : emptyState({ icon: 'image', title: 'Kütüphane boş', text: `<a class="link" href="#/m/${esc(brand.id)}/kutuphane">Kütüphaneye</a> görsel yükle.`, compact: true }),
        onSubmit: async () => {}
      });
      m.form.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; onPick(all.find(a => a.id === b.dataset.pick)); m.close(); });
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

  const closeMenus = () => view.querySelectorAll('[data-drop]').forEach(d => { d.hidden = true; });
  const addLayer = l => { slide().layers.push(l); setSelected(l.id); markDirty(); redraw(); };
  const addAssetLayer = a => { const F = format(); const small = a.category === 'logo' || a.category === 'sticker'; const s = small ? 240 : 480; addLayer({ id: uid(), type: 'image', src: a.url, assetId: a.id, x: Math.round(F.w / 2 - s / 2), y: Math.round(F.h / 2 - s / 2), w: s, h: s }); };
  async function save(btn) {
    post = (await busy(btn, () => api.savePost(brand.id, post.id, { data }))).post;
    data = JSON.parse(JSON.stringify(post.data)); dirty = false;
    toast('Tasarım kaydedildi.', 'success');
    shell();
  }

  view.oninput = e => {
    const t = e.target;
    if (t.id === 'pc-caption') { data.caption = t.value; markDirty(); return; }
    if (t.id === 'pc-tags') { data.hashtags = t.value.split(/[\s,]+/).filter(Boolean).map(h => h.replace(/^#?/, '#')); markDirty(); return; }
    if (t.id === 'slide-bg') { slide().bg = t.value; markDirty(); quick(); return; }
    if (t.id === 'bg-dim' && slide().bgImage) { slide().bgImage.dim = Number(t.value); markDirty(); quick(); return; }
    if (t.id === 'ed-zoom') { zoom = Number(t.value); $('#ed-zoom-val').textContent = `%${zoom}`; fit(); return; }
    const prop = t.dataset.prop;
    const l = layer();
    if (!prop || !l) return;
    l[prop] = ['text', 'font', 'color'].includes(prop) ? t.value : Number(t.value);
    if (l.type === 'qr' && prop === 'w') l.h = l.w;
    markDirty();
    quick();
  };
  view.onchange = e => { if (e.target.dataset.prop || e.target.id === 'slide-bg') redraw(); };

  view.onclick = async e => {
    const t = e.target;
    const menu = t.closest('[data-menu]');
    if (menu) { const d = view.querySelector(`[data-drop="${menu.dataset.menu}"]`); const was = d.hidden; closeMenus(); d.hidden = !was; return; }
    if (!t.closest('.ed-drop')) closeMenus();
    const rail = t.closest('[data-rail]');
    if (rail) return openPanel(rail.dataset.rail);
    if (t.closest('[data-rail-close]')) return openPanel(panel);
    const s = t.closest('[data-slide]');
    if (s) { current = Number(s.dataset.slide); setSelected(null); if (panel === 'zemin') drawPanelBody(); return redraw(); }
    if (t.closest('[data-slide-add]')) { data.slides.splice(current + 1, 0, { bg: (brand.colors.backgrounds || [])[0] || '#ffffff', layers: [] }); current++; setSelected(null); markDirty(); return shell(); }
    if (t.closest('[data-slide-dup]')) { const copy = JSON.parse(JSON.stringify(slide())); copy.layers.forEach(l => { l.id = uid(); }); data.slides.splice(current + 1, 0, copy); current++; markDirty(); return shell(); }
    if (t.closest('[data-slide-del]')) { if (!confirm('Bu slayt silinsin mi?')) return; data.slides.splice(current, 1); current = Math.max(0, current - 1); setSelected(null); markDirty(); return shell(); }
    const mv = t.closest('[data-slide-move]');
    if (mv) { const j = current + Number(mv.dataset.slideMove); if (j < 0 || j >= data.slides.length) return; [data.slides[current], data.slides[j]] = [data.slides[j], data.slides[current]]; current = j; markDirty(); return redraw(); }
    const fmt = t.closest('[data-format]');
    if (fmt) { data.format = fmt.dataset.format; closeMenus(); markDirty(); return shell(); }
    const add = t.closest('[data-add]');
    if (add) {
      const F = format();
      const pr = add.dataset.preset;
      if (add.dataset.add === 'text') {
        const spec = pr === 'title' ? { text: 'Başlık', size: 96, weight: 800, font: brand.fonts.heading } : pr === 'sub' ? { text: 'Alt başlık', size: 56, weight: 700, font: brand.fonts.heading } : { text: 'Yeni metin', size: 40, weight: 500, font: brand.fonts.body };
        return addLayer(Object.assign({ id: uid(), type: 'text', role: 'text', x: 90, y: Math.round(F.h / 2), w: 800, color: brand.colors.heading || '#1b1f3b', align: 'left' }, spec, { font: spec.font || 'Poppins' }));
      }
      if (add.dataset.add === 'qr') {
        const text = ($('#ed-qr-text') || {}).value || '';
        if (!text.trim()) { toast('QR kod için bir link ya da metin yaz.', 'error'); return $('#ed-qr-text') && $('#ed-qr-text').focus(); }
        if (new TextEncoder().encode(text.trim()).length > 200) return toast('QR metni en fazla 200 karakter olabilir.', 'error');
        const s = Math.round(Math.min(F.w, F.h) * 0.28);
        return addLayer({ id: uid(), type: 'qr', text: text.trim(), x: F.w - s - 70, y: F.h - s - 70, w: s, h: s, color: '#000000' });
      }
      if (add.dataset.add === 'circle') return addLayer({ id: uid(), type: 'shape', shape: 'circle', x: 120, y: 120, w: 260, h: 260, color: brand.colors.primary || '#5b55e6', radius: 0 });
      const sh = pr === 'line' ? { w: 600, h: 10, radius: 5 } : pr === 'rounded' ? { w: 360, h: 260, radius: 40 } : { w: 300, h: 300, radius: 0 };
      return addLayer(Object.assign({ id: uid(), type: 'shape', shape: 'rect', x: 90, y: 90, color: brand.colors.primary || '#5b55e6' }, sh));
    }
    const aa = t.closest('[data-add-asset]');
    if (aa) { const a = (await assets()).find(x => x.id === aa.dataset.addAsset); if (a) addAssetLayer(a); return; }
    const sp = t.closest('[data-sticker-pack]');
    if (sp) { view.querySelectorAll('[data-sticker-pack]').forEach(x => x.classList.toggle('active', x === sp)); const list = (await assets()).filter(a => a.category === 'sticker' && (!sp.dataset.stickerPack || a.pack === sp.dataset.stickerPack)); $('#ed-stickers').innerHTML = assetGrid(list, 'Bu pakette sticker yok.'); return; }
    const uc = t.closest('[data-up-cat]');
    if (uc) { view.querySelectorAll('[data-up-cat]').forEach(x => x.classList.toggle('active', x === uc)); const list = (await assets()).filter(a => !uc.dataset.upCat || a.category === uc.dataset.upCat); $('#ed-uploads').innerHTML = assetGrid(list, 'Bu kategoride dosya yok.'); return; }
    const bc = t.closest('[data-brand-color]');
    if (bc) { const l = layer(); if (l && l.type !== 'image') l.color = bc.dataset.brandColor; else slide().bg = bc.dataset.brandColor; markDirty(); return redraw(); }
    const bgc = t.closest('[data-bg-color]');
    if (bgc) { slide().bg = bgc.dataset.bgColor; markDirty(); drawPanelBody(); return redraw(); }
    const tpl = t.closest('[data-apply-tpl]');
    if (tpl) {
      const tt = ($('#ed-panel-body')._tpls || []).find(x => x.id === tpl.dataset.applyTpl);
      if (!tt || !tt.data.slides || !confirm('Şablonun ilk slaydı bu slaydın yerine konsun mu?')) return;
      const copy = JSON.parse(JSON.stringify(tt.data.slides[0])); copy.layers.forEach(l => { l.id = uid(); });
      data.slides[current] = copy; setSelected(null); markDirty(); return redraw();
    }
    const sw = t.closest('[data-swatch]');
    if (sw && layer()) { layer()[sw.dataset.swatch] = sw.dataset.color; markDirty(); return redraw(); }
    const al = t.closest('[data-align]');
    if (al && layer()) { layer().align = al.dataset.align; markDirty(); return redraw(); }
    const ord = t.closest('[data-order]');
    if (ord && layer()) { const arr = slide().layers; const i = arr.findIndex(x => x.id === selected); const j = i + Number(ord.dataset.order); if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; markDirty(); return redraw(); }
    if (t.closest('[data-layer-dup]') && layer()) { const c = Object.assign(JSON.parse(JSON.stringify(layer())), { id: uid() }); c.x += 30; c.y += 30; return addLayer(c); }
    if (t.closest('[data-layer-del]')) { slide().layers = slide().layers.filter(x => x.id !== selected); setSelected(null); markDirty(); return redraw(); }
    if (t.closest('[data-deselect]')) { setSelected(null); return redraw(); }
    if (t.closest('[data-replace-image]') && layer()) return pickAsset(a => { Object.assign(layer(), { src: a.url, assetId: a.id }); markDirty(); redraw(); });
    if (t.closest('[data-bg-image]')) return pickAsset(a => { slide().bgImage = Object.assign({ fit: 'cover', dim: 0 }, slide().bgImage || {}, { src: a.url }); markDirty(); drawPanelBody(); redraw(); });
    if (t.closest('[data-bg-remove]')) { delete slide().bgImage; markDirty(); drawPanelBody(); return redraw(); }
    const fit2 = t.closest('[data-bg-fit]');
    if (fit2 && slide().bgImage) { slide().bgImage.fit = fit2.dataset.bgFit; markDirty(); drawPanelBody(); return redraw(); }
    const act = t.closest('[data-act]');
    if (act) {
      closeMenus();
      const a = act.dataset.act;
      try {
        if (a === 'save') return await save(act);
        if (a === 'rename') {
          const name = prompt('Tasarımın adı', post.title);
          if (!name || !name.trim()) return;
          post = (await api.savePost(brand.id, post.id, { title: name.trim() })).post; return shell();
        }
        if (a === 'yt-preview') {
          const blob = await slideBlob(slide(), format());
          const logo = (await api.assets(brand.id, 'logo')).assets[0];
          return youtubePreview(brand, URL.createObjectURL(blob), { title: post.title, logoUrl: logo ? logo.url : null });
        }
        if (a === 'template') {
          const name = prompt('Şablon adı', post.title);
          if (name === null) return;
          if (dirty) { post = (await api.savePost(brand.id, post.id, { data })).post; dirty = false; }
          await api.saveTemplate(brand.id, post.id, name.trim() || post.title);
          toast('Marka şablonu olarak kaydedildi.', 'success');
          if (panel === 'sablonlar') drawPanelBody();
          return;
        }
        if (a === 'share-template') {
          const name = prompt('Ortak şablonun adı (bütün markalarda görünür)', post.title);
          if (name === null) return;
          if (dirty) { post = (await api.savePost(brand.id, post.id, { data })).post; dirty = false; }
          await api.shareTemplate(brand.id, post.id, name.trim() || post.title);
          toast('Ortak şablon kütüphanesine kaydedildi; diğer markalarda kendi renk, font, logo ve maskotlarıyla kullanılabilir.', 'success', 6000);
          if (panel === 'sablonlar') drawPanelBody();
          return;
        }
        if (a === 'schedule') {
          const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0);
          await api.schedulePost(brand.id, post.id, d.toISOString());
          post = (await api.post(brand.id, post.id)).post;
          toast('Takvime yarın 12:00 için eklendi; takvimden tarihini değiştirebilirsin.', 'success', 5000);
          return shell();
        }
        if (a === 'delete') {
          if (!confirm(`"${post.title}" tasarımı silinsin mi?`)) return;
          await api.deletePost(brand.id, post.id); toast('Tasarım silindi.', 'success'); return go(base(brand));
        }
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const rw = t.closest('[data-rewrite]');
    if (rw) {
      if (dirty && !confirm('Kaydedilmemiş değişiklikler var; yeniden yazınca yerleşim de baştan kurulur. Devam edilsin mi?')) return;
      try { const res = await busyTimer(rw, () => api.rewritePost(brand.id, post.id, { model: ($('#pw-model') || {}).value || null })); post = res.post; data = JSON.parse(JSON.stringify(post.data)); current = 0; selected = null; dirty = false; toast(aiNote(res.post.ai), 'success', 5000); shell(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const png = t.closest('[data-png]');
    if (png) { closeMenus(); return busy(png, () => exportSlides(png.dataset.png, 'download')).catch(err => toast(err.message, 'error')); }
    const dr = t.closest('[data-drive]');
    if (dr) { closeMenus(); try { await busy(dr, () => exportSlides(dr.dataset.drive, 'drive')); toast('Google Drive klasörüne gönderildi.', 'success'); } catch (err) { toast(err.message, 'error'); } }
  };
  // Kaydedilmemiş değişiklik varken sayfadan ayrılma uyarısı
  window.onbeforeunload = () => (dirty ? true : undefined);
  shell();
}
