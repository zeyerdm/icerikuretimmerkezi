// Çok sayfalı PDF: her slayt bir sayfa, sayfa boyutu slaytın oranında (1 px = 0,75 pt; 1080 px ≈ 810 pt).
// Slaytlar JPEG olarak gömülür (DCTDecode); dış kütüphane yok. LinkedIn carousel'i ve baskı için.
const enc = new TextEncoder();

async function jpegBytes(canvas, quality = 0.92) {
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
  return new Uint8Array(await blob.arrayBuffer());
}

// pages: [{ canvas }] → PDF Blob
export async function canvasesToPdf(canvases, { title = 'Tasarım' } = {}) {
  const parts = []; const offsets = []; let length = 0;
  const push = chunk => { const b = typeof chunk === 'string' ? enc.encode(chunk) : chunk; parts.push(b); length += b.length; };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = canvases.length;
  // 1: katalog, 2: sayfa ağacı, 3: bilgi; her sayfa için 3 nesne: sayfa, içerik, görsel
  const pageId = i => 4 + i * 3;
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${canvases.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`));
  // Başlık UTF-16BE (Türkçe harfler bozulmasın)
  const utf16 = str => `<FEFF${[...String(str).slice(0, 120)].map(ch => { const c = ch.codePointAt(0); return c > 0xffff ? '' : c.toString(16).padStart(4, '0'); }).join('')}>`;
  obj(3, () => push(`<< /Title ${utf16(title || 'Tasarım')} /Producer (Kreatifhane) >>`));
  for (let i = 0; i < n; i++) {
    const c = canvases[i];
    const w = +(c.width * 0.75).toFixed(2); const h = +(c.height * 0.75).toFixed(2);
    const jpg = await jpegBytes(c);
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    obj(pageId(i), () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${pageId(i) + 2} 0 R >> >> /Contents ${pageId(i) + 1} 0 R >>`));
    obj(pageId(i) + 1, () => { push(`<< /Length ${content.length} >>\nstream\n`); push(content); push('\nendstream'); });
    obj(pageId(i) + 2, () => { push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream'); });
  }
  const total = 4 + n * 3;
  const xref = length;
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let k = 1; k < total; k++) table += `${String(offsets[k]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
