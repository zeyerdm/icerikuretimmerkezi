// Google Drive aktarımı testleri (sahte Apps Script ile)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, PNG_1PX } from './helpers.js';
import { parseFolder } from '../server/services/drive.js';
import { readZip } from '../server/lib/zip.js';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbTEST_0123456789abcdefghij/exec';
const FOLDER = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';

// Sahte Apps Script: Ayarlar'da gösterilen koddaki anahtarı bilir; gelen istekleri saklar
function fakeScript() {
  const calls = [];
  let key = null;
  let folders = { [FOLDER]: 'DevOrtak Postları' };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const impl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url !== SCRIPT_URL) return new Response('<html>Not Found</html>', { status: 404 });
    if (body.anahtar !== key) return json({ ok: false, hata: 'anahtar' });
    if (body.islem === 'ping') {
      if (body.klasor && !folders[body.klasor]) return json({ ok: false, hata: 'No item with the given ID could be found.' });
      return json({ ok: true, surum: 1, klasorAdi: body.klasor ? folders[body.klasor] : 'Drive\'ım' });
    }
    if (body.islem === 'yukle') {
      if (!folders[body.klasor]) return json({ ok: false, hata: 'No item with the given ID could be found.' });
      return json({ ok: true, surum: 1, id: 'dosya1', url: 'https://drive.google.com/file/d/dosya1/view' });
    }
    return json({ ok: false, hata: 'bilinmeyen işlem' });
  };
  return { impl, calls, setKey: k => { key = k; } };
}

test('Drive klasör linki: farklı link biçimleri ve doğrudan kimlik kabul edilir, yabancı link reddedilir', () => {
  assert.equal(parseFolder(`https://drive.google.com/drive/folders/${FOLDER}`), FOLDER);
  assert.equal(parseFolder(`https://drive.google.com/drive/u/0/folders/${FOLDER}?usp=sharing`), FOLDER);
  assert.equal(parseFolder(`https://drive.google.com/open?id=${FOLDER}`), FOLDER);
  assert.equal(parseFolder(FOLDER), FOLDER);
  assert.equal(parseFolder('  '), '');
  assert.throws(() => parseFolder('https://example.com/folders/' + FOLDER));
  assert.throws(() => parseFolder('klasörüm'));
});

test('Drive bağlantısı: kod gösterilir, adres doğrulanır ve test edilir; adres ve anahtar dışarı sızmaz', async () => {
  const fake = fakeScript();
  const s = await startServer({ driveFetch: fake.impl });
  try {
    const st = (await s.request('GET', '/api/settings')).data.drive;
    assert.equal(st.configured, false);
    const { data } = await s.request('GET', '/api/settings/drive');
    const key = data.script.match(/const ANAHTAR = '([0-9a-f]{48})'/)[1];
    assert.match(data.script, /function doPost/);
    // Kod her istendiğinde aynı anahtarla gelir
    assert.equal((await s.request('GET', '/api/settings/drive')).data.script, data.script);

    assert.equal((await s.request('PUT', '/api/settings/drive', { scriptUrl: 'https://kotu-site.com/exec' })).status, 400);
    // Anahtar henüz Apps Script'e yapıştırılmadı: açık hata, adres kaydedilmez
    const wrong = await s.request('PUT', '/api/settings/drive', { scriptUrl: SCRIPT_URL });
    assert.equal(wrong.status, 502);
    assert.match(wrong.data.error.message, /kod güncel değil/);
    assert.equal((await s.request('GET', '/api/settings')).data.drive.configured, false);

    fake.setKey(key);
    const ok = await s.request('PUT', '/api/settings/drive', { scriptUrl: SCRIPT_URL });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(ok.data.configured, true);
    assert.equal(ok.data.rootFolder, 'Drive\'ım');
    const settings = JSON.stringify((await s.request('GET', '/api/settings')).data);
    assert.ok(!settings.includes(SCRIPT_URL) && !settings.includes(key), 'adres ya da anahtar ayarlarda görünüyor');

    // Yedeğe girmez
    await s.request('POST', '/api/brands', { name: 'A' });
    const { data: { backup } } = await s.request('POST', '/api/backups');
    const db = readZip((await s.request('GET', '/api/backups/' + backup.name)).data).find(e => e.name === 'app.db').data;
    assert.ok(!db.includes(Buffer.from(SCRIPT_URL)) && !db.includes(Buffer.from(key)), 'Drive bağlantısı yedeğe girdi');

    assert.equal((await s.request('DELETE', '/api/settings/drive')).data.configured, false);
  } finally { await s.stop(); }
});

