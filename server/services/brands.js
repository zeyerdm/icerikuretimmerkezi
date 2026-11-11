// Marka profili, görsel kimlik ve marka hafızası.
// Her sorgu marka sahibine göre süzülür; bir markanın verisi başka markanın işlemine karışmaz.
import { badRequest, notFound, newId, now, text, HEX, parseJson } from '../lib/http.js';
import { parseFolder, folderUrl } from './drive.js';
import { engagementRate } from './workspace.js';

export const PROFILE_FIELDS = {
  name: { label: 'Marka adı', max: 80, required: true },
  sector: { label: 'Sektör', max: 120 },
  description: { label: 'Marka açıklaması', max: 1500 },
  audience: { label: 'Hedef kitle', max: 1000 },
  character: { label: 'Marka karakteri', max: 1000 },
  tone: { label: 'İletişim dili', max: 1000 },
  goals: { label: 'İçerik üretim hedefleri', max: 1000 },
  competitors: { label: 'Rakipler ve referans markalar', max: 1000 },
  slogan: { label: 'Marka sloganı', max: 160 }
};

// Font seçenekleri: Google Fonts'ta bulunan, Türkçe karakterleri destekleyen aileler
export const FONT_OPTIONS = [
  'Plus Jakarta Sans', 'Inter', 'Poppins', 'Montserrat', 'Outfit', 'Manrope', 'DM Sans', 'Nunito',
  'Rubik', 'Work Sans', 'Raleway', 'Lora', 'Playfair Display', 'Merriweather', 'Libre Baskerville',
  'Space Grotesk', 'Bebas Neue', 'Anton', 'Oswald', 'Pacifico', 'Caveat'
];

const COLOR_LIST_MAX = 6;

function normalizeColors(input) {
  if (input == null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) throw badRequest('Renkler geçersiz.');
  const hex = (v, field) => {
    if (v == null || v === '') return '';
    if (typeof v !== 'string' || !HEX.test(v)) throw badRequest(`${field} #RRGGBB biçiminde olmalı.`);
    return v.toLowerCase();
  };
  const list = (v, field) => {
    if (v == null) return [];
    if (!Array.isArray(v)) throw badRequest(`${field} liste olmalı.`);
    if (v.length > COLOR_LIST_MAX) throw badRequest(`${field} en fazla ${COLOR_LIST_MAX} renk içerebilir.`);
    return v.map(c => hex(c, field)).filter(Boolean);
  };
  return {
    primary: hex(input.primary, 'Ana renk'),
    secondary: list(input.secondary, 'İkincil renkler'),
    backgrounds: list(input.backgrounds, 'Arka plan renkleri'),
    heading: hex(input.heading, 'Başlık yazı rengi'),
    body: hex(input.body, 'Gövde yazı rengi')
  };
}

function normalizeFonts(input) {
  if (input == null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) throw badRequest('Fontlar geçersiz.');
  const font = (v, field) => {
    if (v == null || v === '') return '';
    if (!FONT_OPTIONS.includes(v)) throw badRequest(`${field} listedeki fontlardan biri olmalı.`);
    return v;
  };
  return { heading: font(input.heading, 'Başlık fontu'), body: font(input.body, 'Gövde fontu') };
}

