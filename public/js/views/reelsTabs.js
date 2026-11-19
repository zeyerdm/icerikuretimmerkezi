// Reels ve video bölümünün sekmeleri (tarayıcıya bağımlı modül içermez; video.js Node testlerinde de yüklenir)
const base = brand => `#/m/${encodeURIComponent(brand.id)}/reels`;
// Reels ve video tek bölüm: fikir havuzu, senaryolar, kalıplar ve video düzenleme / altyazı
export function reelsTabs(brand, active) {
  return `<div class="tabs" role="tablist">${[['havuz', 'Fikirler', base(brand)], ['liste', 'Senaryolar', base(brand) + '/liste'], ['kaliplar', 'Kalıp arşivi', base(brand) + '/kaliplar'], ['video', 'Video ve altyazı', `#/m/${encodeURIComponent(brand.id)}/video`]].map(([id, label, href]) =>
    `<a role="tab" href="${href}" class="${active === id ? 'active' : ''}" aria-selected="${active === id}">${label}</a>`).join('')}</div>`;
}
