// Ortak tarif seçici: kayıtlı prompt / Reels kalıbı tariflerini listeler; "Bu markaya ekle" ile kopyalar.
import { api } from './api.js';
import { esc, icon, toast, openModal, emptyState } from './ui.js';

export async function openRecipes(kind, brand, onApplied) {
  let list = [];
  try { list = (await api.recipes(kind)).recipes; } catch (err) { return toast(err.message, 'error'); }
  const m = openModal({
    title: kind === 'prompt' ? 'Prompt tarifleri' : kind === 'identity' ? 'Prompt kimliği tarifleri' : 'Reels kalıbı tarifleri', submitLabel: 'Kapat',
    body: list.length ? `<p class="small muted mb-3">${kind === 'identity' ? `Başka markalardan kaydettiğin prompt kimlikleri. "Ekle" ile ${esc(brand.name)} markasında <b>boş olan</b> cevaplar doldurulur; mevcut cevapların değişmez. Dosya ve maskot görselleri taşınmaz.` : `Başka markalarda beğenip kaydettiğin ${kind === 'prompt' ? "prompt'lar" : 'kalıplar'}. "Ekle" ile ${esc(brand.name)} markasına kopyalanır; marka kimliği yeni üretimlerde kendiliğinden kullanılır.`}</p>
      <div class="rc-list">${list.map(r => `<div class="rc-item" data-rid="${esc(r.id)}"><div><b>${esc(r.title)}</b><p>${esc(r.preview)}</p><em>${esc(r.sourceBrand)} · ${r.uses} kez kullanıldı</em></div>
        <div class="row"><button type="button" class="btn btn-sm btn-primary" data-apply="${esc(r.id)}">${icon('plus')}Ekle</button><button type="button" class="btn btn-sm btn-ghost icon-btn" data-rdel="${esc(r.id)}" aria-label="Tarifi sil">${icon('trash')}</button></div></div>`).join('')}</div>`
      : emptyState({ icon: 'star', title: 'Henüz tarif yok', text: kind === 'prompt' ? "Beğendiğin bir prompt'un Dosya menüsünden \"Tariflere kaydet\"i seç." : kind === 'identity' ? 'Başka bir markanın Prompt kimliği sayfasında "Tarif olarak kaydet"e bas.' : 'Kalıp arşivinde beğendiğin kalıbın \"Tariflere kaydet\" düğmesine bas.', compact: true }),
    onSubmit: () => {}
  });
  m.form.addEventListener('click', async e => {
    const a = e.target.closest('[data-apply]');
    if (a) { a.disabled = true; try { const res = await api.applyRecipe(a.dataset.apply, brand.id); toast('Tariften eklendi.', 'success'); onApplied && onApplied(res); } catch (err) { a.disabled = false; toast(err.message, 'error'); } return; }
    const d = e.target.closest('[data-rdel]');
    if (d) { if (!confirm('Bu tarif silinsin mi? Daha önce eklenen kopyalar kalır.')) return; try { await api.deleteRecipe(d.dataset.rdel); d.closest('.rc-item').remove(); } catch (err) { toast(err.message, 'error'); } }
  });
}
