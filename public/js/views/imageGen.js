// Görsel üretim kutusu: görsel modeli, oran, marka renkleri ve maskot referansı seçilip üretilir.
// Üretilen görsel markanın kütüphanesine "AI görseli" olarak kaydedilir. Görsel servisi bağlı değilse üretim düğmesi
// gösterilmez, nasıl bağlanacağı yazılır (sahte görsel üretilmez).
import { api } from '../api.js';
import { esc, toast, openModal, busy } from '../ui.js';
import { busyTimer, aiModels, costText } from '../aiPicker.js';
import { downloadBlob, safeName } from '../titlePng.js';
import { feedbackButtons, handleFeedbackClick } from '../feedback.js';
import { ensureThumbs } from '../thumbs.js';
import { state } from '../app.js';

const money = c => (c ? (c < 0.01 ? '< 0,01 $' : c.toFixed(3).replace('.', ',') + ' $') : '');

// opts: { getPrompt(): string, promptId, aspect, editablePrompt: bool, onCreated(asset) }
// 10.1: Drive bağlıysa ve markanın klasörü varsa görsel üretildiği yerden Drive'a gönderilir
const driveFor = brand => Boolean(state.settings && state.settings.drive && state.settings.drive.configured && brand.driveFolderId);

export async function imageBox(box, brand, opts = {}) {
  const driveOn = () => driveFor(brand);
  if (!box) return;
  let ov;
  try { ov = await api.imageOverview(); } catch (err) { box.innerHTML = `<div class="notice">${esc(err.message)}</div>`; return; }
  if (!ov.configured) {
    box.innerHTML = `<div class="notice"><div><strong>Görsel üretimi bağlı değil.</strong> Gemini (Nano Banana / Imagen), OpenAI (GPT Image) ya da OpenRouter anahtarı ekleyince buradan görsel üretebilirsin. Anahtar eklenmeden görsel üretilmez.</div><a class="btn btn-sm" href="#/ai/modeller">AI bağla</a></div>`;
    return;
  }
  const avail = ov.models.filter(m => m.available);
  const id = 'ig-' + Math.random().toString(36).slice(2, 7);
  box.innerHTML = `
    ${opts.editablePrompt ? `<div class="field"><label for="${id}-p">Görsel tarifi</label><textarea class="textarea" id="${id}-p" rows="3" maxlength="4000" placeholder="Ör. Kampüs bahçesinde güneşli sabah, masada dumanı tüten filtre kahve, sıcak tonlar"></textarea>
      <div class="row mt-1"><button type="button" class="btn btn-sm btn-ghost" id="${id}-enh">✨ Geliştir</button><button type="button" class="btn btn-sm btn-ghost" id="${id}-undo" hidden>Geri al</button><span class="xsmall muted">Kısa taslağı ayrıntılı bir görsel prompt'una çevirir.</span></div></div>` : ''}
    <div class="form-grid">
      <div class="field"><label for="${id}-m">Görsel modeli</label><select class="select" id="${id}-m">${avail.map(m => `<option value="${esc(m.ref)}" ${m.ref === ov.default ? 'selected' : ''}>${esc(m.label)} · ~${money(m.perImage)}</option>`).join('')}</select></div>
      <div class="field"><label for="${id}-a">Oran</label><select class="select" id="${id}-a">${Object.entries(ov.aspects).map(([k, v]) => `<option value="${k}" ${k === (opts.aspect || '1:1') ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
    </div>
    <div class="xsmall muted mt-2" id="${id}-mentions"></div>
    <div class="row mt-2">
      <label class="check"><input type="checkbox" id="${id}-c" checked> Marka renklerini kullan</label>
      <label class="check"><input type="checkbox" id="${id}-r"> Maskotu referans al</label>
    </div>
    <div class="xsmall muted mt-1" id="${id}-note"></div>
    <div class="row mt-3"><button class="btn btn-primary" type="button" id="${id}-go">Görsel üret</button><span class="xsmall muted cost-hint" id="${id}-cost"></span><span class="xsmall muted" id="${id}-res"></span></div>
    <div class="gen-grid mt-3" id="${id}-list"></div>`;
  const $ = s => box.querySelector('#' + id + s);
  const note = () => {
    const m = ov.models.find(x => x.ref === $('-m').value);
    const refOk = m && m.refs;
    $('-r').disabled = !refOk;
    if (!refOk) $('-r').checked = false;
    $('-note').textContent = `${m ? m.note : ''}${refOk ? '' : ' · Bu model maskot referansı almıyor; maskot için Gemini Flash Image seç.'}`;
  };
  $('-m').addEventListener('change', note);
  note();
  // 8.5 tahmini tutar ve bütçe uyarısı (görsel başına sabit ücret)
  aiModels().then(models => {
    const cost = () => { const m = ov.models.find(x => x.ref === $('-m').value); $('-cost').textContent = costText(models, m ? m.perImage : null); };
    $('-m').addEventListener('change', cost);
    cost();
  }).catch(() => {});
  // @ ile anılabilecek kütüphane görselleri: rol verilmiş olanlar ve maskot pozları
  api.assets(brand.id).then(({ assets }) => {
    const refs = assets.filter(a => a.refRole || a.category === 'mascot').slice(0, 12);
    if (!refs.length) { $('-mentions').textContent = 'İpucu: Kütüphanede bir görsele referans rolü (kimlik/nesne/stil) verirsen tarifte @etiket ile anabilirsin.'; return; }
    $('-mentions').innerHTML = `Tarifte anabileceğin görseller (Nano Banana gibi referans alan modellerde): ${refs.map(a => `<button type="button" class="chip mention-chip" data-mention="${esc(a.mention)}" title="${esc(a.label || a.categoryLabel)}${a.refRole ? ' · ' + a.refRole : ''}">@${esc(a.mention)}</button>`).join(' ')}`;
  }).catch(() => {});

  // Üretim geçmişi: prompt'a bağlıysa yalnızca onun, değilse markanın bütün üretimleri (son 60)
  let gens = [];
  const compare = new Set();
  async function list() {
    if (!opts.promptId && !opts.historyAll) return;
    try {
      gens = (await api.images(brand.id, opts.promptId || null)).images;
      $('-list').innerHTML = gens.length ? gens.map(card).join('') : '';
      ensureThumbs(brand.id, gens.map(g => g.asset), a => { const img = box.querySelector(`[data-gen] img[src*="/assets/${CSS.escape(a.id)}/"]`); if (img) img.src = a.thumbUrl; });
      drawCompareBar();
    } catch { /* geçmiş yüklenemezse üretim yine çalışır */ }
  }
  const card = g => `<figure class="gen-card" data-gen="${esc(g.id)}"><a href="${esc(g.asset.url)}" target="_blank" rel="noopener"><img src="${esc(g.asset.thumbUrl || g.asset.url)}" alt="${esc(g.prompt.slice(0, 80))}" loading="lazy"></a>
    <figcaption class="xsmall muted">${esc(g.modelLabel)} · ${esc(g.aspect)}${g.usedRefs ? ' · referanslı' : ''}</figcaption>
    <div class="gen-actions">
      <button type="button" class="btn btn-sm btn-ghost" data-detail="${esc(g.id)}">Ayrıntı</button>
      ${g.aspect !== 'kaynak' ? `<button type="button" class="btn btn-sm btn-ghost" data-variant="${esc(g.id)}">Varyasyon</button>` : ''}
      ${g.aspect !== 'kaynak' ? `<button type="button" class="btn btn-sm btn-ghost" data-example="${esc(g.id)}" aria-pressed="${g.example}" title="Tarifi sonraki prompt üretimlerine örnek olarak girer (en çok 3)">${g.example ? '✓ Marka örneği' : '👍 Örnek yap'}</button>` : ''}
      <button type="button" class="btn btn-sm btn-ghost" data-region="${esc(g.id)}">Alanı düzenle</button>
      <button type="button" class="btn btn-sm btn-ghost" data-dl="${esc(g.asset.url)}">İndir</button>
      ${driveOn() ? `<button type="button" class="btn btn-sm btn-ghost" data-drive-asset="${esc(g.asset.id)}">Drive'a gönder</button>` : ''}
      ${feedbackButtons(g.feedback, 'image', g.id)}
      <label class="check xsmall"><input type="checkbox" data-cmp="${esc(g.id)}" ${compare.has(g.id) ? 'checked' : ''}> Karşılaştır</label></div></figure>`;
  function drawCompareBar() {
    let bar = box.querySelector('.cmp-bar');
    if (compare.size < 2) { if (bar) bar.remove(); return; }
    if (!bar) { $('-list').insertAdjacentHTML('beforebegin', '<div class="cmp-bar"></div>'); bar = box.querySelector('.cmp-bar'); }
    bar.innerHTML = `<span class="small">${compare.size} görsel seçildi</span><button type="button" class="btn btn-sm btn-primary" data-compare-open>Yan yana karşılaştır</button><button type="button" class="btn btn-sm btn-ghost" data-compare-clear>Seçimi temizle</button>`;
  }
  list();

  function detailModal(g) {
    openModal({
      title: 'Üretim ayrıntısı', submitLabel: opts.editablePrompt ? 'Tarifi kutuya al' : 'Kapat',
      body: `<img class="gen-detail-img" src="${esc(g.asset.url)}" alt="">
        <dl class="kv mt-3"><dt>Model</dt><dd>${esc(g.modelLabel)}</dd><dt>Oran</dt><dd>${esc(g.aspect === 'kaynak' ? 'Kaynak görselle aynı (alan düzenleme)' : g.aspect)}</dd>
          <dt>Referans</dt><dd>${g.usedRefs ? 'Var (maskot ya da @ ile anılan görseller)' : 'Yok'}</dd><dt>Tutar</dt><dd>${g.cost ? '~' + money(g.cost) : '—'}</dd>
          <dt>Tarih</dt><dd>${esc(new Date(g.createdAt).toLocaleString('tr-TR'))}</dd><dt>Kütüphane adı</dt><dd>${esc(g.asset.label || '')}</dd></dl>
        <div class="field mt-3"><span class="field-label">Tarif (prompt)</span><div class="cmp-text">${esc(g.prompt)}</div></div>`,
      onSubmit: async () => { if (opts.editablePrompt) { $('-p').value = g.prompt.replace(/^Alan düzenleme: /, ''); $('-p').focus(); } }
    });
  }

  // Alan düzenleme: fareyle bir ya da birkaç dikdörtgen seç; işaretli kopya + asıl görsel modele gider
  function regionModal(g) {
    const rects = [];
    const m = openModal({
      title: 'Alanı düzenle', submitLabel: 'Seçili alanı değiştir',
      body: `<p class="small muted mb-2">Değiştirmek istediğin yerleri fareyle sürükleyerek işaretle (birden çok alan seçebilirsin). Görselin geri kalanı korunur; sonuç kütüphaneye yeni görsel olarak kaydedilir.</p>
        <div class="region-wrap"><canvas id="rg-canvas"></canvas></div>
        <div class="row mt-2"><span class="xsmall muted" id="rg-count">Seçili alan yok</span><button type="button" class="btn btn-sm btn-ghost" id="rg-clear">Seçimi temizle</button></div>
        <div class="form-grid mt-3"><div class="field full"><label for="rg-ins">Bu alanda ne olsun? *</label><input class="input" id="rg-ins" name="instruction" required maxlength="1000" placeholder="Ör. fincanı kırmızı bir termos bardakla değiştir"></div>
        <div class="field"><label for="rg-model">Model</label><select class="select" id="rg-model">${ov.models.filter(x => x.available && x.refs).map(x => `<option value="${esc(x.ref)}">${esc(x.label)}</option>`).join('') || '<option value="">Referans alan model bağlı değil</option>'}</select></div></div>`,
      onSubmit: async (fd, form) => {
        if (!rects.length) throw new Error('Önce görselde değiştirilecek alanı işaretle.');
        const img = canvas._img;
        const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, c.width, c.height);
        x.fillStyle = 'rgba(255,0,0,0.45)'; x.strokeStyle = '#ff0000'; x.lineWidth = Math.max(3, c.width / 200);
        rects.forEach(r => { x.fillRect(r.x * c.width, r.y * c.height, r.w * c.width, r.h * c.height); x.strokeRect(r.x * c.width, r.y * c.height, r.w * c.width, r.h * c.height); });
        const blob = await new Promise(res => c.toBlob(res, 'image/png'));
        const r = await busyTimer(form.querySelector('[type=submit]'), () => api.editImageRegion(brand.id, g.asset.id, blob, fd.get('instruction'), form.querySelector('#rg-model').value || null), 'Düzenliyor');
        toast(`Düzenlenen görsel kaydedildi (${r.ai.modelLabel}).`, 'success');
        list();
        if (opts.onCreated) opts.onCreated(r.asset);
      }
    });
    const canvas = m.form.querySelector('#rg-canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas._img = img;
      const maxW = Math.min(560, m.form.querySelector('.region-wrap').clientWidth || 560);
      const k = Math.min(maxW / img.naturalWidth, 420 / img.naturalHeight);
      canvas.width = Math.round(img.naturalWidth * k); canvas.height = Math.round(img.naturalHeight * k);
      draw();
    };
    img.src = g.asset.url;
    let start = null; let cur = null;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255,0,0,0.35)'; ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 2;
      [...rects, ...(cur ? [cur] : [])].forEach(r => { ctx.fillRect(r.x * canvas.width, r.y * canvas.height, r.w * canvas.width, r.h * canvas.height); ctx.strokeRect(r.x * canvas.width, r.y * canvas.height, r.w * canvas.width, r.h * canvas.height); });
      m.form.querySelector('#rg-count').textContent = rects.length ? `${rects.length} alan seçildi` : 'Seçili alan yok';
    };
    const pt = e => { const b = canvas.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) }; };
    canvas.addEventListener('pointerdown', e => { start = pt(e); canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!start) return; const p = pt(e); cur = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) }; draw(); });
    canvas.addEventListener('pointerup', () => { if (cur && cur.w > 0.01 && cur.h > 0.01) rects.push(cur); start = null; cur = null; draw(); });
    m.form.querySelector('#rg-clear').addEventListener('click', () => { rects.length = 0; draw(); });
  }

  // Geliştir + Geri al: kısa taslak → ayrıntılı prompt; önceki metin bir adım geri alınabilir
  const history = [];
  box.addEventListener('click', async e => {
    if (opts.editablePrompt && e.target.closest('#' + id + '-enh')) {
      const ta = $('-p'); const draft = ta.value.trim();
      if (!draft) return toast('Önce kısa bir taslak yaz.', 'error');
      try {
        const r = await busyTimer(e.target.closest('button'), () => api.enhancePrompt(brand.id, { kind: 'gorsel', text: draft }), 'Geliştiriyor');
        history.push(ta.value); ta.value = r.prompt; $('-undo').hidden = false;
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (opts.editablePrompt && e.target.closest('#' + id + '-undo')) {
      if (history.length) $('-p').value = history.pop();
      $('-undo').hidden = !history.length;
      return;
    }
    const mc = e.target.closest('[data-mention]');
    if (mc) {
      const ta = opts.editablePrompt ? $('-p') : (opts.mentionTarget ? opts.mentionTarget() : null);
      if (ta) { ta.value = `${ta.value.trim()} @${mc.dataset.mention} `.trimStart(); ta.focus(); } else navigator.clipboard && navigator.clipboard.writeText('@' + mc.dataset.mention).then(() => toast('Kopyalandı; prompt\'a yapıştır.', 'success')).catch(() => {});
      return;
    }
    const findGen = el => gens.find(x => x.id === el.dataset.detail || x.id === el.dataset.variant || x.id === el.dataset.region);
    const det = e.target.closest('[data-detail]');
    if (det) return detailModal(findGen(det));
    const fbRow = e.target.closest('[data-fb-id]');
    if (fbRow) { const g = gens.find(x => x.id === fbRow.dataset.fbId); if (g && await handleFeedbackClick(e, brand.id, g.feedback, fb => { g.feedback = fb; })) return; }
    const exb = e.target.closest('[data-example]');
    if (exb) {
      const g = gens.find(x => x.id === exb.dataset.example);
      try {
        await busy(exb, () => api.setImageExample(brand.id, g.id, !g.example));
        g.example = !g.example;
        exb.outerHTML = card(g).match(/<button[^>]*data-example[\s\S]*?<\/button>/)[0];
        toast(g.example ? 'Marka örneği yapıldı; tarifi sonraki görsel prompt\'larına örnek olarak girer.' : 'Marka örneğinden çıkarıldı.', 'success');
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const reg = e.target.closest('[data-region]');
    if (reg) return regionModal(findGen(reg));
    const vr = e.target.closest('[data-variant]');
    if (vr) {
      const g = findGen(vr);
      try {
        await busyTimer(vr, () => api.generateImage(brand.id, { prompt: `${g.prompt}\n\nCreate a fresh variation: same subject and intent, different composition or moment.`, model: g.model, aspect: g.aspect, useColors: $('-c').checked, promptId: opts.promptId || null }), '…');
        toast('Varyasyon üretildi.', 'success'); list();
      } catch (err) { toast(err.message, 'error', 6000); }
      return;
    }
    const cb = e.target.closest('[data-cmp]');
    if (cb) { if (cb.checked) compare.add(cb.dataset.cmp); else compare.delete(cb.dataset.cmp); return drawCompareBar(); }
    if (e.target.closest('[data-compare-clear]')) { compare.clear(); box.querySelectorAll('[data-cmp]').forEach(x => { x.checked = false; }); return drawCompareBar(); }
    if (e.target.closest('[data-compare-open]')) {
      const sel = gens.filter(g => compare.has(g.id));
      openModal({ title: `Karşılaştır (${sel.length})`, submitLabel: 'Kapat',
        body: `<div class="cmp-grid">${sel.map(g => `<figure><img src="${esc(g.asset.url)}" alt=""><figcaption class="xsmall"><b>${esc(g.modelLabel)}</b> · ${esc(g.aspect)}<div class="muted">${esc(g.prompt.slice(0, 140))}</div></figcaption></figure>`).join('')}</div>`, onSubmit: async () => {} });
      return;
    }
    const dv = e.target.closest('[data-drive-asset]');
    if (dv) {
      try { await busy(dv, () => api.sendAssetToDrive(brand.id, dv.dataset.driveAsset)); toast('Görsel markanın Drive klasörüne gönderildi.', 'success'); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const dl = e.target.closest('[data-dl]');
    if (dl) {
      try { const blob = await (await fetch(dl.dataset.dl)).blob(); downloadBlob(blob, `${safeName(brand.name + ' gorsel')}.${blob.type.includes('jpeg') ? 'jpg' : 'png'}`); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const go = e.target.closest('#' + id + '-go');
    if (!go) return;
    const prompt = (opts.editablePrompt ? $('-p').value : (opts.getPrompt ? opts.getPrompt() : '')).trim();
    if (!prompt) return toast('Önce görselin tarifini yaz.', 'error');
    try {
      const r = await busyTimer(go, () => api.generateImage(brand.id, { prompt, model: $('-m').value, aspect: $('-a').value, useColors: $('-c').checked, useMascot: $('-r').checked, promptId: opts.promptId || null }), 'Üretiyor');
      $('-res').textContent = `${r.ai.modelLabel} · ${Math.round(r.ai.ms / 1000)} sn${r.ai.cost ? ' · ~' + money(r.ai.cost) : ''} · kütüphaneye "AI görseli" olarak kaydedildi`;
      if (opts.promptId || opts.historyAll) list();
      else $('-list').insertAdjacentHTML('afterbegin', `<figure class="gen-card"><img src="${esc(r.asset.url)}" alt=""><figcaption class="xsmall muted">${esc(r.ai.modelLabel)}</figcaption></figure>`);
      if (opts.onCreated) opts.onCreated(r.asset);
    } catch (err) { toast(err.message, 'error', 6000); }
  });
}
