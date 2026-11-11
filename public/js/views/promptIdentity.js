// 7.2 Marka prompt kişiliği sihirbazı: sorular ve işaretlemelerle bir kez doldurulur; cevaplar markanın bütün
// prompt üretimlerine kendiliğinden girer (Prompt Studio). Sorular sabit, cevaplar markaya özel.
import { api } from '../api.js';
import { esc, icon, toast, pageHead, busy, openModal } from '../ui.js';
import { suggestionsCard } from '../feedback.js';
import { openRecipes } from '../recipes.js';

export async function renderPromptIdentity(view, brand) {
  const { identity, questions } = await api.promptIdentity(brand.id);
  let idt = Object.assign({}, identity);
  const groups = [...new Set(questions.map(q => q.group))];

  const field = q => {
    const id = 'pi-' + q.key;
    const hidden = q.when && !idt[q.when] ? 'hidden' : '';
    if (q.type === 'one' || q.type === 'many') {
      const multi = q.type === 'many';
      const sel = v => (multi ? (idt[q.key] || []).includes(v) : idt[q.key] === v);
      return `<fieldset class="field pi-q" data-q="${q.key}" ${hidden}><legend class="field-label">${esc(q.label)}</legend><div class="chip-row">${Object.entries(q.options).map(([v, l]) =>
        `<label class="chip-check"><input type="${multi ? 'checkbox' : 'radio'}" name="${q.key}" value="${esc(v)}" ${sel(v) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}
        ${multi ? '' : `<label class="chip-check"><input type="radio" name="${q.key}" value="" ${idt[q.key] ? '' : 'checked'}><span>Fark etmez</span></label>`}</div></fieldset>`;
    }
    if (q.type === 'bool') return `<div class="field pi-q" data-q="${q.key}"><label class="check"><input type="checkbox" id="${id}" name="${q.key}" ${idt[q.key] ? 'checked' : ''}> ${esc(q.label)}</label></div>`;
    const val = Array.isArray(idt[q.key]) ? idt[q.key].join(', ') : (idt[q.key] || '');
    return `<div class="field pi-q" data-q="${q.key}" ${hidden}><label for="${id}">${esc(q.label)}</label><input class="input" id="${id}" name="${q.key}" maxlength="300" value="${esc(val)}" placeholder="${esc(q.hint || '')}" data-mic></div>`;
  };

  view.innerHTML = `
    ${pageHead({ title: 'Prompt kimliği', desc: `${esc(brand.name)} için bir kez doldur: görsel dil, his ve (varsa) maskot. Prompt Studio'daki her üretim bu tercihlere göre yazılır; model değişse de yapı aynı kalır.`,
      actions: `<button type="button" class="btn" data-pi-recipes>${icon('star')}Tariflerden başlat</button><button type="button" class="btn" data-pi-save-recipe>${icon('pin')}Tarif olarak kaydet</button>` })}
    <form id="pi-form" class="stack">
      ${groups.map(g => `<section class="card"><div class="card-head"><h3>${esc(g)}</h3></div><div class="stack-sm">${questions.filter(q => q.group === g).map(field).join('')}</div></section>`).join('')}
      <div class="save-bar card"><span class="small muted">Boş bıraktığın sorular üretimi etkilemez.</span><button class="btn btn-primary" type="submit">${icon('check')}Kaydet</button></div>
    </form>`;

  const form = view.querySelector('#pi-form');
  const read = () => {
    const out = {};
    for (const q of questions) {
      if (q.type === 'many') out[q.key] = [...form.querySelectorAll(`[name="${q.key}"]:checked`)].map(i => i.value);
      else if (q.type === 'one') out[q.key] = (form.querySelector(`[name="${q.key}"]:checked`) || {}).value || '';
      else if (q.type === 'bool') out[q.key] = form.querySelector(`[name="${q.key}"]`).checked;
      else out[q.key] = form.querySelector(`[name="${q.key}"]`).value;
    }
    return out;
  };
  // 7.12: kimliği tarif olarak kaydet / başka markanın tarifinden başlat
  view.querySelector('[data-pi-recipes]').addEventListener('click', () => openRecipes('identity', brand, res => {
    toast(res.filled && res.filled.length ? `${res.filled.length} boş cevap tariften dolduruldu.` : 'Tarifteki bütün sorular zaten cevaplı; değişiklik olmadı.', 'success', 5000);
    document.querySelector('.modal-backdrop [data-close]')?.click();
    renderPromptIdentity(view, brand);
  }));
  view.querySelector('[data-pi-save-recipe]').addEventListener('click', () => {
    const hasMascot = Boolean(idt.hasMascot);
    openModal({
      title: 'Tarif olarak kaydet', submitLabel: 'Kaydet',
      body: `<p class="small muted mb-3">Kaydedilmiş cevaplar tarif olur; başka bir markanın Prompt kimliği sayfasında "Tariflerden başlat" ile kullanabilirsin. Dosya ve görseller taşınmaz.</p>
        ${hasMascot ? '<label class="check"><input type="checkbox" name="withMascot"> Maskot cevaplarını da al (maskot genelde markaya özeldir)</label>' : ''}`,
      onSubmit: async fd => { await api.identityToRecipe(brand.id, Boolean(fd.get('withMascot'))); toast('Prompt kimliği tariflere kaydedildi.', 'success'); }
    });
  });
  form.addEventListener('change', e => {
    if (e.target.name === 'hasMascot') questions.filter(q => q.when === 'hasMascot').forEach(q => { form.querySelector(`[data-q="${q.key}"]`).hidden = !e.target.checked; });
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await busy(e.submitter, () => api.savePromptIdentity(brand.id, read()));
      idt = r.identity;
      toast('Prompt kimliği kaydedildi; bundan sonraki prompt\'lar bu tercihlerle yazılır.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
  await characterBookCard(view, brand);
  // 7.11: tekrar eden 👎 nedenlerinden öneriler (uygulanınca sayfa yeni kimlikle yeniden çizilir)
  await suggestionsCard(form, brand, () => renderPromptIdentity(view, brand));
}

// 7.3 Maskot karakter kitabı
async function characterBookCard(view, brand) {
  const [{ book }, { assets }] = await Promise.all([api.characterBook(brand.id), api.assets(brand.id)]);
  const poses = assets.filter(a => a.category === 'mascot' || (book.poseAssetIds || []).includes(a.id));
  const box = document.createElement('section');
  box.className = 'card mt-5';
  box.id = 'cb-card';
  view.appendChild(box);
  const lines = v => (Array.isArray(v) ? v.join('\n') : (v || ''));
  const draw = bk => {
    box.innerHTML = `<div class="card-head"><h3>Maskot karakter kitabı</h3><button type="button" class="btn btn-sm" id="cb-draft">${icon('sparkle')}Görsellerden taslak çıkar</button></div>
      <p class="card-text mb-3">Maskotun sabit tanımı. Maskotlu görsel üretiminde seçili pozlar referans olur ve İngilizce görünüş tarifi her isteğe aynen eklenir; maskot ve Reels prompt'larında da kullanılır.</p>
      <form id="cb-form" class="stack-sm">
        <div class="field"><span class="field-label">Referans pozlar (en çok 6)</span>${poses.length ? `<div class="cb-poses">${poses.map(a => `<label class="cb-pose"><input type="checkbox" name="pose" value="${esc(a.id)}" ${(bk.poseAssetIds || []).includes(a.id) ? 'checked' : ''}><img src="${esc(a.url)}" alt="${esc(a.label || 'Maskot pozu')}"></label>`).join('')}</div>` : `<p class="small muted">Kütüphanede maskot pozu yok. <a class="link" href="#/m/${esc(brand.id)}/kutuphane">Kütüphane'ye yükle</a> (kategori: Maskot pozu).</p>`}</div>
        <div class="form-grid">
          <div class="field"><label for="cb-name">Adı</label><input class="input" id="cb-name" name="name" maxlength="60" value="${esc(bk.name || '')}"></div>
          <div class="field"><label for="cb-colors">Renkler (HEX)</label><input class="input" id="cb-colors" name="colors" maxlength="100" value="${esc((bk.colors || []).join(', '))}" placeholder="#c2410c, #ffffff"></div>
        </div>
        <div class="field"><label for="cb-look">Görünüş tarifi (İngilizce, sabit)</label><textarea class="textarea" id="cb-look" name="lookEn" rows="3" maxlength="700" placeholder="A round coffee-bean mascot with big glossy eyes, warm brown body, red knitted scarf…">${esc(bk.lookEn || '')}</textarea></div>
        <div class="form-grid">
          <div class="field"><label for="cb-prop">Oranlar</label><input class="input" id="cb-prop" name="proportions" maxlength="200" value="${esc(bk.proportions || '')}"></div>
          <div class="field"><label for="cb-outfit">Kıyafet</label><input class="input" id="cb-outfit" name="outfit" maxlength="200" value="${esc(bk.outfit || '')}"></div>
        </div>
        <div class="field"><label for="cb-pers">Kişilik</label><input class="input" id="cb-pers" name="personality" maxlength="300" value="${esc(bk.personality || '')}"></div>
        <div class="form-grid">
          <div class="field"><label for="cb-speech">Konuşma örnekleri (her satıra bir)</label><textarea class="textarea" id="cb-speech" name="speech" rows="3">${esc(lines(bk.speech))}</textarea></div>
          <div class="field"><label for="cb-never">Asla (her satıra bir)</label><textarea class="textarea" id="cb-never" name="never" rows="3">${esc(lines(bk.never))}</textarea></div>
        </div>
        <div class="row"><span class="xsmall muted" id="cb-note"></span><span class="spacer"></span><button class="btn btn-primary" type="submit">${icon('check')}Kitabı kaydet</button></div>
      </form>`;
  };
  draw(book);
  const read = () => {
    const f = box.querySelector('#cb-form');
    const v = n => f.querySelector(`[name="${n}"]`).value;
    return { name: v('name'), colors: v('colors'), lookEn: v('lookEn'), proportions: v('proportions'), outfit: v('outfit'), personality: v('personality'), speech: v('speech').split('\n'), never: v('never').split('\n'), poseAssetIds: [...f.querySelectorAll('[name="pose"]:checked')].map(i => i.value) };
  };
  box.addEventListener('submit', async e => {
    e.preventDefault();
    try { const r = await busy(e.submitter, () => api.saveCharacterBook(brand.id, read())); draw(r.book); toast('Karakter kitabı kaydedildi.', 'success'); } catch (err) { toast(err.message, 'error'); }
  });
  box.addEventListener('click', async e => {
    const d = e.target.closest('#cb-draft');
    if (!d) return;
    try {
      const r = await busy(d, () => api.draftCharacterBook(brand.id));
      draw(Object.assign(read(), r.draft));
      box.querySelector('#cb-note').textContent = `${r.ai.modelLabel} ile taslak çıkarıldı; kontrol edip kaydet.`;
    } catch (err) { toast(err.message, 'error'); }
  });
}
