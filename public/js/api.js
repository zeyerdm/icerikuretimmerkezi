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
  if (res.status === 204) {
    // Çöpe atılan kayıt: arayüz "Geri al" bildirimi gösterir (views/trash.js)
    const tid = res.headers.get('X-Trash-Id');
    if (tid) document.dispatchEvent(new CustomEvent('ium:trashed', { detail: { id: tid } }));
    return null;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data && data.error) || {};
    throw new ApiError(res.status, e.code || 'ERROR', e.message || 'İstek başarısız oldu.');
  }
  return data;
}

// 8.4 Akışlı istek: sunucu metni parça parça (SSE) gönderir; signal ile iptal edilir. Sonuç normal istekle aynıdır.
export async function streamRequest(method, url, body, { onDelta = () => {}, onReset = () => {}, signal } = {}) {
  const cancelled = () => new ApiError(499, 'AI_CANCELLED', 'Üretim iptal edildi.');
  let res;
  try {
    res = await fetch(url + (url.includes('?') ? '&' : '?') + 'stream=1', { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  } catch {
    if (signal && signal.aborted) throw cancelled();
    throw new ApiError(0, 'NETWORK', 'Sunucuya ulaşılamadı. Uygulama çalışıyor mu? (npm start)');
  }
  if (!(res.headers.get('content-type') || '').includes('text/event-stream')) {
    const data = await res.json().catch(() => null);
    if (!res.ok) { const e = (data && data.error) || {}; throw new ApiError(res.status, e.code || 'ERROR', e.message || 'İstek başarısız oldu.'); }
    return data;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = (/^event: (.+)$/m.exec(block) || [])[1];
        const raw = (/^data: (.*)$/m.exec(block) || [])[1];
        const data = raw ? JSON.parse(raw) : {};
        if (ev === 'delta') onDelta(data.t || '');
        else if (ev === 'reset') onReset();
        else if (ev === 'done') { if (data.status >= 400) throw new ApiError(data.status, 'ERROR', 'İstek başarısız oldu.'); return data.body; }
        else if (ev === 'error') { const e = data.error || {}; throw new ApiError(data.status || 500, e.code || 'ERROR', e.message || 'İstek başarısız oldu.'); }
      }
    }
  } catch (err) {
    if (signal && signal.aborted) throw cancelled();
    throw err;
  }
  throw new ApiError(0, 'NETWORK', 'Bağlantı yarıda kesildi; tekrar dene.');
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
  restart: (force = false) => request('POST', '/api/system/restart', { force }),
  rollback: () => request('POST', '/api/system/rollback'),
  backups: () => request('GET', '/api/backups'),
  createBackup: () => request('POST', '/api/backups'),
  deleteBackup: name => request('DELETE', '/api/backups/' + encodeURIComponent(name)),
  restoreBackup: name => request('POST', '/api/backups/' + encodeURIComponent(name) + '/restore'),
  restoreBackupFile: file => request('POST', '/api/backups/restore-upload', file, { 'Content-Type': 'application/zip' }),
  aiOverview: () => request('GET', '/api/ai'),
  aiSaveKey: (provider, apiKey) => request('PUT', '/api/ai/keys/' + encodeURIComponent(provider), { apiKey }),
  aiRemoveKey: provider => request('DELETE', '/api/ai/keys/' + encodeURIComponent(provider)),
  aiModels: provider => request('GET', '/api/ai/models/' + encodeURIComponent(provider)),
  aiSaveTasks: tasks => request('PUT', '/api/ai/tasks', { tasks }),
  aiSmoke: () => request('POST', '/api/ai/smoke'),
  aiCheckModels: () => request('POST', '/api/ai/check-models'),
  aiSaveBudget: body => request('PUT', '/api/ai/budget', body),
  aiSavePrice: (ref, price) => request('PUT', '/api/ai/prices', { ref, price }),
  aiUsage: month => request('GET', '/api/ai/usage' + (month ? '?month=' + encodeURIComponent(month) : '')),
  aiCompare: body => request('POST', '/api/ai/compare', body),
  aiComparisons: () => request('GET', '/api/ai/comparisons'),
  aiSetWinner: (id, ref) => request('PUT', '/api/ai/comparisons/' + encodeURIComponent(id) + '/winner', { ref }),
  driveSettings: () => request('GET', '/api/settings/drive'),
  saveDrive: scriptUrl => request('PUT', '/api/settings/drive', { scriptUrl }),
  removeDrive: () => request('DELETE', '/api/settings/drive'),
  testBrandDrive: id => request('POST', b(id) + '/drive/test'),
  sendAssetToDrive: (id, assetId) => request('POST', `${b(id)}/assets/${assetId}/drive`),
  saveBackupSettings: body => request('PUT', '/api/settings/backup', body),
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
  uploadAsset: (id, file, category, label, pack = '') =>
    request('POST', `${b(id)}/assets?category=${encodeURIComponent(category)}&label=${encodeURIComponent(label || '')}&pack=${encodeURIComponent(pack || '')}`, file, { 'Content-Type': file.type || 'application/octet-stream' }),
  uploadAssetPack: (id, file, category, pack) =>
    request('POST', `${b(id)}/asset-packs?category=${encodeURIComponent(category)}&pack=${encodeURIComponent(pack)}`, file, { 'Content-Type': 'application/zip' }),
  assetPacks: id => request('GET', b(id) + '/asset-packs'),
  deleteAssetPack: (id, pack) => request('DELETE', `${b(id)}/asset-packs?pack=${encodeURIComponent(pack)}`),
  analyzeAsset: (id, assetId, body = {}) => request('POST', `${b(id)}/assets/${assetId}/analyze`, body),
  search: q => request('GET', '/api/search?q=' + encodeURIComponent(q)),
  trash: (brandId = '') => request('GET', '/api/trash' + (brandId ? '?brandId=' + encodeURIComponent(brandId) : '')),
  restoreTrash: id => request('POST', `/api/trash/${encodeURIComponent(id)}/restore`),
  deleteTrash: id => request('DELETE', `/api/trash/${encodeURIComponent(id)}`),
  emptyTrash: () => request('DELETE', '/api/trash'),
  updateAsset: (id, assetId, body) => request('PATCH', `${b(id)}/assets/${assetId}`, body),
  saveThumb: (id, assetId, blob) => request('PUT', `${b(id)}/assets/${assetId}/thumb`, blob, { 'Content-Type': blob.type || 'image/webp' }),
  igImportPreview: (id, file) => request('POST', `${b(id)}/import/instagram/preview`, file, { 'Content-Type': 'text/csv' }),
  igImportApply: (id, items) => request('POST', `${b(id)}/import/instagram/apply`, { items }),
  errors: () => request('GET', '/api/errors'),
  clearErrors: () => request('DELETE', '/api/errors'),
  deleteAsset: (id, assetId) => request('DELETE', `${b(id)}/assets/${assetId}`),

  ideas: (id, query = '') => request('GET', b(id) + '/ideas' + query),
  createIdea: (id, body) => request('POST', b(id) + '/ideas', body),
  deleteIdea: (id, ideaId) => request('DELETE', `${b(id)}/ideas/${ideaId}`),
  randomIdea: (id, body = {}) => request('POST', b(id) + '/ideas/random', body),
  useIdea: (id, ideaId, place) => request('POST', `${b(id)}/ideas/${ideaId}/use`, { place }),
  similarIdeas: (id, ideaId, body) => request('POST', `${b(id)}/ideas/${ideaId}/similar`, body),
  bulkUsedIdeas: (id, action) => request('POST', b(id) + '/ideas/bulk-used', { action }),

  writeContentText: (id, model) => request('POST', `/api/contents/${encodeURIComponent(id)}/write`, { model }),
  competitors: id => request('GET', b(id) + '/competitors'),
  createCompetitor: (id, body) => request('POST', b(id) + '/competitors', body),
  saveCompetitor: (id, cid, body) => request('PUT', `${b(id)}/competitors/${cid}`, body),
  deleteCompetitor: (id, cid) => request('DELETE', `${b(id)}/competitors/${cid}`),
  analyzeCompetitor: (id, cid, model) => request('POST', `${b(id)}/competitors/${cid}/analyze`, { model }),
  patterns: id => request('GET', b(id) + '/patterns'),
  analyzePattern: (id, body) => request('POST', b(id) + '/patterns', body),
  savePattern: (id, pid, body) => request('PUT', `${b(id)}/patterns/${pid}`, body),
  deletePattern: (id, pid) => request('DELETE', `${b(id)}/patterns/${pid}`),
  memory: id => request('GET', b(id) + '/memory'),
  saveMemoryLists: (id, body) => request('PUT', b(id) + '/memory', body),
  addFact: (id, body) => request('POST', b(id) + '/memory/facts', body),
  saveFact: (id, fid, body) => request('PUT', `${b(id)}/memory/facts/${fid}`, body),
  deleteFact: (id, fid) => request('DELETE', `${b(id)}/memory/facts/${fid}`),
  identityDraft: body => request('POST', '/api/identity-draft', body),
  specialDays: (from, to) => request('GET', `/api/special-days?from=${from}&to=${to}`),
  performance: brandId => request('GET', '/api/performance' + (brandId ? '?brandId=' + encodeURIComponent(brandId) : '')),
  // 8.9: sunucu tekrarlanan alanları "lookup" ile bir kez gönderir; burada her içeriğe geri eklenir
  dashboard: brandId => request('GET', '/api/dashboard' + (brandId ? '?brandId=' + encodeURIComponent(brandId) : '')).then(d => {
    const l = d && d.lookup;
    if (l) d.contents.forEach(c => { const b = l.brands[c.brandId] || {}; c.brandName = b.name || ''; c.brandColor = b.color || null; c.typeLabel = l.types[c.type] || c.type; c.statusLabel = l.statuses[c.status] || c.status; });
    return d;
  }),
  contents: (params = {}) => request('GET', '/api/contents?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString()),
  content: id => request('GET', '/api/contents/' + encodeURIComponent(id)),
  contentReviews: id => request('GET', `/api/contents/${encodeURIComponent(id)}/reviews`),
  reviewContent: (id, body) => request('POST', `/api/contents/${encodeURIComponent(id)}/review`, body),
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

  weekDraft: (id, body) => request('POST', `${b(id)}/plan/week/draft`, body),
  weekApply: (id, items) => request('POST', `${b(id)}/plan/week/apply`, { items }),
  captionSets: id => request('GET', `${b(id)}/caption-sets`),
  saveCaptionSets: (id, body) => request('PUT', `${b(id)}/caption-sets`, body),
  tts: () => request('GET', '/api/tts'),
  videoGen: () => request('GET', '/api/video-gen'),
  videoJobs: (id, reelsId) => request('GET', `${b(id)}/video-jobs${reelsId ? '?reelsId=' + encodeURIComponent(reelsId) : ''}`),
  startVideo: (id, rid, body) => request('POST', `${b(id)}/reels/${rid}/video`, body),
  deleteVideoJob: (id, jid) => request('DELETE', `${b(id)}/video-jobs/${jid}`),
  reelsVoice: (id, rid) => request('GET', `${b(id)}/reels/${rid}/voice`),
  makeReelsVoice: (id, rid, body) => request('POST', `${b(id)}/reels/${rid}/voice`, body),
  reelsSettings: id => request('GET', b(id) + '/reels/settings'),
  saveReelsSettings: (id, body) => request('PUT', b(id) + '/reels/settings', body),
  reelsPool: id => request('GET', b(id) + '/reels/pool'),
  addReelsPool: (id, body) => request('POST', b(id) + '/reels/pool', body),
  expandReelsPool: (id, body) => request('POST', b(id) + '/reels/pool/expand', body),
  updateReelsPool: (id, pid, body) => request('PATCH', `${b(id)}/reels/pool/${pid}`, body),
  deleteReelsPool: (id, pid) => request('DELETE', `${b(id)}/reels/pool/${pid}`),
  reelsList: id => request('GET', b(id) + '/reels'),
  createReels: (id, body, stream) => (stream ? streamRequest('POST', b(id) + '/reels', body, stream) : request('POST', b(id) + '/reels', body)),
  reels: (id, rid) => request('GET', `${b(id)}/reels/${rid}`),
  updateReels: (id, rid, body) => request('PATCH', `${b(id)}/reels/${rid}`, body),
  deleteReels: (id, rid) => request('DELETE', `${b(id)}/reels/${rid}`),
  regenerateReels: (id, rid, body) => request('POST', `${b(id)}/reels/${rid}/regenerate`, body),
  translateReels: (id, rid, body) => request('POST', `${b(id)}/reels/${rid}/translate`, body),
  restoreReels: (id, rid, versionId) => request('POST', `${b(id)}/reels/${rid}/restore`, { versionId }),
  scheduleReels: (id, rid, scheduledAt) => request('POST', `${b(id)}/reels/${rid}/schedule`, { scheduledAt }),
  posts: id => request('GET', b(id) + '/posts'),
  recipes: kind => request('GET', '/api/recipes' + (kind ? '?kind=' + kind : '')),
  promptToRecipe: (id, pid) => request('POST', `${b(id)}/prompts/${pid}/recipe`),
  identityToRecipe: (id, withMascot) => request('POST', `${b(id)}/prompt-identity/recipe`, { withMascot }),
  patternToRecipe: (id, pid) => request('POST', `${b(id)}/patterns/${pid}/recipe`),
  applyRecipe: (rid, brandId) => request('POST', `/api/recipes/${rid}/apply`, { brandId }),
  deleteRecipe: rid => request('DELETE', `/api/recipes/${rid}`),
  campaigns: id => request('GET', b(id) + '/campaigns'),
  campaign: (id, cid) => request('GET', `${b(id)}/campaigns/${cid}`),
  createCampaign: (id, body) => request('POST', b(id) + '/campaigns', body),
  updateCampaign: (id, cid, body) => request('PATCH', `${b(id)}/campaigns/${cid}`, body),
  deleteCampaign: (id, cid) => request('DELETE', `${b(id)}/campaigns/${cid}`),
  addCampaignItem: (id, cid, body) => request('POST', `${b(id)}/campaigns/${cid}/items`, body),
  updateCampaignItem: (id, cid, iid, body) => request('PATCH', `${b(id)}/campaigns/${cid}/items/${iid}`, body),
  deleteCampaignItem: (id, cid, iid) => request('DELETE', `${b(id)}/campaigns/${cid}/items/${iid}`),
  createPost: (id, body, stream) => (stream ? streamRequest('POST', b(id) + '/posts', body, stream) : request('POST', b(id) + '/posts', body)),
  post: (id, pid) => request('GET', `${b(id)}/posts/${pid}`),
  savePost: (id, pid, body) => request('PUT', `${b(id)}/posts/${pid}`, body),
  youtubeIdeas: (id, body) => request('POST', b(id) + '/youtube/ideas', body),
  promptIdentity: id => request('GET', b(id) + '/prompt-identity'),
  savePromptIdentity: (id, body) => request('PUT', b(id) + '/prompt-identity', body),
  saveFeedback: (id, body) => request('PUT', b(id) + '/feedback', body),
  feedbackSuggestions: id => request('GET', b(id) + '/feedback/suggestions'),
  applyFeedbackSuggestion: (id, reason) => request('POST', `${b(id)}/feedback/suggestions/${encodeURIComponent(reason)}/apply`),
  dismissFeedbackSuggestion: (id, reason) => request('POST', `${b(id)}/feedback/suggestions/${encodeURIComponent(reason)}/dismiss`),
  characterBook: id => request('GET', b(id) + '/character-book'),
  saveCharacterBook: (id, body) => request('PUT', b(id) + '/character-book', body),
  brandSetup: id => request('GET', b(id) + '/setup'),
  saveSetupStep: (id, step, body) => request('PUT', `${b(id)}/setup/${step}`, body),
  draftCharacterBook: id => request('POST', b(id) + '/character-book/draft', {}),
  deletePost: (id, pid) => request('DELETE', `${b(id)}/posts/${pid}`),
  rewritePost: (id, pid, body) => request('POST', `${b(id)}/posts/${pid}/rewrite`, body),
  schedulePost: (id, pid, scheduledAt) => request('POST', `${b(id)}/posts/${pid}/schedule`, { scheduledAt }),
  sharedTemplates: id => request('GET', b(id) + '/shared-templates'),
  shareTemplate: (id, pid, name) => request('POST', `${b(id)}/posts/${pid}/share-template`, { name }),
  useSharedTemplate: (id, tid, title) => request('POST', `${b(id)}/shared-templates/${tid}/use`, { title }),
  deleteSharedTemplate: tid => request('DELETE', `/api/shared-templates/${tid}`),
  postTemplates: id => request('GET', b(id) + '/post-templates'),
  saveTemplate: (id, pid, name) => request('POST', `${b(id)}/posts/${pid}/template`, { name }),
  deleteTemplate: (id, tid) => request('DELETE', `${b(id)}/post-templates/${tid}`),
  setTemplateMatch: (id, tid, body) => request('PUT', `${b(id)}/post-templates/${tid}/match`, body),
  postFromIdea: (id, body) => request('POST', b(id) + '/posts/from-idea', body),
  review: (id, body) => request('POST', b(id) + '/review', body),
  analyzeDesign: (id, body) => request('POST', b(id) + '/design-ref', body),
  imageOverview: () => request('GET', '/api/ai/images'),
  setImageDefault: model => request('PUT', '/api/ai/images', { model }),
  images: (id, promptId) => request('GET', b(id) + '/images' + (promptId ? '?promptId=' + encodeURIComponent(promptId) : '')),
  editImageRegion: (id, assetId, blob, instruction, model) => request('POST', `${b(id)}/images/edit?assetId=${encodeURIComponent(assetId)}&instruction=${encodeURIComponent(instruction)}${model ? '&model=' + encodeURIComponent(model) : ''}`, blob, { 'Content-Type': blob.type || 'image/png' }),
  setImageExample: (id, genId, example) => request('PUT', `${b(id)}/images/${genId}/example`, { example }),
  generateImage: (id, body) => request('POST', b(id) + '/images', body),
  imageTemplates: () => request('GET', '/api/image-templates'),
  imageFromTemplate: (id, body) => request('POST', b(id) + '/images/template', body),
  prompts: (id, params = {}) => request('GET', b(id) + '/prompts?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v))),
  brainstormPrompts: (id, body) => request('POST', b(id) + '/prompts/brainstorm', body),
  enhancePrompt: (id, body) => request('POST', b(id) + '/prompts/enhance', body),
  createPrompt: (id, body, stream) => (stream ? streamRequest('POST', b(id) + '/prompts', body, stream) : request('POST', b(id) + '/prompts', body)),
  prompt: (id, pid) => request('GET', `${b(id)}/prompts/${pid}`),
  savePrompt: (id, pid, body) => request('PUT', `${b(id)}/prompts/${pid}`, body),
  deletePrompt: (id, pid) => request('DELETE', `${b(id)}/prompts/${pid}`),
  improvePrompt: (id, pid, body) => request('POST', `${b(id)}/prompts/${pid}/improve`, body),
  translatePrompt: (id, pid, body) => request('POST', `${b(id)}/prompts/${pid}/translate`, body || {}),
  promptScene: (id, pid, body) => request('POST', `${b(id)}/prompts/${pid}/scenes`, body),
  promptVersion: (id, pid, vid) => request('GET', `${b(id)}/prompts/${pid}/versions/${vid}`),
  restorePrompt: (id, pid, versionId) => request('POST', `${b(id)}/prompts/${pid}/restore`, { versionId }),
  driveUpload: (id, blob, name, mime) => request('POST', `${b(id)}/drive/upload?name=${encodeURIComponent(name)}&mime=${encodeURIComponent(mime)}`, blob, { 'Content-Type': 'application/octet-stream' }),
  chat: id => request('GET', b(id) + '/chat'),
  sendChat: (id, message) => request('POST', b(id) + '/chat', { message }),
  clearChat: id => request('DELETE', b(id) + '/chat')
};
