// API testleri: marka kimliği, veri izolasyonu, güvenli dosya yükleme, AI ayarları ve asistan
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider, PNG_1PX } from './helpers.js';

let srv;
let ai;

before(async () => {
  ai = fakeProvider([{ reply: 'Merhaba!', actions: [] }]);
  srv = await startServer({ aiProvider: ai });
});
after(() => srv.stop());

const create = (name, extra = {}) => srv.request('POST', '/api/brands', Object.assign({ name }, extra));

test('marka oluşturma, okuma ve kimlik güncelleme', async () => {
  const res = await create('Kahve Durağı', { sector: 'Kafe', tone: 'Samimi', colors: { primary: '#AA3300', secondary: ['#112233'] }, fonts: { heading: 'Poppins', body: 'Inter' } });
  assert.equal(res.status, 201);
  const b = res.data.brand;
  assert.equal(b.colors.primary, '#aa3300');
  assert.deepEqual(b.colors.secondary, ['#112233']);
  assert.equal(b.fonts.heading, 'Poppins');

  const upd = await srv.request('PATCH', `/api/brands/${b.id}`, { slogan: 'Her yudum bir mola', colors: { primary: '#000000', backgrounds: ['#fafafa'] } });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.brand.slogan, 'Her yudum bir mola');
  assert.equal(upd.data.brand.tone, 'Samimi', 'gönderilmeyen alan silindi');
  assert.equal(upd.data.brand.fonts.body, 'Inter', 'gönderilmeyen font silindi');

  const get = await srv.request('GET', `/api/brands/${b.id}`);
  assert.equal(get.data.brand.colors.backgrounds[0], '#fafafa');
  assert.ok(get.data.completeness.percent > 0 && get.data.completeness.missing.includes('Logo'));

  const settings = await srv.request('GET', '/api/settings');
  assert.equal(settings.data.activeBrandId, b.id, 'yeni marka aktif marka olmadı');
});

test('doğrulama: zorunlu ad, renk biçimi, font listesi', async () => {
  assert.equal((await create('')).status, 400);
  const badColor = await create('X', { colors: { primary: 'kırmızı' } });
  assert.equal(badColor.status, 400);
  assert.match(badColor.data.error.message, /#RRGGBB/);
  assert.equal((await create('X', { fonts: { heading: 'Comic Sans' } })).status, 400);
  assert.equal((await create('X', { name: 'a'.repeat(81) })).status, 400);
});

test('veri izolasyonu: bir markanın fikri, dosyası ve sohbeti diğerinde görünmez', async () => {
  const a = (await create('Marka A')).data.brand;
  const b = (await create('Marka B')).data.brand;
  const idea = (await srv.request('POST', `/api/brands/${a.id}/ideas`, { title: 'A fikri', category: 'egitici' })).data.idea;
  const asset = (await srv.request('POST', `/api/brands/${a.id}/assets?category=logo&label=Ana`, PNG_1PX, { 'Content-Type': 'image/png' })).data.asset;

  assert.equal((await srv.request('GET', `/api/brands/${b.id}/ideas`)).data.ideas.length, 0);
  assert.equal((await srv.request('GET', `/api/brands/${b.id}/assets`)).data.assets.length, 0);
  // Başka markanın kimliğiyle erişim denemeleri
  assert.equal((await srv.request('PATCH', `/api/brands/${b.id}/ideas/${idea.id}`, { favorite: true })).status, 404);
  assert.equal((await srv.request('DELETE', `/api/brands/${b.id}/ideas/${idea.id}`)).status, 404);
  assert.equal((await srv.request('GET', `/api/brands/${b.id}/assets/${asset.id}/file`)).status, 404);
  assert.equal((await srv.request('GET', `/api/brands/${a.id}/assets/${asset.id}/file`)).status, 200);

  await srv.request('POST', `/api/brands/${a.id}/chat`, { message: 'Selam' });
  assert.equal((await srv.request('GET', `/api/brands/${b.id}/chat`)).data.messages.length, 0);
  const msgs = (await srv.request('GET', `/api/brands/${a.id}/chat`)).data.messages;
  assert.deepEqual(msgs.map(m => m.role), ['user', 'assistant'], 'sohbet sırası bozuk');
});

test('dosya yükleme: yalnızca gerçek görseller, boyut sınırı, silme', async () => {
  const brand = (await create('Görsel Marka')).data.brand;
  const url = `/api/brands/${brand.id}/assets`;
  const fakePng = await srv.request('POST', url + '?category=logo', Buffer.from('<svg onload="alert(1)"></svg>'), { 'Content-Type': 'image/png' });
  assert.equal(fakePng.status, 400, 'görsel olmayan dosya kabul edildi');
  assert.equal((await srv.request('POST', url + '?category=yok', PNG_1PX, { 'Content-Type': 'image/png' })).status, 400);
  const big = Buffer.concat([PNG_1PX, Buffer.alloc(10 * 1024 * 1024)]);
  assert.equal((await srv.request('POST', url + '?category=logo', big, { 'Content-Type': 'image/png' })).status, 413);

  const ok = await srv.request('POST', url + '?category=mascot&label=Mutlu', PNG_1PX, { 'Content-Type': 'image/png' });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.asset.mime, 'image/png');
  const file = await srv.request('GET', ok.data.asset.url);
  assert.equal(file.headers.get('content-type'), 'image/png');
  assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(file.data, PNG_1PX);

  const renamed = await srv.request('PATCH', `${url}/${ok.data.asset.id}`, { label: 'Şaşkın' });
  assert.equal(renamed.data.asset.label, 'Şaşkın');
  assert.equal((await srv.request('DELETE', `${url}/${ok.data.asset.id}`)).status, 204);
  assert.equal((await srv.request('GET', ok.data.asset.url)).status, 404);
});

