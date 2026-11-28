// Adım adım tasarım (Post stüdyosu → "Yeni tasarım"): her ekranda tek soru, seçtikçe ilerler.
// 1) Ne tasarlıyoruz? (afiş, post, carousel, story; diğer türler)  2) İçerik nereden? (ben yazacağım / fikirlerimden /
// hızlı başla)  3) Bilgiler (türe özel alanlar; boş alan tasarıma girmez)  4) Şablon (yalnız o türün şablonları)
// → düzenleyici. Yapay zekâ kullanılmaz; "Konu yaz, yapay zekâ yazsın" eski hızlı üretime gider.
import { api } from '../api.js';
import { esc, icon, toast, busy } from '../ui.js';
import { go, state } from '../app.js';
import { drawSlide, resolveImages } from '../postCanvas.js';

const MAIN_KINDS = [
  ['afis', 'Afiş', 'A4 dikey', [54, 76]], ['post', 'Post', 'tek görsel', [62, 62]],
  ['carousel', 'Carousel', 'kapak sayfası', [72, 54]], ['story', 'Story', '9:16', [40, 72]]
];
const OTHER_KINDS = [['kapak', 'Reels kapağı'], ['reklam', 'Reklam'], ['grafik', 'Bilgi grafiği'], ['youtube', 'YouTube kapağı'], ['linkedin', 'LinkedIn belgesi']];
const LABEL = Object.fromEntries([...MAIN_KINDS.map(k => [k[0], k[1]]), ...OTHER_KINDS]);
// Türe özel alanlar: [anahtar, etiket, örnek]
const FIELDS = {
  afis: [['title', 'Başlık *', 'Kampüs Şubemiz Açıldı'], ['subtitle', 'Alt başlık', 'İlk hafta 2. kahve hediye'], ['date', 'Tarih / saat', '2 Aralık · 08.00'], ['place', 'Yer', 'Merkez Kampüs, A Blok'], ['contact', 'İletişim', '@kullaniciadi ya da telefon'], ['cta', 'Çağrı / buton', 'Bekliyoruz!']],
  reklam: [['title', 'Başlık *', 'Yeni menü geldi'], ['subtitle', 'Açıklama', 'Kış içecekleri şimdi şubelerde'], ['cta', 'Buton', 'Hemen dene']],
  grafik: [['title', 'Başlık *', 'Bilmen gereken 3 şey'], ['body', 'Maddeler (her satıra bir)', 'Birinci madde\nİkinci madde']]
};
const DEFAULT_FIELDS = [['title', 'Başlık *', 'Kısa ve dikkat çeken başlık'], ['subtitle', 'Alt başlık', 'Bir cümlelik açıklama'], ['cta', 'Çağrı', 'Kaydet, paylaş']];
// Hızlı başla: alanlar markanın bilgisinden dolar; kullanıcı sonra değiştirir
const PRESETS = [
  ['tanitim', 'Marka tanıtımı', b => ({ title: b.slogan || b.name, subtitle: firstSentence(b.description), contact: b.website || '', cta: 'Bizi takip et' })],
  ['etkinlik', 'Etkinlik duyurusu', b => ({ title: 'Etkinlik adı', subtitle: 'Kısa açıklama', date: 'Tarih · saat', place: 'Yer', contact: b.website || '', cta: 'Kayıt ol' })],
  ['kampanya', 'Kampanya / indirim', () => ({ title: '%20 indirim', subtitle: 'Hangi ürünlerde, ne zamana kadar', cta: 'Hemen al' })],
  ['urun', 'Yeni ürün', () => ({ title: 'Ürün adı', subtitle: 'Neden farklı?', cta: 'Hemen dene' })],
  ['acilis', 'Açılış', b => ({ title: 'Yeni şubemiz açıldı', subtitle: 'Açılışa özel sürpriz', date: 'Tarih · saat', place: 'Adres', contact: b.website || '', cta: 'Bekliyoruz!' })],
  ['ozelgun', 'Özel gün', b => ({ title: 'İyi bayramlar', subtitle: `${b.name} ailesi olarak`, cta: '' })]
];
// Şablonun ek alanları: alan kodu → Türkçe ad (madde, istatistik, rozet…); örnek metin şablondan gelir
const SKIP_FIELDS = ['MAIN_TITLE', 'DESCRIPTION', 'CTA', 'SPEECH'];
function fieldLabel(code) {
  const m = String(code).match(/^([A-Z]+)(?:_(\d+))?(?:_(DESC|LABEL|SUB))?$/);
  const n = m && m[2] ? ` ${m[2]}` : '';
  const names = { ITEM: 'Madde', STAT: 'Sayı', BADGE: 'Rozet', BEFORE: 'Önce', AFTER: 'Sonra', SUB: 'Alt başlık' };
  if (code === 'SUB_TITLE') return 'Alt başlık';
  if (code === 'FOOTER_NOTE') return 'Alt not';
  if (code === 'FOOTER_STATS') return 'Alt bilgi';
  if (code === 'AUDIENCE') return 'Kime yönelik';
  if (m && names[m[1]]) return `${names[m[1]]}${n}${m[3] === 'DESC' ? ' açıklaması' : m[3] === 'LABEL' ? ' etiketi' : m[3] === 'SUB' ? ' alt başlığı' : ''}`;
  return code.toLocaleLowerCase('tr-TR').replace(/_/g, ' ');
}
function templateFields(t) {
  const out = new Map();
  for (const sl of (t.data && t.data.slides) || []) for (const l of sl.layers || []) {
    if (l.type !== 'text' || l.fixed) continue;
    const code = l.field && !SKIP_FIELDS.includes(l.field) ? l.field : (!l.field && l.role === 'subtitle' ? 'SUB_TITLE' : null);
    if (code && !out.has(code)) out.set(code, String(l.text || ''));
  }
  return [...out].map(([code, example]) => ({ code, example }));
}
function firstSentence(t) { const s = String(t || '').split(/(?<=[.!?])\s/)[0]; return s.length > 140 ? s.slice(0, 140) + '…' : s; }