test('markanın Drive klasörü: marka kurulurken eklenir, test edilir, kütüphane dosyası klasöre gönderilir', async () => {
  const fake = fakeScript();
  const s = await startServer({ driveFetch: fake.impl });
  try {
    // Bağlantı kurulmadan gönderim açık hata verir
    const { data: { brand } } = await s.request('POST', '/api/brands', { name: 'DevOrtak', driveFolder: `https://drive.google.com/drive/folders/${FOLDER}?usp=drive_link` });
    assert.equal(brand.driveFolderId, FOLDER);
    assert.equal(brand.driveFolderUrl, `https://drive.google.com/drive/folders/${FOLDER}`);
    const up = await s.request('POST', `/api/brands/${brand.id}/assets?category=logo&label=Ana logo`, PNG_1PX, { 'Content-Type': 'image/png' });
    const notReady = await s.request('POST', `/api/brands/${brand.id}/assets/${up.data.asset.id}/drive`);
    assert.equal(notReady.status, 409);
    assert.equal(notReady.data.error.code, 'DRIVE_NOT_CONFIGURED');

    fake.setKey((await s.request('GET', '/api/settings/drive')).data.script.match(/const ANAHTAR = '([0-9a-f]+)'/)[1]);
    await s.request('PUT', '/api/settings/drive', { scriptUrl: SCRIPT_URL });

    const t = await s.request('POST', `/api/brands/${brand.id}/drive/test`);
    assert.equal(t.status, 200);
    assert.equal(t.data.folderName, 'DevOrtak Postları');

    const sent = await s.request('POST', `/api/brands/${brand.id}/assets/${up.data.asset.id}/drive`);
    assert.equal(sent.status, 200, JSON.stringify(sent.data));
    assert.equal(sent.data.asset.driveUrl, 'https://drive.google.com/file/d/dosya1/view');
    const call = fake.calls.at(-1).body;
    assert.equal(call.islem, 'yukle');
    assert.equal(call.klasor, FOLDER);
    assert.equal(call.tur, 'image/png');
    assert.match(call.ad, /^DevOrtak - Ana logo - \d{4}-\d{2}-\d{2}\.png$/);
    assert.ok(Buffer.from(call.icerik, 'base64').equals(PNG_1PX));
    const list = (await s.request('GET', `/api/brands/${brand.id}/assets`)).data.assets;
    assert.equal(list[0].driveUrl, 'https://drive.google.com/file/d/dosya1/view');

    // Yanlış klasör: anlaşılır hata
    await s.request('PATCH', `/api/brands/${brand.id}`, { driveFolder: '1YokOlanKlasor0000000000000' });
    const bad = await s.request('POST', `/api/brands/${brand.id}/drive/test`);
    assert.equal(bad.status, 502);
    assert.match(bad.data.error.message, /klasörüne erişilemedi/);

    // Klasör kaldırılabilir; geçersiz link reddedilir; diğer alanlar değişince klasör korunur
    assert.equal((await s.request('PATCH', `/api/brands/${brand.id}`, { driveFolder: 'https://example.com/x' })).status, 400);
    await s.request('PATCH', `/api/brands/${brand.id}`, { driveFolder: FOLDER });
    assert.equal((await s.request('PATCH', `/api/brands/${brand.id}`, { sector: 'Yazılım' })).data.brand.driveFolderId, FOLDER);
    assert.equal((await s.request('PATCH', `/api/brands/${brand.id}`, { driveFolder: '' })).data.brand.driveFolderId, '');
    assert.equal((await s.request('POST', `/api/brands/${brand.id}/drive/test`)).status, 400);
  } finally { await s.stop(); }
});

test('bir markanın klasörüne yalnızca o markanın dosyası gider', async () => {
  const fake = fakeScript();
  const s = await startServer({ driveFetch: fake.impl });
  try {
    fake.setKey((await s.request('GET', '/api/settings/drive')).data.script.match(/const ANAHTAR = '([0-9a-f]+)'/)[1]);
    await s.request('PUT', '/api/settings/drive', { scriptUrl: SCRIPT_URL });
    const a = (await s.request('POST', '/api/brands', { name: 'A', driveFolder: FOLDER })).data.brand;
    const b = (await s.request('POST', '/api/brands', { name: 'B' })).data.brand;
    const assetB = (await s.request('POST', `/api/brands/${b.id}/assets?category=logo`, PNG_1PX, { 'Content-Type': 'image/png' })).data.asset;
    // B'nin dosyası A'nın adresinden gönderilemez
    assert.equal((await s.request('POST', `/api/brands/${a.id}/assets/${assetB.id}/drive`)).status, 404);
    // B'nin klasörü yok: gönderilmez
    assert.equal((await s.request('POST', `/api/brands/${b.id}/assets/${assetB.id}/drive`)).status, 400);
    assert.ok(!fake.calls.some(c => c.body.islem === 'yukle'));
  } finally { await s.stop(); }
});
