import * as T from './vendor/three.module.min.js';

const { clamp, damp, lerp } = T.MathUtils;
const orbitLimit = .31;
const maxZoom = 1.5;
const tapSlop = 9;

export function makeCamera(canvas, view, onTap, requestDraw) {
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, .1, 80);
  const left = view.querySelector('#left');
  const right = view.querySelector('#right');
  const zoomOut = view.querySelector('#zoom-out');
  const zoomIn = view.querySelector('#zoom-in');
  const fit = view.querySelector('#fit');
  const pointers = new Map();
  let portrait = false;
  let aspect = 1;
  let turn = 0, targetTurn = 0;
  let zoom = 1, targetZoom = 1;
  let gesture = null;
  let changed = true;
  let coast = [];
  let worldScale = 1;

  function setView(nextTurn, nextZoom) {
    targetTurn = clamp(nextTurn, -orbitLimit, orbitLimit);
    targetZoom = clamp(nextZoom, 1, maxZoom);
    left.disabled = targetTurn <= -orbitLimit;
    right.disabled = targetTurn >= orbitLimit;
    zoomOut.disabled = targetZoom <= 1;
    zoomIn.disabled = targetZoom >= maxZoom;
    changed = true;
    requestDraw();
  }

  left.addEventListener('click', () => setView(targetTurn - .20, targetZoom));
  right.addEventListener('click', () => setView(targetTurn + .20, targetZoom));
  zoomOut.addEventListener('click', () => setView(targetTurn, targetZoom - .25));
  zoomIn.addEventListener('click', () => setView(targetTurn, targetZoom + .25));
  const reset = () => setView(0, 1);
  fit.addEventListener('click', reset);
  // Some touch browsers suppress the next synthesized click just after a swipe.
  let fitTouch = null;
  fit.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && event.isPrimary) {
      fitTouch = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
  });
  fit.addEventListener('pointermove', event => {
    if (fitTouch?.id === event.pointerId &&
        Math.hypot(event.clientX - fitTouch.x, event.clientY - fitTouch.y) > tapSlop) fitTouch = null;
  });
  fit.addEventListener('pointerup', event => {
    if (fitTouch?.id !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - fitTouch.x, event.clientY - fitTouch.y);
    fitTouch = null;
    if (distance <= tapSlop) reset();
  });
  fit.addEventListener('lostpointercapture', () => { fitTouch = null; });
  zoomOut.disabled = true;

  function resize(width, height) {
    aspect = width / height;
    portrait = aspect < 1;
    changed = true;
    return portrait;
  }

  function frame(layout) {
    const { rotation, rx, rz } = layout;
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    worldScale = Math.max(rx / 6.25, rz / 4.48);
    coast = Array.from({ length: 64 }, (_, i) => {
      const [x, z] = layout.coast(i * Math.PI / 32, 1.055);
      return [x * cos + z * sin, z * cos - x * sin];
    });
    changed = true;
  }

  function update(dt, instant) {
    if (!changed) return;
    turn = instant ? targetTurn : damp(turn, targetTurn, 12, dt);
    zoom = instant ? targetZoom : damp(zoom, targetZoom, 12, dt);
    if (Math.abs(turn - targetTurn) < .001 && Math.abs(zoom - targetZoom) < .001) {
      turn = targetTurn;
      zoom = targetZoom;
      changed = false;
    }
    const angle = (portrait ? .89 : .43) + turn;
    // A modest pull back at the ends of the orbit keeps the full coast in frame.
    const sin = Math.sin(angle), cos = Math.cos(angle);
    const shoreWidth = 2 * coast.reduce((max, [x, z]) => Math.max(max, Math.abs(x * cos - z * sin)), 0);
    const fitWidth = Math.max((portrait ? 12.05 : 13.4) * worldScale, shoreWidth + .4);
    const halfHeight = Math.max((portrait ? 11 : 9.52) * worldScale, fitWidth / aspect) / 2;
    camera.left = -halfHeight * aspect;
    camera.right = -camera.left;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    const y = portrait ? .98 : .86;
    camera.position.set(Math.sin(angle) * 17, y + (portrait ? 17.1 : 12.4), Math.cos(angle) * 17);
    camera.lookAt(0, y, 0);
    camera.updateMatrixWorld();
  }

  function pinchDistance() {
    const [a, b] = pointers.values();
    return Math.max(16, Math.hypot(a.x - b.x, a.y - b.y));
  }

  function down(event) {
    if (event.button !== 0 || pointers.size === 2) return;
    const { clientX: x, clientY: y, pointerId: id } = event;
    pointers.set(id, { x, y });
    canvas.setPointerCapture(id);
    gesture = pointers.size === 1
      ? { x, y, turn: targetTurn, moved: false }
      : { distance: pinchDistance(), zoom: targetZoom };
  }

  function move(event) {
    if (!pointers.has(event.pointerId)) return;
    const { clientX: x, clientY: y } = event;
    pointers.set(event.pointerId, { x, y });
    if (!gesture) return;
    if (pointers.size === 2) {
      setView(targetTurn, gesture.zoom * pinchDistance() / gesture.distance);
      return;
    }
    if (Math.hypot(x - gesture.x, y - gesture.y) > tapSlop) gesture.moved = true;
    if (gesture.moved) {
      const width = canvas.clientWidth;
      const sensitivity = lerp(2.25, 1.65, clamp((width - 360) / 700, 0, 1));
      setView(gesture.turn - (x - gesture.x) / width * sensitivity, targetZoom);
    }
  }

  function release(event) {
    if (!pointers.has(event.pointerId)) return;
    const tap = event.type === 'pointerup' && pointers.size === 1 && gesture && !gesture.moved &&
      Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= tapSlop;
    pointers.delete(event.pointerId);
    gesture = null;
    if (tap) onTap(event.clientX, event.clientY);
  }

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    setView(targetTurn, targetZoom * Math.exp(-.0018 * event.deltaY * unit));
  }, { passive: false });

  return { camera, resize, update, frame, reset };
}
