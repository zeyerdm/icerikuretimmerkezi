// 9.3–9.9 Marka kimliği: Dijital kimlik, hafıza, prompt kimliği ve maskot tek yerde.
// - Marka dosyası (#/m/<id>/kimlik): bütün kimliğin özeti, her bölümün eksikleri ve "Düzenle" bağlantıları
// - Kurulum sihirbazı (#/m/<id>/kimlik/kurulum/<adım>): sorular sırayla, her adım ayrı sayfa; cevaplar sonraki adımları açar
// - Bölüm düzenleme (#/m/<id>/kimlik/duzenle/<adım>): sihirbazın aynı sayfası; kaydedince Marka dosyasına döner
// - Ayrıntılı sekmeler: Profil, Görsel kimlik, Ses ve hafıza, Prompt kimliği, Maskot (var olan düzenleyiciler)
// Cevaplar yeni bir yere değil, var olan kaynaklara yazılır (sunucu: services/brandSetup.js).
import { api } from '../api.js';
import { esc, icon, toast, pageHead, busy, skeletonPage, emptyState, suggest, openModal } from '../ui.js';
import { state, refreshBrands, go } from '../app.js';
import { renderBrandEditor } from './brandEditor.js';
import { renderMemory } from './memory.js';
import { renderPromptIdentity, characterBookCard } from './promptIdentity.js';

export const ID_TABS = [['ozet', '', 'Marka dosyası'], ['profil', '/profil', 'Profil'], ['gorsel', '/gorsel', 'Görsel kimlik'], ['ses', '/ses', 'Ses ve hafıza'], ['prompt', '/prompt', 'Prompt kimliği'], ['maskot', '/maskot', 'Maskot']];

