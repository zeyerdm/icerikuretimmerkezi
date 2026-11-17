// Post stüdyosu (ilk sürüm): konudan carousel/post üretimi ve katmanlı editör.
// Katmanı tıkla seç, sürükle taşı (ok tuşlarıyla ince ayar); yazı, renk, font, boyut sağ panelden; logo/maskot/görsel kütüphaneden.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState, busy, openModal, errorNotice, timeAgo } from '../ui.js';
import { state, go } from '../app.js';
import { aiModels, modelSelect, busyTimer, streamBusy, aiNote, bindCostHint } from '../aiPicker.js';
import { drawSlide, resolveImages, slideBlob, hitTest, layerBox, handlesOf } from '../postCanvas.js';
import { downloadBlob, safeName, drawTitle, ensureTitleFonts } from '../titlePng.js';
import { reviewBox } from './review.js';
import { canvasesToPdf } from '../pdf.js';
import { openColorPicker, gradCss } from '../colorPicker.js';
import { STOCK_KINDS, loadStock, itemsOf, searchItems, svgUrl, svgToPng } from '../stockPacks.js';

// Şablon alanları: post üretilirken bu rollerdeki kutular yeni metinle dolar, gerisi aynen kalır
// Şablon alanları: her alanın kimliği (MAIN_TITLE gibi) görünür; aynı alan birden çok kutuda ve sayfada olabilir
const TEXT_ROLES = [['text', 'Sabit yazı (değişmez)'], ['title', 'Ana başlık · MAIN_TITLE'], ['subtitle', 'Alt başlık · SUB_TITLE'], ['body', 'Açıklama · DESCRIPTION'], ['stat', 'İstatistik / sayı · STAT'], ['item', 'Madde · ITEM'], ['cta', 'Buton yazısı · CTA'], ['speech', 'Maskot konuşması · SPEECH'], ['topic', 'Konu etiketi · TOPIC'], ['num', 'Slayt numarası · PAGE_NUMBER'], ['page', 'Slayt sayısı (/ 06) · PAGE_TOTAL'], ['custom', 'Özel alan (kendi adın)']];
const FILL_ROLES = ['title', 'subtitle', 'body', 'stat', 'item', 'cta', 'speech', 'custom'];
// Hazır zeminler: düz renkler ve gradyanlar
const BG_PRESETS = [
  { n: 'Gece', c: '#0b1020' }, { n: 'Krem', c: '#fff1e6' }, { n: 'Kağıt', c: '#f4f1ea' }, { n: 'Pastel pembe', c: '#fbe4ee' }, { n: 'Adaçayı', c: '#6d8a86' }, { n: 'Siyah', c: '#111111' },
  { n: 'Gün batımı', g: { type: 'linear', angle: 45, stops: [{ c: '#ff7a59', p: 0 }, { c: '#ffd166', p: 100 }] } },
  { n: 'Mor gece', g: { type: 'linear', angle: 135, stops: [{ c: '#1e1b4b', p: 0 }, { c: '#7c3aed', p: 100 }] } },
  { n: 'Okyanus', g: { type: 'linear', angle: 90, stops: [{ c: '#0ea5e9', p: 0 }, { c: '#1e3a8a', p: 100 }] } },
  { n: 'Pastel', g: { type: 'linear', angle: 60, stops: [{ c: '#fbcfe8', p: 0 }, { c: '#c7d2fe', p: 100 }] } },
  { n: 'Nane', g: { type: 'linear', angle: 120, stops: [{ c: '#d1fae5', p: 0 }, { c: '#34d399', p: 100 }] } },
  { n: 'Spot ışık', g: { type: 'radial', angle: 0, stops: [{ c: '#3b3f70', p: 0 }, { c: '#0b1020', p: 100 }] } },
  { n: 'Turuncu ışık', g: { type: 'radial', angle: 0, stops: [{ c: '#ff9a3c', p: 0 }, { c: '#c2410c', p: 100 }] } },
  { n: 'Gri', g: { type: 'linear', angle: 90, stops: [{ c: '#f8fafc', p: 0 }, { c: '#cbd5e1', p: 100 }] } }
];
const MASCOT_OPTS = [['auto', 'Maskot: otomatik yerleştir'], ['manual', 'Maskot: ben yerleştireceğim'], ['none', 'Maskot: kullanma']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
const IMAGE_ROLES = [['', 'Sabit görsel (değişmez)'], ['mascot', 'Maskot yeri · MASCOT (poz konuya göre seçilir)'], ['logo', 'Logo · LOGO'], ['main', 'Ana görsel · MAIN_IMAGE (her içerikte değiştirilecek)']];
// Şablonun hangi alanları her postta doluyor (kartta gösterilir)
const ROLE_NAMES = { title: 'Ana başlık', subtitle: 'Alt başlık', body: 'Açıklama', stat: 'İstatistik', item: 'Madde', cta: 'Buton', speech: 'Maskot konuşması', topic: 'Konu', num: 'Slayt no', mascot: 'Maskot yeri', main: 'Ana görsel' };
// Katmanlar panelindeki ad: verilen ad, yoksa yazının başı ya da türü
function layerName(l) {
  if (l.name) return l.name;
  if (l.type === 'text') return `T  ${String(l.text || '').replace(/[*\n]/g, ' ').trim().slice(0, 28) || 'Metin'}`;
  if (l.type === 'image') return l.role === 'mascot' ? 'Maskot' : l.role === 'logo' ? 'Logo' : 'Görsel';
  if (l.type === 'qr') return 'QR kod';
  return l.role === 'bubble' ? 'Konuşma balonu' : l.shape === 'circle' ? 'Daire' : 'Şekil';
}
function tplFields(t) {
  const set = new Set();
  (t.data.slides || []).forEach(s => (s.layers || []).forEach(l => { if (l.fixed) return; if (l.field && l.type === 'text') set.add(l.field); else if (ROLE_NAMES[l.role] && (l.type === 'text' || l.role === 'mascot' || l.role === 'main')) set.add(ROLE_NAMES[l.role]); }));
  return [...set];
}
import { youtubePreview } from './youtube.js';

const base = brand => `#/m/${encodeURIComponent(brand.id)}/post`;
const uid = () => Math.random().toString(36).slice(2, 10);

export async function renderPosts(view, brand, sub) {
  view.onclick = view.onchange = view.oninput = view.onkeydown = view.ondblclick = null;
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
      <select class="select w-auto" name="mascot" aria-label="Maskot" title="Maskot kullanımı">${MASCOT_OPTS}</select>
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
  view.insertAdjacentHTML('beforeend', `<section class="card mt-4"><div class="card-head"><h3>Ortak şablon kütüphanesi</h3><span class="small muted">${sharedTpls.length} · bütün markalarda · ${sharedTpls.filter(t => t.builtin).length} hazır tasarım</span></div>
    ${sharedTpls.length ? `<p class="small muted mb-3">Önizlemeler ${esc(brand.name)} markasının renkleri, yazı tipleri, logosu ve maskotuyla gösteriliyor. "Şablonlarıma ekle" dersen tasarım bu markanın şablonlarına girer; post üretirken "Tasarım" listesinden seçilir ve yalnızca yazılar değişir.</p><div class="post-grid">${sharedTpls.map(t => `<div class="post-card tpl-card">
      <div class="post-thumb"><canvas data-shared-thumb="${esc(t.id)}" aria-hidden="true"></canvas></div>
      <div class="strong truncate">${t.builtin ? '<span class="badge">Hazır</span> ' : ''}${esc(t.name)}</div><div class="xsmall muted">${esc(t.kindLabel)} · ${(t.data && t.data.slides.length) || 1} slayt${t.sourceBrandName ? ` · ${esc(t.sourceBrandName)} markasından` : ''}</div>
      <div class="row mt-2"><button class="btn btn-sm" data-use-shared="${esc(t.id)}">Tasarım aç</button><button class="btn btn-sm btn-ghost" data-shared-tobrand="${esc(t.id)}">Şablonlarıma ekle</button>${t.builtin ? '' : `<button class="btn btn-sm btn-ghost icon-btn" data-del-shared="${esc(t.id)}" aria-label="Ortak şablonu sil">${icon('trash')}</button>`}</div>
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
      const res = await streamBusy(e.submitter, st => api.createPost(brand.id, { topic, kind: 'carousel', slides: Number(fd.get('slides')), templateId, mascot: fd.get('mascot') || 'auto' }, st));
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
    const tb = e.target.closest('[data-shared-tobrand]');
    if (tb) {
      try { const { template } = await busy(tb, () => api.sharedToBrand(brand.id, tb.dataset.sharedTobrand)); toast(`"${template.name}" şablonlarına eklendi; post üretirken Tasarım listesinden seç.`, 'success', 5000); renderPosts(view, brand, null); } catch (err) { toast(err.message, 'error'); }
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
      <div class="field"><label for="fi-mascot">Maskot</label><select class="select" id="fi-mascot" name="mascot">${MASCOT_OPTS}</select></div>
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
        r = await streamBusy(form.querySelector('[type=submit]'), st => api.postFromIdea(brand.id, { ideaId: idea.id, templateId: fd.get('templateId') || null, slides: Number(fd.get('slides')) || null, mascot: fd.get('mascot') || 'auto', model: form.querySelector('#fi-model').value || null }, st), 'Yazıyor');
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
const REF_DESC = {
  carousel: 'Model seçtiklerinin ortak tasarım dilini çıkarır ve 3 yapı kurar: <b>kapak</b> (güçlü hook, kaydırma isteği), bütün ara sayfalarda tekrar eden <b>bilgi sayfası</b> ve <b>kapanış</b> (sonuç, istenirse çağrı). Üçü tek hikâyenin parçaları gibi aynı dili paylaşır. Metinler kopyalanmaz; logo, maskot ve balon yerlerine markanın kendi görselleri konur.',
  tekli: 'Tek bir 4:5 gönderi tasarımı kurulur. Mümkünse tek referans seç: çok referans tasarım kararlarını karıştırabilir.',
  kapak: 'Reels kapağı (9:16) kurulur: ızgarada da okunacak büyük başlık; üst ve alt arayüz alanı boş bırakılır.',
  story: 'Story (9:16) tasarımı kurulur: tek mesaj, etkileşim için boş alan.',
  diger: 'Görselin türüne uygun tek tasarım kurulur; oran görselden çıkarılır.'
};
const refCard = (a, on) => `<div class="asset-wrap"><button type="button" class="asset asset-pick ${on ? 'is-picked' : ''}" data-ref-pick="${esc(a.id)}"><div class="thumb"><img src="${esc(a.thumbUrl || a.url)}" alt=""></div><div class="meta small">${esc(a.label || 'Referans')}</div></button>
  <button type="button" class="asset-del" data-ref-del="${esc(a.id)}" aria-label="${esc(a.label || 'Referans')} referansını sil" title="Sil">${icon('trash')}</button></div>`;
async function referenceFlow(brand, models, refresh) {
  let refs;
  try { refs = (await api.assets(brand.id, 'reference')).assets; } catch (err) { return toast(err.message, 'error'); }
  // Birden çok referans seçilebilir: hepsi birlikte incelenir, en iyi tasarım dili seçilir (en fazla 6)
  const picked = new Set(refs[0] ? [refs[0].id] : []);
  // Önce tasarım türü: carousel 3 yapı (kapak, içerik, kapanış), diğerleri tek tasarım
  let type = 'carousel';
  let combine = true;
  const single = () => type !== 'carousel' && !combine;
  const syncPick = () => {
    // "Tek referanstan ilham al" modunda yalnızca bir seçim tutulur
    if (single() && picked.size > 1) { const first = [...picked][picked.size - 1]; picked.clear(); picked.add(first); }
    m.form.querySelectorAll('[data-ref-pick]').forEach(x => { x.classList.toggle('is-picked', picked.has(x.dataset.refPick)); x.setAttribute('aria-pressed', String(picked.has(x.dataset.refPick))); });
    m.form.querySelector('#ref-count').textContent = picked.size ? `${picked.size} referans seçili${picked.size > 1 ? ': ortak tasarım dili analiz edilir, hiçbiri birebir kopyalanmaz' : ''}` : 'Referans seçilmedi';
    m.form.querySelector('#ref-warn').hidden = !(type !== 'carousel' && combine && picked.size > 2);
    m.form.querySelector('#ref-mode').hidden = type === 'carousel';
    m.form.querySelector('#ref-desc').innerHTML = REF_DESC[type];
  };
  const m = openModal({
    title: 'Referanstan şablon', submitLabel: 'İncele ve şablona çevir',
    body: `<div class="field"><span class="field-label">1. Referans ne tür bir tasarım?</span><div class="chips" role="radiogroup">${[['carousel', 'Carousel / çoklu gönderi'], ['tekli', 'Tekli gönderi'], ['kapak', 'Reels kapağı'], ['story', 'Story'], ['diger', 'Diğer']].map(([k, v]) => `<button type="button" role="radio" class="chip ${k === 'carousel' ? 'active' : ''}" aria-checked="${k === 'carousel'}" data-ref-type="${k}">${v}</button>`).join('')}</div></div>
      <div class="field mt-2" id="ref-mode" hidden><span class="field-label">Çalışma biçimi</span><div class="seg seg-sm" role="radiogroup"><button type="button" role="radio" data-ref-combine="0">Tek referanstan ilham al</button><button type="button" role="radio" class="active" data-ref-combine="1">Seçtiklerimi birlikte değerlendir</button></div></div>
      <p class="small muted mt-2 mb-3" id="ref-desc"></p>
      <p class="notice small mb-2" id="ref-warn" hidden>Tek gönderide çok sayıda referans tasarım kararlarını karıştırabilir. En iyi sonuç için 1-2 referans seç ya da "Tek referanstan ilham al".</p>
      <span class="field-label">2. Referansları seç</span>
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
      const res = await busyTimer(form.querySelector('[type=submit]'), () => api.analyzeDesign(brand.id, { assetIds: [...picked], type, combine, name: fd.get('name'), model: form.querySelector('#ref-model').value || null }), 'İnceliyor');
      showResult(res);
    }
  });
  syncPick();
  m.form.addEventListener('click', async e => {
    const rt = e.target.closest('[data-ref-type]');
    if (rt) { e.preventDefault(); type = rt.dataset.refType; m.form.querySelectorAll('[data-ref-type]').forEach(b => { b.classList.toggle('active', b === rt); b.setAttribute('aria-checked', String(b === rt)); }); if (type === 'carousel') combine = true; m.form.querySelectorAll('[data-ref-combine]').forEach(b => b.classList.toggle('active', (b.dataset.refCombine === '1') === combine)); return syncPick(); }
    const rc = e.target.closest('[data-ref-combine]');
    if (rc) { e.preventDefault(); combine = rc.dataset.refCombine === '1'; m.form.querySelectorAll('[data-ref-combine]').forEach(b => b.classList.toggle('active', b === rc)); return syncPick(); }
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
  ['metin', 'Metin', 'edit'], ['katmanlar', 'Katmanlar', 'layers'], ['ogeler', 'Öğeler', 'palette'], ['marka', 'Marka', 'identity'], ['yuklemeler', 'Yüklemeler', 'upload'],
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
  let guides = []; // sürüklerken mıknatısın tuttuğu hizalama çizgileri
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
          <button type="button" class="ed-top-btn icon-only" data-act="undo" title="Geri al (Ctrl+Z)" aria-label="Geri al">${icon('undo')}</button>
          <button type="button" class="ed-top-btn icon-only" data-act="redo" title="Yinele (Ctrl+Shift+Z)" aria-label="Yinele">${icon('redo')}</button>
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
                <button type="button" data-pdf>${icon('download')}<span>${data.slides.length > 1 ? 'PDF olarak indir (bütün slaytlar)' : 'PDF olarak indir'}</span></button>
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

  // Aynı alanda art arda yapılan değişiklikler (yazı yazma, kaydırıcı sürükleme) tek adım sayılır
  let lastKey = ''; let lastAt = 0;
  function markDirty(fromHistory = false, key = '') {
    if (!fromHistory) {
      const now = JSON.stringify(data);
      if (now !== lastSnap) {
        const merge = key && key === lastKey && Date.now() - lastAt < 1200 && undoStack.length;
        if (!merge) { undoStack.push(lastSnap); if (undoStack.length > 100) undoStack.shift(); }
        redoStack.length = 0; lastSnap = now;
      }
      lastKey = key; lastAt = Date.now();
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
    // Tuval, görsel ve yazı tipleri yüklenmeden önce de boyutunu alır (yerleşim sıçramasın)
    const c0 = $('#stage');
    if (c0) { const F = format(); if (c0.width !== F.w || c0.height !== F.h) { c0.width = F.w; c0.height = F.h; } fit(); }
    await resolveImages(s);
    const c = $('#stage');
    if (!c) return;
    drawSlide(c, s, format(), { selectedId: multi || selected, handles: true, showHidden: true, guides });
    fit();
    drawList();
    // Panelden çıkarken (change) panel yeniden çizilmez: aynı anda basılan düğmenin tıklaması kaybolmasın
    if (!keepProps) drawProps();
    if (panel === 'katmanlar') drawPanelBody();
  }
  const quick = () => { const c = $('#stage'); if (c) drawSlide(c, slide(), format(), { selectedId: multi || selected, handles: true, showHidden: true, guides }); };

  function drawList() {
    const list = $('#slide-list');
    list.innerHTML = data.slides.map((s, i) => `<button type="button" class="slide-thumb ${i === current ? 'active' : ''}" data-slide="${i}" draggable="true" aria-label="Slayt ${i + 1}" aria-current="${i === current}" title="Sürükleyerek sırala · sağ tık: sayfa işlemleri"><canvas></canvas><span>${i + 1}</span></button>`).join('');
    // Sürükle-bırak ile sayfa sıralama; sağ tıkla sayfa menüsü
    list.ondragstart = e => { const b = e.target.closest('[data-slide]'); if (!b) return; e.dataTransfer.setData('text/x-slide', b.dataset.slide); e.dataTransfer.effectAllowed = 'move'; };
    list.ondragover = e => { if (e.target.closest('[data-slide]')) { e.preventDefault(); list.querySelectorAll('.drop-to').forEach(x => x.classList.remove('drop-to')); e.target.closest('[data-slide]').classList.add('drop-to'); } };
    list.ondragleave = () => list.querySelectorAll('.drop-to').forEach(x => x.classList.remove('drop-to'));
    list.ondrop = e => {
      const b = e.target.closest('[data-slide]'); const from = Number(e.dataTransfer.getData('text/x-slide'));
      list.querySelectorAll('.drop-to').forEach(x => x.classList.remove('drop-to'));
      if (!b || !Number.isInteger(from)) return; e.preventDefault();
      const to = Number(b.dataset.slide); if (to === from) return;
      const [m] = data.slides.splice(from, 1); data.slides.splice(to, 0, m); current = to; setSelected(null); multi = null; markDirty(); shell();
    };
    list.oncontextmenu = e => {
      const b = e.target.closest('[data-slide]'); if (!b) return; e.preventDefault();
      view._ctxPage = Number(b.dataset.slide);
      ctxMenu(e.clientX, e.clientY, [['pg-dup', 'Sayfayı çoğalt'], ['pg-copy', 'Sayfayı kopyala'], ['pg-paste', 'Sayfayı yapıştır (sonrasına)', '', !pageClip], '-', ['pg-left', 'Sola taşı', '', view._ctxPage === 0], ['pg-right', 'Sağa taşı', '', view._ctxPage === data.slides.length - 1], '-', ['pg-del', 'Sayfayı sil', '', data.slides.length <= 1]]);
    };
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
    if (l.type === 'image' && l.role === 'mascot') setTimeout(fillPoses, 0);
    const range = (key, label, value, min, max, step, unit = '') => `<div class="field"><label for="lp-${key}">${label}: <span data-val="${key}">${value}${unit}</span></label><input type="range" id="lp-${key}" min="${min}" max="${max}" step="${step}" data-prop="${key}" data-unit="${unit}" value="${value}"></div>`;
    // Hızlı renkler + seçili rengi gösteren ayrı düğme (açınca renk seçici; şekilde gradyan da)
    const swatches = (key, value) => { const g = key === 'color' && l.type === 'shape' && l.gradient; return `<div class="swatch-row">${palette.map(c => `<button type="button" class="swatch-btn ${!g && String(c).toLowerCase() === String(value).toLowerCase() ? 'on' : ''}" style="background:${esc(c)}" data-swatch="${key}" data-color="${esc(c)}" aria-label="${esc(c)}" title="${esc(c)}"></button>`).join('')}<button type="button" class="cp-trigger" data-cp="${key}" title="Renk seçici"><span class="cp-trigger-sw" style="background:${g ? gradCss(g) : esc(value)}"></span><span>${g ? 'Gradyan' : esc(String(value).toUpperCase())}</span></button></div>`; };
    p.innerHTML = `${data.slides.length > 1 ? `<button type="button" class="btn btn-sm w-full mb-3" data-apply-all title="${l.type === 'text' ? 'Yazı stili (font, boyut, renk, hizalama, konum) aynı roldeki yazılara uygulanır; yazının kendisi değişmez' : 'Aynı görsel/şekil öbür slaytlarda da bu hâle gelir; olmayan slayta eklenir'}">${icon('grid')}Tüm slaytlara uygula</button>` : ''}<div class="ed-props-head"><h3>${l.type === 'text' ? 'Metin' : l.type === 'image' ? 'Görsel' : l.type === 'qr' ? 'QR kod' : l.shape === 'circle' ? 'Daire' : 'Şekil'}</h3>
      <div class="row"><button type="button" class="btn btn-sm icon-btn btn-ghost" data-order="-1" aria-label="Geri gönder" title="Geri gönder">${icon('chevronLeft')}</button><button type="button" class="btn btn-sm icon-btn btn-ghost" data-order="1" aria-label="Öne getir" title="Öne getir">${icon('chevronRight')}</button><button type="button" class="btn btn-sm icon-btn btn-ghost" data-layer-dup aria-label="Çoğalt" title="Çoğalt">${icon('plus')}</button><button type="button" class="btn btn-sm icon-btn btn-ghost" data-layer-del aria-label="Katmanı sil" title="Sil">${icon('trash')}</button><button type="button" class="btn btn-sm icon-btn btn-ghost" data-deselect aria-label="Kapat" title="Kapat">${icon('x')}</button></div></div>
      <div class="stack-sm">
      ${l.type === 'text' ? `
        <div class="field"><label for="lp-text">Yazı</label><textarea class="textarea" id="lp-text" data-prop="text" rows="3" maxlength="1000">${esc(l.text)}</textarea></div>
        <div class="form-grid tpl-field">
          <div class="field"><label for="lp-role">Şablon alanı</label><select class="select" id="lp-role" data-prop="role">${TEXT_ROLES.map(([k, v]) => `<option value="${k}" ${(l.field && !TEXT_ROLES.some(r => r[0] === l.role && r[0] !== 'text' && r[0] !== 'custom') ? 'custom' : (l.role || 'text')) === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label for="lp-maxh">Kutu yüksekliği</label><input class="input" id="lp-maxh" type="number" min="0" max="4000" data-prop="maxH" value="${l.maxH || 0}" title="0 = sınırsız. Doluysa uzun yazı bu yüksekliğe sığana kadar küçülür."></div>
        </div>
        ${l.role === 'custom' || (l.field && l.role === 'text') ? `<div class="field"><label for="lp-field">Alan kimliği</label><input class="input" id="lp-field" data-field-name value="${esc(l.field || '')}" maxlength="30" placeholder="Ör. FIYAT, TARIH, SEHIR" title="Büyük harf, rakam ve alt çizgi. Aynı kimlik başka kutularda da varsa hepsi aynı değerle dolar."></div>` : ''}
        ${l.role && l.role !== 'text' ? `<label class="chip-check"><input type="checkbox" data-flag="fixed" ${l.fixed ? 'checked' : ''}><span>Sabit: yapay zekâ bu alanı değiştirmesin</span></label>` : ''}
        <p class="xsmall muted">Bu tasarımı şablon olarak kaydedince, post üretirken yalnızca işaretli ve sabit olmayan alanlar yeni içerikle dolar; yerleşim, renkler ve diğer öğeler aynen kalır.</p>
        <div class="form-grid">
          <div class="field"><label for="lp-font">Font</label><select class="select" id="lp-font" data-prop="font">${fontList.map(f => `<option ${f === l.font ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
          <div class="field"><label for="lp-weight">Kalınlık</label><select class="select" id="lp-weight" data-prop="weight">${[400, 500, 600, 700, 800, 900].map(w => `<option value="${w}" ${w === l.weight ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
          <div class="field"><label for="lp-size">Boyut</label><input class="input" id="lp-size" type="number" min="10" max="300" data-prop="size" value="${l.size}"></div>
          <div class="field"><label for="lp-w">Genişlik</label><input class="input" id="lp-w" type="number" min="40" max="2000" data-prop="w" value="${l.w}"></div>
        </div>
        <div class="field"><span class="field-label">Hizalama</span><div class="seg">${[['left', 'Sol'], ['center', 'Orta'], ['right', 'Sağ']].map(([k, v]) => `<button type="button" data-align="${k}" class="${l.align === k ? 'active' : ''}">${v}</button>`).join('')}</div></div>
        <div class="field"><span class="field-label">Renk</span>${swatches('color', l.color)}</div>
        <div class="field"><span class="field-label">Vurgu rengi <span class="xsmall muted">(kelimeyi *yıldız* içine al)</span></span>${swatches('highlight', l.highlight || brand.colors.primary || '#5b55e6')}</div>
        <details class="ed-fx" ${l.lineHeight || l.letterSpacing || l.upper || l.shadow || l.strokeW || l.bgColor ? 'open' : ''}><summary>Yazı efektleri</summary><div class="stack-sm mt-2">
          ${range('lineHeight', 'Satır aralığı', l.lineHeight || 1.2, 0.8, 2.5, 0.05)}
          ${range('letterSpacing', 'Harf aralığı', l.letterSpacing || 0, -5, 30, 1, 'px')}
          <label class="chip-check"><input type="checkbox" data-flag="upper" ${l.upper ? 'checked' : ''}><span>HEPSİ BÜYÜK HARF</span></label>
          ${range('shadow', 'Gölge', l.shadow || 0, 0, 60, 1)}
          ${l.shadow ? `<div class="field"><span class="field-label">Gölge rengi</span>${swatches('shadowColor', l.shadowColor || '#000000')}</div>` : ''}
          ${range('strokeW', 'Dış çizgi', l.strokeW || 0, 0, 20, 1, 'px')}
          ${l.strokeW ? `<div class="field"><span class="field-label">Çizgi rengi</span>${swatches('strokeColor', l.strokeColor || '#000000')}</div>` : ''}
          <label class="chip-check"><input type="checkbox" data-flag="bgBox" ${l.bgColor ? 'checked' : ''}><span>Yazının arkasına kutu</span></label>
          ${l.bgColor ? `<div class="field"><span class="field-label">Kutu rengi</span>${swatches('bgColor', l.bgColor)}</div>${range('bgPad', 'Kutu boşluğu', l.bgPad != null ? l.bgPad : 20, 0, 80, 1, 'px')}${range('bgRadius', 'Kutu köşesi', l.bgRadius || 0, 0, 80, 1, 'px')}` : ''}
        </div></details>`
      : l.type === 'qr' ? `
        <div class="field"><label for="lp-qr">Link ya da metin</label><textarea class="textarea" id="lp-qr" data-prop="text" rows="2" maxlength="200">${esc(l.text)}</textarea></div>
        <div class="field"><label for="lp-qw">Boyut</label><input class="input" id="lp-qw" type="number" min="80" max="2000" data-prop="w" value="${l.w}"></div>
        <div class="field"><span class="field-label">Renk (koyu renk seç; zemin her zaman beyaz kalır)</span>${swatches('color', l.color || '#000000')}</div>
        <p class="xsmall muted">Paylaşmadan önce telefon kamerasıyla okutup dene.</p>`
      : l.type === 'image' ? `
        <div class="form-grid"><div class="field"><label for="lp-iw">Genişlik</label><input class="input" id="lp-iw" type="number" min="10" max="4000" data-prop="w" value="${l.w}"></div>
          <div class="field"><label for="lp-ih">Yükseklik</label><input class="input" id="lp-ih" type="number" min="10" max="4000" data-prop="h" value="${l.h}"></div></div>
        <details class="ed-fx" open><summary>Görsel ayarları</summary><div class="stack-sm mt-2">
          <label class="chip-check"><input type="checkbox" data-flag="fit" ${l.fit === 'cover' ? 'checked' : ''}><span>Kutuyu doldur (taşanı kırp)</span></label>
          ${range('radius', 'Köşe yuvarlaklığı', l.radius || 0, 0, Math.round(Math.min(l.w, l.h) / 2), 1, 'px')}
          <div class="row"><label class="chip-check"><input type="checkbox" data-flag="circle" ${l.circle ? 'checked' : ''}><span>Daire</span></label><label class="chip-check"><input type="checkbox" data-flag="flipX" ${l.flipX ? 'checked' : ''}><span>Aynala</span></label></div>
          ${range('brightness', 'Parlaklık', l.brightness != null ? l.brightness : 100, 0, 200, 5, '%')}
          ${range('contrast', 'Kontrast', l.contrast != null ? l.contrast : 100, 0, 200, 5, '%')}
          ${range('saturate', 'Doygunluk', l.saturate != null ? l.saturate : 100, 0, 200, 5, '%')}
          ${range('grayscale', 'Siyah-beyaz', l.grayscale || 0, 0, 100, 5, '%')}
          ${range('blur', 'Bulanıklık', l.blur || 0, 0, 20, 1, 'px')}
          ${range('shadow', 'Gölge', l.shadow || 0, 0, 60, 1)}
          <button type="button" class="btn btn-sm btn-ghost" data-fx-reset>Ayarları sıfırla</button>
        </div></details>
        ${l.role === 'mascot' ? `<div class="field"><span class="field-label">Maskot pozu</span><div class="pose-grid" id="lp-poses"><span class="xsmall muted">Pozlar yükleniyor…</span></div></div>
          <div class="stack-sm">${data.slides.length > 1 ? `<button type="button" class="btn btn-sm" data-mascot-all>${icon('grid')}Bu konumu bütün sayfalarda kullan</button>` : ''}
          <label class="chip-check"><input type="checkbox" data-flag="pin" ${l.pin ? 'checked' : ''}><span>Yeni sayfalarda aynı yerde tekrarla</span></label></div>` : ''}
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

  // Hazır paket ızgarası: en fazla 120 öğe gösterilir (arayınca daralır), "Daha fazla" ile artar
  const stock = { kind: 'sticker', pack: '', q: '', color: brand.colors.primary || '#1b1f3b', limit: 120 };
  async function drawStock() {
    const grid = $('#ed-stock');
    if (!grid) return;
    let data;
    try { data = await loadStock(stock.kind); } catch (err) { grid.innerHTML = `<p class="small muted">${esc(err.message)}</p>`; return; }
    if (!$('#ed-stock')) return;
    const pk = $('#ed-stock-packs');
    pk.innerHTML = data.packs.length > 1 ? `<div class="chips mb-2"><button type="button" class="chip ${!stock.pack ? 'active' : ''}" data-stock-pack="">Tümü</button>${data.packs.map(p => `<button type="button" class="chip ${stock.pack === p.id ? 'active' : ''}" data-stock-pack="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>` : '';
    const all = searchItems(itemsOf(stock.kind, data, stock.pack), stock.q);
    const shown = all.slice(0, stock.limit);
    grid.innerHTML = shown.length ? `${shown.map(it => `<button type="button" class="ed-stock-item" data-stock-id="${esc(it.id)}" title="${esc(it.name)}" aria-label="${esc(it.name)} ekle"><img src="${svgUrl(it.svg(stock.color))}" alt="" loading="lazy"></button>`).join('')}
      ${all.length > shown.length ? `<button type="button" class="btn btn-sm btn-ghost ed-stock-more" data-stock-more>Daha fazla (${all.length - shown.length})</button>` : ''}` : '<p class="small muted">Sonuç yok. Başka bir kelime dene.</p>';
    grid._items = shown;
  }
  async function addStock(it) {
    const label = (stock.kind === 'icon' ? `${it.name} ${stock.color}` : it.name).slice(0, 80);
    const pack = `Hazır · ${it.pack}`.slice(0, 60);
    let a = (await assets()).find(x => x.category === 'sticker' && x.pack === pack && x.label === label);
    if (!a) {
      toast('Ekleniyor…', 'info', 1200);
      const file = await svgToPng(it.svg(stock.color), 512, it.id);
      a = (await api.uploadAsset(brand.id, file, 'sticker', label, pack)).asset;
      assetCache = null;
    }
    addAssetLayer(a);
  }

  // Katman küçük önizlemeleri: katman tek başına çizilir, kapladığı alan 44 px kareye sığdırılır
  // Maskot pozları (seçili maskotun pozunu değiştirmek için)
  async function fillPoses() {
    const box = $('#lp-poses'); const l = layer();
    if (!box || !l) return;
    const list = (await assets()).filter(a => a.category === 'mascot');
    box.innerHTML = list.length ? list.map(a => `<button type="button" class="pose ${a.url === l.src ? 'on' : ''}" data-pose="${esc(a.id)}" title="${esc(a.label || 'Poz')}"><img src="${esc(a.thumbUrl || a.url)}" alt="${esc(a.label || '')}"></button>`).join('') : '<span class="xsmall muted">Kütüphanede maskot pozu yok.</span>';
  }

  async function drawLayerThumbs(box) {
    const s = slide();
    await resolveImages(s);
    const off = document.createElement('canvas');
    const F = format();
    for (const l of s.layers) {
      const c = box.querySelector(`[data-ly-thumb="${CSS.escape(l.id)}"]`);
      if (!c) continue;
      drawSlide(off, { bg: 'rgba(0,0,0,0)', layers: [Object.assign({}, l, { hidden: false, opacity: 100 })] }, F);
      const b = layerBox(off.getContext('2d'), l);
      const pad = 8; const sx = Math.max(0, b.x - pad); const sy = Math.max(0, b.y - pad); const sw = Math.max(1, Math.min(F.w - sx, b.w + pad * 2)); const sh = Math.max(1, Math.min(F.h - sy, b.h + pad * 2));
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 44, 44);
      ctx.fillStyle = l.type === 'text' && /^#f|^#e|^#d|^#fff/i.test(l.color || '') ? '#3b3f52' : '#f1f2f6'; ctx.fillRect(0, 0, 44, 44);
      const k = Math.min(40 / sw, 40 / sh);
      ctx.drawImage(off, sx, sy, sw, sh, (44 - sw * k) / 2, (44 - sh * k) / 2, sw * k, sh * k);
    }
    // Sürükle-bırak sıralama (grup başlığı bütün grubu taşır)
    const ul = box.querySelector('#ly-list');
    if (!ul) return;
    let dragIds = null;
    ul.ondragstart = e => {
      const r = e.target.closest('[data-ly],[data-ly-group]'); if (!r) return;
      dragIds = r.dataset.lyGroup ? groupIds(r.dataset.lyGroup) : [r.dataset.ly];
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'katman');
    };
    ul.ondragover = e => { const r = e.target.closest('[data-ly],[data-ly-group]'); if (!r || !dragIds) return; e.preventDefault(); ul.querySelectorAll('.drop-to').forEach(x => x.classList.remove('drop-to')); r.classList.add('drop-to'); };
    ul.ondragleave = () => ul.querySelectorAll('.drop-to').forEach(x => x.classList.remove('drop-to'));
    ul.ondrop = e => {
      const r = e.target.closest('[data-ly],[data-ly-group]'); ul.querySelectorAll('.drop-to').forEach(x => x.classList.remove('drop-to'));
      if (!r || !dragIds) return; e.preventDefault();
      const target = r.dataset.lyGroup ? groupIds(r.dataset.lyGroup) : [r.dataset.ly];
      if (target.some(id => dragIds.includes(id))) { dragIds = null; return; }
      // Liste en öndekinden başlar: bir satırın üstüne bırakılan, o satırın önüne geçer
      const arr = slide().layers;
      const moving = arr.filter(l => dragIds.includes(l.id));
      const rest = arr.filter(l => !dragIds.includes(l.id));
      const topIdx = Math.max(...target.map(id => rest.findIndex(l => l.id === id)));
      rest.splice(topIdx + 1, 0, ...moving);
      slide().layers = rest; dragIds = null; markDirty(); redraw();
    };
  }

  async function drawPanelBody() {
    const box = $('#ed-panel-body');
    if (!box || !panel) return;
    const title = (RAIL.find(r => r[0] === panel) || [])[1];
    const head = `<h3 class="ed-panel-title">${esc(title)}</h3>`;
    if (panel === 'katmanlar') {
      // En öndeki katman en üstte; aynı gruptakiler bir başlık altında toplanır
      const list = slide().layers.slice().reverse();
      const sel = new Set(selIds());
      const row = (l, inGroup) => `<li class="ly-row${sel.has(l.id) ? ' on' : ''}${l.hidden ? ' is-hidden' : ''}${inGroup ? ' in-group' : ''}" data-ly="${esc(l.id)}" draggable="true">
          <span class="ly-grip" aria-hidden="true">⋮⋮</span><canvas class="ly-thumb" data-ly-thumb="${esc(l.id)}" width="44" height="44" aria-hidden="true"></canvas>
          <button type="button" class="ly-name" data-ly-pick title="Seç · çift tıkla: adını değiştir">${esc(layerName(l))}${l.pin ? ' <span class="ly-tag" title="Her yeni sayfada tekrarlanır">sabit</span>' : ''}</button>
          <button type="button" class="ly-btn" data-ly-vis aria-label="${l.hidden ? 'Göster' : 'Gizle'}" title="${l.hidden ? 'Göster' : 'Gizle (dışa aktarılmaz)'}">${icon(l.hidden ? 'eyeOff' : 'eye')}</button>
          <button type="button" class="ly-btn${l.locked ? ' on' : ''}" data-ly-lock aria-label="${l.locked ? 'Kilidi aç' : 'Kilitle'}" title="${l.locked ? 'Kilidi aç' : 'Kilitle'}">${icon(l.locked ? 'lock' : 'unlock')}</button></li>`;
      const parts = []; const seen = new Set();
      for (const l of list) {
        if (l.group) {
          if (seen.has(l.group)) continue;
          seen.add(l.group);
          const members = list.filter(x => x.group === l.group);
          if (members.length > 1) {
            parts.push(`<li class="ly-group${members.every(m => sel.has(m.id)) ? ' on' : ''}" data-ly-group="${esc(l.group)}" draggable="true"><span class="ly-grip" aria-hidden="true">⋮⋮</span>${icon('group')}<button type="button" class="ly-name" data-ly-gpick>Grup · ${members.length} öğe</button><button type="button" class="ly-btn" data-ly-ungroup title="Grubu çöz" aria-label="Grubu çöz">${icon('x')}</button></li>`);
            members.forEach(m => parts.push(row(m, true)));
            continue;
          }
        }
        parts.push(row(l, false));
      }
      box.innerHTML = `${head}${list.length ? `<div class="row mb-2 ly-tools"><button type="button" class="btn btn-sm btn-ghost" data-ly-tool="group" title="Ctrl+G">${icon('group')}Grupla</button><button type="button" class="btn btn-sm btn-ghost" data-ly-tool="front" title="En öne">${icon('chevronUp')}Öne</button><button type="button" class="btn btn-sm btn-ghost" data-ly-tool="back" title="En arkaya">${icon('chevronDown')}Arkaya</button></div>
          <ul class="ly-list" role="list" id="ly-list">${parts.join('')}</ul>
          <p class="xsmall muted mt-2">Sürükleyerek sırala; üstteki önde görünür. Shift+tık ile çoklu seç. Gizli katman dışa aktarılmaz, kilitli katman tuvalde tıklanmaz.</p>` : '<p class="small muted">Bu slaytta katman yok.</p>'}`;
      drawLayerThumbs(box);
      return;
    }
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
        <h4 class="ed-sub">Hazır paketler</h4>
        <div class="seg seg-sm mb-2" role="group" aria-label="Paket türü">${STOCK_KINDS.map(([k, v]) => `<button type="button" class="${stock.kind === k ? 'active' : ''}" data-stock-kind="${k}">${v}</button>`).join('')}</div>
        <div class="row mb-2"><input class="input input-sm grow" id="ed-stock-q" placeholder="Ara (ör. kalp, roket, kahve)" value="${esc(stock.q)}" aria-label="Pakette ara">${stock.kind === 'icon' ? `<input type="color" id="ed-stock-color" value="${esc(stock.color)}" aria-label="İkon rengi" title="İkon rengi">` : ''}</div>
        <div id="ed-stock-packs"></div>
        <div id="ed-stock" class="ed-stock-grid"><p class="small muted">Yükleniyor…</p></div>
        <h4 class="ed-sub mt-3">Kütüphanedeki sticker'lar</h4>
        ${packs.length ? `<div class="chips mb-2"><button type="button" class="chip active" data-sticker-pack="">Tümü</button>${packs.map(p => `<button type="button" class="chip" data-sticker-pack="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}
        <div id="ed-stickers">${assetGrid(stickers, `Henüz sticker yok. <a class="link" href="#/m/${esc(brand.id)}/kutuphane">Kütüphaneye</a> paket olarak yükleyebilirsin.`)}</div>`;
      drawStock();
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
      const sl = slide(); const bi = sl.bgImage; const g = sl.bgGradient;
      box.innerHTML = `${head}<div class="field"><span class="field-label">Zemin rengi</span><div class="swatch-row">${palette.map(c => `<button type="button" class="swatch-btn ${!g && String(c).toLowerCase() === String(sl.bg).toLowerCase() ? 'on' : ''}" style="background:${esc(c)}" data-bg-color="${esc(c)}" aria-label="${esc(c)}" title="${esc(c)}"></button>`).join('')}
          <button type="button" class="cp-trigger" data-cp-bg title="Renk seçici ve gradyan"><span class="cp-trigger-sw" style="background:${g ? gradCss(g) : esc(sl.bg)}"></span><span>${g ? 'Gradyan' : esc(String(sl.bg).toUpperCase())}</span></button></div></div>
        <h4 class="ed-sub">Hazır zeminler</h4>
        <div class="bg-presets">${BG_PRESETS.map((p, i) => `<button type="button" class="bg-preset" data-bg-preset="${i}" style="background:${p.g ? gradCss(p.g) : p.c}" title="${esc(p.n)}" aria-label="${esc(p.n)}"></button>`).join('')}</div>
        <h4 class="ed-sub">Zemin görseli</h4>
        ${bi ? `<div class="seg mb-2">${[['cover', 'Kapla'], ['contain', 'Sığdır']].map(([k, v]) => `<button type="button" data-bg-fit="${k}" class="${bi.fit === k ? 'active' : ''}">${v}</button>`).join('')}</div>
          <label class="small" for="bg-zoom">Ölçek</label><input type="range" id="bg-zoom" min="100" max="300" step="5" value="${bi.zoom || 100}" data-bg-img="zoom">
          <label class="small" for="bg-ox">Yatay konum</label><input type="range" id="bg-ox" min="-50" max="50" step="1" value="${bi.ox || 0}" data-bg-img="ox">
          <label class="small" for="bg-oy">Dikey konum</label><input type="range" id="bg-oy" min="-50" max="50" step="1" value="${bi.oy || 0}" data-bg-img="oy">
          <label class="small" for="bg-dim">Karartma</label><input type="range" id="bg-dim" min="0" max="80" step="5" value="${bi.dim || 0}">
          <div class="row mt-2"><button type="button" class="btn btn-sm" data-bg-image>Değiştir</button><button type="button" class="btn btn-sm btn-ghost" data-bg-remove>Kaldır</button></div>`
        : `<button type="button" class="btn btn-sm" data-bg-image>${icon('image')}Kütüphaneden zemin görseli seç</button>`}
        <h4 class="ed-sub">Bütün sayfalar</h4>
        <div class="stack-sm">${data.slides.length > 1 ? `<button type="button" class="btn btn-sm" data-bg-all>${icon('grid')}Bu zemini bütün sayfalara uygula</button>` : ''}
        <label class="chip-check"><input type="checkbox" id="bg-pin" ${data.bgPin ? 'checked' : ''}><span>Zemini sabitle (yeni sayfalar bu zeminle açılır)</span></label></div>`;
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
  // Tutamaçla boyutlandırma. Görsel/QR: oran korunur (Shift ile serbest); şekil: serbest (Shift ile oran);
  // yazı: köşeler yazıyı büyütür/küçültür, sağ/sol kenar yalnızca genişliği değiştirir.
  function resizeLayer(l, d, p, shift) {
    const o = d.orig; const b = d.box; const h = d.resize;
    const dx = p.x - d.start.x; const dy = p.y - d.start.y;
    const west = h.includes('w'); const north = h.includes('n');
    const sx = h.includes('e') ? dx : west ? -dx : 0;
    const sy = h.includes('s') ? dy : north ? -dy : 0;
    if (l.type === 'text') {
      if (h === 'e' || h === 'w') { l.w = Math.max(60, Math.round(o.w + sx)); if (west) l.x = Math.round(o.x + o.w - l.w); return; }
      const k = Math.max(0.15, (b.w + sx) / b.w);
      l.size = Math.max(10, Math.min(300, Math.round(o.size * k))); l.w = Math.max(60, Math.round(o.w * k));
      if (o.maxH) l.maxH = Math.round(o.maxH * k);
      if (west) l.x = Math.round(o.x + o.w - l.w);
      if (north) l.y = Math.round(o.y + b.h - b.h * k);
      return;
    }
    const keep = l.type === 'qr' || ((l.type === 'image') !== shift);
    let w = Math.max(12, o.w + sx); let hh = Math.max(12, o.h + sy);
    if (keep && h.length === 2) { const k = Math.max(w / o.w, hh / o.h); w = o.w * k; hh = o.h * k; }
    if (l.type === 'qr') hh = w;
    l.w = Math.round(w); l.h = Math.round(hh);
    if (west) l.x = Math.round(o.x + o.w - l.w);
    if (north) l.y = Math.round(o.y + o.h - l.h);
  }
  function snapLayer(c, l) {
    const ctx = c.getContext('2d');
    const F = format(); const T = Math.max(8, F.w / 110);
    const b = layerBox(ctx, l);
    const xs = [0, F.w / 2, F.w]; const ys = [0, F.h / 2, F.h];
    for (const o of slide().layers) { if (o.id === l.id || o.hidden) continue; const ob = layerBox(ctx, o); xs.push(ob.x, ob.x + ob.w / 2, ob.x + ob.w); ys.push(ob.y, ob.y + ob.h / 2, ob.y + ob.h); }
    const out = [];
    const pick = (edges, targets) => { let best = null; for (const e of edges) for (const t of targets) { const dd = t - e; if (Math.abs(dd) <= T && (!best || Math.abs(dd) < Math.abs(best.d))) best = { d: dd, t }; } return best; };
    const bx = pick([b.x, b.x + b.w / 2, b.x + b.w], xs);
    if (bx) { l.x = Math.round(l.x + bx.d); out.push({ x: bx.t }); }
    const by = pick([b.y, b.y + b.h / 2, b.y + b.h], ys);
    if (by) { l.y = Math.round(l.y + by.d); out.push({ y: by.t }); }
    return out;
  }

  function wireStage() {
    const c = $('#stage');
    let drag = null;
    const point = e => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }; };
    // Sağ tık: tıklanan katman seçilir (çoklu seçimdeyse seçim korunur), bağlam menüsü açılır
    const openCtxAt = (cx, cy) => {
      const p = point({ clientX: cx, clientY: cy });
      const hit = hitTest(c, slide(), p.x, p.y);
      if (hit && !(multi && multi.includes(hit.id))) {
        if (hit.group && groupIds(hit.group).length > 1) { setSelected(null); multi = groupIds(hit.group); } else { multi = null; setSelected(hit.id); }
        redraw();
      } else if (!hit) { multi = null; setSelected(null); redraw(); }
      layerMenu(cx, cy);
    };
    c.addEventListener('contextmenu', e => { e.preventDefault(); if (drag) drag = null; openCtxAt(e.clientX, e.clientY); });
    // Dokunmatik: uzun basınca aynı menü
    let press = null;
    c.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; const sx = e.clientX; const sy = e.clientY; press = setTimeout(() => { press = null; drag = null; openCtxAt(sx, sy); }, 550); }, true);
    const cancelPress = e => { if (press && (e.type !== 'pointermove' || Math.hypot(e.movementX || 0, e.movementY || 0) > 4)) { clearTimeout(press); press = null; } };
    c.addEventListener('pointermove', cancelPress, true); c.addEventListener('pointerup', cancelPress, true); c.addEventListener('pointercancel', cancelPress, true);
    c.addEventListener('pointerdown', e => {
      if (e.button === 2) return; // sağ tık sürükleme başlatmaz
      const p = point(e);
      // Seçili katmanın tutamacından tutulduysa boyutlandırma
      const sel = layer();
      if (sel && !multi && !sel.locked) {
        const ctx = c.getContext('2d');
        const tol = Math.max(18, c.width / 45);
        const hk = Object.entries(handlesOf(ctx, sel)).find(([, [hx, hy]]) => Math.abs(p.x - hx) <= tol && Math.abs(p.y - hy) <= tol);
        if (hk) {
          const b = layerBox(ctx, sel);
          drag = { resize: hk[0], id: sel.id, start: p, orig: JSON.parse(JSON.stringify(sel)), box: b, moved: false };
          c.setPointerCapture(e.pointerId); c.focus(); return;
        }
      }
      const hit = hitTest(c, slide(), p.x, p.y);
      // Shift+tık: katmanı çoklu seçime ekler/çıkarır (birlikte taşı, kopyala, sil)
      if (e.shiftKey && hit) {
        const cur = multi || (selected ? [selected] : []);
        multi = cur.includes(hit.id) ? cur.filter(x => x !== hit.id) : [...cur, hit.id];
        if (multi.length < 2) { const one = multi[0] || null; multi = null; setSelected(one); return redraw(); }
        setSelected(null); multi = multi.slice(); c.focus(); return quick();
      }
      // Gruptaki bir katmana tıklanınca bütün grup seçilir (Alt ile tek katman)
      if (hit && hit.group && !e.altKey && !(multi && multi.includes(hit.id))) {
        const g = groupIds(hit.group);
        if (g.length > 1) { setSelected(null); multi = g; }
      }
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
      if (!l) return;
      if (drag.resize) { resizeLayer(l, drag, p, e.shiftKey); drag.moved = true; return quick(); }
      l.x = Math.round(p.x - drag.dx); l.y = Math.round(p.y - drag.dy);
      // Mıknatıs: sayfanın ortası/kenarları ve diğer katmanların kenar/ortaları (Alt basılıysa kapalı)
      guides = e.altKey ? [] : snapLayer(c, l);
      drag.moved = true;
      quick();
    });
    const end = () => { guides = []; if (drag && drag.moved) { markDirty(); redraw({ keepProps: false }); } else if (drag) quick(); drag = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('dblclick', () => { const t = $('#lp-text'); if (t) t.focus(); });
    c.addEventListener('keydown', e => {
      if (multi) return; // çoklu seçim tuşları belge düzeyinde
      const l = layer();
      if (!l || l.locked) return;
      const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (k) { e.preventDefault(); const s = e.shiftKey ? 10 : 1; l.x += k[0] * s; l.y += k[1] * s; markDirty(false, `${l.id}:move`); redraw(); }
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
  // Gruplar: aynı "group" değerini taşıyan katmanlar birlikte seçilir ve taşınır
  const groupIds = g => slide().layers.filter(l => l.group === g).map(l => l.id);
  const selIds = () => multi || (selected ? [selected] : []);
  function groupSel() {
    const ids = selIds();
    if (ids.length < 2) return toast('Gruplamak için en az iki katman seç (Shift+tık ya da Ctrl+A).', 'info', 2500);
    const g = 'g' + uid();
    slide().layers.forEach(l => { if (ids.includes(l.id)) l.group = g; });
    multi = ids; setSelected(null); markDirty(); redraw();
    toast(`${ids.length} katman gruplandı. Gruptaki tek katmanı seçmek için Alt+tık.`, 'success', 2500);
  }
  function ungroup() {
    const ids = selIds();
    const gs = new Set(slide().layers.filter(l => ids.includes(l.id) && l.group).map(l => l.group));
    if (!gs.size) return toast('Seçili katmanlarda grup yok.', 'info', 1800);
    slide().layers.forEach(l => { if (gs.has(l.group)) delete l.group; });
    markDirty(); redraw(); toast('Grup çözüldü.', 'success', 1800);
  }
  // Katman sırası: öne/arkaya (bir adım ya da en uca)
  function reorder(dir) {
    const ids = selIds(); if (!ids.length) return;
    const arr = slide().layers;
    const picked = arr.filter(l => ids.includes(l.id)); const rest = arr.filter(l => !ids.includes(l.id));
    if (dir === 'front') slide().layers = [...rest, ...picked];
    else if (dir === 'back') slide().layers = [...picked, ...rest];
    else {
      const idx = arr.findIndex(l => ids.includes(l.id));
      if (dir === 'up') { const last = arr.map((l, i) => (ids.includes(l.id) ? i : -1)).filter(i => i >= 0).pop(); if (last >= arr.length - 1) return; const nxt = arr[last + 1]; slide().layers = arr.filter(l => l !== nxt); slide().layers.splice(slide().layers.findIndex(l => ids.includes(l.id)), 0, nxt); }
      else { if (idx <= 0) return; const prv = arr[idx - 1]; slide().layers = arr.filter(l => l !== prv); const lastSel = slide().layers.map((l, i) => (ids.includes(l.id) ? i : -1)).filter(i => i >= 0).pop(); slide().layers.splice(lastSel + 1, 0, prv); }
    }
    markDirty(); redraw();
  }
  // Yeni sayfa: türüne göre mevcut sayfalardan yerleşim alınır; sabitlenen öğeler (pin) ve zemin korunur
  function newPage(kind) {
    if (data.slides.length >= 10) return toast('En fazla 10 slayt olabilir.', 'info');
    const clone = s => { const c = JSON.parse(JSON.stringify(s)); delete c.frame; c.layers.forEach(l => { l.id = uid(); }); return c; };
    const n = data.slides.length;
    let page;
    if (kind === 'kapak') page = clone(data.slides[0]);
    else if (kind === 'kapanis') page = clone(data.slides[n - 1]);
    else if (kind === 'bilgi') page = clone(data.slides[n >= 3 ? Math.min(current === 0 || current === n - 1 ? 1 : current, n - 2) : current]);
    else if (kind === 'cogalt') page = clone(slide());
    else {
      const cur = slide();
      page = { bg: cur.bg, layers: cur.layers.filter(l => l.pin).map(l => Object.assign(JSON.parse(JSON.stringify(l)), { id: uid() })) };
      if (cur.bgImage) page.bgImage = JSON.parse(JSON.stringify(cur.bgImage));
      if (cur.bgGradient) page.bgGradient = JSON.parse(JSON.stringify(cur.bgGradient));
    }
    // Zemin sabitlendiyse her yeni sayfa bu sayfanın zeminiyle açılır
    if (data.bgPin) { const cur = slide(); page.bg = cur.bg; if (cur.bgGradient) page.bgGradient = JSON.parse(JSON.stringify(cur.bgGradient)); else delete page.bgGradient; if (cur.bgImage) page.bgImage = JSON.parse(JSON.stringify(cur.bgImage)); else delete page.bgImage; }
    data.slides.splice(current + 1, 0, page); current++; setSelected(null); multi = null; markDirty(); shell();
    toast({ kapak: 'Kapak sayfası eklendi.', bilgi: 'Bilgi sayfası eklendi.', kapanis: 'Kapanış sayfası eklendi.', cogalt: 'Sayfa çoğaltıldı.' }[kind] || 'Sayfa eklendi; sabitlenen öğeler ve zemin korundu.', 'success', 2000);
  }
  // Sağ tık / uzun dokunma menüsü
  function ctxMenu(x, y, items) {
    document.querySelectorAll('.ctx-menu').forEach(m => m.remove());
    const m = document.createElement('div');
    m.className = 'ctx-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = items.map(it => (it === '-' ? '<hr>' : `<button type="button" role="menuitem" data-ctx="${it[0]}" ${it[3] ? 'disabled' : ''}>${it[1]}${it[2] ? `<span class="ed-hint">${it[2]}</span>` : ''}</button>`)).join('');
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`; m.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
    const close = ev => { if (ev && ev.type === 'keydown' && ev.key !== 'Escape') return; m.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', close, true); };
    const outside = ev => { if (!m.contains(ev.target)) close(); };
    setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', close, true); }, 0);
    m.addEventListener('click', ev => { const b = ev.target.closest('[data-ctx]'); if (!b) return; close(); runCtx(b.dataset.ctx); });
    const first = m.querySelector('button:not([disabled])'); if (first) first.focus();
  }
  function layerMenu(x, y) {
    const ids = selIds(); const one = layer();
    const grouped = slide().layers.some(l => ids.includes(l.id) && l.group);
    const anyLocked = slide().layers.some(l => ids.includes(l.id) && l.locked);
    const anyPin = slide().layers.some(l => ids.includes(l.id) && l.pin);
    if (!ids.length) return ctxMenu(x, y, [['paste', 'Yapıştır', 'Ctrl+V', !clip], ['all', 'Tümünü seç', 'Ctrl+A'], '-', ['page-dup', 'Sayfayı çoğalt'], ['page-new', 'Yeni boş sayfa (sabit öğelerle)']]);
    ctxMenu(x, y, [['copy', 'Kopyala', 'Ctrl+C'], ['paste', 'Yapıştır', 'Ctrl+V', !clip], ['dup', 'Çoğalt', 'Ctrl+D'], ['del', 'Sil', 'Delete'], '-',
      ['front', 'En öne getir'], ['up', 'Bir öne'], ['down', 'Bir arkaya'], ['back', 'En arkaya gönder'], '-',
      ['lock', anyLocked ? 'Kilidi aç' : 'Kilitle'], ['pin', anyPin ? 'Yeni sayfalarda tekrarlama' : 'Her yeni sayfada tekrarla'],
      ids.length > 1 ? ['group', 'Grupla', 'Ctrl+G'] : null, grouped ? ['ungroup', 'Grubu çöz', 'Ctrl+Shift+G'] : null,
      one && data.slides.length > 1 ? ['all-slides', 'Tüm slaytlara uygula'] : null].filter(Boolean));
  }
  function runCtx(a) {
    if (a.startsWith('pt-')) return newPage(a.slice(3));
    const ids = selIds();
    const items = slide().layers.filter(l => ids.includes(l.id));
    if (a === 'copy') { clip = JSON.parse(JSON.stringify(items.length > 1 ? items : items[0])); return toast('Kopyalandı; Ctrl+V ile yapıştır.', 'info', 1500); }
    if (a === 'paste') return clip && pasteLayer(clip);
    if (a === 'dup') return pasteLayer(JSON.parse(JSON.stringify(items.length > 1 ? items : items[0])));
    if (a === 'del') { slide().layers = slide().layers.filter(l => !ids.includes(l.id)); multi = null; setSelected(null); markDirty(); return redraw(); }
    if (['front', 'back', 'up', 'down'].includes(a)) return reorder(a);
    if (a === 'lock') { const on = !items.some(l => l.locked); items.forEach(l => { if (on) l.locked = true; else delete l.locked; }); if (on) { multi = null; setSelected(null); } markDirty(); return redraw(); }
    if (a === 'pin') { const on = !items.some(l => l.pin); items.forEach(l => { if (on) l.pin = true; else delete l.pin; }); markDirty(); toast(on ? 'Yeni boş sayfalarda aynı yerde tekrarlanacak.' : 'Tekrarlama kaldırıldı.', 'success', 2200); return redraw(); }
    if (a === 'group') return groupSel();
    if (a === 'ungroup') return ungroup();
    if (a === 'all') { setSelected(null); multi = slide().layers.map(l => l.id); return quick(); }
    if (a === 'all-slides') return applyAll();
    if (a === 'page-dup') return newPage('cogalt');
    if (a === 'page-new') return newPage('bos');
    if (a.startsWith('pg-')) { pageAction(a.slice(3)); view._ctxPage = null; }
  }
  // Sayfa menüsü (slayt şeridinde sağ tık): çoğalt, kopyala, yapıştır, taşı, sil
  let pageClip = null;
  function pageAction(a) {
    const i = view._ctxPage != null ? view._ctxPage : current;
    if (a === 'dup' || a === 'paste') {
      if (data.slides.length >= 10) return toast('En fazla 10 slayt olabilir.', 'info');
      const src = a === 'dup' ? data.slides[i] : pageClip; if (!src) return;
      const c = JSON.parse(JSON.stringify(src)); c.layers.forEach(l => { l.id = uid(); });
      data.slides.splice(i + 1, 0, c); current = i + 1;
    } else if (a === 'copy') { pageClip = JSON.parse(JSON.stringify(data.slides[i])); return toast('Sayfa kopyalandı; sağ tık → Sayfayı yapıştır.', 'info', 1800); }
    else if (a === 'left' || a === 'right') { const j = i + (a === 'left' ? -1 : 1); if (j < 0 || j >= data.slides.length) return; [data.slides[i], data.slides[j]] = [data.slides[j], data.slides[i]]; current = j; }
    else if (a === 'del') { if (data.slides.length <= 1 || !confirm('Bu sayfa silinsin mi?')) return; data.slides.splice(i, 1); current = Math.max(0, Math.min(current, data.slides.length - 1)); }
    setSelected(null); multi = null; markDirty(); shell();
  }

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
  // Yalnızca yazı girilen alanlar "yazıyor" sayılır; renk, kaydırıcı, seçim, kutucuk ve sayı alanında kısayollar çalışır
  const typing = el => el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['text', 'search', 'email', 'url', 'tel', 'password', ''].includes(el.type || '')));
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
    // Ctrl+G grupla, Ctrl+Shift+G grubu çöz
    if (mod && k === 'g') { e.preventDefault(); return e.shiftKey ? ungroup() : groupSel(); }
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
  // Maskot: seçili bir maskot varsa yalnızca pozu değişir (yer ve boyut aynı); yoksa son kullanılan maskot yerine,
  // o da yoksa sağ alt köşeye yerleşir
  const mascotSpot = () => {
    const near = [slide(), ...data.slides].flatMap(s => s.layers).find(l => l.type === 'image' && l.role === 'mascot');
    if (near) return { x: near.x, y: near.y, w: near.w, h: near.h };
    if (data.mascotSpot) return data.mascotSpot;
    const F = format(); return { x: F.w - 470, y: F.h - 540, w: 450, h: 520 };
  };
  const placeMascot = a => {
    const cur = layer();
    if (cur && cur.type === 'image' && cur.role === 'mascot') { cur.src = a.url; cur.assetId = a.id; markDirty(); drawProps(); return redraw(); }
    const sp = mascotSpot();
    addLayer(Object.assign({ id: uid(), type: 'image', role: 'mascot', src: a.url, assetId: a.id }, sp));
  };
  const addAssetLayer = a => { if (a.category === 'mascot') return placeMascot(a); const F = format(); const small = a.category === 'logo' || a.category === 'sticker'; const s = small ? 240 : 480; addLayer({ id: uid(), type: 'image', src: a.url, assetId: a.id, ...(a.category === 'mascot' ? { role: 'mascot' } : a.category === 'logo' ? { role: 'logo' } : {}), x: Math.round(F.w / 2 - s / 2), y: Math.round(F.h / 2 - s / 2), w: s, h: s }); };
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
    if (t.id === 'bg-dim' && slide().bgImage) { slide().bgImage.dim = Number(t.value); markDirty(false, 'bgdim'); quick(); return; }
    if (t.dataset.bgImg && slide().bgImage) { slide().bgImage[t.dataset.bgImg] = Number(t.value); markDirty(false, 'bgimg:' + t.dataset.bgImg); quick(); return; }
    if (t.id === 'bg-pin') { if (t.checked) data.bgPin = true; else delete data.bgPin; markDirty(); return; }
    if (t.id === 'ed-zoom') { zoom = Number(t.value); $('#ed-zoom-val').textContent = `%${zoom}`; fit(); return; }
    if (t.matches('[data-field-name]') && layer()) {
      const v = t.value.toLocaleUpperCase('en').replace(/[^A-Z0-9_]/g, '_').replace(/^[^A-Z]+/, '').slice(0, 30);
      if (v !== t.value) t.value = v;
      const lf = layer(); if (v.length >= 2) lf.field = v; else delete lf.field;
      markDirty(false, `${lf.id}:field`); return;
    }
    if (t.id === 'ed-stock-q') { clearTimeout(view._stockT); view._stockT = setTimeout(() => { stock.q = t.value; stock.limit = 120; drawStock(); }, 200); return; }
    if (t.id === 'ed-stock-color') { stock.color = t.value; clearTimeout(view._stockT); view._stockT = setTimeout(drawStock, 150); return; }
    // Efekt kutucukları
    if (t.matches('[data-flag]') && layer()) {
      const lf = layer(); const f = t.dataset.flag;
      if (f === 'bgBox') { if (t.checked) lf.bgColor = lf.bgColor || '#ffffff'; else delete lf.bgColor; }
      else if (f === 'fit') { if (t.checked) lf.fit = 'cover'; else delete lf.fit; }
      else if (t.checked) lf[f] = true; else delete lf[f];
      markDirty(); quick(); drawProps(); return;
    }
    if (t.matches('[data-bubble]') && layer()) { const lb = layer(); if (t.checked) lb.role = 'bubble'; else delete lb.role; markDirty(); return; }
    const prop = t.dataset.prop;
    const l = layer();
    if (!prop || !l) return;
    l[prop] = ['text', 'font', 'color', 'role', 'shadowColor', 'strokeColor', 'bgColor'].includes(prop) ? t.value : Number(t.value);
    view._propKey = `${l.id}:${prop}`;
    const vl = $(`[data-val="${prop}"]`); if (vl) vl.textContent = `${t.value}${t.dataset.unit || ''}`;
    if (prop === 'maxH' && !(l.maxH > 0)) delete l.maxH;
    // Özel alan: rol "custom" olarak saklanmaz; kimlik (field) ile tanınır. Başka bir role geçince kimlik silinir
    if (prop === 'role') { if (l.role === 'custom') { l.role = 'text'; l.field = l.field || 'ALAN_' + (slide().layers.indexOf(l) + 1); drawProps(); } else { delete l.field; if (l.role === 'text') delete l.fixed; } }
    // Doldurulacak bir kutu seçilince yüksekliği şimdiki hâlinden alınır: uzun metin buna sığdırılır
    if (prop === 'role' && l.type === 'text' && FILL_ROLES.includes(l.role) && !l.maxH) {
      const ctx = document.createElement('canvas').getContext('2d');
      l.maxH = Math.round(Math.max(layerBox(ctx, l).h, l.size * 2.4));
      const mh = $('#lp-maxh'); if (mh) mh.value = l.maxH;
    }
    if (l.type === 'qr' && prop === 'w') l.h = l.w;
    markDirty(false, view._propKey);
    quick();
  };
  // Gölge/çizgi açılınca renk seçicisi görünsün diye panel yeniden çizilir
  view.onchange = e => { const pr = e.target.dataset.prop; if (pr || e.target.id === 'slide-bg') redraw({ keepProps: Boolean(pr) && !['shadow', 'strokeW'].includes(pr) }); };

  // Katmanlar paneli: ada çift tıklayınca yeniden adlandır
  view.ondblclick = e => {
    const nm = e.target.closest('[data-ly-pick]');
    if (!nm) return;
    const l = slide().layers.find(x => x.id === nm.closest('[data-ly]').dataset.ly);
    const v = l && prompt('Katmanın adı (boş bırakırsan otomatik)', l.name || '');
    if (v == null || !l) return;
    if (v.trim()) l.name = v.trim().slice(0, 40); else delete l.name;
    markDirty(); drawPanelBody();
  };
  view.onclick = async e => {
    const t = e.target;
    const menu = t.closest('[data-menu]');
    if (menu) { const d = view.querySelector(`[data-drop="${menu.dataset.menu}"]`); const was = d.hidden; closeMenus(); d.hidden = !was; return; }
    if (!t.closest('.ed-drop')) closeMenus();
    const rail = t.closest('[data-rail]');
    if (rail) return openPanel(rail.dataset.rail);
    if (t.closest('[data-rail-close]')) return openPanel(panel);
    const sk = t.closest('[data-stock-kind]');
    if (sk) { stock.kind = sk.dataset.stockKind; stock.pack = ''; stock.q = ''; stock.limit = 120; return drawPanelBody(); }
    const sp2 = t.closest('[data-stock-pack]');
    if (sp2) { stock.pack = sp2.dataset.stockPack; stock.limit = 120; return drawStock(); }
    if (t.closest('[data-stock-more]')) { stock.limit += 240; return drawStock(); }
    const si = t.closest('[data-stock-id]');
    if (si) { const it = ($('#ed-stock')._items || []).find(x => x.id === si.dataset.stockId); if (it) { try { await addStock(it); } catch (err) { toast(err.message, 'error'); } } return; }
    const ly = t.closest('[data-ly]');
    if (ly) {
      const l = slide().layers.find(x => x.id === ly.dataset.ly);
      if (!l) return;
      if (t.closest('[data-ly-vis]')) { if (l.hidden) delete l.hidden; else l.hidden = true; markDirty(); return redraw(); }
      if (t.closest('[data-ly-lock]')) { if (l.locked) delete l.locked; else l.locked = true; markDirty(); return redraw(); }
      const mv = t.closest('[data-ly-move]');
      if (mv) { const arr = slide().layers; const i = arr.indexOf(l); const j = i + Number(mv.dataset.lyMove); if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; markDirty(); return redraw(); }
      // Seçim: liste yeniden çizilmez (çift tıklayıp adlandırma bozulmasın), yalnızca işaret güncellenir; Shift ile çoklu
      if (t.closest('[data-ly-pick]')) {
        if (e.shiftKey) { const cur = selIds(); multi = cur.includes(l.id) ? cur.filter(x => x !== l.id) : [...cur, l.id]; if (multi.length < 2) { const one = multi[0] || null; multi = null; setSelected(one); } else setSelected(null); }
        else { multi = null; setSelected(l.id); }
        const ids = selIds(); view.querySelectorAll('.ly-row').forEach(r => r.classList.toggle('on', ids.includes(r.dataset.ly)));
        drawProps(); quick(); fit(); return;
      }
      return;
    }
    const lg = t.closest('[data-ly-group]');
    if (lg) {
      if (t.closest('[data-ly-ungroup]')) { setSelected(null); multi = groupIds(lg.dataset.lyGroup); return ungroup(); }
      setSelected(null); multi = groupIds(lg.dataset.lyGroup); return redraw();
    }
    const lt = t.closest('[data-ly-tool]');
    if (lt) { const a = lt.dataset.lyTool; return a === 'group' ? groupSel() : reorder(a); }
    const s = t.closest('[data-slide]');
    if (s) { current = Number(s.dataset.slide); setSelected(null); if (panel === 'zemin') drawPanelBody(); return redraw(); }
    const sa = t.closest('[data-slide-add]');
    if (sa) { const r = sa.getBoundingClientRect(); return ctxMenu(r.left, r.top - 230, [['pt-kapak', 'Kapak sayfası', 'ilk sayfanın düzeni'], ['pt-bilgi', 'Bilgi sayfası', 'ara sayfa düzeni'], ['pt-kapanis', 'Kapanış sayfası', 'son sayfanın düzeni'], ['pt-cogalt', 'Bu sayfayı çoğalt'], ['pt-bos', 'Boş sayfa', 'zemin + sabit öğeler']]); }
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
    if (bgc) { slide().bg = bgc.dataset.bgColor; delete slide().bgGradient; markDirty(); drawPanelBody(); return redraw(); }
    const tpl = t.closest('[data-apply-tpl]');
    if (tpl) {
      const tt = ($('#ed-panel-body')._tpls || []).find(x => x.id === tpl.dataset.applyTpl);
      if (!tt || !tt.data.slides || !confirm('Şablonun ilk slaydı bu slaydın yerine konsun mu?')) return;
      const copy = JSON.parse(JSON.stringify(tt.data.slides[0])); copy.layers.forEach(l => { l.id = uid(); });
      data.slides[current] = copy; setSelected(null); markDirty(); return redraw();
    }
    const sw = t.closest('[data-swatch]');
    if (sw && layer()) { layer()[sw.dataset.swatch] = sw.dataset.color; if (sw.dataset.swatch === 'color') delete layer().gradient; markDirty(); return redraw(); }
    // Renk seçici (özellik paneli): canlı önizleme, art arda değişiklik tek geri alma adımı
    const cp = t.closest('[data-cp]');
    if (cp && layer()) {
      const l = layer(); const key = cp.dataset.cp;
      const label = () => { const g = key === 'color' && l.gradient; cp.querySelector('.cp-trigger-sw').style.background = g ? gradCss(g) : l[key]; cp.lastElementChild.textContent = g ? 'Gradyan' : String(l[key]).toUpperCase(); };
      return openColorPicker(cp, { value: l[key] || '#000000', gradient: key === 'color' ? l.gradient : null, allowGradient: key === 'color' && l.type === 'shape', brandColors: palette, title: { color: 'Renk', highlight: 'Vurgu rengi', shadowColor: 'Gölge rengi', strokeColor: 'Çizgi rengi', bgColor: 'Kutu rengi' }[key] || 'Renk',
        onChange: h => { l[key] = h; if (key === 'color') delete l.gradient; markDirty(false, `${l.id}:${key}`); quick(); label(); },
        onGradient: g => { if (g) l.gradient = g; else delete l.gradient; markDirty(false, `${l.id}:grad`); quick(); label(); } });
    }
    const pose = t.closest('[data-pose]');
    if (pose && layer()) { const a = (await assets()).find(x => x.id === pose.dataset.pose); if (a) { const l = layer(); l.src = a.url; l.assetId = a.id; markDirty(); fillPoses(); return redraw(); } }
    if (t.closest('[data-mascot-all]') && layer()) {
      // Maskot olmayan sayfalara aynı konum ve boyutta eklenir, olanlarda yeri eşitlenir (poz korunur)
      const m = layer(); let n = 0;
      data.slides.forEach(s => { if (s === slide()) return; const ex = s.layers.find(x => x.type === 'image' && x.role === 'mascot'); if (ex) Object.assign(ex, { x: m.x, y: m.y, w: m.w, h: m.h }); else { s.layers.push(Object.assign(JSON.parse(JSON.stringify(m)), { id: uid() })); } n++; });
      data.mascotSpot = { x: m.x, y: m.y, w: m.w, h: m.h };
      markDirty(); drawList(); return toast(`Maskot ${n} sayfada aynı konuma yerleşti.`, 'success', 2200);
    }
    const cpb = t.closest('[data-cp-bg]');
    if (cpb) {
      const s = slide();
      return openColorPicker(cpb, { value: s.bg, gradient: s.bgGradient, allowGradient: true, brandColors: palette, title: 'Zemin',
        onChange: h => { s.bg = h; delete s.bgGradient; markDirty(false, 'bg'); quick(); cpb.querySelector('.cp-trigger-sw').style.background = h; cpb.lastElementChild.textContent = h.toUpperCase(); },
        onGradient: g => { if (g) s.bgGradient = g; else delete s.bgGradient; markDirty(false, 'bggrad'); quick(); cpb.querySelector('.cp-trigger-sw').style.background = g ? gradCss(g) : s.bg; cpb.lastElementChild.textContent = g ? 'Gradyan' : s.bg.toUpperCase(); } });
    }
    const bgp = t.closest('[data-bg-preset]');
    if (bgp) { const pr = BG_PRESETS[Number(bgp.dataset.bgPreset)]; const s = slide(); if (pr.g) { s.bgGradient = JSON.parse(JSON.stringify(pr.g)); s.bg = pr.g.stops[0].c; } else { s.bg = pr.c; delete s.bgGradient; } markDirty(); drawPanelBody(); return redraw(); }
    if (t.closest('[data-bg-all]')) {
      const s = slide();
      data.slides.forEach(o => { if (o === s) return; o.bg = s.bg; if (s.bgGradient) o.bgGradient = JSON.parse(JSON.stringify(s.bgGradient)); else delete o.bgGradient; if (s.bgImage) o.bgImage = JSON.parse(JSON.stringify(s.bgImage)); else delete o.bgImage; });
      markDirty(); drawList(); return toast('Zemin bütün sayfalara uygulandı.', 'success', 2000);
    }
    const al = t.closest('[data-align]');
    if (al && layer()) { layer().align = al.dataset.align; markDirty(); return redraw(); }
    const ord = t.closest('[data-order]');
    if (ord && layer()) { const arr = slide().layers; const i = arr.findIndex(x => x.id === selected); const j = i + Number(ord.dataset.order); if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; markDirty(); return redraw(); }
    if (t.closest('[data-layer-dup]') && layer()) { const c = Object.assign(JSON.parse(JSON.stringify(layer())), { id: uid() }); c.x += 30; c.y += 30; return addLayer(c); }
    if (t.closest('[data-layer-del]')) { slide().layers = slide().layers.filter(x => x.id !== selected); setSelected(null); markDirty(); return redraw(); }
    if (t.closest('[data-deselect]')) { setSelected(null); return redraw(); }
    if (t.closest('[data-fx-reset]') && layer()) { const lr = layer(); ['fit', 'radius', 'circle', 'flipX', 'brightness', 'contrast', 'saturate', 'grayscale', 'blur', 'shadow', 'shadowColor'].forEach(k => delete lr[k]); markDirty(); return redraw(); }
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
        if (a === 'undo') return undo();
        if (a === 'redo') return redo();
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
    const pdfBtn = t.closest('[data-pdf]');
    if (pdfBtn) {
      closeMenus();
      return busy(pdfBtn, async () => {
        const canvases = [];
        for (const s of data.slides) { await resolveImages(s); canvases.push(drawSlide(document.createElement('canvas'), s, format())); }
        downloadBlob(await canvasesToPdf(canvases, { title: post.title }), `${safeName(post.title)}.pdf`);
        offerIdeaDelete();
      }).catch(err => toast(err.message, 'error'));
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
