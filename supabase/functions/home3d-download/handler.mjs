// Server-only code. No privileged credential is bundled into the Pages app.
export const VAULT_BUCKET = 'home-3d-vault';
const MAX_BYTES = 100 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = 'private, no-store, no-cache, max-age=0, must-revalidate';

function safePath(path) {
  return typeof path === 'string' && /\.glb$/i.test(path) &&
    !/[\\?#\x00-\x1f\x7f]/.test(path) &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
}

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  let text = ''; let size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) throw new Error('Large body');
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
}

function limitedStream(body) {
  const reader = body.getReader(); let size = 0;
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        size += value.byteLength;
        if (size > MAX_BYTES) throw new Error('Model size limit exceeded');
        controller.enqueue(value);
      } catch {
        await reader.cancel().catch(() => {});
        controller.error(new Error('Private model stream interrupted'));
      }
    },
    async cancel() { await reader.cancel().catch(() => {}); },
  });
}

export function createHandler({ config, fetchImpl = fetch }) {
  return async request => {
    const headers = new Headers({
      'Cache-Control': NO_STORE, 'CDN-Cache-Control': 'no-store',
      'Surrogate-Control': 'no-store', 'Vary': 'Origin, Authorization',
      'X-Content-Type-Options': 'nosniff',
    });
    const fail = (status, code) => Response.json({ error: code }, { status, headers });
    // Configuration failure must not make even the fictional scene public.
    if (!config || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url || '') ||
        !config.anonKey || !config.serviceKey || !/^https:\/\/[^/?#]+$/.test(config.origin || '')) return fail(503, 'not_configured');
    const origin = request.headers.get('Origin');
    if (origin && origin !== config.origin) return fail(403, 'origin_denied');
    headers.set('Access-Control-Allow-Origin', config.origin);
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return fail(405, 'post_required');
    const bearer = request.headers.get('Authorization') || '';
    if (!/^Bearer [A-Za-z0-9_.-]+$/.test(bearer) || bearer.length > 8192) return fail(401, 'session_required');
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return fail(415, 'json_required');
    let input;
    try { input = await readBody(request); } catch { return fail(400, 'invalid_request'); }
    if (!input || Object.keys(input).length !== 1 || typeof input.model_id !== 'string' || !UUID.test(input.model_id)) return fail(400, 'invalid_model_id');

    const base = config.url.replace(/\/$/, '');
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(120000)]);
    // Caller JWT is used ONLY for Auth and RLS-protected database requests.
    // It is never replaced by the service-role credential for these checks.
    const userHeaders = { apikey: config.anonKey, Authorization: bearer };
    const get = (path, extra = {}) => fetchImpl(base + path, {
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal,
      ...extra, headers: { ...userHeaders, ...extra.headers },
    });
    const allowed = async () => {
      const response = await get('/rest/v1/rpc/home3d_is_allowed', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!response.ok) throw new Error('Authorization unavailable');
      return await response.json() === true;
    };
    let upstream;
    try {
      const auth = await get('/auth/v1/user');
      if (!auth.ok) return fail(auth.status >= 500 ? 503 : 401, 'session_not_verified');
      const user = await auth.json();
      if (!UUID.test(user?.id || '') || user.role !== 'authenticated') return fail(401, 'user_session_required');
      if (!await allowed()) return fail(403, 'access_denied');
      const lookup = async () => {
        const response = await get('/rest/v1/home3d_models?select=id,storage_path&enabled=eq.true&id=eq.' + input.model_id);
        if (!response.ok) throw new Error('Catalog unavailable');
        const models = await response.json();
        if (!Array.isArray(models) || models.length !== 1 || models[0].id !== input.model_id || !safePath(models[0].storage_path)) return null;
        return models[0];
      };
      const model = await lookup();
      if (!model) return fail(404, 'model_unavailable');
      // Only server-known vault + catalog path; never a client URL/bucket/path.
      upstream = await fetchImpl(base + '/storage/v1/object/authenticated/' + VAULT_BUCKET + '/' + model.storage_path.split('/').map(encodeURIComponent).join('/'), {
        headers: { apikey: config.serviceKey, Authorization: 'Bearer ' + config.serviceKey },
        cache: 'no-store', credentials: 'omit', redirect: 'error', signal,
      });
      if (!upstream.ok || !upstream.body) { await upstream.body?.cancel(); return fail(503, 'asset_unavailable'); }
      const length = Number(upstream.headers.get('Content-Length'));
      if (!Number.isFinite(length) || length < 0 || length > MAX_BYTES) { await upstream.body.cancel(); return fail(413, 'asset_too_large'); }
      // Fetching/opening a large object can take time. Recheck permission AND
      // enabled catalog entry before emitting any private byte to the caller.
      const current = await lookup();
      if (!await allowed() || !current || current.storage_path !== model.storage_path) {
        await upstream.body.cancel(); return fail(403, 'access_revoked');
      }
      headers.set('Content-Type', 'model/gltf-binary');
      return new Response(limitedStream(upstream.body), { status: 200, headers });
    } catch {
      await upstream?.body?.cancel().catch(() => {});
      return fail(503, 'download_unavailable');
    }
  };
}
