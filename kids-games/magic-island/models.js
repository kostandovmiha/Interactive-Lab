import * as T from './vendor/three.module.min.js';

const palette = new Map();
export function paint(color) {
  if (!palette.has(color)) palette.set(color, new T.MeshStandardMaterial({ color, roughness: .86 }));
  return palette.get(color);
}

export function random(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const sphere = new T.SphereGeometry(1, 20, 14);
const smallSphere = new T.SphereGeometry(1, 9, 6);
const pebble = new T.IcosahedronGeometry(1, 1);
const crown = new T.IcosahedronGeometry(1, 3);
const points = crown.attributes.position;
for (let i = 0; i < points.count; i++) {
  const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
  const n = 1 + .105 * Math.sin(x * 5 + z * 2) * Math.cos(y * 4 - z * 3)
    + .047 * Math.sin(8 * x + 4 * y + 6 * z);
  points.setXYZ(i, x * n, y * n, z * n);
}
crown.computeVertexNormals();
// Preserve a smooth silhouette and lighting across the non-indexed triangles.
const normal = crown.attributes.normal;
const candidates = new Map();
for (let i = 0; i < points.count; i++) {
  const key = [points.getX(i), points.getY(i), points.getZ(i)].map(n => Math.round(n * 1e5)).join();
  if (!candidates.has(key)) candidates.set(key, { total: new T.Vector3(), indices: [] });
  const entry = candidates.get(key);
  entry.total.add(new T.Vector3().fromBufferAttribute(normal, i));
  entry.indices.push(i);
}
for (const { total, indices } of candidates.values()) {
  total.normalize();
  for (const i of indices) normal.setXYZ(i, total.x, total.y, total.z);
}

const rounded = new T.Shape();
const edge = .42;
rounded.moveTo(-edge, -.5);
rounded.lineTo(edge, -.5);
rounded.quadraticCurveTo(.5, -.5, .5, -edge);
rounded.lineTo(.5, edge);
rounded.quadraticCurveTo(.5, .5, edge, .5);
rounded.lineTo(-edge, .5);
rounded.quadraticCurveTo(-.5, .5, -.5, edge);
rounded.lineTo(-.5, -edge);
rounded.quadraticCurveTo(-.5, -.5, -edge, -.5);
const box = new T.ExtrudeGeometry(rounded, {
  depth: .84, bevelEnabled: true, bevelSize: .045, bevelThickness: .08, bevelSegments: 2, curveSegments: 3,
});
box.translate(0, 0, -.42);
const cylinder = new T.CylinderGeometry(.82, 1, 1, 10);
const torus = new T.TorusGeometry(1, .11, 8, 24);

function mesh(parent, geometry, color, x, y, z, sx, sy, sz) {
  const item = new T.Mesh(geometry, typeof color === 'string' ? paint(color) : color);
  item.position.set(x, y, z);
  item.scale.set(sx, sy, sz);
  parent.add(item);
  return item;
}
export function oval(parent, color, x, y, z, sx, sy, sz) {
  const geometry = Math.max(sx, sy, sz) < .145 ? smallSphere : sphere;
  return mesh(parent, geometry, color, x, y, z, sx, sy, sz);
}
export function block(parent, color, x, y, z, sx, sy, sz) {
  return mesh(parent, box, color, x, y, z, sx, sy, sz);
}
export function rock(parent, color, x, y, z, sx, sy, sz) {
  return mesh(parent, pebble, color, x, y, z, sx, sy, sz);
}
export function foliage(parent, color, x, y, z, sx, sy, sz) {
  return mesh(parent, crown, color, x, y, z, sx, sy, sz);
}

export function branch(parent, color, from, to, width) {
  const start = new T.Vector3(...from), end = new T.Vector3(...to);
  const delta = end.clone().sub(start);
  const center = start.addScaledVector(delta, .5);
  const item = mesh(parent, cylinder, color, ...center, width, delta.length(), width);
  item.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
  return item;
}

export function line(parent, color, points, thickness) {
  const curve = new T.CatmullRomCurve3(points.map(point => new T.Vector3(...point)));
  return mesh(parent, new T.TubeGeometry(curve, 12, thickness, 6), color, 0, 0, 0, 1, 1, 1);
}

// Bake static model parts into one draw per material; animated models reuse these buffers.
export function bake(source, { shadow = true } = {}) {
  source.updateMatrixWorld(true);
  const surfaces = new Map();
  const vertex = new T.Vector3(), direction = new T.Vector3(), normalMatrix = new T.Matrix3();
  source.traverse(item => {
    if (!item.isMesh) return;
    if (!surfaces.has(item.material)) surfaces.set(item.material, { positions: [], normals: [] });
    const { positions, normals } = surfaces.get(item.material);
    const { position, normal } = item.geometry.attributes;
    const index = item.geometry.index;
    normalMatrix.getNormalMatrix(item.matrixWorld);
    for (let i = 0; i < (index?.count ?? position.count); i++) {
      const k = index ? index.getX(i) : i;
      vertex.fromBufferAttribute(position, k).applyMatrix4(item.matrixWorld);
      direction.fromBufferAttribute(normal, k).applyNormalMatrix(normalMatrix);
      positions.push(vertex.x, vertex.y, vertex.z);
      normals.push(direction.x, direction.y, direction.z);
    }
  });
  const model = new T.Group();
  for (const [material, { positions, normals }] of surfaces) {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    const item = new T.Mesh(geo, material);
    item.castShadow = shadow;
    item.receiveShadow = true;
    model.add(item);
  }
  return model;
}

function orchard(colors, fruit) {
  const tree = new T.Group();
  const bark = '#9d6646';
  line(tree, bark, [[0, -.08, 0], [-.055, .30, .015], [.02, .63, .025], [.15, 1.22, -.05]], .115);
  for (const root of [[-.29, 0, -.06], [.25, 0, -.13], [.06, 0, .27]]) {
    branch(tree, bark, [0, .13, 0], root, .055);
  }
  branch(tree, '#a8754e', [-.015, .42, .01], [-.43, 1.09, .15], .067);
  branch(tree, '#a8754e', [.035, .57, .01], [.49, 1.12, .15], .065);
  const clumps = [
    [-.4, 1.08, .09, .49, .48, .49],
    [.37, 1.16, .05, .58, .52, .52],
    [-.14, 1.25, -.32, .58, .57, .46],
    [.06, 1.52, -.04, .62, .66, .58],
    [-.24, 1.40, .39, .47, .43, .39],
    [.28, 1.46, .39, .44, .44, .38],
    [.43, 1.83, -.10, .31, .29, .29],
  ];
  clumps.forEach((shape, i) => {
    const part = foliage(tree, colors[i % colors.length], ...shape);
    part.rotation.set(.4 * i, .7 * i, .2 * i);
  });
  if (fruit) {
    for (const [x, y, z] of [[-.55, 1.24, .48], [-.39, 1.58, .68], [.22, 1.29, .72],
      [.50, 1.43, .60], [.65, 1.18, .37], [.13, 1.67, .73], [-.74, 1.47, .18]]) {
      oval(tree, fruit, x, y, z, .075, .069, .071);
      const leaf = oval(tree, '#7a9b4c', x + .032, y + .068, z, .042, .021, .02);
      leaf.rotation.z = .55;
    }
  }
  return bake(tree);
}

function pine() {
  const tree = new T.Group();
  branch(tree, '#87583e', [0, -.05, 0], [.03, 1.65, 0], .09);
  const rng = random(29);
  for (const [i, [y, width]] of [[.64, .56], [1.03, .49], [1.40, .37], [1.72, .27]].entries()) {
    const profile = [[0, -.25], [.57, -.28], [.91, -.21], [1, -.10], [.81, .03],
      [.56, .22], [.33, .45], [.14, .68], [0, .76]].map(([x, h]) => new T.Vector2(x * width, h * width));
    const tier = new T.LatheGeometry(profile, 24);
    const verts = tier.attributes.position;
    for (let k = 0; k < verts.count; k++) {
      const x = verts.getX(k), z = verts.getZ(k), a = Math.atan2(z, x);
      const wave = .92 + .08 * Math.cos(5 * a + i * .8);
      verts.setXYZ(k, x * wave, verts.getY(k) + .04 * Math.cos(a * 5 + i * .8) * Math.hypot(x, z) / width, z * wave);
    }
    tier.computeVertexNormals();
    mesh(tree, tier, ['#397c64', '#448d6c', '#579b71', '#6aaa78'][i], rng() * .075, y, 0, 1, 1, 1);
  }
  return bake(tree);
}

function arch(width, height, depth, bevel = .023) {
  const w = width / 2;
  const shape = new T.Shape();
  shape.moveTo(-w, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, height - w);
  shape.absarc(0, height - w, w, 0, Math.PI, false);
  shape.lineTo(-w, 0);
  return new T.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 12,
  });
}

