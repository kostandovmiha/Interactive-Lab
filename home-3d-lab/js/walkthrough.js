import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const RADIUS = .22;
export const EYE_HEIGHT = 1.65;
const namesMatch = (mesh, patterns) => {
  for (let object = mesh; object; object = object.parent) if (patterns.some(s => object.name.toLowerCase().includes(s.toLowerCase()))) return true;
  return false;
};

export class WalkPhysics {
  constructor(model) {
    this.octree = new Octree(); this.velocity = new THREE.Vector3(); this.grounded = false;
    const proxy = new THREE.Group(); const collisionNames = model.settings.collisionNames;
    model.root.updateMatrixWorld(true);
    model.root.traverse(mesh => {
      if (!mesh.isMesh || (collisionNames && !namesMatch(mesh, collisionNames))) return;
      if (mesh.isSkinnedMesh || mesh.isInstancedMesh) throw new Error('Для анімованих/інстансованих об’єктів потрібні окремі статичні колізійні меші.');
      const copy = new THREE.Mesh(mesh.geometry); copy.matrixAutoUpdate = false; copy.matrix.copy(mesh.matrixWorld); proxy.add(copy);
    });
    proxy.updateMatrixWorld(true);
    if (!proxy.children.length) throw new Error('Немає колізійної геометрії для прогулянки.');
    this.octree.fromGraphNode(proxy);
    // Proxy shares original geometry; it must not dispose those resources.
    this.raycaster = new THREE.Raycaster(); this.collisionMeshes = proxy.children;
    this.bounds = model.bounds.clone(); this.spawn = this.findSpawn(model.spawn);
    this.reset();
  }
  capsuleAt(feet) { return new Capsule(feet.clone().add(new THREE.Vector3(0, RADIUS, 0)), feet.clone().add(new THREE.Vector3(0, EYE_HEIGHT - RADIUS, 0)), RADIUS); }
  findSpawn(configured) {
    const size = this.bounds.getSize(new THREE.Vector3()); const center = this.bounds.getCenter(new THREE.Vector3());
    const candidates = configured ? [new THREE.Vector3(...configured)] : [0, -.25, .25].flatMap(x => [0, -.25, .25].map(z => new THREE.Vector3(center.x + size.x * x, this.bounds.min.y + .25, center.z + size.z * z)));
    for (const feet of candidates) {
      this.raycaster.set(feet.clone().add(new THREE.Vector3(0, EYE_HEIGHT, 0)), new THREE.Vector3(0, -1, 0));
      const hits = this.raycaster.intersectObjects(this.collisionMeshes, false);
      const floor = hits.find(hit => hit.face && hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y > .6);
      if (!floor || floor.distance > EYE_HEIGHT + .75) continue;
      feet.y = floor.point.y + .015;
      const collision = this.octree.capsuleIntersect(this.capsuleAt(feet));
      if (!collision || collision.depth < .01) return feet;
    }
    throw new Error('Не знайдено безпечну підлогу для старту. Налаштуй walkthroughSpawn і колізійні меші.');
  }
  reset() { this.capsule = this.capsuleAt(this.spawn); this.velocity.set(0, 0, 0); this.grounded = false; }
  eyePosition() { return this.capsule.end.clone().add(new THREE.Vector3(0, RADIUS, 0)); }
  step(dt, direction, speed) {
    dt = Math.min(Math.max(dt, 0), .05);
    // Distance-limited substeps prevent tunnelling through thin walls/floors.
    const steps = Math.max(1, Math.ceil((speed + Math.abs(this.velocity.y) + 2) * dt / .06));
    for (let i = 0; i < steps; i++) {
      const delta = dt / steps;
      this.velocity.x = direction.x * speed; this.velocity.z = direction.z * speed;
      this.velocity.y = Math.max(-20, this.velocity.y - 9.81 * delta);
      this.capsule.translate(this.velocity.clone().multiplyScalar(delta)); this.grounded = false;
      for (let j = 0; j < 5; j++) {
        const hit = this.octree.capsuleIntersect(this.capsule); if (!hit) break;
        this.capsule.translate(hit.normal.clone().multiplyScalar(hit.depth + 1e-5));
        if (hit.normal.y > .5) this.grounded = true;
        const normalVelocity = hit.normal.dot(this.velocity);
        if (normalVelocity < 0) this.velocity.addScaledVector(hit.normal, -normalVelocity);
      }
      if (this.eyePosition().y < this.bounds.min.y - 3) { this.reset(); break; }
    }
  }
}

export class Walkthrough {
  constructor(camera, element, onLockChange, onError) {
    this.camera = camera; this.element = element; this.keys = new Set(); this.speed = 2; this.active = false;
    this.controls = new PointerLockControls(camera, element);
    this.controls.addEventListener('lock', () => onLockChange(true));
    this.controls.addEventListener('unlock', () => { this.keys.clear(); onLockChange(false); });
    this.keyDown = e => { if (e.code === 'Escape') { this.keys.clear(); this.controls.unlock(); return; } if (this.active && this.controls.isLocked && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) { e.preventDefault(); this.keys.add(e.code); } };
    this.keyUp = e => this.keys.delete(e.code); this.blur = () => { this.keys.clear(); this.controls.unlock(); };
    this.lockError = () => onError('Браузер не дозволив захопити курсор. Натисни кнопку прогулянки ще раз.');
    document.addEventListener('keydown', this.keyDown); document.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur); document.addEventListener('pointerlockerror', this.lockError);
  }
  setModel(model) { this.physics = new WalkPhysics(model); }
  enter() { if (!this.physics) throw new Error('Прогулянка недоступна для цієї моделі.'); this.active = true; this.camera.rotation.set(0, 0, 0); this.reset(); }
  leave() { this.active = false; this.keys.clear(); this.controls.unlock(); }
  lock() { if (this.active) this.controls.lock(); }
  reset() { this.physics?.reset(); if (this.physics) this.camera.position.copy(this.physics.eyePosition()); }
  update(dt) {
    if (!this.active || !this.controls.isLocked || !this.physics) return;
    const forward = new THREE.Vector3(); this.camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const direction = new THREE.Vector3();
    if (this.keys.has('KeyW')) direction.add(forward); if (this.keys.has('KeyS')) direction.sub(forward);
    if (this.keys.has('KeyD')) direction.add(right); if (this.keys.has('KeyA')) direction.sub(right);
    direction.normalize(); this.physics.step(dt, direction, this.speed); this.camera.position.copy(this.physics.eyePosition());
  }
  clear() { this.leave(); this.physics = null; }
  dispose() {
    this.clear(); this.controls.dispose(); document.removeEventListener('keydown', this.keyDown); document.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur); document.removeEventListener('pointerlockerror', this.lockError);
  }
}
