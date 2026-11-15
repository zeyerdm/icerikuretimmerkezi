// Aşama 5.12: Çöp kutusu sayfası ve silme sonrası "Geri al" bildirimi.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState, timeAgo } from '../ui.js';
import { route } from '../app.js';

// Silinen kaydın geri alınınca açılacak yeri (marka sayfası) bulmak için
const PLACE = { idea: '/fikirler', post: '/post', prompt: '/prompt', reels: '/reels', competitor: '/rakipler', pattern: '/reels/kaliplar', content: '/takvim', asset: '/kutuphane' };

// Silme geri alma: bildirimdeki "Geri al" ya da sistemin her yerinde Ctrl+Z (yazı alanı dışında).
// Toplu silmeler (çoklu seçim) tek adımda geri gelir.
const undoGroups = [];
async function restoreGroup(group) {
  let ok = 0;
  for (const id of group.ids.reverse()) { try { await api.restoreTrash(id); ok++; } catch { /* süresi dolmuş ya da zaten geri alınmış */ } }
  if (ok) { toast(ok > 1 ? `${ok} kayıt geri alındı.` : 'Geri alındı.', 'success'); route(); } else toast('Geri alınacak silme kalmadı.', 'info');
}

export function initTrashUndo() {
  let el = null;
  document.addEventListener('ium:trashed', e => {
    const last = undoGroups[undoGroups.length - 1];
    if (last && e.detail.group && last.group === e.detail.group) last.ids.push(e.detail.id);
    else { undoGroups.push({ ids: [e.detail.id], group: e.detail.group || null }); if (undoGroups.length > 20) undoGroups.shift(); }
    const group = undoGroups[undoGroups.length - 1];
    const host = document.getElementById('toasts');
    if (el) el.remove();
    el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${group.ids.length > 1 ? `${group.ids.length} kayıt` : 'Çöp kutusuna'} taşındı.</span> <button type="button" class="btn btn-sm">Geri al <span class="xsmall muted">Ctrl+Z</span></button>`;
    const mine = el;
    el.querySelector('button').addEventListener('click', () => { mine.remove(); const i = undoGroups.indexOf(group); if (i >= 0) undoGroups.splice(i, 1); restoreGroup(group); });
    host.appendChild(el);
    setTimeout(() => mine.remove(), 7000);
  });
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
    const a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return; // yazı alanında tarayıcının kendi geri alması
    if (document.querySelector('.modal-backdrop') || !undoGroups.length) return;
    e.preventDefault();
    if (el) el.remove();
    restoreGroup(undoGroups.pop());
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
