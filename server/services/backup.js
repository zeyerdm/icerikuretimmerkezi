// Yedekleme ve geri yükleme.
// Yedek tek bir .zip dosyasıdır: veritabanının tutarlı bir kopyası (app.db), yüklenen dosyalar (uploads/)
// ve açıklama (yedek.json). API anahtarları ve bu bilgisayara özel ayarlar yedeğe girmez;
// geri yüklemede de mevcut anahtarlar korunur. Yedekler data/backups/ altında durur.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../db.js';
import { writeZip, readZip, ZipError } from '../lib/zip.js';
import { HttpError, badRequest, notFound } from '../lib/http.js';

const APP = 'icerik-uretim-merkezi';
const FORMAT = 1;

export const BACKUP_KINDS = {
  otomatik: 'Günlük otomatik',
  elle: 'Elle alınan',
  'geri-yukleme-oncesi': 'Geri yükleme öncesi',
  'guncelleme-oncesi': 'Güncelleme öncesi'
};
// Her türden kaç yedek saklanır (elle alınanlar silinene kadar kalır)
const KEEP = { otomatik: 14, 'geri-yukleme-oncesi': 5, 'guncelleme-oncesi': 5 };
const NAME_RE = /^yedek-(\d{4})-(\d{2})-(\d{2})-(\d{6})(?:-(\d+))?-(otomatik|elle|geri-yukleme-oncesi|guncelleme-oncesi)\.zip$/;
const UPLOAD_RE = /^uploads\/[A-Za-z0-9-]{1,64}\/[A-Za-z0-9-]{1,64}\.(png|jpg|gif|webp)$/;

// Yedeğe girmeyen ve geri yüklemede değişmeyen ayarlar: anahtarlar, Drive bağlantısı ve bu bilgisayara özel yollar
export const isLocalSetting = key => /apikey|token|secret|password/i.test(key) || key.startsWith('backup.') || key.startsWith('drive.');

