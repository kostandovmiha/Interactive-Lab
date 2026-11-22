import * as T from './vendor/three.module.min.js';
import { makeCamera } from './camera.js';
import { makeModels, placeModel } from './models.js';
import { acceptsGround, buildWorld, height } from './world.js';

const canvas = document.querySelector('#island');
const loading = document.querySelector('#loading');
const hint = document.querySelector('#hint');
const reset = document.querySelector('#reset');
const confirm = document.querySelector('#confirm');
const view = document.querySelector('.view');
const buttons = [...document.querySelectorAll('[data-piece]')];
const storageKey = 'magic-island-layout-v1';
const defaultHint = 'Обери, кого чи що додати';
const limit = 18;
const pieces = {
  tree: { radius: .78, scale: .80, prompt: 'Обери місце для дерева', added: 'На острові виросло дерево' },
  house: { radius: .99, scale: .72, prompt: 'Обери місце для будиночка', added: 'На острові з’явився будиночок' },
  bunny: { radius: .48, scale: .91, prompt: 'Обери місце для зайчика', added: 'На острів завітав зайчик' },
};
const originals = [
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
const decor = [
  [-3.54, -.49, .48], [-.40, -.76, .57], [3.77, -1.89, .53],
  [-4.96, -.61, .57], [-5.02, 1.19, .45], [-3.93, 2.87, .42],
  [4.50, 1.82, .60], [4.43, -2.20, .58], [-.30, 3.40, .28],
];
let renderer;
try {
  renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power', alpha: false });
} catch {
  loading.textContent = 'На цьому пристрої острів не зміг відкритися. Спробуй оновити браузер.';
}
if (renderer) start();

function start() {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const scene = new T.Scene();
  scene.background = new T.Color('#8ad2c8');
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor('#8ad2c8');
  renderer.toneMapping = T.NoToneMapping;
  scene.add(new T.HemisphereLight('#fff8e8', '#a4b49b', 1.42));
  const sun = new T.DirectionalLight('#fff0d3', 2.15);
  sun.position.set(-5.8, 9.5, 4.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7.8, right: 7.8, top: 6.3, bottom: -6.3, near: .8, far: 25 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = .031;
  sun.shadow.bias = -.00015;
  sun.shadow.radius = 3;
  scene.add(sun);
  const fill = new T.DirectionalLight('#d4edf1', .54);
  fill.position.set(6, 4.5, -4);
  scene.add(fill);

  const world = buildWorld(scene);
  const models = makeModels();
  const controls = makeCamera(canvas, view, tap, requestDraw);
  const { camera } = controls;
  const coarsePointer = matchMedia('(pointer: coarse)');
  const objects = new T.Group();
  const markers = new T.Group();
  const markerGeo = new T.RingGeometry(.143, .195, 24);
  const markerMaterial = new T.MeshBasicMaterial({
    color: '#fff4d4', transparent: true, opacity: .85, depthWrite: false, side: T.DoubleSide,
  });
  const contacts = new T.Group();
  scene.add(objects, contacts, markers);
  const entries = [];
  const saved = [];
  const ray = new T.Raycaster();
  const screenPoint = new T.Vector2();
  const cursor = new T.Mesh(new T.RingGeometry(.17, .23, 30),
    new T.MeshBasicMaterial({ color: '#fff5c8', side: T.DoubleSide, depthTest: false }));
  cursor.rotation.x = -Math.PI / 2;
  cursor.renderOrder = 4;
  cursor.visible = false;
  scene.add(cursor);

  let selected = null;
  let raf = 0;
  let last = 0;
  let time = 0;
  let dirty = true;
  let lost = false;
  let keyX = .48, keyZ = 2.7;
  let slowFrames = 0;
  let resolutionScale = 1;

  function add(type, x, z, size, yaw, radius, custom, appear = false) {
    const y = height(x, z);
    const model = placeModel(models[type], x, y, z, size, yaw);
    const shadow = world.makeContact(x, z, radius * (type === 'house' ? 1.30 : 1.11));
    contacts.add(shadow);
    objects.add(model);
    const entry = { model, shadow, type, x, y, z, size, radius, custom, appear: appear && !reducedMotion.matches ? time : null, react: null, lit: false };
    entries.push(entry);
    if (entry.appear !== null) model.scale.setScalar(size * .01);
    else renderer.shadowMap.needsUpdate = true;
    if (custom) saved.push({ type, x, z });
    return entry;
  }

  function canPlace(type, x, z) {
    const { radius } = pieces[type];
    if (!acceptsGround(x, z, radius)) return false;
    const clear = (px, pz, otherRadius) => Math.hypot(px - x, pz - z) > radius + otherRadius + .045;
    return entries.every(item => clear(item.x, item.z, item.radius)) && decor.every(obstacle => clear(...obstacle));
  }

  function addSaved(type, x, z, appear = false) {
    const piece = pieces[type];
    add(type, x, z, piece.scale, .39 + .19 * Math.sin(x * 3 + z), piece.radius, true, appear);
  }

  function restore() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      if (!Array.isArray(data)) return;
      for (const item of data.slice(0, limit)) {
        if (item && Object.hasOwn(pieces, item.type) && Number.isFinite(item.x) &&
            Number.isFinite(item.z) && canPlace(item.type, item.x, item.z)) addSaved(item.type, item.x, item.z);
      }
    } catch {
      // Unavailable storage or invalid data still permits the current session.
    }
  }

  function persist() {
    try {
      if (saved.length) localStorage.setItem(storageKey, JSON.stringify(saved));
      else localStorage.removeItem(storageKey);
    } catch {
      hint.textContent = 'Зберегти зміни в цьому браузері не вдалося';
    }
  }

  function showAvailableSpots() {
    markers.clear();
    if (!selected || saved.length >= limit) return;
    for (let row = 0; row < 9 && markers.children.length < 8; row++) {
      const z = 2.55 - row * .64;
      for (let col = 0; col < 13 && markers.children.length < 8; col++) {
        const x = -4.62 + (col + (row % 2) * .5) * .74;
        if (markers.children.some(mark => Math.hypot(x - mark.position.x, z - mark.position.z) < 1.18)) continue;
        if (!canPlace(selected, x, z)) continue;
        const marker = new T.Mesh(markerGeo, markerMaterial);
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(x, height(x, z) + .073, z);
        markers.add(marker);
      }
    }
  }

  function setSelected(type, message = type ? pieces[type].prompt : defaultHint) {
    selected = type;
    hint.textContent = message;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.piece === selected));
    showAvailableSpots();
    requestDraw();
  }

  function react(entry) {
    entry.react = time;
    if (entry.model.userData.windows) {
      entry.lit = !entry.lit;
      entry.model.userData.windows.emissiveIntensity = entry.lit ? .77 : 0;
    }
    requestDraw();
  }

  function touchGround(x, z) {
    if (!selected) {
      const entry = entries.find(item => Math.hypot(item.x - x, item.z - z) < item.radius);
      if (entry) react(entry);
      return;
    }
    if (saved.length >= limit) {
      setSelected(null, 'На острові вже багато друзів і будиночків');
      return;
    }
    if (!canPlace(selected, x, z)) {
      hint.textContent = 'Знайди вільне місце на галявині';
      return;
    }
    addSaved(selected, x, z, true);
    setSelected(null, pieces[selected].added);
    reset.disabled = false;
    persist();
    requestDraw();
  }

  function tap(clientX, clientY) {
    if (lost) return;
    const rect = canvas.getBoundingClientRect();
    screenPoint.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2);
    ray.setFromCamera(screenPoint, camera);
    const ground = ray.intersectObject(world.terrain)[0];
    const hit = ray.intersectObject(objects, true)[0];
    if (hit && (!ground || hit.distance < ground.distance)) {
      if (selected) hint.textContent = 'Знайди вільне місце на галявині';
      else {
        const entry = entries.find(item => item.model === hit.object.parent);
        if (entry) react(entry);
      }
      return;
    }
    if (ground) touchGround(ground.point.x, ground.point.z);
    else if (selected) hint.textContent = 'Знайди вільне місце на галявині';
  }

  function resize() {
    const { width, height: boxHeight } = canvas.getBoundingClientRect();
    if (!width || !boxHeight) return;
    world.setPortrait(controls.resize(width, boxHeight));
    const coarse = coarsePointer.matches;
    const pixelBudget = coarse ? 550000 : 1700000;
    const ratio = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(pixelBudget / (width * boxHeight)));
    renderer.setPixelRatio(ratio * resolutionScale);
    renderer.setSize(width, boxHeight, false);
    requestDraw();
  }

  function requestDraw() {
    dirty = true;
    if (!raf && !document.hidden && !lost) raf = requestAnimationFrame(draw);
  }

  function draw(now) {
    raf = 0;
    const isStill = reducedMotion.matches;
    if (!isStill && last && now - last < 30) {
      raf = requestAnimationFrame(draw);
      return;
    }
    const elapsed = last ? (now - last) / 1000 : 0;
    const dt = Math.min(.075, elapsed);
    if (!isStill && coarsePointer.matches && resolutionScale > .69) {
      slowFrames = elapsed > .054 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
      if (slowFrames >= 12) {
        resolutionScale = Math.max(.69, resolutionScale * .83);
        slowFrames = 0;
        resize();
      }
    }
    last = now;
    if (!isStill) time += dt;
    if (dirty || !isStill) {
      controls.update(dt, isStill);
      world.animate(isStill ? 0 : time);
      for (const entry of entries) {
        const { model, type, size, y, x, z, appear } = entry;
        if (appear !== null) {
          const p = isStill ? 1 : Math.min(1, (time - appear) / .52);
          const spring = 1 + 2.16 * (p - 1) ** 3 + 1.16 * (p - 1) ** 2;
          model.scale.setScalar(size * Math.max(.012, spring));
          if (p === 1) {
            entry.appear = null;
            renderer.shadowMap.needsUpdate = true;
          }
        }
        const p = entry.react === null || isStill ? 1 : Math.min(1, (time - entry.react) / .69);
        if (p === 1) entry.react = null;
        const bounce = Math.sin(p * Math.PI);
        if (type === 'bunny') {
          const phase = time * 1.65 + x * 1.4 + z;
          const idleCycle = (time + (x + 6) * .88) % 10.8;
          const littleHop = isStill || p < 1 || appear !== null || idleCycle > .62
            ? 0 : Math.sin(Math.PI * idleCycle / .62);
          const lift = bounce * .49 + littleHop * .22;
          const breath = isStill ? 0 : .018 * Math.sin(phase);
          model.position.y = y + lift;
          model.rotation.x = -lift * .17 + breath;
          model.scale.y = model.scale.x * (1 + breath + lift * .12);
        } else if (type !== 'house') {
          const breeze = isStill ? 0 : .018 * Math.sin(time * .84 + x + z);
          model.rotation.x = isStill ? 0 : .012 * Math.sin(time * .66 - z);
          model.rotation.z = breeze + Math.sin(p * Math.PI * 3) * bounce * .14;
        }
      }
      renderer.render(scene, camera);
      dirty = false;
    }
    if (!isStill && !raf) raf = requestAnimationFrame(draw);
  }

  function stopFrames() {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  }

  for (const original of originals) add(...original, false);
  restore();
  reset.disabled = !saved.length;
  view.hidden = false;
  for (const button of buttons) {
    button.disabled = false;
    button.addEventListener('click', () => setSelected(selected === button.dataset.piece ? null : button.dataset.piece));
  }
  canvas.addEventListener('keydown', event => {
    const directions = { ArrowLeft: [-.27, 0], ArrowRight: [.27, 0], ArrowUp: [0, -.27], ArrowDown: [0, .27] };
    if (Object.hasOwn(directions, event.key)) {
      event.preventDefault();
      const [dx, dz] = directions[event.key];
      keyX = T.MathUtils.clamp(keyX + dx, -5.5, 5.5);
      keyZ = T.MathUtils.clamp(keyZ + dz, -3.6, 3.8);
      cursor.position.set(keyX, height(keyX, keyZ) + .08, keyZ);
      cursor.visible = true;
      requestDraw();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      touchGround(keyX, keyZ);
    } else if (event.key === 'Escape') setSelected(null);
  });
  canvas.addEventListener('blur', () => { cursor.visible = false; requestDraw(); });

  reset.addEventListener('click', () => {
    confirm.returnValue = '';
    confirm.showModal();
  });
  confirm.addEventListener('close', () => {
    if (confirm.returnValue !== 'clear') return;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (!entry.custom) continue;
      objects.remove(entry.model);
      contacts.remove(entry.shadow);
      entry.shadow.geometry.dispose();
      entry.model.userData.windows?.dispose();
      entries.splice(i, 1);
    }
    saved.length = 0;
    setSelected(null);
    buttons[0].focus();
    reset.disabled = true;
    renderer.shadowMap.needsUpdate = true;
    persist();
    requestDraw();
  });

  new ResizeObserver(resize).observe(canvas);
  reducedMotion.addEventListener('change', requestDraw);
  coarsePointer.addEventListener('change', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopFrames();
    else requestDraw();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    lost = true;
    stopFrames();
    loading.textContent = 'Відновлюємо острів…';
    loading.hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    renderer.shadowMap.needsUpdate = true;
    loading.hidden = true;
    requestDraw();
  });
  resize();
  loading.hidden = true;
  requestDraw();
}
