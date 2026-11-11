// Aşama 4.1–4.2: Prompt Studio — üretim, elle kaydetme, düzenleme, geliştirme işlemleri, seçili bölüm, sürüme dönme, marka izolasyonu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';

function promptProvider() {
  let n = 0;
  return fakeProvider([p => {
    n++;
    if (p.includes('YALNIZCA şu bölümünü')) {
      const sel = p.match(/"""([\s\S]*?)"""/)[1];
      const cur = p.match(/MEVCUT PROMPT:\n([\s\S]*?)\n\nYAPILACAK/)[1];
      return { title: 'Kafe sabahı', prompt: cur.replace(sel, 'at night under neon lights'), promptTr: 'Gece neon ışıklar altında' };
    }
    return { title: 'Kafe sabahı', prompt: `Prompt v${n}: a cheerful coffee bean mascot runs across campus`, promptTr: `Türkçe v${n}` };
  }]);
}

test('Prompt Studio: üret, düzenle, geliştir, seçili bölüm, girişi değiştir, sürüme dön, sil', async () => {
  const provider = promptProvider();
  const s = await startServer({ aiProvider: provider });
  try {
    const brand = (await s.request('POST', '/api/brands', { name: 'Kahve Evi', tone: 'Samimi' })).data.brand;
    const other = (await s.request('POST', '/api/brands', { name: 'Başka Marka' })).data.brand;
    const meta = (await s.request('GET', '/api/meta')).data.prompts;
    assert.equal(Object.keys(meta.kinds).length, 8);
    assert.ok(meta.actions.kamera && meta.actions.alternatif);

    assert.equal((await s.request('POST', `/api/brands/${brand.id}/prompts`, { kind: 'yok', brief: 'x' })).status, 400);
    const c = await s.request('POST', `/api/brands/${brand.id}/prompts`, { kind: 'maskot', brief: 'Maskot sabah kampüste koşuyor', lang: 'en' });
    assert.equal(c.status, 201, JSON.stringify(c.data));
    const p = c.data.prompt;
    assert.equal(p.english, true);
    assert.match(p.text, /mascot/);
    assert.equal(p.textTr, 'Türkçe v1');
    assert.equal(p.versions.length, 1);
    assert.ok(p.ai && p.ai.modelLabel);
    const first = provider.calls.at(-1);
    assert.match(first.prompt, /Kahve Evi/, 'marka hafızası istemde olmalı');
    assert.match(first.prompt, /Maskot animasyonu/);

    // Elle düzenleme sürüm oluşturur; yalnız başlık değişince oluşturmaz
    const ed = await s.request('PUT', `/api/brands/${brand.id}/prompts/${p.id}`, { text: 'A mascot walks in the morning sun', title: 'Yeni ad' });
    assert.equal(ed.data.prompt.versions.length, 2);
    assert.equal((await s.request('PUT', `/api/brands/${brand.id}/prompts/${p.id}`, { title: 'Yine yeni ad' })).data.prompt.versions.length, 2);

    // Hazır işlem
    const imp = await s.request('POST', `/api/brands/${brand.id}/prompts/${p.id}/improve`, { action: 'kamera' });
    assert.equal(imp.status, 200, JSON.stringify(imp.data));
    assert.match(provider.calls.at(-1).prompt, /Kamera açısını/);
    assert.match(provider.calls.at(-1).prompt, /A mascot walks in the morning sun/, 'mevcut prompt istemde olmalı');
    assert.equal(imp.data.prompt.versions[0].note, 'Kamera açısını değiştir');

    // Seçili bölüm: yalnızca o kısım değişir; prompt'ta olmayan seçim reddedilir
    const cur = imp.data.prompt.text;
    assert.equal((await s.request('POST', `/api/brands/${brand.id}/prompts/${p.id}/improve`, { action: 'secili', selection: 'olmayan metin' })).status, 400);
    const sel = await s.request('POST', `/api/brands/${brand.id}/prompts/${p.id}/improve`, { action: 'secili', selection: 'runs across campus', instruction: 'gece olsun' });
    assert.equal(sel.data.prompt.text, cur.replace('runs across campus', 'at night under neon lights'));
    assert.match(provider.calls.at(-1).prompt, /gece olsun/);

    // Girişi değiştir
    const gb = await s.request('POST', `/api/brands/${brand.id}/prompts/${p.id}/improve`, { action: 'girdi', brief: 'Maskot kütüphanede uyuyakalıyor' });
    assert.equal(gb.data.prompt.brief, 'Maskot kütüphanede uyuyakalıyor');
    assert.match(provider.calls.at(-1).prompt, /YENİ İSTEK:\nMaskot kütüphanede uyuyakalıyor/);

    // Önceki sürüme dön
    const versions = gb.data.prompt.versions;
    const editV = versions.find(v => v.note === 'Elle düzenlendi');
    const back = await s.request('POST', `/api/brands/${brand.id}/prompts/${p.id}/restore`, { versionId: editV.id });
    assert.equal(back.data.prompt.text, 'A mascot walks in the morning sun');
    assert.equal(back.data.prompt.brief, 'Maskot sabah kampüste koşuyor');
    assert.equal(back.data.prompt.versions[0].note, 'Önceki sürüme dönüldü');
    const v = await s.request('GET', `/api/brands/${brand.id}/prompts/${p.id}/versions/${editV.id}`);
    assert.equal(v.data.version.text, 'A mascot walks in the morning sun');

    // Elle kaydetme (AI'sız), Türkçe tür, liste/filtre/arama, favori
    const m = await s.request('POST', `/api/brands/${brand.id}/prompts`, { manual: true, kind: 'metin', text: 'Bu ürün için samimi bir açıklama yaz.' });
    assert.equal(m.status, 201);
    assert.equal(m.data.prompt.english, false);
    await s.request('PUT', `/api/brands/${brand.id}/prompts/${m.data.prompt.id}`, { favorite: true });
    const all = (await s.request('GET', `/api/brands/${brand.id}/prompts`)).data.prompts;
    assert.equal(all.length, 2);
    assert.equal(all[0].id, m.data.prompt.id, 'favori üstte');
    assert.equal((await s.request('GET', `/api/brands/${brand.id}/prompts?kind=maskot`)).data.prompts.length, 1);
    assert.equal((await s.request('GET', `/api/brands/${brand.id}/prompts?q=samimi`)).data.prompts.length, 1);

    // Marka izolasyonu
    assert.equal((await s.request('GET', `/api/brands/${other.id}/prompts/${p.id}`)).status, 404);
    assert.equal((await s.request('GET', `/api/brands/${other.id}/prompts`)).data.prompts.length, 0);

    assert.equal((await s.request('DELETE', `/api/brands/${brand.id}/prompts/${p.id}`)).status, 204);
    assert.equal((await s.request('GET', `/api/brands/${brand.id}/prompts/${p.id}`)).status, 404);
  } finally { await s.stop(); }
});

