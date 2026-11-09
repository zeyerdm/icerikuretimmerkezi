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
  `,
  // 4: markanın Google Drive klasörü ve Drive'a gönderilen dosyaların bağlantısı
  `
  ALTER TABLE brands ADD COLUMN drive_folder TEXT NOT NULL DEFAULT '';
  ALTER TABLE assets ADD COLUMN drive_url TEXT NOT NULL DEFAULT '';
  `,
  // 5: yapay zekâ harcama kaydı (her çağrı: sağlayıcı, model, iş, marka, token, tutar) ve model karşılaştırmaları
  `
  CREATE TABLE ai_usage (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    task TEXT NOT NULL,
    brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    ok INTEGER NOT NULL DEFAULT 1,
    error TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_ai_usage_time ON ai_usage(created_at);

  CREATE TABLE ai_comparisons (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    kind TEXT NOT NULL,
    brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
    brief TEXT NOT NULL,
    results TEXT NOT NULL DEFAULT '[]',
    winner TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_ai_comparisons_time ON ai_comparisons(created_at);
  `,
  // 6: Reels fikir havuzu, Reels senaryoları (sürüm geçmişiyle), post/carousel stüdyosu;
  //    takvimdeki içeriğin bağlı olduğu senaryo veya post; markanın Reels ayarları (karakter, görsel stil)
  `
  CREATE TABLE reels_pool (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    category TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_reels_pool_brand ON reels_pool(brand_id, created_at);

  CREATE TABLE reels (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    pool_id TEXT REFERENCES reels_pool(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'taslak',
    data TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_reels_brand ON reels(brand_id, updated_at);

  CREATE TABLE reels_versions (
    id TEXT PRIMARY KEY,
    reels_id TEXT NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_reels_versions ON reels_versions(reels_id, created_at);

  CREATE TABLE posts (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    data TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_posts_brand ON posts(brand_id, updated_at);

  ALTER TABLE contents ADD COLUMN reels_id TEXT REFERENCES reels(id) ON DELETE SET NULL;
  ALTER TABLE contents ADD COLUMN post_id TEXT REFERENCES posts(id) ON DELETE SET NULL;
  ALTER TABLE brands ADD COLUMN reels_settings TEXT NOT NULL DEFAULT '{}';
  `,
  // 7: Prompt Studio — marka başına kayıtlı prompt'lar ve her değişikliğin sürümü
  `
  CREATE TABLE prompts (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    brief TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    text_tr TEXT NOT NULL DEFAULT '',
    favorite INTEGER NOT NULL DEFAULT 0,
    model TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_prompts_brand ON prompts(brand_id, updated_at);

  CREATE TABLE prompt_versions (
    id TEXT PRIMARY KEY,
    prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    brief TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    text_tr TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_prompt_versions ON prompt_versions(prompt_id, created_at);
  `,
  // 8: Post stüdyosu şablonları (marka başına)
  `
  CREATE TABLE post_templates (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_post_templates ON post_templates(brand_id, created_at);
  `,
  // 9: Görsel üretim kaydı (prompt, model, oran, maskot referansı, tutar)
  `
  CREATE TABLE image_generations (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL,
    prompt_id TEXT,
    prompt TEXT NOT NULL,
    model TEXT NOT NULL,
    aspect TEXT NOT NULL,
    used_refs INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_image_generations ON image_generations(brand_id, created_at);
  `,
  // 10: Varlık kütüphanesi: paket (ör. "Kış sticker'ları") ve etiketler (virgülle)
  `
  ALTER TABLE assets ADD COLUMN pack TEXT NOT NULL DEFAULT '';
  ALTER TABLE assets ADD COLUMN tags TEXT NOT NULL DEFAULT '';
  `,
  // 11: Paylaşım sonuçları: izlenme/beğeni/yorum/kaydetme/paylaşım/takip (JSON), giriş cümlesi ve tema
  `
  ALTER TABLE contents ADD COLUMN metrics TEXT NOT NULL DEFAULT '';
  ALTER TABLE contents ADD COLUMN hook TEXT NOT NULL DEFAULT '';
  ALTER TABLE contents ADD COLUMN theme TEXT NOT NULL DEFAULT '';
  `,
  // 12: İçerik kartı: açıklama, hashtag'ler, ilk yorum ve yapılacaklar listesi (JSON)
  `
  ALTER TABLE contents ADD COLUMN caption TEXT NOT NULL DEFAULT '';
  ALTER TABLE contents ADD COLUMN hashtags TEXT NOT NULL DEFAULT '';
  ALTER TABLE contents ADD COLUMN first_comment TEXT NOT NULL DEFAULT '';
  ALTER TABLE contents ADD COLUMN checklist TEXT NOT NULL DEFAULT '';
  `,
  // 13: Akıllı marka hafızası: yasaklı kelimeler ve tercih edilen ifadeler (JSON dizi), bilgi kartları
  `
  ALTER TABLE brands ADD COLUMN banned_words TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE brands ADD COLUMN preferred_phrases TEXT NOT NULL DEFAULT '[]';
  CREATE TABLE brand_facts (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_brand_facts ON brand_facts(brand_id, category);
  `,
  // 14: Markalar arası (ortak) şablon kütüphanesi: katman rolleriyle; uygulandığı markanın kimliğine çevrilir
  `
  CREATE TABLE shared_templates (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    data TEXT NOT NULL,
    source_brand_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_shared_templates ON shared_templates(owner_id, created_at);
  `,
  // 15: Kalıp arşivi: beğenilen/rakip/kendi Reels metinlerinden çıkarılan giriş, tema, akış ve CTA
  `
  CREATE TABLE patterns (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_note TEXT NOT NULL DEFAULT '',
    raw_text TEXT NOT NULL,
    title TEXT NOT NULL,
    data TEXT NOT NULL,
    favorite INTEGER NOT NULL DEFAULT 0,
    model TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_patterns ON patterns(brand_id, created_at);
  `,
  // 16: Rakip profilleri (marka başına): örnek gönderiler ve AI analizi (sütunlar, ton, güçlü/zayıf, boşluklar)
  `
  CREATE TABLE competitors (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    handle TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    samples TEXT NOT NULL DEFAULT '',
    analysis TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_competitors ON competitors(brand_id);
  `,
  // 17: Rollü referanslar: kütüphane görseline kimlik / nesne / stil rolü (görsel üretiminde @etiket ile anılır)
  `
  ALTER TABLE assets ADD COLUMN ref_role TEXT NOT NULL DEFAULT '';
  `,
  // 18: Görselde yazı (OCR) ve AI ile etiketleme: okunan yazı kütüphane aramasına katılır
  `
  ALTER TABLE assets ADD COLUMN ocr_text TEXT NOT NULL DEFAULT '';
  ALTER TABLE assets ADD COLUMN analyzed_at TEXT;
  `,
  // 19: Çöp kutusu: silinen kaydın (ve bağlı alt kayıtlarının) anlık görüntüsü 30 gün saklanır, geri alınabilir
  `
  CREATE TABLE trash (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id TEXT REFERENCES brands(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    payload TEXT NOT NULL,
    deleted_at TEXT NOT NULL
  );
  CREATE INDEX idx_trash ON trash(owner_id, deleted_at);
  `,
  // 20: Kampanya kanvası: marka başına panolar; fikir, senaryo, tasarım, prompt, görsel, içerik ve not kartları + bağlantılar
  `
  CREATE TABLE campaigns (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    goal TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#7d6bf0',
    links TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_campaigns ON campaigns(brand_id, updated_at);
  CREATE TABLE campaign_items (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    ref_id TEXT,
    text TEXT NOT NULL DEFAULT '',
    x INTEGER NOT NULL DEFAULT 40,
    y INTEGER NOT NULL DEFAULT 40,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_campaign_items ON campaign_items(campaign_id);
  `,
  // 21: Ortak tarifler: beğenilen prompt ve Reels kalıpları kullanıcı düzeyinde saklanır, başka markalara kopyalanır
  `
  CREATE TABLE recipes (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    data TEXT NOT NULL,
    source_brand TEXT NOT NULL DEFAULT '',
    uses INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_recipes ON recipes(owner_id, kind, created_at);
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
