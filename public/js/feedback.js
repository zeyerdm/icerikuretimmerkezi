// 7.11 Beğen/beğenme: prompt ve görsellere 👍/👎 ve kısa neden. Tekrar eden nedenler Prompt kimliği sayfasında öneri olur.
import { api } from './api.js';
import { esc, toast, openModal } from './ui.js';
import { state } from './app.js';

export function feedbackButtons(fb, type, id) {
  const v = fb ? fb.vote : 0;
  const why = fb && fb.vote === -1 && fb.reasons.length ? fb.reasons.map(r => (state.meta.feedbackReasons || {})[r] || r).join(', ') : '';
  return `<span class="fb-row" data-fb-type="${esc(type)}" data-fb-id="${esc(id)}">
    <button type="button" class="btn btn-sm btn-ghost fb-btn ${v === 1 ? 'on' : ''}" data-fb="1" aria-pressed="${v === 1}" title="Beğendim">👍</button>
    <button type="button" class="btn btn-sm btn-ghost fb-btn ${v === -1 ? 'on' : ''}" data-fb="-1" aria-pressed="${v === -1}" title="${esc(why ? 'Beğenmedim: ' + why : 'Beğenmedim (neden?)')}">👎</button></span>`;
}

// Tıklama işleyicisi; işlenirse true döner. onDone(feedback) yeni oyla çağrılır.
export async function handleFeedbackClick(e, brandId, current, onDone) {
  const btn = e.target.closest('[data-fb]');
  if (!btn) return false;
  const row = btn.closest('[data-fb-type]');
  const target = { targetType: row.dataset.fbType, targetId: row.dataset.fbId };
  const want = Number(btn.dataset.fb);
  const send = async body => {
    const r = await api.saveFeedback(brandId, Object.assign({}, target, body));
    if (row.isConnected) row.outerHTML = feedbackButtons(r.feedback, target.targetType, target.targetId);
    onDone(r.feedback);
    if (r.suggestions && r.suggestions.length) toast(`Geri bildirimlerinden ${r.suggestions.length} öneri çıktı; Prompt kimliği sayfasında görebilirsin.`, 'info', 6000);
    return r;
  };
  if (want === 1) {
    try { await send({ vote: current && current.vote === want ? 0 : want }); } catch (err) { toast(err.message, 'error'); }
    return true;
  }
  const reasons = state.meta.feedbackReasons || {};
  const had = current && current.vote === -1 ? current.reasons : [];
  openModal({
    title: 'Neyi beğenmedin?', submitLabel: 'Kaydet',
    body: `<p class="small muted mb-3">Nedenini işaretle. Aynı neden tekrar edince Prompt kimliğine öneri olarak düşer; kimlik kendiliğinden değişmez.</p>
      <div class="chip-row">${Object.entries(reasons).map(([k, l]) => `<label class="chip-check"><input type="checkbox" name="reason" value="${esc(k)}" ${had.includes(k) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>
      <div class="field mt-3"><label for="fb-note">Kısa not (isteğe bağlı)</label><input class="input" id="fb-note" name="note" maxlength="200" value="${esc((current && current.note) || '')}" placeholder="Ör. fincan çok küçük kalmış"></div>
      ${current && current.vote === -1 ? '<label class="check mt-2"><input type="checkbox" name="clear"> Oyu kaldır</label>' : ''}`,
    onSubmit: async fd => {
      if (fd.get('clear')) return send({ vote: 0 });
      return send({ vote: -1, reasons: fd.getAll('reason'), note: fd.get('note') || '' });
    }
  });
  return true;
}

// Prompt kimliği sayfasındaki öneri kartı
export async function suggestionsCard(container, brand, onApplied) {
  let list = [];
  try { list = (await api.feedbackSuggestions(brand.id)).suggestions; } catch { return; }
  const box = document.createElement('section');
  box.className = 'card mb-4';
  box.id = 'fb-suggest';
  const draw = () => {
    box.hidden = !list.length;
    box.innerHTML = `<div class="card-head"><h3>Geri bildirimlerinden öneriler</h3></div>
      <p class="card-text mb-3">Son 90 günde aynı nedenle en az 3 kez 👎 verdin. Uygularsan sonraki prompt'lar buna göre yazılır.</p>
      <ul class="stack-sm">${list.map(s => `<li class="row fb-sug" data-reason="${esc(s.reason)}"><div class="grow"><b>${esc(s.label)}</b> <span class="xsmall muted">${s.count} kez</span><div class="small">${esc(s.text)}</div></div>
        ${s.canApply ? '<button type="button" class="btn btn-sm btn-primary" data-sug-apply>Uygula</button>' : ''}<button type="button" class="btn btn-sm btn-ghost" data-sug-dismiss>Geç</button></li>`).join('')}</ul>`;
  };
  draw();
  container.insertAdjacentElement('beforebegin', box); // verilen öğenin hemen üstüne
  box.addEventListener('click', async e => {
    const li = e.target.closest('[data-reason]');
    if (!li) return;
    try {
      if (e.target.closest('[data-sug-apply]')) {
        const r = await api.applyFeedbackSuggestion(brand.id, li.dataset.reason);
        list = r.suggestions; draw();
        toast('Öneri prompt kimliğine uygulandı.', 'success');
        if (onApplied) onApplied(r.identity);
      } else if (e.target.closest('[data-sug-dismiss]')) {
        list = (await api.dismissFeedbackSuggestion(brand.id, li.dataset.reason)).suggestions; draw();
      }
    } catch (err) { toast(err.message, 'error'); }
  });
}
