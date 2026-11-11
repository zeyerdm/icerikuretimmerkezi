// Toplu testler: tarayıcı modüllerindeki saf mantık (Node'da doğrudan içe aktarılır).
// T.26 QR kod, T.35 seri ve rozetler; T.25'in altyazı ayrıştırması aşağıda ayrı tutulur (video.js DOM'a bağlı).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { qrMatrix } from '../public/js/qr.js';
import { badges, streak, productionDays } from '../public/js/badges.js';
import { cleanData } from '../server/services/posts.js';

// Format bilgisi (15 bit) BCH(15,5) koduyla geçerli mi: maske 101010000010010 çıkarılınca 10 bitlik kalan sıfır olmalı
function formatBitsValid(bits) {
  let v = parseInt(bits.join(''), 2) ^ 0b101010000010010;
  for (let i = 14; i >= 10; i--) if (v & (1 << i)) v ^= 0b10100110111 << (i - 10);
  return v === 0;
}

test('T.26 QR: boyut, bulucu desenler, zamanlama, format/sürüm bilgisi ve doğrulanmış çıktı', () => {
  // Beklenen özetler: bu çıktılar OpenCV QRCodeDetector ile çözülüp metnin birebir döndüğü doğrulandı
  const cases = [
    ['A', 1, '66a90bf2fd844de9'],
    ['https://kreatifhane.example/kampanya', 3, '2d6ee855fb30eaaf'],
    ['Çok güzel şeyler oluyor! İğneada ışığı', 5, '7d8c0b9b99791e3b'],
    ['https://example.com/' + 'x'.repeat(120), 8, '391147864f0c7c53'],
    ['y'.repeat(200), 10, '7f4638a83c35989b']
  ];
  for (const [text, version, hash] of cases) {
    const m = qrMatrix(text);
    const n = m.length;
    assert.equal(n, 17 + 4 * version, text.slice(0, 20));
    assert.ok(m.every(r => r.length === n));
    // Üç köşede 7×7 bulucu desen: dış çerçeve koyu, iç halka açık, 3×3 merkez koyu
    for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
        assert.equal(m[oy + y][ox + x], ring !== 2, `bulucu ${ox},${oy}`);
      }
    }
    // Zamanlama desenleri (6. satır ve sütun) dönüşümlü
    for (let i = 8; i < n - 8; i++) { assert.equal(m[6][i], i % 2 === 0); assert.equal(m[i][6], i % 2 === 0); }
    // Koyu modül
    assert.equal(m[n - 8][8], true);
    // Format bilgisi iki kopya halinde ve geçerli; düzeltme düzeyi M (ilk iki bit 00)
    const f1 = [0, 1, 2, 3, 4, 5, 7, 8].map(x => m[8][x]).concat([7, 5, 4, 3, 2, 1, 0].map(y => m[y][8]));
    const f2 = [n - 1, n - 2, n - 3, n - 4, n - 5, n - 6, n - 7].map(y => m[y][8]).concat([n - 8, n - 7, n - 6, n - 5, n - 4, n - 3, n - 2, n - 1].map(x => m[8][x]));
    assert.deepEqual(f1, f2);
    assert.ok(formatBitsValid(f1.map(Number)), 'format BCH');
    // M = 00; saklanırken maskenin ilk iki biti (10) ile XOR'lanır
    assert.deepEqual(f1.slice(0, 2), [true, false]);
    // Sürüm 7+ için iki sürüm bilgisi bloğu birbirinin aynası
    if (version >= 7) {
      for (let i = 0; i < 18; i++) assert.equal(m[Math.floor(i / 3)][n - 11 + (i % 3)], m[n - 11 + (i % 3)][Math.floor(i / 3)]);
    }
    const digest = crypto.createHash('sha1').update(m.map(r => r.map(Number).join('')).join('\n')).digest('hex').slice(0, 16);
    assert.equal(digest, hash, `çıktı değişti: ${text.slice(0, 20)}`);
  }
  // Sınır: 213 bayttan uzun metin reddedilir
  assert.throws(() => qrMatrix('z'.repeat(214)), /çok uzun/);
  assert.equal(qrMatrix('z'.repeat(213)).length, 57);
});

