// AI içerik denetçisi kutusu: metni marka diline, uzunluğa ve kurallara göre denetletir; sonucu altında gösterir.
// Reels açıklaması ve post stüdyosu aynı kutuyu kullanır.
import { api } from '../api.js';
import { esc, toast } from '../ui.js';
import { modelSelect, busyTimer, aiNote } from '../aiPicker.js';

export function reviewBox(box, brand, models, getText, kind, onUseImproved) {
  if (!box) return;
  const aiReady = models.ov.providers.some(p => p.configured);
  if (!aiReady) { box.innerHTML = ''; return; }
  const id = 'rv-model-' + Math.random().toString(36).slice(2, 7);
  box.innerHTML = `<div class="row"><button type="button" class="btn btn-sm" data-review>Denetle</button>${modelSelect(models, 'denetim', { id })}<span class="xsmall muted">Marka diline, uzunluğa ve kurallara göre kontrol eder.</span></div><div class="review-out"></div>`;
  const out = box.querySelector('.review-out');
  box.querySelector('[data-review]').addEventListener('click', async e => {
    const t = getText().trim();
    if (!t) return toast('Denetlenecek metin yok.', 'error');
    try {
      const { review } = await busyTimer(e.currentTarget, () => api.review(brand.id, { text: t, kind, model: box.querySelector('#' + id).value || null }), 'Denetliyor');
      const sev = { yüksek: 'status-badge status-hazirlaniyor', orta: 'status-badge status-taslak', düşük: 'status-badge' };
      out.innerHTML = `<div class="review-result mt-3">
        <div class="row-between"><b>${review.score != null ? `Puan: ${review.score}/100` : 'Değerlendirme'}</b><span class="xsmall muted">${esc(aiNote(review.ai).replace('yazıldı', 'denetlendi'))}</span></div>
        ${review.summary ? `<p class="small mt-2">${esc(review.summary)}</p>` : ''}
        ${review.issues.length ? `<ul class="issue-list mt-2">${review.issues.map(i => `<li><span class="${sev[i.severity] || 'status-badge'}">${esc(i.severity)}</span> ${esc(i.problem)}${i.suggestion ? `<div class="xsmall muted">Öneri: ${esc(i.suggestion)}</div>` : ''}</li>`).join('')}</ul>` : '<p class="small mt-2">Sorun bulunmadı.</p>'}
        ${review.improved && onUseImproved ? `<details class="disclosure"><summary>Önerilen düzeltilmiş metin</summary><div class="cmp-text">${esc(review.improved)}</div><button type="button" class="btn btn-sm mt-2" data-use>Bu metni kullan</button></details>` : ''}
      </div>`;
      const use = out.querySelector('[data-use]');
      if (use) use.addEventListener('click', () => onUseImproved(review.improved));
    } catch (err) { toast(err.message, 'error'); }
  });
}
