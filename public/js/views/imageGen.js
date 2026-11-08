// Görsel üretim kutusu: görsel modeli, oran, marka renkleri ve maskot referansı seçilip üretilir.
// Üretilen görsel markanın kütüphanesine "AI görseli" olarak kaydedilir. Görsel servisi bağlı değilse üretim düğmesi
// gösterilmez, nasıl bağlanacağı yazılır (sahte görsel üretilmez).
import { api } from '../api.js';
import { esc, toast } from '../ui.js';
import { busyTimer } from '../aiPicker.js';
import { downloadBlob, safeName } from '../titlePng.js';

const money = c => (c ? (c < 0.01 ? '< 0,01 $' : c.toFixed(3).replace('.', ',') + ' $') : '');

// opts: { getPrompt(): string, promptId, aspect, editablePrompt: bool, onCreated(asset) }
export async function imageBox(box, brand, opts = {}) {
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
    <div class="row mt-3"><button class="btn btn-primary" type="button" id="${id}-go">Görsel üret</button><span class="xsmall muted" id="${id}-res"></span></div>
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
  // @ ile anılabilecek kütüphane görselleri: rol verilmiş olanlar ve maskot pozları
  api.assets(brand.id).then(({ assets }) => {
    const refs = assets.filter(a => a.refRole || a.category === 'mascot').slice(0, 12);
    if (!refs.length) { $('-mentions').textContent = 'İpucu: Kütüphanede bir görsele referans rolü (kimlik/nesne/stil) verirsen tarifte @etiket ile anabilirsin.'; return; }
    $('-mentions').innerHTML = `Tarifte anabileceğin görseller (Nano Banana gibi referans alan modellerde): ${refs.map(a => `<button type="button" class="chip mention-chip" data-mention="${esc(a.mention)}" title="${esc(a.label || a.categoryLabel)}${a.refRole ? ' · ' + a.refRole : ''}">@${esc(a.mention)}</button>`).join(' ')}`;
  }).catch(() => {});

  async function list() {
    if (!opts.promptId) return;
    try {
      const { images } = await api.images(brand.id, opts.promptId);
      $('-list').innerHTML = images.map(card).join('');
    } catch { /* geçmiş yüklenemezse üretim yine çalışır */ }
  }
  const card = g => `<figure class="gen-card"><a href="${esc(g.asset.url)}" target="_blank" rel="noopener"><img src="${esc(g.asset.url)}" alt="${esc(g.prompt.slice(0, 80))}" loading="lazy"></a>
    <figcaption class="xsmall muted">${esc(g.modelLabel)} · ${esc(g.aspect)}${g.usedRefs ? ' · maskotlu' : ''}</figcaption>
    <button type="button" class="btn btn-sm btn-ghost" data-dl="${esc(g.asset.url)}">İndir</button></figure>`;
  list();

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
      $('-list').insertAdjacentHTML('afterbegin', card({ asset: r.asset, prompt, modelLabel: r.ai.modelLabel, aspect: $('-a').value, usedRefs: r.ai.usedRefs }));
      if (opts.onCreated) opts.onCreated(r.asset);
    } catch (err) { toast(err.message, 'error', 6000); }
  });
}