test('T.26 QR katmanı sunucuda: boş metin reddi, kare boyut, renk ve sınırlar', () => {
  const slide = layers => ({ format: '1:1', slides: [{ bg: '#ffffff', layers }] });
  assert.throws(() => cleanData(slide([{ type: 'qr', text: '   ' }]), 'b1'), /QR kod/);
  const [l] = cleanData(slide([{ type: 'qr', text: ' https://ornek.com ', w: 5000, h: 10, color: 'kırmızı' }]), 'b1').slides[0].layers;
  assert.equal(l.text, 'https://ornek.com');
  assert.equal(l.w, 2000);
  assert.equal(l.h, l.w);
  assert.equal(l.color, '#000000');
  const [k] = cleanData(slide([{ type: 'qr', text: 'q'.repeat(300), w: 10, color: '#112233' }]), 'b1').slides[0].layers;
  assert.equal(k.text.length, 200);
  assert.equal(k.w, 80);
  assert.equal(k.color, '#112233');
});

test('T.35 seri ve rozetler: seri hesabı ve eşikler', () => {
  const day = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d.toISOString(); };
  // Bugün üretim yoksa dünden sayılır; boşlukta kesilir
  const days = productionDays([{ createdAt: day(1) }, { createdAt: day(2), completedAt: day(3) }], [{ createdAt: day(5) }]);
  assert.equal(streak(days), 3);
  assert.equal(streak(productionDays([{ createdAt: day(0) }, { createdAt: day(1) }], [])), 2);
  assert.equal(streak(productionDays([{ createdAt: day(2) }], [])), 0);
  assert.equal(streak(new Set()), 0);

  const none = badges({ contents: [{ createdAt: day(0) }], ideas: [] });
  assert.equal(none.streak, 1);
  assert.deepEqual(none.list, []); // 1 günlük seri rozet sayılmaz

  const many = badges({
    contents: Array.from({ length: 12 }, (_, i) => ({ createdAt: day(i % 4), done: true, status: 'yayinlandi' })),
    ideas: Array.from({ length: 25 }, () => ({ createdAt: day(0) })),
    weekCreated: 5
  });
  const tones = many.list.map(b => b.tone);
  assert.deepEqual(tones, ['fire', 'bolt', 'gold', 'done', 'idea']);
  assert.match(many.list[0].text, /^4 gün/);

  const few = badges({ contents: [{ createdAt: day(0), status: 'yayinlandi', done: true }], ideas: [], weekCreated: 4 });
  assert.deepEqual(few.list.map(b => b.tone), ['pub']);
});

test('T.25 altyazı ayrıştırma (parseSrt): virgül/nokta, CRLF, çok satır, bozuk blok', async () => {
  const { parseSrt } = await import('../public/js/views/video.js');
  const srt = '1\r\n00:00:01,500 --> 00:00:03,000\r\nMerhaba\r\nikinci satır\r\n\r\n2\r\n00:00:03.2 --> 00:00:05.25\r\nKahve hazır\r\n\r\nbozuk blok\r\n\r\n3\r\n00:01:00,000 --> yanlış\r\nx\r\n';
  const subs = parseSrt(srt);
  assert.equal(subs.length, 2);
  assert.deepEqual(subs[0], { start: 1.5, end: 3, text: 'Merhaba\nikinci satır' });
  assert.equal(subs[1].start, 3.2);
  assert.equal(subs[1].end, 5.25);
  assert.equal(subs[1].text, 'Kahve hazır');
  assert.deepEqual(parseSrt(''), []);
  assert.deepEqual(parseSrt(null), []);
});
