import * as T from './vendor/three.module.min.js';
import { bake, block, branch, foliage, line, oval, paint, random, rock } from './models.js';
import { seaLevel } from './layout.js';

const tau = Math.PI * 2;
const mix = T.MathUtils.lerp;
const smooth = T.MathUtils.smoothstep;
const farRim = 1.18;

function land(layout) {
  const { height, coast, pondEdge, pathDistance } = layout;
  const positions = [], colors = [], indices = [];
  const grass = new T.Color('#87ad70'), moss = new T.Color('#65975f'), pale = new T.Color('#a5ba78');
  const sand = new T.Color('#f5d79f'), wet = new T.Color('#cfad76'), trail = new T.Color('#d9bc86');
  const seam = new T.Color('#b8b57a'), basin = new T.Color('#a6ae71');
  const color = new T.Color();
  const segments = 144, rings = 64;
  for (let ring = 0; ring <= rings; ring++) {
    const rad = farRim * Math.max(ring / rings, .00001);
    for (let i = 0; i < segments; i++) {
      const a = i / segments * tau;
      const [x, z] = coast(a, rad);
      const tint = .5 + .25 * Math.sin(x * 1.05 + z * .51) + .19 * Math.cos(z * 1.28 - x * .72);
      const grain = Math.sin(x * 4.2 + z * 2.6) * Math.sin(z * 5.4 - x * 2.15);
      color.copy(grass).lerp(tint > .54 ? pale : moss, Math.abs(tint - .54) * 1.43);
      const boundary = rad + .022 * Math.sin(a * 10) + .014 * Math.cos(a * 16 - .7);
      color.lerp(seam, smooth(boundary, .746, .855))
        .lerp(sand, smooth(boundary, .813, .925)).lerp(wet, smooth(rad, .94, 1.06));
      const p = pondEdge(x, z);
      color.lerp(basin, (1 - smooth(p, .98, 1.22)) * .86);
      color.lerp(trail, (1 - smooth(pathDistance(x, z) + .029 * Math.sin(x * 7 + z * 4), .20, .43)) * .86);
      let contact = 0;
      for (const obstacle of layout.obstacles) {
        const { x: sx, z: sz, radius } = obstacle;
        const distance = ((x - sx) ** 2 + (z - sz) ** 2) / ((radius + .22) ** 2);
        contact = Math.max(contact, Math.max(0, 1 - distance) ** 2);
      }
      const pondBank = 1 - smooth(Math.abs(p - 1.02), .015, .18);
      color.multiplyScalar(1 + grain * .018 - contact * .20 - pondBank * .052);
      positions.push(x, height(x, z), z);
      colors.push(color.r, color.g, color.b);
      if (ring < rings) {
        const j = ring * segments + i;
        const next = ring * segments + (i + 1) % segments;
        indices.push(j, next, j + segments, next, next + segments, j + segments);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const land = new T.Mesh(geometry, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  land.receiveShadow = true;
  return land;
}

const waterVertex = `
  uniform vec2 origin;
  varying vec2 vIsland;
  void main() {
    vIsland = origin + vec2(position.x, -position.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`;
const waterFragment = `
  uniform float time;
  uniform bool small;
  uniform vec3 ocean;
  uniform vec3 turquoise;
  uniform vec3 shallow;
  uniform vec3 foam;
  uniform vec2 boatPosition;
  uniform bool hasBoat;
  uniform vec2 origin;
  uniform vec2 radii;
  uniform vec3 amplitude;
  uniform vec3 phases;
  uniform float pondPhase;
  varying vec2 vIsland;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float glints(vec2 p, float speed) {
    vec2 cell = floor(p), uv = fract(p) - .5;
    float h = hash(cell);
    float span = .11 + .17 * h;
    float slant = (h - .5) * .39;
    float y = uv.y + uv.x * slant + sin(uv.x * 5. - h * 6.) * .075
      + .12 * sin(time * speed + h * 6.28);
    float dx = abs(uv.x - (h - .5) * .32);
    float wash = .53 + .47 * sin(time * speed + h * 15.);
    return (1. - smoothstep(.024, .067, abs(y))) * (1. - smoothstep(span * .5, span, dx)) * wash;
  }
  void main() {
    vec2 p = vIsland;
    float wave = sin(p.x*1.25 + p.y*1.42 + time*.32) * cos(p.y*.78 - p.x*.50 - time*.27);
    float glint = glints(vec2(p.x*.88+p.y*.23,p.y*1.55-p.x*.27), .52);
    vec3 col;
    if (small) {
      vec2 pq = (p - origin) / radii;
      float pa = atan(pq.y,pq.x);
      float pr = length(pq) / (1. + .108*sin(3.*pa+pondPhase) + .045*cos(5.*pa));
      if (pr > 1.22) discard;
      col = mix(ocean, turquoise, .49 + wave*.19);
      col = mix(col, shallow, smoothstep(.48,1.15,pr)*.68);
      float highlight = (1. - smoothstep(.006,.035,abs(pr-.975-wave*.021)))*.47;
      col = mix(col, foam, glint*.43+highlight);
    } else {
      vec2 q = p / radii;
      float a = atan(q.y, q.x);
      float shore = 1. + amplitude.x*sin(3.*a+phases.x) + amplitude.y*cos(5.*a+phases.y) + amplitude.z*sin(6.*a+phases.z);
      float r = length(q) / shore;
      float broad = sin(p.y*.30 - p.x*.18 + .36) * .09;
      col = mix(ocean, turquoise, (1. - smoothstep(1., 2.95, r))*.72 + broad + .10);
      col = mix(col, shallow, (1. - smoothstep(1.00, 1.36, r))*.78);
      float underwaterShelf = (1. - smoothstep(1.00,1.18,r)) * (.12 + .10 * cos(a+.38));
      col *= 1. - underwaterShelf;
      float ring = r + .008*sin(13.*a-time*.76) + .006*sin(23.*a+time*.57);
      float streak = .55 + .45*sin(7.*a + sin(7.*a+1.) + time*.54);
      float lip = (1.-smoothstep(.005,.017,abs(ring-1.038))) * (.52 + streak*.44);
      float echo = (1.-smoothstep(.003,.012,abs(ring-1.124-.013*sin(time*.49)))) * streak*.38;
      glint += glints(vec2(p.x*.52-p.y*.29+4.7,p.y*1.26+p.x*.15), .36) * .56;
      col = mix(col, foam, max(lip*.73,echo)*.82 + glint*mix(.25,.14,smoothstep(1.2,3.9,r)));
      col *= 1. + wave*.044;

      if (hasBoat) {
        vec2 b = p - boatPosition;
        float ripple = length(vec2(dot(b,vec2(.90,.44)) * 1.7, dot(b,vec2(-.44,.90))));
        float wake = (1. - smoothstep(.01,.065,abs(ripple-.68-.09*sin(time*1.4))))
          * (.4+.23*sin(b.x*9.)) * .34;
        col = mix(col * (1. - .14 * (1. - smoothstep(.16,.62,ripple))), foam, wake);
      }
    }
    gl_FragColor = vec4(col, 1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function water(layout, small) {
  const pond = small ? layout.pond : null;
  const origin = new T.Vector2(pond?.x ?? 0, pond?.z ?? 0);
  const radii = new T.Vector2(pond?.rx ?? layout.rx, pond?.rz ?? layout.rz);
  const mesh = new T.Mesh(new T.PlaneGeometry(small ? 3 * radii.x : 180, small ? 3 * radii.y : 180), new T.ShaderMaterial({
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    uniforms: {
      time: { value: 0 }, small: { value: small }, boatPosition: { value: new T.Vector2() },
      origin: { value: origin }, radii: { value: radii }, pondPhase: { value: pond?.phase ?? 0 },
      amplitude: { value: new T.Vector3(...layout.amplitude) }, phases: { value: new T.Vector3(...layout.phase) },
      hasBoat: { value: layout.mode === 'ready' && !small },
      ocean: { value: new T.Color(small ? '#4c9f9a' : '#7bc8c3') },
      turquoise: { value: new T.Color(small ? '#72c8b4' : '#81d8c8') },
      shallow: { value: new T.Color(small ? '#afdcc0' : '#b7e4ca') },
      foam: { value: new T.Color('#e8f8e2') },
    },
  }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(origin.x, pond?.y ?? seaLevel, origin.y);
  return mesh;
}

function flower(group, x, y, z, size, shade, yaw) {
  const stem = '#5a8956';
  branch(group, stem, [x, y - .01, z], [x + size * .13, y + size, z], size * .064);
  for (const side of [-1, 1]) {
    oval(group, '#73a260', x + side * size * .23, y + size * .36, z, size * .27, size * .085, size * .105)
      .rotation.z = side * .42;
  }
  for (let p = 0; p < 5; p++) {
    const a = p / 5 * tau + yaw;
    const petal = oval(group, shade, x + size * (.13 + .25 * Math.cos(a)), y + size, z + size * .25 * Math.sin(a),
      size * .21, size * .109, size * .12);
    petal.rotation.y = -a;
  }
  oval(group, '#eab864', x + size * .13, y + size * 1.08, z, size * .14, size * .09, size * .14);
}

function flowersAndStones(layout) {
  const { height, pondEdge, path, flowers: plots, stones: outcrops } = layout;
  const detail = new T.Group(), rand = random(479 ^ layout.seed);
  for (const [cx, cz, count, color] of plots) {
    for (let i = 0; i < count; i++) {
      const x = cx + (rand() - .5) * .90, z = cz + (rand() - .5) * .59;
      if (pondEdge(x, z) > 1.12) flower(detail, x, height(x, z), z, .12 + rand() * .15, color, rand() * tau);
    }
  }
  const stones = ['#a8a39a', '#b7ae9b', '#918d88', '#d1ba9e'];
  for (const [x, z, width] of outcrops) {
    for (let i = 0; i < 4; i++) {
      const px = x + (i ? (rand() - .5) * width * 1.8 : 0), pz = z + (i ? (rand() - .5) * width * 1.4 : 0);
      const size = width * (i === 0 ? .77 : rand() * .51 + .18);
      rock(detail, stones[i], px, height(px, pz) + size * .21, pz, size, size * .65, size * .78)
        .rotation.set(rand() * .55, rand() * tau, rand() * .55);
    }
  }
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const count = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / .37));
    for (let j = 0; j < count; j++) {
      const x = mix(ax, bx, j / count), z = mix(az, bz, j / count);
      rock(detail, rand() < .5 ? '#e5cca3' : '#ebd6af', x, height(x, z) + .016, z,
        .16 + rand() * .07, .045, .096 + rand() * .04).rotation.y = rand() * tau;
    }
  }
  const patches = ['#74a161', '#a9ba70', '#6b995f'];
  const count = layout.mode === 'ready' ? 275 : 98;
  for (let i = 0; i < count; i++) {
    const x = (rand() - .5) * layout.rx * 1.76, z = (rand() - .5) * layout.rz * 1.76;
    if (!layout.acceptsGround(x, z, .08) || height(x, z) < .62) continue;
    for (let j = 0; j < 3; j++) {
      const blade = oval(detail, patches[j], x + (j - 1) * .056, height(x, z) + .04, z,
        .024, .044 + .044 * rand(), .021);
      blade.rotation.z = (j - 1) * .43;
    }
  }
  return bake(detail, { shadow: false });
}

function homestead(layout) {
  const { height, fences, shrubs, dock, pond } = layout;
  const decor = new T.Group();
  const fence = '#fbddad', post = '#e3bd8c';
  for (const row of fences) {
    row.forEach(([x, z], i) => {
      const y = height(x, z);
      block(decor, post, x, y + .22, z, .095, .49, .103);
      oval(decor, fence, x, y + .472, z, .064, .064, .067);
      if (i) {
        const [px, pz] = row[i - 1], py = height(px, pz);
        for (const dy of [.16, .33]) branch(decor, fence, [x, y + dy, z], [px, py + dy, pz], .039);
      }
    });
  }
  for (const [x, z] of shrubs) {
    const y = height(x, z);
    foliage(decor, '#658e59', x, y + .14, z, .31, .25, .26);
    foliage(decor, '#84aa65', x + .05, y + .26, z, .21, .19, .22);
  }
  // Build the jetty along the ray from the island center through its shoreline.
  const jetty = new T.Group();
  jetty.position.set(dock[0], 0, dock[1]);
  jetty.rotation.y = Math.atan2(dock[0], dock[1]);
  for (let i = 0; i < 11; i++) {
    const z = -.24 + i * .137;
    const deck = block(jetty, ['#bb916a', '#cca37b', '#c79e75'][i % 3], 0, .195, z, .81, .09, .123);
    deck.rotation.y = .02 * Math.sin(i * 5);
    for (const x of [-.31, .31]) oval(jetty, '#846b54', x, .242, z, .017, .009, .016);
  }
  for (const x of [-.37, .37]) {
    for (const z of [-.15, .44, 1.12]) {
      branch(jetty, '#a47a59', [x, -.21, z], [x, .39, z], .068);
      oval(jetty, '#ead0a2', x, .39, z, .062, .022, .068);
    }
    line(jetty, '#ead1a3', [[x, .33, .44], [x, .26, .79], [x, .35, 1.12]], .018);
  }
  decor.add(jetty);
  for (const [dx, dz, scale] of [[-.44, .30, .20], [-.25, .58, .23], [.48, -.28, .21], [.37, -.52, .15]]) {
    const x = pond.x + dx * pond.rx, z = pond.z + dz * pond.rz;
    const pad = oval(decor, '#739f68', x, pond.y + .011, z, scale, .022, scale * .75);
    pad.rotation.y = 2 * x;
    if (scale > .2) flower(decor, x, pond.y + .013, z, .13, '#f4b3b2', x);
  }
  for (const [dx, dz] of [[-.80, -.10], [-.77, -.23], [.80, .28], [.84, .35], [.59, .84]]) {
    const x = pond.x + dx * pond.rx, z = pond.z + dz * pond.rz;
    const y = Math.max(pond.y - .05, height(x, z));
    branch(decor, '#809558', [x, y, z], [x + .035, y + .43, z], .027);
    oval(decor, '#916f4e', x + .037, y + .455, z, .030, .080, .03);
  }
  return bake(decor);
}

function sailboat() {
  const boat = new T.Group();
  const hull = new T.SphereGeometry(1, 20, 10, 0, tau, Math.PI / 2, Math.PI / 2);
  const shell = new T.Mesh(hull, paint('#c87865'));
  shell.scale.set(.28, .20, .65);
  shell.position.y = .19;
  boat.add(shell);
  oval(boat, '#f4d6a2', 0, .192, 0, .272, .05, .628);
  oval(boat, '#b98e67', 0, .222, 0, .218, .016, .50);
  branch(boat, '#ad7c58', [0, .20, 0], [0, 1.17, 0], .028);
  const sail = new T.Shape();
  sail.moveTo(0, 1.12);
  sail.quadraticCurveTo(-.04, .62, -.53, .28);
  sail.quadraticCurveTo(-.25, .34, .012, .32);
  sail.closePath();
  const fabric = new T.Mesh(new T.ExtrudeGeometry(sail, {
    depth: .014, bevelEnabled: true, bevelSize: .012, bevelThickness: .014, bevelSegments: 2, curveSegments: 10,
  }), paint('#f8e8b8'));
  fabric.rotation.y = Math.PI / 2 + .4;
  boat.add(fabric);
  line(boat, '#f2c47d', [[-.025, .34, .019], [-.127, .334, .23], [-.20, .30, .456]], .012);
  const flag = block(boat, '#dd8a77', 0, 1.105, -.127, .038, .105, .234);
  flag.rotation.x = .13;
  return bake(boat, { shadow: false });
}

function duck() {
  const bird = new T.Group();
  oval(bird, '#f4d284', 0, .115, 0, .217, .13, .15);
  oval(bird, '#f5d684', .133, .227, 0, .105, .103, .094);
  oval(bird, '#d48a54', .217, .201, 0, .080, .033, .061);
  oval(bird, '#eab56e', -.050, .135, .104, .117, .062, .06);
  oval(bird, '#eab56e', -.050, .135, -.104, .117, .062, .06);
  oval(bird, '#584846', .155, .251, .085, .016, .018, .011);
  oval(bird, '#584846', .155, .251, -.085, .016, .018, .011);
  return bake(bird, { shadow: false });
}

function cloud() {
  const shape = new T.Group();
  for (const size of [[0, 0, 0, .89, .32, .37], [-.54, .06, -.03, .56, .36, .40],
    [-.08, .21, -.08, .54, .49, .46], [.50, .065, .04, .58, .37, .39], [.85, -.045, .01, .42, .25, .28]]) {
    oval(shape, '#edf5ef', ...size);
  }
  return bake(shape, { shadow: false });
}

function contactLayer(height) {
  const material = new T.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    uniforms: { ink: { value: new T.Color('#3d5341') } },
    vertexShader: `varying vec2 local; void main() {
      local = uv * 2. - 1.;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
    }`,
    fragmentShader: `uniform vec3 ink; varying vec2 local; void main() {
      float r = dot(local, local);
      float contact = .29 * pow(max(0., 1. - r), 1.7) + .14 * exp(-8. * r);
      gl_FragColor = vec4(ink, contact);
      #include <colorspace_fragment>
    }`,
  });
  function makeContact(x, z, size) {
    const geometry = new T.PlaneGeometry(2 * size, 1.58 * size, 9, 8);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const worldX = x + position.getX(i), worldZ = z + position.getZ(i);
      position.setY(i, height(worldX, worldZ) + .015);
    }
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, 0, z);
    return mesh;
  }
  return { makeContact, material };
}

export function buildWorld(layout) {
  const root = new T.Group();
  root.rotation.y = layout.rotation;
  const terrain = land(layout);
  const sea = water(layout, false);
  const pond = layout.pond;
  const clouds = [];
  let pool, boat, bird, boatAnchor;
  root.add(sea, terrain, flowersAndStones(layout));
  if (pond) {
    pool = water(layout, true);
    boat = sailboat();
    bird = duck();
    boatAnchor = layout.coast(layout.dockAngle - .285, 1.15);
    root.add(pool, homestead(layout), boat, bird);
    const cloudModel = cloud();
    for (const [x, y, z, size] of [[-1.31, 1.40, -.45, 1.04], [.90, 2.12, -1.18, .83],
      [1.43, 1.30, .17, .66], [-.74, 1.7, -1.78, .79], [.71, 1.32, 1.80, .99]]) {
      const object = cloudModel.clone();
      object.position.set(x * layout.rx, y, z * layout.rz);
      object.scale.setScalar(size * 1.14);
      clouds.push({ object, x: object.position.x });
      root.add(object);
    }
  }

  const { makeContact, material } = contactLayer(layout.height);
  const geometry = new Set(), materials = new Set([material]);
  root.traverse(item => {
    if (!item.isMesh) return;
    geometry.add(item.geometry);
    if (!item.material.vertexColors || item === terrain) materials.add(item.material);
  });

  function animate(t) {
    sea.material.uniforms.time.value = t;
    if (!pond) return;
    pool.material.uniforms.time.value = t;
    boat.position.set(boatAnchor[0] + .11 * Math.sin(t * .53), seaLevel - .030 + .041 * Math.sin(t * 1.36),
      boatAnchor[1] + .08 * Math.sin(t * .45));
    boat.rotation.set(.046 * Math.sin(t * 1.36), -.45 + .075 * Math.sin(t * .64), .075 * Math.sin(t * 1.54));
    sea.material.uniforms.boatPosition.value.set(boat.position.x, boat.position.z);
    const phase = t * .24;
    bird.position.set(pond.x + pond.rx * .35 * Math.cos(phase), pond.y + .015 * Math.sin(t * 3.3),
      pond.z + pond.rz * .35 * Math.sin(phase));
    bird.rotation.y = Math.atan2(-pond.rz * Math.cos(phase), -pond.rx * Math.sin(phase));
    clouds.forEach(({ object, x }, i) => { object.position.x = x + .36 * Math.sin(t * .17 + i * 1.9); });
  }
  return {
    root, terrain, makeContact, animate,
    setPortrait(portrait) {
      clouds.forEach(({ object }, i) => { object.visible = portrait ? i >= 3 : i < 3; });
    },
    dispose() {
      geometry.forEach(item => item.dispose());
      materials.forEach(item => item.dispose());
    },
  };
}
