import * as T from './vendor/three.module.min.js';
import { bake, block, branch, foliage, line, oval, paint, random, rock } from './models.js';

const tau = Math.PI * 2;
const clamp = T.MathUtils.clamp;
const mix = T.MathUtils.lerp;
const smooth = T.MathUtils.smoothstep;
const rx = 6.25, rz = 4.48;
const pondX = 1.95, pondZ = -.32, pondY = .785;
const farRim = 1.18;
const path = [[-2.22, -.12], [-2.13, .51], [-1.72, 1.19], [-1.05, 1.64], [-.24, 1.82],
  [.85, 2.06], [1.68, 2.59], [2.42, 3.23], [2.76, 3.74]];

function shore(angle) {
  return 1 + .070 * Math.sin(3 * angle + .38) + .035 * Math.cos(5 * angle - .51)
    + .026 * Math.sin(6 * angle + 1.9);
}
function edge(x, z) {
  return Math.hypot(x / rx, z / rz) / shore(Math.atan2(z / rz, x / rx));
}
function pondEdge(x, z) {
  const px = (x - pondX) / 1.59, pz = (z - pondZ) / 1.01;
  const angle = Math.atan2(pz, px);
  return Math.hypot(px, pz) / (1 + .108 * Math.sin(angle * 3 + 1.14) + .045 * Math.cos(angle * 5));
}
function pathDistance(x, z) {
  let distance = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    distance = Math.min(distance, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return distance;
}
export function height(x, z) {
  const radius = edge(x, z);
  const grassy = 1.15 + .18 * Math.sin(x * .66 - .36) * Math.cos(z * .62 + .4)
    + .24 * Math.exp(-((x + 2.8) ** 2 + (z + 2.55) ** 2) / 7);
  const bluff = mix(grassy, .105, smooth(radius, .70, .93));
  const bank = bluff - .36 * smooth(radius, .91, 1.10);
  const pond = pondEdge(x, z);
  return mix(.355 + .060 * pond ** 2, bank, smooth(pond, .72, 1.23));
}
export function acceptsGround(x, z, size) {
  if (pathDistance(x, z) < .21 + size * .48) return false;
  // Sample the footprint around its edge for shoreline and pond clearance.
  for (let i = 0; i < 8; i++) {
    const px = x + size * Math.cos(tau * i / 8), pz = z + size * Math.sin(tau * i / 8);
    if (edge(px, pz) > .86 || pondEdge(px, pz) < 1.16) return false;
  }
  return true;
}

function land() {
  const positions = [], colors = [], indices = [];
  const grass = new T.Color('#87ad70'), moss = new T.Color('#65975f'), pale = new T.Color('#a5ba78');
  const sand = new T.Color('#f5d79f'), wet = new T.Color('#cfad76'), trail = new T.Color('#d9bc86');
  const seam = new T.Color('#b8b57a'), basin = new T.Color('#a6ae71');
  const groundShade = [
    [-3.55, -.59, .79], [-.39, -.77, .68], [3.72, -1.85, .79],
    [-4.94, -.62, .73], [-4.99, 1.19, .56], [-3.93, 2.87, .48],
    [4.50, 1.82, .67], [4.43, -2.20, .73],
  ];
  const color = new T.Color();
  const segments = 144, rings = 64;
  for (let ring = 0; ring <= rings; ring++) {
    const rad = farRim * Math.max(ring / rings, .00001);
    for (let i = 0; i < segments; i++) {
      const a = i / segments * tau, rim = shore(a);
      const x = Math.cos(a) * rx * rad * rim, z = Math.sin(a) * rz * rad * rim;
      const tint = .5 + .25 * Math.sin(x * 1.05 + z * .51) + .19 * Math.cos(z * 1.28 - x * .72);
      const grain = Math.sin(x * 37.1 + z * 21.8) * Math.sin(z * 47.13 - x * 8.34);
      const meadow = grass.clone().lerp(tint > .54 ? pale : moss, Math.abs(tint - .54) * 1.43);
      const boundary = rad + .022 * Math.sin(a * 10) + .014 * Math.cos(a * 16 - .7);
      color.copy(meadow).lerp(seam, smooth(boundary, .698, .806))
        .lerp(sand, smooth(boundary, .752, .875)).lerp(wet, smooth(rad, .94, 1.06));
      const p = pondEdge(x, z);
      color.lerp(basin, (1 - smooth(p, .98, 1.22)) * .86);
      color.lerp(trail, (1 - smooth(pathDistance(x, z) + .029 * Math.sin(x * 7 + z * 4), .20, .43)) * .86);
      let contact = 0;
      for (const [sx, sz, radius] of groundShade) {
        const distance = ((x - sx) ** 2 + (z - sz) ** 2) / (radius * radius);
        contact = Math.max(contact, Math.max(0, 1 - distance) ** 2);
      }
      const pondBank = 1 - smooth(Math.abs(p - 1.02), .015, .18);
      color.multiplyScalar(1 + grain * .037 - contact * .20 - pondBank * .052);
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
  varying vec2 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.)).xz;
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
  varying vec2 vWorld;

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
    vec2 p = vWorld;
    float wave = sin(p.x*1.25 + p.y*1.42 + time*.32) * cos(p.y*.78 - p.x*.50 - time*.27);
    float glint = glints(vec2(p.x*.88+p.y*.23,p.y*1.55-p.x*.27), .52);
    vec3 col;
    if (small) {
      vec2 pq = (p - vec2(1.95,-.32)) / vec2(1.59,1.01);
      float pa = atan(pq.y,pq.x);
      float pr = length(pq) / (1. + .108*sin(3.*pa+1.14) + .045*cos(5.*pa));
      if (pr > 1.22) discard;
      col = mix(ocean, turquoise, .49 + wave*.19);
      col = mix(col, shallow, smoothstep(.48,1.15,pr)*.68);
      float highlight = (1. - smoothstep(.006,.035,abs(pr-.975-wave*.021)))*.47;
      col = mix(col, foam, glint*.43+highlight);
    } else {
      vec2 q = p / vec2(6.25, 4.48);
      float a = atan(q.y, q.x);
      float shore = 1. + .070*sin(3.*a+.38) + .035*cos(5.*a-.51) + .026*sin(6.*a+1.9);
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

      vec2 b = p - boatPosition;
      float ripple = length(vec2(dot(b,vec2(.90,.44)) * 1.7, dot(b,vec2(-.44,.90))));
      float wake = (1. - smoothstep(.01,.065,abs(ripple-.68-.09*sin(time*1.4))))
        * (.4+.23*sin(b.x*9.)) * .34;
      col = mix(col * (1. - .14 * (1. - smoothstep(.16,.62,ripple))), foam, wake);
    }
    gl_FragColor = vec4(col, 1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function water(small) {
  const mesh = new T.Mesh(new T.PlaneGeometry(small ? 4.1 : 180, small ? 3 : 180), new T.ShaderMaterial({
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    uniforms: {
      time: { value: 0 }, small: { value: small }, boatPosition: { value: new T.Vector2(4.85, 4.15) },
      ocean: { value: new T.Color(small ? '#4c9f9a' : '#7bc8c3') },
      turquoise: { value: new T.Color(small ? '#72c8b4' : '#81d8c8') },
      shallow: { value: new T.Color(small ? '#afdcc0' : '#b7e4ca') },
      foam: { value: new T.Color('#e8f8e2') },
    },
  }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(small ? pondX : 0, small ? pondY : -.115, small ? pondZ : 0);
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

function flowersAndStones() {
  const detail = new T.Group(), rand = random(479);
  const plots = [
    [-3.03, .06, 8, '#fff0cb'], [-1.37, .18, 6, '#efaaa7'], [-.09, -.14, 9, '#e8b4c8'],
    [3.78, 1.20, 9, '#fff0cb'], [2.24, 1.51, 6, '#e8b4c8'], [-3.6, 2.12, 9, '#efaaa7'],
    [-1.68, 2.76, 7, '#fff0cb'], [.58, 3.18, 7, '#f2cd77'], [.75, -2.61, 7, '#fff0cb'],
    [4.31, -.17, 8, '#f2cd77'], [-1.16, -2.43, 6, '#efaaa7'],
  ];
  for (const [cx, cz, count, color] of plots) {
    for (let i = 0; i < count; i++) {
      const x = cx + (rand() - .5) * .90, z = cz + (rand() - .5) * .59;
      if (pondEdge(x, z) > 1.12) flower(detail, x, height(x, z), z, .12 + rand() * .15, color, rand() * tau);
    }
  }
  const stones = ['#a8a39a', '#b7ae9b', '#918d88', '#d1ba9e'];
  for (const [x, z, width] of [[-4.96, -.61, .62], [-5.02, 1.19, .45], [-3.93, 2.87, .46], [4.50, 1.82, .55],
    [4.43, -2.20, .58], [2.93, .52, .24], [1.09, .54, .19], [.20, -2.70, .33], [-.30, 3.40, .28]]) {
    for (let i = 0; i < 4; i++) {
      const px = x + (rand() - .5) * width * 1.8, pz = z + (rand() - .5) * width * 1.4;
      const size = width * (i === 0 ? .77 : rand() * .51 + .18);
      rock(detail, stones[i], px, height(px, pz) + size * .21, pz, size, size * .65, size * .78)
        .rotation.set(rand() * .55, rand() * tau, rand() * .55);
    }
  }
  for (const [x, z] of [[-2.24, .18], [-2.12, .53], [-1.93, .88], [-1.66, 1.19], [-1.30, 1.50],
    [-.92, 1.67], [-.48, 1.78], [-.02, 1.82], [.46, 1.94], [1.02, 2.20], [1.53, 2.50],
    [1.93, 2.83], [2.29, 3.12], [2.57, 3.50]]) {
    rock(detail, rand() < .5 ? '#e5cca3' : '#ebd6af', x, height(x, z) + .016, z,
      .16 + rand() * .07, .045, .096 + rand() * .04).rotation.y = rand() * tau;
  }
  const patches = ['#74a161', '#a9ba70', '#6b995f'];
  for (let i = 0; i < 210; i++) {
    const x = (rand() - .5) * 11.8, z = (rand() - .5) * 8.3;
    if (!acceptsGround(x, z, .08) || height(x, z) < .62) continue;
    for (let j = 0; j < 3; j++) {
      const blade = oval(detail, patches[j], x + (j - 1) * .056, height(x, z) + .04, z,
        .024, .044 + .044 * rand(), .021);
      blade.rotation.z = (j - 1) * .43;
    }
  }
  return bake(detail, { shadow: false });
}

function homestead() {
  const decor = new T.Group();
  const fence = '#fbddad', post = '#e3bd8c';
  for (const row of [
    [[-3.12, -.45], [-3.51, -.43], [-3.89, -.57]],
    [[-.87, -.58], [-.49, -.68], [-.13, -.88], [.18, -1.10]],
  ]) {
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
  for (const [x, z] of [[-3.24, -.61], [-3.14, -.53], [-3.37, -.71], [-.70, -.73], [-.35, -.88],
    [3.39, -1.81], [3.71, -1.91], [3.99, -1.69], [-4.15, -1.43], [-4.66, 1.12]]) {
    const y = height(x, z);
    foliage(decor, '#658e59', x, y + .14, z, .31, .25, .26);
    foliage(decor, '#84aa65', x + .05, y + .26, z, .21, .19, .22);
  }
  // Weathered jetty and little mooring ropes.
  for (let i = 0; i < 11; i++) {
    const z = 3.48 + i * .137;
    const deck = block(decor, ['#bb916a', '#cca37b', '#c79e75'][i % 3], 2.80, .195, z, .81, .09, .123);
    deck.rotation.y = .02 * Math.sin(i * 5);
    for (const x of [2.49, 3.11]) oval(decor, '#846b54', x, .242, z, .017, .009, .016);
  }
  for (const x of [2.43, 3.17]) {
    for (const z of [3.58, 4.16, 4.81]) {
      branch(decor, '#a47a59', [x, -.21, z], [x, .39, z], .068);
      oval(decor, '#ead0a2', x, .39, z, .062, .022, .068);
    }
    line(decor, '#ead1a3', [[x, .33, 4.16], [x, .26, 4.47], [x, .35, 4.81]], .018);
  }
  for (const [x, z, scale] of [[1.25, -.02, .20], [1.55, .26, .23], [2.72, -.60, .21], [2.54, -.84, .15]]) {
    const pad = oval(decor, '#739f68', x, pondY + .011, z, scale, .022, scale * .75);
    pad.rotation.y = 2 * x;
    if (scale > .2) flower(decor, x, pondY + .013, z, .13, '#f4b3b2', x);
  }
  for (const [x, z] of [[.68, -.42], [.72, -.55], [3.23, -.04], [3.28, .03], [2.89, .53]]) {
    const y = Math.max(pondY - .05, height(x, z));
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

function contactLayer() {
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
  return (x, z, size) => {
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
  };
}

export function buildWorld(scene) {
  const terrain = land();
  const sea = water(false), pool = water(true);
  const boat = sailboat(), bird = duck(), cloudModel = cloud();
  const clouds = [[-8.2, 1.40, -2.0, 1.04], [5.63, 2.12, -5.30, .83], [8.95, 1.30, .75, .66],
    [-4.61, 1.7, -7.96, .79], [4.45, 1.32, 8.04, .99]]
    .map(([x, y, z, size]) => {
      const object = cloudModel.clone();
      object.position.set(x, y, z);
      object.scale.setScalar(size);
      scene.add(object);
      return { object, x };
    });
  scene.add(sea, terrain, pool, flowersAndStones(), homestead(), boat, bird);
  const makeContact = contactLayer();
  function animate(t) {
    sea.material.uniforms.time.value = t;
    pool.material.uniforms.time.value = t;
    boat.position.set(4.85 + .11 * Math.sin(t * .53), -.145 + .041 * Math.sin(t * 1.36), 4.15 + .08 * Math.sin(t * .45));
    boat.rotation.set(.046 * Math.sin(t * 1.36), -.45 + .075 * Math.sin(t * .64), .075 * Math.sin(t * 1.54));
    sea.material.uniforms.boatPosition.value.set(boat.position.x, boat.position.z);
    const phase = t * .24;
    bird.position.set(pondX + .56 * Math.cos(phase), pondY + .015 * Math.sin(t * 3.3), pondZ + .36 * Math.sin(phase));
    bird.rotation.y = Math.atan2(-.36 * Math.cos(phase), -.56 * Math.sin(phase));
    clouds.forEach(({ object, x }, i) => { object.position.x = x + .36 * Math.sin(t * .17 + i * 1.9); });
  }
  return {
    terrain, makeContact, animate,
    setPortrait(portrait) {
      clouds.forEach(({ object }, i) => { object.visible = portrait ? i >= 3 : i < 3; });
    },
  };
}
