// S.4: İlk açılış tanıtım turu. Yönetim Merkezi'nde öğeleri sırayla vurgular; atlanabilir, bir kez gösterilir
// (Ayarlar'dan ya da Ctrl+K paletinden yeniden başlatılabilir). Otomatik tarayıcı testlerinde kendiliğinden açılmaz.
const KEY = 'ium.tour.done';
const STEPS = [
  { sel: '.sidebar .nav', title: 'Menü', text: 'Yönetim Merkezi, markalar, Çalışma masası (takvim + görev + not), analizler ve ayarlar burada.' },
  { sel: '.ops .w-actions', title: 'Hızlı işlemler', text: 'İçerik planla, görev ekle, not al ya da yeni bir marka oluştur.' },
  { sel: '.ops .w-side', title: 'Bu hafta', text: 'Haftalık üretim, tamamlanan ve yayın bekleyen içerikler; günlük üretim çubukları ve rozetlerin.' },
  { sel: '.ops-three', title: 'Günün işleri', text: 'Bugünün görevleri, yaklaşan içerikler ve yaklaşan özel günler. Özel günlerde "Planla" o güne içerik açar.' },
  { sel: '#brand-switch', title: 'Markaya geç', text: 'Bir markanın çalışma alanına geç: kimlik, fikirler, Reels, Post stüdyosu, AI asistanı…' },
  { sel: '#palette-open', title: 'Ara ve komut (Ctrl+K)', text: 'Her yerden sayfa aç, içerik planla, not al ya da bütün markalarda ara.' }
];

let layer = null;
export function startTour() {
  endTour();
  let i = 0;
  layer = document.createElement('div');
  layer.className = 'tour';
  layer.innerHTML = '<div class="tour-spot"></div><div class="tour-tip" role="dialog" aria-modal="true" aria-label="Tanıtım turu"></div>';
  document.body.appendChild(layer);
  const spot = layer.querySelector('.tour-spot'); const tip = layer.querySelector('.tour-tip');
  const show = () => {
    const steps = STEPS.filter(s => document.querySelector(s.sel));
    if (i >= steps.length) return finish();
    const s = steps[i]; const el = document.querySelector(s.sel);
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect(); const pad = 6;
    Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    tip.innerHTML = `<div class="xsmall muted">${i + 1} / ${steps.length}</div><h3>${s.title}</h3><p>${s.text}</p>
      <div class="row"><button type="button" class="btn btn-sm btn-ghost" data-tour-skip>Turu geç</button><span class="spacer"></span>${i ? '<button type="button" class="btn btn-sm" data-tour-prev>Geri</button>' : ''}<button type="button" class="btn btn-sm btn-primary" data-tour-next>${i === steps.length - 1 ? 'Bitir' : 'İleri'}</button></div>`;
    const below = r.bottom + 12 + 180 < innerHeight;
    const left = Math.max(12, Math.min(innerWidth - 332, r.left));
    Object.assign(tip.style, { left: left + 'px', top: (below ? r.bottom + 12 : Math.max(12, r.top - 12 - tip.offsetHeight)) + 'px' });
    tip.querySelector('[data-tour-next]').focus();
  };
  const finish = () => { try { localStorage.setItem(KEY, '1'); } catch { /* yok */ } endTour(); };
  layer.addEventListener('click', e => {
    if (e.target.closest('[data-tour-next]')) { i++; return show(); }
    if (e.target.closest('[data-tour-prev]')) { i = Math.max(0, i - 1); return show(); }
    if (e.target.closest('[data-tour-skip]')) return finish();
  });
  layer.addEventListener('keydown', e => { if (e.key === 'Escape') finish(); });
  addEventListener('resize', show);
  layer._resize = show;
  show();
}
export function endTour() { if (layer) { removeEventListener('resize', layer._resize); layer.remove(); layer = null; } }
// Yönetim Merkezi ilk kez açıldığında (marka varken) bir kez
export function maybeStartTour() {
  if (navigator.webdriver) return;
  try { if (localStorage.getItem(KEY)) return; } catch { return; }
  if (!document.querySelector('.ops .w-actions')) return;
  // Açık bir pencere (modal) varsa kapanmasını bekle
  let tries = 0;
  const go = () => {
    if (!document.querySelector('.ops .w-actions')) return;
    if (document.querySelector('.modal-backdrop, .tour')) { if (++tries < 150) setTimeout(go, 800); return; }
    startTour();
  };
  setTimeout(go, 600);
}
