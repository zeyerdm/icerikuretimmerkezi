// Küçük ZIP okuyucu/yazıcı: yalnızca Node'un yerleşik zlib'i ile çalışır (ek paket yok).
// Yedek dosyaları standart .zip olur; Windows/Mac'te çift tıklayıp içine bakılabilir.
import zlib from 'node:zlib';

const UTF8_FLAG = 0x0800;

function dosTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

// entries: [{ name, data: Buffer }] → ZIP içeriği (Buffer)
export function writeZip(entries, date = new Date()) {
  const { time, day } = dosTime(date);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw = entry.data;
    const deflated = zlib.deflateRawSync(raw);
    // Zaten sıkıştırılmış dosyalar (PNG, JPEG) küçülmüyorsa olduğu gibi saklanır
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const crc = zlib.crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
    if (offset > 0xffffffff) throw new Error('Yedek 4 GB sınırını aşıyor.');
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

export class ZipError extends Error {}

// ZIP içeriğini okur. Bozuk dosya, desteklenmeyen sıkıştırma ve "zip bombası"na karşı sınırlar uygulanır.
export function readZip(buf, { maxEntries = 100000, maxTotal = 4 * 1024 ** 3 } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new ZipError('Dosya bir ZIP arşivi değil.');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('Dosya bir ZIP arşivi değil.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count > maxEntries) throw new ZipError('Arşivde çok fazla dosya var.');
  const out = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ZipError('ZIP arşivi bozuk.');
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue; // klasör kaydı
    total += size;
    if (total > maxTotal) throw new ZipError('Arşiv açıldığında çok büyük oluyor.');
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) throw new ZipError('ZIP arşivi bozuk.');
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const body = buf.subarray(start, start + compSize);
    if (body.length !== compSize) throw new ZipError('ZIP arşivi eksik.');
    let data;
    if (method === 0) data = Buffer.from(body);
    else if (method === 8) {
      try { data = zlib.inflateRawSync(body, { maxOutputLength: Math.max(size, 1) }); } catch { throw new ZipError('ZIP arşivi bozuk.'); }
    } else throw new ZipError('Bu ZIP sıkıştırma yöntemi desteklenmiyor.');
    if (data.length !== size || zlib.crc32(data) !== crc) throw new ZipError(`Arşivdeki "${name}" dosyası bozuk.`);
    out.push({ name, data });
  }
  return out;
}
