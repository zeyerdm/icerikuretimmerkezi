// Sunucu API istemcisi: tüm istekler buradan geçer, hatalar tek biçimde fırlatılır.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, url, body, headers = {}) {
  const init = { method, headers: Object.assign({}, headers) };
  if (body instanceof Blob) init.body = body;
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'NETWORK', 'Sunucuya ulaşılamadı. Uygulama çalışıyor mu? (npm start)');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data && data.error) || {};
    throw new ApiError(res.status, e.code || 'ERROR', e.message || 'İstek başarısız oldu.');
  }
  return data;
}

const b = id => `/api/brands/${encodeURIComponent(id)}`;

export const api = {
  meta: () => request('GET', '/api/meta'),
  settings: () => request('GET', '/api/settings'),
  saveAi: body => request('PUT', '/api/settings/ai', body),
  removeAiKey: () => request('DELETE', '/api/settings/ai/key'),
  testAi: () => request('POST', '/api/settings/ai/test'),
  setActiveBrand: brandId => request('PUT', '/api/settings/active-brand', { brandId }),

  brands: () => request('GET', '/api/brands'),
  brand: id => request('GET', b(id)),
  createBrand: body => request('POST', '/api/brands', body),
  updateBrand: (id, body) => request('PATCH', b(id), body),
  deleteBrand: id => request('DELETE', b(id)),
  overview: id => request('GET', b(id) + '/overview'),

  assets: (id, category) => request('GET', b(id) + '/assets' + (category ? '?category=' + encodeURIComponent(category) : '')),
  uploadAsset: (id, file, category, label) =>
    request('POST', `${b(id)}/assets?category=${encodeURIComponent(category)}&label=${encodeURIComponent(label || '')}`, file, { 'Content-Type': file.type || 'application/octet-stream' }),
  updateAsset: (id, assetId, body) => request('PATCH', `${b(id)}/assets/${assetId}`, body),
  deleteAsset: (id, assetId) => request('DELETE', `${b(id)}/assets/${assetId}`),

  ideas: (id, query = '') => request('GET', b(id) + '/ideas' + query),
  updateIdea: (id, ideaId, body) => request('PATCH', `${b(id)}/ideas/${ideaId}`, body),

  chat: id => request('GET', b(id) + '/chat'),
  sendChat: (id, message) => request('POST', b(id) + '/chat', { message }),
  clearChat: id => request('DELETE', b(id) + '/chat')
};
