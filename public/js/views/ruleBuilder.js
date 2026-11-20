// Şablon oluşturucu: mecra, süre, ton, başlık stili, altyazı, renk paleti, betimleme, maskot, kamera, müzik, CTA,
// marka adı kısıtı ve örnek prompt seçilir; seçimlerden kural şablonu kurulur. Stiller kartlarda önizlenir (seçmeden
// önce ne seçildiği görünür). Şablon kaydetmeden önce düzenlenebilir; istenirse bütün markalarda ortak olur.
import { api } from '../api.js';
import { esc, icon, toast, openModal, loadFonts } from '../ui.js';

let cache = null;
const loadPresets = async (fresh = false) => { if (!cache || fresh) cache = await api.promptPresets(); return cache; };

const fixedNote = spec => (String(spec.fixedPlace || '').trim() ? 'Mekân sabit; burada yalnız konuya özel ayrıntıların ne kadar yazılacağını seçersin.' : 'Mekân, ışık ve nesne betimlemesi şablona yazılsın mı?');
const DEFAULT_SPEC = { platform: 'reels', duration: 15, scenes: false, tone: 'enerjik', title: 'karisik-vurgu', subtitle: 'yok', palette: 'marka', details: 'detayli', mascot: 'var', camera: 'hareketli', music: 'trend', cta: 'kaydet', noBrand: true, extra: '', fixedPlace: '', fixedCharacter: '', fixedStyle: '' };

// Başlık stili önizlemesi: örnek kelimeler; *yıldızlı* kelime vurgu renginde ve ikinci yazı tipinde
export function titlePreview(st) {
  if (!st || !st.preview) return '<div class="tp tp-none">Başlık yok</div>';
  const p = st.preview;
  const fonts = p.fonts || ['Poppins'];
  loadFonts(fonts);
  const words = (Array.isArray(st.sample) ? st.sample : String(st.sample || 'Örnek başlık').split(' ')).map(w => {
    const hl = /^\*.*\*$/.test(w);
    const t = esc(w.replace(/\*/g, ''));
    const style = hl ? `font-family:'${fonts[1] || fonts[0]}';color:${p.accent};font-weight:${fonts[1] ? 400 : p.weight || 800}` : `font-family:'${fonts[0]}';font-weight:${p.weight || 800}`;
    return `<span style="${style}">${t}</span>`;
  }).join(' ');
  const inner = p.box ? `<span class="tp-box" style="background:${p.accent}">${words}</span>` : words;
  const stroke = p.stroke ? `-webkit-text-stroke:0;text-shadow:0 0 0 ${p.stroke},3px 3px 0 ${p.stroke},-3px 3px 0 ${p.stroke},3px -3px 0 ${p.stroke},-3px -3px 0 ${p.stroke};` : 'text-shadow:0 2px 8px rgba(0,0,0,.25);';
  return `<div class="tp" style="background:${p.bg || '#333'};color:${p.color || '#fff'};${stroke}${p.spaced ? 'letter-spacing:.02em;' : ''}">${inner}${p.pill ? `<span class="tp-pill" style="background:${p.accent};color:${p.color}">KISA AÇIKLAMA</span>` : ''}</div>`;
}
export function subPreview(st) {
  if (!st || !st.preview) return '<div class="sp sp-none">Altyazı yok</div>';
  const p = st.preview;
  loadFonts([p.font || 'Inter']);
  const txt = esc(String(st.sample || 'örnek altyazı'));
  const html = txt.replace(/\*([^*]+)\*/g, `<span style="color:${p.accent || p.color}">$1</span>`);
  const sh = p.stroke ? `text-shadow:1px 1px 0 ${p.stroke},-1px 1px 0 ${p.stroke},1px -1px 0 ${p.stroke},-1px -1px 0 ${p.stroke},0 2px 3px rgba(0,0,0,.4);` : '';
  return `<div class="sp"><span style="font-family:'${p.font || 'Inter'}';font-weight:${p.weight || 600};color:${p.color};${sh}${p.box ? `background:${p.box};padding:2px 8px;border-radius:6px;` : ''}${p.upper ? 'text-transform:uppercase;' : ''}">${html}</span></div>`;
}
const swatches = cols => `<span class="pal-row">${(cols || []).map(c => `<span style="background:${esc(c)}"></span>`).join('')}</span>`;

