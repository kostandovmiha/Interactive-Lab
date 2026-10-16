import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateGLB } from './assets.js';

export function disposeModel(root) {
  if (!root) return;
  const geometries = new Set(), materials = new Set(), textures = new Set(), bitmaps = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
    if (object.skeleton) object.skeleton.dispose();
  });
  for (const texture of textures) {
    if (texture.source?.data?.close) bitmaps.add(texture.source.data);
    texture.dispose();
  }
  for (const bitmap of bitmaps) bitmap.close();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
  root.removeFromParent();
}

export async function parseModel(buffer) {
  validateGLB(buffer);
  const manager = new THREE.LoadingManager();
  // GLB bufferView images use local blob URLs. Remote references are never allowed.
  manager.setURLModifier(url => {
    if (!url.startsWith('blob:')) throw new Error('Зовнішні ресурси моделі заборонені.');
    return url;
  });
  const gltf = await new GLTFLoader(manager).parseAsync(buffer, '');
  return gltf.scene;
}

export function prepareModel(source, settings = {}) {
  const origin = settings.origin ?? [0, 0, 0];
  const rotation = settings.rotationDegrees ?? [0, 0, 0];
  const scale = settings.scale ?? 1;
  if (![origin, rotation].every(a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite)) || !Number.isFinite(scale) || scale <= 0 || scale > 1000) throw new Error('Некоректний масштаб, початок або орієнтація моделі.');
  if (settings.collisionNames !== undefined && (!Array.isArray(settings.collisionNames) || !settings.collisionNames.length || !settings.collisionNames.every(s => typeof s === 'string' && s.length))) throw new Error('Некоректні імена колізійних об’єктів.');
  if (settings.walkthroughSpawn !== undefined && (!Array.isArray(settings.walkthroughSpawn) || settings.walkthroughSpawn.length !== 3 || !settings.walkthroughSpawn.every(Number.isFinite))) throw new Error('Некоректна точка початку прогулянки.');
  const root = new THREE.Group(); root.name = 'Home3D_World'; root.add(source);
  // Offset/orientation wrapper preserves every original node and local transform.
  root.position.set(...origin); root.rotation.set(...rotation.map(THREE.MathUtils.degToRad)); root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite) || bounds.getSize(new THREE.Vector3()).length() > 10000) throw new Error('Модель не має придатної геометрії або масштабу.');
  return { root, bounds, settings, spawn: settings.walkthroughSpawn ?? source.userData.walkthroughSpawn };
}

export class ModelGroups {
  constructor(root, mapping) {
    this.root = root; this.members = new Map(); this.enabled = new Map(); this.meshes = [];
    root.traverse(object => {
      if (!object.isMesh) return;
      const names = []; for (let node = object; node; node = node.parent) names.push(node.name.toLowerCase());
      const groups = Object.entries(mapping).filter(([, aliases]) => aliases.some(alias => names.some(name => name.includes(alias.toLowerCase())))).map(([group]) => group);
      this.meshes.push({ object, groups, initialVisibility: object.visible });
      for (const group of groups) {
        if (!this.members.has(group)) { this.members.set(group, []); this.enabled.set(group, true); }
        this.members.get(group).push(object);
      }
    });
  }
  setVisible(group, visible) {
    this.enabled.set(group, visible);
    for (const { object, groups, initialVisibility } of this.meshes) object.visible = initialVisibility && groups.every(name => this.enabled.get(name));
  }
}
