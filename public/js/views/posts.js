// Post stüdyosu (ilk sürüm): konudan carousel/post üretimi ve katmanlı editör.
// Katmanı tıkla seç, sürükle taşı (ok tuşlarıyla ince ayar); yazı, renk, font, boyut sağ panelden; logo/maskot/görsel kütüphaneden.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState, busy, openModal, errorNotice, timeAgo } from '../ui.js';
import { state, go } from '../app.js';
import { aiModels, modelSelect, busyTimer, streamBusy, aiNote, bindCostHint } from '../aiPicker.js';
import { drawSlide, resolveImages, slideBlob, hitTest, layerBox } from '../postCanvas.js';
import { downloadBlob, safeName, drawTitle, ensureTitleFonts } from '../titlePng.js';
import { reviewBox } from './review.js';

// Şablon alanları: post üretilirken bu rollerdeki kutular yeni metinle dolar, gerisi aynen kalır
const TEXT_ROLES = [['text', 'Sabit yazı (değişmez)'], ['title', 'Başlık'], ['body', 'Açıklama'], ['item', 'Madde (bilgi grafiği)'], ['cta', 'Buton yazısı'], ['speech', 'Maskot konuşması'], ['topic', 'Konu etiketi'], ['num', 'Slayt numarası'], ['page', 'Slayt sayısı (/ 06)']];
const FILL_ROLES = ['title', 'body', 'item', 'cta', 'speech'];
const IMAGE_ROLES = [['', 'Sabit görsel (değişmez)'], ['mascot', 'Maskot yeri (poz her postta konuya göre seçilir)'], ['logo', 'Logo']];
// Şablonun hangi alanları her postta doluyor (kartta gösterilir)
const ROLE_NAMES = { title: 'Başlık', body: 'Açıklama', item: 'Madde', cta: 'Buton', speech: 'Maskot konuşması', topic: 'Konu', num: 'Slayt no', mascot: 'Maskot yeri' };
function tplFields(t) {
  const set = new Set();
  (t.data.slides || []).forEach(s => (s.layers || []).forEach(l => { if (ROLE_NAMES[l.role] && (l.type === 'text' || l.role === 'mascot')) set.add(ROLE_NAMES[l.role]); }));
  return [...set];
}
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
  // Son seçilen tasarım hatırlanır (her post için yeniden seçmek gerekmesin)
  const tplKey = `ium.lastTpl.${brand.id}`;
  let lastTpl = '';
  try { lastTpl = localStorage.getItem(tplKey) || ''; } catch { /* gizli pencere */ }
  if (!templates.some(t => t.id === lastTpl && !t.match.frame)) lastTpl = '';
  view.innerHTML = `
    ${pageHead({
      title: 'Post stüdyosu', desc: `${esc(brand.name)} için post, carousel, story, Reels kapağı, reklam ve bilgi grafiği tasarımları. Metinler marka diliyle yazılır; renk, font, logo ve maskot otomatik uygulanır.`,
      actions: `<a class="btn btn-ghost" href="${base(brand)}/izgara">${icon('grid')}Izgara önizlemesi</a><button class="btn" data-blank>${icon('plus')}Boş tasarım</button>${aiReady ? `<button class="btn" data-ref>${icon('image')}Referanstan şablon</button><button class="btn" data-new>${icon('sparkle')}Konudan üret</button>` : ''}`
    })}
    ${aiReady ? `<form class="card quick-post mb-4" id="quick-post">
      <input class="input grow" name="topic" maxlength="1000" required placeholder="Konuyu yaz, carousel hazırlansın. Ör. Sınav haftasında kahve nasıl içilir?" aria-label="Post konusu">
      <select class="select w-auto" name="templateId" id="qp-tpl" aria-label="Tasarım"><option value="">Tasarım: otomatik (marka yerleşimi)</option>${templates.filter(t => !t.match.frame).map(t => `<option value="${esc(t.id)}" ${t.id === lastTpl ? 'selected' : ''}>Tasarım: ${esc(t.name)} · ${esc(t.kindLabel)}</option>`).join('')}</select>
      <select class="select w-auto" name="slides" aria-label="Slayt sayısı">${[4, 5, 6, 7, 8].map(n => `<option value="${n}" ${n === 6 ? 'selected' : ''}>${n} slayt</option>`).join('')}</select>
      <button class="btn btn-primary" type="submit">${icon('sparkle')}Üret</button>
      <button class="btn" type="button" data-from-idea title="İçerik havuzundan kullanılmamış bir fikir seç">${icon('idea')}Havuzdan</button>
    </form>` : ''}
    ${aiReady ? '' : '<div class="notice mb-4"><div><strong>AI bağlı değil.</strong> Boş tasarımla başlayabilirsin; konudan metin yazdırmak için bir sağlayıcı bağla.</div><a class="btn btn-sm" href="#/ai/modeller">AI bağla</a></div>'}
    ${posts.length ? `<div class="post-grid">${posts.map(p => `
      <a class="card post-card" href="${base(brand)}/${esc(p.id)}">
        <div class="post-thumb"><canvas data-thumb="${esc(p.id)}" aria-hidden="true"></canvas></div>
        <div class="strong truncate">${esc(p.title)}</div>
        <div class="xsmall muted">${esc(p.kindLabel)} · ${p.data.slides.length} slayt · ${timeAgo(p.updatedAt)}</div>
      </a>`).join('')}</div>`
      : emptyState({ icon: 'palette', title: 'Henüz tasarım yok', text: 'Bir konu yaz; carousel slaytları marka renkleri, fontları, logosu ve maskotuyla hazırlansın. Sonra her şeyi düzenleyebilirsin.', action: aiReady ? `<button class="btn btn-primary" data-new>${icon('sparkle')}Konudan üret</button>` : '', card: true })}`;

  if (templates.length) {
    view.insertAdjacentHTML('beforeend', `<section class="card mt-4"><div class="card-head"><h3>Şablonlar (tasarımların)</h3><span class="small muted">${templates.length}</span></div>
      <p class="small muted mb-3">Tasarımı bir kez hazırla: düzenleyicide yazı kutularını <b>Başlık / Açıklama / Maskot konuşması</b> diye, maskot görselini <b>Maskot yeri</b> diye işaretle ve "Marka şablonu olarak kaydet". Post üretirken yukarıdan tasarımı seç; yapay zekâ yalnızca metni yazar ve maskotun pozunu seçer, yerleşim değişmez. Özel gün tasarımları da böyle eklenir.</p>
      <div class="post-grid">${templates.map(t => `<div class="post-card tpl-card">
        <div class="post-thumb"><canvas data-tpl-thumb="${esc(t.id)}" aria-hidden="true"></canvas></div>
        <div class="strong truncate">${esc(t.name)}</div><div class="xsmall muted">${esc(t.kindLabel)} · ${(t.data.slides || []).length} slayt</div>
        <div class="xsmall ${tplFields(t).length ? '' : 'text-warn'} mt-1">${tplFields(t).length ? `Dolan alanlar: ${esc(tplFields(t).join(', '))}` : 'İşaretli alan yok: düzenleyicide kutulara rol ver'}</div>
        ${t.match.frame ? `<span class="tag mt-1">${t.match.frame === 'acilis' ? 'Sabit açılış slaytı' : 'Sabit kapanış slaytı'}</span>` : ''}<div class="xsmall muted mt-1">${t.match.formats.length || t.match.categories.length ? `Eşleşen fikirler: ${esc([...t.match.formats.map(k => state.meta.ideaFormats[k]), ...t.match.categories.map(k => state.meta.ideaCategories[k])].join(', '))}` : 'Henüz fikir eşleşmesi yok'}</div>
        <div class="row mt-2"><button class="btn btn-sm" data-use-tpl="${esc(t.id)}">Bu şablonla başla</button><button class="btn btn-sm btn-ghost" data-match-tpl="${esc(t.id)}">Eşleştir / açılış-kapanış</button><button class="btn btn-sm btn-ghost icon-btn" data-rename-tpl="${esc(t.id)}" aria-label="${esc(t.name)} şablonunun adını değiştir" title="Adını değiştir">${icon('edit')}</button><button class="btn btn-sm btn-ghost icon-btn" data-del-tpl="${esc(t.id)}" aria-label="Şablonu sil">${icon('trash')}</button></div>
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
  // Hızlı üret (eski sistemdeki gibi tek satır): kart düzeninde carousel, varsayılan model; metin akarak gelir
  const qp = view.querySelector('#quick-post');
  if (qp) qp.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(qp);
    const topic = String(fd.get('topic') || '').trim();
    if (!topic) return;
    try {
      const templateId = fd.get('templateId') || null;
      try { localStorage.setItem(tplKey, templateId || ''); } catch { /* gizli pencere */ }
      const res = await streamBusy(e.submitter, st => api.createPost(brand.id, { topic, kind: 'carousel', slides: Number(fd.get('slides')), templateId }, st));
      if (!res) return;
      toast(aiNote(res.post.ai), 'success', 5000);
      go(base(brand) + '/' + res.post.id);
    } catch (err) { toast(err.message, 'error'); }
  });
  view.onclick = async e => {
    // 10.8: şablonu fikir türü ve kategorileriyle eşleştir
    const mt = e.target.closest('[data-match-tpl]');
    if (mt) {
      const t = templates.find(x => x.id === mt.dataset.matchTpl);
      const box = (name, dict, sel) => `<div class="chip-row">${Object.entries(dict).map(([k, v]) => `<label class="chip-check"><input type="checkbox" name="${name}" value="${k}" ${sel.includes(k) ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>`;
      openModal({
        title: `"${t.name}" şablonu hangi fikirlerle kullanılsın?`, submitLabel: 'Kaydet',
        body: `<p class="small muted mb-3">"Havuzdan fikir çek" bu türdeki ya da kategorideki bir fikri seçtiğinde tasarım bu şablonla hazırlanır. Ör. "Haftalık bilgi" şablonu → Post + Bilgilendirici.</p>
          <fieldset class="field"><legend class="field-label">Fikir türleri</legend>${box('formats', state.meta.ideaFormats, t.match.formats)}</fieldset>
          <fieldset class="field mt-3"><legend class="field-label">Kategoriler</legend>${box('categories', state.meta.ideaCategories, t.match.categories)}</fieldset>
          <fieldset class="field mt-3"><legend class="field-label">Sabit açılış / kapanış (11.12)</legend>
            <div class="chip-row">${[['', 'Normal şablon'], ['acilis', 'Açılış slaytı (her carousel\'in başına)'], ['kapanis', 'Kapanış slaytı (her carousel\'in sonuna)']].map(([k, v]) => `<label class="chip-check"><input type="radio" name="frame" value="${k}" ${t.match.frame === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
            <label class="check mt-2"><input type="checkbox" name="autoTitle" ${t.match.autoTitle ? 'checked' : ''}> Başlık her postta konuya göre değişsin (açılışta post başlığı, kapanışta harekete çağrı)</label>
            <p class="xsmall muted mt-1">Şablonun ilk slaytı kullanılır. Bir markada tek açılış ve tek kapanış olur; yenisini seçince eskisi normal şablona döner.</p></fieldset>`,
        onSubmit: async fd => { await api.setTemplateMatch(brand.id, t.id, { formats: fd.getAll('formats'), categories: fd.getAll('categories'), frame: fd.get('frame') || '', autoTitle: fd.get('autoTitle') === 'on' }); toast('Kaydedildi.', 'success'); renderPosts(view, brand, null); }
      });
      return;
    }
    if (e.target.closest('[data-from-idea]')) return fromIdeaFlow(brand, models, templates);
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
    const rn = e.target.closest('[data-rename-tpl]');
    if (rn) {
      const t = templates.find(x => x.id === rn.dataset.renameTpl);
      return openModal({
        title: 'Şablonun adı', submitLabel: 'Kaydet',
        body: `<div class="field"><label for="tpl-name">Ad</label><input class="input" id="tpl-name" name="name" maxlength="80" required value="${esc(t.name)}" placeholder="Ör. Haftalık ipucu, Bayram tasarımı"></div>`,
        onSubmit: async fd => { await api.renameTemplate(brand.id, t.id, fd.get('name')); toast('Şablonun adı değişti.', 'success'); renderPosts(view, brand, null); }
      });
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
          ${templates.length ? `<div class="field full"><label for="pc-tpl">Şablon (isteğe bağlı)</label><select class="select" id="pc-tpl" name="templateId"><option value="">Şablonsuz (marka yerleşimi)</option>${templates.filter(t => !t.match.frame).map(t => `<option value="${esc(t.id)}">${esc(t.name)} · ${esc(t.kindLabel)}</option>`).join('')}</select><span class="hint">Seçersen metin bu şablonun yerleşimine, renklerine ve görsellerine yazılır.</span></div>` : ''}
          <div class="field"><label for="pc-model">Model</label>${modelSelect(models, 'yazim', { id: 'pc-model' })}</div>
          <p class="hint full cost-hint" data-cost></p>
        </div>`,
        onSubmit: async (fd, form) => {
          const res = await streamBusy(form.querySelector('[type=submit]'), st => api.createPost(brand.id, { topic: fd.get('topic'), kind: fd.get('kind'), format: fd.get('format'), slides: Number(fd.get('slides')), templateId: fd.get('templateId') || null, model: form.querySelector('#pc-model').value || null }, st));
          toast(aiNote(res.post.ai), 'success', 5000);
          go(base(brand) + '/' + res.post.id);
        }
      });
      const pm = m.form.querySelector('#pc-model');
      bindCostHint(m.form.querySelector('[data-cost]'), models, () => ({ task: 'yazim', ref: pm ? pm.value : '', job: 'post' }), [pm]);
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

// ------------------------------------------------------------ 10.8 Fikir havuzundan tasarım
// Kullanılmamış bir fikir rastgele seçilir (tür seçilebilir, varsayılan Post); "Başka fikir" yenisini çeker. Tasarım, fikre
// eşleşen şablonla (ya da seçilen şablonla, yoksa marka yerleşimiyle) hazırlanır; fikir "kullanıldı" olur.
async function fromIdeaFlow(brand, models, templates) {
  const seen = [];
  let idea = null;
  const m = openModal({
    title: 'Havuzdan fikir çek', submitLabel: 'Tasarımı üret',
    body: `<div class="form-grid">
      <div class="field"><label for="fi-format">Fikir türü</label><select class="select" id="fi-format" name="format">${Object.entries(state.meta.ideaFormats).map(([k, v]) => `<option value="${k}" ${k === 'post' ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
      <div class="field"><label for="fi-tpl">Şablon</label><select class="select" id="fi-tpl" name="templateId"><option value="">Eşleşen şablon (otomatik)</option>${templates.filter(t => !t.match.frame).map(t => `<option value="${esc(t.id)}">${esc(t.name)} · ${esc(t.kindLabel)}</option>`).join('')}</select></div>
      <div class="field"><label for="fi-slides">Slayt (carousel şablonunda)</label><select class="select" id="fi-slides" name="slides"><option value="">Şablondaki kadar</option>${[3, 4, 5, 6, 7, 8].map(n => `<option>${n}</option>`).join('')}</select></div>
      <div class="field full"><span class="field-label">Seçilen fikir</span><div class="pool-pick" id="fi-idea"><span class="small muted">Seçiliyor…</span></div></div>
      <div class="field"><label for="fi-model">Model</label>${modelSelect(models, 'yazim', { id: 'fi-model' })}</div>
      <p class="full fi-status" id="fi-status" role="status" hidden></p>
    </div>`,
    onSubmit: async (fd, form) => {
      if (!idea) throw new Error('Önce bir fikir çek.');
      // Hangi fikrin yazıldığı ve geçen süre açıkça görünür; metin model yazdıkça akar (İptal edilebilir)
      const status = form.querySelector('#fi-status');
      const started = Date.now();
      status.hidden = false;
      const tick = () => { status.innerHTML = `<span class="ob-spin" aria-hidden="true"></span> <b>"${esc(idea.title)}"</b> fikrinden post yazılıyor · ${Math.round((Date.now() - started) / 1000)} sn`; };
      tick();
      const timer = setInterval(tick, 1000);
      form.querySelectorAll('[data-fi-again], #fi-format').forEach(el => { el.disabled = true; });
      let r;
      try {
        r = await streamBusy(form.querySelector('[type=submit]'), st => api.postFromIdea(brand.id, { ideaId: idea.id, templateId: fd.get('templateId') || null, slides: Number(fd.get('slides')) || null, model: form.querySelector('#fi-model').value || null }, st), 'Yazıyor');
      } finally {
        clearInterval(timer);
        status.hidden = true;
        form.querySelectorAll('[data-fi-again], #fi-format').forEach(el => { el.disabled = false; });
      }
      if (!r) return;
      toast(`"${idea.title}" fikrinden ${r.template ? `"${r.template.name}" şablonuyla` : 'marka yerleşimiyle'} hazırlandı (${aiNote(r.post.ai)}). Fikir kullanıldı olarak işaretlendi.`, 'success', 7000);
      if (r.warning) toast(r.warning, 'info', 6000);
      go(base(brand) + '/' + r.post.id);
    }
  });
  const box = m.form.querySelector('#fi-idea');
  const pull = async () => {
    try {
      const r = await api.randomIdea(brand.id, { format: m.form.querySelector('#fi-format').value, exclude: seen });
      idea = r.idea;
      if (!idea) { box.innerHTML = `<span class="small muted">Bu türde kullanılmamış fikir kalmadı. <a class="link" href="#/m/${esc(brand.id)}/fikirler">İçerik fikirlerine</a> fikir ekle.</span>`; return; }
      seen.push(idea.id);
      box.innerHTML = `<div class="grow"><b>${esc(idea.title)}</b> <span class="tag">${esc(idea.formatLabel)}</span> <span class="tag tag-soft">${esc(idea.categoryLabel)}</span>${idea.description ? `<div class="small muted">${esc(idea.description)}</div>` : ''}
        <div class="row mt-2 fi-acts"><button type="button" class="btn btn-sm btn-ghost danger-text" data-fi-del title="Fikir havuzdan silinir (çöp kutusundan geri alınabilir), yenisi gelir">${icon('trash')}Beğenmedim, havuzdan sil</button>
          <button type="button" class="btn btn-sm btn-ghost" data-fi-similar title="Bu fikre benzeyen yeni fikirler havuza eklenir">${icon('sparkle')}Beğendim, benzerlerini üret</button></div></div>
        <button type="button" class="btn btn-sm" data-fi-again>Başka fikir</button>`;
    } catch (err) { box.innerHTML = `<span class="small">${esc(err.message)}</span>`; }
  };
  m.form.addEventListener('click', async e => {
    if (e.target.closest('[data-fi-again]')) return pull();
    const del = e.target.closest('[data-fi-del]');
    if (del && idea) {
      try { await busy(del, () => api.deleteIdea(brand.id, idea.id)); toast(`"${idea.title}" havuzdan silindi (çöp kutusundan geri alınabilir).`, 'success'); pull(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const sim = e.target.closest('[data-fi-similar]');
    if (sim && idea) {
      try {
        const r = await busyTimer(sim, () => api.similarIdeas(brand.id, idea.id, { count: 3 }), 'Üretiyor');
        toast(`${r.ideas.length} benzer fikir havuza eklendi${r.skipped ? `, ${r.skipped} çok benzeri atlandı` : ''}. Seçili fikir duruyor; istersen bununla üret.`, 'success', 6000);
      } catch (err) { toast(err.message, 'error'); }
    }
  });
  m.form.querySelector('#fi-format').addEventListener('change', () => { seen.length = 0; pull(); });
  pull();
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
const refCard = (a, on) => `<div class="asset-wrap"><button type="button" class="asset asset-pick ${on ? 'is-picked' : ''}" data-ref-pick="${esc(a.id)}"><div class="thumb"><img src="${esc(a.thumbUrl || a.url)}" alt=""></div><div class="meta small">${esc(a.label || 'Referans')}</div></button>
  <button type="button" class="asset-del" data-ref-del="${esc(a.id)}" aria-label="${esc(a.label || 'Referans')} referansını sil" title="Sil">${icon('trash')}</button></div>`;
async function referenceFlow(brand, models, refresh) {
  let refs;
  try { refs = (await api.assets(brand.id, 'reference')).assets; } catch (err) { return toast(err.message, 'error'); }
  // Birden çok referans seçilebilir: hepsi birlikte incelenir, en iyi tasarım dili seçilir (en fazla 6)
  const picked = new Set(refs[0] ? [refs[0].id] : []);
  const syncPick = () => {
    m.form.querySelectorAll('[data-ref-pick]').forEach(x => { x.classList.toggle('is-picked', picked.has(x.dataset.refPick)); x.setAttribute('aria-pressed', String(picked.has(x.dataset.refPick))); });
    m.form.querySelector('#ref-count').textContent = picked.size ? `${picked.size} referans seçili${picked.size > 1 ? ': hepsine bakılıp en iyi tasarım dili seçilir' : ''}` : 'Referans seçilmedi';
  };
  const m = openModal({
    title: 'Referanstan şablon', submitLabel: 'İncele ve şablona çevir',
    body: `<p class="small muted mb-3">Beğendiğin tasarımların ekran görüntülerini seç ya da toplu yükle (tıklayarak birden çok seçebilirsin). Model hepsine bakıp en iyi tasarım dilini seçer ve 3 slaytlık şablon kurar: <b>kapak</b>, her ara slaytta tekrar eden <b>içerik</b> ve <b>kapanış</b>. Metinler kopyalanmaz; logo, maskot ve konuşma balonu yerlerine markanın kendi görselleri konur.</p>
      <div class="asset-grid" id="ref-grid">${refs.map(a => refCard(a, picked.has(a.id))).join('')}</div>
      <p class="small strong mt-2" id="ref-count" role="status"></p>
      <p class="xsmall muted mt-1" id="ref-empty" ${refs.length ? 'hidden' : ''}>Henüz referans yok; aşağıdan yükle.</p>
      <label class="btn btn-sm mt-3">${icon('upload')}Referans yükle (birden çok seçilebilir)<input type="file" id="ref-file" accept="image/png,image/jpeg,image/webp" multiple class="sr-only"></label>
      <div class="form-grid mt-3">
        <div class="field"><label for="ref-name">Şablon adı</label><input class="input" id="ref-name" name="name" maxlength="80" placeholder="Ör. Minimal duyuru"></div>
        <div class="field"><label for="ref-model">Model (görseli okuyabilen)</label>${modelSelect(models, 'yazim', { id: 'ref-model' })}</div>
      </div>
      <p class="xsmall muted mt-1">Claude, GPT-5, Gemini ve görsel destekli OpenRouter modelleri görseli okur.</p>`,
    onSubmit: async (fd, form) => {
      if (!picked.size) throw new Error('Önce en az bir referans görsel seç ya da yükle.');
      if (picked.size > 6) throw new Error('En fazla 6 referans birlikte incelenebilir.');
      const res = await busyTimer(form.querySelector('[type=submit]'), () => api.analyzeDesign(brand.id, { assetIds: [...picked], name: fd.get('name'), model: form.querySelector('#ref-model').value || null }), 'İnceliyor');
      showResult(res);
    }
  });
  syncPick();
  m.form.addEventListener('click', async e => {
    const del = e.target.closest('[data-ref-del]');
    if (del) {
      e.preventDefault();
      const card = del.closest('.asset-wrap');
      if (!confirm(`"${card.querySelector('.meta').textContent}" referansı silinsin mi? Çöp kutusuna gider, Ctrl+Z ile geri alabilirsin.`)) return;
      try {
        await api.deleteAsset(brand.id, del.dataset.refDel);
        card.remove();
        picked.delete(del.dataset.refDel);
        syncPick();
        m.form.querySelector('#ref-empty').hidden = Boolean(m.form.querySelector('[data-ref-pick]'));
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const b = e.target.closest('[data-ref-pick]');
    if (!b) return;
    if (picked.has(b.dataset.refPick)) picked.delete(b.dataset.refPick); else picked.add(b.dataset.refPick);
    syncPick();
  });
  m.form.querySelector('#ref-file').addEventListener('change', async e => {
    const files = [...e.target.files];
    if (!files.length) return;
    // Toplu yükleme: yeni yüklenenler seçili olur (öncekiler bırakılır)
    picked.clear();
    for (const file of files.slice(0, 6)) {
      try {
        const { asset } = await api.uploadAsset(brand.id, file, 'reference', file.name.replace(/\.[^.]+$/, '').slice(0, 80));
        picked.add(asset.id);
        m.form.querySelector('#ref-grid').insertAdjacentHTML('afterbegin', refCard(asset, true));
      } catch (err) { toast(`${file.name}: ${err.message}`, 'error'); }
    }
    if (files.length > 6) toast('En fazla 6 referans birlikte incelenir; ilk 6 dosya yüklendi.', 'info');
    m.form.querySelector('#ref-empty').hidden = Boolean(m.form.querySelector('[data-ref-pick]'));
    syncPick();
    e.target.value = '';
  });

  function showResult(res) {
    const a = res.analysis;
    openModal({
      title: `Şablon hazır: ${res.template.name}`, submitLabel: 'Bu şablonla tasarım aç',
      body: `${a.summary ? `<p>${esc(a.summary)}</p>` : ''}
        <dl class="kv mt-3"><dt>Ruh hâli</dt><dd>${esc(a.mood || '—')}</dd><dt>Boyut</dt><dd>${esc(a.format)}</dd><dt>Fontlar</dt><dd>${esc(a.fonts.heading)} / ${esc(a.fonts.body)}</dd><dt>Yapı</dt><dd>${res.template.slides >= 3 ? 'Kapak + içerik (ara slaytlarda tekrar eder) + kapanış' : res.template.slides === 2 ? 'Kapak + içerik' : 'Tek slayt'}</dd></dl>
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
  let multi = null; // Ctrl+A: slayttaki bütün katmanlar seçili (kopyala, kes, sil, taşı)
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
          <h1 class="ed-title" title="${esc(post.title)}${data.topic ? ` · Konu: ${esc(data.topic)}` : ''}">${esc(post.title)}</h1>${data.topic ? `<span class="ed-topic xsmall" title="${esc(data.topic)}">${esc(data.topic.length > 48 ? data.topic.slice(0, 48) + '…' : data.topic)}</span>` : ''}
          <button type="button" class="ed-top-btn ed-save" data-act="save">${dirty ? 'Kaydet •' : 'Kaydet'}</button>
          <div class="ed-menu"><button type="button" class="ed-share" data-menu="paylas" aria-haspopup="true">Paylaş</button>
            <div class="ed-drop right" data-drop="paylas" hidden>
              <div class="ed-drop-head"><b>Tasarımı paylaş</b></div>
              <div class="ed-share-grid">
                ${post.kind === 'youtube' ? `<button type="button" data-act="yt-preview">${icon('eye')}<span>YouTube önizlemesi</span></button>` : ''}
                <button type="button" data-png="one">${icon('download')}<span>Bu slaytı PNG indir</span></button>
                ${data.slides.length > 1 ? `<button type="button" data-png="all">${icon('download')}<span>Bütün slaytları indir</span></button>` : ''}
                <button type="button" data-drive="one">${icon('upload')}<span>Bu slaytı Drive'a gönder</span></button>${data.slides.length > 1 ? `<button type="button" data-drive="all">${icon('upload')}<span>Bütün slaytları Drive'a gönder</span></button>` : ''}
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

  // 11.9 Geri al / yinele: her değişiklikten önceki hâl saklanır (en çok 100 adım, yalnız bu oturumda)
  const undoStack = [];
  const redoStack = [];
  let lastSnap = JSON.stringify(data);
  function restoreSnap(json) {
    data = JSON.parse(json);
    lastSnap = json;
    current = Math.min(current, data.slides.length - 1);
    if (selected && !slide().layers.some(l => l.id === selected)) selected = null;
    dirty = true;
    shell();
    markDirty(true);
  }
  function undo() { if (!undoStack.length) return toast('Geri alınacak değişiklik yok.', 'info', 1800); redoStack.push(JSON.stringify(data)); restoreSnap(undoStack.pop()); }
  function redo() { if (!redoStack.length) return toast('Yinelenecek değişiklik yok.', 'info', 1800); undoStack.push(JSON.stringify(data)); restoreSnap(redoStack.pop()); }

  function markDirty(fromHistory = false) {
    if (!fromHistory) {
      const now = JSON.stringify(data);
      if (now !== lastSnap) { undoStack.push(lastSnap); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; lastSnap = now; }
    }
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

  async function redraw({ keepProps = false } = {}) {
    const s = slide();
    await resolveImages(s);
    const c = $('#stage');
    if (!c) return;
    drawSlide(c, s, format(), { selectedId: multi || selected });
    fit();
    drawList();
    // Panelden çıkarken (change) panel yeniden çizilmez: aynı anda basılan düğmenin tıklaması kaybolmasın
    if (!keepProps) drawProps();
  }
  const quick = () => { const c = $('#stage'); if (c) drawSlide(c, slide(), format(), { selectedId: multi || selected }); };

  function drawList() {
    const list = $('#slide-list');
    list.innerHTML = data.slides.map((s, i) => `<button type="button" class="slide-thumb ${i === current ? 'active' : ''}" data-slide="${i}" aria-label="Slayt ${i + 1}" aria-current="${i === current}"><canvas></canvas><span>${i + 1}</span></button>`).join('');
    list.querySelectorAll('canvas').forEach((c, i) => resolveImages(data.slides[i]).then(() => drawSlide(c, data.slides[i], format())));
  }

  // Seçim değişince sağ panel açılır/kapanır (yerleşim değişir, tasarım alanı yeniden sığdırılır)
  function setSelected(id) {
    selected = id;
    if (id) multi = null;
    $('.ed-body').classList.toggle('has-props', Boolean(id));
    $('#layer-panel').hidden = !id;
  }

  function drawProps() {
    const p = $('#layer-panel');
    const l = layer();
    if (!l) { p.innerHTML = ''; return; }
    const swatches = (key, value) => `<div class="swatch-row">${palette.map(c => `<button type="button" class="swatch-btn ${c === value ? 'on' : ''}" style="background:${esc(c)}" data-swatch="${key}" data-color="${esc(c)}" aria-label="${esc(c)}"></button>`).join('')}<input type="color" data-prop="${key}" value="${esc(value)}" aria-label="Özel renk"></div>`;
    p.innerHTML = `${data.slides.length > 1 ? `<button type="button" class="btn btn-sm w-full mb-3" data-apply-all title="${l.type === 'text' ? 'Yazı stili (font, boyut, renk, hizalama, konum) aynı roldeki yazılara uygulanır; yazının kendisi değişmez' : 'Aynı görsel/şekil öbür slaytlarda da bu hâle gelir; olmayan slayta eklenir'}">${icon('grid')}Tüm slaytlara uygula</button>` : ''}<div class="ed-props-head"><h3>${l.type === 'text' ? 'Metin' : l.type === 'image' ? 'Görsel' : l.type === 'qr' ? 'QR kod' : l.shape === 'circle' ? 'Daire' : 'Şekil'}</h3>
      <div class="row"><button type="button" class="btn btn-sm icon-btn btn-ghost" data-order="-1" aria-label="Geri gönder" title="Geri gönder">${icon('chevronLeft')}</button><button type="button" class="btn btn-sm icon-btn btn-ghost" data-order="1" aria-label="Öne getir" title="Öne getir">${icon('chevronRight')}</button><button type="button" class="btn btn-sm icon-btn btn-ghost" data-layer-dup aria-label="Çoğalt" title="Çoğalt">${icon('plus')}</button><button type="button" class="btn btn-sm icon-btn btn-ghost" data-layer-del aria-label="Katmanı sil" title="Sil">${icon('trash')}</button><button type="button" class="btn btn-sm icon-btn btn-ghost" data-deselect aria-label="Kapat" title="Kapat">${icon('x')}</button></div></div>
      <div class="stack-sm">
      ${l.type === 'text' ? `
        <div class="field"><label for="lp-text">Yazı</label><textarea class="textarea" id="lp-text" data-prop="text" rows="3" maxlength="1000">${esc(l.text)}</textarea></div>
        <div class="form-grid tpl-field">
          <div class="field"><label for="lp-role">Şablonda bu kutuya</label><select class="select" id="lp-role" data-prop="role">${TEXT_ROLES.map(([k, v]) => `<option value="${k}" ${(l.role || 'text') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label for="lp-maxh">Kutu yüksekliği</label><input class="input" id="lp-maxh" type="number" min="0" max="4000" data-prop="maxH" value="${l.maxH || 0}" title="0 = sınırsız. Doluysa uzun yazı bu yüksekliğe sığana kadar küçülür."></div>
        </div>
        <p class="xsmall muted">Bu tasarımı şablon olarak kaydedince, post üretirken yalnızca işaretli kutular yeni metinle dolar; yerleşim ve görseller aynen kalır.</p>
        <div class="form-grid">
          <div class="field"><label for="lp-font">Font</label><select class="select" id="lp-font" data-prop="font">${fontList.map(f => `<option ${f === l.font ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
          <div class="field"><label for="lp-weight">Kalınlık</label><select class="select" id="lp-weight" data-prop="weight">${[400, 500, 600, 700, 800, 900].map(w => `<option value="${w}" ${w === l.weight ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
          <div class="field"><label for="lp-size">Boyut</label><input class="input" id="lp-size" type="number" min="10" max="300" data-prop="size" value="${l.size}"></div>
          <div class="field"><label for="lp-w">Genişlik</label><input class="input" id="lp-w" type="number" min="40" max="2000" data-prop="w" value="${l.w}"></div>
        </div>
        <div class="field"><span class="field-label">Hizalama</span><div class="seg">${[['left', 'Sol'], ['center', 'Orta'], ['right', 'Sağ']].map(([k, v]) => `<button type="button" data-align="${k}" class="${l.align === k ? 'active' : ''}">${v}</button>`).join('')}</div></div>
        <div class="field"><span class="field-label">Renk</span>${swatches('color', l.color)}</div>
        <div class="field"><span class="field-label">Vurgu rengi <span class="xsmall muted">(kelimeyi *yıldız* içine al)</span></span>${swatches('highlight', l.highlight || brand.colors.primary || '#5b55e6')}</div>`
      : l.type === 'qr' ? `
        <div class="field"><label for="lp-qr">Link ya da metin</label><textarea class="textarea" id="lp-qr" data-prop="text" rows="2" maxlength="200">${esc(l.text)}</textarea></div>
        <div class="field"><label for="lp-qw">Boyut</label><input class="input" id="lp-qw" type="number" min="80" max="2000" data-prop="w" value="${l.w}"></div>
        <div class="field"><span class="field-label">Renk (koyu renk seç; zemin her zaman beyaz kalır)</span>${swatches('color', l.color || '#000000')}</div>
        <p class="xsmall muted">Paylaşmadan önce telefon kamerasıyla okutup dene.</p>`
      : l.type === 'image' ? `
        <div class="form-grid"><div class="field"><label for="lp-iw">Genişlik</label><input class="input" id="lp-iw" type="number" min="10" max="4000" data-prop="w" value="${l.w}"></div>
          <div class="field"><label for="lp-ih">Yükseklik</label><input class="input" id="lp-ih" type="number" min="10" max="4000" data-prop="h" value="${l.h}"></div></div>
        <div class="field"><label for="lp-irole">Şablonda bu görsel</label><select class="select" id="lp-irole" data-prop="role">${IMAGE_ROLES.map(([k, v]) => `<option value="${k}" ${(l.role || '') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <button type="button" class="btn btn-sm" data-replace-image>Görseli değiştir</button>`
      : `<div class="form-grid"><div class="field"><label for="lp-sw">Genişlik</label><input class="input" id="lp-sw" type="number" min="1" max="4000" data-prop="w" value="${l.w}"></div>
          <div class="field"><label for="lp-sh">Yükseklik</label><input class="input" id="lp-sh" type="number" min="1" max="4000" data-prop="h" value="${l.h}"></div>
          ${l.shape === 'circle' ? '' : `<div class="field"><label for="lp-r">Köşe</label><input class="input" id="lp-r" type="number" min="0" max="1000" data-prop="radius" value="${l.radius || 0}"></div>`}</div>
        <label class="chip-check"><input type="checkbox" data-bubble ${l.role === 'bubble' ? 'checked' : ''}><span>Maskotun konuşma balonu (konuşma yoksa gizlenir)</span></label>
        <div class="field"><span class="field-label">Renk</span>${swatches('color', l.color)}</div>`}
      <div class="field"><label for="lp-op">Saydamlık: ${l.opacity != null ? l.opacity : 100}%</label><input type="range" id="lp-op" min="10" max="100" step="5" data-prop="opacity" value="${l.opacity != null ? l.opacity : 100}"></div>
      <div class="form-grid"><div class="field"><label for="lp-x">X</label><input class="input" id="lp-x" type="number" data-prop="x" value="${l.x}"></div><div class="field"><label for="lp-y">Y</label><input class="input" id="lp-y" type="number" data-prop="y" value="${l.y}"></div></div>
      </div>`;
  }

  // ---- Sol panel içerikleri
  async function assets() { if (!assetCache) assetCache = (await api.assets(brand.id)).assets; return assetCache; }
  const assetGrid = (list, empty) => (list.length
    ? `<div class="ed-asset-grid">${list.map(a => `<button type="button" class="ed-asset" data-add-asset="${esc(a.id)}" title="${esc(a.label || a.categoryLabel)}"><img src="${esc(a.thumbUrl || a.url)}" alt="${esc(a.label || '')}" loading="lazy"></button>`).join('')}</div>`
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
        <button type="button" class="ed-text-add" data-add="text" data-preset="body">Gövde metni ekle</button>
        <button type="button" class="ed-text-add" data-add="speech">💬 Maskot konuşma balonu ekle</button></div>
        <p class="xsmall muted mt-2">Konuşma balonu şablonda her postta konuya göre yeni bir cümleyle dolar; konuşma yoksa gizlenir.</p>
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
      // Çoklu seçimdeki bir katmandan tutulursa hepsi birlikte taşınır
      if (multi && hit && multi.includes(hit.id)) {
        drag = { group: slide().layers.filter(l => multi.includes(l.id)).map(l => ({ l, x: l.x, y: l.y })), sx: p.x, sy: p.y, moved: false };
        c.setPointerCapture(e.pointerId); c.focus(); return;
      }
      multi = null;
      setSelected(hit ? hit.id : null);
      if (hit) { drag = { id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y, moved: false }; c.setPointerCapture(e.pointerId); }
      c.focus();
      redraw();
    });
    c.addEventListener('pointermove', e => {
      if (!drag) return;
      const p = point(e);
      if (drag.group) { drag.group.forEach(g => { g.l.x = Math.round(g.x + p.x - drag.sx); g.l.y = Math.round(g.y + p.y - drag.sy); }); drag.moved = true; return quick(); }
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
      if (multi) return; // çoklu seçim tuşları belge düzeyinde
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
        body: list.length ? `<div class="asset-grid">${list.map(a => `<button type="button" class="asset asset-pick" data-pick="${esc(a.id)}"><div class="thumb"><img src="${esc(a.thumbUrl || a.url)}" alt=""></div><div class="meta small">${esc(a.label || a.categoryLabel)}</div></button>`).join('')}</div>`
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
    offerIdeaDelete();
  }
  // Post bir fikirden üretildiyse: dışa aktarınca tekrara düşmemek için fikri havuzdan silme önerisi (oturumda bir kez)
  let ideaAsked = false;
  function offerIdeaDelete() {
    if (ideaAsked || !data.idea || !data.idea.id) return;
    ideaAsked = true;
    const host = document.getElementById('toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast toast-info idea-del-toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span>Bu post <b>"${esc(data.idea.title)}"</b> fikrinden. Tekrara düşmemek için fikri havuzdan silelim mi?</span>
      <span class="row"><button type="button" class="btn btn-sm btn-primary" data-yes>Havuzdan sil</button><button type="button" class="btn btn-sm" data-no>Kalsın</button></span>`;
    host.appendChild(el);
    const close = () => el.remove();
    const timer = setTimeout(close, 20000);
    el.querySelector('[data-no]').addEventListener('click', () => { clearTimeout(timer); close(); });
    el.querySelector('[data-yes]').addEventListener('click', async () => {
      clearTimeout(timer);
      try { await api.deleteIdea(brand.id, data.idea.id); toast('Fikir havuzdan silindi (çöp kutusundan geri alınabilir).', 'success'); } catch (err) { toast(/bulunamad/i.test(err.message) ? 'Fikir zaten havuzda yok.' : err.message, 'info'); }
      close();
    });
  }

  const closeMenus = () => view.querySelectorAll('[data-drop]').forEach(d => { d.hidden = true; });
  const addLayer = l => { slide().layers.push(l); setSelected(l.id); markDirty(); redraw(); };

  // 11.8 Tüm slaytlara uygula: seçili katmanın karşılığı öbür slaytlarda bulunur ve aynı hâle getirilir.
  // Yazı: aynı roldeki yazının stili (metni değil). Görsel: aynı kaynaklı (değiştirildiyse eski kaynaklı) ya da aynı yerdeki
  // görsel; hiç yoksa slayta eklenir (ör. logo). Şekil/QR: aynı türde ve yakın yerdeki katman.
  function applyAll() {
    const src = layer();
    const near = (a, b) => Math.abs(a.x - b.x) < 60 && Math.abs(a.y - b.y) < 60;
    const STYLE = ['font', 'weight', 'size', 'color', 'align', 'w', 'x', 'y', 'opacity'];
    let changed = 0; let added = 0;
    data.slides.forEach((sl, i) => {
      if (i === current) return;
      let match = null;
      if (src.type === 'text') match = sl.layers.find(l => l.type === 'text' && l.role && l.role === src.role) || sl.layers.find(l => l.type === 'text' && near(l, src));
      else if (src.type === 'image') match = sl.layers.find(l => l.type === 'image' && (l.src === src.src || (src.prevSrc && l.src === src.prevSrc) || (src.prevAssetId && l.assetId === src.prevAssetId) || (src.assetId && l.assetId === src.assetId))) || sl.layers.find(l => l.type === 'image' && near(l, src) && Math.abs(l.w - src.w) < 80);
      else match = sl.layers.find(l => l.type === src.type && (l.shape || '') === (src.shape || '') && near(l, src));
      if (match) {
        if (src.type === 'text') STYLE.forEach(k => { if (src[k] !== undefined) match[k] = src[k]; });
        else Object.assign(match, JSON.parse(JSON.stringify(Object.assign({}, src, { id: match.id }))));
        changed++;
      } else if (src.type !== 'text') {
        sl.layers.push(JSON.parse(JSON.stringify(Object.assign({}, src, { id: Math.random().toString(36).slice(2, 10) }))));
        added++;
      }
    });
    if (!changed && !added) return toast('Öbür slaytlarda bu katmanın karşılığı bulunamadı.', 'info');
    markDirty();
    redraw();
    toast(`${changed} slaytta güncellendi${added ? `, ${added} slayta eklendi` : ''}. Geri almak için Ctrl+Z.`, 'success', 4500);
  }

  // 11.9 Klavye kısayolları (yazı alanındayken tarayıcının kendi kısayolları çalışır):
  // Ctrl+C / Ctrl+X katmanı kopyalar / keser, Ctrl+V yapıştırır; panoda görsel varsa (ör. ekrandan kırpılan) tasarıma
  // görsel olarak eklenir. Ctrl+Z geri al, Ctrl+Y ya da Ctrl+Shift+Z yinele, Ctrl+D çoğalt, Delete sil.
  let clip = null;
  const typing = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const alive = () => view.isConnected && $('#stage');
  const pasteLayer = l => {
    // Çoklu kopya: hepsi birlikte yapıştırılır ve seçili kalır
    if (Array.isArray(l)) {
      const copies = l.map(x => Object.assign(JSON.parse(JSON.stringify(x)), { id: Math.random().toString(36).slice(2, 10) }));
      const same = copies.every(c => slide().layers.some(o => o.x === c.x && o.y === c.y));
      copies.forEach(c => { if (same) { c.x += 24; c.y += 24; } slide().layers.push(c); });
      setSelected(null); multi = copies.map(c => c.id); markDirty(); return redraw();
    }
    const c = JSON.parse(JSON.stringify(l)); c.id = Math.random().toString(36).slice(2, 10); c.x += 24; c.y += 24; addLayer(c);
  };
  async function pasteImage(file) {
    try {
      toast('Görsel ekleniyor…', 'info', 1500);
      const { asset } = await api.uploadAsset(brand.id, file, 'brand_image', (file.name || 'Yapıştırılan görsel').replace(/\.[^.]+$/, '').slice(0, 80) || 'Yapıştırılan görsel');
      assetCache = null;
      const F = format();
      const img = new Image(); img.src = asset.url; await img.decode().catch(() => {});
      const k = Math.min(1, (F.w * 0.6) / (img.naturalWidth || F.w), (F.h * 0.6) / (img.naturalHeight || F.h));
      const w = Math.round((img.naturalWidth || F.w * 0.5) * k); const h = Math.round((img.naturalHeight || F.h * 0.5) * k);
      addLayer({ id: Math.random().toString(36).slice(2, 10), type: 'image', assetId: asset.id, src: asset.url, x: Math.round((F.w - w) / 2), y: Math.round((F.h - h) / 2), w, h });
      toast('Görsel tasarıma eklendi (kütüphanede de saklandı).', 'success');
    } catch (err) { toast(err.message, 'error'); }
  }
  const onKey = e => {
    if (!alive()) return document.removeEventListener('keydown', onKey, true);
    if (document.querySelector('.modal-backdrop') || typing(document.activeElement)) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); return undo(); }
    if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); return redo(); }
    // Ctrl+A: slayttaki bütün katmanları seç
    if (mod && k === 'a') {
      e.preventDefault();
      if (!slide().layers.length) return;
      setSelected(null); multi = slide().layers.map(l => l.id); quick();
      return toast(`${multi.length} katman seçildi: Ctrl+C / Ctrl+X, Delete, oklar ya da sürükle. Esc ile bırak.`, 'info', 2500);
    }
    if (multi) {
      const group = slide().layers.filter(l => multi.includes(l.id));
      const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (mv) { e.preventDefault(); const st = e.shiftKey ? 10 : 1; group.forEach(l => { l.x += mv[0] * st; l.y += mv[1] * st; }); markDirty(); return quick(); }
      if (e.key === 'Escape') { multi = null; return quick(); }
      if (mod && (k === 'c' || k === 'x')) {
        e.preventDefault();
        clip = JSON.parse(JSON.stringify(group));
        if (k === 'x') { slide().layers = slide().layers.filter(l => !multi.includes(l.id)); multi = null; markDirty(); redraw(); }
        return toast(`${clip.length} katman ${k === 'x' ? 'kesildi' : 'kopyalandı'}; Ctrl+V ile yapıştır.`, 'info', 1800);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); slide().layers = slide().layers.filter(l => !multi.includes(l.id)); multi = null; markDirty(); return redraw(); }
    }
    if (mod && (k === 'c' || k === 'x') && layer()) {
      e.preventDefault();
      clip = JSON.parse(JSON.stringify(layer()));
      if (k === 'x') { slide().layers = slide().layers.filter(x => x.id !== selected); setSelected(null); markDirty(); redraw(); toast('Katman kesildi; Ctrl+V ile yapıştır.', 'info', 1800); }
      else toast('Katman kopyalandı; Ctrl+V ile istediğin slayta yapıştır.', 'info', 1800);
      return;
    }
    if (mod && k === 'd' && layer()) { e.preventDefault(); return pasteLayer(layer()); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && layer() && document.activeElement !== $('#stage')) { e.preventDefault(); slide().layers = slide().layers.filter(x => x.id !== selected); setSelected(null); markDirty(); redraw(); }
  };
  // Yapıştırma: önce panodaki görsel, yoksa kopyalanan katman. İlham rafı (marka geneli Ctrl+V) düzenleyicide devreye girmez.
  const onPaste = e => {
    if (!alive()) return document.removeEventListener('paste', onPaste, true);
    if (document.querySelector('.modal-backdrop') || typing(e.target) || typing(document.activeElement)) return;
    const file = [...(e.clipboardData ? e.clipboardData.files : [])].find(f => /^image\/(png|jpeg|webp|gif)$/.test(f.type));
    if (file) { e.preventDefault(); e.stopImmediatePropagation(); return pasteImage(file); }
    if (clip) { e.preventDefault(); e.stopImmediatePropagation(); return pasteLayer(clip); }
  };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('paste', onPaste, true);
  const addAssetLayer = a => { const F = format(); const small = a.category === 'logo' || a.category === 'sticker'; const s = small ? 240 : 480; addLayer({ id: uid(), type: 'image', src: a.url, assetId: a.id, ...(a.category === 'mascot' ? { role: 'mascot' } : a.category === 'logo' ? { role: 'logo' } : {}), x: Math.round(F.w / 2 - s / 2), y: Math.round(F.h / 2 - s / 2), w: s, h: s }); };
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
    if (t.matches('[data-bubble]') && layer()) { const lb = layer(); if (t.checked) lb.role = 'bubble'; else delete lb.role; markDirty(); return; }
    const prop = t.dataset.prop;
    const l = layer();
    if (!prop || !l) return;
    l[prop] = ['text', 'font', 'color', 'role'].includes(prop) ? t.value : Number(t.value);
    if (prop === 'maxH' && !(l.maxH > 0)) delete l.maxH;
    // Doldurulacak bir kutu seçilince yüksekliği şimdiki hâlinden alınır: uzun metin buna sığdırılır
    if (prop === 'role' && l.type === 'text' && FILL_ROLES.includes(l.role) && !l.maxH) {
      const ctx = document.createElement('canvas').getContext('2d');
      l.maxH = Math.round(Math.max(layerBox(ctx, l).h, l.size * 2.4));
      const mh = $('#lp-maxh'); if (mh) mh.value = l.maxH;
    }
    if (l.type === 'qr' && prop === 'w') l.h = l.w;
    markDirty();
    quick();
  };
  view.onchange = e => { if (e.target.dataset.prop || e.target.id === 'slide-bg') redraw({ keepProps: Boolean(e.target.dataset.prop) }); };

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
        return addLayer(Object.assign({ id: uid(), type: 'text', role: pr === 'title' ? 'title' : pr === 'body' ? 'body' : 'text', x: 90, y: Math.round(F.h / 2), w: 800, color: brand.colors.heading || '#1b1f3b', align: 'left' }, spec, { font: spec.font || 'Poppins' }));
      }
      if (add.dataset.add === 'speech') {
        // Balon (şekil) + içindeki konuşma yazısı; ikisi de şablon rolüyle işaretli
        const bx = Math.round(F.w * 0.18); const by = Math.round(F.h * 0.62);
        slide().layers.push({ id: uid(), type: 'shape', shape: 'rect', role: 'bubble', x: bx, y: by, w: 420, h: 110, color: '#ffffff', radius: 40 });
        return addLayer({ id: uid(), type: 'text', role: 'speech', text: 'Kaydırarak incele 👀', x: bx + 34, y: by + 34, w: 360, size: 36, maxH: 50, color: '#0b132b', font: brand.fonts.heading || 'Poppins', weight: 800, align: 'left' });
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
    if (t.closest('[data-replace-image]') && layer()) return pickAsset(a => { const l = layer(); Object.assign(l, { prevSrc: l.prevSrc || l.src, prevAssetId: l.prevAssetId || l.assetId, src: a.url, assetId: a.id }); markDirty(); redraw(); });
    if (t.closest('[data-apply-all]') && layer()) return applyAll();
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
          const name = prompt('Şablon adı (boş bırakırsan "Şablon N" olur)', '');
          if (name === null) return;
          if (dirty) { post = (await api.savePost(brand.id, post.id, { data })).post; dirty = false; }
          await api.saveTemplate(brand.id, post.id, name.trim());
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
    if (dr && !driveReady) { closeMenus(); return toast(state.settings && state.settings.drive && state.settings.drive.configured ? 'Bu markanın Drive klasörü yok: Marka kimliği → Profil\'de klasör linkini ekle.' : 'Drive bağlı değil: Ayarlar → Google Drive bölümünden bağla, sonra markanın klasör linkini ekle.', 'info', 6000); }
    if (dr) { closeMenus(); try { await busy(dr, () => exportSlides(dr.dataset.drive, 'drive')); toast('Google Drive klasörüne gönderildi.', 'success'); } catch (err) { toast(err.message, 'error'); } }
  };
  // Kaydedilmemiş değişiklik varken sayfadan ayrılma uyarısı
  window.onbeforeunload = () => (dirty ? true : undefined);
  shell();
}
