// 7.6 Kalite kontrolü: kodla denetim, eksikte bir kez yeniden deneme, rozetler için sonuç.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';
import { checkPrompt } from '../server/services/promptQuality.js';

const GOOD_EN = 'Two university students sitting at a wooden table in a sun-drenched campus courtyard, holding steaming coffee cups, medium shot, eye-level angle, soft golden morning sunlight creating a warm glow, 35mm lens with shallow depth of field at f/1.8, a palette of burnt orange tones and natural greens, a cozy and sincere atmosphere, photorealistic cinematic photography, clean composition, no text, no letters, no words, no watermark, no logo, no subtitles, no UI elements';
const GOOD_TR = 'Kampüs bahçesinde ahşap bir masada oturan, ellerinde dumanı tüten kahve fincanları olan iki üniversite öğrencisi, orta plan, göz hizası, sabahın altın saat ışığı sıcak bir parıltı yaratıyor, 35mm lens ve f/1.8 ile sığ alan derinliği, yanık turuncu ve doğal yeşil tonlardan oluşan bir renk paleti, samimi ve huzurlu bir atmosfer, gerçekçi sinematik fotoğraf, temiz kompozisyon, yazı yok, harf yok, kelime yok, filigran yok, logo yok, altyazı yok, arayüz öğesi yok';

test('7.6 denetim: iyi İngilizce ve Türkçe prompt geçer; eksikler, parametre, HEX, yasaklı kelime ve isim yakalanır', () => {
  assert.equal(checkPrompt('gorsel', GOOD_EN, 'en').ok, true, JSON.stringify(checkPrompt('gorsel', GOOD_EN, 'en').missing));
  assert.equal(checkPrompt('gorsel', GOOD_TR, 'tr').ok, true, JSON.stringify(checkPrompt('gorsel', GOOD_TR, 'tr').missing));
  const bad = checkPrompt('gorsel', 'A cozy 3D Pixar-style scene of students with coffee, #c2410c accents --ar 16:9', 'en');
  assert.equal(bad.ok, false);
  const failed = bad.checks.filter(c => !c.ok).map(c => c.key);
  for (const k of ['shot', 'lens', 'negative', 'length', 'params', 'hex']) assert.ok(failed.includes(k), `${k} yakalanmadı: ${failed}`);
  assert.ok(bad.score < 60);
  const banned = checkPrompt('gorsel', GOOD_EN + ' with a cheap discount', 'en', { banned: ['Discount'] });
  assert.match(banned.checks.find(c => c.key === 'banned').msg, /Discount/);
  const named = checkPrompt('gorsel', GOOD_EN + ' at Kahve Durağı', 'en', { noBrandName: true, brandName: 'Kahve Durağı', forbidNames: ['Ahmet'] });
  assert.equal(named.checks.find(c => c.key === 'names').ok, false);
  // Türkçe sohbet türlerinde kemik yok: yalnız yasaklı kelime denetlenir
  assert.deepEqual(checkPrompt('metin', 'Kısa açıklama yaz', 'tr').checks.map(c => c.key), ['banned']);
});

test('7.6 üretimde: geçen prompt tekrar yazılmaz; eksikli prompt bir kez yeniden yazılır, daha iyisi tutulur; detayda rozetler', async () => {
  let n = 0;
  const provider = fakeProvider([() => (++n === 1 ? { title: 'Kısa', prompt: 'Öğrenciler kahve içiyor' } : { title: 'Uzun', prompt: GOOD_TR })]);
  const s = await startServer({ aiProvider: provider });
  try {
    const a = (await s.request('POST', '/api/brands', { name: 'Kalite' })).data.brand;
    await s.request('PUT', `/api/brands/${a.id}/memory`, { banned: ['ucuz'] });
    const p = (await s.request('POST', `/api/brands/${a.id}/prompts`, { kind: 'gorsel', brief: 'Kampüste sabah' })).data.prompt;
    assert.equal(p.ai.qualityRetried, true);
    assert.equal(p.text, GOOD_TR, 'ikinci (daha iyi) yazım tutulur');
    assert.equal(p.quality.ok, true);
    const retryPrompt = provider.calls.at(-1).prompt;
    assert.match(retryPrompt, /KALİTE KONTROLÜ[\s\S]*Çekim ve açı[\s\S]*Lens/);
    // Geçen prompt yeniden yazılmaz
    const calls = provider.calls.length;
    const p2 = (await s.request('POST', `/api/brands/${a.id}/prompts`, { kind: 'gorsel', brief: 'Bir daha' })).data.prompt;
    assert.equal(provider.calls.length, calls + 1);
    assert.equal(p2.ai.qualityRetried, false);
    // Elle yazılan yasaklı kelime detayda rozet olarak görünür
    const u = (await s.request('PUT', `/api/brands/${a.id}/prompts/${p2.id}`, { text: GOOD_TR + ' ucuz' })).data.prompt;
    assert.equal(u.quality.checks.find(c => c.key === 'banned').ok, false);
  } finally { await s.stop(); }
});
