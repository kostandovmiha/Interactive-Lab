// Lightweight build-free regression checks for the standalone GLB Viewer.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const viewer = readFileSync(new URL('../glb-viewer/index.html', import.meta.url), 'utf8');
const homepage = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const match = viewer.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(match, 'Viewer must contain its Three.js module.');
const js = match[1];

// Parse as an ES module without network access or third-party npm packages.
const check = spawnSync(process.execPath, ['--check', '--input-type=module'], {
  input: js, encoding: 'utf8'
});
assert.equal(check.status, 0, 'Viewer JS has invalid syntax:\n' + check.stderr);
const ids = new Set([...viewer.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]));
for (const ref of js.matchAll(/byId\('([^']+)'\)/g)) {
  assert.ok(ids.has(ref[1]), 'Missing element referenced by JS: ' + ref[1]);
}
for (const id of ['stage','viewport','file','fit','front','side','top','grid','axes','wire','spin','background','exposure','animation','play','png']) {
  assert.ok(ids.has(id), 'Missing control: ' + id);
}
for (const feature of ['DRACOLoader','KTX2Loader','MeshoptDecoder','RoomEnvironment','inspectGLB','parseAsync']) {
  assert.ok(js.includes(feature), 'Missing loader feature: ' + feature);
}
assert.ok(homepage.includes('href="./glb-viewer/"'), 'Home page must link to GLB Viewer.');
console.log('PASS: GLB Viewer module syntax, controls, loaders and homepage link.');
