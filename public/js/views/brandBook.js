// Marka kılavuzu: müşteriye sunulacak tek belge. Marka kimliğinde, kurulumda, karakter kitabında ve üretimlerde
// biriken her şey (ad, logo, renk, font, ses ve dil, maskot, sosyal medya planı, içerik başlıkları, tasarım ve Reels
// örnekleri, sabit metinler) bir araya gelir. Tarayıcıdan "PDF olarak kaydet" ile indirilir ya da metin (.md) olarak alınır;
// sistem gösterilmeden sunulabilir. Yeni veri üretmez, yapay zekâ çağırmaz: yalnız kayıtlı olanı düzenler.
import { api } from '../api.js';
import { esc, icon, toast, loadFonts } from '../ui.js';
import { state } from '../app.js';
import { prepareSlide, slideBlob } from '../postCanvas.js';
import { downloadBlob, safeName } from '../titlePng.js';
import { brandNotes, NOTE_KINDS } from './brandNotes.js';

// Kanal başına önerilen içerik biçimi ve yaklaşım (markanın seçtiği içerik türleriyle kesişir)
const CHANNEL_GUIDE = {
  instagram: { kinds: ['carousel', 'post', 'reels', 'story'], how: 'Kaydırmalı eğitici postlar (5-7 sayfa: kanca, gelişme, kapanış), 20-40 saniyelik Reels, günlük hikâyeler. Açıklamalar uzun ve değer katar; 5 alakalı hashtag.' },
  tiktok: { kinds: ['reels'], how: 'Dikey, ilk 1-2 saniyede kanca atan, 15-40 saniyelik kısa videolar; trend sesler ve hızlı kurgu.' },
  youtube: { kinds: ['video', 'reels'], how: 'Uzun anlatımlı videolar ve Shorts; okunaklı, merak uyandıran kapak görselleri ve açıklayıcı başlıklar.' },
  linkedin: { kinds: ['post', 'carousel', 'yazi'], how: 'Uzmanlığı gösteren, bilgi ve deneyim paylaşan postlar ve PDF carousel; daha resmî ama samimi bir dil.' },
  facebook: { kinds: ['post', 'video', 'reels'], how: 'Topluluk odaklı paylaşımlar, duyurular ve kısa videolar.' },
  x: { kinds: ['post', 'yazi'], how: 'Kısa, güncel ve tartışma başlatan paylaşımlar; zincir (thread) anlatımlar.' },
  blog: { kinds: ['yazi'], how: 'Arama motoru için uzun, bilgi veren yazılar; sosyal medyadaki içeriklerin ayrıntılı hâli.' }
};

