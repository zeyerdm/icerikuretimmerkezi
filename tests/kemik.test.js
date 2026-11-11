// 7.1 Sabit prompt kemiği: türe göre bölümler, model talimatı ve bölüm desenleri (gerçek Gemini çıktılarıyla).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKELETONS, sectionsOf, skeletonInstruction, NEGATIVE_TAIL } from '../server/services/promptSkeleton.js';
import { PROMPT_KINDS } from '../server/services/prompts.js';

// Gerçek Gemini 3 Flash çıktıları (11 Kasım 2026 denemesi)
const GOOD_IMAGE = 'Two university students sitting together at a wooden table, focused on their textbooks while holding steaming cups of coffee, situated in a sun-drenched university campus courtyard during a bright morning, medium shot, eye-level angle, soft golden morning sunlight creating a warm glow, 35mm lens with a shallow depth of field and f/1.8 aperture, a color palette featuring rich burnt orange tones, a sincere and cozy atmosphere, photorealistic cinematic photography, clean composition, no text, no letters, no words, no watermark, no logo, no subtitles, no UI elements';
const OLD_BAD_IMAGE = 'A cozy 3D Pixar-style animation of two university students studying together in a lush campus garden on a bright morning. They are holding warm coffee cups, smiling friendly, surrounded by soft golden hour lighting, green trees, highly detailed, cinematic lighting, 8k resolution.';
const GOOD_VIDEO = 'Duration 10 seconds. A skilled young barista in a cozy cafe pours steamed milk into a ceramic cup. From 0 to 4 seconds, a close-up shot focuses on the pouring. From 4 to 7 seconds, the barista slides the cup across the counter. The camera performs a slow dolly in toward the latte art. Lighting is warm and natural. Sound includes the ambient hum of a cafe and a light acoustic beat. The style is cinematic and photorealistic with no on-screen text or subtitles.';
const missing = (kind, text) => sectionsOf(kind).filter(s => s.test && !s.test.test(text)).map(s => s.key);

test('7.1 kemik: her İngilizce prompt türünün kemiği var; talimat bölümleri sırayla ve kapanışı içerir', () => {
  for (const [k, v] of Object.entries(PROMPT_KINDS)) if (v.english) assert.ok(SKELETONS[k], `${k} için kemik yok`);
  const ins = skeletonInstruction('gorsel');
  assert.match(ins, /KEMİK/);
  assert.match(ins, /1\) one tangible main subject[\s\S]*9\) end exactly with/);
  assert.ok(ins.includes(NEGATIVE_TAIL));
  assert.match(ins, /HEX kodu olarak değil/);
  assert.match(ins, /--ar/);
  assert.match(skeletonInstruction('maskot'), /1\) keep the character exactly/);
  assert.equal(skeletonInstruction('metin'), '', 'Türkçe metin türlerinin kemiği yok');
});

test('7.1 bölüm desenleri: iyi çıktıda eksik yok, eski hatalı çıktıda lens/çekim/kapanış eksik görünür', () => {
  assert.deepEqual(missing('gorsel', GOOD_IMAGE), []);
  assert.deepEqual(missing('gorsel', OLD_BAD_IMAGE), ['shot', 'lens', 'negative']);
  assert.deepEqual(missing('video', GOOD_VIDEO), []);
  assert.deepEqual(missing('video', GOOD_VIDEO.replace(/From 0 to 4 seconds,|From 4 to 7 seconds,/g, '')), ['beats']);
});
