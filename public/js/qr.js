// Küçük QR kod üretici (ISO/IEC 18004): bayt kipi, hata düzeltme M (%15), sürüm 1–10 (en fazla 213 bayt, ör. uzun bir link).
// Dış kütüphane yok; dönen değer true/false kare matrisi (koyu = true). Sessiz bölge çizimde eklenir.
const EC_M = [null, [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 16, 0, 0], [24, 2, 43, 0, 0], [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]];
// [blok başına EC, grup1 blok sayısı, grup1 veri, grup2 blok sayısı, grup2 veri]
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

const EXP = new Array(512); const LOG = new Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); g.forEach((c, j) => { ng[j] ^= c; ng[j + 1] ^= gmul(c, EXP[i]); }); g = ng; } return g; }
function rsEc(data, n) { const g = rsGen(n); const r = new Array(n).fill(0); for (const d of data) { const f = d ^ r.shift(); r.push(0); for (let i = 0; i < n; i++) r[i] ^= gmul(g[i + 1], f); } return r; }
const dataCap = v => { const e = EC_M[v]; return e[1] * e[2] + e[3] * e[4]; };

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  let v = 1;
  while (v <= 10 && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 > dataCap(v) * 8) v++;
  if (v > 10) throw new Error('Metin QR için çok uzun (en fazla ~200 karakter).');
  // Bit akışı: kip (0100), uzunluk, veri, sonlandırıcı, dolgu
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
  const cap = dataCap(v) * 8;
  put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0; data.length < cap / 8; p++) data.push(p % 2 ? 0x11 : 0xec);
  // Bloklara böl, her bloğa Reed-Solomon, sonra sırayla birleştir
  const [ecn, g1, d1, g2, d2] = EC_M[v];
  const blocks = []; let k = 0;
  for (let i = 0; i < g1; i++) { blocks.push(data.slice(k, k + d1)); k += d1; }
  for (let i = 0; i < g2; i++) { blocks.push(data.slice(k, k + d2)); k += d2; }
  const ecs = blocks.map(b => rsEc(b, ecn));
  const final = [];
  for (let i = 0; i < Math.max(d1, d2); i++) blocks.forEach(b => { if (i < b.length) final.push(b[i]); });
  for (let i = 0; i < ecn; i++) ecs.forEach(e => final.push(e[i]));

  const n = v * 4 + 17;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const fn = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (x, y, d) => { m[y][x] = d; fn[y][x] = true; };
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx; const y = cy + dy; if (x < 0 || y < 0 || x >= n || y >= n) continue; const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4); } };
  finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
  for (let i = 8; i < n - 8; i++) { set(i, 6, i % 2 === 0); set(6, i, i % 2 === 0); }
  const al = ALIGN[v];
  al.forEach((ay, i) => al.forEach((ax, j) => { if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
  // Biçim ve sürüm bilgisi alanlarını ayır (sonra yazılır)
  const drawFormat = mask => {
    const d = (0 << 3) | mask; // M = 00
    let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    const bit = i => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
    set(8, n - 8, true);
  };
  drawFormat(0);
  if (v >= 7) {
    let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const d = ((b >>> i) & 1) === 1; const a = n - 11 + (i % 3); const c = Math.floor(i / 3); set(a, c, d); set(c, a, d); }
  }
  // Veri bitlerini zikzak yerleştir
  const dbits = []; final.forEach(b => { for (let i = 7; i >= 0; i--) dbits.push((b >>> i) & 1); });
  let idx = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j; const up = ((right + 1) & 2) === 0; const y = up ? n - 1 - vert : vert;
      if (!fn[y][x]) { m[y][x] = idx < dbits.length && dbits[idx] === 1; idx++; }
    }
  }
  // En düşük cezalı maskeyi seç
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0, (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
  const apply = k => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fn[y][x] && MASKS[k](x, y)) m[y][x] = !m[y][x]; };
  const penalty = () => {
    let p = 0;
    const line = get => { for (let a = 0; a < n; a++) { let run = 1; for (let b = 1; b < n; b++) { if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } } };
    line((a, b) => m[a][b]); line((a, b) => m[b][a]);
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
    const pat = [true, false, true, true, true, false, true, false, false, false, false];
    const rev = [...pat].reverse();
    for (let a = 0; a < n; a++) for (let b = 0; b + 11 <= n; b++) [pat, rev].forEach(pt => { if (pt.every((d, i) => m[a][b + i] === d)) p += 40; if (pt.every((d, i) => m[b + i][a] === d)) p += 40; });
    let dark = 0; m.forEach(r => r.forEach(c => { if (c) dark++; }));
    p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
    return p;
  };
  let best = 0; let bestP = Infinity;
  for (let k = 0; k < 8; k++) { apply(k); drawFormat(k); const p = penalty(); if (p < bestP) { bestP = p; best = k; } apply(k); }
  apply(best); drawFormat(best);
  return m;
}

// Tuvale çizer: x,y sol üst, size kenar (sessiz bölge dahil), dark/light renkler
export function drawQr(ctx, matrix, x, y, size, dark = '#000000', light = '#ffffff') {
  const n = matrix.length; const q = 4; const cell = size / (n + q * 2);
  ctx.fillStyle = light; ctx.fillRect(x, y, size, size);
  ctx.fillStyle = dark;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (matrix[r][c]) ctx.fillRect(Math.floor(x + (c + q) * cell), Math.floor(y + (r + q) * cell), Math.ceil(cell), Math.ceil(cell));
}
