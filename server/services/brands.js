// Marka profili, görsel kimlik ve marka hafızası.
// Her sorgu marka sahibine göre süzülür; bir markanın verisi başka markanın işlemine karışmaz.
import { badRequest, notFound, newId, now, text, HEX, parseJson } from '../lib/http.js';

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
    competitors: row.competitors,
    slogan: row.slogan,
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
  const logActivity = (brandId, type, summary) =>
    db.prepare('INSERT INTO activity (id, brand_id, type, summary, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(newId(), brandId, type, summary, now());

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
      const id = newId();
      const t = now();
      db.prepare(`INSERT INTO brands (id, owner_id, name, sector, description, audience, character, tone, goals, competitors, slogan, colors, fonts, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, ownerId, profile.name, profile.sector, profile.description, profile.audience, profile.character, profile.tone,
          profile.goals, profile.competitors, profile.slogan, JSON.stringify(colors), JSON.stringify(fonts), t, t);
      logActivity(id, 'brand.created', `${profile.name} markası oluşturuldu`);
      return service.get(id);
    },

    update(brandId, body) {
      const current = service.get(brandId);
      const profile = readProfile(body || {}, { partial: true });
      const colors = normalizeColors(body.colors);
      const fonts = normalizeFonts(body.fonts);
      const next = Object.assign({}, current, profile);
      db.prepare(`UPDATE brands SET name = ?, sector = ?, description = ?, audience = ?, character = ?, tone = ?, goals = ?,
        competitors = ?, slogan = ?, colors = ?, fonts = ?, updated_at = ? WHERE id = ? AND owner_id = ?`)
        .run(next.name, next.sector, next.description, next.audience, next.character, next.tone, next.goals,
          next.competitors, next.slogan, JSON.stringify(colors || current.colors), JSON.stringify(fonts || current.fonts),
          now(), current.id, ownerId);
      logActivity(current.id, 'brand.updated', 'Marka kimliği güncellendi');
      return service.get(current.id);
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
        line('Ana renk', b.colors.primary),
        line('İkincil renkler', b.colors.secondary.join(', ')),
        line('Başlık / gövde fontu', [b.fonts.heading, b.fonts.body].filter(Boolean).join(' / ')),
        line('Logo', counts.logo ? 'yüklü' : ''),
        line('Maskot pozları', mascots.join(', ') || (counts.mascot ? `${counts.mascot} görsel` : '')),
        recentIdeas.length ? 'Daha önce üretilen fikirler (tekrar etme):\n' + recentIdeas.map(i => `- ${i.title} (${i.category})`).join('\n') : null,
        favIdeas.length ? 'Ekibin beğendiği fikirler (bu tarzı örnek al):\n' + favIdeas.map(i => `- ${i.title}`).join('\n') : null
      ].filter(Boolean).join('\n');
    }
  };
  return service;
}
