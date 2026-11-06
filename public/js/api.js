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
  system: () => request('GET', '/api/system'),
  checkUpdate: () => request('POST', '/api/system/check'),
  restart: () => request('POST', '/api/system/restart'),
  saveUpdateToken: token => request('PUT', '/api/settings/update-token', { token }),
  removeUpdateToken: () => request('DELETE', '/api/settings/update-token'),
  health: () => request('GET', '/api/health'),
  setActiveBrand: brandId => request('PUT', '/api/settings/active-brand', { brandId }),

  brands: () => request('GET', '/api/brands'),
  brand: id => request('GET', b(id)),
  createBrand: body => request('POST', '/api/brands', body),
  createDemoBrand: () => request('POST', '/api/brands/demo'),
  updateBrand: (id, body) => request('PATCH', b(id), body),
  deleteBrand: id => request('DELETE', b(id)),
  overview: id => request('GET', b(id) + '/overview'),

  assets: (id, category) => request('GET', b(id) + '/assets' + (category ? '?category=' + encodeURIComponent(category) : '')),
  uploadAsset: (id, file, category, label) =>
    request('POST', `${b(id)}/assets?category=${encodeURIComponent(category)}&label=${encodeURIComponent(label || '')}`, file, { 'Content-Type': file.type || 'application/octet-stream' }),
  updateAsset: (id, assetId, body) => request('PATCH', `${b(id)}/assets/${assetId}`, body),
  deleteAsset: (id, assetId) => request('DELETE', `${b(id)}/assets/${assetId}`),

  ideas: (id, query = '') => request('GET', b(id) + '/ideas' + query),
  createIdea: (id, body) => request('POST', b(id) + '/ideas', body),
  deleteIdea: (id, ideaId) => request('DELETE', `${b(id)}/ideas/${ideaId}`),

  dashboard: brandId => request('GET', '/api/dashboard' + (brandId ? '?brandId=' + encodeURIComponent(brandId) : '')),
  contents: (params = {}) => request('GET', '/api/contents?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString()),
  createContent: body => request('POST', '/api/contents', body),
  updateContent: (id, body) => request('PATCH', '/api/contents/' + encodeURIComponent(id), body),
  deleteContent: id => request('DELETE', '/api/contents/' + encodeURIComponent(id)),
  tasks: (params = {}) => request('GET', '/api/tasks?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()),
  createTask: body => request('POST', '/api/tasks', body),
  updateTask: (id, body) => request('PATCH', '/api/tasks/' + encodeURIComponent(id), body),
  deleteTask: id => request('DELETE', '/api/tasks/' + encodeURIComponent(id)),
  notes: (params = {}) => request('GET', '/api/notes?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()),
  createNote: body => request('POST', '/api/notes', body),
  updateNote: (id, body) => request('PATCH', '/api/notes/' + encodeURIComponent(id), body),
  deleteNote: id => request('DELETE', '/api/notes/' + encodeURIComponent(id)),
  updateIdea: (id, ideaId, body) => request('PATCH', `${b(id)}/ideas/${ideaId}`, body),

  chat: id => request('GET', b(id) + '/chat'),
  sendChat: (id, message) => request('POST', b(id) + '/chat', { message }),
  clearChat: id => request('DELETE', b(id) + '/chat')
};
