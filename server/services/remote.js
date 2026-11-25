// Telefondan / her yerden erişim (isteğe bağlı, varsayılan kapalı).
// Uygulama yine yalnız 127.0.0.1'de dinler; internete Cloudflare tüneliyle (cloudflared, https) açılır. Tünel bilgisayarın
// içinden bağlandığı için istek, adından (Host) tanınır: localhost dışındaki her ad "uzak" sayılır ve
//  - uzaktan erişim kapalıysa reddedilir (eskisi gibi),
//  - açıksa şifreyle girilmiş oturum ister (çerez: HttpOnly, Secure, SameSite=Lax),
//  - hassas işlemler (API anahtarları, yedekler, güncelleme, Drive bağlantısı, uzaktan erişim ayarları) yalnız
//    bilgisayardan yapılabilir.
// Şifre scrypt ile özetlenir; oturum belirteçleri yalnız özetleriyle saklanır; yanlış şifre denemeleri kilitlenir.
import crypto from 'node:crypto';
import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import { badRequest } from '../lib/http.js';

export const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const COOKIE = 'kh_oturum';
const SESSION_DAYS = 30;
const MAX_SESSIONS = 20;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const GLOBAL_FAILS = 20; // 15 dakikada bütün kaynaklardan toplam yanlış deneme sınırı (IP değiştirerek denemeye karşı)
const MIN_PASSWORD = 10;
const TUNNEL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

