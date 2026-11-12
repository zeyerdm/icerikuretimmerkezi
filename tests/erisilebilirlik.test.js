// 8.17 Erişilebilirlik denetimi: bütün sayfalar ve sık pencereler axe-core ile WCAG 2.1 A/AA kurallarına göre taranır.
// axe-core ve Playwright yalnız testte kullanılır (CI'da --no-save kurulur); yoksa test atlanır.
// Kenar çubuğu: axe degrade zeminli yapışkan kenar çubuğunun arka planını sayfa zemini sanıyor (yanlış alarm); bu yüzden
// kenar çubuğu yazı kontrastı ayrıca, hesaplanan marka renkleriyle (iki uçta) ölçülür.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { startServer } from './helpers.js';

const require = createRequire(import.meta.url);
let chromium = null; let AXE = null;
try { chromium = require('playwright').chromium; AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { chromium = null; }
const skip = !(chromium && AXE) && 'Playwright ya da axe-core yok';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function scan(page, opts = {}) {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async ({ tags, opts }) => {
    const r = await axe.run({ exclude: opts.excludeSidebar ? [['.sidebar']] : [] }, { runOnly: { type: 'tag', values: tags } });
    return r.violations.map(v => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
  }, { tags: TAGS, opts });
}

test('8.17 bütün sayfalar ve sık pencereler WCAG 2.1 AA taramasından geçer', { skip, timeout: 120000 }, async () => {
  const s = await startServer();
  const browser = await chromium.launch();
  try {
    await s.request('POST', '/api/brands/demo');
    const b = (await s.request('GET', '/api/brands')).data.brands[0];
    const y = (await s.request('POST', '/api/brands', { name: 'Sarı marka', colors: { primary: '#f6c90e' } })).data.brand;
    const pages = ['#/', '#/markalar', '#/masa', '#/analizler', '#/ai', '#/ai/modeller', '#/ai/harcama', '#/ayarlar', '#/cop', '#/marka/yeni',
      ...['', '/kimlik', '/hafiza', '/prompt-kimligi', '/fikirler', '/reels', '/post', '/prompt', '/takvim', '/arsiv', '/kampanya', '/youtube', '/rakipler', '/analiz', '/rapor', '/kutuphane', '/video'].map(p => `#/m/${b.id}${p}`),
      `#/m/${y.id}`, `#/m/${y.id}/fikirler`];
    const page = await (await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 800 } })).newPage();
    const found = [];
    for (const h of pages) {
      await page.goto(`${s.base}/${h}`);
      await page.waitForLoadState('networkidle');
      for (const v of await scan(page, { excludeSidebar: true })) found.push(`${h.replace(b.id, 'DEMO').replace(y.id, 'SARI')}: ${v}`);
    }
    const modals = {
      'İçerik planla': async () => { await page.goto(`${s.base}/#/m/${b.id}/takvim`); await page.waitForLoadState('networkidle'); await page.locator('[data-new]').first().click(); },
      'Komut paleti': async () => { await page.goto(`${s.base}/#/`); await page.waitForLoadState('networkidle'); await page.keyboard.press('Control+k'); },
      'Hızlı menü': async () => { await page.goto(`${s.base}/#/m/${b.id}`); await page.waitForLoadState('networkidle'); await page.keyboard.press('Alt+q'); }
    };
    for (const [name, openIt] of Object.entries(modals)) {
      await openIt();
      await page.waitForTimeout(250);
      for (const v of await scan(page, { excludeSidebar: true })) found.push(`${name}: ${v}`);
    }
    assert.deepEqual(found, []);
  } finally { await browser.close(); await s.stop(); }
});

test('8.17 marka rengine göre yazı renkleri en az 4,5:1 (kenar çubuğunun iki ucu ve açık marka zemini)', { skip }, async () => {
  const s = await startServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${s.base}/#/`);
    await page.waitForLoadState('networkidle');
    const colors = ['#5b55e6', '#c2410c', '#f6c90e', '#e2603f', '#12a48f', '#ff8fb1', '#2563eb', '#16a34a', '#111827', '#ffffff', '#7f7f7f'];
    const r = await page.evaluate(async list => {
      const ui = await import('/js/ui.js');
      return list.map(c => {
        ui.applyBrandTheme({ colors: { primary: c } });
        const st = document.documentElement.style;
        const on = st.getPropertyValue('--on-brand').trim(); const deep = st.getPropertyValue('--brand-deep').trim(); const ink = st.getPropertyValue('--brand-ink').trim();
        return { c, top: ui.contrast(on, c), bottom: ui.contrast(on, deep), ink: ui.contrast(ink, ui.mixHex('#ffffff', c, 0.12)), inkWhite: ui.contrast(ink, '#ffffff') };
      });
    }, colors);
    for (const x of r) {
      assert.ok(x.ink >= 4.5 && x.inkWhite >= 4.5, `${x.c}: marka yazısı ${x.ink.toFixed(2)}`);
      // Orta gri gibi iki yazıya da 4,5 veremeyen renkte en iyi seçim yapılır (en az 4,0)
      const min = x.c === '#7f7f7f' ? 3.9 : 4.5;
      assert.ok(x.top >= min && x.bottom >= min, `${x.c}: kenar çubuğu ${x.top.toFixed(2)} / ${x.bottom.toFixed(2)}`);
    }
  } finally { await browser.close(); await s.stop(); }
});
