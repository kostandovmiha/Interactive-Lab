import * as THREE from 'three';

// Entirely invented geometry; no real address, plan, image, or measurements.
export function createDemo() {
  const root = new THREE.Group(); root.name = 'Fictional_Demo_House';
  const colors = { walls: 0xc5d1dc, floors: 0x997c60, doors: 0x5a7d80, furniture: 0x4e8797, roof: 0x405771, windows: 0x8ac4d2 };
  function box(name, size, position, group, color = colors[group]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: .8 }));
    mesh.name = `${group}_${name}`; mesh.position.set(...position); root.add(mesh); return mesh;
  }
  box('Slab', [8.4, .2, 8.4], [0, -.1, 0], 'floors');
  box('Ceiling', [8.4, .16, 8.4], [0, 3.08, 0], 'roof');
  box('West', [.18, 3, 8], [-4, 1.5, 0], 'walls');
  box('East', [.18, 3, 8], [4, 1.5, 0], 'walls');
  // Front wall with a 1.1 m doorway and 2.2 m opening height.
  box('FrontLeft', [1.45, 3, .18], [-3.275, 1.5, -4], 'walls');
  box('FrontRight', [5.45, 3, .18], [1.275, 1.5, -4], 'walls');
  box('FrontLintel', [1.1, .8, .18], [-2, 2.6, -4], 'walls');
  // Back window: sill, lintel and two side panels.
  box('BackLeft', [3, 3, .18], [-2.5, 1.5, 4], 'walls');
  box('BackRight', [3, 3, .18], [2.5, 1.5, 4], 'walls');
  box('BackSill', [2, 1, .18], [0, .5, 4], 'walls');
  box('BackLintel', [2, .6, .18], [0, 2.7, 4], 'walls');
  box('Glass', [2, 1.4, .06], [0, 1.7, 4], 'windows');
  // Two partitions create three independent rooms, connected through openings.
  box('PartitionNorth', [.16, 3, 1.45], [0, 1.5, -3.275], 'walls');
  box('PartitionSouth', [.16, 3, 5.45], [0, 1.5, 1.275], 'walls');
  box('PartitionLintel', [.16, .8, 1.1], [0, 2.6, -2], 'walls');
  box('BedroomLeft', [1.45, 3, .16], [.725, 1.5, 0], 'walls');
  box('BedroomRight', [1.45, 3, .16], [3.275, 1.5, 0], 'walls');
  box('BedroomLintel', [1.1, .8, .16], [2, 2.6, 0], 'walls');
  box('EntranceOpenLeaf', [.08, 2.15, .9], [-2.55, 1.075, -3.5], 'doors');
  box('BedroomOpenLeaf', [.08, 2.15, .9], [1.45, 1.075, .5], 'doors');
  box('Sofa', [1.9, .8, .9], [-2.3, .4, 2], 'furniture');
  box('Table', [1.2, .7, .8], [-2.3, .35, .3], 'furniture');
  box('Bed', [1.6, .5, 2], [2.4, .25, 2.4], 'furniture');
  root.userData.walkthroughSpawn = [-2, .02, -2];
  return root;
}