const pad = n => String(n).padStart(2, '0');
const stamp = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const today = () => stamp(new Date()).slice(0, 10);
const q = name => '"' + String(name).replace(/"/g, '""') + '"';

function walk(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

const restoreError = message => new HttpError(400, 'BAD_BACKUP', message);

export function createBackupService({ db, dataDir, settings }) {
  const dir = path.join(dataDir, 'backups');
  const uploadsDir = path.join(dataDir, 'uploads');
  let lastCopyError = null;

  const copyDir = () => settings.get('backup.copyDir') || '';
  const schemaVersion = () => db.prepare('PRAGMA user_version').get().user_version;

  function info(name, folder = dir) {
    const m = NAME_RE.exec(name);
    const st = fs.statSync(path.join(folder, name));
    return { name, kind: m[6], kindLabel: BACKUP_KINDS[m[6]], date: `${m[1]}-${m[2]}-${m[3]}`, createdAt: st.mtime.toISOString(), size: st.size };
  }

  const names = (folder = dir) => fs.existsSync(folder) ? fs.readdirSync(folder).filter(n => NAME_RE.test(n)).sort().reverse() : [];

  function resolve(name) {
    if (typeof name !== 'string' || !NAME_RE.test(name)) throw notFound('Yedek bulunamadı.');
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) throw notFound('Yedek bulunamadı.');
    return file;
  }

  function prune(folder) {
    for (const [kind, keep] of Object.entries(KEEP)) {
      names(folder).filter(n => NAME_RE.exec(n)[6] === kind).slice(keep).forEach(n => fs.rmSync(path.join(folder, n), { force: true }));
    }
  }

  // Veritabanının o anki tutarlı kopyası; bu bilgisayara özel ayarlar çıkarılır
  function snapshot() {
    const file = path.join(dir, `.kopya-${crypto.randomBytes(6).toString('hex')}.db`);
    db.prepare('VACUUM INTO ?').run(file);
    try {
      const copy = new DatabaseSync(file);
      const keys = copy.prepare('SELECT key FROM settings').all().map(r => r.key).filter(isLocalSetting);
      const del = copy.prepare('DELETE FROM settings WHERE key = ?');
      keys.forEach(k => del.run(k));
      copy.exec('VACUUM');
      copy.close();
      return fs.readFileSync(file);
    } finally {
      fs.rmSync(file, { force: true });
    }
  }

  function counts() {
    const n = table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    return { brands: n('brands'), contents: n('contents'), ideas: n('ideas'), tasks: n('tasks'), notes: n('notes'), assets: n('assets') };
  }

  function create(kind = 'elle') {
    if (!BACKUP_KINDS[kind]) throw badRequest('Geçersiz yedek türü.');
    fs.mkdirSync(dir, { recursive: true });
    const date = new Date();
    let name = `yedek-${stamp(date)}-${kind}.zip`;
    for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `yedek-${stamp(date)}-${i}-${kind}.zip`;

    const meta = { app: APP, format: FORMAT, kind, createdAt: date.toISOString(), schemaVersion: schemaVersion(), counts: counts() };
    const entries = [
      { name: 'yedek.json', data: Buffer.from(JSON.stringify(meta, null, 2)) },
      { name: 'app.db', data: snapshot() },
      ...walk(uploadsDir).filter(rel => UPLOAD_RE.test('uploads/' + rel)).map(rel => ({ name: 'uploads/' + rel, data: fs.readFileSync(path.join(uploadsDir, rel)) }))
    ];
    const tmp = path.join(dir, `.${name}.yaziliyor`);
    fs.writeFileSync(tmp, writeZip(entries, date));
    fs.renameSync(tmp, path.join(dir, name));
    prune(dir);
    copyOut(name);
    return info(name);
  }

  // Ek kopya (ör. Google Drive masaüstü uygulamasının klasörü): hata olursa yedek yine yerelde durur
  function copyOut(name) {
    const target = copyDir();
    if (!target) return;
    try {
      fs.copyFileSync(path.join(dir, name), path.join(target, name));
      prune(target);
      lastCopyError = null;
    } catch (err) {
      lastCopyError = `Yedek ek klasöre kopyalanamadı (${err.code || err.message}). Klasörün hâlâ var olduğunu kontrol et.`;
    }
  }

  function hasData() {
    const c = counts();
    return c.brands + c.tasks + c.notes > 0;
  }

  // Günde bir otomatik yedek (bugün alınmışsa ya da kaydedilecek veri yoksa bir şey yapmaz)
  function ensureDaily() {
    if (!hasData()) return null;
    if (names().some(n => n.startsWith(`yedek-${today()}-`) && n.endsWith('-otomatik.zip'))) return null;
    return create('otomatik');
  }

  function restoreBuffer(buf) {
    let entries;
    try { entries = readZip(buf); } catch (err) {
      if (err instanceof ZipError) throw restoreError(err.message);
      throw err;
    }
    const metaEntry = entries.find(e => e.name === 'yedek.json');
    const dbEntry = entries.find(e => e.name === 'app.db');
    let meta = null;
    try { meta = metaEntry && JSON.parse(metaEntry.data.toString('utf8')); } catch { meta = null; }
    if (!meta || meta.app !== APP || !dbEntry) throw restoreError('Bu dosya bir KREATİFHANE yedeği değil.');
    if (dbEntry.data.subarray(0, 16).toString('latin1') !== 'SQLite format 3\0') throw restoreError('Yedekteki veritabanı bozuk.');

    const work = path.join(dataDir, `.geri-yukleme-${crypto.randomBytes(6).toString('hex')}`);
    fs.mkdirSync(work);
    try {
      // 1) Yedekteki veritabanını ayrı bir dosyada aç, kontrol et ve bu sürümün şemasına yükselt
      const bakFile = path.join(work, 'app.db');
      fs.writeFileSync(bakFile, dbEntry.data);
      let version;
      // Dosya her durumda kapatılır (Windows açık dosyayı silmeye izin vermez)
      let probe = null;
      try {
        probe = new DatabaseSync(bakFile, { readOnly: true });
        version = probe.prepare('PRAGMA user_version').get().user_version;
        const ok = probe.prepare('PRAGMA integrity_check').get();
        if (Object.values(ok)[0] !== 'ok') throw new Error('integrity');
      } catch { throw restoreError('Yedekteki veritabanı bozuk.'); } finally {
        if (probe) try { probe.close(); } catch { /* zaten kapalı */ }
      }
      if (version > schemaVersion()) throw restoreError('Bu yedek uygulamanın daha yeni bir sürümüyle alınmış. Önce uygulamayı güncelle, sonra tekrar dene.');
      openDb(bakFile).close();

      // 2) Dosyaları geçici klasöre çıkar (yalnızca beklenen biçimdeki adlar; klasör dışına yazılamaz)
      const newUploads = path.join(work, 'uploads');
      fs.mkdirSync(newUploads);
      for (const e of entries) {
        if (!UPLOAD_RE.test(e.name)) continue;
        const target = path.join(work, ...e.name.split('/'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, e.data);
      }

      // 3) Mevcut durumun yedeği: geri yükleme yanlışlıkla yapıldıysa geri dönülebilir
      const safety = create('geri-yukleme-oncesi');

      // 4) Kayıtları tek işlemde değiştir: ya hepsi olur ya hiçbiri
      const ownerId = db.prepare('SELECT id FROM users ORDER BY created_at LIMIT 1').get().id;
      db.exec('PRAGMA foreign_keys = OFF');
      db.prepare('ATTACH DATABASE ? AS bak').run(bakFile);
      try {
        db.exec('BEGIN');
        try {
          const tables = db.prepare("SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('users', 'settings')").all().map(r => r.name);
          for (const t of tables) {
            db.exec(`DELETE FROM main.${q(t)}`);
            const mainCols = db.prepare(`PRAGMA main.table_info(${q(t)})`).all().map(c => c.name);
            const bakCols = new Set(db.prepare(`PRAGMA bak.table_info(${q(t)})`).all().map(c => c.name));
            const cols = mainCols.filter(c => bakCols.has(c)).map(q).join(', ');
            if (cols) db.exec(`INSERT INTO main.${q(t)} (${cols}) SELECT ${cols} FROM bak.${q(t)} ORDER BY rowid`);
            // Yedek başka bir kurulumdan geliyorsa kayıtlar bu kurulumun sahibine bağlanır
            if (mainCols.includes('owner_id')) db.prepare(`UPDATE main.${q(t)} SET owner_id = ? WHERE owner_id IS NOT NULL`).run(ownerId);
          }
          const del = db.prepare('DELETE FROM main.settings WHERE key = ?');
          db.prepare('SELECT key FROM main.settings').all().map(r => r.key).filter(k => !isLocalSetting(k)).forEach(k => del.run(k));
          const ins = db.prepare('INSERT INTO main.settings (key, value) VALUES (?, ?)');
          db.prepare('SELECT key, value FROM bak.settings').all().filter(r => !isLocalSetting(r.key)).forEach(r => ins.run(r.key, r.value));
          if (db.prepare('PRAGMA foreign_key_check').all().length) throw restoreError('Yedekteki kayıtlar birbiriyle uyumsuz; geri yükleme yapılmadı.');
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      } finally {
        db.exec('DETACH DATABASE bak');
        db.exec('PRAGMA foreign_keys = ON');
      }

      // 5) Dosyaları yerine koy
      const oldUploads = path.join(work, 'eski-uploads');
      if (fs.existsSync(uploadsDir)) fs.renameSync(uploadsDir, oldUploads);
      fs.renameSync(newUploads, uploadsDir);

      return { restoredFrom: meta, safetyBackup: safety.name, counts: counts() };
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  return {
    dir,
    list: () => names().map(n => info(n)),
    status: () => ({ copyDir: copyDir(), copyError: lastCopyError, keep: KEEP.otomatik }),
    create,
    copyOut,
    ensureDaily,
    file: resolve,
    remove(name) { fs.rmSync(resolve(name)); },
    restore(name) { return restoreBuffer(fs.readFileSync(resolve(name))); },
    restoreBuffer,
    setCopyDir(value) {
      // Windows'un "Yol olarak kopyala" komutu yolu tırnak içinde verir: tırnaklar atılır
      const v = String(value || '').trim().replace(/^["']+|["']+$/g, '').trim();
      if (!v) { settings.remove('backup.copyDir'); lastCopyError = null; return ''; }
      if (!path.isAbsolute(v)) throw badRequest('Klasörün tam yolunu yaz (ör. G:\\Drive\'ım\\Yedekler).');
      let ok = false;
      try {
        ok = fs.statSync(v).isDirectory();
        const probe = path.join(v, `.yazma-denemesi-${crypto.randomBytes(4).toString('hex')}`);
        fs.writeFileSync(probe, 'ok');
        fs.rmSync(probe);
      } catch { ok = false; }
      if (!ok) throw badRequest('Bu klasör bulunamadı ya da içine yazılamıyor.');
      if (path.resolve(v) === path.resolve(dir)) throw badRequest('Ek klasör, yedeklerin zaten durduğu klasör olamaz.');
      settings.set('backup.copyDir', v);
      lastCopyError = null;
      return v;
    }
  };
}