test('marka silinince fikirleri, dosyaları ve sohbeti de silinir', async () => {
  const brand = (await create('Silinecek')).data.brand;
  await srv.request('POST', `/api/brands/${brand.id}/ideas`, { title: 'x', category: 'trend' });
  await srv.request('POST', `/api/brands/${brand.id}/assets?category=logo`, PNG_1PX, { 'Content-Type': 'image/png' });
  assert.equal((await srv.request('DELETE', `/api/brands/${brand.id}`)).status, 204);
  assert.equal((await srv.request('GET', `/api/brands/${brand.id}`)).status, 404);
  assert.equal((await srv.request('GET', `/api/brands/${brand.id}/ideas`)).status, 404);
});

test('fikirler: oluşturma, favori, kategori süzme', async () => {
  const brand = (await create('Fikir Markası')).data.brand;
  const base = `/api/brands/${brand.id}/ideas`;
  assert.equal((await srv.request('POST', base, { title: 'x', category: 'yok' })).status, 400);
  const i1 = (await srv.request('POST', base, { title: 'Bir', category: 'egitici' })).data.idea;
  await srv.request('POST', base, { title: 'İki', category: 'trend' });
  await srv.request('PATCH', `${base}/${i1.id}`, { favorite: true });
  assert.equal((await srv.request('GET', base + '?favorite=1')).data.ideas.length, 1);
  assert.equal((await srv.request('GET', base + '?category=trend')).data.ideas[0].title, 'İki');
});

