// Veritabanı: Node'un yerleşik SQLite'ı (ek derleme gerektiren paket yok).
// Şema sürümleri PRAGMA user_version ile takip edilir; her geçiş bir kez çalışır.
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  // 1: kullanıcı, ayarlar, marka, marka varlıkları, fikirler, asistan sohbeti, etkinlik akışı
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- Sunucuya özel ayarlar (ör. AI anahtarı). İstemciye hiçbir zaman ham değer gönderilmez.
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE brands (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sector TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    audience TEXT NOT NULL DEFAULT '',
    character TEXT NOT NULL DEFAULT '',
    tone TEXT NOT NULL DEFAULT '',
    goals TEXT NOT NULL DEFAULT '',
    competitors TEXT NOT NULL DEFAULT '',
    slogan TEXT NOT NULL DEFAULT '',
    colors TEXT NOT NULL DEFAULT '{}',
    fonts TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_brands_owner ON brands(owner_id);

  CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_assets_brand ON assets(brand_id, category);

  CREATE TABLE ideas (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    favorite INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_ideas_brand ON ideas(brand_id, created_at);

  CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    actions TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_chat_brand ON chat_messages(brand_id, created_at);

  CREATE TABLE activity (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_activity_brand ON activity(brand_id, created_at);
  `,
  // 2: örnek marka işareti (arayüzde rozet ve kullanım rehberi gösterilir)
  `
  ALTER TABLE brands ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
  `,
  // 3: yönetim merkezi — içerik planı (takvim/arşiv), görevler, notlar;
  //    etkinlik akışı markadan bağımsız işlemleri de tutar (brand_id boş olabilir)
  `
  CREATE TABLE contents (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    scheduled_at TEXT,
    notes TEXT NOT NULL DEFAULT '',
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_contents_brand ON contents(brand_id, scheduled_at);
  CREATE INDEX idx_contents_scheduled ON contents(scheduled_at);

  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id TEXT REFERENCES brands(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_date TEXT,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_tasks_owner ON tasks(owner_id, status, due_date);

  CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id TEXT REFERENCES brands(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_notes_owner ON notes(owner_id, pinned, updated_at);

  CREATE TABLE activity_new (
    id TEXT PRIMARY KEY,
    owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    brand_id TEXT REFERENCES brands(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  INSERT INTO activity_new (id, owner_id, brand_id, type, summary, created_at)
    SELECT a.id, b.owner_id, a.brand_id, a.type, a.summary, a.created_at FROM activity a JOIN brands b ON b.id = a.brand_id ORDER BY a.rowid;
  DROP TABLE activity;
  ALTER TABLE activity_new RENAME TO activity;
  CREATE INDEX idx_activity_brand ON activity(brand_id, created_at);
  CREATE INDEX idx_activity_owner ON activity(owner_id, created_at);
  `
];

export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

// Tek işlemde birden fazla yazma: hata olursa hiçbiri kalmaz
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
