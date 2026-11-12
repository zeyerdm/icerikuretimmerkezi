// Aşama 5.12: Çöp kutusu sayfası ve silme sonrası "Geri al" bildirimi.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState, timeAgo } from '../ui.js';
import { route } from '../app.js';

// Silinen kaydın geri alınınca açılacak yeri (marka sayfası) bulmak için
const PLACE = { idea: '/fikirler', post: '/post', prompt: '/prompt', reels: '/reels', competitor: '/rakipler', pattern: '/reels/kaliplar', content: '/takvim', asset: '/kutuphane' };

export function initTrashUndo() {
  document.addEventListener('ium:trashed', e => {
    const host = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span>Çöp kutusuna taşındı.</span> <button type="button" class="btn btn-sm">Geri al</button>';
    el.querySelector('button').addEventListener('click', async () => {
      el.remove();
      try { await api.restoreTrash(e.detail.id); toast('Geri alındı.', 'success'); route(); } catch (err) { toast(err.message, 'error'); }
    });
    host.appendChild(el);
    setTimeout(() => el.remove(), 7000);
  });
}

export async function renderTrash(view) {
  const { items, days } = await api.trash();
  view.innerHTML = `
    ${pageHead({ title: 'Çöp kutusu', desc: `Silinen fikir, not, görev, takvim içeriği, tasarım, prompt, Reels senaryosu, kalıp, rakip ve kütüphane görselleri ${days} gün burada durur, sonra kendiliğinden silinir.`,
      actions: items.length ? `<button class="btn btn-danger" data-empty>${icon('trash')}Çöp kutusunu boşalt</button>` : '' })}
    ${items.length ? `<div class="card"><div class="trash-list">${items.map(t => `
      <div class="trash-item">
        <span class="tag">${esc(t.kindLabel)}</span>
        <div class="trash-main"><div class="strong">${esc(t.title)}</div>
          <div class="xsmall muted">${t.brandName ? esc(t.brandName) + ' · ' : ''}${esc(timeAgo(t.deletedAt))} silindi · ${Math.max(0, Math.ceil((new Date(t.expiresAt) - Date.now()) / 864e5))} gün sonra kalıcı silinir</div></div>
        <button class="btn btn-sm" data-restore="${esc(t.id)}">${icon('back')}Geri al</button>
        <button class="btn btn-sm btn-ghost icon-btn" data-purge="${esc(t.id)}" aria-label="Kalıcı sil" title="Kalıcı sil">${icon('trash')}</button>
      </div>`).join('')}</div></div>`
      : emptyState({ icon: 'trash', title: 'Çöp kutusu boş', text: 'Sildiğin kayıtlar burada ' + days + ' gün boyunca geri alınabilir.', card: true })}`;

  view.onclick = async e => {
    const r = e.target.closest('[data-restore]');
    const p = e.target.closest('[data-purge]');
    try {
      if (r) {
        const { restored } = await api.restoreTrash(r.dataset.restore);
        const to = restored.brandId && PLACE[restored.kind] ? `#/m/${restored.brandId}${PLACE[restored.kind]}` : '';
        toast(`Geri alındı: ${restored.title}`, 'success');
        return renderTrash(view).then(() => {
          if (!to) return;
          const host = document.getElementById('toasts');
          const el = document.createElement('div');
          el.className = 'toast';
          el.innerHTML = '<span>Kaydın yerine git?</span> <a class="btn btn-sm">Aç</a>';
          el.querySelector('a').href = to;
          el.querySelector('a').addEventListener('click', () => el.remove());
          host.appendChild(el);
          setTimeout(() => el.remove(), 6000);
        });
      }
      if (p) {
        if (!confirm('Bu kayıt kalıcı olarak silinsin mi? Geri alınamaz.')) return;
        await api.deleteTrash(p.dataset.purge);
        return renderTrash(view);
      }
      if (e.target.closest('[data-empty]')) {
        if (!confirm('Çöp kutusundaki bütün kayıtlar kalıcı olarak silinsin mi? Geri alınamaz.')) return;
        const { removed } = await api.emptyTrash();
        toast(`${removed} kayıt kalıcı olarak silindi.`, 'success');
        return renderTrash(view);
      }
    } catch (err) { toast(err.message, 'error'); }
  };
}
