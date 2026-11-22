import * as T from './vendor/three.module.min.js';
import { makeCamera } from './camera.js';
import { makeModels, placeModel } from './models.js';
import { canPlace, legacySeed, limit, makeLayout, pieces, worldModes } from './layout.js';
import { readWorld, saveWorld } from './storage.js';
import { buildWorld } from './world.js';

const canvas = document.querySelector('#island');
const loading = document.querySelector('#loading');
const hint = document.querySelector('#hint');
const reset = document.querySelector('#reset');
const confirm = document.querySelector('#confirm');
const view = document.querySelector('.view');
const buttons = [...document.querySelectorAll('[data-piece]')];
const worldButton = document.querySelector('#world');
const worldLabel = document.querySelector('#world-label');
const worldMenu = document.querySelector('#world-menu');
const worldOptions = [...worldMenu.querySelectorAll('button[value]')];
const confirmTitle = document.querySelector('#confirm-title');
const confirmDetail = document.querySelector('#confirm-detail');
const confirmAction = document.querySelector('#confirm-action');
const defaultHint = 'Обери, кого чи що додати';
let storage;
try { storage = window.localStorage; } catch { /* The island is still playable. */ }
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
  Object.assign(sun.shadow.camera, { left: -9.7, right: 9.7, top: 7.8, bottom: -7.8, near: .8, far: 25 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = .031;
  sun.shadow.bias = -.00015;
  sun.shadow.radius = 3;
  scene.add(sun);
  const fill = new T.DirectionalLight('#d4edf1', .54);
  fill.position.set(6, 4.5, -4);
  scene.add(fill);

  let layout, world;
  const models = makeModels();
  const controls = makeCamera(canvas, view, tap, requestDraw);
  const { camera } = controls;
  const coarsePointer = matchMedia('(pointer: coarse)');
  const objects = new T.Group();
  const markers = new T.Group();
  const markerGeo = new T.RingGeometry(.19, .257, 24);
  const markerMaterial = new T.MeshBasicMaterial({
    color: '#fff4d4', transparent: true, opacity: .85, depthWrite: false, side: T.DoubleSide,
  });
  const contacts = new T.Group();
  const entries = [];
  const saved = [];
  const ray = new T.Raycaster();
  const screenPoint = new T.Vector2();
  const cursor = new T.Mesh(new T.RingGeometry(.17, .23, 30),
    new T.MeshBasicMaterial({ color: '#fff5c8', side: T.DoubleSide, depthTest: false }));
  cursor.rotation.x = -Math.PI / 2;
  cursor.renderOrder = 4;
  cursor.visible = false;

  let selected = null;
  let raf = 0;
  let last = 0;
  let time = 0;
  let dirty = true;
  let lost = false;
  let keyX = .48, keyZ = 2.7;
  let slowFrames = 0;
  let resolutionScale = 1;
  let onConfirm = null;

  function add({ type, x, z, size, yaw, radius }, custom = false, appear = false) {
    const y = layout.height(x, z);
    const model = placeModel(models[type], x, y, z, size, yaw);
    const shadow = world.makeContact(x, z, radius * (type === 'house' ? 1.30 : 1.11));
    contacts.add(shadow);
    objects.add(model);
    const entry = {
      model, shadow, type, x, y, z, size, radius, custom, lit: false,
      canopy: model.getObjectByName('canopy'), door: model.getObjectByName('door'),
      appear: appear && !reducedMotion.matches ? time : null, react: null,
    };
    entries.push(entry);
    if (entry.appear !== null) model.scale.setScalar(size * .06);
    else renderer.shadowMap.needsUpdate = true;
  }

  function addSaved(type, x, z, { appear = false, legacy = false } = {}) {
    const piece = pieces[type];
    add({ type, x, z, size: piece.scale, yaw: .39 + .19 * Math.sin(x * 3 + z), radius: piece.radius }, true, appear);
    saved.push(legacy ? { type, x, z, legacy } : { type, x, z });
  }

  function removeEntries(customOnly) {
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (customOnly && !entry.custom) continue;
      objects.remove(entry.model);
      contacts.remove(entry.shadow);
      entry.shadow.geometry.dispose();
      entry.model.userData.windows?.dispose();
      entries.splice(i, 1);
    }
    saved.length = 0;
    reset.disabled = true;
    renderer.shadowMap.needsUpdate = true;
  }

  function loadIsland({ seed, mode, placements = [] }) {
    if (world) {
      removeEntries(false);
      scene.remove(world.root);
      world.dispose();
    }
    layout = makeLayout(seed, mode);
    world = buildWorld(layout);
    world.root.add(objects, contacts, markers, cursor);
    scene.add(world.root);
    renderer.shadowMap.needsUpdate = true;
    controls.frame(layout);
    controls.reset();
    for (const starter of layout.starters) add(starter);
    for (const item of placements) {
      if (!item || !Object.hasOwn(pieces, item.type)) continue;
      const { type, x, z } = item;
      const legacy = seed === legacySeed && mode === 'ready' && item.legacy === true;
      if (canPlace(layout, entries, type, x, z, legacy)) addSaved(type, x, z, { legacy });
    }
    keyX = .48;
    keyZ = 2.7;
    cursor.visible = false;
    worldLabel.textContent = mode === 'ready' ? 'Готовий' : 'Порожній';
    worldButton.setAttribute('aria-label', 'Обрати острів · ' + worldLabel.textContent);
    for (const button of worldOptions) button.disabled = button.value === mode;
    reset.disabled = !saved.length;
    setSelected(null);
    resize();
  }

  function persist() {
    try {
      saveWorld(storage, layout.seed, layout.mode, saved);
    } catch {
      hint.textContent = 'Зберегти зміни в цьому браузері не вдалося';
    }
  }

  function atLimit(type) {
    return saved.length >= limit || saved.filter(item => item.type === type).length >= pieces[type].max;
  }

  function showAvailableSpots() {
    markers.clear();
    if (!selected || atLimit(selected)) return;
    const candidates = [];
    const step = .55;
    for (let row = 0, z = layout.rz * .86; z >= -layout.rz * .86; z -= step, row++) {
      for (let x = (row % 2) * step / 2 - layout.rx * .86; x <= layout.rx * .86; x += step) {
        if (canPlace(layout, entries, selected, x, z)) {
          candidates.push({ x, z, spread: 2.7 - Math.hypot(x * .83, z - 1.7) * .16 });
        }
      }
    }
    for (let i = 0; i < 10 && candidates.length; i++) {
      candidates.sort((a, b) => b.spread - a.spread);
      const { x, z } = candidates.shift();
      if (markers.children.some(mark => Math.hypot(x - mark.position.x, z - mark.position.z) < .93)) break;
      const marker = new T.Mesh(markerGeo, markerMaterial);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(x, layout.height(x, z) + .073, z);
      markers.add(marker);
      for (const point of candidates) point.spread = Math.min(point.spread, Math.hypot(point.x - x, point.z - z));
    }
  }

  function setSelected(type, message = type ? pieces[type].prompt : defaultHint) {
    selected = type;
    hint.textContent = message;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.piece === selected));
    showAvailableSpots();
    if (type && atLimit(type)) hint.textContent = 'Тут уже багато таких додавань';
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
    if (atLimit(selected)) {
      setSelected(null, 'На острові вже багато друзів і будиночків');
      return;
    }
    if (!canPlace(layout, entries, selected, x, z)) {
      hint.textContent = 'Знайди вільне місце на галявині';
      return;
    }
    addSaved(selected, x, z, { appear: true });
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
        let owner = hit.object;
        while (owner.parent !== objects) owner = owner.parent;
        const entry = entries.find(item => item.model === owner);
        if (entry) react(entry);
      }
      return;
    }
    if (ground) {
      const point = world.root.worldToLocal(ground.point);
      touchGround(point.x, point.z);
    } else if (selected) hint.textContent = 'Знайди вільне місце на галявині';
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
          const p = isStill ? 1 : Math.min(1, (time - appear) / (type === 'house' ? .65 : .52));
          const spring = 1 + 2.16 * (p - 1) ** 3 + 1.16 * (p - 1) ** 2;
          model.scale.setScalar(size * Math.max(.06, spring));
          if (p === 1) {
            entry.appear = null;
            renderer.shadowMap.needsUpdate = true;
          }
        }
        const duration = entry.door ? 1.12 : .74;
        const p = entry.react === null || isStill ? 1 : Math.min(1, (time - entry.react) / duration);
        if (p === 1) entry.react = null;
        const bounce = p === 1 ? 0 : Math.sin(p * Math.PI);
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
        } else if (entry.canopy) {
          const phase = x * .93 - z * .78;
          const wind = isStill ? 0 : .064 * Math.sin(time * 1.45 + phase) + .016 * Math.sin(time * 2.51 - phase);
          entry.canopy.rotation.x = isStill ? 0 : .036 * Math.sin(time * 1.13 + phase);
          entry.canopy.rotation.z = wind + Math.sin(p * Math.PI * 2.5) * bounce * .30;
        } else if (entry.door) {
          const swing = T.MathUtils.smoothstep(p, 0, .26) * (1 - T.MathUtils.smoothstep(p, .46, 1));
          entry.door.rotation.y = -.82 * swing;
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

  view.hidden = false;
  worldButton.disabled = false;
  loadIsland(readWorld(storage));
  if (saved.some(item => item.legacy)) persist();
  for (const button of buttons) {
    button.disabled = false;
    button.addEventListener('click', () => setSelected(selected === button.dataset.piece ? null : button.dataset.piece));
  }
  canvas.addEventListener('keydown', event => {
    const directions = { ArrowLeft: [-.27, 0], ArrowRight: [.27, 0], ArrowUp: [0, -.27], ArrowDown: [0, .27] };
    if (Object.hasOwn(directions, event.key)) {
      event.preventDefault();
      const [dx, dz] = directions[event.key];
      keyX = T.MathUtils.clamp(keyX + dx, -layout.rx, layout.rx);
      keyZ = T.MathUtils.clamp(keyZ + dz, -layout.rz, layout.rz);
      cursor.position.set(keyX, layout.height(keyX, keyZ) + .08, keyZ);
      cursor.visible = true;
      requestDraw();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      touchGround(keyX, keyZ);
    } else if (event.key === 'Escape') setSelected(null);
  });
  canvas.addEventListener('blur', () => { cursor.visible = false; requestDraw(); });

  function ask(title, detail, actionLabel, action, trigger) {
    confirmTitle.textContent = title;
    confirmDetail.textContent = detail;
    confirmAction.textContent = actionLabel;
    confirm.returnValue = '';
    onConfirm = { action, trigger };
    confirm.showModal();
  }

  reset.addEventListener('click', () => {
    ask('Очистити мої додавання?', 'Дерева, будиночки й зайчики, які ти додав, зникнуть.', 'Очистити', () => {
      removeEntries(true);
      setSelected(null);
      persist();
    }, reset);
  });

  worldButton.addEventListener('click', () => {
    worldMenu.returnValue = '';
    worldMenu.showModal();
  });
  worldMenu.addEventListener('close', () => {
    const choice = worldMenu.returnValue;
    const regenerate = choice === 'regenerate';
    if (!regenerate && !worldModes.includes(choice)) return;
    const mode = regenerate ? layout.mode : choice;
    const title = regenerate ? 'Створити інший острів?' : mode === 'empty' ? 'Відкрити порожній острів?' : 'Відкрити готовий світ?';
    const detail = saved.length ? 'Твоя поточна розстановка зникне.' : 'Відкриється новий світ.';
    ask(title, detail, 'Відкрити', () => {
      let seed = layout.seed;
      if (regenerate) {
        const value = crypto.getRandomValues(new Uint32Array(1))[0];
        seed = value === seed || value === legacySeed ? ((seed + 1) >>> 0 || 1) : value;
      }
      loadIsland({ seed, mode });
      persist();
    }, worldButton);
  });
  confirm.addEventListener('close', () => {
    const pending = onConfirm;
    onConfirm = null;
    if (!pending) return;
    if (confirm.returnValue === 'apply') pending.action();
    (pending.trigger.disabled ? buttons[0] : pending.trigger).focus();
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
  loading.hidden = true;
  requestDraw();
}