function cottage() {
  const h = new T.Group();
  const cream = '#ffe8af', trim = '#fff4d3', dark = '#875c49', teal = '#568e82';
  block(h, '#ac947b', 0, .105, 0, 1.95, .23, 1.65);
  block(h, cream, 0, .75, 0, 1.69, 1.32, 1.48);
  const gable = new T.Shape();
  gable.moveTo(-.93, 1.22);
  gable.quadraticCurveTo(-.55, 1.63, -.04, 2.22);
  gable.quadraticCurveTo(.18, 2.05, .92, 1.22);
  gable.closePath();
  mesh(h, new T.ExtrudeGeometry(gable, { depth: 1.48, bevelEnabled: false, curveSegments: 10 }),
    cream, 0, 0, -.74, 1, 1, 1);
  const roofLength = 1.31;
  const roofColors = ['#b95e50', '#c76e5c', '#d48169', '#d99374', '#ce785e'];
  const rand = random(71);
  for (const side of [-1, 1]) {
    const roof = new T.Group();
    roof.position.set(side * .526, 1.716, 0);
    roof.rotation.z = -side * .81;
    block(roof, '#a45447', 0, 0, 0, 1.48, .118, 1.96);
    for (let row = 0; row < 6; row++) {
      for (let tile = 0; tile < 8; tile++) {
        const z = -.83 + tile * .23 + (row % 2) * .085;
        const x = side * (.60 - row * roofLength / 6);
        const hi = Math.floor(rand() * roofColors.length);
        block(roof, roofColors[hi], x, .071 + row * .005, z, .275, .067, .24);
      }
    }
    for (const z of [-1.015, 1.015]) block(roof, '#a75448', 0, .012, z, 1.54, .16, .105);
    h.add(roof);
  }
  for (let i = 0; i < 9; i++) {
    block(h, '#bc6c54', -.035, 2.27, -.89 + i * .22, .20, .12, .235);
  }
  block(h, '#aa7968', .47, 2.10, -.43, .33, .73, .31);
  block(h, '#936653', .47, 2.46, -.43, .40, .10, .38);
  block(h, '#be8872', .46, 2.53, -.43, .37, .08, .35);
  for (const [x, y] of [[.39, 2.30], [.54, 2.19], [.42, 2.09]]) {
    block(h, '#d1a08a', x, y, -.26, .131, .065, .035);
  }
  for (const x of [-.83, .83]) {
    for (const z of [-.725, .725]) block(h, trim, x, .735, z, .085, 1.29, .087);
  }
  mesh(h, arch(.63, .91, .07), trim, -.04, .20, .751, 1, 1, 1);
  mesh(h, arch(.50, .81, .085), teal, -.04, .23, .782, 1, 1, 1);
  for (const x of [-.168, -.045, .078]) block(h, '#508579', x, .57, .891, .018, .56, .014);
  oval(h, '#edbf68', .108, .61, .91, .045, .045, .044);
  block(h, '#d1ae85', -.045, .165, 1.02, .65, .13, .27);
  block(h, '#d9c4a3', -.045, .075, 1.17, .75, .12, .26);

  const glass = new T.MeshStandardMaterial({ color: '#79a79e', roughness: .4, emissive: '#ffb858', emissiveIntensity: 0 });
  function windowAt(x, y, z, side = false) {
    const frame = new T.Group();
    frame.position.set(x, y, z);
    frame.rotation.y = side ? Math.PI / 2 : 0;
    mesh(frame, arch(.43, .49, .065), dark, 0, 0, 0, 1, 1, 1);
    mesh(frame, arch(.33, .40, .075, .015), glass, 0, .044, .01, 1, 1, 1);
    block(frame, trim, 0, .24, .104, .36, .039, .028);
    block(frame, trim, 0, .24, .104, .036, .40, .03);
    block(frame, '#b97962', 0, .018, .089, .52, .105, .18);
    for (const [i, dx] of [-.17, -.06, .075, .17].entries()) {
      oval(frame, '#669757', dx, .083, .16, .074, .06, .058);
      oval(frame, ['#e99583', '#e2af52', '#f6d485', '#e89083'][i], dx, .127, .169, .039, .037, .034);
    }
    h.add(frame);
  }
  windowAt(.53, .57, .782);
  windowAt(.88, .63, -.19, true);
  oval(h, dark, -.054, 1.60, .763, .153, .163, .06);
  oval(h, glass, -.054, 1.60, .803, .117, .127, .042);
  block(h, trim, -.054, 1.60, .846, .023, .23, .025);
  block(h, trim, -.054, 1.60, .846, .22, .025, .025);
  for (const [x, z, yaw] of [[-.91, -.50, -Math.PI / 2], [.40, .765, 0], [.88, .37, Math.PI / 2]]) {
    block(h, '#e4bf87', x, .41, z, .23, .10, .038).rotation.y = yaw;
  }
  const model = bake(h);
  model.userData.glass = glass.uuid;
  return model;
}

