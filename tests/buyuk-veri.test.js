// 8.9 Büyük veride doğruluk ve hız: Yönetim Merkezi sayımları 2.000 içerikte kesilmez; liste sınırı ve "truncated";
// tek içerik uç noktası; sık sorgular indeks kullanır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './helpers.js';
import { openDb } from '../server/db.js';

test('8.9 2.500 içerikte Yönetim Merkezi bütün içerikleri sayar; liste sınırı ve tek içerik', async () => {
  const s = await startServer();
  try {
    const b = (await s.request('POST', '/api/brands', { name: 'Büyük' })).data.brand;
    const db = new DatabaseSync(path.join(s.dataDir, fs.readdirSync(s.dataDir).find(f => f.endsWith('.db'))));
    db.exec('BEGIN');
    const ins = db.prepare("INSERT INTO contents (id, brand_id, title, type, status, scheduled_at, notes, created_at, updated_at) VALUES (?, ?, ?, 'post', 'taslak', ?, '', ?, ?)");
    const base = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 2500; i++) { const at = new Date(base + i * 3600e3).toISOString(); ins.run(randomUUID(), b.id, `İçerik ${i}`, at, at, at); }
    db.exec('COMMIT');
    db.close();

    const d = (await s.request('GET', '/api/dashboard')).data;
    assert.equal(d.contents.length, 2500, 'sayımlar 2.000\'de kesilmez');
    assert.equal(d.lookup.brands[b.id].name, 'Büyük', 'marka adı bir kez gönderilir');
    assert.equal(d.lookup.types.post, 'Instagram post');
    assert.equal('brandName' in d.contents[0] || 'typeLabel' in d.contents[0], false, 'içerik başına tekrarlanmaz');
    const def = (await s.request('GET', `/api/contents?brandId=${b.id}`)).data;
    assert.equal(def.contents.length, 2000);
    assert.equal(def.truncated, true, 'sınıra ulaşıldığı söylenir');
    const all = (await s.request('GET', `/api/contents?brandId=${b.id}&limit=10000`)).data;
    assert.equal(all.contents.length, 2500);
    assert.equal(all.truncated, false);
    assert.equal((await s.request('GET', `/api/contents?limit=5`)).data.contents.length, 5);
    assert.equal((await s.request('GET', `/api/contents?limit=999999`)).data.contents.length, 2500, 'üst sınır 10.000');
    const one = (await s.request('GET', `/api/contents/${all.contents[0].id}`)).data.content;
    assert.equal(one.title, 'İçerik 2499');
    assert.equal((await s.request('GET', '/api/contents/yok')).status, 404);
  } finally { await s.stop(); }
});

test('8.9 sık sorgular indeks kullanır (tam tablo taraması yok)', () => {
  const db = openDb(':memory:');
  const plan = sql => db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...Array((sql.match(/\?/g) || []).length).fill('x')).map(r => r.detail).join(' | ');
  const queries = [
    'SELECT c.* FROM contents c JOIN brands b ON b.id = c.brand_id WHERE b.owner_id = ? AND c.scheduled_at >= ? AND c.scheduled_at < ?',
    'SELECT c.* FROM contents c JOIN brands b ON b.id = c.brand_id WHERE b.owner_id = ? AND c.brand_id = ?',
    'SELECT i.* FROM ideas i JOIN brands b ON b.id = i.brand_id WHERE b.owner_id = ?',
    'SELECT * FROM tasks WHERE owner_id = ?',
    'SELECT * FROM activity WHERE owner_id = ? ORDER BY created_at DESC LIMIT 12',
    'SELECT SUM(cost_usd) FROM ai_usage WHERE created_at >= ?',
    'SELECT * FROM prompts WHERE brand_id = ? ORDER BY updated_at DESC',
    'SELECT * FROM image_generations WHERE brand_id = ? ORDER BY created_at DESC LIMIT 60',
    'SELECT * FROM feedback WHERE brand_id = ? AND vote = -1'
  ];
  for (const q of queries) assert.doesNotMatch(plan(q), /\bSCAN (contents|ideas|tasks|activity|ai_usage|prompts|image_generations|feedback)\b/, q);
  db.close();
});