test('AI anahtarı sunucuda kalır, istemciye hiçbir zaman dönmez', async () => {
  // Gerçek sağlayıcıyla (sahte fetch) ayrı bir sunucu: anahtar saklama ve test çağrısı
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), key: init.headers['x-goog-api-key'] });
    return new Response(JSON.stringify({ models: [{ name: 'models/gemini-flash-latest' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const s = await startServer({ fetchImpl });
  try {
    const empty = await s.request('GET', '/api/settings');
    assert.equal(empty.data.ai.configured, false);
    assert.equal((await s.request('PUT', '/api/settings/ai', { apiKey: 'kısa' })).status, 400);
    const key = 'AIzaTESTKEY_0123456789abcdefWXYZ';
    const put = await s.request('PUT', '/api/settings/ai', { apiKey: key });
    assert.equal(put.data.ai.configured, true);
    assert.equal(put.data.ai.keyHint, '••••WXYZ');
    const all = JSON.stringify((await s.request('GET', '/api/settings')).data);
    assert.ok(!all.includes(key) && !all.includes('TESTKEY'), 'anahtar istemciye sızdı');
    const t = await s.request('POST', '/api/settings/ai/test');
    assert.equal(t.data.result.ok, true);
    assert.equal(seen[0].key, key, 'anahtar başlıkta gönderilmedi');
    assert.ok(!seen[0].url.includes(key), 'anahtar adreste gönderildi');
    assert.equal((await s.request('PUT', '/api/settings/ai', { model: 'olmayan-model' })).status, 400);
    await s.request('DELETE', '/api/settings/ai/key');
    assert.equal((await s.request('GET', '/api/settings')).data.ai.configured, false);
  } finally { await s.stop(); }
});

test('AI bağlı değilse asistan açık bir hata verir, sahte yanıt üretmez', async () => {
  const s = await startServer();
  try {
    const brand = (await s.request('POST', '/api/brands', { name: 'Anahtarsız' })).data.brand;
    const res = await s.request('POST', `/api/brands/${brand.id}/chat`, { message: '5 fikir üret' });
    assert.equal(res.status, 409);
    assert.equal(res.data.error.code, 'AI_NOT_CONFIGURED');
    assert.equal((await s.request('GET', `/api/brands/${brand.id}/chat`)).data.messages.length, 0, 'başarısız istek sohbete yazıldı');
  } finally { await s.stop(); }
});

test('asistan: marka hafızasını kullanır ve fikirleri gerçekten kaydeder', async () => {
  const provider = fakeProvider([{
    reply: '5 fikir kaydettim.',
    actions: [
      { type: 'save_ideas', ideas: [
        { title: 'Barista ipuçları', description: 'Evde köpük', category: 'egitici' },
        { title: 'Kategori uydurma', category: 'olmayan' },
        { title: '', category: 'trend' }
      ] },
      { type: 'delete_everything' }
    ]
  }, { reply: 'Rica ederim!', actions: [] }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const brand = (await s.request('POST', '/api/brands', { name: 'Kahve Durağı', audience: 'Üniversite öğrencileri', tone: 'Esprili' })).data.brand;
    const other = (await s.request('POST', '/api/brands', { name: 'Gizli Marka', description: 'GIZLI_BILGI' })).data.brand;
    await s.request('POST', `/api/brands/${other.id}/ideas`, { title: 'Başka markanın fikri', category: 'trend' });

    const res = await s.request('POST', `/api/brands/${brand.id}/chat`, { message: 'Bu hafta için 5 fikir üret' });
    assert.equal(res.status, 200);
    assert.equal(res.data.assistantMessage.content, '5 fikir kaydettim.');
    const action = res.data.assistantMessage.actions[0];
    assert.equal(action.type, 'save_ideas');
    assert.equal(action.ideas.length, 2, 'geçerli fikirler kaydedilmedi veya boş başlık kabul edildi');
    assert.equal(action.ideas[1].category, 'bilgilendirici', 'geçersiz kategori düzeltilmedi');
    assert.equal(res.data.assistantMessage.actions.length, 1, 'bilinmeyen işlem uygulandı');

    const prompt = provider.calls[0].prompt;
    assert.ok(prompt.includes('Kahve Durağı') && prompt.includes('Üniversite öğrencileri') && prompt.includes('Esprili'), 'marka hafızası gönderilmedi');
    assert.ok(!prompt.includes('GIZLI_BILGI') && !prompt.includes('Başka markanın fikri'), 'başka markanın verisi prompt\'a karıştı');

    const saved = (await s.request('GET', `/api/brands/${brand.id}/ideas`)).data.ideas;
    assert.equal(saved.length, 2);
    assert.ok(saved.every(i => i.source === 'assistant'));

    // İkinci mesajda önceki fikirler "tekrar etme" listesinde ve sohbet geçmişi bağlamda
    await s.request('POST', `/api/brands/${brand.id}/chat`, { message: 'Teşekkürler' });
    const second = provider.calls[1].prompt;
    assert.ok(second.includes('- Barista ipuçları (egitici)') && second.includes('Kullanıcı: Bu hafta için 5 fikir üret'));

    const overview = (await s.request('GET', `/api/brands/${brand.id}/overview`)).data;
    assert.equal(overview.ideaCount, 2);
    assert.ok(overview.activity.some(a => a.type === 'ideas.generated'));

    assert.equal((await s.request('DELETE', `/api/brands/${brand.id}/chat`)).status, 204);
    assert.equal((await s.request('GET', `/api/brands/${brand.id}/chat`)).data.messages.length, 0);
  } finally { await s.stop(); }
});

test('AI hatası sohbete yazılmaz ve anlaşılır mesajla döner', async () => {
  const { HttpError } = await import('../server/lib/http.js');
  const s = await startServer({ aiProvider: fakeProvider([new HttpError(502, 'AI_ERROR', 'Gemini kotası doldu.')]) });
  try {
    const brand = (await s.request('POST', '/api/brands', { name: 'Hata' })).data.brand;
    const res = await s.request('POST', `/api/brands/${brand.id}/chat`, { message: 'selam' });
    assert.equal(res.status, 502);
    assert.equal(res.data.error.message, 'Gemini kotası doldu.');
    assert.equal((await s.request('GET', `/api/brands/${brand.id}/chat`)).data.messages.length, 0);
  } finally { await s.stop(); }
});

test('güvenlik: başka siteden gelen istek ve yabancı Host reddedilir', async () => {
  const evil = await srv.request('POST', '/api/brands', { name: 'x' }, { Origin: 'https://kotu-site.example' });
  assert.equal(evil.status, 403);
  const same = await srv.request('POST', '/api/brands', { name: 'Yerel' }, { Origin: srv.base });
  assert.equal(same.status, 201);
  // fetch Host başlığını değiştirmeye izin vermez; DNS rebinding senaryosu ham http isteğiyle denenir
  const http = await import('node:http');
  const status = await new Promise((resolve, reject) => {
    const u = new URL(srv.base);
    http.get({ host: '127.0.0.1', port: u.port, path: '/api/health', headers: { Host: 'kotu-site.example' } }, r => { r.resume(); resolve(r.statusCode); }).on('error', reject);
  });
  assert.equal(status, 403);
  const page = await fetch(srv.base + '/');
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
});
