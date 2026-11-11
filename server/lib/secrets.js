// 8.6: Gizli ayarların (API anahtarları, erişim belirteçleri) veritabanında şifreli saklanması.
// AES-256-GCM; anahtar bu kurulumun veri klasöründeki .secret.key dosyasında (32 rastgele bayt, yalnız sahibi okur).
// Veritabanı ya da yedek tek başına ele geçse bile anahtarlar okunamaz (yedeklere gizli ayarlar zaten girmez).
// Eski düz metin değerler açılışta şifrelenir. Anahtar dosyası kaybolursa şifreli değerler okunamaz: anahtar yeniden girilir.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PREFIX = 'enc:v1:';
export const isSecretKey = key => /apikey|token|secret|password/i.test(key);

export function createCipher(dataDir) {
  const file = path.join(dataDir, '.secret.key');
  let key;
  try { key = fs.readFileSync(file); } catch { key = null; }
  if (!key || key.length !== 32) {
    key = crypto.randomBytes(32);
    fs.writeFileSync(file, key, { mode: 0o600 });
  }
  return {
    encrypt(plain) {
      if (plain == null || plain === '' || String(plain).startsWith(PREFIX)) return plain;
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
      return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
    },
    decrypt(value) {
      if (value == null || !String(value).startsWith(PREFIX)) return value; // eski düz metin
      try {
        const buf = Buffer.from(String(value).slice(PREFIX.length), 'base64');
        const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
        d.setAuthTag(buf.subarray(12, 28));
        return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
      } catch { return ''; } // anahtar dosyası değişmiş/kaybolmuş: değer okunamaz, kullanıcı yeniden girer
    },
    isEncrypted: value => String(value || '').startsWith(PREFIX)
  };
}