export async function renderDesignWizard(view, brand) {
  view.onclick = view.oninput = null;
  const st = { step: 1, kind: null, source: null, brief: {}, list: null };
  const base = `#/m/${esc(brand.id)}/post`;
  const fields = () => FIELDS[st.kind] || DEFAULT_FIELDS;
  const dots = () => `<div class="wz-dots" aria-label="Adım ${st.step} / 4">${[1, 2, 3, 4].map(i => `<i class="${i <= st.step ? 'on' : ''}"></i>`).join('')}</div>`;
  const top = () => `<div class="wz-top">${st.step > 1 ? `<button type="button" class="btn btn-ghost" data-wz-back>${icon('chevronLeft')}Geri</button>` : `<a class="btn btn-ghost" href="${base}">${icon('chevronLeft')}Post stüdyosu</a>`}${dots()}</div>`;

  async function draw() {
    let body = '';
    if (st.step === 1) {
      body = `<h2 class="wz-h">Bugün ne tasarlıyoruz?</h2><p class="muted">Birini seç; sonraki ekran yalnız ona göre gelir.</p>
        <div class="wz-grid wz-g4">${MAIN_KINDS.map(([k, l, s, [w, h]]) => `<button type="button" class="wz-card" data-wz-kind="${k}"><span class="wz-shape" style="width:${w}px;height:${h}px"></span><b>${l}</b><small>${s}</small></button>`).join('')}</div>
        <div class="wz-more">Diğer: ${OTHER_KINDS.map(([k, l]) => `<button type="button" class="btn btn-sm btn-ghost" data-wz-kind="${k}">${l}</button>`).join('')}</div>`;
    } else if (st.step === 2) {
      body = `<h2 class="wz-h">${esc(LABEL[st.kind])} içeriği nereden gelsin?</h2><p class="muted">Birini seç.</p>
        <div class="wz-grid wz-g3">
          <button type="button" class="wz-way" data-wz-src="yaz"><b>✍️ Bilgileri ben yazacağım</b><span class="muted">Başlık ve diğer alanları doldurursun.</span></button>
          <button type="button" class="wz-way" data-wz-src="fikir"><b>💡 Fikirlerimden seç</b><span class="muted">Fikir havuzundaki kullanılmamış fikirler.</span></button>
          <button type="button" class="wz-way" data-wz-src="hizli"><b>⚡ Hızlı başla</b><span class="muted">Marka tanıtımı, etkinlik, kampanya, açılış…</span></button>
        </div>
        <p class="small muted mt-4">Metni yapay zekâ yazsın istersen: <a href="${base}" data-wz-old>Konu yaz, yapay zekâ yazsın</a></p>`;
    } else if (st.step === 3 && st.source === 'fikir' && !st.brief.title) {
      if (!st.list) st.list = (await api.ideas(brand.id, '?status=kullanilmamis')).ideas;
      body = `<h2 class="wz-h">Hangi fikir?</h2><p class="muted">Seçince bilgiler dolar; sonra değiştirebilirsin.</p>
        ${st.list.length ? `<div class="wz-list">${st.list.slice(0, 40).map(i => `<button type="button" class="wz-idea" data-wz-idea="${esc(i.id)}"><b>${esc(i.title)}</b>${i.description ? `<span class="small muted">${esc(i.description.slice(0, 120))}</span>` : ''}<span class="xsmall muted">${esc(i.categoryLabel)} · ${esc(i.formatLabel)}</span></button>`).join('')}</div>`
          : `<p class="notice">Kullanılmamış fikir yok. <a href="#/m/${esc(brand.id)}/fikirler">Fikir havuzunu aç</a> ya da geri dönüp "Bilgileri ben yazacağım"ı seç.</p>`}`;
    } else if (st.step === 3 && st.source === 'hizli' && !st.brief.title) {
      body = `<h2 class="wz-h">Ne için?</h2><p class="muted">Alanlar markanın bilgisinden dolar; sonra değiştirirsin.</p>
        <div class="wz-grid wz-g3">${PRESETS.map(([k, l]) => `<button type="button" class="wz-way" data-wz-preset="${k}"><b>${l}</b></button>`).join('')}</div>`;
    } else if (st.step === 3) {
      body = `<h2 class="wz-h">${esc(LABEL[st.kind])} için neler yazsın?</h2><p class="muted">Boş bıraktığın alan tasarıma girmez.</p>
        <form class="card wz-form" id="wz-form" novalidate autocomplete="off"><div class="form-grid">${fields().map(([k, l, ph]) => `<div class="field ${k === 'title' || k === 'body' ? 'full' : ''}"><label for="wz-${k}">${l}</label>${k === 'body'
          ? `<textarea class="textarea" id="wz-${k}" name="${k}" rows="4" maxlength="1000" autocomplete="off" placeholder="${esc(ph)}">${esc(st.brief[k] || '')}</textarea>`
          : `<input class="input" id="wz-${k}" name="${k}" maxlength="200" autocomplete="off" value="${esc(st.brief[k] || '')}" placeholder="${esc(ph)}" ${k === 'title' ? 'required' : ''}>`}</div>`).join('')}</div></form>
        <div class="wz-next"><button type="button" class="btn btn-primary" data-wz-next>Devam ${icon('chevronRight')}</button></div>`;
    } else if (st.extra) {
      body = `<h2 class="wz-h">Şablondaki ek alanlar</h2><p class="muted">"${esc(st.extra.name)}" şablonunda bunlar da var. Örnek yazıları değiştir; boş bıraktığın kutu tasarıma girmez.</p>
        <form class="card wz-form" id="wz-extra" novalidate autocomplete="off"><div class="form-grid">${st.extra.fields.map(x => `<div class="field"><label for="wx-${esc(x.code)}">${esc(fieldLabel(x.code))}</label><input class="input" id="wx-${esc(x.code)}" name="${esc(x.code)}" maxlength="300" autocomplete="off"></div>`).join('')}</div></form>
        <div class="wz-next"><button type="button" class="btn btn-primary" data-wz-make>${icon('check')}Tasarımı oluştur</button></div>`;
    } else {
      const [{ templates: own }, { templates: shared }] = await Promise.all([api.postTemplates(brand.id), api.sharedTemplates(brand.id)]);
      const mine = own.filter(t => t.kind === st.kind);
      const ready = shared.filter(t => t.kind === st.kind && t.data);
      const card = (t, attr, tag) => `<button type="button" class="wz-tpl" ${attr}><canvas class="wz-thumb" data-wz-canvas="${esc(t.id)}"></canvas><b>${esc(t.name)}</b><span class="xsmall muted">${tag}</span></button>`;
      body = `<h2 class="wz-h">Bir ${esc(LABEL[st.kind].toLocaleLowerCase('tr-TR'))} şablonu seç</h2><p class="muted">Seçince bilgilerin şablona yerleşir ve düzenleyici açılır.</p>
        ${mine.length || ready.length ? `<div class="wz-grid wz-g4">${mine.map(t => card(t, `data-wz-tpl="${esc(t.id)}"`, 'Markamın')).join('')}${ready.map(t => card(t, `data-wz-shared="${esc(t.id)}"`, t.builtin ? 'Hazır' : 'Ortak kütüphane')).join('')}</div>`
          : `<p class="notice">Bu tür için henüz şablon yok. Şablonsuz başla; beğendiğin tasarımı düzenleyicide "Şablonlarıma ekle" ile şablon yapabilirsin.</p>`}
        <div class="wz-next"><button type="button" class="btn" data-wz-none>Şablonsuz başla (marka yerleşimi)</button></div>`;
      st.thumbs = [...mine, ...ready];
    }
    // Sihirbaz yazılanları kendi durumunda tutar; ortak "yarım yazıyı geri koy" özelliği (drafts.js) burada kapalı
    view.innerHTML = `<div class="wz" data-no-draft>${top()}${body}</div>`;
    if (st.step === 4) for (const t of st.thumbs || []) {
      const c = view.querySelector(`[data-wz-canvas="${CSS.escape(t.id)}"]`);
      const slide = t.data && t.data.slides && t.data.slides[0];
      const F = ((state.meta.posts || {}).formats || {})[t.data && t.data.format] || { w: 1080, h: 1350 };
      if (c && slide) resolveImages(slide).then(() => { if (c.isConnected) drawSlide(c, slide, F); }).catch(() => {});
    }
    // Tarayıcı aynı adlı alana önceki yazıyı geri doldurmasın: değerler durumdan açıkça yazılır
    view.querySelectorAll('#wz-form [name]').forEach(el => { el.value = st.brief[el.name] || ''; });
    if (st.extra) view.querySelectorAll('#wz-extra [name]').forEach(el => { const x = st.extra.fields.find(f => f.code === el.name); el.value = st.extra.values[el.name] != null ? st.extra.values[el.name] : x.example; });
    const first = view.querySelector('#wz-title'); if (first) first.focus();
  }

  const readForm = () => { const f = view.querySelector('#wz-form'); if (f) for (const [k, v] of new FormData(f).entries()) st.brief[k] = String(v).trim(); };
  async function create(btn, extra, more = {}) {
    try {
      const r = await busy(btn, () => api.createFromBrief(brand.id, Object.assign({ kind: st.kind, brief: Object.assign({}, st.brief, more) }, extra)));
      toast('Tasarım hazır; düzenleyebilirsin.', 'success');
      go(`${base}/${r.post.id}`);
    } catch (err) { toast(err.message, 'error'); }
  }

  view.onclick = async e => {
    const t = e.target.closest('button, a'); if (!t) return;
    const d = t.dataset;
    if ('wzBack' in d) {
      readForm();
      if (st.extra) { st.extra = null; return draw(); }
      // Fikir / hızlı başla: bilgiler ekranından seçim listesine dön
      if (st.step === 3 && st.source !== 'yaz' && st.brief.title) { st.brief = {}; }
      else st.step -= 1;
      return draw();
    }
    if (d.wzKind) { st.kind = d.wzKind; st.step = 2; return draw(); }
    // Aynı yol yeniden seçilirse yazılanlar kalır; başka yol seçilirse yeni başlangıç
    if (d.wzSrc) { if (d.wzSrc !== st.source) st.brief = {}; st.source = d.wzSrc; st.step = 3; return draw(); }
    if (d.wzIdea) {
      const i = st.list.find(x => x.id === d.wzIdea);
      st.brief = { title: i.title, subtitle: i.description ? firstSentence(i.description) : '' };
      return draw();
    }
    if (d.wzPreset) { st.brief = Object.fromEntries(Object.entries(PRESETS.find(p => p[0] === d.wzPreset)[2](brand)).filter(([, v]) => v)); return draw(); }
    if ('wzNext' in d) {
      readForm();
      if (!st.brief.title) { toast('Başlığı yaz.', 'error'); const f = view.querySelector('#wz-title'); if (f) f.focus(); return; }
      st.step = 4; return draw();
    }
    // Şablon seçilince: ek alanı varsa önce o alanlar sorulur (örnek yazıyla dolu), yoksa doğrudan oluşturulur
    if (d.wzTpl || d.wzShared) {
      const tpl = (st.thumbs || []).find(x => x.id === (d.wzTpl || d.wzShared));
      const extra = tpl ? templateFields(tpl) : [];
      const ref = d.wzTpl ? { templateId: d.wzTpl } : { sharedId: d.wzShared };
      if (!extra.length) return create(t, ref);
      st.extra = { name: tpl.name, fields: extra, ref, values: st.brief.subtitle && extra.some(x => x.code === 'SUB_TITLE') ? { SUB_TITLE: st.brief.subtitle } : {} };
      return draw();
    }
    if ('wzMake' in d) {
      view.querySelectorAll('#wz-extra [name]').forEach(el => { st.extra.values[el.name] = el.value.trim(); });
      return create(t, Object.assign({}, st.extra.ref), { fields: st.extra.values });
    }
    if ('wzNone' in d) return create(t, {});
  };
  await draw();
}
