// Yönetim merkezi API testleri: içerik planı, görevler, notlar, özet ve veri ayrımı
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './helpers.js';
import { openDb } from '../server/db.js';

let srv;
let A;
let B;
before(async () => {
  srv = await startServer();
  A = (await srv.request('POST', '/api/brands', { name: 'Marka A', colors: { primary: '#aa0000' } })).data.brand;
  B = (await srv.request('POST', '/api/brands', { name: 'Marka B' })).data.brand;
});
after(() => srv.stop());

test('içerik planı: oluşturma, takvim aralığı, durum ve tamamlanma zamanı', async () => {
  const bad = await srv.request('POST', '/api/contents', { brandId: A.id, title: 'x', type: 'tiktok' });
  assert.equal(bad.status, 400);
  assert.equal((await srv.request('POST', '/api/contents', { brandId: 'olmayan', title: 'x', type: 'post' })).status, 404);
  assert.equal((await srv.request('POST', '/api/contents', { brandId: A.id, title: 'x', type: 'post', scheduledAt: 'yarın' })).status, 400);

  const c = (await srv.request('POST', '/api/contents', { brandId: A.id, title: 'Kampanya postu', type: 'post', scheduledAt: '2026-11-10T09:00:00.000Z' })).data.content;
  assert.equal(c.status, 'taslak');
  assert.equal(c.brandName, 'Marka A');
  assert.equal(c.brandColor, '#aa0000');
  assert.equal(c.completedAt, null);

  const inRange = (await srv.request('GET', '/api/contents?from=2026-11-09T00:00:00.000Z&to=2026-11-11T00:00:00.000Z')).data.contents;
  assert.ok(inRange.some(x => x.id === c.id));
  assert.equal((await srv.request('GET', '/api/contents?from=2026-12-01T00:00:00.000Z')).data.contents.length, 0);

  const done = (await srv.request('PATCH', `/api/contents/${c.id}`, { status: 'tamamlandi' })).data.content;
  assert.ok(done.completedAt && done.done);
  const published = (await srv.request('PATCH', `/api/contents/${c.id}`, { status: 'yayinlandi' })).data.content;
  assert.equal(published.completedAt, done.completedAt, 'tamamlandı → yayınlandı geçişinde tamamlanma zamanı değişti');
  const back = (await srv.request('PATCH', `/api/contents/${c.id}`, { status: 'hazirlaniyor' })).data.content;
  assert.equal(back.completedAt, null);

  // Marka değiştirme ve silme
  const moved = (await srv.request('PATCH', `/api/contents/${c.id}`, { brandId: B.id })).data.content;
  assert.equal(moved.brandName, 'Marka B');
  assert.equal((await srv.request('GET', `/api/contents?brandId=${A.id}`)).data.contents.length, 0);
  assert.equal((await srv.request('DELETE', `/api/contents/${c.id}`)).status, 204);
  assert.equal((await srv.request('PATCH', `/api/contents/${c.id}`, { title: 'y' })).status, 404);
});

test('fikirden içerik: yalnızca aynı markanın fikri bağlanabilir', async () => {
  const idea = (await srv.request('POST', `/api/brands/${A.id}/ideas`, { title: 'Fikir', category: 'trend' })).data.idea;
  assert.equal((await srv.request('POST', '/api/contents', { brandId: B.id, ideaId: idea.id, title: 'x', type: 'post' })).status, 400);
  const c = (await srv.request('POST', '/api/contents', { brandId: A.id, ideaId: idea.id, title: 'Fikirden', type: 'reels' })).data.content;
  assert.equal(c.ideaId, idea.id);
});

