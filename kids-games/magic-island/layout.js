import { random } from './models.js';

const tau = Math.PI * 2;
const clamp = (t, min, max) => Math.min(max, Math.max(min, t));
function smooth(t, start, end) {
  const p = clamp((t - start) / (end - start), 0, 1);
  return p * p * (3 - 2 * p);
}
const mix = (a, b, t) => a + (b - a) * t;

export const legacySeed = 0;
export const worldModes = ['ready', 'empty'];
export const seaLevel = -.115;
export const limit = 36;
export const pieces = {
  tree: { radius: .78, scale: .80, max: 16, prompt: 'Обери місце для дерева', added: 'На острові виросло дерево' },
  house: { radius: .99, scale: .72, max: 7, prompt: 'Обери місце для будиночка', added: 'На острові з’явився будиночок' },
  bunny: { radius: .48, scale: .91, max: 24, prompt: 'Обери місце для зайчика', added: 'На острів завітав зайчик' },
};

const starterMotifs = [
  ['house', -2.18, -1.41, 1.12, .16, 1.52],
  ['blossom', -3.79, 1.06, 1.18, .18, 1.08],
  ['tree', -4.00, -1.95, 1.18, .50, 1.11],
  ['lime', -.13, -2.89, 1.13, .46, 1.05],
  ['tree', 3.83, -1.40, 1.01, .18, .96],
  ['pine', -1.24, -3.40, 1.12, -.10, .59],
  ['pine', -2.93, -3.13, .95, .66, .56],
  ['pine', -.58, -3.65, .80, .52, .45],
  ['pine', 2.87, -2.45, .93, .12, .58],
  ['pine', 3.42, -2.86, .73, .27, .45],
  ['lime', -4.76, -.60, .67, .45, .65],
  ['bunny', -.80, .61, 1.10, .51, .48],
  ['bunny', 3.57, .99, .91, .76, .40],
];

const stoneMotifs = [[-4.96, -.61, .62], [-5.02, 1.19, .45], [-3.93, 2.87, .46], [4.50, 1.82, .55],
  [4.43, -2.20, .58], [2.93, .52, .24], [1.09, .54, .19], [.20, -2.70, .33], [-.30, 3.40, .28]];

