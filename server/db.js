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
  `,
  // 22: Aylık içerik hedefi (marka başına; 0 = hedef yok)
  `
  ALTER TABLE brands ADD COLUMN monthly_goal INTEGER NOT NULL DEFAULT 0;
  `,
  // 23: 7.2 Marka prompt kimliği (sihirbaz cevapları, JSON)
  `
  ALTER TABLE brands ADD COLUMN prompt_identity TEXT NOT NULL DEFAULT '{}';
  `,
  // 24: 7.3 Maskot karakter kitabı (JSON)
  `
  ALTER TABLE brands ADD COLUMN character_book TEXT NOT NULL DEFAULT '{}';
  `,
  // 25: 7.5 Prompt dili: İngilizce türler önce Türkçe yazılır ('tr'), istenince İngilizceye çevrilir ('en')
  `
  ALTER TABLE prompts ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';
  ALTER TABLE prompt_versions ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';
  `,
  // 26: 7.8 Senaryolu (çok sahneli) prompt: sahneler JSON dizi; text sahnelerin birleşimi
  `
  ALTER TABLE prompts ADD COLUMN scenes TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE prompt_versions ADD COLUMN scenes TEXT NOT NULL DEFAULT '[]';
  `,
  // 27: 7.9 Marka örneği: beğenilen prompt ya da görsel sonraki üretimlere örnek olarak girer
  `
  ALTER TABLE prompts ADD COLUMN is_example INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE image_generations ADD COLUMN is_example INTEGER NOT NULL DEFAULT 0;
  `,
  // 28: 7.10 Hedef üretim aracı ve oran (çıktı biçimi araca göre ayarlanır)
  `
  ALTER TABLE prompts ADD COLUMN tool TEXT NOT NULL DEFAULT '';
  ALTER TABLE prompts ADD COLUMN aspect TEXT NOT NULL DEFAULT '';
  `,
  // 29: 7.11 Beğen/beğenme: hedef başına tek oy ve nedenler; geçilen öneriler marka üzerinde
  `
  CREATE TABLE feedback (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    vote INTEGER NOT NULL,
    reasons TEXT NOT NULL DEFAULT '[]',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (brand_id, target_type, target_id)
  );
  ALTER TABLE brands ADD COLUMN feedback_dismissed TEXT NOT NULL DEFAULT '{}';
  `,
  // 30: 8.10 Küçük resim: tarayıcının ürettiği ~400 px önizleme (.thumbs klasöründe) var mı
  `
  ALTER TABLE assets ADD COLUMN thumb INTEGER NOT NULL DEFAULT 0;
  `,
  // 31: 8.11 Onay akışı: içerik başına onay geçmişi (gönder, yorum, onayla, düzeltme iste)
  `
  CREATE TABLE content_reviews (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_content_reviews ON content_reviews(content_id, created_at);
  `,
  // 32: 8.13 Seslendirme: senaryonun seslendirme bilgisi (ses, tarz, sahne süreleri); dosyalar uploads/<marka>/voice altında
  `
  ALTER TABLE reels ADD COLUMN voiceover TEXT NOT NULL DEFAULT '';
  `,
  // 33: 8.14 Metinden video işleri (Veo uzun süren işlem; durum sorgulanarak tamamlanır)
  `
  CREATE TABLE video_jobs (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    reels_id TEXT,
    scene_index INTEGER,
    model TEXT NOT NULL,
    aspect TEXT NOT NULL,
    prompt TEXT NOT NULL,
    operation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'bekliyor',
    error TEXT NOT NULL DEFAULT '',
    cost_usd REAL NOT NULL DEFAULT 0,
    checked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_video_jobs ON video_jobs(brand_id, reels_id, created_at);
  `,
  // 34: 8.15 Hashtag grupları ve imza kapanışları (marka başına JSON)
  `
  ALTER TABLE brands ADD COLUMN caption_sets TEXT NOT NULL DEFAULT '{}';
  `,
  // 35: 8.19 Hata günlüğü: beklenmeyen sunucu hataları ve arayüz (tarayıcı) hataları; AI hataları ai_usage'dan okunur
  `
  CREATE TABLE error_log (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    kind TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_error_log ON error_log(created_at);
  `,
  // 36: 9.3 Tek akışta marka kurulumu: kanallar, içerik türleri, maskot/mekân cevapları ve tamamlanan adımlar
  `
  ALTER TABLE brands ADD COLUMN setup TEXT NOT NULL DEFAULT '{}';
  `,
  // 37: 10.4–10.6 İçerik havuzu: fikrin türü (Reels/Post/YouTube…), kullanıldığı yerler ve arşiv
  `
  ALTER TABLE ideas ADD COLUMN format TEXT NOT NULL DEFAULT 'genel';
  ALTER TABLE ideas ADD COLUMN used_at TEXT;
  ALTER TABLE ideas ADD COLUMN used_in TEXT NOT NULL DEFAULT '';
  ALTER TABLE ideas ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX idx_ideas_pool ON ideas(brand_id, archived, format);
  `,
  // 38: 10.8 Tasarım şablonu ↔ fikir eşleşmesi (hangi tür ve kategorideki fikirler bu şablonla üretilir)
  `
  ALTER TABLE post_templates ADD COLUMN match TEXT NOT NULL DEFAULT '{}';
  `,
  // 39: Prompt Studio kural şablonları (kullanıcının kendi sahne/prompt yapısı; [köşeli] alanlar doldurulur, gerisi aynen kalır)
  `
  CREATE TABLE prompt_rules (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    lang TEXT NOT NULL DEFAULT 'tr',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_prompt_rules_brand ON prompt_rules(brand_id, kind);
  ALTER TABLE prompts ADD COLUMN rule_id TEXT NOT NULL DEFAULT '';
  `,
  // 40: Şablon oluşturucu: ortak (bütün markalarda) kural şablonu, örnek prompt, seçimler; kullanıcının kendi stilleri
  `
  ALTER TABLE prompt_rules ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE prompt_rules ADD COLUMN example TEXT NOT NULL DEFAULT '';
  ALTER TABLE prompt_rules ADD COLUMN spec TEXT NOT NULL DEFAULT '{}';
  CREATE TABLE prompt_presets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    preview TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  `,
  // 41: Akıllı şablon sistemi: şablon paketi ve versiyonları, marka tasarım kilidi, toplu üretim kuyruğu
  `
  ALTER TABLE post_templates ADD COLUMN pack TEXT NOT NULL DEFAULT '';
  ALTER TABLE post_templates ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  CREATE TABLE post_template_versions (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES post_templates(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    data TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_tpl_versions ON post_template_versions(template_id, version);
  ALTER TABLE brands ADD COLUMN design_lock TEXT NOT NULL DEFAULT '{}';
  CREATE TABLE gen_jobs (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    batch_id TEXT NOT NULL,
    idea_id TEXT NOT NULL,
    template_id TEXT,
    template_version INTEGER,
    options TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'bekliyor',
    error TEXT NOT NULL DEFAULT '',
    post_id TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_gen_jobs ON gen_jobs(brand_id, batch_id, status);
  `,
  // 42: Global öğe kütüphanesi (yönetim paneli): lisans bilgisi zorunlu, SVG metni ya da görsel dosyası
  `
  CREATE TABLE elements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'diger',
    tags TEXT NOT NULL DEFAULT '[]',
    kind TEXT NOT NULL,
    svg TEXT NOT NULL DEFAULT '',
    file TEXT NOT NULL DEFAULT '',
    view_box TEXT NOT NULL DEFAULT '0 0 100 100',
    recolor INTEGER NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    size INTEGER NOT NULL DEFAULT 0,
    license TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    attribution TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    pack TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_elements ON elements(published, category);
  `,
  // 43: Aylık performans: en çok tutan içerikler (izlenme, etkileşim, ekran görüntüsü) ve AI'ın sonraki ay önerileri
  `
  CREATE TABLE perf_entries (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'post',
    metrics TEXT NOT NULL DEFAULT '{}',
    url TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    asset_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_perf_entries ON perf_entries(brand_id, month);
  CREATE TABLE perf_reports (
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    data TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    applied TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    PRIMARY KEY (brand_id, month)
  );
  `,
  // 44: Tasarım arşivi ve markanın sabit metin havuzları (CTA, kapanış cümlesi, maskot konuşması)
  `
  ALTER TABLE posts ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE brands ADD COLUMN text_pools TEXT NOT NULL DEFAULT '{}';
  `,
  // 45: Tek fikir havuzu: Reels fikir havuzundaki (beğenilmeyenler hariç) fikirler İçerik fikirlerine "Reels" türüyle taşınır
  `
  INSERT INTO ideas (id, brand_id, title, description, category, favorite, source, created_at, format)
    SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
      p.brand_id, p.text, '', p.category, CASE WHEN p.rating > 0 THEN 1 ELSE 0 END, p.source, p.created_at, 'reels'
    FROM reels_pool p
    WHERE p.rating >= 0 AND NOT EXISTS (SELECT 1 FROM ideas i WHERE i.brand_id = p.brand_id AND lower(i.title) = lower(p.text));
  `,
  // 46: Prompt Studio Reels: onaylanan senaryo planı (espri, sahne süreleri, saniyeler, replikler) prompt'la birlikte saklanır
  `
  ALTER TABLE prompts ADD COLUMN plan TEXT NOT NULL DEFAULT '';
  `,
  // 47: Reels tek akış (Prompt Studio): senaryolu prompt'un çekim durumu ve takvimdeki içerikle bağı
  `
  ALTER TABLE prompts ADD COLUMN status TEXT NOT NULL DEFAULT 'taslak';
  ALTER TABLE contents ADD COLUMN prompt_id TEXT;
  `,
  // 48: Tek havuza geçtikten sonra eski Reels havuzuna yazılmış (asistandan gelen) fikirler de İçerik fikirlerine taşınır;
  //     toplu üretim kuyruğu Reels senaryosu da üretir (sonuç Prompt Studio'da); Reels sahnelerinin istenince yapılan İngilizcesi
  `
  INSERT INTO ideas (id, brand_id, title, description, category, favorite, source, created_at, format)
    SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
      p.brand_id, p.text, '', p.category, CASE WHEN p.rating > 0 THEN 1 ELSE 0 END, p.source, p.created_at, 'reels'
    FROM reels_pool p
    WHERE p.rating >= 0 AND NOT EXISTS (SELECT 1 FROM ideas i WHERE i.brand_id = p.brand_id AND lower(i.title) = lower(p.text));
  ALTER TABLE gen_jobs ADD COLUMN prompt_id TEXT;
  ALTER TABLE prompts ADD COLUMN scenes_en TEXT NOT NULL DEFAULT '';
  `,
  // 49: Markanın web sitesi (kurulumda ya da sonradan girilir; okunan bilgiler bilgi kartı ve fikir olur)
  `
  ALTER TABLE brands ADD COLUMN website TEXT NOT NULL DEFAULT '';
  `,
  // 50: Üç katmanlı marka hafızası: katman (sabit / öğrenilen / dönemsel), onay durumu, geçerlilik tarihleri, güven
  //     seviyesi ve değişiklik geçmişi. Mevcut kartlar onaylı ve sabit sayılır (kampanyalar dönemsel); davranış değişmez.
  `
  ALTER TABLE brand_facts ADD COLUMN layer TEXT NOT NULL DEFAULT 'sabit';
  ALTER TABLE brand_facts ADD COLUMN status TEXT NOT NULL DEFAULT 'onayli';
  ALTER TABLE brand_facts ADD COLUMN valid_from TEXT;
  ALTER TABLE brand_facts ADD COLUMN valid_to TEXT;
  ALTER TABLE brand_facts ADD COLUMN confidence TEXT NOT NULL DEFAULT 'yuksek';
  UPDATE brand_facts SET layer = 'donemsel' WHERE category = 'kampanya';
  CREATE TABLE brand_fact_history (
    id TEXT PRIMARY KEY,
    fact_id TEXT NOT NULL,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    action TEXT NOT NULL,
    before TEXT,
    after TEXT,
    actor TEXT NOT NULL DEFAULT 'kullanici'
  );
  CREATE INDEX idx_fact_history ON brand_fact_history(fact_id, at);
  `,
  // 51: Ölçülebilir hedefler ve içerik sütunları (O3). Hedef: marka + tür + ay, hedef değer ve elle girilen gerçekleşen
  // (izlenme/erişim/takipçi/etkileşim takvimdeki sonuçlardan hesaplanır). Sütun: ad, hedef pay (%), açıklama.
  // İçeriğe sütun, amaç, kitle ve kanal atanabilir (hepsi boş olabilir; eski içerikler etkilenmez).
  `
  CREATE TABLE brand_goals (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    month TEXT NOT NULL,
    target REAL NOT NULL,
    actual REAL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_brand_goals ON brand_goals(brand_id, month, kind);
  CREATE TABLE brand_pillars (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    share INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_brand_pillars ON brand_pillars(brand_id, sort);
  ALTER TABLE contents ADD COLUMN pillar_id TEXT REFERENCES brand_pillars(id) ON DELETE SET NULL;
  ALTER TABLE contents ADD COLUMN purpose TEXT NOT NULL DEFAULT '';
  ALTER TABLE contents ADD COLUMN audience TEXT NOT NULL DEFAULT '';
  ALTER TABLE contents ADD COLUMN platform TEXT NOT NULL DEFAULT '';
  `,
  // 52: İçerik projesi (O2; takvim içeriği = proje). Yayın bağlantısı; yapay zekâ harcamasının içeriğe ve bağlı kayda
  // (post, prompt, senaryo) bağlanması; içeriğin zaman çizelgesi (durum, tarih, yayın, sonuç, metin yazımı…).
  `
  ALTER TABLE contents ADD COLUMN published_url TEXT NOT NULL DEFAULT '';
  ALTER TABLE ai_usage ADD COLUMN content_id TEXT;
  ALTER TABLE ai_usage ADD COLUMN ref TEXT;
  CREATE INDEX idx_ai_usage_content ON ai_usage(content_id);
  CREATE INDEX idx_ai_usage_ref ON ai_usage(ref);
  CREATE TABLE content_events (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    ref TEXT
  );
  CREATE INDEX idx_content_events ON content_events(content_id, at);
  `,
  `
  CREATE TABLE brand_sources (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    last_fetched_at TEXT NOT NULL DEFAULT '',
    last_error TEXT NOT NULL DEFAULT '',
    last_count INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_brand_sources ON brand_sources(brand_id);
  CREATE TABLE brand_source_items (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES brand_sources(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    fetched_at TEXT NOT NULL
  );
  CREATE INDEX idx_brand_source_items ON brand_source_items(brand_id, fetched_at);
  `,
  // v54: çekilen kaynak başlıklarının tam makale metnini de önbellekte sakla (post üretiminde bekleme olmaz)
  `ALTER TABLE brand_source_items ADD COLUMN body TEXT NOT NULL DEFAULT '';`
];

export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  repairSchema(db);
  return db;
}

// Şema onarımı: veritabanı sürüm numarası ilerde olduğu hâlde bir göçün tablosu ya da sütunu eksikse (ör. başka bir
// kopyadan gelen ya da yarıda kalmış veri: "no such table: brand_pillars") eksikler eklenir. Başvuru şeması bütün
// göçler boş bir bellek veritabanında çalıştırılarak çıkarılır. Yalnız ekleme yapılır; hiçbir veri silinmez.
let referenceSchema = null;
function reference() {
  if (referenceSchema) return referenceSchema;
  const ref = new DatabaseSync(':memory:');
  try {
    for (const m of MIGRATIONS) ref.exec(m);
    const objs = ref.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all();
    const cols = Object.fromEntries(objs.filter(o => o.type === 'table').map(o => [o.name, ref.prepare(`PRAGMA table_info("${o.name}")`).all()]));
    referenceSchema = { objs, cols };
  } finally { ref.close(); }
  return referenceSchema;
}
export function repairSchema(db) {
  const { objs, cols } = reference();
  const have = new Set(db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all().map(r => r.name));
  const fixed = [];
  for (const o of objs.filter(x => x.type === 'table' && !have.has(x.name))) { db.exec(o.sql); fixed.push(`tablo ${o.name}`); have.add(o.name); }
  for (const [t, list] of Object.entries(cols)) {
    const present = new Set(db.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name));
    for (const c of list.filter(x => !present.has(x.name))) {
      // NOT NULL yalnız varsayılan değer varsa eklenebilir
      const def = c.dflt_value != null ? ` DEFAULT ${c.dflt_value}` : '';
      db.exec(`ALTER TABLE "${t}" ADD COLUMN "${c.name}" ${c.type || ''}${c.notnull && def ? ' NOT NULL' : ''}${def}`);
      fixed.push(`sütun ${t}.${c.name}`);
    }
  }
  for (const o of objs.filter(x => x.type === 'index' && !have.has(x.name))) { try { db.exec(o.sql); fixed.push(`dizin ${o.name}`); } catch { /* dizin oluşturulamazsa çalışma sürer */ } }
  if (fixed.length) console.log(`  Veritabanı onarıldı (eksikler eklendi): ${fixed.join(', ')}`);
  return fixed;
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
