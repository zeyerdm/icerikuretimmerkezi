// Aşama 5.21: YouTube kapak stüdyosu (Banana Studio'dan ilham).
// 1) Videonun konusu / başlığı (Gemini bağlıysa YouTube bağlantısı) → kapak fikirleri (kaydedilmez)
// 2) Fikirden 16:9 görsel üretimi (kimlik/stil referansları @ ile) ya da Post stüdyosunda düzenlenebilir kapak
// 3) YouTube önizlemesi: kapak ana sayfa, arama ve telefon görünümünde, başlık ve kanal adıyla
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState, openModal } from '../ui.js';
import { go } from '../app.js';
import { aiModels, modelSelect, busyTimer, aiNote } from '../aiPicker.js';
import { imageBox } from './imageGen.js';

const ytBase = brand => `#/m/${brand.id}/post`;

// Kapağı YouTube'daki gibi gösterir. src: görsel adresi (kütüphane ya da blob)
export function youtubePreview(brand, src, { title = '', logoUrl = null } = {}) {
  const avatar = logoUrl ? `<img class="yt-avatar" src="${esc(logoUrl)}" alt="">` : `<span class="yt-avatar yt-avatar-txt" style="background:${esc(brand.colors.primary || '#5b55e6')}">${esc(brand.name.charAt(0))}</span>`;
  const m = openModal({
    title: 'YouTube önizlemesi', submitLabel: 'Kapat',
    body: `<p class="small muted mb-2">Kapak küçük boyutta da okunuyor mu? Başlığı ve süreyi değiştirip bak.</p>
      <div class="form-grid"><div class="field"><label for="yt-pt">Video başlığı</label><input class="input" id="yt-pt" maxlength="100" value="${esc(title || 'Video başlığı buraya')}"></div>
        <div class="field"><label for="yt-pd">Süre</label><input class="input" id="yt-pd" maxlength="8" value="12:34"></div></div>
      <div class="yt-prev mt-3">
        <section><h4 class="xsmall muted">Ana sayfa</h4><div class="yt-home">${'<div class="yt-card" data-yt-card></div>'.repeat(3)}</div></section>
        <section><h4 class="xsmall muted">Arama sonucu</h4><div class="yt-search" data-yt-search></div></section>
        <section><h4 class="xsmall muted">Telefon</h4><div class="yt-phone" data-yt-phone></div></section>
      </div>`,
    onSubmit: async () => {}
  });
  const draw = () => {
    const t = esc(m.form.querySelector('#yt-pt').value || 'Video başlığı');
    const d = esc(m.form.querySelector('#yt-pd').value || '');
    const thumb = `<div class="yt-thumb"><img src="${esc(src)}" alt="">${d ? `<span class="yt-dur">${d}</span>` : ''}</div>`;
    const metaLine = `<span>${esc(brand.name)}</span><span>1,2 B görüntüleme · 2 gün önce</span>`;
    m.form.querySelectorAll('[data-yt-card]').forEach((c, i) => {
      c.innerHTML = i === 1 ? `${thumb}<div class="yt-info">${avatar}<div><b>${t}</b><div class="yt-meta">${metaLine}</div></div></div>`
        : `<div class="yt-thumb yt-ghost"></div><div class="yt-info"><span class="yt-avatar yt-ghost"></span><div><b class="yt-ghost-line"></b><div class="yt-ghost-line short"></div></div></div>`;
    });
    m.form.querySelector('[data-yt-search]').innerHTML = `${thumb}<div><b>${t}</b><div class="yt-meta">${metaLine}</div><div class="yt-ch">${avatar}<span>${esc(brand.name)}</span></div></div>`;
    m.form.querySelector('[data-yt-phone]').innerHTML = `${thumb}<div class="yt-info">${avatar}<div><b>${t}</b><div class="yt-meta">${metaLine}</div></div></div>`;
  };
  m.form.closest('.modal').classList.add('modal-wide');
  m.form.addEventListener('input', draw);
  draw();
}