export function makeLayout(seed, mode) {
  const rand = random(seed);
  const original = seed === legacySeed;
  const variation = (low, high) => original ? 0 : mix(low, high, rand());
  const rx = 7.90 + variation(-.32, .33), rz = 5.75 + variation(-.23, .31);
  const rotation = variation(-.29, .29);
  const phase = [.38 + variation(-1.2, 1.2), -.51 + variation(-1.5, 1.5), 1.9 + variation(-2, 2)];
  const amplitude = [.07 + variation(-.02, .019), .035 + variation(-.009, .020), .026 + variation(-.012, .008)];
  const hillPhase = variation(-1.3, 1.3);
  const ready = mode === 'ready';
  const pond = ready ? {
    x: 1.95 + variation(-.15, .36), z: -.32 + variation(-.46, .02), y: .785,
    rx: 1.59 + variation(-.18, .13), rz: 1.01 + variation(-.11, .10), phase: 1.14 + variation(-1.1, 1.1),
  } : null;
  const porchShift = variation(-.35, .35);
  const meadowShift = variation(-.34, .34);
  const dockAngle = 1.08 + variation(-.085, .055);

  function shore(a) {
    return 1 + amplitude[0] * Math.sin(3 * a + phase[0]) + amplitude[1] * Math.cos(5 * a + phase[1])
      + amplitude[2] * Math.sin(6 * a + phase[2]);
  }
  function coast(a, r = 1) {
    const rim = r * shore(a);
    return [Math.cos(a) * rx * rim, Math.sin(a) * rz * rim];
  }
  function edge(x, z) {
    return Math.hypot(x / rx, z / rz) / shore(Math.atan2(z / rz, x / rx));
  }
  function pondEdge(x, z) {
    if (!pond) return Infinity;
    const dx = (x - pond.x) / pond.rx, dz = (z - pond.z) / pond.rz;
    const angle = Math.atan2(dz, dx);
    return Math.hypot(dx, dz) / (1 + .108 * Math.sin(angle * 3 + pond.phase) + .045 * Math.cos(angle * 5));
  }

  const dock = coast(dockAngle, .965);
  const trail = ready ? [[-2.22 + porchShift, -.12], [-2.13 + porchShift, .51],
    [-1.72 + porchShift * .8, 1.19], [-1.05 + meadowShift, 1.64], [-.24 + meadowShift, 1.82],
    [.85 + meadowShift, 2.06], [1.68 + meadowShift, 2.59], [2.42, 3.23], [2.76, 3.74]] : [];
  const path = ready ? [...trail, coast(dockAngle, .835), dock] : [];
  function pathDistance(x, z, points = path) {
    let distance = Infinity;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      const dx = bx - ax, dz = bz - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      distance = Math.min(distance, Math.hypot(x - ax - t * dx, z - az - t * dz));
    }
    return distance;
  }
  function height(x, z) {
    const radius = edge(x, z);
    const grassy = 1.11 + .085 * Math.sin(x * .53 - .36 + hillPhase) * Math.cos(z * .54 + .4)
      + .17 * Math.exp(-((x + 2.8) ** 2 + (z + 2.55 + hillPhase) ** 2) / 8);
    const bank = mix(grassy, .105, smooth(radius, .792, .945)) - .36 * smooth(radius, .91, 1.10);
    const basin = pondEdge(x, z);
    return basin >= 1.23 ? bank : mix(.355 + .060 * basin ** 2, bank, smooth(basin, .72, 1.23));
  }
  function acceptsGround(x, z, radius, legacy = false) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || edge(x, z) > .83 || pondEdge(x, z) < 1.16) return false;
    if (pathDistance(x, z, legacy ? trail : path) < .14 + radius * .48) return false;
    for (let i = 0; i < 8; i++) {
      const px = x + radius * Math.cos(tau * i / 8), pz = z + radius * Math.sin(tau * i / 8);
      if (edge(px, pz) > .855 || pondEdge(px, pz) < 1.16) return false;
    }
    return true;
  }

  const starters = ready ? starterMotifs.map(([type, x, z, size, yaw, radius]) => {
    if (type === 'house') x += porchShift;
    else if (!original) {
      x += .5 * meadowShift + (rand() - .5) * .40;
      z += (rand() - .5) * .41;
    }
    return { type, x, z, size, yaw, radius };
  }) : [];
  const stones = ready ? stoneMotifs.map(([x, z, width]) =>
    [x + variation(-.36, .36), z + variation(-.34, .34), width]) :
    [2.35, 3.08, 4.61, 5.78].map(a => [...coast(a + variation(-.25, .25), .76), .19]);
  const obstacles = [];
  const flowers = ready ? [
    [-3.03 + porchShift, .06, 8, '#fff0cb'], [-1.37 + porchShift, .18, 6, '#efaaa7'],
    [-.09 + meadowShift, -.14, 9, '#e8b4c8'], [3.78 + meadowShift, 1.20, 9, '#fff0cb'],
    [pond.x + .29, pond.z + 1.83, 6, '#e8b4c8'], [-3.6, 2.12, 9, '#efaaa7'],
    [-1.68 + meadowShift, 2.76, 7, '#fff0cb'], [.58, 3.18, 7, '#f2cd77'],
    [.75, -2.61, 7, '#fff0cb'], [4.31, -.17, 8, '#f2cd77'], [-1.16, -2.43, 6, '#efaaa7'],
  ] : [];
  const fences = ready ? [
    [[-3.12, -.45], [-3.51, -.43], [-3.89, -.57]],
    [[-.87, -.58], [-.49, -.68], [-.13, -.88], [.18, -1.10]],
  ].map(row => row.map(([x, z]) => [x + porchShift, z])) : [];
  const shrubs = ready ? [[-3.24, -.61], [-3.14, -.53], [-3.37, -.71], [-.70, -.73], [-.35, -.88],
    [3.39, -1.81], [3.71, -1.91], [3.99, -1.69], [-4.15, -1.43], [-4.66, 1.12]]
    .map(([x, z]) => [x + (x < 0 ? porchShift : meadowShift), z])
    .filter(([x, z]) => pondEdge(x, z) >= 1.11) : [];
  fences.flat().forEach(([x,z]) => obstacles.push({ x, z, radius: .13 }));
  shrubs.forEach(([x, z]) => obstacles.push({ x, z, radius: .26 }));
  stones.filter(([, , width]) => width >= .54)
    .forEach(([x, z, width]) => obstacles.push({ x, z, radius: width * .77 }));

  return {
    seed, mode, rx, rz, rotation, pond, dockAngle, dock, phase, amplitude, starters,
    stones, flowers, fences, shrubs, obstacles, path, edge, coast, pondEdge, pathDistance, height, acceptsGround,
  };
}

export function canPlace(layout, entries, type, x, z, legacy = false) {
  const { radius } = pieces[type];
  if (!layout.acceptsGround(x, z, radius, legacy)) return false;
  const clear = other => Math.hypot(other.x - x, other.z - z) > radius + other.radius + .036;
  return entries.every(clear) && (legacy || layout.obstacles.every(clear));
}
