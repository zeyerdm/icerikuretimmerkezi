// 7.10 Üretim aracına göre çıktı biçimi: oran yazımı, negatif prompt alanı, uzunluk; yazım isteğine araç ipucu girer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, fakeProvider } from './helpers.js';
import { toolOutput, toolInstruction, toolsFor, validTool } from '../server/services/promptTools.js';
import { NEGATIVE_TAIL } from '../server/services/promptSkeleton.js';

const IMG = `A barista pours latte art in a cozy cafe, close-up shot, warm golden hour light, 50mm lens, shallow depth of field, cream and coffee palette, friendly mood, photorealistic, ${NEGATIVE_TAIL}`;

test('7.10 araç biçimleri', () => {
  assert.deepEqual(Object.keys(toolsFor('gorsel')), ['midjourney', 'imagen', 'nanobanana', 'gptimage']);
  assert.deepEqual(Object.keys(toolsFor('maskot')), ['veo', 'kling']);
  assert.deepEqual(toolsFor('metin'), {});
  assert.equal(validTool('video', 'midjourney'), false);
  assert.equal(toolOutput('gorsel', '', IMG, ''), null);

  const mj = toolOutput('gorsel', 'midjourney', IMG, '4:5');
  assert.doesNotMatch(mj.main, /no text/, 'yasak kapanışı metinden çıkar');
  assert.match(mj.main, /photorealistic$/);
  assert.equal(mj.params, '--ar 4:5 --no text, letters, words, watermark, logo, subtitles, UI elements');
  assert.equal(mj.full, `${mj.main} ${mj.params}`);

  const nb = toolOutput('gorsel', 'nanobanana', IMG, '');
  assert.match(nb.main, /no UI elements\. Aspect ratio 1:1\.$/, 'oran metne yazılır; varsayılan türün oranı');
  assert.equal(nb.negative, '');

  const im = toolOutput('urun', 'imagen', IMG, '16:9');
  assert.equal(im.main, IMG);
  assert.match(im.notes[0], /Oranı Imagen ayarlarından seç: 16:9/);

  const kl = toolOutput('video', 'kling', `8 seconds; a barista smiles; slow push-in; no on-screen text. ${'word '.repeat(110)}`, '9:16');
  assert.match(kl.negative, /subtitles/);
  assert.ok(kl.notes.some(n => /Negative prompt/.test(n)));
  assert.ok(kl.notes.some(n => /Kling için uzun/.test(n)), 'uzunluk uyarısı');
  assert.match(toolInstruction('video', 'kling'), /^HEDEF ARAÇ: Kling için/);
  assert.equal(toolInstruction('metin', 'kling'), '');
});

test('7.10 API: üretimde araç seçilir, istemde ipucu olur; araç/oran değişince çıktı hazırlanır', async () => {
  const provider = fakeProvider([p => {
    if (p.startsWith('PROMPT ÇEVİRİSİ')) return { prompt: IMG };
    return { title: 'Latte', prompt: 'Barista kafede latte art yapıyor, yakın plan çekim, sıcak altın saat ışığı, 50mm lens, sığ alan derinliği, krem ve kahve tonları, samimi his, gerçekçi fotoğraf stili, temiz kompozisyon, yazı yok, harf yok, kelime yok, filigran yok, logo yok, altyazı yok, arayüz öğesi yok' };
  }]);
  const s = await startServer({ aiProvider: provider });
  try {
    const meta = (await s.request('GET', '/api/meta')).data;
    assert.equal(meta.prompts.kinds.gorsel.tools.midjourney, 'Midjourney');
    assert.ok(meta.prompts.aspects.includes('9:16'));
    const b = (await s.request('POST', '/api/brands', { name: 'Araçlı' })).data.brand;
    const url = `/api/brands/${b.id}/prompts`;
    const p = (await s.request('POST', url, { kind: 'gorsel', brief: 'Latte', tool: 'midjourney' })).data.prompt;
    assert.equal(p.tool, 'midjourney');
    assert.match(provider.calls.at(-1).prompt, /HEDEF ARAÇ: Midjourney için/);
    assert.equal(p.toolOutput, null, 'Türkçe hâlde çıktı yok');
    const en = (await s.request('POST', `${url}/${p.id}/translate`, {})).data.prompt;
    assert.match(en.toolOutput.full, /photorealistic --ar 1:1 --no text/);
    const ch = (await s.request('PUT', `${url}/${p.id}`, { tool: 'nanobanana', aspect: '9:16' })).data.prompt;
    assert.match(ch.toolOutput.full, /Aspect ratio 9:16\.$/);
    assert.equal(ch.versions.length, en.versions.length, 'araç değişimi yeni sürüm açmaz');
    assert.equal((await s.request('PUT', `${url}/${p.id}`, { tool: 'kling' })).status, 400, 'görsel türüne video aracı seçilemez');
    assert.equal((await s.request('PUT', `${url}/${p.id}`, { aspect: '7:3' })).status, 400);
    const v = (await s.request('POST', url, { kind: 'metin', brief: 'Açıklama', tool: 'midjourney' })).data.prompt;
    assert.equal(v.tool, '', 'metin türünde araç yok sayılır');
  } finally { await s.stop(); }
});