export async function renderYoutube(view, brand) {
  view.innerHTML = '<div class="skeleton" style="height:420px"></div>';
  const models = await aiModels().catch(() => null);
  const aiReady = Boolean(models && models.ov.tasks.find(t => t.id === 'yazim' && t.primary));
  const gemini = Boolean(models && models.ov.providers.some(p => p.id === 'gemini' && p.configured));
  let ideas = [];
  let summary = '';
  let lastImage = null; // bu oturumda üretilen son görsel: "Tasarım olarak aç"ta zemin olur

  view.innerHTML = `
    ${pageHead({ title: 'YouTube kapağı', desc: 'Videonun konusundan kapak fikirleri çıkar, fikirden 16:9 görsel üret ya da düzenlenebilir kapak tasarımı aç; YouTube görünümünde önizle.',
      actions: `<a class="btn btn-ghost" href="${ytBase(brand)}">${icon('palette')}Post stüdyosu</a>` })}
    <div class="yt-layout">
      <section class="card">
        <div class="card-head"><h3>1 · Video</h3></div>
        ${aiReady ? `<form id="yt-form" class="stack">
          <div class="field"><label for="yt-title">Video başlığı</label><input class="input" id="yt-title" name="title" maxlength="120" placeholder="Ör. Evde barista kalitesinde latte (3 malzeme)"></div>
          <div class="field"><label for="yt-topic">Video ne anlatıyor?</label><textarea class="textarea" id="yt-topic" name="topic" rows="4" maxlength="2000" placeholder="Videonun içeriği, öne çıkan anlar, kimin konuştuğu…" data-mic></textarea></div>
          ${gemini ? `<div class="field"><label for="yt-url">YouTube bağlantısı <span class="muted">(isteğe bağlı · Gemini videoyu izler)</span></label><input class="input" id="yt-url" name="url" type="url" maxlength="300" placeholder="https://www.youtube.com/watch?v=…"></div>`
            : '<p class="xsmall muted">YouTube bağlantısından videoyu okumak için Gemini anahtarı gerekir; şimdilik konuyu yazarak fikir alabilirsin.</p>'}
          <div class="row"><label class="small" for="yt-count">Fikir sayısı</label><select class="select w-auto" id="yt-count" name="count">${[3, 4, 5, 6].map(n => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select>
            ${modelSelect(models, 'yazim', { id: 'yt-model' })}<span class="spacer"></span><button class="btn btn-primary" type="submit">${icon('sparkle')}Kapak fikirleri</button></div>
        </form>` : `<div class="notice"><div><strong>AI bağlı değil.</strong> Kapak fikirleri için bir yapay zekâ sağlayıcısı bağla.</div><a class="btn btn-sm" href="#/ai/modeller">Sağlayıcı bağla</a></div>`}
        <div class="xsmall muted mt-2" id="yt-note"></div>
      </section>
      <section class="card">
        <div class="card-head"><h3>2 · Kapak fikirleri</h3><button type="button" class="btn btn-sm btn-ghost" id="yt-blank">${icon('plus')}Boş kapak tasarımı</button></div>
        <div id="yt-ideas">${emptyState({ icon: 'idea', title: 'Henüz fikir yok', text: 'Soldan videoyu anlat; her fikirde kapak yazısı, yüz ifadesi, yerleşim ve görsel tarifi gelir.', compact: true })}</div>
      </section>
    </div>
    <section class="card mt-4">
      <div class="card-head"><h3>3 · Görsel üret (16:9)</h3><span class="xsmall muted">Fikrin "Tarifi kutuya al" düğmesi tarifi buraya taşır. Kendi fotoğrafını kütüphanede kimlik rolüyle işaretlersen tarifte @etiket ile anabilirsin.</span></div>
      <div id="yt-gen"></div>
    </section>`;

  const $ = s => view.querySelector(s);
  imageBox($('#yt-gen'), brand, { editablePrompt: true, aspect: '16:9', historyAll: true, onCreated: a => { lastImage = a; drawIdeas(); } });

  const ideaCard = (it, i) => `<article class="yt-idea">
      <div class="yt-idea-text" style="${it.colors[0] ? `--yt-accent:${esc(it.colors[0])}` : ''}">${esc(it.text)}</div>
      <div class="yt-idea-body"><b>${esc(it.name)}</b>
        <dl class="kv xsmall"><dt>Vaat</dt><dd>${esc(it.promise || '—')}</dd>${it.emotion ? `<dt>Yüz ifadesi</dt><dd>${esc(it.emotion)}</dd>` : ''}<dt>Yerleşim</dt><dd>${esc(it.composition || '—')}</dd></dl>
        <div class="row mt-2">
          <button type="button" class="btn btn-sm" data-yt-prompt="${i}">Tarifi kutuya al</button>
          <button type="button" class="btn btn-sm btn-primary" data-yt-design="${i}">Tasarım olarak aç${lastImage ? ' (son görselle)' : ''}</button>
        </div></div></article>`;
  function drawIdeas() {
    if (!ideas.length) return;
    $('#yt-ideas').innerHTML = `${summary ? `<p class="small"><b>Videonun vaadi:</b> ${esc(summary)}</p>` : ''}<div class="yt-ideas">${ideas.map(ideaCard).join('')}</div>`;
  }

  // Fikirden düzenlenebilir kapak: YouTube kapağı türünde tasarım; bu oturumda görsel üretildiyse zemin olur
  async function openDesign(text, btn) {
    const title = ($('#yt-title') && $('#yt-title').value.trim()) || text;
    const { post } = await busyTimer(btn, () => api.createPost(brand.id, { blank: true, kind: 'youtube', title: text || title }), 'Açılıyor');
    if (lastImage) {
      const data = post.data;
      const s = data.slides[0];
      s.layers = s.layers.filter(l => !(l.type === 'shape' && l.color === '#e5e7eb') && l.role !== 'label');
      s.bgImage = { src: lastImage.url, fit: 'cover', dim: 35 };
      await api.savePost(brand.id, post.id, { data });
    }
    go(`${ytBase(brand)}/${post.id}`);
  }

  view.onclick = async e => {
    const t = e.target;
    const p = t.closest('[data-yt-prompt]');
    if (p) {
      const it = ideas[Number(p.dataset.ytPrompt)];
      const ta = view.querySelector('#yt-gen textarea');
      if (ta) { ta.value = it.imagePrompt; ta.focus(); ta.scrollIntoView({ block: 'center', behavior: 'smooth' }); toast('Görsel tarifi kutuya alındı; istersen @etiket ekleyip üret.', 'success'); }
      return;
    }
    const d = t.closest('[data-yt-design]');
    if (d) { try { await openDesign(ideas[Number(d.dataset.ytDesign)].text, d); } catch (err) { toast(err.message, 'error'); } return; }
    if (t.closest('#yt-blank')) { try { await openDesign('', t.closest('#yt-blank')); } catch (err) { toast(err.message, 'error'); } }
  };

  const form = $('#yt-form');
  if (form) form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const r = await busyTimer(e.submitter || form.querySelector('[type=submit]'), () => api.youtubeIdeas(brand.id, {
        title: fd.get('title'), topic: fd.get('topic'), url: fd.get('url') || '', count: Number(fd.get('count')), model: (form.querySelector('#yt-model') || {}).value || null
      }), fd.get('url') ? 'Videoyu izliyor' : 'Düşünüyor');
      ideas = r.ideas; summary = r.summary;
      $('#yt-note').textContent = aiNote(r.ai);
      drawIdeas();
    } catch (err) { toast(err.message, 'error'); }
  });
}