export function toBrand(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    sector: row.sector,
    description: row.description,
    audience: row.audience,
    character: row.character,
    tone: row.tone,
    goals: row.goals,
    monthlyGoal: row.monthly_goal || 0,
    competitors: row.competitors,
    slogan: row.slogan,
    isDemo: Boolean(row.is_demo),
    driveFolderId: row.drive_folder || '',
    driveFolderUrl: folderUrl(row.drive_folder || ''),
    colors: Object.assign({ primary: '', secondary: [], backgrounds: [], heading: '', body: '' }, parseJson(row.colors, {})),
    fonts: Object.assign({ heading: '', body: '' }, parseJson(row.fonts, {})),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Marka kimliğinin ne kadarının doldurulduğu: ana ekranda "kimliği tamamla" yönlendirmesi için
export function identityCompleteness(brand, assetCounts) {
  const checks = [
    ['sector', 'Sektör'], ['description', 'Marka açıklaması'], ['audience', 'Hedef kitle'],
    ['character', 'Marka karakteri'], ['tone', 'İletişim dili'], ['goals', 'İçerik hedefleri']
  ].map(([k, label]) => ({ label, done: Boolean(brand[k]) }));
  checks.push({ label: 'Ana renk', done: Boolean(brand.colors.primary) });
  checks.push({ label: 'Fontlar', done: Boolean(brand.fonts.heading && brand.fonts.body) });
  checks.push({ label: 'Logo', done: (assetCounts.logo || 0) > 0 });
  const done = checks.filter(c => c.done).length;
  return { percent: Math.round((done / checks.length) * 100), missing: checks.filter(c => !c.done).map(c => c.label) };
}

export function createBrandService(db, ownerId) {
  // Etkinlik akışı: brandId boş olabilir (ör. markasız görev veya not)
  const logActivity = (brandId, type, summary) =>
    db.prepare('INSERT INTO activity (id, owner_id, brand_id, type, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newId(), ownerId, brandId || null, type, summary, now());

  function readProfile(body, { partial }) {
    const out = {};
    for (const [key, def] of Object.entries(PROFILE_FIELDS)) {
      if (partial && !(key in body)) continue;
      out[key] = text(body[key], { field: def.label, max: def.max, required: def.required });
    }
    return out;
  }

  const service = {
    list() {
      return db.prepare('SELECT * FROM brands WHERE owner_id = ? ORDER BY updated_at DESC').all(ownerId).map(toBrand);
    },

    // Yetki kontrolü: marka bu kullanıcıya ait değilse 404 (varlığı da sızdırılmaz)
    get(brandId) {
      const row = db.prepare('SELECT * FROM brands WHERE id = ? AND owner_id = ?').get(String(brandId), ownerId);
      if (!row) throw notFound('Marka bulunamadı.');
      return toBrand(row);
    },

    create(body) {
      const profile = readProfile(body || {}, { partial: false });
      const colors = normalizeColors(body.colors) || normalizeColors({});
      const fonts = normalizeFonts(body.fonts) || normalizeFonts({});
      const drive = parseFolder(body.driveFolder);
      const id = newId();
      const t = now();
      db.prepare(`INSERT INTO brands (id, owner_id, name, sector, description, audience, character, tone, goals, competitors, slogan, colors, fonts, drive_folder, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, ownerId, profile.name, profile.sector, profile.description, profile.audience, profile.character, profile.tone,
          profile.goals, profile.competitors, profile.slogan, JSON.stringify(colors), JSON.stringify(fonts), drive, t, t);
      logActivity(id, 'brand.created', `${profile.name} markası oluşturuldu`);
      return service.get(id);
    },

    update(brandId, body) {
      const current = service.get(brandId);
      const profile = readProfile(body || {}, { partial: true });
      const colors = normalizeColors(body.colors);
      const fonts = normalizeFonts(body.fonts);
      const next = Object.assign({}, current, profile);
      const drive = 'driveFolder' in (body || {}) ? parseFolder(body.driveFolder) : current.driveFolderId;
      db.prepare(`UPDATE brands SET name = ?, sector = ?, description = ?, audience = ?, character = ?, tone = ?, goals = ?,
        competitors = ?, slogan = ?, colors = ?, fonts = ?, drive_folder = ?, updated_at = ? WHERE id = ? AND owner_id = ?`)
        .run(next.name, next.sector, next.description, next.audience, next.character, next.tone, next.goals,
          next.competitors, next.slogan, JSON.stringify(colors || current.colors), JSON.stringify(fonts || current.fonts),
          drive, now(), current.id, ownerId);
      // Aylık içerik hedefi (0–200; 0 = hedef yok)
      if ('monthlyGoal' in (body || {})) {
        const g = Math.round(Number(body.monthlyGoal));
        db.prepare('UPDATE brands SET monthly_goal = ? WHERE id = ? AND owner_id = ?').run(Number.isFinite(g) ? Math.max(0, Math.min(200, g)) : 0, current.id, ownerId);
      }
      logActivity(current.id, 'brand.updated', 'Marka kimliği güncellendi');
      return service.get(current.id);
    },

    findDemo() {
      const row = db.prepare('SELECT * FROM brands WHERE owner_id = ? AND is_demo = 1 LIMIT 1').get(ownerId);
      return toBrand(row);
    },

    markDemo(brandId) {
      db.prepare('UPDATE brands SET is_demo = 1 WHERE id = ? AND owner_id = ?').run(brandId, ownerId);
      return service.get(brandId);
    },

    remove(brandId) {
      const brand = service.get(brandId);
      db.prepare('DELETE FROM brands WHERE id = ? AND owner_id = ?').run(brand.id, ownerId);
      return brand;
    },

    assetCounts(brandId) {
      const counts = {};
      db.prepare('SELECT category, COUNT(*) AS n FROM assets WHERE brand_id = ? GROUP BY category').all(brandId)
        .forEach(r => { counts[r.category] = r.n; });
      return counts;
    },

    logActivity,

    // Yönetim merkezi: bütün markalardaki ve markasız son işlemler, marka adı ve rengiyle
    recentActivityAll(limit = 12) {
      return db.prepare(`SELECT a.id, a.type, a.summary, a.created_at AS createdAt, a.brand_id AS brandId, b.name AS brandName, b.colors AS colors
        FROM activity a LEFT JOIN brands b ON b.id = a.brand_id WHERE a.owner_id = ? ORDER BY a.created_at DESC, a.rowid DESC LIMIT ?`)
        .all(ownerId, limit).map(r => ({ id: r.id, type: r.type, summary: r.summary, createdAt: r.createdAt, brandId: r.brandId, brandName: r.brandName,
          brandColor: r.colors ? (parseJson(r.colors, {}).primary || null) : null }));
    },

    // Markanın son çalışma tarihi: son etkinlik (yoksa güncellenme tarihi)
    lastWorkedAt(brandId) {
      const row = db.prepare('SELECT MAX(created_at) AS t FROM activity WHERE brand_id = ?').get(brandId);
      return row && row.t ? row.t : null;
    },

    recentActivity(brandId, limit = 8) {
      return db.prepare('SELECT id, type, summary, created_at AS createdAt FROM activity WHERE brand_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?')
        .all(brandId, limit);
    },

    // Marka hafızası: AI'a gönderilen, yalnızca bu markaya ait bağlam
    memory(brandId) {
      const b = service.get(brandId);
      const counts = service.assetCounts(b.id);
      const mascots = db.prepare("SELECT label FROM assets WHERE brand_id = ? AND category = 'mascot' AND label != '' LIMIT 12").all(b.id).map(r => r.label);
      const recentIdeas = db.prepare('SELECT title, category FROM ideas WHERE brand_id = ? ORDER BY created_at DESC LIMIT 20').all(b.id);
      const favIdeas = db.prepare('SELECT title FROM ideas WHERE brand_id = ? AND favorite = 1 ORDER BY created_at DESC LIMIT 8').all(b.id);
      // Paylaşım sonuçlarından öğrenme: en çok ve en az tutan içerikler, giriş cümleleri ve temalar
      const measured = db.prepare("SELECT title, type, hook, theme, metrics FROM contents WHERE brand_id = ? AND metrics <> '' ORDER BY scheduled_at DESC LIMIT 60").all(b.id)
        .map(r => Object.assign(r, { rate: engagementRate(parseJson(r.metrics, null)) })).filter(r => r.rate != null).sort((x, y) => y.rate - x.rate);
      const perfLine = r => `- ${r.title} (${r.type}, etkileşim %${r.rate})${r.hook ? ` · giriş: "${r.hook}"` : ''}${r.theme ? ` · tema: ${r.theme}` : ''}`;
      const best = measured.slice(0, 5);
      // Akıllı hafıza: yasaklı kelimeler, tercih edilen ifadeler, bilgi kartları
      const hm = db.prepare('SELECT banned_words, preferred_phrases FROM brands WHERE id = ?').get(b.id) || {};
      const banned = parseJson(hm.banned_words, []);
      const preferred = parseJson(hm.preferred_phrases, []);
      const facts = db.prepare('SELECT category, title, content FROM brand_facts WHERE brand_id = ? ORDER BY category, updated_at DESC LIMIT 40').all(b.id);
      const rivals = db.prepare("SELECT name, analysis FROM competitors WHERE brand_id = ? AND analysis <> '' ORDER BY updated_at DESC LIMIT 5").all(b.id)
        .map(r => ({ name: r.name, a: parseJson(r.analysis, {}) })).filter(r => (r.a.gaps || []).length);
      const worst = measured.length >= 6 ? measured.slice(-3).reverse() : [];
      const line = (label, v) => (v ? `${label}: ${v}` : null);
      return [
        line('Marka adı', b.name),
        line('Sektör', b.sector),
        line('Açıklama', b.description),
        line('Hedef kitle', b.audience),
        line('Marka karakteri', b.character),
        line('İletişim dili', b.tone),
        line('İçerik üretim hedefleri', b.goals),
        line('Rakipler ve referans markalar', b.competitors),
        line('Slogan', b.slogan),
        banned.length ? `ASLA KULLANMA (yasaklı kelime ve ifadeler; metinde, başlıkta, hashtag'de geçmesin): ${banned.join(', ')}` : null,
        preferred.length ? `Tercih edilen ifadeler / imza cümleler (uygun yerde kullan, zorlama): ${preferred.join(' | ')}` : null,
        rivals.length ? 'Rakip analizlerinden boşluklar (bunlardan yararlan; rakibi kopyalama):\n' + rivals.map(r => `- ${r.name}: ${r.a.gaps.slice(0, 3).join('; ')}`).join('\n') : null,
        facts.length ? 'Marka hakkında bilgiler (doğru kabul et; burada olmayan fiyat, adres, kampanya gibi bilgileri uydurma):\n' + facts.map(f => `- [${f.category}] ${f.title}: ${f.content}`).join('\n') : null,
        line('Ana renk', b.colors.primary),
        line('İkincil renkler', b.colors.secondary.join(', ')),
        line('Başlık / gövde fontu', [b.fonts.heading, b.fonts.body].filter(Boolean).join(' / ')),
        line('Logo', counts.logo ? 'yüklü' : ''),
        line('Maskot pozları', mascots.join(', ') || (counts.mascot ? `${counts.mascot} görsel` : '')),
        recentIdeas.length ? 'Daha önce üretilen fikirler (tekrar etme):\n' + recentIdeas.map(i => `- ${i.title} (${i.category})`).join('\n') : null,
        favIdeas.length ? 'Ekibin beğendiği fikirler (bu tarzı örnek al):\n' + favIdeas.map(i => `- ${i.title}`).join('\n') : null,
        best.length ? 'Paylaşım sonuçlarına göre EN ÇOK TUTAN içerikler (giriş cümlesi, tema ve yaklaşımlarından öğren; kopyalama):\n' + best.map(perfLine).join('\n') : null,
        worst.length ? 'En az tutan içerikler (bu yaklaşımlardan kaçın):\n' + worst.map(perfLine).join('\n') : null
      ].filter(Boolean).join('\n');
    }
  };
  return service;
}