test('7.5 önce Türkçe: İngilizce türler Türkçe yazılır, tek tıkla çevrilir; Türkçesi saklanır; sürüme dönünce dil de döner', async () => {
  const provider = fakeProvider([p => {
    if (p.startsWith('PROMPT ÇEVİRİSİ')) return { prompt: 'Two students in a campus garden, medium shot, golden light, 35mm f/1.8, clean composition, no text, no logo' };
    return { title: 'Kampüs sabahı', prompt: 'Kampüs bahçesinde iki öğrenci, orta plan, altın saat ışığı, 35mm f/1.8, temiz kompozisyon, yazı yok, logo yok', promptTr: 'yok sayılmalı' };
  }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const brand = (await s.request('POST', '/api/brands', { name: 'Dil' })).data.brand;
    const c = (await s.request('POST', `/api/brands/${brand.id}/prompts`, { kind: 'gorsel', brief: 'Kampüste sabah' })).data.prompt;
    assert.equal(c.lang, 'tr');
    assert.match(c.text, /Kampüs bahçesinde/);
    assert.equal(c.textTr, '', 'Türkçe yazımda Türkçesi alanı boş');
    assert.match(provider.calls.at(-1).prompt, /Prompt TÜRKÇE yazılır[\s\S]*şu kapanışla bitir: "temiz kompozisyon, yazı yok/);

    const t = (await s.request('POST', `/api/brands/${brand.id}/prompts/${c.id}/translate`, {})).data.prompt;
    assert.equal(t.lang, 'en');
    assert.match(t.text, /^Two students/);
    assert.match(t.textTr, /^Kampüs bahçesinde/, 'Türkçesi saklanır');
    assert.match(provider.calls.at(-1).prompt, /PROMPT ÇEVİRİSİ[\s\S]*no text, no letters[\s\S]*TÜRKÇE PROMPT:\nKampüs bahçesinde/);
    assert.equal(t.versions[0].note, 'İngilizceye çevrildi');
    assert.equal((await s.request('POST', `/api/brands/${brand.id}/prompts/${c.id}/translate`, {})).status, 400, 'zaten İngilizce');

    // İlk (Türkçe) sürüme dönünce dil de Türkçeye döner
    const first = t.versions.find(v => v.note === 'İlk üretim');
    const back = (await s.request('POST', `/api/brands/${brand.id}/prompts/${c.id}/restore`, { versionId: first.id })).data.prompt;
    assert.equal(back.lang, 'tr');
    assert.match(back.text, /Kampüs bahçesinde/);

    // İstenirse doğrudan İngilizce; Türkçe türlerde çeviri yok
    const en = (await s.request('POST', `/api/brands/${brand.id}/prompts`, { kind: 'gorsel', brief: 'x', lang: 'en' })).data.prompt;
    assert.equal(en.lang, 'en');
    const metin = (await s.request('POST', `/api/brands/${brand.id}/prompts`, { kind: 'metin', brief: 'Açıklama yaz' })).data.prompt;
    assert.equal((await s.request('POST', `/api/brands/${brand.id}/prompts/${metin.id}/translate`, {})).status, 400);
  } finally { await s.stop(); }
});