test('görevler: öncelik, son tarih, markasız görev, tamamlanma', async () => {
  assert.equal((await srv.request('POST', '/api/tasks', { title: '' })).status, 400);
  assert.equal((await srv.request('POST', '/api/tasks', { title: 'x', priority: 'acil' })).status, 400);
  assert.equal((await srv.request('POST', '/api/tasks', { title: 'x', dueDate: '10.11.2026' })).status, 400);
  const free = (await srv.request('POST', '/api/tasks', { title: 'Markasız görev' })).data.task;
  assert.equal(free.brandId, null);
  assert.equal(free.priority, 'orta');
  const t = (await srv.request('POST', '/api/tasks', { title: 'Çekim', brandId: A.id, dueDate: '2026-11-12', priority: 'yuksek' })).data.task;
  assert.equal(t.brandName, 'Marka A');
  const list = (await srv.request('GET', '/api/tasks')).data.tasks;
  assert.equal(list[0].id, t.id, 'son tarihi olan görev üstte değil');
  const done = (await srv.request('PATCH', `/api/tasks/${t.id}`, { status: 'tamamlandi' })).data.task;
  assert.ok(done.done && done.completedAt);
  assert.equal((await srv.request('GET', '/api/tasks')).data.tasks.at(-1).id, t.id, 'tamamlanan görev sona gitmedi');
  assert.equal((await srv.request('GET', `/api/tasks?brandId=${B.id}`)).data.tasks.length, 0);
  assert.equal((await srv.request('DELETE', `/api/tasks/${free.id}`)).status, 204);
});

test('notlar: kategori, sabitleme, arama, markaya bağlama', async () => {
  assert.equal((await srv.request('POST', '/api/notes', { body: '' })).status, 400);
  const n1 = (await srv.request('POST', '/api/notes', { body: 'Toplantı notu', category: 'Toplantı' })).data.note;
  const n2 = (await srv.request('POST', '/api/notes', { title: 'Renkler', body: 'Turuncu ağırlıklı', category: 'Marka', brandId: A.id, pinned: true })).data.note;
  let res = (await srv.request('GET', '/api/notes')).data;
  assert.equal(res.notes[0].id, n2.id, 'sabitlenen not üstte değil');
  assert.deepEqual(res.categories, ['Marka', 'Toplantı']);
  assert.equal((await srv.request('GET', '/api/notes?q=turuncu')).data.notes.length, 1);
  assert.equal((await srv.request('GET', '/api/notes?category=Toplantı')).data.notes[0].id, n1.id);
  const edited = (await srv.request('PATCH', `/api/notes/${n1.id}`, { body: 'Güncel', pinned: true, brandId: B.id })).data.note;
  assert.equal(edited.brandName, 'Marka B');
  assert.equal((await srv.request('DELETE', `/api/notes/${n1.id}`)).status, 204);
});

test('yönetim merkezi özeti: gerçek sayılar; marka filtresi yalnızca o markayı döndürür', async () => {
  const s = await startServer();
  try {
    const x = (await s.request('POST', '/api/brands', { name: 'X', sector: 'Kafe', description: 'Kısa' })).data.brand;
    const y = (await s.request('POST', '/api/brands', { name: 'Y' })).data.brand;
    await s.request('POST', '/api/contents', { brandId: x.id, title: 'r', type: 'reels', status: 'yayinlandi' });
    await s.request('POST', '/api/contents', { brandId: x.id, title: 'p', type: 'post' });
    await s.request('POST', '/api/contents', { brandId: y.id, title: 'gizli', type: 'story' });
    await s.request('POST', `/api/brands/${x.id}/ideas`, { title: 'i', category: 'trend' });
    await s.request('POST', '/api/tasks', { title: 'g', brandId: x.id });
    await s.request('POST', '/api/notes', { body: 'n', pinned: true });

    const all = (await s.request('GET', '/api/dashboard')).data;
    assert.equal(all.brands.length, 2);
    assert.equal(all.contents.length, 3);
    assert.equal(all.ideas.length, 1);
    assert.equal(all.tasks.length, 1);
    assert.equal(all.pinnedNotes.length, 1);
    const sx = all.brands.find(b => b.id === x.id);
    assert.equal(sx.contentTotal, 2);
    assert.equal(sx.contentDone, 1);
    assert.equal(sx.contentPending, 1);
    assert.equal(sx.sector, 'Kafe');
    assert.ok(sx.lastWorkedAt);
    assert.ok(all.activity.some(a => a.brandName === 'X'), 'etkinlikte marka adı yok');

    const only = (await s.request('GET', `/api/dashboard?brandId=${x.id}`)).data;
    assert.equal(only.brands.length, 1);
    assert.equal(only.contents.length, 2);
    assert.ok(!JSON.stringify(only).includes('gizli'), 'marka filtresinde başka markanın içeriği var');
    assert.equal(only.pinnedNotes.length, 0, 'markasız not marka analizine karıştı');

    // Marka silinince içerikleri, görevleri ve notları da silinir
    await s.request('POST', '/api/notes', { body: 'x notu', brandId: x.id });
    assert.equal((await s.request('DELETE', `/api/brands/${x.id}`)).status, 204);
    const after = (await s.request('GET', '/api/dashboard')).data;
    assert.equal(after.contents.length, 1);
    assert.equal(after.tasks.length, 0);
    assert.ok(!(await s.request('GET', '/api/notes')).data.notes.some(n => n.body === 'x notu'));
  } finally { await s.stop(); }
});