// Markanın seçtiği içerik türü → takvimdeki içerik türleri ve tasarım (post) türleri
const KIND_MAP = { post: { content: ['post', 'reklam', 'grafik'], post: ['post', 'reklam', 'grafik'] }, carousel: { content: ['carousel'], post: ['carousel'] }, story: { content: ['story'], post: ['story'] }, reels: { content: ['reels'], post: ['kapak'] }, video: { content: ['youtube'], post: ['youtube'] }, yazi: { content: [], post: [] } };
const dateTr = iso => (iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const clip = (t, n) => { const v = String(t || '').replace(/\s+/g, ' ').trim(); return v.length > n ? v.slice(0, n - 1).trimEnd() + '…' : v; };

const has = v => (Array.isArray(v) ? v.length > 0 : Boolean(v && String(v).trim()));
const list = v => (Array.isArray(v) ? v : String(v || '').split(/\n|,(?=\s)/)).map(x => String(x).trim()).filter(Boolean);
const optLabel = (questions, key, v) => {
  const q = (questions || []).find(x => x.key === key);
  if (!q || v == null || v === '') return '';
  return Array.isArray(v) ? v.map(x => q.options[x] || x).join(', ') : (q.options ? q.options[v] || v : v);
};

async function collect(brand) {
  const [d, posts, prompts, ideas, contents, notes, profile] = await Promise.all([
    api.brandSetup(brand.id),
    api.posts(brand.id).then(r => r.posts).catch(() => []),
    api.prompts(brand.id, { kind: 'reels' }).then(r => r.prompts).catch(() => []),
    api.ideas(brand.id, '?status=hepsi').then(r => r.ideas).catch(() => []),
    api.contents({ brandId: brand.id, limit: 300 }).then(r => r.contents).catch(() => []),
    brandNotes(brand.id).catch(() => ({ yonetici: [], 'marka-sahibi': [] })),
    api.settings().then(r => r.profile || {}).catch(() => ({}))
  ]);
  // Çalışılan içerik: önce yayınlanan/tamamlanan, sonra en yeni tarihli
  const worked = contents.filter(c => c.scheduledAt || c.caption).sort((a, b) => (Number(b.done) - Number(a.done)) || String(b.scheduledAt || b.updatedAt).localeCompare(String(a.scheduledAt || a.updatedAt)));
  return { d, posts: posts.filter(p => !p.archived && p.data && (p.data.slides || []).length).slice(0, 24), reels: prompts.filter(p => p.plan).slice(0, 3), ideas, contents: worked, notes, profile };
}

// İçerik başlıkları (sütunlar): fikir havuzundaki kategoriler, her birinden örnek başlıklar
function pillarsOf(ideas) {
  const by = new Map();
  for (const i of ideas) { if (!by.has(i.categoryLabel)) by.set(i.categoryLabel, []); by.get(i.categoryLabel).push(i); }
  return [...by.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5)
    .map(([name, xs]) => ({ name, count: xs.length, examples: xs.sort((a, b) => (b.favorite - a.favorite)).slice(0, 3).map(x => x.title) }));
}

function channelsOf(d) {
  const kinds = d.setup.contentKinds || [];
  return (d.setup.channels || []).map(ch => {
    const g = CHANNEL_GUIDE[ch] || { kinds: [], how: '' };
    const k = g.kinds.filter(x => kinds.includes(x));
    const ids = k.length ? k : g.kinds;
    return { id: ch, name: d.options.channels[ch] || ch, ids, kinds: ids.map(x => d.options.contentKinds[x] || x), how: g.how };
  });
}

export async function renderBrandBook(view, brand) {
  view.innerHTML = '<p class="muted">Marka kılavuzu hazırlanıyor…</p>';
  let data;
  try { data = await collect(brand); } catch (err) { view.innerHTML = `<div class="notice"><div>${esc(err.message)}</div></div>`; return; }
  const { d, posts, reels, ideas, contents, notes, profile } = data;
  const b = d.brand;
  const idt = d.identity || {};
  const book = d.book || {};
  const mem = d.memory || { banned: [], preferred: [], facts: [] };
  const q = d.questions || [];
  const colors = [['Ana renk', b.colors.primary], ...(b.colors.secondary || []).map((c, i) => [`İkincil renk ${i + 1}`, c]), ...(b.colors.backgrounds || []).map((c, i) => [`Zemin ${i + 1}`, c]), ['Başlık yazısı', b.colors.heading], ['Gövde yazısı', b.colors.body]].filter(([, c]) => has(c));
  const channels = channelsOf(d);
  const pillars = pillarsOf(ideas);
  const pools = b.textPools || { cta: [], closing: [], speech: [] };
  const facts = mem.facts || [];
  const fact = cat => facts.filter(f => f.category === cat);
  const hasMascot = d.setup.hasMascot || has(idt.mascotName) || has(book.name);
  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  // Kanal başına örnek tasarımlar (en fazla 3) ve çalışılan içerikler (en fazla 4)
  const usedPosts = new Set();
  const examples = channels.map(c => {
    const pk = c.ids.flatMap(x => (KIND_MAP[x] || {}).post || []);
    const ck = c.ids.flatMap(x => (KIND_MAP[x] || {}).content || []);
    const ps = posts.filter(p => pk.includes(p.kind)).slice(0, 3);
    ps.forEach(p => usedPosts.add(p));
    return { name: c.name, posts: ps, contents: contents.filter(x => ck.includes(x.type)).slice(0, 4) };
  }).filter(x => x.posts.length || x.contents.length);
  const shownPosts = channels.length ? [...usedPosts] : posts.slice(0, 6);
  const postIdx = p => posts.indexOf(p);
  const thumb = p => `<figure><img data-bb-post="${postIdx(p)}" alt="${esc(p.title)}"><figcaption><b>${esc(p.title)}</b>${esc(p.kindLabel)} · ${(p.data.slides || []).length} sayfa</figcaption></figure>`;
  const contentItem = c => `<li><div class="bb-ci-head"><b>${esc(c.title)}</b><span>${esc(c.typeLabel)}${c.scheduledAt ? ' · ' + esc(dateTr(c.scheduledAt)) : ''} · ${esc(c.statusLabel)}</span></div>${c.caption ? `<p>${esc(clip(c.caption, 220))}</p>` : ''}${c.hashtags.length ? `<p class="bb-tags">${esc(c.hashtags.slice(0, 5).join(' '))}</p>` : ''}</li>`;
  const noteCount = Object.values(notes).reduce((a, x) => a + x.length, 0);
  const hashtags = [...new Set(reels.flatMap(r => (r.plan.hashtags || [])))].slice(0, 12);

  const row = (k, v) => (has(v) ? `<div class="bb-row"><dt>${esc(k)}</dt><dd>${Array.isArray(v) ? esc(v.join(', ')) : esc(v)}</dd></div>` : '');
  const sec = (n, title, inner) => (inner.trim() ? `<section class="bb-sec"><h2><span>${String(n).padStart(2, '0')}</span>${esc(title)}</h2>${inner}</section>` : '');
  let n = 0;
  const S = (title, inner) => { const html = sec(n + 1, title, inner); if (html) n++; return html; };

  const doc = `
    <article class="bb-doc" id="bb-doc" style="--bb-brand:${esc(b.colors.primary || '#5b55e6')};--bb-head:'${esc(b.fonts.heading || 'inherit')}';--bb-body:'${esc(b.fonts.body || 'inherit')}'">
      <header class="bb-cover">
        <div class="bb-maker"><img src="/img/logo.svg" alt="" class="bb-k-logo"><div><b>KREATİFHANE</b><span>Kreatif Yönetim Platformu</span></div></div>
        ${d.logo ? `<img class="bb-logo" src="${esc(d.logo.url)}" alt="${esc(b.name)} logosu">` : ''}
        <p class="bb-kicker">Marka kimliği kılavuzu</p>
        <h1>${esc(b.name)}</h1>
        ${has(b.slogan) ? `<p class="bb-slogan">“${esc(b.slogan)}”</p>` : ''}
        ${has(b.sector) ? `<p class="bb-sector">${esc(b.sector)}</p>` : ''}
        <div class="bb-cover-foot">
          <dl class="bb-prep">${has(profile.managerName) ? `<div><dt>Hazırlayan</dt><dd>${esc(profile.managerName)}${has(profile.managerTitle) ? `<small>${esc(profile.managerTitle)}</small>` : ''}</dd></div>` : ''}<div><dt>Tarih</dt><dd class="bb-date">${esc(today)}</dd></div></dl>
        </div>
      </header>
      ${S('Marka', `<dl>${row('Marka adı', b.name)}${row('Sektör', b.sector)}${row('Slogan', b.slogan)}</dl>
        ${has(b.description) ? `<p class="bb-lead">${esc(b.description)}</p>` : ''}
        ${fact('hikaye').map(f => `<h3>${esc(f.title)}</h3><p>${esc(f.content)}</p>`).join('')}
        ${fact('urun').length ? `<h3>Ürün ve hizmetler</h3>${fact('urun').map(f => `<p><b>${esc(f.title)}:</b> ${esc(f.content)}</p>`).join('')}` : ''}`)}
      ${S('Kitle ve hedefler', `<dl>${row('Hedef kitle', b.audience)}${row('İçerik hedefleri', b.goals)}${row('Aylık içerik hedefi', b.monthlyGoal ? `${b.monthlyGoal} içerik` : '')}${row('Rakipler ve referans markalar', b.competitors)}</dl>`)}
      ${S('Ses ve dil', `<dl>${row('Marka karakteri', b.character)}${row('İletişim dili', b.tone)}</dl>
        ${has(mem.preferred) ? `<h3>Kullandığımız ifadeler</h3><ul class="bb-chips">${mem.preferred.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${has(mem.banned) ? `<h3>Kullanmadığımız kelimeler</h3><ul class="bb-chips bb-no">${mem.banned.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`)}
      ${S('Görsel kimlik', `${d.logo ? `<h3>Logo</h3><div class="bb-logo-box"><img src="${esc(d.logo.url)}" alt="${esc(b.name)} logosu"><div class="bb-logo-dark"><img src="${esc(d.logo.url)}" alt=""></div></div>` : ''}
        ${colors.length ? `<h3>Renk paleti</h3><div class="bb-colors">${colors.map(([k, c]) => `<figure><span style="background:${esc(c)}"></span><figcaption><b>${esc(k)}</b>${esc(String(c).toUpperCase())}</figcaption></figure>`).join('')}</div>` : ''}
        ${has(b.fonts.heading) || has(b.fonts.body) ? `<h3>Yazı tipleri</h3><div class="bb-fonts">${has(b.fonts.heading) ? `<div><small>Başlık · ${esc(b.fonts.heading)}</small><p style="font-family:'${esc(b.fonts.heading)}';font-weight:800;font-size:28px">Aa Bb Çç Ğğ Şş 123</p></div>` : ''}${has(b.fonts.body) ? `<div><small>Gövde · ${esc(b.fonts.body)}</small><p style="font-family:'${esc(b.fonts.body)}';font-size:16px">Markanın sesi her paylaşımda aynı kalır. Okunaklı, sade ve tutarlı.</p></div>` : ''}</div>` : ''}
        <dl>${row('Görsel stil', optLabel(q, 'visualStyle', idt.visualStyle))}${row('Işık', optLabel(q, 'lighting', idt.lighting))}${row('Kamera dili', optLabel(q, 'camera', idt.camera))}${row('His', optLabel(q, 'mood', idt.mood))}${row('Mekânlar', idt.places || [])}${row('Görsellerdeki insanlar', idt.people)}${row('Görsellerde asla olmasın', idt.avoid || [])}${row('Ürün fotoğrafı', optLabel(q, 'productStyle', idt.productStyle))}${row('YouTube kapağı', optLabel(q, 'thumbStyle', idt.thumbStyle))}</dl>`)}
      ${hasMascot ? S('Maskot', `<dl>${row('Adı', idt.mascotName || book.name)}${row('Görünüş', idt.mascotLook)}${row('Kişilik', book.personality)}${row('Kıyafet', book.outfit)}${row('Nasıl konuşur', idt.mascotVoice)}${row('Nasıl hareket eder', idt.mascotMoves)}${row('Asla yapmaz', idt.mascotNever || (book.never || []))}</dl>
        ${has(book.speech) ? `<h3>Konuşma örnekleri</h3><ul class="bb-quotes">${book.speech.map(x => `<li>“${esc(x)}”</li>`).join('')}</ul>` : ''}
        ${d.mascots.length ? `<div class="bb-poses">${d.mascots.map(a => `<figure><img src="${esc(a.url)}" alt="${esc(a.label || 'Maskot pozu')}"><figcaption>${esc(a.label || '')}</figcaption></figure>`).join('')}</div>` : ''}`) : ''}
      ${S('Sosyal medya planı', `${channels.length ? `<div class="bb-channels">${channels.map(c => `<div class="bb-channel"><h3>${esc(c.name)}</h3><p class="bb-kinds">${esc(c.kinds.join(' · '))}</p><p>${esc(c.how)}</p></div>`).join('')}</div>` : '<p class="muted">Yönetilecek kanallar henüz seçilmedi (Marka kimliği → Kanallar ve içerikler).</p>'}
        ${pillars.length ? `<h3>İçerik başlıkları</h3><div class="bb-pillars">${pillars.map(p => `<div><b>${esc(p.name)}</b><ul>${p.examples.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>` : ''}
        ${hashtags.length ? `<h3>Örnek hashtag'ler</h3><ul class="bb-chips">${hashtags.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${examples.map(x => `<div class="bb-example"><h3>${esc(x.name)} · örnek çalışmalar</h3>
          ${x.posts.length ? `<div class="bb-posts">${x.posts.map(thumb).join('')}</div>` : ''}
          ${x.contents.length ? `<ul class="bb-contents">${x.contents.map(contentItem).join('')}</ul>` : ''}</div>`).join('')}`)}
      ${!channels.length && shownPosts.length ? S('Tasarım örnekleri', `<div class="bb-posts">${shownPosts.map(thumb).join('')}</div>`) : ''}
      ${reels.length ? S('Reels senaryo örnekleri', reels.map(r => `<div class="bb-reels"><h3>${esc(r.title)}</h3>
          ${has(r.plan.punchline) ? `<p class="bb-punch">Asıl espri: ${esc(r.plan.punchline)}</p>` : ''}
          <ol>${(r.plan.scenes || []).map((sc, i) => `<li><b>Sahne ${i + 1} · ${esc(String(sc.duration))} sn</b>${sc.line ? ` — “${esc(sc.line)}”` : ''}</li>`).join('')}</ol></div>`).join('')) : ''}
      ${has(pools.cta) || has(pools.closing) || has(pools.speech) ? S('Sabit metinler', `<dl>${row('Çağrı (CTA)', pools.cta)}${row('Kapanış cümleleri', pools.closing)}${row('Maskot konuşmaları', pools.speech)}</dl>`) : ''}
      ${fact('iletisim').length || fact('saat').length ? S('İletişim', [...fact('iletisim'), ...fact('saat')].map(f => `<p><b>${esc(f.title)}:</b> ${esc(f.content)}</p>`).join('')) : ''}
      ${noteCount ? `<div class="bb-notes-sec">${S('Yönetici notları', Object.keys(NOTE_KINDS).filter(k => notes[k].length).map(k => `<h3>${esc(NOTE_KINDS[k].label)}</h3><ul class="bb-notes">${notes[k].map(nt => `<li class="${nt.pinned ? 'done' : ''}"><span class="bb-nd">${esc(dateTr(nt.createdAt))}</span>${nt.pinned ? '<b class="bb-ok">✓ Yapıldı</b> ' : ''}${esc(nt.body)}</li>`).join('')}</ul>`).join(''))}</div>` : ''}
      <footer class="bb-foot">${esc(b.name)} · Marka kimliği kılavuzu · ${esc(today)}</footer>
    </article>`;

  view.innerHTML = `<div class="bb-bar no-print">
      <a class="btn btn-sm btn-ghost" href="#/m/${esc(brand.id)}/kimlik">${icon('back')}Marka kimliği</a>
      <span class="grow small muted">Müşteriye sunulacak belge. Eksik bölümler Marka kimliğinden doldurulunca burada da görünür.</span>
      ${noteCount ? '<label class="check small"><input type="checkbox" data-bb-notes checked> Yönetici notları belgede</label>' : ''}
      <button type="button" class="btn btn-sm" data-bb-md>${icon('download')}Metin olarak indir</button>
      <button type="button" class="btn btn-sm btn-primary" data-bb-pdf>${icon('download')}PDF olarak kaydet</button>
    </div>${doc}`;

  // Markanın yazı tipleri yüklenir (font örnekleri ve başlıklar markanın fontuyla görünsün)
  try { loadFonts([b.fonts.heading, b.fonts.body].filter(Boolean)); } catch { /* yedek yazı tipi */ }
  // Tasarım örnekleri: her tasarımın ilk sayfası görsele çizilir
  const meta = state.meta.posts;
  shownPosts.forEach(async p => {
    try {
      const s = p.data.slides[0];
      await prepareSlide(s);
      const blob = await slideBlob(s, meta.formats[p.data.format]);
      if (blob) { const url = URL.createObjectURL(blob); view.querySelectorAll(`[data-bb-post="${postIdx(p)}"]`).forEach(img => { img.src = url; }); }
    } catch { /* önizleme çizilemezse boş kalır */ }
  });
  // Yönetici notları iç kullanım içindir: kapatılırsa PDF ve metin çıktısına girmez
  let withNotes = true;
  view.onchange = e => { if (e.target.matches('[data-bb-notes]')) { withNotes = e.target.checked; view.querySelector('#bb-doc').classList.toggle('bb-no-notes', !withNotes); } };

  view.onclick = e => {
    if (e.target.closest('[data-bb-pdf]')) {
      toast('Yazdırma penceresinde hedef olarak "PDF olarak kaydet"i seç.', 'info', 5000);
      document.body.classList.add('bb-print');
      window.addEventListener('afterprint', () => document.body.classList.remove('bb-print'), { once: true });
      setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('bb-print'), 1000); }, 300);
      return;
    }
    if (e.target.closest('[data-bb-md]')) downloadBlob(new Blob([toMarkdown(data, { channels, pillars, colors, hashtags, today, examples, shownPosts, withNotes })], { type: 'text/markdown;charset=utf-8' }), `${safeName(b.name)}_marka_kilavuzu.md`);
  };
}

// Metin hâli (.md): Word, Google Dokümanlar ya da Notion'a yapıştırılabilir
function toMarkdown({ d, reels, notes, profile }, { channels, pillars, colors, hashtags, today, examples, shownPosts, withNotes }) {
  const b = d.brand; const idt = d.identity || {}; const book = d.book || {}; const mem = d.memory || {}; const q = d.questions || [];
  const pools = b.textPools || {};
  const L = [`# ${b.name} — Marka kimliği kılavuzu`, `_${[has(profile.managerName) ? `Hazırlayan: ${profile.managerName}${has(profile.managerTitle) ? ` (${profile.managerTitle})` : ''}` : '', today, 'KREATİFHANE'].filter(Boolean).join(' · ')}_`, ''];
  const kv = (k, v) => { if (has(v)) L.push(`- **${k}:** ${Array.isArray(v) ? v.join(', ') : v}`); };
  const h = t => L.push('', `## ${t}`, '');
  h('Marka'); kv('Marka adı', b.name); kv('Sektör', b.sector); kv('Slogan', b.slogan); if (has(b.description)) L.push('', b.description);
  (mem.facts || []).filter(f => ['hikaye', 'urun'].includes(f.category)).forEach(f => L.push('', `**${f.title}:** ${f.content}`));
  h('Kitle ve hedefler'); kv('Hedef kitle', b.audience); kv('İçerik hedefleri', b.goals); kv('Rakipler ve referans markalar', b.competitors);
  h('Ses ve dil'); kv('Marka karakteri', b.character); kv('İletişim dili', b.tone); kv('Kullandığımız ifadeler', mem.preferred || []); kv('Kullanmadığımız kelimeler', mem.banned || []);
  h('Görsel kimlik'); colors.forEach(([k, c]) => kv(k, String(c).toUpperCase())); kv('Başlık yazı tipi', b.fonts.heading); kv('Gövde yazı tipi', b.fonts.body);
  kv('Görsel stil', optLabel(q, 'visualStyle', idt.visualStyle)); kv('Işık', optLabel(q, 'lighting', idt.lighting)); kv('His', optLabel(q, 'mood', idt.mood)); kv('Görsellerde asla olmasın', idt.avoid || []);
  if (d.setup.hasMascot || has(idt.mascotName)) { h('Maskot'); kv('Adı', idt.mascotName || book.name); kv('Görünüş', idt.mascotLook); kv('Kişilik', book.personality); kv('Nasıl konuşur', idt.mascotVoice); kv('Asla yapmaz', idt.mascotNever || (book.never || [])); (book.speech || []).forEach(x => L.push(`> ${x}`)); }
  h('Sosyal medya planı'); channels.forEach(c => { L.push(`### ${c.name}`, `${c.kinds.join(' · ')}`, '', c.how, ''); });
  if (pillars.length) { L.push('### İçerik başlıkları'); pillars.forEach(p => { L.push(`- **${p.name}:** ${p.examples.join('; ')}`); }); }
  if (hashtags.length) L.push('', `**Örnek hashtag'ler:** ${hashtags.join(' ')}`);
  examples.forEach(x => {
    L.push('', `### ${x.name} · örnek çalışmalar`);
    x.posts.forEach(p => L.push(`- Tasarım: ${p.title} (${p.kindLabel}, ${(p.data.slides || []).length} sayfa)`));
    x.contents.forEach(c => L.push(`- İçerik: **${c.title}** (${c.typeLabel}${c.scheduledAt ? ', ' + dateTr(c.scheduledAt) : ''}, ${c.statusLabel})${c.caption ? `\n  ${clip(c.caption, 220)}` : ''}`));
  });
  if (!channels.length && shownPosts.length) { h('Tasarım örnekleri'); shownPosts.forEach(p => L.push(`- ${p.title} (${p.kindLabel}, ${(p.data.slides || []).length} sayfa)`)); }
  if (reels.length) { h('Reels senaryo örnekleri'); reels.forEach(r => { L.push(`### ${r.title}`); if (r.plan.punchline) L.push(`Asıl espri: ${r.plan.punchline}`); (r.plan.scenes || []).forEach((sc, i) => L.push(`${i + 1}. Sahne (${sc.duration} sn)${sc.line ? `: "${sc.line}"` : ''}`)); L.push(''); }); }
  if (has(pools.cta) || has(pools.closing) || has(pools.speech)) { h('Sabit metinler'); kv('Çağrı (CTA)', pools.cta || []); kv('Kapanış cümleleri', pools.closing || []); kv('Maskot konuşmaları', pools.speech || []); }
  if (withNotes && Object.values(notes).some(x => x.length)) {
    h('Yönetici notları');
    Object.keys(NOTE_KINDS).filter(k => notes[k].length).forEach(k => { L.push(`### ${NOTE_KINDS[k].label}`); notes[k].forEach(nt => L.push(`- [${nt.pinned ? 'x' : ' '}] ${dateTr(nt.createdAt)}: ${nt.body.replace(/\n+/g, ' ')}`)); L.push(''); });
  }
  return L.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
