// YouTube kapak stüdyosu (10.9: kendi çekiminden kapak).
// 1) Çekimlerin: videodan alınan kareler ve fotoğraflar (kütüphanede "YouTube çekimleri" paketi). Kapağın asıl konusu bunlar.
// 2) Beğendiğin kapaklar: ör. Pinterest'ten referanslar ("YouTube kapak referansı" paketi). Yalnız yazı stili, yerleşim ve
//    renk işlenişi örnek alınır.
// 3) Video ve kapak fikirleri: konudan (Gemini bağlıysa YouTube bağlantısından) kapak yazısı, yerleşim ve yüz ifadesi önerileri.
// 4) Kapağı oluştur: seçilen çekimler + referanslar + yazı → 16:9 kapak; YouTube önizlemesi, indirme, Drive,
//    düzenlenebilir tasarım. Rastgele görselden kapak üretilmez.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState, openModal, busy } from '../ui.js';
import { aiModels, modelSelect, busyTimer, aiNote } from '../aiPicker.js';
import { state, go } from '../app.js';


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

export const SHOT_PACK = 'YouTube çekimleri';
export const REF_PACK = 'YouTube kapak referansı';
const MAX_SHOTS = 3;
const MAX_REFS = 2;

// Videodan kare alma: tarayıcıda (sunucuya video gitmez) eşit aralıklı 8 kare çıkarılır; seçilenler kütüphaneye kaydedilir
async function framesFromVideo(file) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('Video açılamadı; MP4 (H.264) ya da WEBM dene.')); });
  const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
  if (!dur) throw new Error('Videonun süresi okunamadı.');
  const scale = Math.min(1, 1280 / (v.videoWidth || 1280));
  const c = document.createElement('canvas');
  c.width = Math.round((v.videoWidth || 1280) * scale); c.height = Math.round((v.videoHeight || 720) * scale);
  const out = [];
  for (let i = 1; i <= 8; i++) {
    const t = (dur * i) / 9;
    await new Promise(ok => { v.onseeked = ok; v.currentTime = t; });
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.9));
    if (blob) out.push({ t, blob, url: URL.createObjectURL(blob) });
  }
  URL.revokeObjectURL(url);
  return out;
}
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export async function renderYoutube(view, brand) {
  view.innerHTML = '<div class="skeleton" style="height:420px"></div>';
  const models = await aiModels().catch(() => null);
  const aiReady = Boolean(models && models.ov.tasks.find(t => t.id === 'yazim' && t.primary));
  const gemini = Boolean(models && models.ov.providers.some(p => p.id === 'gemini' && p.configured));
  let iov = null;
  try { iov = await api.imageOverview(); } catch { iov = null; }
  const imgModels = iov ? iov.models.filter(m => m.available && m.refs) : [];
  const canSend = Boolean(state.settings && state.settings.drive && state.settings.drive.configured && brand.driveFolderId);
  let ideas = [];
  let summary = '';
  let all = [];
  const pickedShots = new Set();
  const pickedRefs = new Set();
  const covers = []; // bu oturumda üretilen kapaklar

  view.innerHTML = `
    ${pageHead({ title: 'YouTube kapağı', desc: 'Kapak kendi çekiminden üretilir: videodan kareleri ya da fotoğraflarını ekle, beğendiğin kapakları referans olarak koy, kapak yazısını seç; kapak çekimindeki kişiyle ve referansın yazı stiliyle hazırlanır.',
      actions: `<a class="btn btn-ghost" href="#/m/${esc(brand.id)}/post">${icon('palette')}Post stüdyosu</a>` })}
    <div class="yt-layout">
      <section class="card">
        <div class="card-head"><h3>1 · Çekimlerin</h3><span class="xsmall muted" id="yt-shot-n"></span></div>
        <p class="small muted mb-3">Videodan kareler ya da çekim fotoğrafları. Kapağın asıl konusu bunlar; en çok ${MAX_SHOTS} tane seç.</p>
        <div class="row mb-3"><label class="btn btn-sm">${icon('film')}Videodan kare al<input type="file" class="sr-only" id="yt-video" accept="video/*"></label>
          <label class="btn btn-sm">${icon('upload')}Fotoğraf ekle<input type="file" class="sr-only" id="yt-shot-file" accept="image/png,image/jpeg,image/webp" multiple></label></div>
        <div id="yt-shots"></div>
      </section>
      <section class="card">
        <div class="card-head"><h3>2 · Beğendiğin kapaklar</h3><span class="xsmall muted" id="yt-ref-n"></span></div>
        <p class="small muted mb-3">Ör. Pinterest'ten kaydettiğin kapaklar. Yalnız yazı fontu, yazı yerleşimi, düzen ve renk işlenişi örnek alınır; içerikleri kopyalanmaz. En çok ${MAX_REFS} tane seç.</p>
        <div class="row mb-3"><label class="btn btn-sm">${icon('upload')}Referans kapak ekle<input type="file" class="sr-only" id="yt-ref-file" accept="image/png,image/jpeg,image/webp" multiple></label></div>
        <div id="yt-refs"></div>
      </section>
    </div>
    <div class="yt-layout mt-4">
      <section class="card">
        <div class="card-head"><h3>3 · Video ve kapak yazısı</h3></div>
        ${aiReady ? `<form id="yt-form" class="stack">
          <div class="field"><label for="yt-title">Video başlığı</label><input class="input" id="yt-title" name="title" maxlength="120" placeholder="Ör. Evde barista kalitesinde latte (3 malzeme)"></div>
          <div class="field"><label for="yt-topic">Video ne anlatıyor?</label><textarea class="textarea" id="yt-topic" name="topic" rows="3" maxlength="2000" placeholder="Videonun içeriği, öne çıkan anlar, kimin konuştuğu…" data-mic></textarea></div>
          ${gemini ? `<div class="field"><label for="yt-url">YouTube bağlantısı <span class="muted">(isteğe bağlı · Gemini videoyu izler)</span></label><input class="input" id="yt-url" name="url" type="url" maxlength="300" placeholder="https://www.youtube.com/watch?v=…"></div>` : ''}
          <div class="row"><label class="small" for="yt-count">Fikir sayısı</label><select class="select w-auto" id="yt-count" name="count">${[3, 4, 5, 6].map(n => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select>
            ${modelSelect(models, 'yazim', { id: 'yt-model' })}<span class="spacer"></span><button class="btn" type="submit">${icon('sparkle')}Kapak yazısı öner</button></div>
        </form>` : '<p class="small muted">Kapak yazısı önerisi için bir yapay zekâ bağla; yazıyı 4. adımda elle de yazabilirsin.</p>'}
        <div class="xsmall muted mt-2" id="yt-note"></div>
        <div id="yt-ideas" class="mt-3"></div>
      </section>
      <section class="card">
        <div class="card-head"><h3>4 · Kapağı oluştur</h3><button type="button" class="btn btn-sm btn-ghost" id="yt-blank">${icon('plus')}Düzenlenebilir tasarım aç</button></div>
        <form id="yt-cover" class="stack">
          <div class="field"><label for="yt-text">Kapak yazısı (en çok 4 kelime)</label><input class="input" id="yt-text" name="text" maxlength="60" placeholder="Ör. 3 MALZEME YETER"></div>
          <div class="form-grid"><div class="field"><label for="yt-comp">Yerleşim (isteğe bağlı)</label><input class="input" id="yt-comp" name="composition" maxlength="300" placeholder="Ör. yazı solda, kişi sağda yakın plan"></div>
            <div class="field"><label for="yt-emo">Yüz ifadesi (isteğe bağlı)</label><input class="input" id="yt-emo" name="emotion" maxlength="80" placeholder="Ör. şaşkın"></div></div>
          <div class="row"><label class="small" for="yt-img-model">Model</label><select class="select w-auto" id="yt-img-model">${imgModels.map(m => `<option value="${esc(m.ref)}" ${iov && m.ref === iov.default ? 'selected' : ''}>${esc(m.label)}</option>`).join('') || '<option value="">Referans alan görsel modeli bağlı değil</option>'}</select>
            <span class="spacer"></span><button class="btn btn-primary" type="submit" ${imgModels.length ? '' : 'disabled'}>${icon('image')}Kapağı oluştur</button></div>
          <p class="xsmall muted" id="yt-sel-note"></p>
        </form>
        <div id="yt-covers" class="mt-3"></div>
      </section>
    </div>`;
  const $ = s => view.querySelector(s);

  const thumbGrid = (list, set, kind) => list.length
    ? `<div class="yt-pick-grid">${list.map(a => `<label class="yt-pick ${set.has(a.id) ? 'on' : ''}"><input type="checkbox" data-pick-${kind}="${esc(a.id)}" ${set.has(a.id) ? 'checked' : ''}><img src="${esc(a.thumbUrl || a.url)}" alt="${esc(a.label)}" loading="lazy"><span class="xsmall truncate">${esc(a.label)}</span></label>`).join('')}</div>`
    : emptyState({ icon: 'image', title: kind === 'shot' ? 'Henüz çekim yok' : 'Henüz referans yok', text: kind === 'shot' ? 'Videodan kare al ya da fotoğraf ekle.' : 'Beğendiğin bir kapağın ekran görüntüsünü ekle.', compact: true });
  async function loadAssets() {
    all = (await api.assets(brand.id)).assets;
    drawAssets();
  }
  function drawAssets() {
    const shots = all.filter(a => a.pack === SHOT_PACK);
    const refs = all.filter(a => a.pack === REF_PACK);
    [...pickedShots].forEach(id => { if (!shots.some(a => a.id === id)) pickedShots.delete(id); });
    [...pickedRefs].forEach(id => { if (!refs.some(a => a.id === id)) pickedRefs.delete(id); });
    $('#yt-shots').innerHTML = thumbGrid(shots, pickedShots, 'shot');
    $('#yt-refs').innerHTML = thumbGrid(refs, pickedRefs, 'ref');
    $('#yt-shot-n').textContent = `${pickedShots.size}/${MAX_SHOTS} seçili`;
    $('#yt-ref-n').textContent = `${pickedRefs.size}/${MAX_REFS} seçili`;
    $('#yt-sel-note').textContent = pickedShots.size ? `${pickedShots.size} çekim${pickedRefs.size ? ` ve ${pickedRefs.size} referans kapak` : ''} kullanılacak.` : 'Önce 1. adımdan en az bir çekim seç.';
  }
  async function uploadTo(files, category, pack) {
    let ok = 0;
    for (const f of files) {
      try { await api.uploadAsset(brand.id, f, category, (f.name || 'kare').replace(/\.[^.]+$/, '').slice(0, 80), pack); ok++; } catch (err) { toast(`${f.name || 'Kare'}: ${err.message}`, 'error'); }
    }
    if (ok) toast(`${ok} görsel eklendi.`, 'success');
    await loadAssets();
  }

  function framesModal(frames, name) {
    const m = openModal({
      title: 'Videodan kare seç', submitLabel: 'Seçilenleri ekle',
      body: `<p class="small muted mb-3">Kapakta kullanmak istediğin kareleri seç; kütüphanede "${esc(SHOT_PACK)}" olarak saklanır.</p>
        <div class="yt-pick-grid">${frames.map((f, i) => `<label class="yt-pick"><input type="checkbox" name="f" value="${i}"><img src="${f.url}" alt="${mmss(f.t)}"><span class="xsmall">${mmss(f.t)}</span></label>`).join('')}</div>`,
      onSubmit: async fd => {
        const sel = fd.getAll('f').map(Number);
        if (!sel.length) throw new Error('En az bir kare seç.');
        const base = (name || 'video').replace(/\.[^.]+$/, '').slice(0, 50);
        await uploadTo(sel.map(i => new File([frames[i].blob], `${base} ${mmss(frames[i].t).replace(':', '.')}.jpg`, { type: 'image/jpeg' })), 'brand_image', SHOT_PACK);
      }
    });
    m.form.closest('.modal').classList.add('modal-wide');
    m.form.addEventListener('change', e => { const l = e.target.closest('.yt-pick'); if (l) l.classList.toggle('on', e.target.checked); });
  }

  const ideaCard = (it, i) => `<article class="yt-idea">
      <div class="yt-idea-text" style="${it.colors[0] ? `--yt-accent:${esc(it.colors[0])}` : ''}">${esc(it.text)}</div>
      <div class="yt-idea-body"><b>${esc(it.name)}</b>
        <dl class="kv xsmall"><dt>Vaat</dt><dd>${esc(it.promise || '—')}</dd>${it.emotion ? `<dt>Yüz ifadesi</dt><dd>${esc(it.emotion)}</dd>` : ''}<dt>Yerleşim</dt><dd>${esc(it.composition || '—')}</dd></dl>
        <div class="row mt-2"><button type="button" class="btn btn-sm btn-primary" data-yt-use="${i}">Bu yazıyı kullan</button></div></div></article>`;
  function drawIdeas() {
    $('#yt-ideas').innerHTML = ideas.length ? `${summary ? `<p class="small"><b>Videonun vaadi:</b> ${esc(summary)}</p>` : ''}<div class="yt-ideas">${ideas.map(ideaCard).join('')}</div>` : '';
  }
  function drawCovers() {
    $('#yt-covers').innerHTML = covers.map((a, i) => `<figure class="yt-cover">
        <img src="${esc(a.url)}" alt="${esc(a.label)}">
        <figcaption class="row"><button type="button" class="btn btn-sm" data-yt-preview="${i}">YouTube önizlemesi</button>
          <a class="btn btn-sm btn-ghost" href="${esc(a.url)}" download="youtube-kapak.png">${icon('download')}İndir</a>
          ${canSend ? `<button type="button" class="btn btn-sm btn-ghost" data-yt-drive="${i}">Drive'a gönder</button>` : ''}
          <button type="button" class="btn btn-sm btn-ghost" data-yt-design="${i}">Tasarım olarak aç</button></figcaption></figure>`).join('');
  }

  // Düzenlenebilir kapak: YouTube kapağı türünde tasarım; zemin üretilen kapak ya da seçili ilk çekim
  async function openDesign(bgUrl, btn) {
    const t = $('#yt-text').value.trim() || ($('#yt-title') && $('#yt-title').value.trim()) || 'YouTube kapağı';
    const { post } = await busyTimer(btn, () => api.createPost(brand.id, { blank: true, kind: 'youtube', title: t }), 'Açılıyor');
    if (bgUrl) {
      const data = post.data;
      const s = data.slides[0];
      s.layers = s.layers.filter(l => !(l.type === 'shape' && l.color === '#e5e7eb') && l.role !== 'label');
      s.bgImage = { src: bgUrl, fit: 'cover', dim: 25 };
      await api.savePost(brand.id, post.id, { data });
    }
    go(`#/m/${brand.id}/post/${post.id}`);
  }

  view.onchange = e => {
    const t = e.target;
    const toggle = (set, max, id, on) => {
      if (on && set.size >= max) { t.checked = false; return toast(`En çok ${max} tane seçebilirsin.`, 'info'); }
      if (on) set.add(id); else set.delete(id);
      drawAssets();
    };
    if (t.dataset.pickShot) return toggle(pickedShots, MAX_SHOTS, t.dataset.pickShot, t.checked);
    if (t.dataset.pickRef) return toggle(pickedRefs, MAX_REFS, t.dataset.pickRef, t.checked);
    if (t.id === 'yt-shot-file' && t.files.length) return uploadTo([...t.files], 'brand_image', SHOT_PACK);
    if (t.id === 'yt-ref-file' && t.files.length) return uploadTo([...t.files], 'reference', REF_PACK);
    if (t.id === 'yt-video' && t.files.length) {
      const f = t.files[0];
      toast('Kareler çıkarılıyor…', 'info', 2500);
      framesFromVideo(f).then(frames => framesModal(frames, f.name)).catch(err => toast(err.message, 'error')).finally(() => { t.value = ''; });
    }
  };
  view.onclick = async e => {
    const t = e.target;
    const use = t.closest('[data-yt-use]');
    if (use) {
      const it = ideas[Number(use.dataset.ytUse)];
      $('#yt-text').value = it.text; $('#yt-comp').value = it.composition || ''; $('#yt-emo').value = it.emotion || '';
      $('#yt-text').scrollIntoView({ block: 'center', behavior: 'smooth' });
      return toast('Kapak yazısı 4. adıma alındı.', 'success');
    }
    const pv = t.closest('[data-yt-preview]');
    if (pv) return youtubePreview(brand, covers[Number(pv.dataset.ytPreview)].url, { title: ($('#yt-title') && $('#yt-title').value) || '' });
    const dr = t.closest('[data-yt-drive]');
    if (dr) { try { await busy(dr, () => api.sendAssetToDrive(brand.id, covers[Number(dr.dataset.ytDrive)].id)); toast('Kapak Drive klasörüne gönderildi.', 'success'); } catch (err) { toast(err.message, 'error'); } return; }
    const d = t.closest('[data-yt-design]');
    if (d) { try { await openDesign(covers[Number(d.dataset.ytDesign)].url, d); } catch (err) { toast(err.message, 'error'); } return; }
    if (t.closest('#yt-blank')) {
      const first = all.find(a => pickedShots.has(a.id));
      try { await openDesign(first ? first.url : null, t.closest('#yt-blank')); } catch (err) { toast(err.message, 'error'); }
    }
  };

  $('#yt-cover').addEventListener('submit', async e => {
    e.preventDefault();
    if (!pickedShots.size) return toast('Kapak kendi çekiminden üretilir: 1. adımdan en az bir çekim seç.', 'error');
    const fd = new FormData(e.target);
    try {
      const r = await busyTimer(e.submitter, () => api.youtubeCover(brand.id, { shotIds: [...pickedShots], refIds: [...pickedRefs], text: fd.get('text'), composition: fd.get('composition'), emotion: fd.get('emotion'), model: $('#yt-img-model').value || null }), 'Kapak hazırlanıyor');
      covers.unshift(r.asset);
      drawCovers();
      toast(`Kapak hazır (${r.ai.modelLabel}); kütüphanede Tasarımlarım'a kaydedildi.`, 'success', 5000);
    } catch (err) { toast(err.message, 'error'); }
  });

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

  $('#yt-shots').innerHTML = '<div class="skeleton" style="height:120px"></div>';
  await loadAssets();
}