test('örnek marka takvim içerikleri, görevler ve sabit not ile gelir', async () => {
  const s = await startServer();
  try {
    await s.request('POST', '/api/brands/demo');
    const d = (await s.request('GET', '/api/dashboard')).data;
    assert.equal(d.contents.length, 7);
    assert.ok(d.contents.filter(c => c.done).length >= 3);
    assert.ok(d.contents.every(c => c.scheduledAt));
    assert.ok(d.contents.some(c => c.done && c.completedAt < new Date().toISOString()), 'tamamlanan içerikler geçmiş tarihli değil');
    assert.equal(d.tasks.length, 4);
    assert.equal(d.pinnedNotes.length, 1);
  } finally { await s.stop(); }
});

test('eski veritabanı (sürüm 2) veri kaybetmeden yeni sürüme taşınır', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ium-mig-'));
  const file = path.join(dir, 'app.db');
  // Sürüm 2 şemasıyla elle bir veritabanı kur
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE brands (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, sector TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      audience TEXT NOT NULL DEFAULT '', character TEXT NOT NULL DEFAULT '', tone TEXT NOT NULL DEFAULT '', goals TEXT NOT NULL DEFAULT '', competitors TEXT NOT NULL DEFAULT '',
      slogan TEXT NOT NULL DEFAULT '', colors TEXT NOT NULL DEFAULT '{}', fonts TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE assets (id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, category TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', file_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE ideas (id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, favorite INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL);
    CREATE TABLE chat_messages (id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, actions TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL);
    CREATE TABLE activity (id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, type TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL);
    INSERT INTO users VALUES ('u1', 'Sahip', '2026-11-01T00:00:00.000Z');
    INSERT INTO brands (id, owner_id, name, created_at, updated_at) VALUES ('b1', 'u1', 'Eski Marka', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z');
    INSERT INTO ideas (id, brand_id, title, category, created_at) VALUES ('i1', 'b1', 'Eski fikir', 'trend', '2026-11-01T00:00:00.000Z');
    INSERT INTO activity VALUES ('a1', 'b1', 'brand.created', 'Eski Marka markası oluşturuldu', '2026-11-01T00:00:00.000Z');
    PRAGMA user_version = 2;`);
  old.close();
  const db = openDb(file);
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 24);
    const act = db.prepare('SELECT * FROM activity').get();
    assert.equal(act.owner_id, 'u1');
    assert.equal(act.summary, 'Eski Marka markası oluşturuldu');
    assert.equal(db.prepare('SELECT title FROM ideas').get().title, 'Eski fikir');
    db.prepare("INSERT INTO activity (id, owner_id, brand_id, type, summary, created_at) VALUES ('a2', 'u1', NULL, 'x', 'markasız', '2026-11-02')").run();
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
