// Google Drive aktarımı (Google Apps Script üzerinden).
// Kullanıcı Ayarlar'daki kısa betiği kendi Google hesabında bir kez "web uygulaması" olarak yayınlar;
// uygulama dosyaları o betiğe gönderir, betik de markanın Drive klasörüne kaydeder.
// Betik adresi ve gizli anahtar yalnızca bu bilgisayardaki sunucuda durur; tarayıcıya ve yedeğe gitmez.
import crypto from 'node:crypto';
import { HttpError, badRequest } from '../lib/http.js';

const URL_SETTING = 'drive.scriptUrl';
const TOKEN_SETTING = 'drive.token';
export const SCRIPT_VERSION = 1;
const SCRIPT_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
const FOLDER_ID_RE = /^[A-Za-z0-9_-]{10,100}$/;

const driveError = message => new HttpError(502, 'DRIVE_ERROR', message);

// Drive klasör linkinden klasör kimliğini çıkarır (link ya da doğrudan kimlik kabul edilir). Boş → ''.
export function parseFolder(input) {
  const v = String(input || '').trim();
  if (!v) return '';
  let id = v;
  if (/^https?:\/\//i.test(v)) {
    let url;
    try { url = new URL(v); } catch { url = null; }
    const m = url && url.hostname === 'drive.google.com' && url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/);
    id = m ? m[1] : (url && url.hostname === 'drive.google.com' && url.searchParams.get('id')) || '';
  }
  if (!FOLDER_ID_RE.test(id)) throw badRequest('Bu bir Google Drive klasör linkine benzemiyor. Drive\'da klasörü açıp adres çubuğundaki linki (…/drive/folders/…) yapıştır.');
  return id;
}

export const folderUrl = id => id ? `https://drive.google.com/drive/folders/${id}` : '';

// Kullanıcının Apps Script'e yapıştıracağı kod (gizli anahtar içine yazılı)
function scriptCode(token) {
  return `// İçerik Üretim Merkezi → Google Drive aktarımı (sürüm ${SCRIPT_VERSION})
// Bu kod yalnızca senin Google hesabında çalışır. Aşağıdaki anahtarı kimseyle paylaşma.
const ANAHTAR = '${token}';

function doPost(e) {
  try {
    const istek = JSON.parse(e.postData.contents);
    if (istek.anahtar !== ANAHTAR) return yanit({ ok: false, hata: 'anahtar' });
    if (istek.islem === 'ping') {
      const klasor = istek.klasor ? DriveApp.getFolderById(istek.klasor) : DriveApp.getRootFolder();
      return yanit({ ok: true, surum: ${SCRIPT_VERSION}, klasorAdi: klasor.getName() });
    }
    if (istek.islem === 'yukle') {
      const klasor = DriveApp.getFolderById(istek.klasor);
      const dosya = klasor.createFile(Utilities.newBlob(Utilities.base64Decode(istek.icerik), istek.tur, istek.ad));
      return yanit({ ok: true, surum: ${SCRIPT_VERSION}, id: dosya.getId(), url: dosya.getUrl() });
    }
    return yanit({ ok: false, hata: 'bilinmeyen işlem' });
  } catch (hata) {
    return yanit({ ok: false, hata: String(hata && hata.message || hata) });
  }
}

function yanit(veri) {
  return ContentService.createTextOutput(JSON.stringify(veri)).setMimeType(ContentService.MimeType.JSON);
}
`;
}

export function createDriveService(settings, { fetchImpl = fetch } = {}) {
  const token = () => {
    let t = settings.get(TOKEN_SETTING);
    if (!t) { t = crypto.randomBytes(24).toString('hex'); settings.set(TOKEN_SETTING, t); }
    return t;
  };
  const scriptUrl = () => settings.get(URL_SETTING) || '';

  async function call(payload) {
    const url = scriptUrl();
    if (!url) throw new HttpError(409, 'DRIVE_NOT_CONFIGURED', 'Google Drive bağlantısı kurulmamış. Ayarlar → Google Drive bölümündeki adımları izle.');
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ anahtar: token() }, payload)),
        redirect: 'follow',
        signal: AbortSignal.timeout(90000)
      });
    } catch {
      throw driveError('Google Drive\'a ulaşılamadı. İnternet bağlantını kontrol et.');
    }
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { data = null; }
    if (!data) {
      throw driveError(res.status === 404
        ? 'Apps Script adresi bulunamadı. Dağıtımın silinmediğini ve adresin "/exec" ile bittiğini kontrol et.'
        : 'Apps Script yanıt vermedi. Dağıtımda "Erişimi olan: Herkes" seçili olmalı ve ilk çalıştırmada izin verilmiş olmalı.');
    }
    if (!data.ok) {
      if (data.hata === 'anahtar') throw driveError('Apps Script\'teki kod güncel değil. Ayarlar\'daki kodu yeniden kopyalayıp Apps Script\'e yapıştır ve yeni dağıtım yap.');
      if (/no item|bulunamadı|not found|access|erişim|izin/i.test(String(data.hata))) {
        throw driveError('Drive klasörüne erişilemedi. Linkin doğru olduğunu ve klasörün Apps Script\'i yayınladığın Google hesabında olduğunu kontrol et.');
      }
      throw driveError('Google Drive hatası: ' + String(data.hata || 'bilinmiyor').slice(0, 200));
    }
    return data;
  }

  return {
    status() {
      const url = scriptUrl();
      return { configured: Boolean(url), urlHint: url ? '…' + url.slice(-14) : null };
    },
    script: () => scriptCode(token()),
    async setScriptUrl(value) {
      const url = String(value || '').trim();
      if (!SCRIPT_URL_RE.test(url)) throw badRequest('Bu bir Apps Script web uygulaması adresine benzemiyor. Adres "https://script.google.com/macros/s/" ile başlayıp "/exec" ile bitmeli.');
      const previous = scriptUrl();
      settings.set(URL_SETTING, url);
      try {
        return await call({ islem: 'ping' });
      } catch (err) {
        // Çalışmayan adres kaydedilmez
        if (previous) settings.set(URL_SETTING, previous); else settings.remove(URL_SETTING);
        throw err;
      }
    },
    clear() { settings.remove(URL_SETTING); },
    ping: folderId => call({ islem: 'ping', klasor: folderId || undefined }),
    async upload(folderId, { name, mime, buffer }) {
      if (!folderId) throw badRequest('Bu markaya Google Drive klasörü eklenmemiş. Dijital kimlik → Marka profili bölümünden ekle.');
      const r = await call({ islem: 'yukle', klasor: folderId, ad: name, tur: mime, icerik: buffer.toString('base64') });
      if (typeof r.url !== 'string' || !/^https:\/\/(drive|docs)\.google\.com\//.test(r.url)) throw driveError('Google Drive beklenmeyen bir yanıt verdi.');
      return { id: String(r.id || ''), url: r.url };
    }
  };
}
