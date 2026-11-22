import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPlace, legacySeed, limit, makeLayout, pieces, seaLevel } from '../layout.js';
import { readWorld, saveWorld } from '../storage.js';
import { buildWorld } from '../world.js';

function snapshot(world) {
  return {
    frame: [world.rx, world.rz, world.rotation],
    coast: Array.from({ length: 16 }, (_, i) => world.coast(i * Math.PI / 8)),
    ground: [-3, -1, 1, 3].flatMap(x => [-2, 0, 2].map(z => world.height(x, z))),
    pond: world.pond,
    starters: world.starters,
    stones: world.stones,
  };
}

test('seed controls the coast, pond, landscape and starting objects', () => {
  for (const seed of [1, 240519, 39601832, 3785239714, 0xffffffff]) {
    const ready = makeLayout(seed, 'ready');
    assert.deepEqual(snapshot(ready), snapshot(makeLayout(seed, 'ready')));
    assert.notDeepEqual(snapshot(ready), snapshot(makeLayout(legacySeed, 'ready')));
    const empty = makeLayout(seed, 'empty');
    assert.deepEqual(snapshot(ready).coast, snapshot(empty).coast);
    assert.deepEqual(empty.starters, []);
    assert.equal(empty.pond, null);
    assert.equal(empty.path.length, 0);
  }
});

test('terrain, water shader and placement validator all match the generated outline', () => {
  for (const mode of ['ready', 'empty']) {
    const layout = makeLayout(9781230, mode);
    const world = buildWorld(layout);
    assert.equal(world.root.rotation.y, layout.rotation);
    const water = world.root.children.filter(item => item.material?.uniforms?.radii);
    assert.equal(water.length, mode === 'ready' ? 2 : 1);
    assert.deepEqual(water[0].material.uniforms.radii.value.toArray(), [layout.rx, layout.rz]);
    assert.deepEqual(water[0].material.uniforms.phases.value.toArray(), layout.phase);
    const [outsideX, outsideZ] = layout.coast(.4, 1.16);
    assert(layout.height(outsideX, outsideZ) < seaLevel);
    assert(!canPlace(layout, [], 'bunny', outsideX, outsideZ));
    assert(!canPlace(layout, [], 'house', Infinity, 0));
    assert(!canPlace(layout, [], 'house', ...layout.coast(.4, .85)));
    if (layout.pond) {
      const { x, z, y } = layout.pond;
      assert(layout.height(x, z) < y);
      assert(!canPlace(layout, [], 'bunny', x, z));
      assert.deepEqual(water[1].material.uniforms.origin.value.toArray(), [x, z]);
      assert.equal(water[1].position.y, y);
      assert(!canPlace(layout, layout.starters, 'bunny', layout.starters[0].x, layout.starters[0].z));
    }
    world.dispose();
  }
});

test('empty meadow fits a full mixed layout without overlaps', () => {
  const layout = makeLayout(240519, 'empty');
  const entries = [];
  for (const type of ['house', 'tree', 'bunny']) {
    let count = 0;
    for (let z = layout.rz; z >= -layout.rz; z -= .45) {
      for (let x = -layout.rx; x <= layout.rx; x += .45) {
        if (entries.length >= limit || count >= pieces[type].max || !canPlace(layout, entries, type, x, z)) continue;
        entries.push({ x, z, radius: pieces[type].radius });
        count++;
      }
    }
  }
  assert.equal(entries.length, limit);
  for (const [i, entry] of entries.entries()) {
    assert(layout.acceptsGround(entry.x, entry.z, entry.radius));
    for (const other of entries.slice(i + 1)) {
      assert(Math.hypot(entry.x - other.x, entry.z - other.z) > entry.radius + other.radius);
    }
  }
});

test('old saves retain their placements and v2 reloads the current seed and mode', () => {
  const records = new Map();
  const storage = {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
  };
  const old = [{ type: 'tree', x: -1.8, z: 2.35 }, { type: 'bunny', x: 2.18, z: 1.95 }];
  storage.setItem('magic-island-layout-v1', JSON.stringify(old));
  const migrated = readWorld(storage);
  assert.equal(migrated.seed, legacySeed);
  assert.equal(migrated.mode, 'ready');
  assert.deepEqual(migrated.placements, old.map(item => ({ ...item, legacy: true })));
  const layout = makeLayout(migrated.seed, migrated.mode);
  for (const item of migrated.placements) assert(canPlace(layout, layout.starters, item.type, item.x, item.z, true));
  saveWorld(storage, migrated.seed, migrated.mode, migrated.placements);
  assert.deepEqual(readWorld(storage), migrated);
  saveWorld(storage, 240519, 'empty', []);
  assert.deepEqual(readWorld(storage), { version: 2, seed: 240519, mode: 'empty', placements: [] });
});
