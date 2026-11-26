// Context Builder (Aşama 04): yapay zekâya işe göre yalnız ilgili marka hafızası gider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './helpers.js';
import { openDb } from '../server/db.js';
import { createBrandService } from '../server/services/brands.js';

test('Bağlam: işe göre bölümler (tam, hafif, metin, denetim, görsel); içerik sütunları fikir bağlamında', async () => {
  const s = await startServer();
  let db = null;
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Bağlamlı', tone: 'Samimi', colors: { primary: '#aa3300', secondary: [], backgrounds: [] } })).data.brand;
    await s.request('PUT', `/api/brands/${b.id}/memory`, { banned: ['ucuz'], preferred: ['Mola zamanı'] });
    await s.request('POST', `/api/brands/${b.id}/memory/facts`, { category: 'fiyat', title: 'Menü', content: 'Latte 100 TL' });
    await s.request('POST', `/api/brands/${b.id}/ideas`, { title: 'Kahve rehberi', category: 'egitici' });
    await s.request('POST', `/api/brands/${b.id}/pillars`, { name: 'Eğitici', share: 40 });
    db = openDb(path.join(s.dataDir, fs.readdirSync(s.dataDir).find(f => f.endsWith('.db'))));
    const owner = db.prepare('SELECT owner_id FROM brands WHERE id = ?').get(b.id).owner_id;
    const br = createBrandService(db, owner);
    const m = o => br.memory(b.id, o);
    const tam = m({});
    for (const x of [/İletişim dili: Samimi/, /ASLA KULLANMA.*ucuz/, /Mola zamanı/, /Latte 100 TL/, /Ana renk: #aa3300/, /Daha önce üretilen fikirler/, /İçerik sütunları.*\n- Eğitici \(%40\)/]) assert.match(tam, x);
    // Metin: kimlik, kurallar, bilgiler (renk ve fikir listesi yok)
    const metin = m({ task: 'metin' });
    assert.match(metin, /ASLA KULLANMA.*ucuz/); assert.match(metin, /Latte 100 TL/); assert.match(metin, /İletişim dili: Samimi/);
    assert.doesNotMatch(metin, /Ana renk/); assert.doesNotMatch(metin, /Daha önce üretilen fikirler/); assert.doesNotMatch(metin, /İçerik sütunları/);
    // Görsel: renk var, fikir listesi yok
    const gorsel = m({ task: 'gorsel' });
    assert.match(gorsel, /Ana renk: #aa3300/); assert.match(gorsel, /ASLA KULLANMA/); assert.doesNotMatch(gorsel, /Daha önce üretilen fikirler/);
    // Denetim: kurallar ve bilgiler
    const den = m({ task: 'denetim' });
    assert.match(den, /ASLA KULLANMA/); assert.match(den, /Latte 100 TL/); assert.doesNotMatch(den, /Ana renk/);
    // Hafif (sohbet): eski davranış, fikir ve performans listeleri yok
    const hafif = m({ light: true });
    assert.match(hafif, /Ana renk/); assert.doesNotMatch(hafif, /Daha önce üretilen fikirler/);
    for (const x of [metin, gorsel, den, hafif]) assert.ok(x.length < tam.length);
  } finally { if (db) db.close(); await s.stop(); }
});