// Telefondan yapılamayan işlemler (yöntem, yol)
const REMOTE_BLOCKED = [
  [/^(PUT|POST|DELETE)$/, /^\/api\/settings\/(ai|update-token|backup|drive)(\/|$)/],
  [/^(PUT|POST|DELETE)$/, /^\/api\/ai\/(keys|prices|budget)(\/|$)/],
  [/.*/, /^\/api\/backups(\/|$)/],
  [/^(PUT|POST|DELETE)$/, /^\/api\/system\//],
  [/^GET$/, /^\/api\/settings\/drive$/],
  [/^(PUT|POST|DELETE)$/, /^\/api\/remote(\/(tunnel|sessions)|$)/]
];

const hostOf = req => String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const cookieOf = req => { const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]+)`)); return m ? m[1] : ''; };

export function createRemoteAccess({ settings, spawnImpl = nodeSpawn, binPaths = null } = {}) {
  const json = (k, d) => { try { return JSON.parse(settings.get(k) || '') ?? d; } catch { return d; } };
  // Yanlış deneme sayaçları kalıcı (ayarlar tablosu): sunucu yeniden başlasa da kilit sürer
  const loadFails = () => { const v = json('remote.fails', {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
  const saveFails = v => {
    const t = Date.now();
    // Eski kayıtlar atılır (kilidi bitmiş ve 15 dakikadan eski)
    const keep = Object.fromEntries(Object.entries(v).filter(([k, f]) => f && ((f.until || 0) > t || (f.at || 0) > t - LOCK_MS)).slice(-200));
    settings.set('remote.fails', JSON.stringify(keep));
  };
  let tunnel = { status: 'kapali', url: '', error: '' };
  let child = null;

  const sessions = () => json('remote.sessions', []).filter(s => s && s.h && s.exp > Date.now());
  const saveSessions = list => settings.set('remote.sessions', JSON.stringify(list.slice(-MAX_SESSIONS)));

  function verifyPassword(pw) {
    const stored = settings.get('remote.password') || '';
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const got = crypto.scryptSync(String(pw || ''), salt, 32);
    const want = Buffer.from(hash, 'hex');
    return want.length === got.length && crypto.timingSafeEqual(got, want);
  }

  const service = {
    COOKIE,
    enabled: () => settings.get('remote.enabled') === '1' && Boolean(settings.get('remote.password')),
    status() {
      return { enabled: service.enabled(), hasPassword: Boolean(settings.get('remote.password')), autoTunnel: settings.get('remote.autoTunnel') === '1', sessions: sessions().length, tunnel: Object.assign({}, tunnel), minPassword: MIN_PASSWORD };
    },
    configure({ enabled, password, autoTunnel } = {}) {
      if (password != null && password !== '') {
        const pw = String(password);
        if (pw.length < MIN_PASSWORD) throw badRequest(`Şifre en az ${MIN_PASSWORD} karakter olmalı.`);
        if (pw.length > 200) throw badRequest('Şifre çok uzun.');
        const salt = crypto.randomBytes(16).toString('hex');
        settings.set('remote.password', `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`);
        saveSessions([]); // şifre değişince eski oturumlar kapanır
      }
      if (autoTunnel != null) settings.set('remote.autoTunnel', autoTunnel ? '1' : '0');
      if (enabled != null) {
        if (enabled && !settings.get('remote.password')) throw badRequest('Önce bir şifre belirle.');
        settings.set('remote.enabled', enabled ? '1' : '0');
        if (!enabled) { service.stopTunnel(); saveSessions([]); }
      }
      return service.status();
    },
    revokeAll() { saveSessions([]); return service.status(); },

    // Giriş: başarılıysa yeni oturum belirteci (ham hâli yalnız çereze yazılır)
    login(password, who = 'genel') {
      const all = loadFails();
      const key = String(who || 'genel').slice(0, 64);
      const t = Date.now();
      const f = all[key] || { n: 0, until: 0, at: 0 };
      const g = all['*'] || { n: 0, until: 0, at: 0 };
      if (g.until > t) return { ok: false, locked: Math.ceil((g.until - t) / 60000) };
      if (f.until > t) return { ok: false, locked: Math.ceil((f.until - t) / 60000) };
      if (!service.enabled() || !verifyPassword(password)) {
        if (f.at < t - LOCK_MS) f.n = 0;
        if (g.at < t - LOCK_MS) g.n = 0;
        f.n++; f.at = t; g.n++; g.at = t;
        if (f.n >= MAX_FAILS) { f.until = t + LOCK_MS; f.n = 0; }
        if (g.n >= GLOBAL_FAILS) { g.until = t + LOCK_MS; g.n = 0; }
        all[key] = f; all['*'] = g;
        saveFails(all);
        const until = Math.max(f.until, g.until);
        return { ok: false, locked: until > t ? Math.ceil((until - t) / 60000) : 0 };
      }
      if (all[key]) { delete all[key]; saveFails(all); }
      const token = crypto.randomBytes(32).toString('base64url');
      saveSessions([...sessions(), { h: sha(token), exp: Date.now() + SESSION_DAYS * 86400000 }]);
      return { ok: true, token, maxAge: SESSION_DAYS * 86400 };
    },
    logout(req) { const t = cookieOf(req); if (t) saveSessions(sessions().filter(s => s.h !== sha(t))); },
    authed(req) { const t = cookieOf(req); return Boolean(t) && sessions().some(s => s.h === sha(t)); },

    // Cloudflare hızlı tüneli: cloudflared kuruluysa başlatılır, verdiği https adresi okunur
    startTunnel(port) {
      if (!service.enabled()) throw badRequest('Önce uzaktan erişimi aç (şifre belirle).');
      if (child) return service.status();
      const bins = binPaths || ['cloudflared', ...(process.platform === 'win32' ? ['C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe'] : [])];
      tunnel = { status: 'baslatiliyor', url: '', error: '' };
      const tryStart = list => {
        const [b, ...rest] = list;
        if (!b) { tunnel = { status: 'yok', url: '', error: 'cloudflared bulunamadı.' }; child = null; return; }
        if (/[\\/]/.test(b) && !fs.existsSync(b)) return tryStart(rest);
        let c;
        try { c = spawnImpl(b, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${Number(port)}`], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); } catch { return tryStart(rest); }
        child = c;
        const onData = d => { const m = String(d).match(TUNNEL_RE); if (m && tunnel.status !== 'acik') tunnel = { status: 'acik', url: m[0], error: '' }; };
        if (c.stdout) c.stdout.on('data', onData);
        if (c.stderr) c.stderr.on('data', onData);
        c.on('error', err => { if (child === c) child = null; if (err && err.code === 'ENOENT') tryStart(rest); else tunnel = { status: 'hata', url: '', error: String(err.message || err).slice(0, 200) }; });
        c.on('exit', code => { if (child === c) { child = null; if (tunnel.status !== 'yok') tunnel = { status: code ? 'hata' : 'kapali', url: '', error: code ? `Tünel kapandı (kod ${code}).` : '' }; } });
      };
      tryStart(bins);
      return service.status();
    },
    stopTunnel() {
      if (child) { try { child.kill(); } catch { /* zaten kapalı */ } child = null; }
      tunnel = { status: 'kapali', url: '', error: '' };
      return service.status();
    },

    // Ara katman: yerel istek eskisi gibi; uzak istek şifreli oturum ister, hassas işlemler engellenir
    middleware(req, res, next) {
      const host = hostOf(req);
      const local = LOCAL_HOSTS.has(host);
      const origin = req.headers.origin;
      const write = !['GET', 'HEAD'].includes(req.method);
      if (local) {
        req.remote = false;
        if (origin && write) {
          let ok = false;
          try { const h = new URL(origin).hostname; ok = LOCAL_HOSTS.has(h) || LOCAL_HOSTS.has('[' + h + ']'); } catch { ok = false; }
          if (!ok) return res.status(403).json({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Başka bir siteden gelen istek reddedildi.' } });
        }
        return next();
      }
      if (!service.enabled()) return res.status(403).json({ error: { code: 'FORBIDDEN_HOST', message: 'Bu sunucu yalnızca bu bilgisayardan kullanılabilir.' } });
      req.remote = true;
      // CSRF: uzak adreste veri değiştiren istek yalnız aynı adresten gelebilir
      if (origin && write) {
        let ok = false;
        try { ok = new URL(origin).host.toLowerCase() === String(req.headers.host || '').toLowerCase(); } catch { ok = false; }
        if (!ok) return res.status(403).json({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Başka bir siteden gelen istek reddedildi.' } });
      }
      if (req.path === '/giris' || (req.path === '/api/remote/login' && req.method === 'POST') || req.path === '/img/logo.svg') return next();
      if (!service.authed(req)) {
        if (req.path.startsWith('/api/')) return res.status(401).json({ error: { code: 'LOGIN_REQUIRED', message: 'Oturum süresi doldu. Sayfayı yenileyip şifreyle tekrar gir.' } });
        return res.redirect(302, '/giris');
      }
      if (REMOTE_BLOCKED.some(([m, p]) => m.test(req.method) && p.test(req.path))) {
        return res.status(403).json({ error: { code: 'LOCAL_ONLY', message: 'Güvenlik için bu işlem yalnız bilgisayardan yapılabilir (API anahtarları, yedekler, güncelleme, Drive ve uzaktan erişim ayarları).' } });
      }
      next();
    }
  };
  // Uygulama kapanınca tünel de kapanır
  process.once('exit', () => { if (child) { try { child.kill(); } catch { /* yok */ } } });
  return service;
}

// Giriş sayfası: betiksiz düz form (CSP'ye uygun), markalı ve telefona uygun
export function loginPage({ error = '' } = {}) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KREATİFHANE · Giriş</title>
<link rel="icon" href="/img/logo.svg"><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f4ef;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1b1f3b;padding:16px}
form{background:#fff;border:1px solid #e6e4de;border-radius:18px;padding:28px 22px;width:100%;max-width:380px;box-shadow:0 10px 30px rgba(27,31,59,.08)}
.b{display:flex;align-items:center;gap:10px;margin-bottom:18px}.b img{width:40px;height:40px;border-radius:10px}.b b{letter-spacing:.08em}.b span{display:block;font-size:12px;color:#50535f}
label{display:block;font-weight:700;font-size:14px;margin-bottom:6px}input{width:100%;font-size:16px;padding:12px 14px;border:1px solid #d6d3ca;border-radius:12px}
button{margin-top:14px;width:100%;font-size:16px;font-weight:700;padding:12px;border:0;border-radius:12px;background:#5b55e6;color:#fff}
.e{background:#fde2e2;color:#a12b2b;border-radius:10px;padding:10px 12px;font-size:14px;margin-bottom:12px}p.h{font-size:12px;color:#50535f;margin:14px 0 0}
</style></head><body><form method="post" action="/api/remote/login">
<div class="b"><img src="/img/logo.svg" alt=""><div><b>KREATİFHANE</b><span>Kreatif Yönetim Platformu</span></div></div>
${error ? `<div class="e" role="alert">${error}</div>` : ''}
<label for="p">Şifre</label><input id="p" name="password" type="password" autocomplete="current-password" required autofocus>
<button type="submit">Giriş yap</button><p class="h">Bilgisayarındaki uygulamaya güvenli bağlantıyla bağlanıyorsun.</p></form></body></html>`;
}
