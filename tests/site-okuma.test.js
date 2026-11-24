// Web sitesinden marka bilgisi: ana sayfa + önemli alt sayfalar okunur; iletişim kartı hemen, profil, bilgi kartları ve
// siteye dayanan ilk içerik fikirleri arka planda eklenir (fikir havuzu boş başlamaz). Yerel ağ adresleri okunmaz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer, fakeProvider } from './helpers.js';
import { createSiteReader, pageText } from '../server/services/siteReader.js';

const PAGES = {
  '/': `<html><head><title>Kahve Durağı | Ana sayfa</title><meta name="description" content="Kampüsün yanında nitelikli kahve"><meta name="theme-color" content="#7A4B2A"><script>var gizli = "betik";</script><style>.x{}</style></head>
    <body><nav><a href="/hakkimizda">Hakkımızda</a> <a href="/menu">Menü</a> <a href="/iletisim">İletişim</a> <a href="https://instagram.com/kahveduragi">Instagram</a> <a href="https://baska.com/x">Dış</a> <a href="/broşür.pdf">PDF</a></nav>
    <h1>Her yudum bir mola</h1><p>Öğrencilere &amp; çalışanlara özel indirim.</p></body></html>`,
  '/hakkimizda': '<html><head><title>Hakkımızda</title></head><body><p>2015 yılında iki arkadaş tarafından kuruldu.</p></body></html>',
  '/menu': '<html><head><title>Menü</title></head><body><ul><li>Filtre kahve 60 TL</li><li>Latte 80 TL</li></ul></body></html>',
  '/iletisim': '<html><head><title>İletişim</title></head><body><a href="tel:+90 212 555 00 00">Ara</a> <a href="mailto:merhaba@kahveduragi.com">E-posta</a><p>Kadıköy, İstanbul</p></body></html>'
};

async function site() {
  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/eski') { res.writeHead(301, { Location: '/' }); return res.end(); }
    if (!PAGES[p]) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGES[p]);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise(r => srv.close(r)) };
}

test('Site okuyucu: görünen metin, alt sayfalar, iletişim ve sosyal medya; yerel ağ adresleri reddedilir', async () => {
  assert.equal(pageText('<p>a&amp;b</p><script>x()</script><p>a&amp;b</p><p>cc</p>'), 'a&b\ncc');
  const s = await site();
  try {
    const r = await createSiteReader({ allowPrivate: true }).read(s.url + '/eski');
    assert.equal(r.title, 'Kahve Durağı | Ana sayfa');
    assert.equal(r.themeColor, '#7a4b2a');
    assert.deepEqual(r.pages.map(p => p.title), ['Kahve Durağı | Ana sayfa', 'Hakkımızda', 'Menü', 'İletişim']);
    assert.match(r.text, /Öğrencilere & çalışanlara/);
    assert.match(r.text, /Latte 80 TL/);
    assert.doesNotMatch(r.text, /gizli/);
    assert.deepEqual(r.contacts.phones, ['+902125550000']);
    assert.deepEqual(r.contacts.emails, ['merhaba@kahveduragi.com']);
    assert.equal(r.contacts.socials.instagram, 'https://instagram.com/kahveduragi');
    const strict = createSiteReader();
    await assert.rejects(strict.read(s.url), /Yerel ağ/);
    await assert.rejects(strict.read('http://localhost:80'), /Yerel ağ/);
    await assert.rejects(createSiteReader({ lookup: async () => [{ address: '10.0.0.5' }] }).read('https://ic-ag.example'), /Yerel ağ/);
    await assert.rejects(strict.read('ftp://ornek.com'), /http/);
  } finally { await s.close(); }
});

