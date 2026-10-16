import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Walkthrough } from './walkthrough.js';
import { disposeModel, ModelGroups } from './model.js';

export class HouseScene extends EventTarget {
  constructor(element, config, onLockChange, onError) {
    super(); this.config = config;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x101e30);
    this.camera = new THREE.PerspectiveCamera(55, 1, .05, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    element.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xddeeff, 0x706052, 2.3));
    const sun = new THREE.DirectionalLight(0xfff0de, 2.5); sun.position.set(-10, 15, 8); this.scene.add(sun);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement); this.orbit.enableDamping = true;
    this.walk = new Walkthrough(this.camera, this.renderer.domElement, onLockChange, onError);
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      this.renderer.setSize(width, height); this.camera.aspect = width / Math.max(height, 1); this.camera.updateProjectionMatrix();
      if (this.model && this.orbit.enabled) this.frame();
    };
    this.observer = new ResizeObserver(resize); this.observer.observe(element); resize();
    let last = performance.now(); this.renderer.setAnimationLoop(time => {
      const dt = (time - last) / 1000; last = time;
      if (!this.model) return;
      this.walk.update(dt); if (this.orbit.enabled) this.orbit.update(); this.renderer.render(this.scene, this.camera);
    });
  }
  setModel(model) {
    this.clear(); this.model = model; this.scene.add(model.root);
    this.groups = new ModelGroups(model.root, this.config.groups);
    // Rendering remains usable if an imported GLB needs explicit collision settings.
    let walkthroughError = null;
    try { this.walk.setModel(model); } catch (error) { walkthroughError = error.message; }
    this.frame(); this.dispatchEvent(new CustomEvent('modelchange', { detail: { bounds: model.bounds.clone() } }));
    return walkthroughError;
  }
  frame() {
    if (!this.model) return;
    const center = this.model.bounds.getCenter(new THREE.Vector3());
    const radius = this.model.bounds.getBoundingSphere(new THREE.Sphere()).radius;
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const fov = Math.min(verticalFov, 2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect));
    const distance = radius / Math.sin(fov / 2) * 1.15;
    this.camera.position.copy(center).add(new THREE.Vector3(1, .65, 1).normalize().multiplyScalar(distance));
    this.camera.near = .05; this.camera.far = Math.max(1000, distance * 10); this.camera.updateProjectionMatrix();
    this.orbit.target.copy(center); this.orbit.minDistance = .3; this.orbit.maxDistance = Math.max(30, distance * 5); this.orbit.update();
  }
  setMode(mode) {
    this.walk.leave(); this.orbit.enabled = true;
    if (mode === 'walk') { this.walk.enter(); this.orbit.enabled = false; }
    else this.frame();
  }
  reset() { if (this.walk.active) this.walk.reset(); else this.frame(); }
  clear() {
    this.walk.clear(); this.orbit.enabled = true;
    if (this.model) disposeModel(this.model.root);
    this.model = null; this.groups = null;
    this.renderer.renderLists.dispose(); this.renderer.clear();
  }
  dispose() { this.clear(); this.renderer.setAnimationLoop(null); this.observer.disconnect(); this.walk.dispose(); this.orbit.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
