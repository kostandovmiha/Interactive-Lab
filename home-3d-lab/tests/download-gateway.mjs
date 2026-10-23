import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, VAULT_BUCKET } from '../../supabase/functions/home3d-download/handler.mjs';

const ID = '33333333-3333-4333-8333-333333333333';
const USER = '11111111-1111-4111-8111-111111111111';
const config = { url: 'https://testproject.supabase.co', anonKey: 'TEST_PUBLIC_KEY', serviceKey: 'TEST_SERVER_ONLY_KEY', origin: 'https://app.example' };
const bytes = new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0]);
function request({ method = 'POST', body = { model_id: ID }, token = 'test.jwt.user', origin = config.origin, contentType = 'application/json' } = {}) {
  const headers = { 'Content-Type': contentType };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (origin) headers.Origin = origin;
  return new Request(config.url + '/functions/v1/home3d-download', {
    method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}
function fixture(options = {}) {
  const state = { allowed: true, enabled: true, ...options }; const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    if (!url.includes('/storage/v1/')) {
      assert.equal(init.headers.Authorization, 'Bearer test.jwt.user');
      assert.equal(init.headers.apikey, config.anonKey);
    }
    if (url.endsWith('/auth/v1/user')) {
      return Response.json({ id: USER, role: state.role || 'authenticated' }, { status: state.authStatus || 200 });
    }
    if (url.endsWith('/rpc/home3d_is_allowed')) {
      if (state.rpcFails) throw new Error('Do not leak ' + config.serviceKey);
      return Response.json(state.allowed, { status: state.rpcStatus || 200 });
    }
    if (url.includes('/rest/v1/home3d_models?')) {
      return Response.json(state.enabled ? [{ id: ID, storage_path: state.path || 'test/fictional house.glb' }] : [], { status: state.catalogStatus || 200 });
    }
    assert.ok(url.startsWith(config.url + '/storage/v1/object/authenticated/' + VAULT_BUCKET + '/'));
    assert.equal(init.headers.apikey, config.serviceKey);
    assert.equal(init.headers.Authorization, 'Bearer ' + config.serviceKey);
    if (state.revokeDuringFetch) state.allowed = false;
    if (state.disableDuringFetch) state.enabled = false;
    if (state.changePathDuringFetch) state.path = 'different.glb';
    // Simulate a Storage CDN that ALWAYS returns a cached successful response,
    // regardless of user revocation. Only the server gateway may read it.
    return new Response(state.upstreamBytes || bytes, {
      status: state.storageStatus || 200,
      headers: { 'Cache-Control': 'public, max-age=3600', 'CF-Cache-Status': 'HIT', ...state.storageHeaders },
    });
  };
  return { state, calls, handler: createHandler({ config, fetchImpl }) };
}
async function assertFailure(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
  const text = await response.text();
  assert.ok(!text.includes(config.serviceKey));
  assert.ok(!text.includes('fictional house.glb'));
  assert.notEqual(text.slice(0, 4), 'glTF');
}

test('unconfigured, anonymous, invalid sessions and service identities fail closed', async () => {
  let fetched = false;
  const handler = createHandler({ config: {}, fetchImpl: () => { fetched = true; } });
  await assertFailure(await handler(request()), 503);
  assert.equal(fetched, false);
  const anonymous = fixture();
  await assertFailure(await anonymous.handler(request({ token: '' })), 401);
  assert.equal(anonymous.calls.length, 0);
  for (const options of [{ authStatus: 401 }, { role: 'service_role' }, { role: 'anon' }]) {
    const f = fixture(options);
    await assertFailure(await f.handler(request()), 401);
    assert.equal(f.calls.length, 1);
  }
});
test('denied user never reaches privileged Storage, even when CDN would return cached GLB', async () => {
  const f = fixture({ allowed: false });
  await assertFailure(await f.handler(request()), 403);
  assert.equal(f.calls.filter(c => c.url.includes('/storage/')).length, 0);
});
test('POST rechecks authorization on every identical request after a warmed successful download', async () => {
  const f = fixture();
  const allowed = await f.handler(request());
  assert.equal(allowed.status, 200);
  assert.deepEqual(new Uint8Array(await allowed.arrayBuffer()), bytes);
  assert.equal(allowed.headers.get('Content-Type'), 'model/gltf-binary');
  assert.match(allowed.headers.get('Cache-Control'), /private, no-store/);
  assert.equal(allowed.headers.get('CF-Cache-Status'), null);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), config.origin);
  const storageCalls = f.calls.filter(c => c.url.includes('/storage/')).length;
  f.state.allowed = false;
  for (let i = 0; i < 3; i++) await assertFailure(await f.handler(request()), 403);
  assert.equal(f.calls.filter(c => c.url.includes('/storage/')).length, storageCalls);
});
test('missing/disabled model, catalog failure and corrupt paths cannot choose privileged URLs', async () => {
  for (const path of ['../secret.glb', 'folder/../x.glb', '/x.glb', 'x.glb?token=anything', 'x.glb#x', 'x\\y.glb', 'https://attacker.test/x.glb']) {
    const f = fixture({ path });
    await assertFailure(await f.handler(request()), 404);
    assert.equal(f.calls.filter(c => c.url.includes('/storage/')).length, 0);
  }
  await assertFailure(await fixture({ enabled: false }).handler(request()), 404);
  await assertFailure(await fixture({ catalogStatus: 500 }).handler(request()), 503);
});
test('revocation or catalog change during Storage fetch emits no private bytes', async () => {
  for (const options of [{ revokeDuringFetch: true }, { disableDuringFetch: true }, { changePathDuringFetch: true }]) {
    const f = fixture(options);
    await assertFailure(await f.handler(request()), 403);
    assert.equal(f.calls.filter(c => c.url.includes('/storage/')).length, 1);
  }
});
test('authorization outage and Storage failures have no fallback or credential leakage', async () => {
  await assertFailure(await fixture({ rpcFails: true }).handler(request()), 503);
  await assertFailure(await fixture({ rpcStatus: 500 }).handler(request()), 503);
  for (const storageStatus of [400, 401, 403, 404, 500]) {
    await assertFailure(await fixture({ storageStatus }).handler(request()), 503);
  }
  await assertFailure(await fixture({ storageHeaders: { 'Content-Length': String(101 * 1024 * 1024) } }).handler(request()), 413);
});
test('body limits, strict ID-only input, methods and origins are enforced before privileged calls', async () => {
  const f = fixture();
  for (const body of [{}, { model_id: '../anything' }, { model_id: [ID] }, { model_id: ID, storage_path: 'attack.glb' }, '{bad', 'a'.repeat(1025)]) {
    await assertFailure(await f.handler(request({ body })), 400);
  }
  await assertFailure(await f.handler(request({ method: 'GET' })), 405);
  await assertFailure(await f.handler(request({ origin: 'https://attacker.test' })), 403);
  await assertFailure(await f.handler(request({ contentType: 'text/plain' })), 415);
  const options = await f.handler(request({ method: 'OPTIONS' }));
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
  assert.equal(f.calls.length, 0);
});
test('encoded catalog paths remain inside the fixed vault and only binary response headers escape', async () => {
  const f = fixture();
  const result = await f.handler(request({ origin: '' }));
  assert.equal(result.status, 200);
  assert.match(f.calls.find(c => c.url.includes('/storage/')).url, /\/home-3d-vault\/test\/fictional%20house.glb$/);
  for (const [name, value] of result.headers) {
    assert.ok(!/authorization|apikey|location/i.test(name));
    assert.ok(!value.includes(config.serviceKey));
  }
  await result.body.cancel();
});

test('unknown-length oversized upstream is cut off and cancelled without forwarding the offending chunk', async () => {
  let cancelled = false;
  // Exercise real handler stream handling, with controlled Auth/DB and a
  // single oversized upstream chunk. Never allocate or export a real model.
  const handler = createHandler({ config, fetchImpl: async (url, init) => {
    if (url.includes('/storage/')) return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(100 * 1024 * 1024 + 1)); },
      cancel() { cancelled = true; },
    }));
    if (url.endsWith('/auth/v1/user')) return Response.json({id:USER,role:'authenticated'});
    if (url.includes('/rpc/')) return Response.json(true);
    return Response.json([{id:ID,storage_path:'fixture.glb'}]);
  }});
  const result = await handler(request());
  await assert.rejects(result.arrayBuffer(), /stream interrupted/);
  assert.equal(cancelled, true);
});