test('Kurulumda web sitesi: iletişim kartı ve renk hemen; profil, bilgi kartları ve fikirler arka planda (havuz dolu başlar)', async () => {
  const s = await site();
  const provider = fakeProvider([p => (/MARKA KİMLİĞİ ÇIKARMA/.test(p)
    ? { profile: { sector: 'Kafe', audience: 'Üniversite öğrencileri' }, colors: {}, fonts: {}, notes: '' }
    : { facts: [{ category: 'urun', title: 'Menü fiyatları', content: 'Filtre kahve 60 TL, latte 80 TL.' }, { category: 'hikaye', title: 'Kuruluş', content: '2015 yılında iki arkadaş kurdu.' }],
      ideas: [{ title: 'Latte nasıl hazırlanır: baristadan 3 adım', format: 'reels', category: 'egitici' }, { title: '2015\'ten bugüne Kahve Durağı', format: 'post', category: 'bilinirlik' }, { title: 'Öğrenci indirimi haftası', format: 'story', category: 'satis' }] })]);
  const srv = await startServer({ aiProvider: provider, siteAllowPrivate: true });
  try {
    const b = (await srv.request('POST', '/api/brands', { name: 'Kahve Durağı' })).data.brand;
    const r = (await srv.request('POST', `/api/brands/${b.id}/onboard/absorb`, { site: s.url })).data;
    assert.ok(r.found.some(f => /Web sitesi okundu: 4 sayfa/.test(f)), r.found.join(' | '));
    assert.ok(r.found.some(f => /İletişim ve sosyal medya/.test(f)));
    const bb = (await srv.request('GET', `/api/brands/${b.id}`)).data.brand;
    assert.equal(bb.colors.primary, '#7a4b2a');
    assert.equal(bb.description, 'Kampüsün yanında nitelikli kahve');
    assert.equal(bb.website, s.url + '/', 'okunan site markaya kaydedilir');
    assert.equal((await srv.request('PATCH', `/api/brands/${b.id}`, { website: 'ftp://x' })).status, 400);
    assert.equal((await srv.request('PATCH', `/api/brands/${b.id}`, { website: 'ornek.com' })).data.brand.website, 'https://ornek.com/');
    await srv.request('PATCH', `/api/brands/${b.id}`, { website: s.url });
    await srv.request('POST', `/api/brands/${b.id}/onboard/finish`, {});
    let st;
    for (let i = 0; i < 100; i++) { st = (await srv.request('GET', `/api/brands/${b.id}/onboard`)).data.state; if (st.ai && st.ai.status !== 'calisiyor') break; await new Promise(x => setTimeout(x, 50)); }
    assert.equal(st.ai.status, 'bitti', JSON.stringify(st.ai));
    const digestCall = provider.calls.find(c => /BİLGİ VE İÇERİK FİKRİ/.test(c.prompt));
    assert.ok(digestCall, 'siteden fikir ve bilgi istendi');
    assert.match(digestCall.prompt, /Latte 80 TL/);
    const ideas = (await srv.request('GET', `/api/brands/${b.id}/ideas`)).data.ideas;
    assert.ok(ideas.some(i => i.title.startsWith('Latte nasıl hazırlanır') && i.format === 'reels' && i.source === 'site'), ideas.map(i => i.title).join(' | '));
    const mem = (await srv.request('GET', `/api/brands/${b.id}/memory`)).data;
    const facts = (mem.memory || mem).facts;
    assert.ok(facts.some(f => f.title === 'Menü fiyatları'));
    assert.match(facts.find(f => f.title === 'İletişim ve sosyal medya').content, /merhaba@kahveduragi\.com[\s\S]*instagram/);
    assert.equal((await srv.request('GET', `/api/brands/${b.id}`)).data.brand.sector, 'Kafe');
    assert.ok(st.ai.found.some(f => /3 içerik fikri/.test(f)), st.ai.found.join(' | '));

    // Post, fikir ve açıklama yazımında kullanılan marka hafızası: site ve siteden gelen bilgiler, sadık kal talimatı
    const sim = provider.calls.length;
    await srv.request('POST', `/api/brands/${b.id}/ideas/${ideas[0].id}/similar`, { count: 1 });
    const memText = provider.calls[sim].prompt;
    assert.match(memText, /Web sitesi: http/);
    assert.match(memText, /sadık kal[\s\S]*Menü fiyatları: Filtre kahve 60 TL/);
    // Sonradan yeniden okuma: iletişim kartı çoğalmaz, güncellenir
    await srv.request('POST', `/api/brands/${b.id}/onboard/site`, { url: s.url });
    const facts2 = (await srv.request('GET', `/api/brands/${b.id}/memory`)).data;
    assert.equal(((facts2.memory || facts2).facts).filter(f => f.title === 'İletişim ve sosyal medya').length, 1);

    // Var olan markaya sonradan; okunamayan site açık hata verir
    assert.equal((await srv.request('POST', `/api/brands/${b.id}/onboard/site`, { url: s.url + '/yok' })).status, 400);
    // Kimliği AI ile doldur: adres verilince site metni okunur
    const d = (await srv.request('POST', '/api/identity-draft', { url: s.url })).data;
    assert.equal(d.site.pages.length, 4);
    assert.match(provider.calls.at(-1).prompt, /2015 yılında iki arkadaş/);
  } finally { await srv.stop(); await s.close(); }
});
