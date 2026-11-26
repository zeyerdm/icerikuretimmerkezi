// Şema onarımı: sürüm numarası ilerde ama bir göçün tablosu / sütunu eksik veritabanı (kullanıcıda görülen
// "no such table: brand_pillars") açılışta onarılır; veri silinmez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { startServer } from './helpers.js';

test('Şema onarımı: eksik tablo, sütun ve dizin eklenir; mevcut veri korunur; uygulama açılır', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ium-onarim-'));
  const file = path.join(dir, 'app.db');
  let db = openDb(file);
  const v = db.prepare('PRAGMA user_version').get().user_version;
  db.exec("INSERT INTO users (id, name, created_at) SELECT 'u1', 'Test', '2026-01-01' WHERE NOT EXISTS (SELECT 1 FROM users)");
  // Eksik şema: tablo, sütun ve dizin yok ama sürüm numarası son göçte
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('DROP TABLE brand_pillars; DROP TABLE content_events; ALTER TABLE contents DROP COLUMN purpose; DROP INDEX idx_ai_usage_ref;');
  db.close();
  db = openDb(file);
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, v, 'sürüm değişmez');
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'brand_pillars'").get());
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'content_events'").get());
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'idx_ai_usage_ref'").get());
    assert.ok(db.prepare('PRAGMA table_info(contents)').all().some(c => c.name === 'purpose' && c.dflt_value === "''"));
    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM users").get().n >= 1, 'veri korunur');
  } finally { db.close(); }
  // Uygulama bu veriyle açılır ve takvim listelenir
  const s = await startServer({ dataDir: dir });
  try {
    const st = await s.request('GET', '/api/contents');
    assert.equal(st.status, 200, JSON.stringify(st.data));
  } finally { await s.stop(); }
});