function rabbit() {
  const pet = new T.Group();
  const fur = '#fff0df', pink = '#e8a29e', cocoa = '#58403e';
  oval(pet, fur, 0, .36, -.06, .29, .36, .27);
  oval(pet, '#f5d9c5', 0, .31, .112, .20, .195, .135);
  oval(pet, fur, 0, .64, .101, .308, .268, .259);
  oval(pet, '#fff5df', 0, .20, -.29, .133, .128, .135);
  for (const side of [-1, 1]) {
    const ear = new T.Group();
    ear.position.set(side * .134, .87, .067);
    ear.rotation.z = side * -.23;
    ear.rotation.x = side * .10;
    oval(ear, fur, 0, .145, 0, .102, .244, .078);
    oval(ear, pink, 0, .158, .054, .056, .178, .025);
    pet.add(ear);
    oval(pet, '#f6e1cb', side * .163, .12, .13, .122, .099, .181);
    oval(pet, fur, side * .163, .34, .177, .083, .133, .085).rotation.z = side * -.24;
    oval(pet, cocoa, side * .125, .683, .327, .037, .044, .027);
    oval(pet, '#fff8ed', side * .125 - .009, .695, .349, .010, .010, .008);
    oval(pet, pink, side * .176, .590, .308, .049, .026, .014);
    oval(pet, '#fff5e8', side * .040, .575, .337, .085, .052, .036);
  }
  oval(pet, '#b77c78', 0, .609, .369, .044, .028, .025);
  return bake(pet);
}

export function makeModels() {
  return {
    tree: orchard(['#79a958', '#71a45c', '#5c9557', '#89b963', '#a7c975'], '#efaf64'),
    blossom: orchard(['#db9a91', '#e7aaa1', '#cf918b', '#f2b8aa', '#f6cbbd']),
    lime: orchard(['#94a957', '#a9bb66', '#83a25c', '#adc36e'], '#f1cb69'),
    pine: pine(),
    house: cottage(),
    bunny: rabbit(),
  };
}

export function placeModel(template, x, y, z, size, yaw) {
  const object = template.clone();
  object.position.set(x, y, z);
  object.rotation.y = yaw;
  object.scale.setScalar(size);
  if (template.userData.glass) {
    object.traverse(item => {
      if (item.material?.uuid === template.userData.glass) {
        item.material = item.material.clone();
        object.userData.windows = item.material;
      }
    });
  }
  return object;
}
