// Aşama 5.16: Kampanya kanvası. Liste: markanın kampanya panoları. Pano: fikir, Reels, tasarım, prompt, görsel, takvim içeriği
// ve not kartları serbestçe sürüklenir; "Bağla" ile iki kart arasında çizgi kurulur. Konumlar ve bağlantılar kaydedilir.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, emptyState, openModal, timeAgo } from '../ui.js';
import { go } from '../app.js';

const KIND_ICON = { idea: 'idea', reels: 'film', post: 'palette', prompt: 'wand', asset: 'image', content: 'calendar', note: 'notes' };
const KIND_COLOR = { idea: '#e09612', reels: '#e5486b', post: '#7d6bf0', prompt: '#3b6fd8', asset: '#12a48f', content: '#f26b4f', note: '#8a8fa8' };
const base = brand => `#/m/${brand.id}/kampanya`;

export async function renderCampaigns(view, brand, sub) {
  view.onclick = view.onchange = view.oninput = view.onpointerdown = null;
  if (sub) return renderBoard(view, brand, sub);
  const { campaigns } = await api.campaigns(brand.id);
  view.innerHTML = `
    ${pageHead({ title: 'Kampanya kanvası', desc: 'Bir kampanyanın fikirlerini, senaryolarını, tasarımlarını, görsellerini ve notlarını tek panoda topla, birbirine bağla.', actions: `<button class="btn btn-primary" data-new>${icon('plus')}Yeni kampanya</button>` })}
    ${campaigns.length ? `<div class="camp-grid">${campaigns.map(c => `<a class="card camp-card" href="${base(brand)}/${esc(c.id)}" style="--camp:${esc(c.color)}">
        <span class="camp-bar"></span><h3>${esc(c.name)}</h3>${c.goal ? `<p class="small">${esc(c.goal)}</p>` : ''}
        <div class="xsmall muted">${c.itemCount} kart · ${esc(timeAgo(c.updatedAt))} güncellendi</div></a>`).join('')}</div>`
      : emptyState({ icon: 'grid', title: 'Henüz kampanya panosu yok', text: 'Ör. "Vize haftası kampanyası": ilgili fikirleri, Reels senaryolarını ve tasarımları bir panoda topla.', action: '<button class="btn btn-primary" data-new>Yeni kampanya</button>', card: true })}`;
  view.onclick = e => {
    if (!e.target.closest('[data-new]')) return;
    openModal({
      title: 'Yeni kampanya', submitLabel: 'Oluştur',
      body: `<div class="form-grid"><div class="field full"><label for="cp-name">Kampanya adı *</label><input class="input" id="cp-name" name="name" maxlength="100" required placeholder="Ör. Vize haftası"></div>
        <div class="field full"><label for="cp-goal">Amaç</label><textarea class="textarea" id="cp-goal" name="goal" rows="2" maxlength="500" placeholder="Ör. Öğrenci menüsünün satışlarını vize haftasında artırmak"></textarea></div></div>`,
      onSubmit: async fd => { const { campaign } = await api.createCampaign(brand.id, { name: fd.get('name'), goal: fd.get('goal') }); go(`${base(brand)}/${campaign.id}`); }
    });
  };
}

