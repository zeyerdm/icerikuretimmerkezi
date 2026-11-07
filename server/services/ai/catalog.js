// Yapay zekâ kataloğu: sağlayıcılar, önerilen modeller, yaklaşık fiyatlar ve işler.
// Fiyatlar USD / 1 milyon token. Sağlayıcılar fiyat değiştirdikçe Ayarlar → Yapay zekâ → Harcama'dan
// düzeltilebilir (düzeltme katalogdaki değeri ezer). OpenRouter fiyatları canlı olarak OpenRouter'dan okunur.

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic Claude',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    env: 'ANTHROPIC_API_KEY',
    note: 'Türkçe metin yazımında, marka diline uymada ve uzun senaryolarda en güçlü seçeneklerden.'
  },
  openai: {
    label: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    env: 'OPENAI_API_KEY',
    note: 'Genel amaçlı güçlü modeller; görsel üretimi (GPT Image) de aynı anahtarla.'
  },
  openrouter: {
    label: 'OpenRouter (tek anahtarla birçok model)',
    keyUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-…',
    env: 'OPENROUTER_API_KEY',
    note: 'Tek anahtar ve tek bakiye ile Claude, GPT, Gemini, Llama, Mistral… Denemek ve karşılaştırmak için pratik; fiyatlar canlı gelir.'
  },
  gemini: {
    label: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza…',
    env: 'GEMINI_API_KEY',
    note: 'Ücretsiz kotası olan hızlı modeller; görsel (Nano Banana) ve video (Veo) üretimi de Google\'da.'
  }
};

// Önerilen metin modelleri (canlı listede başka modeller de seçilebilir)
// price.source: 'resmi' = sağlayıcının yayımladığı fiyat, 'yaklasik' = Kasım 2026 kaynaklarına göre tahmini
export const MODELS = [
  { provider: 'anthropic', id: 'claude-opus-5-5', label: 'Claude Opus 5.5', tier: 'Üst', strengths: 'En özenli yazım, uzun Reels senaryosu, marka dili', price: { input: 4, output: 20, source: 'resmi' } },
  { provider: 'anthropic', id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', tier: 'Orta', strengths: 'Kalite/fiyat dengesi: açıklama, fikir, senaryo', price: { input: 2, output: 10, source: 'resmi' } },
  { provider: 'anthropic', id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', tier: 'Hızlı', strengths: 'Çok ucuz ve hızlı: çeviri, kısa metin, fikir taslağı', price: { input: 0.1, output: 0.5, source: 'resmi' } },
  { provider: 'openai', id: 'gpt-5', label: 'GPT-5', tier: 'Üst', strengths: 'Genel amaçlı güçlü yazım ve akıl yürütme', price: { input: 1.25, output: 10, source: 'yaklasik' } },
  { provider: 'openai', id: 'gpt-5-mini', label: 'GPT-5 mini', tier: 'Hızlı', strengths: 'Ucuz, hızlı genel amaçlı', price: { input: 0.25, output: 2, source: 'yaklasik' } },
  { provider: 'gemini', id: 'gemini-pro-latest', label: 'Gemini Pro (son sürüm)', tier: 'Üst', strengths: 'Uzun bağlam, analiz', price: { input: 2, output: 12, source: 'yaklasik' } },
  { provider: 'gemini', id: 'gemini-flash-latest', label: 'Gemini Flash (son sürüm)', tier: 'Orta', strengths: 'Hızlı, ücretsiz kota', price: { input: 0.5, output: 3, source: 'yaklasik' } },
  { provider: 'gemini', id: 'gemini-flash-lite-latest', label: 'Gemini Flash-Lite (son sürüm)', tier: 'Hızlı', strengths: 'En ucuz Google modeli', price: { input: 0.25, output: 1.5, source: 'yaklasik' } }
];

// İşler: her işe ayrı model ve isteğe bağlı yedek model atanır
export const TASKS = {
  fikir: { label: 'Fikir üretimi ve asistan', hint: 'Marka ana sayfasındaki AI asistanı ve fikir havuzu bunu kullanır.' },
  yazim: { label: 'Metin yazımı', hint: 'Reels senaryosu, gönderi açıklaması, carousel metni (Aşama 3 modülleri bunu kullanacak).' },
  ceviri: { label: 'Çeviri ve prompt', hint: 'Türkçe metni düzeltme, İngilizce Flow/Veo prompt\'u (Aşama 3 modülleri bunu kullanacak).' }
};

// Ayar yapılmadıysa: anahtarı olan ilk sağlayıcının bu iş için önerilen modeli
export const DEFAULT_ORDER = ['anthropic', 'openai', 'gemini'];
export const RECOMMENDED = {
  anthropic: { fikir: 'claude-sonnet-5-5', yazim: 'claude-sonnet-5-5', ceviri: 'claude-haiku-5-5' },
  openai: { fikir: 'gpt-5-mini', yazim: 'gpt-5', ceviri: 'gpt-5-mini' },
  gemini: { fikir: 'gemini-flash-latest', yazim: 'gemini-pro-latest', ceviri: 'gemini-flash-lite-latest' }
};

export const modelRef = (provider, id) => `${provider}:${id}`;
export function parseRef(ref) {
  const s = String(ref || '');
  const i = s.indexOf(':');
  if (i <= 0 || i === s.length - 1) return null;
  const provider = s.slice(0, i);
  const id = s.slice(i + 1);
  if (!PROVIDERS[provider] && provider !== 'fake') return null;
  if (!/^[A-Za-z0-9._\/:@-]{1,120}$/.test(id)) return null;
  return { provider, id };
}
export const catalogModel = ref => MODELS.find(m => modelRef(m.provider, m.id) === ref) || null;