export async function openRuleBuilder(brand, meta, { rule = null, onSaved = () => {} } = {}) {
  let P;
  try { P = await loadPresets(true); } catch (err) { return toast(err.message, 'error'); }
  const spec = Object.assign({}, DEFAULT_SPEC, rule && rule.spec && rule.spec.platform ? rule.spec : {});
  let edited = Boolean(rule && rule.body);
  let lastName = rule ? rule.name : '';
  const brandCols = [brand.colors && brand.colors.primary, ...((brand.colors && brand.colors.secondary) || []), ...((brand.colors && brand.colors.backgrounds) || [])].filter(Boolean);
  let saved = [];
  try { saved = (await api.prompts(brand.id, {})).prompts.slice(0, 60); } catch { saved = []; }

  const m = openModal({
    title: rule ? `Şablonu düzenle: ${rule.name}` : 'Şablon oluşturucu', submitLabel: 'Şablonu kaydet',
    body: `<div class="rb">
      <div class="rb-left" id="rb-left"></div>
      <div class="rb-right">
        <div class="form-grid">
          <div class="field full"><label for="rb-name">Şablon adı *</label><input class="input" id="rb-name" name="name" maxlength="80" required></div>
          <div class="field"><label for="rb-kind">Prompt türü</label><select class="select" id="rb-kind" name="kind">${Object.entries(meta.kinds).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></div>
          <div class="field"><label for="rb-lang">Yazım dili</label><select class="select" id="rb-lang" name="lang"><option value="tr">Türkçe</option><option value="en">İngilizce</option></select></div>
          <label class="chip-check"><input type="checkbox" name="isDefault" ${!rule || rule.isDefault ? 'checked' : ''}><span>Bu türde varsayılan</span></label>
          <label class="chip-check"><input type="checkbox" name="shared" ${rule && rule.shared ? 'checked' : ''}><span>Bütün markalarda kullanılsın</span></label>
        </div>
        <div class="row-between mt-3"><label class="strong" for="rb-body">Şablon (kaydetmeden düzenleyebilirsin)</label><button type="button" class="btn btn-sm btn-ghost" data-rb-regen hidden>${icon('refresh')}Seçimlere göre yeniden kur</button></div>
        <textarea class="textarea mono rb-body" id="rb-body" name="body" rows="22" maxlength="20000" required></textarea>
        <p class="xsmall muted" id="rb-stat"></p>
      </div>
    </div>`,
    onSubmit: async fd => {
      await api.savePromptRule(brand.id, rule ? rule.id : null, { name: fd.get('name'), kind: fd.get('kind'), lang: fd.get('lang'), body: fd.get('body'), isDefault: fd.get('isDefault') === 'on', shared: fd.get('shared') === 'on', example: spec.example || '', spec });
      toast('Şablon kaydedildi. Prompt üretirken seçebilirsin.', 'success');
      await onSaved();
    }
  });
  m.form.closest('.modal').classList.add('modal-xl');
  const $ = s => m.form.querySelector(s);
  if (rule) { $('#rb-name').value = rule.name; $('#rb-kind').value = rule.kind; $('#rb-lang').value = rule.lang; $('#rb-body').value = rule.body; }

  const sec = (title, inner, hint = '') => `<section class="rb-sec"><h4>${title}</h4>${hint ? `<p class="xsmall muted">${hint}</p>` : ''}${inner}</section>`;
  const seg = (key, opts) => `<div class="seg seg-sm" role="radiogroup">${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="${spec[key] === v}" class="${spec[key] === v ? 'active' : ''}" data-rb="${key}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
  const sel = (key, dict, none) => `<select class="select" data-rb-sel="${key}">${none ? `<option value="">${none}</option>` : ''}${Object.entries(dict).filter(([, v]) => v).map(([k, v]) => `<option value="${k}" ${spec[key] === k ? 'selected' : ''}>${esc(v.length > 60 ? v.slice(0, 58) + '…' : v)}</option>`).join('')}</select>`;
  function drawLeft() {
    const pf = P.platforms[spec.platform];
    $('#rb-left').innerHTML = [
      sec('Mecra', `<div class="chips">${Object.entries(P.platforms).map(([k, v]) => `<button type="button" class="chip ${spec.platform === k ? 'active' : ''}" data-rb="platform" data-v="${k}">${esc(v.label)} <span class="muted">${v.aspect}</span></button>`).join('')}</div>`, esc(pf.note)),
      pf.video ? sec(`Süre: <span id="rb-dur-v">${spec.duration}</span> saniye`, `<input type="range" min="${pf.min}" max="${pf.max}" step="1" value="${Math.min(pf.max, Math.max(pf.min, spec.duration))}" data-rb-range="duration" aria-label="Süre">
        <label class="chip-check mt-2"><input type="checkbox" data-rb-check="scenes" ${spec.scenes ? 'checked' : ''}><span>Sahneli üretim (her sahne bu şablonla, devamlılık bölümüyle)</span></label>`) : '',
      sec('Anlatım tonu', `<div class="chips">${Object.entries(P.tones).map(([k, v]) => `<button type="button" class="chip ${spec.tone === k ? 'active' : ''}" data-rb="tone" data-v="${k}" title="${esc(v)}">${esc(k[0].toLocaleUpperCase('tr') + k.slice(1))}</button>`).join('')}</div>`),
      sec('Başlık stili', `<div class="rb-cards">${[{ id: '', name: 'Başlık yok', preview: null }, ...P.title].map(st => `<button type="button" class="rb-card ${spec.title === st.id ? 'on' : ''}" data-rb="title" data-v="${esc(st.id)}" title="${esc(st.text || '')}">${titlePreview(st)}<span class="rb-card-name">${esc(st.name)}${st.custom ? ` <em>· senin</em> <span class="rb-del" role="button" tabindex="0" data-preset-del="${esc(st.id)}" title="Stili sil">sil</span>` : ''}</span></button>`).join('')}
        <button type="button" class="rb-card rb-add" data-preset-new="title">${icon('plus')}<span>Kendi başlık stilin</span></button></div>`, 'Kartın üstüne gelince yapay zekâya giden tarifi görürsün. Seçtiğin stil şablonda yazılı olur.'),
      pf.video ? sec('Altyazı', `<div class="rb-cards rb-cards-sm">${P.subtitle.map(st => `<button type="button" class="rb-card ${spec.subtitle === st.id ? 'on' : ''}" data-rb="subtitle" data-v="${esc(st.id)}" title="${esc(st.text)}">${subPreview(st)}<span class="rb-card-name">${esc(st.name)}${st.custom ? ` <em>· senin</em> <span class="rb-del" role="button" tabindex="0" data-preset-del="${esc(st.id)}" title="Stili sil">sil</span>` : ''}</span></button>`).join('')}
        <button type="button" class="rb-card rb-add" data-preset-new="subtitle">${icon('plus')}<span>Kendi altyazı stilin</span></button></div>`) : '',
      sec('Renk paleti', `<div class="rb-pals">${[{ id: '', name: 'Palet belirtme', colors: [] }, ...P.palette].map(pl => `<button type="button" class="rb-pal ${spec.palette === pl.id ? 'on' : ''}" data-rb="palette" data-v="${esc(pl.id)}">${swatches(pl.id === 'marka' ? brandCols : pl.colors)}<span>${esc(pl.name)}${pl.id === 'marka' && !brandCols.length ? ' (renk yok)' : ''}${pl.custom ? ` <span class="rb-del" role="button" tabindex="0" data-preset-del="${esc(pl.id)}" title="Paleti sil">sil</span>` : ''}</span></button>`).join('')}
        <button type="button" class="rb-pal rb-add" data-preset-new="palette">${icon('plus')}<span>Kendi paletin</span></button></div>`),
      sec('Sabit kısımlar', `<div class="stack-sm">
          <label class="field"><span class="field-label">Mekân ve ışık</span><textarea class="textarea" rows="3" data-rb-text="fixedPlace" maxlength="2000" placeholder="Ör. Modern yazılım ofisi; ahşap masa, iki monitör, arkada büyük pencere ve yeşil bitkiler. Yumuşak gün ışığı soldan, sıcak tonlar.">${esc(spec.fixedPlace || '')}</textarea></label>
          <label class="field"><span class="field-label">Karakter (görünüş, kıyafet, tavır)</span><textarea class="textarea" rows="2" data-rb-text="fixedCharacter" maxlength="2000" placeholder="Ör. DEO: mavi peluş ayı, lacivert ceket, meraklı ve enerjik.">${esc(spec.fixedCharacter || '')}</textarea></label>
          <label class="field"><span class="field-label">Görsel stil</span><textarea class="textarea" rows="2" data-rb-text="fixedStyle" maxlength="2000" placeholder="Ör. Sinematik 3D animasyon, yumuşak gölgeler, gerçekçi dokular.">${esc(spec.fixedStyle || '')}</textarea></label></div>`,
        'Bir kez yaz; her üretimde kelimesi kelimesine aynen girer. Yapay zekâ bunları yazmaz, yalnız konuya göre değişen kısımları (kanca, olay, replik, konuya özel ayrıntılar) doldurur.'),
      sec('Betimleme', seg('details', Object.entries(P.details)), fixedNote(spec)),
      sec('Karakter', seg('mascot', [['var', 'Maskot'], ['insan', 'İnsan sunucu'], ['yok', 'Karakter yok']])),
      pf.video ? sec('Kamera ve müzik', `<div class="form-grid">${sel('camera', P.cameras, 'Kamera belirtme')}${sel('music', P.music, 'Müzik belirtme')}</div>`) : '',
      sec('Bitiş çağrısı (CTA)', sel('cta', Object.fromEntries(Object.entries(P.ctas).filter(([k]) => k !== 'yok')), 'Çağrı yok')),
      sec('Kısıtlar', `<label class="chip-check"><input type="checkbox" data-rb-check="noBrand" ${spec.noBrand ? 'checked' : ''}><span>Marka / kurum adı yazılmasın ve söylenmesin</span></label>
        <textarea class="textarea mt-2" rows="2" data-rb-text="extra" maxlength="2000" placeholder="Ek kurallar (ör. Kahve fincanı her sahnede görünsün)">${esc(spec.extra || '')}</textarea>`),
      sec('Örnek prompt', `<select class="select" data-rb-example><option value="">Örnek yok</option>${saved.map(p => `<option value="${esc(p.id)}" ${spec.exampleId === p.id ? 'selected' : ''}>${esc(p.kindLabel)} · ${esc(p.title)}</option>`).join('')}</select>`, 'Seçtiğin prompt ayrıntı düzeyi ve üslup için örnek alınır; içeriği kopyalanmaz.')
    ].join('');
  }
  let timer = null;
  async function compose(force = false) {
    if (edited && !force) { $('[data-rb-regen]').hidden = false; return; }
    try {
      const r = await api.composeRule(brand.id, spec);
      $('#rb-body').value = r.body;
      if (!rule || force) { if (!$('#rb-name').value || $('#rb-name').value === lastName) { $('#rb-name').value = r.name; lastName = r.name; } $('#rb-kind').value = r.kind; }
      edited = false; $('[data-rb-regen]').hidden = true;
      stat();
    } catch (err) { toast(err.message, 'error'); }
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(() => compose(), 150); };
  function stat() {
    const v = $('#rb-body').value;
    $('#rb-stat').textContent = `${(v.match(/\[[^\]\n]+\]/g) || []).length} doldurulacak [alan] · ${v.length} karakter. Köşeli alanları yapay zekâ doldurur, gerisi aynen kalır.`;
  }
  drawLeft();
  if (!rule) compose(); else { stat(); $('[data-rb-regen]').hidden = false; }

  m.form.addEventListener('click', async e => {
    const pd = e.target.closest('[data-preset-del]');
    if (pd) {
      e.preventDefault(); e.stopPropagation();
      if (!confirm('Bu stil bütün markalardan silinsin mi? Onunla kurulmuş şablonlar etkilenmez.')) return;
      try { await api.deletePromptPreset(pd.dataset.presetDel); P = await loadPresets(true); ['title', 'subtitle', 'palette'].forEach(k => { if (spec[k] === pd.dataset.presetDel) spec[k] = DEFAULT_SPEC[k]; }); drawLeft(); later(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const b = e.target.closest('[data-rb]');
    if (b) {
      e.preventDefault();
      spec[b.dataset.rb] = b.dataset.v;
      if (b.dataset.rb === 'platform') { const pf = P.platforms[spec.platform]; if (pf.video) spec.duration = Math.min(pf.max, Math.max(pf.min, pf.def)); }
      drawLeft(); later(); return;
    }
    if (e.target.closest('[data-rb-regen]')) { e.preventDefault(); return compose(true); }
    const pn = e.target.closest('[data-preset-new]');
    if (pn) { e.preventDefault(); return presetEditor(pn.dataset.presetNew, async () => { P = await loadPresets(true); drawLeft(); }); }
  });
  m.form.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'rb-body') { edited = true; $('[data-rb-regen]').hidden = false; return stat(); }
    if (t.dataset.rbRange) { spec[t.dataset.rbRange] = Number(t.value); $('#rb-dur-v').textContent = t.value; return later(); }
    if (t.dataset.rbText) { spec[t.dataset.rbText] = t.value; return later(); }
  });
  m.form.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.rbCheck) { spec[t.dataset.rbCheck] = t.checked; return later(); }
    if (t.dataset.rbSel) { spec[t.dataset.rbSel] = t.value; return later(); }
    if (t.matches('[data-rb-example]')) {
      const p = saved.find(x => x.id === t.value);
      spec.exampleId = p ? p.id : ''; spec.example = p ? p.text : '';
      toast(p ? `"${p.title}" örnek alınacak.` : 'Örnek kaldırıldı.', 'info', 2000);
    }
  });
}

// Kendi stilin: başlık/altyazı tarifi ve önizlemesi ya da renk paleti (bütün markalarda görünür)
function presetEditor(type, done) {
  const title = type === 'title'; const pal = type === 'palette';
  const m = openModal({
    title: pal ? 'Kendi renk paletin' : title ? 'Kendi başlık stilin' : 'Kendi altyazı stilin', submitLabel: 'Kaydet',
    body: `<div class="form-grid">
      <div class="field full"><label for="pe-name">Ad *</label><input class="input" id="pe-name" name="name" maxlength="60" required></div>
      ${pal ? `<div class="field full"><span class="field-label">Renkler</span><div class="row">${['#f9c6d9', '#c084fc', '#fff1e6', '#2b2b2b'].map((c, i) => `<input type="color" name="c${i}" value="${c}" aria-label="Renk ${i + 1}">`).join('')}</div></div>`
      : `<div class="field full"><label for="pe-text">Yapay zekâya giden tarif *</label><textarea class="textarea" id="pe-text" name="text" rows="4" maxlength="1500" required placeholder="${title ? 'Ör. Kalın krem yazı, altında bordo el yazısı; ortalanmış, hafif gölgeli.' : 'Ör. Sarı kalın altyazı, siyah kenarlı, kelime kelime belirir.'}"></textarea></div>
        <div class="field"><label for="pe-sample">Önizleme yazısı</label><input class="input" id="pe-sample" name="sample" maxlength="60" value="${title ? 'Örnek *başlık*' : 'örnek *altyazı*'}"></div>
        <div class="field"><label for="pe-font">Yazı tipi</label><select class="select" id="pe-font" name="font">${['Poppins', 'Inter', 'Montserrat', 'Anton', 'Archivo Black', 'Fredoka', 'DM Serif Display', 'Playfair Display', 'Bebas Neue'].map(f => `<option>${f}</option>`).join('')}</select></div>
        ${title ? `<div class="field"><label for="pe-font2">Vurgu yazı tipi</label><select class="select" id="pe-font2" name="font2"><option value="">Aynı</option>${['Pacifico', 'Dancing Script', 'Caveat', 'Playfair Display'].map(f => `<option>${f}</option>`).join('')}</select></div>` : ''}
        <div class="field"><span class="field-label">Renkler</span><div class="row">${title ? '<input type="color" name="bg" value="#3a2a22" aria-label="Zemin">' : ''}<input type="color" name="color" value="#ffffff" aria-label="Yazı rengi"><input type="color" name="accent" value="#ec4899" aria-label="Vurgu rengi"></div></div>
        <div class="field full"><span class="field-label">Önizleme</span><div id="pe-prev"></div></div>`}
    </div>`,
    onSubmit: async fd => {
      const body = { type, name: fd.get('name') };
      if (pal) body.colors = [0, 1, 2, 3].map(i => fd.get('c' + i));
      else {
        body.text = fd.get('text');
        body.sample = title ? String(fd.get('sample') || '').split(' ') : fd.get('sample');
        body.preview = title ? { bg: fd.get('bg'), color: fd.get('color'), accent: fd.get('accent'), fonts: [fd.get('font'), fd.get('font2')].filter(Boolean), weight: 800 } : { color: fd.get('color'), accent: fd.get('accent'), font: fd.get('font'), weight: 800 };
      }
      await api.savePromptPreset(null, body);
      toast('Stil eklendi; bütün markalarda görünür.', 'success');
      await done();
    }
  });
  if (pal) return;
  const prev = () => {
    const fd = new FormData(m.form);
    const st = { sample: title ? String(fd.get('sample') || '').split(' ') : fd.get('sample'), preview: title ? { bg: fd.get('bg'), color: fd.get('color'), accent: fd.get('accent'), fonts: [fd.get('font'), fd.get('font2')].filter(Boolean), weight: 800 } : { color: fd.get('color'), accent: fd.get('accent'), font: fd.get('font'), weight: 800 } };
    m.form.querySelector('#pe-prev').innerHTML = title ? titlePreview(st) : `<div style="background:#4b4b52;border-radius:12px">${subPreview(st)}</div>`;
  };
  m.form.addEventListener('input', prev);
  prev();
}