async function renderBoard(view, brand, id) {
  let { campaign: c } = await api.campaign(brand.id, id);
  let linking = null; // bağlama modunda seçilen ilk kart
  let linkMode = false;

  function cardHtml(it) {
    return `<div class="cv-card ${it.missing ? 'missing' : ''}" data-item="${esc(it.id)}" style="left:${it.x}px;top:${it.y}px;--k:${KIND_COLOR[it.kind]}">
      <div class="cv-head"><span class="cv-kind">${icon(KIND_ICON[it.kind])}${esc(it.kindLabel)}</span><span class="spacer"></span>
        ${it.href ? `<a class="cv-btn" href="${esc(it.href)}" title="Aç" aria-label="Aç">${icon('chevronRight')}</a>` : ''}
        <button class="cv-btn" data-del="${esc(it.id)}" title="Panodan kaldır" aria-label="Panodan kaldır">${icon('x')}</button></div>
      ${it.image ? `<img src="${esc(it.image)}" alt="" draggable="false">` : ''}
      ${it.kind === 'note' ? `<div class="cv-note" data-note="${esc(it.id)}" title="Düzenlemek için çift tıkla">${esc(it.text)}</div>` : `<b>${esc(it.title)}</b>${it.sub ? `<span>${esc(it.sub)}</span>` : ''}`}
    </div>`;
  }
  function linesSvg() {
    const pos = new Map(c.items.map(it => [it.id, it]));
    return `<svg class="cv-lines" width="2400" height="1600">${c.links.map(([a, b]) => {
      const A = pos.get(a); const B = pos.get(b); if (!A || !B) return '';
      const ea = view.querySelector(`[data-item="${CSS.escape(a)}"]`); const eb = view.querySelector(`[data-item="${CSS.escape(b)}"]`);
      const ha = ea ? ea.offsetHeight / 2 : 40; const hb = eb ? eb.offsetHeight / 2 : 40;
      return `<line x1="${A.x + 110}" y1="${A.y + ha}" x2="${B.x + 110}" y2="${B.y + hb}" stroke="${esc(c.color)}" stroke-width="2.5" stroke-dasharray="6 5" stroke-linecap="round"/>`;
    }).join('')}</svg>`;
  }
  function draw() {
    view.innerHTML = `
      <div class="cv-top card" style="--camp:${esc(c.color)}">
        <a class="btn btn-ghost btn-sm" href="${base(brand)}">${icon('back')}Kampanyalar</a>
        <input class="input cv-name" id="cv-name" value="${esc(c.name)}" maxlength="100" aria-label="Kampanya adı">
        <input class="input cv-goal" id="cv-goal" value="${esc(c.goal)}" maxlength="500" placeholder="Amaç (isteğe bağlı)" aria-label="Amaç">
        <span class="spacer"></span>
        <div class="cv-add"><button class="btn btn-primary btn-sm" data-add-menu>${icon('plus')}Kart ekle</button>
          <div class="create-pop" hidden>${Object.entries({ note: 'Not', idea: 'Fikir', reels: 'Reels senaryosu', post: 'Tasarım', prompt: 'Prompt', asset: 'Görsel', content: 'Takvim içeriği' }).map(([k, l]) => `<button data-add="${k}">${icon(KIND_ICON[k])}<span><b>${l}</b></span></button>`).join('')}</div></div>
        <button class="btn btn-sm ${linkMode ? 'btn-primary' : ''}" data-link-mode aria-pressed="${linkMode}" title="İki karta sırayla tıklayarak bağla (aynı ikiliye tekrar tıklamak bağı kaldırır)">${icon('link')}${linkMode ? 'Bağlama açık' : 'Bağla'}</button>
        <button class="btn btn-sm btn-ghost icon-btn" data-del-campaign title="Kampanyayı sil" aria-label="Kampanyayı sil">${icon('trash')}</button>
      </div>
      ${linkMode ? `<div class="notice mb-3"><span>${linking ? 'Şimdi bağlanacak ikinci karta tıkla.' : 'Bağlamak istediğin ilk karta tıkla.'} Bitirmek için "Bağlama açık" düğmesine bas.</span></div>` : ''}
      <div class="cv-wrap"><div class="cv-board ${linkMode ? 'linking' : ''}" id="cv-board">${c.items.length ? '' : '<div class="cv-empty">Panoya "Kart ekle" ile fikir, senaryo, tasarım, görsel ya da not ekle; kartları sürükleyerek yerleştir.</div>'}${c.items.map(cardHtml).join('')}</div></div>`;
    const board = view.querySelector('#cv-board');
    board.insertAdjacentHTML('afterbegin', linesSvg());
    if (linking) { const el = board.querySelector(`[data-item="${CSS.escape(linking)}"]`); if (el) el.classList.add('sel'); }
  }
  const redrawLines = () => { const old = view.querySelector('.cv-lines'); if (old) old.outerHTML = linesSvg(); };
  const nextPos = () => { const n = c.items.length; return { x: 40 + (n % 5) * 250, y: 40 + Math.floor(n / 5) * 190 }; };
  async function add(kind, refId, textValue) {
    try { const { item } = await api.addCampaignItem(brand.id, c.id, Object.assign({ kind, refId, text: textValue }, nextPos())); c.items.push(item); draw(); } catch (err) { toast(err.message, 'error'); }
  }
  async function pick(kind) {
    if (kind === 'note') {
      return openModal({ title: 'Not kartı', submitLabel: 'Ekle', body: '<div class="field"><label for="cv-n">Not *</label><textarea class="textarea" id="cv-n" name="text" rows="4" maxlength="1000" required></textarea></div>', onSubmit: fd => add('note', null, fd.get('text')) });
    }
    let list = [];
    try {
      if (kind === 'idea') list = (await api.ideas(brand.id)).ideas.map(x => ({ id: x.id, t: x.title, s: x.categoryLabel }));
      if (kind === 'reels') list = (await api.reelsList(brand.id)).reels.map(x => ({ id: x.id, t: x.title, s: x.statusLabel || '' }));
      if (kind === 'post') list = (await api.posts(brand.id)).posts.map(x => ({ id: x.id, t: x.title, s: x.kindLabel || '' }));
      if (kind === 'prompt') list = (await api.prompts(brand.id)).prompts.map(x => ({ id: x.id, t: x.title, s: x.kindLabel || '' }));
      if (kind === 'asset') list = (await api.assets(brand.id)).assets.map(x => ({ id: x.id, t: x.label || x.categoryLabel, s: x.categoryLabel, img: x.url }));
      if (kind === 'content') list = (await api.contents({ brandId: brand.id })).contents.map(x => ({ id: x.id, t: x.title, s: `${x.typeLabel} · ${x.statusLabel}` }));
    } catch (err) { return toast(err.message, 'error'); }
    const used = new Set(c.items.filter(i => i.kind === kind).map(i => i.refId));
    const m = openModal({
      title: 'Panoya ekle', submitLabel: 'Kapat',
      body: list.length ? `<input class="input mb-3" id="cv-q" placeholder="Ara" aria-label="Ara"><div class="cv-pick">${list.map(x => `<button type="button" class="cv-pick-item" data-pick="${esc(x.id)}" ${used.has(x.id) ? 'disabled title="Zaten panoda"' : ''}>${x.img ? `<img src="${esc(x.img)}" alt="">` : ''}<span><b>${esc(x.t)}</b><em>${esc(x.s)}</em></span></button>`).join('')}</div>`
        : '<p class="card-text">Bu türde kayıt yok. Önce ilgili sayfada oluştur.</p>',
      onSubmit: () => {}
    });
    m.form.addEventListener('click', e => { const p = e.target.closest('[data-pick]'); if (!p || p.disabled) return; p.disabled = true; add(kind, p.dataset.pick); });
    const q = m.form.querySelector('#cv-q');
    if (q) q.addEventListener('input', () => { const v = q.value.toLocaleLowerCase('tr-TR'); m.form.querySelectorAll('[data-pick]').forEach(b => { b.hidden = !b.textContent.toLocaleLowerCase('tr-TR').includes(v); }); });
  }
  const saveLinks = async () => { try { c = (await api.updateCampaign(brand.id, c.id, { links: c.links })).campaign; } catch (err) { toast(err.message, 'error'); } };

  view.onclick = async e => {
    const t = e.target;
    if (t.closest('[data-add-menu]')) { const p = view.querySelector('.cv-add .create-pop'); p.hidden = !p.hidden; return; }
    const ad = t.closest('[data-add]'); if (ad) { view.querySelector('.cv-add .create-pop').hidden = true; return pick(ad.dataset.add); }
    if (t.closest('[data-link-mode]')) { linkMode = !linkMode; linking = null; return draw(); }
    const del = t.closest('[data-del]');
    if (del) { try { await api.deleteCampaignItem(brand.id, c.id, del.dataset.del); c.items = c.items.filter(i => i.id !== del.dataset.del); c.links = c.links.filter(l => !l.includes(del.dataset.del)); draw(); } catch (err) { toast(err.message, 'error'); } return; }
    if (t.closest('[data-del-campaign]')) { if (!confirm(`"${c.name}" panosu silinsin mi? Bağlı fikir, tasarım ve diğer kayıtlar silinmez.`)) return; try { await api.deleteCampaign(brand.id, c.id); go(base(brand)); } catch (err) { toast(err.message, 'error'); } return; }
    const card = t.closest('[data-item]');
    if (linkMode && card && !t.closest('a, button')) {
      const idc = card.dataset.item;
      if (!linking) { linking = idc; return draw(); }
      if (linking !== idc) {
        const i = c.links.findIndex(l => (l[0] === linking && l[1] === idc) || (l[0] === idc && l[1] === linking));
        if (i >= 0) c.links.splice(i, 1); else c.links.push([linking, idc]);
        linking = null; draw(); await saveLinks(); draw();
      }
    }
  };
  view.ondblclick = async e => {
    const n = e.target.closest('[data-note]'); if (!n) return;
    const it = c.items.find(i => i.id === n.dataset.note);
    const v = prompt('Notu düzenle', it.text); if (v == null || !v.trim()) return;
    try { Object.assign(it, (await api.updateCampaignItem(brand.id, c.id, it.id, { text: v })).item); draw(); } catch (err) { toast(err.message, 'error'); }
  };
  view.onchange = async e => {
    if (e.target.id !== 'cv-name' && e.target.id !== 'cv-goal') return;
    try { c = (await api.updateCampaign(brand.id, c.id, { [e.target.id === 'cv-name' ? 'name' : 'goal']: e.target.value })).campaign; toast('Kaydedildi.', 'success'); } catch (err) { toast(err.message, 'error'); }
  };
  // Sürükle-bırak: kart başlığından ya da gövdesinden tutulur; bırakınca konum kaydedilir
  view.onpointerdown = e => {
    const card = e.target.closest('.cv-card');
    if (!card || linkMode || e.target.closest('a, button') || e.button !== 0) return;
    const it = c.items.find(i => i.id === card.dataset.item);
    const sx = e.clientX; const sy = e.clientY; const ox = it.x; const oy = it.y;
    card.setPointerCapture(e.pointerId); card.classList.add('dragging');
    const move = ev => { it.x = Math.max(0, Math.min(2180, ox + ev.clientX - sx)); it.y = Math.max(0, Math.min(1480, oy + ev.clientY - sy)); card.style.left = it.x + 'px'; card.style.top = it.y + 'px'; redrawLines(); };
    const up = async () => {
      card.removeEventListener('pointermove', move); card.removeEventListener('pointerup', up); card.classList.remove('dragging');
      if (it.x === ox && it.y === oy) return;
      try { await api.updateCampaignItem(brand.id, c.id, it.id, { x: it.x, y: it.y }); } catch (err) { toast(err.message, 'error'); }
    };
    card.addEventListener('pointermove', move); card.addEventListener('pointerup', up);
  };
  draw();
}
