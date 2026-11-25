// Telefondan / her yerden erişim: varsayılan kapalı; açılınca uzak adres (tünel) şifreli oturum ister, hassas işlemler
// yalnız bilgisayardan; yanlış şifre kilitlenir; bilgisayardaki kullanım değişmez; tünel adresi cloudflared çıktısından okunur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { startServer } from './helpers.js';

const HOST = 'deneme-tunel.trycloudflare.com';
function remoteReq(base, method, path, { body, cookie, origin, form } = {}) {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const headers = { Host: HOST };
    if (cookie) headers.Cookie = cookie;
    if (origin) headers.Origin = origin;
    let data = null;
    if (form) { data = new URLSearchParams(form).toString(); headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
    else if (body !== undefined) { data = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
    const r = http.request({ host: u.hostname, port: u.port, method, path, headers }, res => {
      let s = ''; res.on('data', c => { s += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch { /* html */ } resolve({ status: res.statusCode, headers: res.headers, text: s, data: j }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

test('Uzaktan erişim: kapalıyken reddedilir; açılınca şifreli oturum, kilit, engelli işlemler, CSRF', async () => {
  const s = await startServer();
  try {
    // Varsayılan kapalı: uzak adres eskisi gibi reddedilir
    assert.equal((await remoteReq(s.base, 'GET', '/api/health')).status, 403);
    assert.equal((await s.request('PUT', '/api/remote', { enabled: true })).status, 400, 'şifresiz açılamaz');
    assert.equal((await s.request('PUT', '/api/remote', { password: 'kisa' })).status, 400);
    const st = (await s.request('PUT', '/api/remote', { password: 'telefon-sifresi-42', enabled: true })).data;
    assert.equal(st.enabled, true);

    // Oturumsuz: sayfa giriş ekranına, API 401
    const home = await remoteReq(s.base, 'GET', '/');
    assert.equal(home.status, 302); assert.equal(home.headers.location, '/giris');
    assert.equal((await remoteReq(s.base, 'GET', '/api/brands')).status, 401);
    const page = await remoteReq(s.base, 'GET', '/giris');
    assert.equal(page.status, 200); assert.match(page.text, /KREATİFHANE[\s\S]*type="password"/);

    // Yanlış şifre → hata; 5 yanlışta kilit (doğru şifre de kabul edilmez)
    const bad = await remoteReq(s.base, 'POST', '/api/remote/login', { form: { password: 'yanlis' } });
    assert.equal(bad.status, 303); assert.equal(bad.headers.location, '/giris?hata=1');
    for (let i = 0; i < 4; i++) await remoteReq(s.base, 'POST', '/api/remote/login', { form: { password: 'yanlis' } });
    const locked = await remoteReq(s.base, 'POST', '/api/remote/login', { form: { password: 'telefon-sifresi-42' }, origin: `https://${HOST}` });
    assert.match(locked.headers.location, /hata=kilit/);
  } finally { await s.stop(); }

  // Yeni sunucu (kilit bellekte): doğru şifreyle giriş
  const s2 = await startServer();
  try {
    await s2.request('PUT', '/api/remote', { password: 'telefon-sifresi-42', enabled: true });
    const ok = await remoteReq(s2.base, 'POST', '/api/remote/login', { form: { password: 'telefon-sifresi-42' }, origin: `https://${HOST}` });
    assert.equal(ok.status, 303); assert.equal(ok.headers.location, '/');
    const set = String(ok.headers['set-cookie']);
    assert.match(set, /kh_oturum=[\w-]+; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Lax/);
    const cookie = set.split(';')[0];
    const brands = await remoteReq(s2.base, 'GET', '/api/brands', { cookie });
    assert.equal(brands.status, 200);
    // Telefondan marka işi yapılabilir
    const nb = await remoteReq(s2.base, 'POST', '/api/brands', { cookie, origin: `https://${HOST}`, body: { name: 'Telefondan' } });
    assert.equal(nb.status, 201);
    // CSRF: başka siteden veri değiştiren istek reddedilir
    assert.equal((await remoteReq(s2.base, 'POST', '/api/brands', { cookie, origin: 'https://kotu.example', body: { name: 'X' } })).status, 403);
    // Hassas işlemler yalnız bilgisayardan
    for (const [m, p] of [['PUT', '/api/ai/keys/gemini'], ['GET', '/api/backups'], ['POST', '/api/system/restart'], ['PUT', '/api/remote'], ['POST', '/api/remote/tunnel'], ['GET', '/api/settings/drive'], ['PUT', '/api/settings/update-token']]) {
      const r = await remoteReq(s2.base, m, p, { cookie, origin: `https://${HOST}`, body: {} });
      assert.equal(r.status, 403, `${m} ${p}`); assert.equal(r.data.error.code, 'LOCAL_ONLY');
    }
    const rs = (await remoteReq(s2.base, 'GET', '/api/remote', { cookie })).data;
    assert.equal(rs.remoteClient, true);
    // Bilgisayardan: değişmeden çalışır; oturumları kapatınca telefon dışarıda kalır
    assert.equal((await s2.request('GET', '/api/remote')).data.remoteClient, false);
    assert.equal((await s2.request('POST', '/api/remote/sessions/revoke')).data.sessions, 0);
    assert.equal((await remoteReq(s2.base, 'GET', '/api/brands', { cookie })).status, 401);
    // Kapatınca uzak adres yine reddedilir
    await s2.request('PUT', '/api/remote', { enabled: false });
    assert.equal((await remoteReq(s2.base, 'GET', '/giris')).status, 403);
  } finally { await s2.stop(); }
});

test('Tünel: cloudflared çıktısındaki https adresi okunur; kurulu değilse açıkça söylenir', async () => {
  const spawned = [];
  const fakeSpawn = (bin, args) => {
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => c.emit('exit', 0);
    spawned.push({ bin, args });
    setTimeout(() => c.stderr.emit('data', Buffer.from('INF |  https://kirmizi-elma-12.trycloudflare.com  |')), 10);
    return c;
  };
  const s = await startServer({ remoteSpawn: fakeSpawn, remoteBins: ['cloudflared'] });
  try {
    assert.equal((await s.request('POST', '/api/remote/tunnel', { action: 'start' })).status, 400, 'erişim kapalıyken tünel açılmaz');
    await s.request('PUT', '/api/remote', { password: 'telefon-sifresi-42', enabled: true });
    await s.request('POST', '/api/remote/tunnel', { action: 'start' });
    await new Promise(r => setTimeout(r, 50));
    const st = (await s.request('GET', '/api/remote')).data;
    assert.equal(st.tunnel.status, 'acik');
    assert.equal(st.tunnel.url, 'https://kirmizi-elma-12.trycloudflare.com');
    assert.deepEqual(spawned[0].args.slice(0, 3), ['tunnel', '--no-autoupdate', '--url']);
    assert.match(spawned[0].args[3], /^http:\/\/localhost:\d+$/);
    assert.equal((await s.request('POST', '/api/remote/tunnel', { action: 'stop' })).data.tunnel.status, 'kapali');
  } finally { await s.stop(); }
  const missing = (bin) => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); setTimeout(() => c.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })), 5); return c; };
  const s3 = await startServer({ remoteSpawn: missing, remoteBins: ['cloudflared'] });
  try {
    await s3.request('PUT', '/api/remote', { password: 'telefon-sifresi-42', enabled: true });
    await s3.request('POST', '/api/remote/tunnel', { action: 'start' });
    await new Promise(r => setTimeout(r, 50));
    assert.equal((await s3.request('GET', '/api/remote')).data.tunnel.status, 'yok');
  } finally { await s3.stop(); }
});
