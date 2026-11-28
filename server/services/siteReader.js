// Web sitesinden marka bilgisi okuma: ana sayfa ve önemli alt sayfalar (hakkımızda, hizmetler, ürünler, menü, iletişim,
// SSS…) indirilir, görünen metin, başlık, açıklama, iletişim ve sosyal medya bağlantıları çıkarılır. Yapay zekâ çağırmaz;
// metin sonra kimlik taslağına, bilgi kartlarına ve ilk içerik fikirlerine dönüşür.
// Güvenlik: yalnız http(s); yerel ağ, localhost ve özel IP adreslerine istek gönderilmez (yönlendirmeler de denetlenir);
// sayfa başına süre ve boyut sınırı vardır.
import dns from 'node:dns/promises';
import net from 'node:net';
import { badRequest } from '../lib/http.js';

const PAGE_TIMEOUT_MS = 10000;
const MAX_BYTES = 1500000;
const MAX_PAGES = 6; // ana sayfa + 5 alt sayfa
const MAX_TEXT = 20000;
// Önemli alt sayfalar: adres ya da bağlantı metninde geçen kelimeler (öncelik sırasıyla)
const KEYS = [/hakk|about|kurumsal|biz-kimiz|kimdir|hikaye|story/i, /hizmet|service|cozum|çözüm|solution/i, /urun|ürün|product|menu|menü|koleksiyon|collection/i, /iletisim|iletişim|contact|adres|subeler|şubeler/i, /sss|faq|sik-sorulan|sıkça/i, /fiyat|price|pricing|paket/i, /blog|haber|news|makale/i];
const SOCIAL = { instagram: /instagram\.com\//i, facebook: /facebook\.com\//i, linkedin: /linkedin\.com\//i, youtube: /youtube\.com\/|youtu\.be\//i, tiktok: /tiktok\.com\//i, x: /(?:twitter|x)\.com\//i };

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ccedil: 'ç', Ccedil: 'Ç', ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®', trade: '™' };
export const decode = s => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ENTITIES[e] != null ? ENTITIES[e] : m;
});
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')); return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : ''; };
const meta = (html, re) => { for (const t of html.match(/<meta\b[^>]*>/gi) || []) if (re.test(attr(t, 'name') || attr(t, 'property'))) return attr(t, 'content').trim(); return ''; };

// Görünen metin: betik, stil ve gizli bloklar atılır; başlık ve paragraflar satır olur
export function pageText(html) {
  const body = String(html).replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|form)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<head\b[\s\S]*?<\/head>/i, ' ')
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/div|\/section|\/article|\/tr|\/header|\/footer|\/td)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const seen = new Set();
  return decode(body).split('\n').map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 1 && !seen.has(l) && seen.add(l)).join('\n');
}