export function identityHead(brand, active, desc) {
  const base = `#/m/${esc(brand.id)}/kimlik`;
  return pageHead({
    title: 'Marka kimliği',
    desc: desc || `${esc(brand.name)} hakkında yapay zekânın bildiği her şey tek yerde. Burada yazdıkların bütün üretimlere (asistan, Reels, post, prompt, denetçi) kendiliğinden girer.`,
    actions: `<a class="btn" href="${base}/kurulum">${icon('wand')}Kurulum sihirbazı</a><button type="button" class="btn btn-danger" data-id-action="delete">${icon('trash')}Markayı sil</button>`
  }) + `<nav class="tabs id-tabs" aria-label="Marka kimliği bölümleri">${ID_TABS.map(([k, p, l]) => `<a href="${base}${p}" class="${k === active ? 'active' : ''}"${k === active ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
}

// Başlıktaki Markayı sil (başlık her çizimde yeniden oluşur; dinleyici birikmez)
export function bindIdentityActions(view, brand) {
  const head = view.querySelector('.page-head');
  if (!head) return;
  head.addEventListener('click', async e => {
    const t = e.target.closest('[data-id-action]');
    if (!t) return;
    deleteBrandFlow(brand);
  });
}

// Markayı sil: Marka kimliği başlığı, Markalar kartı, marka ana sayfası ve kurulum sohbetinden aynı akış.
// Kalıcıdır; kazayla silinmesin diye markanın adını yazmak istenir.
export async function deleteBrandFlow(brand, { after = '#/markalar' } = {}) {
  const typed = prompt(`"${brand.name}" markası; fikirleri, dosyaları, takvim içerikleri, görevleri, notları ve sohbet geçmişiyle birlikte kalıcı olarak silinecek. Bu geri alınamaz.\n\nOnaylamak için markanın adını yaz: ${brand.name}`, '');
  if (typed === null) return false;
  if (typed.trim().toLocaleLowerCase('tr-TR') !== String(brand.name).trim().toLocaleLowerCase('tr-TR')) { toast('Ad eşleşmedi; marka silinmedi.', 'info'); return false; }
  try {
    await api.deleteBrand(brand.id);
    await refreshBrands();
    toast(`${brand.name} silindi.`, 'success');
    go(after);
    return true;
  } catch (err) { toast(err.message, 'error'); return false; }
}

export async function renderIdentity(view, brand, tab = 'ozet', step = null) {
  view.onclick = view.onkeydown = view.oninput = view.onchange = null;
  if (tab === 'profil' || tab === 'gorsel') return renderBrandEditor(view, brand.id, tab);
  if (tab === 'ses') return renderMemory(view, brand);
  if (tab === 'prompt') return renderPromptIdentity(view, brand);
  if (tab === 'maskot') return renderMascot(view, brand);
  if (tab === 'kurulum') return renderSetup(view, brand, step, false);
  if (tab === 'duzenle') return renderSetup(view, brand, step, true);
  return renderDossier(view, brand);
}

// ---------- Marka dosyası ----------
const dash = '<span class="muted">—</span>';
const val = v => (Array.isArray(v) ? (v.length ? esc(v.join(', ')) : dash) : (v ? esc(v) : dash));
const optLabel = (questions, key, v) => {
  const q = questions.find(x => x.key === key);
  if (!q || v == null || v === '') return '';
  return Array.isArray(v) ? v.map(x => q.options[x] || x).join(', ') : (q.options ? q.options[v] || v : v);
};

function section({ id, title, step, tab, needs, rows, extra = '', brand }) {
  const base = `#/m/${esc(brand.id)}/kimlik`;
  return `<section class="card dossier-card" id="ds-${id}">
    <div class="card-head"><h3>${esc(title)}</h3>${needs.length ? `<span class="pill pill-warn" title="${esc(needs.join(', '))}">${needs.length} eksik</span>` : '<span class="pill pill-ok"><span class="dot"></span>Tamam</span>'}</div>
    <dl class="dossier-dl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>${extra}
    ${needs.length ? `<p class="xsmall muted mt-2">Eksik: ${esc(needs.join(', '))}</p>` : ''}
    <div class="row mt-3">${step ? `<a class="btn btn-sm btn-primary" href="${base}/duzenle/${step}">${icon('edit')}Düzenle</a>` : ''}${tab ? `<a class="btn btn-sm btn-ghost" href="${base}/${tab}">Ayrıntılı</a>` : ''}</div>
  </section>`;
}

async function renderDossier(view, brand) {
  view.innerHTML = skeletonPage({ cards: 4, height: 200 });
  const d = await api.brandSetup(brand.id);
  const b = d.brand;
  const q = d.questions;
  const idt = d.identity;
  const need = id => (d.steps.find(s => s.id === id) || { needs: [] }).needs;
  const has = id => d.steps.some(s => s.id === id);
  const base = `#/m/${esc(brand.id)}/kimlik`;
  const allNeeds = d.steps.reduce((n, s) => n + s.needs.length, 0);
  const skipped = d.steps.filter(s => !s.done);
  const head = !d.started
    ? `<div class="card setup-callout mb-5"><div><h2>Markayı adım adım kuralım</h2><p class="small muted">Birkaç soruyla başlıyoruz: ne markası, maskotu var mı, hangi kanallarda ne paylaşıyor. Cevaplarına göre sonraki sorular gelir ve neler gerektiği (logo, renkler, maskot pozları…) istenir. Her adım kaydedilir; yarıda bırakırsan kaldığın yerden devam edersin.</p></div><a class="btn btn-primary" href="#/m/${esc(brand.id)}/kur">${icon('sparkle')}Kuruluma başla</a></div>`
    : (skipped.length || allNeeds)
      ? `<div class="card setup-callout mb-5"><div><h2>Kurulum %${d.percent}</h2><p class="small muted">${skipped.length ? `${skipped.length} adım atlandı (${esc(skipped.map(s => s.label).join(', '))}). ` : ''}${allNeeds ? `${allNeeds} eksik bilgi var.` : ''} Eksikler aşağıda bölüm bölüm yazıyor.</p></div><a class="btn btn-primary" href="${base}/kurulum/${esc(d.next)}">${icon('check')}Eksikleri tamamla</a></div>`
      : '<div class="notice notice-ok mb-5"><div><strong>Marka kimliği tamam.</strong> Bir bölümü değiştirmek için o bölümün Düzenle düğmesine bas.</div></div>';

  const swatches = [b.colors.primary, ...b.colors.secondary].filter(Boolean);
  const cards = [
    section({ brand, id: 'temel', title: 'Marka', step: 'temel', tab: 'profil', needs: need('temel'), rows: [['Ad', val(b.name)], ['Sektör', val(b.sector)], ['Slogan', val(b.slogan)], ['Açıklama', val(b.description)]] }),
    section({ brand, id: 'yapi', title: 'Kanallar ve içerikler', step: 'yapi', needs: need('yapi'), rows: [
      ['Kanallar', val(d.setup.channels.map(k => d.options.channels[k]))], ['İçerik türleri', val(d.setup.contentKinds.map(k => d.options.contentKinds[k]))],
      ['Maskot', d.setup.hasMascot == null ? dash : d.setup.hasMascot ? 'Var' : 'Yok'], ['Ziyaret edilen mekân', d.setup.hasPlace == null ? dash : d.setup.hasPlace ? 'Var' : 'Yok']] }),
    section({ brand, id: 'kitle', title: 'Kitle ve hedef', step: 'kitle', tab: 'profil', needs: need('kitle'), rows: [['Hedef kitle', val(b.audience)], ['Hedefler', val(b.goals)], ['Rakipler', val(b.competitors)], ['Aylık içerik hedefi', b.monthlyGoal ? esc(String(b.monthlyGoal)) : dash]] }),
    section({ brand, id: 'ses', title: 'Ses ve dil', step: 'ses', tab: 'ses', needs: need('ses'), rows: [['Karakter', val(b.character)], ['İletişim dili', val(b.tone)], ['Kullanılmayacak kelimeler', val(d.memory.banned)], ['Tercih edilen ifadeler', val(d.memory.preferred)]] }),
    section({ brand, id: 'gorsel', title: 'Logo, renk ve font', step: 'gorsel', tab: 'gorsel', needs: need('gorsel'), rows: [
      ['Logo', d.logo ? `<img class="ds-logo" src="${esc(d.logo.url)}" alt="${esc(b.name)} logosu">` : dash],
      ['Renkler', swatches.length ? `<span class="swatches">${swatches.map(c => `<span class="swatch" style="background:${esc(c)}" title="${esc(c)}"></span>`).join('')}</span>` : dash],
      ['Fontlar', b.fonts.heading || b.fonts.body ? esc([b.fonts.heading, b.fonts.body].filter(Boolean).join(' / ')) : dash]] }),
    has('maskot') ? section({ brand, id: 'maskot', title: 'Maskot', step: 'maskot', tab: 'maskot', needs: need('maskot'), rows: [
      ['Adı', val(idt.mascotName || d.book.name)], ['Görünüş', val(idt.mascotLook)], ['Kişilik', val(d.book.personality)], ['Karakter kitabı', d.book.lookEn ? 'İngilizce tarif hazır' : '<span class="muted">İngilizce tarif yok</span>']],
      extra: d.mascots.length ? `<div class="ds-poses">${d.mascots.map(a => `<img src="${esc(a.url)}" alt="${esc(a.label || 'Maskot pozu')}" title="${esc(a.label)}">`).join('')}</div>` : '' }) : '',
    has('gorseldil') ? section({ brand, id: 'gorseldil', title: 'Görsel dil', step: 'gorseldil', tab: 'prompt', needs: need('gorseldil'), rows: [
      ['Stil', val(optLabel(q, 'visualStyle', idt.visualStyle))], ['Işık', val(optLabel(q, 'lighting', idt.lighting))], ['His', val(optLabel(q, 'mood', idt.mood))], ['İnsanlar', val(idt.people)], ['Asla olmasın', val(idt.avoid || [])], ['Ürün fotoğrafı', val(optLabel(q, 'productStyle', idt.productStyle))]] }) : '',
    has('video') ? section({ brand, id: 'video', title: 'Video', step: 'video', tab: 'prompt', needs: need('video'), rows: [['Kamera dili', val(optLabel(q, 'camera', idt.camera))], ['Mekânlar', val(idt.places || [])]] }) : '',
    has('youtube') ? section({ brand, id: 'youtube', title: 'YouTube', step: 'youtube', tab: 'prompt', needs: need('youtube'), rows: [['Kapak tarzı', val(optLabel(q, 'thumbStyle', idt.thumbStyle))]] }) : '',
    section({ brand, id: 'bilgiler', title: 'Bilgiler', step: 'bilgiler', tab: 'ses', needs: need('bilgiler'), rows: d.memory.facts.length
      ? d.memory.facts.slice(0, 6).map(f => [f.categoryLabel, `<b>${esc(f.title)}</b> · ${esc(f.content.length > 90 ? f.content.slice(0, 90) + '…' : f.content)}`]).concat(d.memory.facts.length > 6 ? [['', `<span class="muted">+${d.memory.facts.length - 6} bilgi daha</span>`]] : [])
      : [['Bilgi kartı', dash]] })
  ];
  // Arka plandaki yapay zekâ işi (kurulum sonu) ya da elle başlatma
  const ai = d.onboardAi;
  const aiOn = Boolean(state.settings && state.settings.ai && state.settings.ai.configured);
  const aiBox = ai && ai.status === 'calisiyor'
    ? `<div class="notice mb-5" id="ds-ai"><div><span class="ob-spin" aria-hidden="true"></span> <strong>Yapay zekâ arka planda markanı dolduruyor.</strong> ${ai.found.length ? esc(ai.found.join(' · ')) : 'Bittiğinde bu sayfa kendiliğinden yenilenir.'}</div></div>`
    : ai && (ai.found.length || ai.notes.length)
      ? `<details class="disclosure mb-5" id="ds-ai"><summary>Yapay zekânın doldurdukları (${new Date(ai.finishedAt || ai.startedAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})</summary><ul class="ob-list">${ai.found.map(x => `<li>✓ ${esc(x)}</li>`).join('')}</ul>${ai.notes.length ? `<p class="small muted">${ai.notes.map(esc).join('<br>')}</p>` : ''}</details>`
      : '';
  const aiBtn = aiOn && !(ai && ai.status === 'calisiyor') ? `<button type="button" class="btn btn-sm" data-ai-enrich title="Boş kalan alanlar, maskot tarifi, benzer fikirler ve referanstan örnek tasarım; arka planda, beklemeden">${icon('sparkle')}Yapay zekâ ile tamamla</button>` : '';
  view.innerHTML = identityHead(brand, 'ozet') + head + aiBox + (aiBtn ? `<div class="row mb-4">${aiBtn}<span class="xsmall muted">Arka planda çalışır; beklemen gerekmez. Yalnız boş alanlara yazar.</span></div>` : '') + `<div class="dossier-grid">${cards.join('')}</div>`;
  const eb = view.querySelector('[data-ai-enrich]');
  if (eb) eb.addEventListener('click', async () => { try { await busy(eb, () => api.onboardEnrich(brand.id)); toast('Yapay zekâ arka planda başladı.', 'success'); renderDossier(view, brand); } catch (err) { toast(err.message, 'error'); } });
  if (ai && ai.status === 'calisiyor') {
    const poll = async () => {
      if (!view.isConnected || !view.querySelector('#ds-ai')) return;
      try { const r = await api.onboard(brand.id); if (r.state.ai && r.state.ai.status !== 'calisiyor') return renderDossier(view, brand); } catch { /* sonra */ }
      setTimeout(poll, 5000);
    };
    setTimeout(poll, 5000);
  }
  bindIdentityActions(view, brand);
}

// ---------- Maskot sekmesi ----------
async function renderMascot(view, brand) {
  view.innerHTML = skeletonPage({ cards: 2, height: 240 });
  const { identity } = await api.promptIdentity(brand.id);
  const idt = Object.assign({}, identity);
  const base = `#/m/${esc(brand.id)}/kimlik`;
  view.innerHTML = identityHead(brand, 'maskot', `${esc(brand.name)} maskotunun sabit tanımı: adı, görünüşü, konuşması ve referans pozları. Maskotlu görsel, Reels ve prompt üretimlerinde birebir kullanılır.`) +
    (idt.hasMascot
      ? `<section class="card"><div class="card-head"><h3>Maskot bilgileri</h3><a class="btn btn-sm" href="${base}/duzenle/maskot">${icon('edit')}Düzenle</a></div>
          <dl class="dossier-dl">${[['Adı', idt.mascotName], ['Görünüş', idt.mascotLook], ['Konuşma', idt.mascotVoice], ['Hareket', idt.mascotMoves], ['Asla', idt.mascotNever]].map(([k, v]) => `<dt>${k}</dt><dd>${val(v)}</dd>`).join('')}</dl>
          <p class="xsmall muted mt-2">Pozları <a href="#/m/${esc(brand.id)}/kutuphane">Kütüphane → Maskot</a> bölümünden ya da Düzenle sayfasından yükleyebilirsin.</p></section>`
      : emptyState({ icon: 'identity', title: 'Bu markanın maskotu yok', text: 'Maskot varsa kurulumda "Maskot var" de; adı, görünüşü ve pozları sorulur.', action: `<a class="btn btn-sm btn-primary" href="${base}/duzenle/yapi">Maskot ekle</a>`, card: true }));
  bindIdentityActions(view, brand);
  if (idt.hasMascot) await characterBookCard(view, brand);
}

// ---------- Kurulum sihirbazı ----------
const field = (id, label, input, hint = '') => `<div class="field"><label for="${id}">${label}</label>${input}${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
const inp = (name, value, attrs = '') => `<input class="input" id="su-${name}" name="${name}" value="${esc(value || '')}" ${attrs}>`;
const area = (name, value, attrs = '') => `<textarea class="textarea" id="su-${name}" name="${name}" rows="3" ${attrs}>${esc(value || '')}</textarea>`;
const checks = (name, dict, sel) => `<div class="chip-row">${Object.entries(dict).map(([k, l]) => `<label class="chip-check"><input type="checkbox" name="${name}" value="${esc(k)}" ${sel.includes(k) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
const yesNo = (name, v, yes, no) => `<div class="chip-row"><label class="chip-check"><input type="radio" name="${name}" value="true" ${v === true ? 'checked' : ''}><span>${esc(yes)}</span></label><label class="chip-check"><input type="radio" name="${name}" value="false" ${v === false ? 'checked' : ''}><span>${esc(no)}</span></label></div>`;
function question(q, cur) {
  if (q.type === 'one' || q.type === 'many') {
    const multi = q.type === 'many';
    const sel = x => (multi ? (cur || []).includes(x) : cur === x);
    return `<fieldset class="field"><legend class="field-label">${esc(q.label)}</legend><div class="chip-row">${Object.entries(q.options).map(([v, l]) => `<label class="chip-check"><input type="${multi ? 'checkbox' : 'radio'}" name="${q.key}" value="${esc(v)}" ${sel(v) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}
      ${multi ? '' : `<label class="chip-check"><input type="radio" name="${q.key}" value="" ${cur ? '' : 'checked'}><span>Fark etmez</span></label>`}</div></fieldset>`;
  }
  return field('su-' + q.key, esc(q.label), inp(q.key, Array.isArray(cur) ? cur.join(', ') : cur, `maxlength="300" placeholder="${esc(q.hint || '')}"`));
}

const INTRO = {
  temel: 'Önce temel: markanın adı ve ne iş yaptığı. Yapay zekâ her üretimde buradan başlar.',
  yapi: 'Bu cevaplar sonraki soruları belirler: maskot varsa maskot adımı, görsel içerik üretiyorsan görsel dil, video varsa video adımı açılır.',
  kitle: 'Kime sesleniyoruz ve içeriklerden ne bekliyoruz? Fikir ve metin önerileri buna göre seçilir.',
  ses: 'Marka bir insan olsaydı nasıl konuşurdu? Kaçınılacak kelimeler içerik denetçisinde uyarı olarak çıkar.',
  gorsel: 'Logo, renkler ve fontlar; post stüdyosu ve görsel üretimi bunları kullanır.',
  maskot: 'Maskotun her üretimde aynı görünmesi için: adı, görünüşü, konuşması ve referans pozları.',
  gorseldil: 'Görseller nasıl görünsün? Prompt Studio ve görsel üretimi bu tercihlerle yazar.',
  video: 'Reels ve videolar için kamera dili, sık kullanılan mekânlar ve seslendirme sesi.',
  youtube: 'YouTube kapakların hangi tarzda olsun?',
  bilgiler: 'Yapay zekânın doğru kabul edeceği bilgiler. Burada olmayan fiyat, adres gibi bilgileri uydurmaz.'
};

function stepForm(id, d) {
  const C = state.meta.choices || {};
  const b = d.brand; const idt = d.identity; const q = k => d.questions.find(x => x.key === k);
  const fact = title => (d.memory.facts.find(f => f.title === title) || {}).content || '';
  if (id === 'temel') return `<div class="form-grid">
      ${field('su-name', 'Marka adı *', inp('name', b.name, 'maxlength="80" required placeholder="Ör. Kahve Durağı"'))}
      ${field('su-sector', 'Ne markası? (sektör)', inp('sector', b.sector, 'maxlength="120" placeholder="Ör. Kafe, diş kliniği, giyim markası, kişisel marka"') + suggest('su-sector', C.sector))}
      <div class="full">${field('su-description', 'Marka ne yapar, neyi farklı yapar?', area('description', b.description, 'maxlength="1500"'))}</div>
      ${field('su-slogan', 'Sloganı var mı?', inp('slogan', b.slogan, 'maxlength="160" placeholder="Ör. Her yudum bir mola"'))}
      ${b.id && state.settings && state.settings.ai && state.settings.ai.configured ? `<div class="full"><button type="button" class="btn btn-sm" data-ai-prefill>${icon('sparkle')}Web sitesi ya da biyografi metninden doldur (AI)</button><span class="xsmall muted"> Yalnız boş alanlar doldurulur; kitle, karakter ve ton gibi sonraki adımların boş alanları da.</span></div>` : ''}</div>`;
  if (id === 'yapi') return `<div class="stack">
      <fieldset class="field"><legend class="field-label">Hangi kanallarda paylaşıyor?</legend>${checks('channels', d.options.channels, d.setup.channels)}</fieldset>
      <fieldset class="field"><legend class="field-label">Ne tür içerikler üretiyor?</legend>${checks('contentKinds', d.options.contentKinds, d.setup.contentKinds)}</fieldset>
      <fieldset class="field"><legend class="field-label">Markanın bir maskotu var mı?</legend>${yesNo('hasMascot', d.setup.hasMascot, 'Evet, maskot var', 'Hayır')}</fieldset>
      <fieldset class="field"><legend class="field-label">Müşterinin geldiği bir mekân var mı? (dükkân, kafe, klinik…)</legend>${yesNo('hasPlace', d.setup.hasPlace, 'Evet', 'Hayır, çevrim içi')}</fieldset></div>`;
  if (id === 'kitle') return `<div class="form-grid">
      <div class="full">${field('su-audience', 'Hedef kitle', area('audience', b.audience, 'maxlength="1000" placeholder="Yaş, ilgi alanı, ihtiyaçlar…"') + suggest('su-audience', C.audience))}</div>
      <div class="full">${field('su-goals', 'İçeriklerden ne bekliyoruz?', area('goals', b.goals, 'maxlength="1000" placeholder="Bilinirlik, satış, topluluk…"') + suggest('su-goals', C.goals))}</div>
      <div class="full">${field('su-competitors', 'Rakipler ve ilham alınan markalar', area('competitors', b.competitors, 'maxlength="1000"'))}</div>
      ${field('su-monthlyGoal', 'Ayda kaç içerik?', inp('monthlyGoal', b.monthlyGoal || '', 'type="number" min="0" max="200" inputmode="numeric"'))}</div>`;
  if (id === 'ses') return `<div class="form-grid">
      <div class="full">${field('su-character', 'Marka bir insan olsaydı nasıl biri olurdu?', area('character', b.character, 'maxlength="1000" placeholder="Ör. samimi, esprili, güven veren"') + suggest('su-character', C.character))}</div>
      <div class="full">${field('su-tone', 'Nasıl konuşur?', area('tone', b.tone, 'maxlength="1000" placeholder="Sen/siz, emoji kullanımı, cümle uzunluğu…"') + suggest('su-tone', C.tone))}</div>
      <p class="small muted full">Kullanılmaması gereken kelimeler ve sevilen ifadeler tek yerde tutulur: <a href="#/m/${esc(b.id)}/kimlik/ses">Ses ve hafıza</a>${d.memory.banned.length ? ` (şu an: ${esc(d.memory.banned.slice(0, 6).join(', '))}${d.memory.banned.length > 6 ? '…' : ''})` : ''}.</p></div>`;
  if (id === 'gorsel') return `<div class="form-grid">
      <div class="field full"><span class="field-label">Logo</span><div class="row">${d.logo ? `<img class="ds-logo" src="${esc(d.logo.url)}" alt="Mevcut logo">` : '<span class="small muted">Henüz logo yok.</span>'}
        <label class="btn btn-sm">${icon('upload')}${d.logo ? 'Yeni logo yükle' : 'Logo yükle'}<input type="file" class="sr-only" data-upload="logo" accept="image/png,image/jpeg,image/webp,image/gif"></label></div></div>
      ${field('su-primary', 'Ana renk', `<div class="color-field"><input type="color" data-color-for="su-primary" value="${esc(b.colors.primary || '#5b55e6')}" aria-label="Ana renk seç">${inp('primary', b.colors.primary, 'maxlength="7" placeholder="#RRGGBB" pattern="#[0-9a-fA-F]{6}"')}</div>`)}
      ${field('su-secondary', 'Diğer renkler', inp('secondary', b.colors.secondary.join(', '), 'placeholder="#ffffff, #1b1f3b"'), 'Virgülle ayır, en fazla 6.')}
      ${field('su-font_heading', 'Başlık fontu', `<select class="select" id="su-font_heading" name="font_heading"><option value="">Seçilmedi</option>${state.meta.fonts.map(f => `<option ${b.fonts.heading === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>`)}
      ${field('su-font_body', 'Gövde fontu', `<select class="select" id="su-font_body" name="font_body"><option value="">Seçilmedi</option>${state.meta.fonts.map(f => `<option ${b.fonts.body === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>`)}</div>`;
  if (id === 'maskot') return `<div class="form-grid">
      ${field('su-name', 'Maskotun adı', inp('name', idt.mascotName || d.book.name, 'maxlength="60"'))}
      ${field('su-personality', 'Kişiliği', inp('personality', d.book.personality, 'maxlength="300" placeholder="Ör. meraklı, neşeli, biraz sakar"') + suggest('su-personality', C.mascotPersonality))}
      <div class="full">${field('su-look', 'Nasıl görünüyor?', area('look', idt.mascotLook, 'maxlength="300" placeholder="Ör. kahve çekirdeği şeklinde, turuncu, kocaman gözlü, kırmızı atkılı"'))}</div>
      ${field('su-voice', 'Nasıl konuşur?', inp('voice', idt.mascotVoice, 'maxlength="300" placeholder="Ör. kısa cümleler, esprili"'))}
      ${field('su-moves', 'Nasıl hareket eder?', inp('moves', idt.mascotMoves, 'maxlength="300" placeholder="Ör. zıplayarak yürür"'))}
      ${field('su-speech', 'Konuşma örnekleri (her satıra bir)', area('speech', (d.book.speech || []).join('\n')))}
      ${field('su-never', 'Asla yapmadıkları (her satıra bir)', area('never', (d.book.never || (idt.mascotNever ? idt.mascotNever.split('; ') : [])).join('\n')))}
      <div class="field full"><span class="field-label">Referans pozlar</span>${d.mascots.length ? `<div class="ds-poses">${d.mascots.map(a => `<img src="${esc(a.url)}" alt="${esc(a.label || 'Maskot pozu')}">`).join('')}</div>` : '<span class="small muted">Henüz poz yok. Maskotun farklı pozlarını yükle (ör. mutlu, şaşkın, el sallıyor).</span>'}
        <label class="btn btn-sm mt-2">${icon('upload')}Poz yükle<input type="file" class="sr-only" data-upload="mascot" multiple accept="image/png,image/jpeg,image/webp,image/gif"></label>
        <span class="hint">Pozlardan İngilizce görünüş tarifini Maskot sekmesindeki karakter kitabında AI ile çıkarabilirsin.</span></div></div>`;
  if (id === 'gorseldil') return `<div class="stack">${['visualStyle', 'lighting', 'colors', 'mood', 'people', 'avoid', 'productStyle'].map(k => question(q(k), idt[k])).join('')}
      <div class="field"><span class="field-label">Beğendiğin görsel ve içerik örnekleri (isteğe bağlı)</span><span class="small muted">${d.assetCounts.reference || 0} örnek yüklü. Kütüphanede Referanslar bölümünde durur; referanstan şablon ve görsel üretiminde kullanılır.</span>
        <label class="btn btn-sm mt-2">${icon('upload')}Örnek yükle<input type="file" class="sr-only" data-upload="reference" multiple accept="image/png,image/jpeg,image/webp,image/gif"></label></div></div>`;
  if (id === 'video') return `<div class="stack">${['camera', 'places'].map(k => question(q(k), idt[k])).join('')}
      ${d.voice ? `<div class="form-grid"><div class="field"><label for="su-voice-pick">Seslendirme sesi (Reels)</label><select class="select" id="su-voice-pick" name="voice">${Object.entries(d.voices).map(([k, v]) => `<option value="${esc(k)}" ${d.voice.voice === k ? 'selected' : ''}>${esc(k)} · ${esc(v)}</option>`).join('')}</select></div>
        <div class="field"><label for="su-voiceStyle">Konuşma tarzı</label><input class="input" id="su-voiceStyle" name="voiceStyle" maxlength="120" value="${esc(d.voice.voiceStyle || '')}" placeholder="Ör. samimi, hızlı, gülümseyerek">${suggest('su-voiceStyle', ['Samimi', 'Enerjik', 'Sakin', 'Hızlı', 'Gülümseyerek', 'Ciddi ve güven veren'])}</div></div>` : ''}</div>`;
  if (id === 'youtube') return `<div class="stack">${question(q('thumbStyle'), idt.thumbStyle)}<p class="small muted">Kapak fikirleri bu tarza göre önerilir. Kapağın kendisi YouTube kapağı sayfasında kendi çekimlerinden üretilir.</p></div>`;
  if (id === 'bilgiler') return `<div class="form-grid">
      <div class="full">${field('su-urunler', 'Ürün ve hizmetler (fiyatlarla)', area('urunler', fact('Ürün ve hizmetler'), 'maxlength="2000" placeholder="Ör. Filtre kahve 85 TL, latte 110 TL"'))}</div>
      <div class="full">${field('su-hikaye', 'Marka hikâyesi', area('hikaye', fact('Marka hikâyesi'), 'maxlength="2000"'))}</div>
      ${d.setup.hasPlace ? `<div class="full">${field('su-adres', 'Adres ve iletişim', area('adres', fact('Adres ve iletişim'), 'maxlength="2000"'))}</div>
      <div class="full">${field('su-saatler', 'Çalışma saatleri', inp('saatler', fact('Çalışma saatleri'), 'maxlength="2000" placeholder="Ör. Her gün 08.00–22.00"'))}</div>` : ''}</div>
      <p class="xsmall muted mt-2">Kampanya, sık sorulanlar gibi diğer bilgileri Ses ve hafıza sekmesinden ekleyebilirsin.</p>`;
  return '';
}

function readStep(id, form) {
  const fd = new FormData(form);
  const all = n => fd.getAll(n).map(String);
  const one = n => (fd.has(n) ? String(fd.get(n)) : undefined);
  const out = {};
  if (id === 'yapi') return { channels: all('channels'), contentKinds: all('contentKinds'), hasMascot: one('hasMascot') === 'true', hasPlace: one('hasPlace') === 'true' };
  if (id === 'gorsel') {
    out.primary = one('primary').trim();
    out.secondary = one('secondary').split(/[\s,]+/).filter(Boolean);
    out.font_heading = one('font_heading'); out.font_body = one('font_body');
    return out;
  }
  if (id === 'gorseldil') { out.mood = all('mood'); }
  if (id === 'youtube') return { thumbStyle: one('thumbStyle') || '' };
  for (const [k, v] of fd.entries()) if (!(k in out) && typeof v === 'string') out[k] = v;
  if (id === 'kitle') out.monthlyGoal = Number(out.monthlyGoal || 0);
  return out;
}

async function renderSetup(view, brand, stepId, edit) {
  view.innerHTML = skeletonPage({ cards: 1, height: 360 });
  let d = await api.brandSetup(brand.id);
  const base = `#/m/${esc(brand.id)}/kimlik`;
  if (!stepId) { // Kaldığı yerden: ilk tamamlanmamış adım (hepsi tamamsa eksiği olan ilk adım, o da yoksa ilk adım)
    stepId = d.next || d.steps[0].id;
    history.replaceState(null, '', `${base}/kurulum/${stepId}`);
  }
  const idx = d.steps.findIndex(s => s.id === stepId);
  if (idx < 0) {
    view.innerHTML = pageHead({ title: 'Marka kurulumu' }) + emptyState({ icon: 'wand', title: 'Bu adım şu an gerekmiyor', text: 'Verdiğin cevaplara göre bu adım açılmadı (ör. maskot yok dediysen maskot adımı yoktur).', action: `<a class="btn btn-sm" href="${base}/kurulum">Kuruluma dön</a>`, card: true });
    return;
  }
  const st = d.steps[idx];
  const prev = d.steps[idx - 1];
  const next = d.steps[idx + 1];
  view.innerHTML = `${pageHead({ title: edit ? `Marka kimliği · ${st.label}` : 'Marka kurulumu', desc: edit ? 'Bölümü düzenle; kaydedince Marka dosyasına dönersin.' : `${esc(brand.name)} kimliğini adım adım kuruyoruz. Her adım kaydedilir; yarıda bırakırsan kaldığın yerden devam edersin.` })}
    ${edit ? '' : `<ol class="setup-steps" aria-label="Kurulum adımları">${d.steps.map((s, i) => `<li class="${s.id === st.id ? 'current' : s.done ? 'done' : ''}"><a href="${base}/kurulum/${s.id}"${s.id === st.id ? ' aria-current="step"' : ''}><span class="ss-num">${s.done && s.id !== st.id ? '✓' : i + 1}</span><span class="ss-label">${esc(s.label)}</span></a></li>`).join('')}</ol>
      <p class="xsmall muted mb-4">Adım ${idx + 1} / ${d.steps.length}${d.setup.channels.length || d.setup.hasMascot != null ? '' : ' · Sonraki adımlar cevaplarına göre eklenir'}</p>`}
    <form class="card setup-card" id="su-form" novalidate>
      <h2>${esc(st.title)}</h2>
      <p class="small muted mb-4">${INTRO[st.id]}</p>
      ${stepForm(st.id, d)}
      ${st.needs.length ? `<p class="xsmall muted mt-3" id="su-needs">Henüz eksik: ${esc(st.needs.join(', '))}</p>` : ''}
      <div class="setup-foot">
        ${edit ? `<a class="btn" href="${base}">Vazgeç</a>` : prev ? `<a class="btn" href="${base}/kurulum/${prev.id}">← Geri</a>` : '<span></span>'}
        <span class="spacer"></span>
        ${edit ? '' : `<a class="btn btn-ghost" href="${next ? `${base}/kurulum/${next.id}` : base}">${next ? 'Şimdilik atla' : 'Sonra tamamla'}</a>`}
        <button class="btn btn-primary" type="submit">${icon('check')}${edit ? 'Kaydet' : next || d.steps.some(s => !s.done && s.id !== st.id) ? 'Kaydet ve devam et' : 'Kaydet ve bitir'}</button>
      </div>
    </form>`;
  const form = view.querySelector('#su-form');
  // Renk seçici ile HEX kutusu birlikte
  form.addEventListener('input', e => {
    const c = e.target.dataset.colorFor;
    if (c) form.querySelector('#' + c).value = e.target.value;
  });
  // Yüklemeler hemen kütüphaneye gider (logo, maskot pozu)
  form.addEventListener('change', async e => {
    const cat = e.target.dataset.upload;
    if (!cat || !e.target.files.length) return;
    let ok = 0;
    for (const f of e.target.files) {
      try { await api.uploadAsset(brand.id, f, cat, f.name.replace(/\.[^.]+$/, '').slice(0, 80)); ok++; } catch (err) { toast(`${f.name}: ${err.message}`, 'error'); }
    }
    if (!ok) return;
    toast(cat === 'logo' ? 'Logo yüklendi.' : `${ok} poz yüklendi.`, 'success');
    // Yazılanlar kaybolmasın: yalnız yükleme alanı yenilenir
    d = await api.brandSetup(brand.id);
    const wrap = e.target.closest('.field');
    const fresh = document.createElement('div');
    fresh.innerHTML = stepForm(st.id, d);
    const same = [...fresh.querySelectorAll('.field')].find(f => f.querySelector(`[data-upload="${cat}"]`));
    if (wrap && same) wrap.replaceWith(same);
  });
  // 9.5: metinden AI ile ön doldurma (yalnız boş alanlar; kullanıcı Kaydet'e basarak onaylar)
  form.addEventListener('click', e => {
    if (!e.target.closest('[data-ai-prefill]')) return;
    openModal({
      title: 'Metinden doldur', submitLabel: 'Taslağı çıkar',
      body: `<div class="field"><label for="ap-text">Web sitesi "Hakkımızda" yazısı, Instagram biyografisi ya da tanıtım metni *</label><textarea class="textarea" id="ap-text" name="text" rows="8" maxlength="20000" required></textarea></div><p class="xsmall muted mt-2">Metinde olmayan bilgi uydurulmaz; o alanlar boş kalır.</p>`,
      onSubmit: async (fd, mf) => {
        const r = await busy(mf.querySelector('[type=submit]'), () => api.identityDraft({ text: fd.get('text'), brandId: brand.id }));
        const filled = [];
        for (const k of ['sector', 'description', 'slogan']) {
          const el = form.querySelector(`[name="${k}"]`);
          if (el && !el.value.trim() && r.profile[k]) { el.value = r.profile[k]; el.classList.add('ai-filled'); el.dispatchEvent(new Event('input', { bubbles: true })); filled.push(k); }
        }
        // Sonraki adımların boş alanları doğrudan kaydedilir
        const later = Object.fromEntries(['audience', 'goals', 'character', 'tone', 'competitors'].filter(k => r.profile[k] && !d.brand[k]).map(k => [k, r.profile[k]]));
        if (Object.keys(later).length) { await api.updateBrand(brand.id, later); Object.assign(d.brand, later); }
        toast(filled.length || Object.keys(later).length ? `${filled.length} alan bu sayfada dolduruldu (kontrol edip kaydet)${Object.keys(later).length ? `, ${Object.keys(later).length} alan sonraki adımlara kaydedildi` : ''}.` : `Doldurulacak yeni bilgi bulunamadı.${r.notes ? ' ' + r.notes : ''}`, 'success', 7000);
      }
    });
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (st.id === 'temel' && !form.querySelector('[name="name"]').value.trim()) { form.querySelector('[name="name"]').focus(); return toast('Marka adını yaz.', 'error'); }
    try {
      const body = readStep(st.id, form);
      const res = await busy(e.submitter, () => api.saveSetupStep(brand.id, st.id, body));
      if (['temel', 'gorsel'].includes(st.id)) await refreshBrands();
      if (edit) { toast(`${st.label} kaydedildi.`, 'success'); return go(base); }
      // Cevaplar adımları değiştirmiş olabilir (ör. maskot var): sıradaki adım yeni listeden
      const i = res.steps.findIndex(s => s.id === st.id);
      // Önce ileride kalan, sonra geride atlanmış adım; hepsi tamamsa Marka dosyası
      const after = res.steps.slice(i + 1).find(s => !s.done) || res.steps.find(s => !s.done);
      if (after) return go(`${base}/kurulum/${after.id}`);
      toast(res.complete ? 'Kurulum tamamlandı. Marka kimliği tek yerde hazır.' : 'Kaydedildi. Atladığın adımlar Marka dosyasında görünür.', 'success', 5000);
      go(base);
    } catch (err) { toast(err.message, 'error'); }
  });
}
