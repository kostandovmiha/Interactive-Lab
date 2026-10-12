import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, redirectURL } from '../js/configuration.js';
import { validateGLB, downloadModel } from '../js/assets.js';
import { Auth } from '../js/auth.js';

const config = { supabaseUrl: 'https://testproject.supabase.co', supabasePublishableKey: 'sb_publishable_TESTONLY', maxModelBytes: 4096, groups: { floors: ['Floor'] } };
const authorization = { userId: 'allowed-uuid', token: 'test-token' };
function glb(document = { asset: { version: '2.0' }, buffers: [] }) {
  const text = JSON.stringify(document); const padded = text.padEnd(Math.ceil(text.length / 4) * 4, ' ');
  const buffer = new ArrayBuffer(20 + padded.length); const view = new DataView(buffer);
  [0x46546c67, 2, buffer.byteLength, padded.length, 0x4e4f534a].forEach((n, i) => view.setUint32(i * 4, n, true));
  new Uint8Array(buffer, 20).set(new TextEncoder().encode(padded)); return buffer;
}
test('configuration fails closed and rejects privileged keys and non-Supabase endpoints', () => {
  assert.throws(() => validateConfig({}));
  assert.throws(() => validateConfig({ ...config, supabasePublishableKey: 'sb_secret_TEST' }));
  const service = `a.${btoa(JSON.stringify({role:'service_role'}))}.c`;
  assert.throws(() => validateConfig({ ...config, supabasePublishableKey: service }));
  assert.throws(() => validateConfig({ ...config, supabaseUrl: 'http://testproject.supabase.co' }));
  assert.throws(() => validateConfig({ ...config, supabaseUrl: 'https://attacker.test' }));
  assert.equal(validateConfig(config), config);
});
test('OAuth redirect preserves GitHub Pages subpath and drops callback parameters', () => {
  assert.equal(redirectURL('https://kostandovmiha.github.io/Interactive-Lab/home-3d-lab/?code=test#x'), 'https://kostandovmiha.github.io/Interactive-Lab/home-3d-lab/');
});
test('GLB gate rejects external buffers, textures and unsupported required codecs', () => {
  assert.doesNotThrow(() => validateGLB(glb()));
  for (const document of [{buffers:[{uri:'secret.bin'}]}, {images:[{uri:'https://attacker.test/track.png'}]}, {images:[{uri:'data:image/png;base64,AAA'}]}, {extensionsRequired:['KHR_draco_mesh_compression']}]) assert.throws(() => validateGLB(glb(document)));
  assert.throws(() => validateGLB(new ArrayBuffer(5)));
  const bad = glb(); new DataView(bad).setUint32(8, 10, true); assert.throws(() => validateGLB(bad));
});
test('no authentication means no Storage request', async () => {
  let calls = 0;
  await assert.rejects(downloadModel({ config, model: {storage_path:'home.glb'}, fetchImpl: async () => { calls++; } }));
  assert.equal(calls, 0);
});
test('authenticated object endpoint carries JWT, never uses a public/signed URL', async () => {
  let request;
  const buffer = await downloadModel({ config, authorization, model: {storage_path:'models/fictional house.glb'}, fetchImpl: async (url, init) => { request = {url,init}; return new Response(glb()); } });
  assert.match(request.url, /\/object\/authenticated\/home-3d-private\/models\/fictional%20house.glb$/);
  assert.equal(request.init.headers.Authorization, 'Bearer test-token');
  assert.equal(request.init.cache, 'no-store'); assert.equal(request.init.redirect, 'error');
  validateGLB(buffer);
});
test('failed Storage responses, traversal and oversized bodies never reach the GLB parser', async () => {
  for (const status of [401,403,404,500]) await assert.rejects(downloadModel({config,authorization,model:{storage_path:'home.glb'},fetchImpl:async()=>new Response('',{status})}));
  for (const path of ['../home.glb','/home.glb','folder/../home.glb','home.glb?x','folder\\home.glb']) await assert.rejects(downloadModel({config,authorization,model:{storage_path:path}}));
  await assert.rejects(downloadModel({config,authorization,model:{storage_path:'home.glb'},fetchImpl:async()=>new Response(new Uint8Array(5000))}));
  await assert.rejects(downloadModel({config,authorization,model:{storage_path:'home.glb'},fetchImpl:async()=>new Response('',{headers:{'content-length':'5000'}})}));
});
function client({session = true, serverError = false, allowed = false, rowId = 'allowed-uuid'} = {}) {
  return {
    auth: {
      getSession: async()=>({data:{session:session ? {user:{id:'allowed-uuid'},access_token:'test-token'} : null}}),
      getUser: async()=>({data:{user:{id:'allowed-uuid'}},error:serverError ? Error('failed') : null}),
    },
    from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:allowed?{user_id:rowId}:null,error:null})}),
  };
}
test('server session validation and UUID allowlist are both required', async () => {
  assert.equal(await new Auth(client({session:false})).authorize(),null);
  await assert.rejects(new Auth(client()).authorize());
  await assert.rejects(new Auth(client({allowed:true,serverError:true})).authorize());
  await assert.rejects(new Auth(client({allowed:true,rowId:'other-user'})).authorize());
  assert.deepEqual(await new Auth(client({allowed:true})).authorize(),authorization);
});