export function parsePage(html, baseUrl) {
  const title = decode((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
  const links = [];
  for (const m of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(`<a ${m[1]}>`, 'href');
    if (!href) continue;
    let url; try { url = new URL(href, baseUrl); } catch { continue; }
    links.push({ url, text: decode(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 80), href });
  }
  return {
    title,
    description: meta(html, /^(description|og:description)$/i),
    siteName: meta(html, /^og:site_name$/i),
    themeColor: (meta(html, /^theme-color$/i).match(/^#[0-9a-f]{6}$/i) || [''])[0].toLowerCase(),
    text: pageText(html),
    links
  };
}

const privateV4 = ip => { const [a, b] = ip.split('.').map(Number); return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; };
const privateIp = ip => (net.isIPv4(ip) ? privateV4(ip) : /^(::1?|f[cd]|fe[89ab]|::ffff:(?:0|10|127|169\.254|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.)/i.test(ip) || /^::ffff:/i.test(ip) && privateV4(ip.slice(7)));

export function createSiteReader({ fetchImpl = fetch, lookup = (h) => dns.lookup(h, { all: true }), allowPrivate = false } = {}) {
  async function checkHost(url) {
    if (!/^https?:$/.test(url.protocol)) throw badRequest('Yalnız http ve https adresleri okunabilir.');
    if (allowPrivate) return;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (/^localhost$|\.local$|\.internal$/i.test(host)) throw badRequest('Yerel ağ adresleri okunamaz.');
    const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host).catch(() => { throw badRequest(`"${host}" adresi bulunamadı. Adresi kontrol et.`); });
    if (!addrs.length || addrs.some(a => privateIp(a.address))) throw badRequest('Yerel ağ adresleri okunamaz.');
  }

  // Yönlendirmeler elle izlenir: her adımda adres yeniden denetlenir
  async function fetchPage(start) {
    let url = start;
    for (let hop = 0; hop < 4; hop++) {
      await checkHost(url);
      let res;
      try {
        res = await fetchImpl(url.href, { redirect: 'manual', signal: AbortSignal.timeout(PAGE_TIMEOUT_MS), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KreatifhaneBot/1.0)', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'tr,en;q=0.8' } });
      } catch (err) {
        throw badRequest(err && err.name === 'TimeoutError' ? 'Site 10 saniye içinde yanıt vermedi.' : 'Siteye bağlanılamadı. Adresi kontrol et.');
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = new URL(res.headers.get('location'), url); continue; }
      if (!res.ok) throw badRequest(`Site sayfayı vermedi (${res.status}).`);
      if (!/html|xml|text\/plain/i.test(res.headers.get('content-type') || 'text/html')) throw badRequest('Bu adres bir web sayfası değil.');
      const chunks = []; let size = 0;
      for await (const c of res.body) { size += c.length; if (size > MAX_BYTES) break; chunks.push(c); }
      return { url, html: Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8') };
    }
    throw badRequest('Site çok fazla yönlendirme yaptı.');
  }

  return {
    async read(raw) {
      const input = String(raw || '').trim();
      if (!input) throw badRequest('Web sitesi adresini yaz.');
      let start;
      try { start = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : 'https://' + input); } catch { throw badRequest('Geçerli bir web sitesi adresi yaz (ör. ornek.com).'); }
      const home = await fetchPage(start);
      const p0 = parsePage(home.html, home.url);
      const host = home.url.hostname.replace(/^www\./, '');
      const same = l => l.url.hostname.replace(/^www\./, '') === host && /^https?:$/.test(l.url.protocol) && !/\.(pdf|jpe?g|png|gif|webp|zip|mp4|docx?|xlsx?)$/i.test(l.url.pathname);
      // Alt sayfalar: anahtar kelime sırasıyla, her gruptan en fazla bir sayfa
      const picked = []; const seen = new Set([home.url.origin + home.url.pathname.replace(/\/$/, '')]);
      for (const re of KEYS) {
        const l = p0.links.find(x => same(x) && (re.test(decodeURIComponent(x.url.pathname)) || re.test(x.text)) && !seen.has(x.url.origin + x.url.pathname.replace(/\/$/, '')));
        if (l) { seen.add(l.url.origin + l.url.pathname.replace(/\/$/, '')); picked.push(l.url); }
        if (picked.length >= MAX_PAGES - 1) break;
      }
      const pages = [{ url: home.url.href, title: p0.title, text: p0.text, links: p0.links }];
      const rest = await Promise.all(picked.map(u => fetchPage(u).then(r => { const p = parsePage(r.html, r.url); return { url: r.url.href, title: p.title, text: p.text, links: p.links }; }).catch(() => null)));
      for (const p of rest) if (p && p.text) pages.push(p);
      // İletişim ve sosyal medya: bütün sayfaların bağlantılarından ve metninden
      const allLinks = pages.flatMap(p => p.links);
      const allText = pages.map(p => p.text).join('\n');
      const emails = [...new Set([...allLinks.filter(l => /^mailto:/i.test(l.href)).map(l => l.href.slice(7).split('?')[0]), ...(allText.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || [])].map(e => e.toLowerCase()).filter(e => !/\.(png|jpe?g|webp|gif)$/.test(e)))].slice(0, 3);
      const phones = [...new Set(allLinks.filter(l => /^tel:/i.test(l.href)).map(l => l.href.slice(4).replace(/[^\d+]/g, '')).filter(x => x.length >= 7))].slice(0, 3);
      const socials = {};
      for (const l of allLinks) for (const [k, re] of Object.entries(SOCIAL)) if (!socials[k] && re.test(l.url.href) && !/\/(share|sharer|intent)/i.test(l.url.pathname)) socials[k] = l.url.href.split('?')[0];
      // Metin: her sayfa başlığıyla; toplam sınırı aşmayacak biçimde
      let text = [p0.siteName && `Site adı: ${p0.siteName}`, p0.description && `Site açıklaması: ${p0.description}`].filter(Boolean).join('\n');
      const per = Math.floor((MAX_TEXT - text.length) / pages.length);
      for (const p of pages) text += `\n\n=== ${p.title || p.url} (${p.url}) ===\n${p.text.slice(0, Math.max(per, 1500))}`;
      return {
        url: home.url.href, title: p0.title, siteName: p0.siteName, description: p0.description, themeColor: p0.themeColor,
        pages: pages.map(p => ({ url: p.url, title: p.title })),
        contacts: { emails, phones, socials },
        text: text.trim().slice(0, MAX_TEXT),
        ...( /<(?:rss|feed)\b/i.test(home.html) ? { rawXml: home.html } : {} )
      };
    },
    // Sektör kaynağı okuma: varsa RSS/Atom beslemesini otomatik bulur, yoksa ana sayfa HTML'ini döndürür
    async readSource(raw) {
      const input = String(raw || '').trim();
      if (!input) throw badRequest('Web sitesi adresini yaz.');
      let start;
      try { start = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : 'https://' + input); } catch { throw badRequest('Geçerli bir web sitesi adresi yaz (ör. ornek.com).'); }
      const home = await fetchPage(start);
      if (/<(?:rss|feed)\b/i.test(home.html)) {
        return { url: home.url.href, rawXml: home.html, html: '' };
      }
      // Sayfa içindeki <link rel="alternate" type="application/rss+xml|atom+xml"> etiketinden besleme bul
      for (const tag of home.html.match(/<link\b[^>]*>/gi) || []) {
        const type = attr(tag, 'type');
        const rel = attr(tag, 'rel');
        const href = attr(tag, 'href');
        if (href && (/rss|atom/i.test(type) || (/alternate/i.test(rel) && /(rss|atom|feed)/i.test(href)))) {
          try {
            const feedUrl = new URL(href, home.url);
            const feedRes = await fetchPage(feedUrl);
            if (/<(?:rss|feed)\b/i.test(feedRes.html)) {
              return { url: home.url.href, feedUrl: feedRes.url.href, rawXml: feedRes.html, html: home.html };
            }
          } catch { /* besleme alınamazsa HTML ile devam et */ }
        }
      }
      return { url: home.url.href, html: home.html, text: pageText(home.html) };
    },
    // Tek bir makale/haber sayfasının ana metnini hızlıca okur (alt sayfa taraması yapmaz)
    async readArticle(raw) {
      const input = String(raw || '').trim();
      if (!input) throw badRequest('Adres yaz.');
      let start;
      try { start = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : 'https://' + input); } catch { throw badRequest('Geçerli bir adres yaz.'); }
      const page = await fetchPage(start);
      const stripped = String(page.html || '')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(script|style|noscript|svg|template|iframe|canvas|form|nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
      const mainBlock = (stripped.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) || [])[1]
        || (stripped.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) || [])[1]
        || stripped;
      const bodyText = pageText(mainBlock);
      const fallback = bodyText.length >= 120 ? bodyText : pageText(stripped);
      return { url: page.url.href, title: parsePage(page.html, page.url).title, text: fallback.slice(0, 3500) };
    }
  };
}
