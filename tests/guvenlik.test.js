// 8.6: API anahtarları veritabanında şifreli saklanır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.js';
import { createCipher } from '../server/lib/secrets.js';
import { fakeProvider } from './helpers.js';

const KEY = 'sk-ant-TEST-0123456789abcdefghijklmn';
const raw = (dir, k) => { const db = new DatabaseSync(path.join(dir, 'app.db')); try { return (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) || {}).value; } finally { db.close(); } };

test('8.6 şifreleme: düz metin veritabanına yazılmaz, okununca çözülür, anahtar dosyası yalnız sahibine açık', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ium-sec-'));
  try {
    const c = createCipher(dir);
    const enc = c.encrypt(KEY);
    assert.ok(enc.startsWith('enc:v1:'));
    assert.ok(!enc.includes('sk-ant'));
    assert.notEqual(c.encrypt(KEY), enc, 'her şifrelemede farklı IV');
    assert.equal(c.decrypt(enc), KEY);
    assert.equal(c.decrypt('düz değer'), 'düz değer', 'eski düz metin olduğu gibi okunur');
    assert.equal(createCipher(dir).decrypt(enc), KEY, 'aynı anahtar dosyasıyla yeniden açılır');
    if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dir, '.secret.key')).mode & 0o077, 0);
    // Anahtar dosyası değişirse çökmez, boş döner
    fs.rmSync(path.join(dir, '.secret.key'));
    assert.equal(createCipher(dir).decrypt(enc), '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('8.6 uygulamada: kaydedilen anahtar veritabanında şifreli; eski düz metin açılışta şifrelenir ve çalışmaya devam eder', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ium-sec-'));
  try {
    let app = createApp({ dataDir: dir, aiProvider: fakeProvider(['x']) });
    app.close();
    // Eski kurulum: anahtar düz metin
    const db = new DatabaseSync(path.join(dir, 'app.db'));
    db.prepare("INSERT INTO settings (key, value) VALUES ('ai.anthropic.apiKey', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(KEY);
    db.prepare("INSERT INTO settings (key, value) VALUES ('backup.copyDir', '/tmp/x') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    db.close();
    app = createApp({ dataDir: dir });
    try {
      const stored = raw(dir, 'ai.anthropic.apiKey');
      assert.ok(stored.startsWith('enc:v1:'), 'düz metin açılışta şifrelenmeli');
      assert.ok(!stored.includes(KEY));
      assert.equal(raw(dir, 'backup.copyDir'), '/tmp/x', 'gizli olmayan ayar şifrelenmez');
    } finally { app.close(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
