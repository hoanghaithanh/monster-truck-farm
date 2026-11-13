// Static-ish farm scenery: terrain, water, vegetation, buildings, ramps,
// bridge and smashable props. Everything is procedural.
import * as THREE from 'three';
import { clamp, lerp, mulberry32, range, smoothstep, TAU } from '../core/math';
import {
  BIG_HILL, BRIDGE, BUILDINGS, FIELDS, LAKE, MUD, NORTH_HILL, POND, RAMPS, SPAWN, STUNT_PARK, WATER_Y, WORLD, WORLD_R,
  bridgeDeckY, distToPath, groundHeight, riverCenterZ, surfaceHeight, type Building, type PropKind, type Ramp,
} from '../core/world';
import { SHARED, windify } from './engine';
import { C, MAT, ball, box, cone, cyl, eyeParts, merged, mesh, slab, type Part } from './kit';

const EXTENT = 260;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

interface Inst { x: number; y: number; z: number; rot?: number; s?: number; sy?: number; color?: number }
function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Inst[], cast = true): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    const s = it.s ?? 1;
    _m.compose(_p.set(it.x, it.y, it.z), _q.setFromAxisAngle(Y_AXIS, it.rot ?? 0), _s.set(s, s * (it.sy ?? 1), s));
    im.setMatrixAt(i, _m);
    if (it.color !== undefined) im.setColorAt(i, _c.setHex(it.color));
  });
  im.castShadow = cast;
  im.receiveShadow = true;
  im.frustumCulled = false;
  return im;
}

const inField = (x: number, z: number, pad = 0) => FIELDS.some((f) => Math.abs(x - f.x) < f.hw + pad && Math.abs(z - f.z) < f.hd + pad);

// ------------------------------------------------------------------ ground

function buildGround(): THREE.Mesh {
  const seg = 240;
  const geo = new THREE.PlaneGeometry(EXTENT * 2, EXTENT * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const rng = mulberry32(7);
  const grassA = new THREE.Color(C.grass), grassB = new THREE.Color(C.grassDark), grassC = new THREE.Color(0xa8ec6e);
  const dirt = new THREE.Color(C.dirt), mud = new THREE.Color(C.mud), sand = new THREE.Color(C.sand), bed = new THREE.Color(0x5fb7c9);
  const forest = new THREE.Color(0x3f9a4a), arena = new THREE.Color(0xf7dba7), soil = new THREE.Color(0xc79a68), stubble = new THREE.Color(0xf2d98a);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    // Big soft patches + per-vertex speckle keeps the grass from looking flat.
    const n = 0.5 + 0.5 * Math.sin(x * 0.09 + Math.sin(z * 0.05) * 2) * Math.cos(z * 0.08 - Math.sin(x * 0.04) * 2);
    _c.copy(grassA).lerp(grassB, smoothstep(0.35, 0.75, n)).lerp(grassC, smoothstep(0.7, 1, 1 - n) * 0.8);
    _c.offsetHSL(0, 0, (rng() - 0.5) * 0.035);
    const r = Math.hypot(x, z);
    _c.lerp(forest, smoothstep(WORLD_R - 6, WORLD_R + 14, r));
    for (const f of FIELDS) {
      const e = Math.max(Math.abs(x - f.x) - f.hw, Math.abs(z - f.z) - f.hd);
      _c.lerp(f.kind === 'wheat' ? stubble : soil, 1 - smoothstep(-0.5, 1.5, e));
    }
    _c.lerp(arena, 1 - smoothstep(26, 33, Math.hypot(x - STUNT_PARK.x, z - STUNT_PARK.z)));
    _c.lerp(dirt, (1 - smoothstep(1.6, 3.4, distToPath(x, z))) * 0.95);
    _c.lerp(mud, 1 - smoothstep(MUD.r - 2.5, MUD.r + 0.5, Math.hypot(x - MUD.x, z - MUD.z)));
    _c.lerp(sand, 1 - smoothstep(WATER_Y + 0.3, WATER_Y + 1.3, h));
    _c.lerp(bed, 1 - smoothstep(WATER_Y - 1.2, WATER_Y - 0.1, h));
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.3 }));
  ground.receiveShadow = true;
  return ground;
}

function buildWater(): THREE.Mesh {
  const seg = 180;
  const geo = new THREE.PlaneGeometry(EXTENT * 2, EXTENT * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const depth = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) depth[i] = WATER_Y - groundHeight(pos.getX(i), pos.getZ(i));
  geo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: SHARED.uTime, uSun: { value: new THREE.Color(0xffffff) } },
    vertexShader: `
      attribute float aDepth; varying float vDepth; varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main(){
        vDepth = aDepth; vWorld = position;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSun; varying float vDepth; varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main(){
        if (vDepth < -0.25) discard;
        vec2 p = vWorld.xz;
        float w = sin(p.x * 0.9 + uTime * 1.6) * sin(p.y * 1.1 - uTime * 1.2) + sin((p.x + p.y) * 0.45 + uTime * 0.8);
        float shore = 1.0 - smoothstep(0.0, 0.55, vDepth + w * 0.08);
        float bands = smoothstep(0.55, 0.62, fract(vDepth * 2.2 - uTime * 0.35)) * (1.0 - smoothstep(0.3, 1.1, vDepth));
        vec3 col = mix(vec3(0.42, 0.90, 0.97), vec3(0.16, 0.62, 0.90), smoothstep(0.0, 1.3, vDepth));
        col += smoothstep(1.5, 1.9, w) * 0.22;                     // sparkles
        col = mix(col, vec3(1.0), clamp(shore + bands * 0.6, 0.0, 1.0) * 0.9); // foam
        gl_FragColor = vec4(col * mix(vec3(1.0), uSun, 0.35), 0.86);
        #include <fog_fragment>
      }`,
  });
  const water = new THREE.Mesh(geo, mat);
  water.position.y = WATER_Y;
  water.renderOrder = 2;
  return water;
}

// ------------------------------------------------------------------ plants

function buildGrass(): THREE.InstancedMesh {
  // A tuft: five tapered blades fanning out, dark at the root, bright at the tip.
  const positions: number[] = [], colors: number[] = [], normals: number[] = [];
  const root = new THREE.Color(0x4fb34a), tip = new THREE.Color(0xb6f07a);
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * TAU + b, lean = 0.22 + (b % 2) * 0.16, hgt = 0.55 + (b % 3) * 0.2, w = 0.11;
    const cx = Math.cos(a), cz = Math.sin(a);
    const base = [cx * 0.08, 0, cz * 0.08];
    const p0 = [base[0] - cz * w, 0, base[2] + cx * w], p1 = [base[0] + cz * w, 0, base[2] - cx * w], p2 = [base[0] + cx * lean, hgt, base[2] + cz * lean];
    positions.push(...p0, ...p1, ...p2);
    colors.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  const mat = windify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.2 }), 0.22, 1);
  const rng = mulberry32(99);
  const items: Inst[] = [];
  const tints = [0xffffff, 0xeaffd0, 0xd8f5b0, 0xfff7c0];
  for (let tries = 0; items.length < 40000 && tries < 400000; tries++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * (WORLD_R + 10);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = groundHeight(x, z);
    if (h < WATER_Y + 0.7 || distToPath(x, z) < 2.6 || inField(x, z, 0.5) || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 7) continue;
    if (Math.hypot(x - MUD.x, z - MUD.z) < MUD.r || Math.hypot(x - STUNT_PARK.x, z - STUNT_PARK.z) < 28) continue;
    items.push({ x, y: h - 0.03, z, rot: rng() * TAU, s: range(rng, 0.6, 1.25), color: tints[Math.floor(rng() * tints.length)] });
  }
  const im = instanced(geo, mat, items, false);
  im.userData.full = items.length;
  return im;
}

function buildFlowers(): THREE.InstancedMesh {
  const geo = merged([
    { geo: ball(0.16, 6, 4), color: C.white, pos: [0, 0.42, 0], scale: [1, 0.55, 1] },
    { geo: ball(0.08, 5, 3), color: C.sun, pos: [0, 0.48, 0] },
    { geo: cyl(0.025, 0.025, 0.42, 3), color: C.leafDark, pos: [0, 0.21, 0] },
  ]);
  const rng = mulberry32(5);
  const tints = [0xffffff, 0xff9fcf, 0xffe066, 0xc9a6ff, 0xff7a7a, 0x9fe3ff];
  const items: Inst[] = [];
  // Flowers grow in drifts, not evenly.
  for (let patch = 0; patch < 125; patch++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * (WORLD_R - 4);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, tint = tints[Math.floor(rng() * tints.length)];
    for (let i = 0; i < 26; i++) {
      const x = cx + range(rng, -5, 5), z = cz + range(rng, -5, 5), h = groundHeight(x, z);
      if (h < WATER_Y + 0.8 || distToPath(x, z) < 2.4 || inField(x, z, 0.5) || Math.hypot(x - STUNT_PARK.x, z - STUNT_PARK.z) < 28) continue;
      items.push({ x, y: h, z, rot: rng() * TAU, s: range(rng, 0.9, 1.6), color: tint });
    }
  }
  // Shuffle so a reduced instance count thins the drifts evenly.
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  const im = instanced(geo, windify(MAT.vinyl.clone(), 0.2, 1), items, false);
  im.userData.full = items.length;
  return im;
}

function buildCrops(): THREE.Object3D {
  const g = new THREE.Group();
  const rng = mulberry32(31);
  const corn = merged([
    { geo: cyl(0.07, 0.1, 2.4, 6), color: C.leafDark, pos: [0, 1.2, 0] },
    { geo: slab(0.9, 0.06, 0.28), color: C.leaf, pos: [0.35, 1.0, 0], rot: [0, 0, 0.5] },
    { geo: slab(0.9, 0.06, 0.28), color: C.leaf, pos: [-0.35, 1.5, 0], rot: [0, 0, -0.5] },
    { geo: slab(0.7, 0.06, 0.24), color: C.leaf, pos: [0, 2.0, 0.3], rot: [0.5, Math.PI / 2, 0] },
    { geo: ball(0.16, 6, 4), color: C.sun, pos: [0.14, 1.55, 0.08], scale: [1, 2.3, 1] },
    { geo: cone(0.08, 0.35, 5), color: C.hay, pos: [0, 2.55, 0] },
  ]);
  const wheat = merged([
    { geo: cyl(0.03, 0.04, 1.0, 3), color: C.hayDark, pos: [0, 0.5, 0] },
    { geo: ball(0.09, 5, 3), color: C.hay, pos: [0, 1.1, 0], scale: [1, 2.6, 1] },
    { geo: cyl(0.03, 0.04, 0.9, 3), color: C.hayDark, pos: [0.16, 0.45, 0.1], rot: [0.15, 0, -0.2] },
    { geo: ball(0.08, 5, 3), color: C.hay, pos: [0.26, 0.98, 0.17], scale: [1, 2.6, 1] },
    { geo: cyl(0.03, 0.04, 0.95, 3), color: C.hayDark, pos: [-0.14, 0.47, -0.1], rot: [-0.15, 0, 0.2] },
    { geo: ball(0.08, 5, 3), color: C.hay, pos: [-0.24, 1.02, -0.17], scale: [1, 2.6, 1] },
  ]);
  const sunflower = merged([
    { geo: cyl(0.06, 0.08, 2.0, 6), color: C.leafDark, pos: [0, 1.0, 0] },
    { geo: slab(0.7, 0.05, 0.3), color: C.leaf, pos: [0.3, 0.9, 0], rot: [0, 0, 0.4] },
    { geo: slab(0.7, 0.05, 0.3), color: C.leaf, pos: [-0.3, 1.3, 0], rot: [0, 0, -0.4] },
    { geo: cyl(0.55, 0.55, 0.08, 14), color: C.sun, pos: [0, 2.1, 0.08], rot: [Math.PI / 2 - 0.3, 0, 0] },
    { geo: cyl(0.3, 0.3, 0.12, 12), color: C.woodDark, pos: [0, 2.11, 0.12], rot: [Math.PI / 2 - 0.3, 0, 0] },
    ...eyeParts(0.07, 0.2, 2.16, 0.17),
  ]);
  for (const f of FIELDS) {
    const step = f.kind === 'wheat' ? 1.0 : f.kind === 'corn' ? 1.7 : 2.2;
    const items: Inst[] = [];
    for (let x = f.x - f.hw + 0.6; x < f.x + f.hw; x += step) {
      for (let z = f.z - f.hd + 0.6; z < f.z + f.hd; z += step) {
        const px = x + range(rng, -0.3, 0.3), pz = z + range(rng, -0.3, 0.3);
        if (Math.hypot(px - f.x, pz - f.z) < 2) continue; // scarecrow clearing
        items.push({ x: px, y: groundHeight(px, pz), z: pz, rot: f.kind === 'sunflower' ? 2.2 + range(rng, -0.3, 0.3) : rng() * TAU, s: range(rng, 0.85, 1.2) });
      }
    }
    const geo = f.kind === 'corn' ? corn : f.kind === 'wheat' ? wheat : sunflower;
    g.add(instanced(geo, windify(MAT.clay.clone(), f.kind === 'wheat' ? 0.12 : 0.05, 1), items, f.kind !== 'wheat'));
  }
  return g;
}

function buildTrees(): THREE.Object3D {
  const g = new THREE.Group();
  const round = merged([
    { geo: cyl(0.35, 0.55, 2.6, 8), color: C.wood, pos: [0, 1.3, 0] },
    { geo: ball(2.0, 9, 6), color: C.leaf, pos: [0, 4.0, 0] },
    { geo: ball(1.4, 8, 5), color: C.leafDark, pos: [1.3, 3.2, 0.4] },
    { geo: ball(1.5, 8, 5), color: 0x6fd86a, pos: [-1.1, 3.5, -0.6] },
    { geo: ball(1.1, 8, 5), color: 0x6fd86a, pos: [0.2, 5.3, 0.3] },
  ]);
  const apple = merged([
    { geo: cyl(0.3, 0.5, 2.2, 8), color: C.wood, pos: [0, 1.1, 0] },
    { geo: ball(2.1, 9, 6), color: 0x66cf5f, pos: [0, 3.6, 0], scale: [1, 0.85, 1] },
    ...[[1.4, 3.2, 1.2], [-1.3, 3.8, 1.1], [0.2, 4.6, 1.5], [-0.6, 2.8, 1.7], [1.6, 4.2, -0.6], [-1.7, 3.3, -0.7], [0.4, 3.4, -2.0]].map(
      (p): Part => ({ geo: ball(0.26, 6, 4), color: C.red, pos: p as [number, number, number] }),
    ),
  ]);
  const pine = merged([
    { geo: cyl(0.3, 0.45, 1.6, 8), color: C.woodDark, pos: [0, 0.8, 0] },
    { geo: cone(2.0, 2.6, 8), color: 0x2f9a5a, pos: [0, 2.6, 0] },
    { geo: cone(1.55, 2.3, 8), color: 0x3fb06a, pos: [0, 4.0, 0] },
    { geo: cone(1.05, 2.0, 8), color: 0x55c47a, pos: [0, 5.3, 0] },
  ]);
  const geos = [round, apple, pine];
  const rng = mulberry32(3);
  for (let k = 0; k < 3; k++) {
    const items = WORLD.trees.filter((t) => t.kind === k).map((t) => ({ x: t.x, y: groundHeight(t.x, t.z) - 0.1, z: t.z, rot: rng() * TAU, s: t.s, sy: range(rng, 0.9, 1.15) }));
    g.add(instanced(geos[k], windify(MAT.clay.clone(), 0.03, 0), items));
  }
  return g;
}

function buildMountains(): THREE.Mesh {
  const parts: Part[] = [];
  const rng = mulberry32(8);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + range(rng, -0.1, 0.1), d = range(rng, 350, 430), h = range(rng, 80, 150), r = h * range(rng, 0.7, 1.0);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    parts.push({ geo: cone(r, h, 7), color: i % 2 ? 0x9aa6e8 : 0xa992e0, pos: [x, h / 2 - 6, z], rot: [0, rng() * 3, 0] });
    parts.push({ geo: cone(r * 0.33, h * 0.33, 7), color: 0xffffff, pos: [x, h * 0.835 - 6 + 0.5, z], rot: [0, rng() * 3, 0], scale: [1.04, 1, 1.04] });
  }
  const m = new THREE.Mesh(merged(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  return m;
}

// ------------------------------------------------------------------ built things

function rampMesh(r: Ramp): THREE.Mesh {
  const N = 10, hw = r.width / 2;
  const pos: number[] = [], col: number[] = [];
  const a = new THREE.Color(C.orange), b = new THREE.Color(C.cream), side = new THREE.Color(C.wood);
  const yAt = (t: number) => -0.1 + r.height * (0.35 * t + 0.65 * t * t);
  const quad = (p: number[][], c: THREE.Color) => {
    for (const i of [0, 2, 1, 0, 3, 2]) { pos.push(...p[i]); col.push(c.r, c.g, c.b); }
  };
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N, z0 = t0 * r.len, z1 = t1 * r.len, y0 = yAt(t0), y1 = yAt(t1);
    quad([[hw, y0, z0], [hw, y1, z1], [-hw, y1, z1], [-hw, y0, z0]], i % 2 ? a : b);
    quad([[hw, -2, z0], [hw, -2, z1], [hw, y1, z1], [hw, y0, z0]], side);
    quad([[-hw, y0, z0], [-hw, y1, z1], [-hw, -2, z1], [-hw, -2, z0]], side);
  }
  const top = yAt(1);
  quad([[hw, -2, r.len], [-hw, -2, r.len], [-hw, top, r.len], [hw, top, r.len]], side);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = mesh(geo, MAT.clay);
  m.position.set(r.x, r.base, r.z);
  m.rotation.y = r.heading;
  return m;
}

function buildBridge(): THREE.Mesh {
  const parts: Part[] = [];
  const zc = riverCenterZ(BRIDGE.x), N = 14;
  for (let i = 0; i < N; i++) {
    const u = ((i + 0.5) / N) * 2 - 1, z = zc + u * BRIDGE.halfL, y = bridgeDeckY(u);
    const slope = Math.atan2(bridgeDeckY(u + 0.02) - bridgeDeckY(u - 0.02), BRIDGE.halfL * 0.04);
    parts.push({ geo: box(BRIDGE.halfW * 2 + 0.6, 0.35, (BRIDGE.halfL * 2) / N + 0.08, 0.08, 1), color: i % 2 ? C.wood : 0xdba36a, pos: [BRIDGE.x, y - 0.2, z], rot: [-slope, 0, 0] });
    if (i % 2 === 0) {
      for (const sx of [-1, 1]) {
        parts.push({ geo: box(0.35, 1.5, 0.35, 0.08, 1), color: C.barn, pos: [BRIDGE.x + sx * (BRIDGE.halfW + 0.15), y + 0.5, z] });
        parts.push({ geo: ball(0.26, 8, 6), color: C.cream, pos: [BRIDGE.x + sx * (BRIDGE.halfW + 0.15), y + 1.35, z] });
      }
    }
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const u = ((i + 0.5) / N) * 2 - 1;
      parts.push({ geo: box(0.18, 0.18, (BRIDGE.halfL * 2) / N + 0.1, 0.05, 1), color: C.cream, pos: [BRIDGE.x + sx * (BRIDGE.halfW + 0.15), bridgeDeckY(u) + 0.85, zc + u * BRIDGE.halfL], rot: [-Math.atan2(bridgeDeckY(u + 0.02) - bridgeDeckY(u - 0.02), BRIDGE.halfL * 0.04), 0, 0] });
    }
  }
  return mesh(merged(parts), MAT.clay);
}

interface BuildingView { group: THREE.Group; spin?: THREE.Object3D; smokeAt?: THREE.Vector3 }

function buildBuilding(b: Building): BuildingView {
  const group = new THREE.Group();
  group.position.set(b.x, groundHeight(b.x, b.z), b.z);
  group.rotation.y = b.rot;
  const view: BuildingView = { group };
  const add = (parts: Part[], mat: THREE.Material = MAT.clay) => group.add(mesh(merged(parts), mat));
  const roofHalf = (w: number, d: number, y: number, rise: number, color: number, sx: number): Part => {
    const len = Math.hypot(w / 2, rise) + 0.5;
    return { geo: box(len, 0.4, d + 1, 0.15, 2), color, pos: [(sx * w) / 4, y + rise / 2, 0], rot: [0, 0, -sx * Math.atan2(rise, w / 2)] };
  };
  switch (b.kind) {
    case 'barn': {
      add([
        { geo: box(12, 6, 9, 0.4), color: C.barn, pos: [0, 3, 0] },
        { geo: box(12.2, 0.5, 9.2, 0.2), color: C.cream, pos: [0, 0.25, 0] },
        roofHalf(12, 9, 6, 3.6, C.roof, -1), roofHalf(12, 9, 6, 3.6, C.roof, 1),
        { geo: box(5, 2.6, 8.9, 0.3), color: C.barnDark, pos: [0, 7, 0] },
        // Big friendly doors with white cross-bracing.
        { geo: box(4.4, 4.2, 0.3, 0.1), color: C.barnDark, pos: [0, 2.2, 4.5] },
        { geo: box(4.6, 0.3, 0.4, 0.1), color: C.cream, pos: [0, 4.3, 4.55] },
        { geo: box(0.3, 4.2, 0.4, 0.1), color: C.cream, pos: [-2.2, 2.2, 4.55] },
        { geo: box(0.3, 4.2, 0.4, 0.1), color: C.cream, pos: [2.2, 2.2, 4.55] },
        { geo: box(0.3, 4.2, 0.4, 0.1), color: C.cream, pos: [0, 2.2, 4.55] },
        { geo: box(0.25, 4.6, 0.36, 0.1), color: C.cream, pos: [-1.1, 2.2, 4.56], rot: [0, 0, 0.47] },
        { geo: box(0.25, 4.6, 0.36, 0.1), color: C.cream, pos: [1.1, 2.2, 4.56], rot: [0, 0, -0.47] },
        { geo: cyl(1, 1, 0.3, 16), color: C.cream, pos: [0, 7.1, 4.4], rot: [Math.PI / 2, 0, 0] },
        { geo: cyl(0.75, 0.75, 0.34, 16), color: C.ink, pos: [0, 7.1, 4.42], rot: [Math.PI / 2, 0, 0] },
        ...[-4.2, 4.2].map((x): Part => ({ geo: box(1.6, 1.6, 0.3, 0.2), color: C.cream, pos: [x, 3.4, 4.45] })),
        ...[-4.2, 4.2].map((x): Part => ({ geo: box(1.2, 1.2, 0.34, 0.15), color: 0x8fd9ff, pos: [x, 3.4, 4.47] })),
      ]);
      break;
    }
    case 'house': {
      add([
        { geo: box(9.6, 4.6, 8, 0.4), color: C.cream, pos: [0, 2.3, 0] },
        roofHalf(9.6, 8, 4.6, 3, C.orange, -1), roofHalf(9.6, 8, 4.6, 3, C.orange, 1),
        { geo: box(4, 2.2, 7.9, 0.3), color: 0xffe9bf, pos: [0, 5.4, 0] },
        { geo: box(1.5, 2.8, 0.3, 0.2), color: C.blue, pos: [0, 1.4, 4.0] },
        { geo: ball(0.14, 6, 5), color: C.sun, pos: [0.45, 1.4, 4.2] },
        ...[-2.9, 2.9].flatMap((x): Part[] => [
          { geo: box(1.9, 1.9, 0.3, 0.2), color: C.blue, pos: [x, 2.6, 4.0] },
          { geo: box(1.45, 1.45, 0.36, 0.15), color: 0xfff3a8, pos: [x, 2.6, 4.02] },
          { geo: box(2.1, 0.5, 0.7, 0.15), color: C.barn, pos: [x, 1.45, 4.2] },
          { geo: ball(0.3, 6, 5), color: C.blossom, pos: [x - 0.5, 1.85, 4.25] },
          { geo: ball(0.3, 6, 5), color: C.sun, pos: [x + 0.1, 1.9, 4.25] },
          { geo: ball(0.3, 6, 5), color: C.blossom, pos: [x + 0.6, 1.85, 4.25] },
        ]),
        { geo: box(1.2, 3.4, 1.2, 0.15), color: C.barnDark, pos: [2.8, 7.2, -1.5] },
        { geo: box(1.5, 0.4, 1.5, 0.1), color: C.cream, pos: [2.8, 8.9, -1.5] },
        { geo: box(3, 0.3, 1.6, 0.1), color: C.wood, pos: [0, 0.15, 4.8] },
      ]);
      view.smokeAt = new THREE.Vector3(2.8, 9.3, -1.5).applyAxisAngle(Y_AXIS, b.rot).add(group.position);
      break;
    }
    case 'silo': {
      add([
        { geo: cyl(2.5, 2.5, 10, 20), color: C.cream, pos: [0, 5, 0] },
        ...[2.5, 5, 7.5].map((y): Part => ({ geo: cyl(2.58, 2.58, 0.5, 20), color: C.barn, pos: [0, y, 0] })),
        { geo: ball(2.6, 18, 10), color: C.roof, pos: [0, 10, 0], scale: [1, 0.75, 1] },
        { geo: ball(0.35, 8, 6), color: C.sun, pos: [0, 12.1, 0] },
      ]);
      break;
    }
    case 'windmill': {
      add([
        { geo: cyl(1.5, 2.4, 9, 10), color: C.cream, pos: [0, 4.5, 0] },
        { geo: cone(2.2, 2.4, 10), color: C.barn, pos: [0, 10.2, 0] },
        { geo: box(1.2, 2.2, 0.3, 0.2), color: C.blue, pos: [0, 1.1, 2.25] },
        { geo: box(0.9, 0.9, 0.3, 0.2), color: 0x8fd9ff, pos: [0, 5.2, 1.85] },
        { geo: cyl(0.3, 0.3, 1.6, 8), color: C.woodDark, pos: [0, 8.4, 1.6], rot: [Math.PI / 2, 0, 0] },
      ]);
      const blades: Part[] = [{ geo: ball(0.55, 10, 8), color: C.sun }];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        blades.push({ geo: box(0.25, 5.4, 0.2, 0.08, 1), color: C.woodDark, pos: [-Math.sin(a) * 2.7, Math.cos(a) * 2.7, 0], rot: [0, 0, a] });
        blades.push({ geo: box(1.5, 3.8, 0.12, 0.08, 1), color: i % 2 ? C.cream : 0xffd9e8, pos: [-Math.sin(a) * 3.3 + Math.cos(a) * 0.75, Math.cos(a) * 3.3 + Math.sin(a) * 0.75, 0], rot: [0, 0, a] });
      }
      const spin = mesh(merged(blades), MAT.clay);
      spin.position.set(0, 8.4, 2.5);
      group.add(spin);
      view.spin = spin;
      break;
    }
    case 'coop': {
      add([
        ...[[-1.8, -1.3], [1.8, -1.3], [-1.8, 1.3], [1.8, 1.3]].map(([x, z]): Part => ({ geo: box(0.3, 1.2, 0.3, 0.08, 1), color: C.woodDark, pos: [x, 0.6, z] })),
        { geo: box(4.6, 2.6, 3.6, 0.3), color: 0xffc56b, pos: [0, 2.4, 0] },
        roofHalf(4.6, 3.6, 3.7, 1.5, C.barn, -1), roofHalf(4.6, 3.6, 3.7, 1.5, C.barn, 1),
        { geo: box(1.9, 1, 3.5, 0.2), color: 0xffd99a, pos: [0, 4.0, 0] },
        { geo: cyl(0.6, 0.6, 0.3, 14), color: C.ink, pos: [0, 2.3, 1.75], rot: [Math.PI / 2, 0, 0] },
        { geo: box(1.2, 0.15, 2.6, 0.05, 1), color: C.wood, pos: [0, 0.75, 2.9], rot: [0.5, 0, 0] },
      ]);
      break;
    }
    case 'well': {
      add([
        { geo: cyl(1.3, 1.4, 1.2, 12), color: C.rock, pos: [0, 0.6, 0] },
        { geo: cyl(1.0, 1.0, 1.25, 12), color: 0x3a6fb0, pos: [0, 0.6, 0] },
        { geo: box(0.25, 2.6, 0.25, 0.06, 1), color: C.woodDark, pos: [-1.15, 1.9, 0] },
        { geo: box(0.25, 2.6, 0.25, 0.06, 1), color: C.woodDark, pos: [1.15, 1.9, 0] },
        { geo: cone(1.9, 1.3, 4), color: C.barn, pos: [0, 3.7, 0], rot: [0, Math.PI / 4, 0] },
        { geo: cyl(0.3, 0.26, 0.45, 8), color: C.wood, pos: [0, 2.3, 0] },
      ]);
      break;
    }
  }
  return view;
}

const PROP_GEO: Record<Exclude<PropKind, 'car'>, () => THREE.BufferGeometry> = {
  hay: () => merged([
    { geo: cyl(1.05, 1.05, 1.5, 16), color: C.hay, pos: [0, 1.05, 0], rot: [0, 0, Math.PI / 2] },
    { geo: cyl(1.08, 1.08, 0.16, 16), color: C.hayDark, pos: [-0.4, 1.05, 0], rot: [0, 0, Math.PI / 2] },
    { geo: cyl(1.08, 1.08, 0.16, 16), color: C.hayDark, pos: [0.4, 1.05, 0], rot: [0, 0, Math.PI / 2] },
    { geo: cyl(0.4, 0.4, 1.54, 12), color: C.hayDark, pos: [0, 1.05, 0], rot: [0, 0, Math.PI / 2] },
  ]),
  crate: () => merged([
    { geo: box(1.3, 1.3, 1.3, 0.1, 2), color: C.wood, pos: [0, 0.65, 0] },
    ...[-1, 1].flatMap((s): Part[] => [
      { geo: box(1.4, 0.2, 1.4, 0.05, 1), color: C.woodDark, pos: [0, 0.65 + s * 0.56, 0] },
      { geo: box(0.2, 1.36, 1.4, 0.05, 1), color: C.woodDark, pos: [s * 0.6, 0.65, 0] },
    ]),
    { geo: ball(0.3, 8, 6), color: C.sun, pos: [0, 0.65, 0.62], scale: [1, 1, 0.3] },
  ]),
  pumpkin: () => merged([
    { geo: ball(0.6, 12, 8), color: C.pumpkin, pos: [0, 0.45, 0], scale: [1, 0.78, 1] },
    { geo: ball(0.42, 10, 8), color: 0xffa040, pos: [0.3, 0.45, 0], scale: [1, 0.95, 1] },
    { geo: ball(0.42, 10, 8), color: 0xffa040, pos: [-0.3, 0.45, 0], scale: [1, 0.95, 1] },
    { geo: cyl(0.07, 0.1, 0.3, 6), color: C.leafDark, pos: [0, 0.98, 0] },
    ...eyeParts(0.1, 0.34, 0.52, 0.5),
  ]),
  scarecrow: () => merged([
    { geo: cyl(0.1, 0.1, 3, 6), color: C.woodDark, pos: [0, 1.5, 0] },
    { geo: cyl(0.09, 0.09, 2.6, 6), color: C.woodDark, pos: [0, 2.2, 0], rot: [0, 0, Math.PI / 2] },
    { geo: box(1.3, 1.2, 0.6, 0.2), color: C.barn, pos: [0, 2.0, 0] },
    { geo: box(0.5, 0.5, 0.62, 0.1), color: C.sun, pos: [0, 1.9, 0.02] },
    { geo: ball(0.5, 12, 9), color: 0xffe2b0, pos: [0, 3.0, 0] },
    ...eyeParts(0.13, 0.4, 3.08, 0.4),
    { geo: cone(0.12, 0.4, 6), color: C.orange, pos: [0, 2.95, 0.6], rot: [Math.PI / 2, 0, 0] },
    { geo: cyl(0.85, 0.85, 0.08, 14), color: C.hayDark, pos: [0, 3.4, 0] },
    { geo: cone(0.5, 0.7, 12), color: C.hay, pos: [0, 3.75, 0] },
    ...[-1.25, 1.25].map((x): Part => ({ geo: ball(0.22, 6, 5), color: C.hay, pos: [x, 2.2, 0] })),
  ]),
  fence: () => merged([
    ...[-1.35, 0, 1.35].map((z): Part => ({ geo: slab(0.28, 1.5, 0.28), color: C.cream, pos: [0, 0.75, z] })),
    ...[-1.35, 0, 1.35].map((z): Part => ({ geo: ball(0.2, 6, 5), color: C.barn, pos: [0, 1.55, z] })),
    { geo: slab(0.14, 0.24, 3), color: C.cream, pos: [0, 1.1, 0] },
    { geo: slab(0.14, 0.24, 3), color: C.cream, pos: [0, 0.55, 0] },
  ]),
  rock: () => merged([
    { geo: new THREE.IcosahedronGeometry(1.25, 1), color: C.rock, pos: [0, 0.7, 0], scale: [1, 0.75, 0.9] },
    { geo: new THREE.IcosahedronGeometry(0.6, 1), color: C.rockDark, pos: [0.9, 0.35, 0.4] },
  ]),
  boulder: () => merged([
    { geo: new THREE.IcosahedronGeometry(2.1, 1), color: C.rockDark, pos: [0, 1.3, 0], scale: [1, 0.85, 0.95] },
    { geo: new THREE.IcosahedronGeometry(1.0, 1), color: C.rock, pos: [1.5, 0.6, 0.8] },
    { geo: new THREE.IcosahedronGeometry(0.7, 1), color: C.rock, pos: [-1.5, 0.45, -0.7] },
    // A sleepy face makes it a character, not an obstacle.
    { geo: box(0.5, 0.1, 0.1, 0.04, 1), color: C.ink, pos: [-0.5, 1.6, 1.85], rot: [0, 0, 0.15] },
    { geo: box(0.5, 0.1, 0.1, 0.04, 1), color: C.ink, pos: [0.5, 1.6, 1.85], rot: [0, 0, -0.15] },
  ]),
};

function carGeo(color: number): THREE.BufferGeometry {
  return merged([
    { geo: box(2.4, 0.9, 4.4, 0.35), color, pos: [0, 0.95, 0] },
    { geo: box(2.1, 0.9, 2.2, 0.4), color, pos: [0, 1.7, -0.3] },
    { geo: box(1.9, 0.6, 2.24, 0.25), color: 0x9fe3ff, pos: [0, 1.75, -0.3] },
    ...[[-1.15, 1.4], [1.15, 1.4], [-1.15, -1.4], [1.15, -1.4]].map(([x, z]): Part => ({ geo: cyl(0.5, 0.5, 0.4, 12), color: C.tyre, pos: [x, 0.5, z], rot: [0, 0, Math.PI / 2] })),
    ...eyeParts(0.3, 1.3, 1.05, 2.05),
    { geo: box(1.2, 0.12, 0.1, 0.04, 1), color: C.ink, pos: [0, 0.68, 2.22] }, // worried mouth
    { geo: box(2.5, 0.25, 0.3, 0.1, 1), color: C.chrome, pos: [0, 0.55, 2.2] },
    { geo: box(0.9, 0.5, 0.05, 0.02, 1), color: 0xb5651d, pos: [0.5, 1.1, 2.21] }, // rust patch
  ]);
}

// ------------------------------------------------------------------ view

export class Farm {
  readonly group = new THREE.Group();
  /** World-space chimney top, for smoke puffs. */
  readonly chimney = new THREE.Vector3();
  private grass: THREE.InstancedMesh;
  private flowers: THREE.InstancedMesh;
  private spinners: THREE.Object3D[] = [];
  private propSlots = new Map<number, { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4 }>();
  private cars = new Map<number, THREE.Mesh>();
  private water: THREE.Mesh;
  private birds: { root: THREE.Group; wings: THREE.Mesh[]; phase: number; r: number; h: number; cx: number; cz: number }[] = [];

  constructor() {
    this.group.add(buildGround());
    this.water = buildWater();
    this.flowers = buildFlowers();
    this.group.add(this.water, buildMountains(), buildTrees(), buildCrops(), this.flowers, buildBridge());
    this.grass = buildGrass();
    this.group.add(this.grass);
    for (const r of RAMPS) this.group.add(rampMesh(r));
    for (const b of BUILDINGS) {
      const v = buildBuilding(b);
      this.group.add(v.group);
      if (v.spin) this.spinners.push(v.spin);
      if (v.smokeAt) this.chimney.copy(v.smokeAt);
    }
    this.buildProps();
    this.buildDecor();
    this.buildBirds();
  }

  /** A few birds wheeling overhead: cheap, and the sky stops looking empty. */
  private buildBirds(): void {
    const wing = box(1.5, 0.08, 0.5, 0.03, 1).translate(0.75, 0, 0);
    const mat = new THREE.MeshStandardMaterial({ color: C.white, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const root = new THREE.Group();
      const wings = [new THREE.Mesh(wing, mat), new THREE.Mesh(wing, mat)];
      wings[1].scale.x = -1;
      root.add(...wings);
      this.group.add(root);
      const flock = i < 5 ? 0 : 1;
      this.birds.push({ root, wings, phase: i * 0.7, r: 26 + (i % 5) * 5, h: 30 + (i % 3) * 4 + flock * 8, cx: flock ? 60 : -30, cz: flock ? -40 : 40 });
    }
  }

  private buildProps(): void {
    const kinds = Object.keys(PROP_GEO) as Exclude<PropKind, 'car'>[];
    for (const kind of kinds) {
      const props = WORLD.props.filter((p) => p.kind === kind);
      const im = instanced(PROP_GEO[kind](), MAT.clay, props.map((p) => ({ x: p.x, y: groundHeight(p.x, p.z) - 0.05, z: p.z, rot: p.rot })));
      props.forEach((p, index) => {
        const matrix = new THREE.Matrix4();
        im.getMatrixAt(index, matrix);
        this.propSlots.set(p.id, { mesh: im, index, matrix });
      });
      this.group.add(im);
    }
    const carColors = [0x6fd3c7, 0xf2a65a, 0xc9a6ff, 0xf27a7a, 0x9fd96a, 0x7fb2ff];
    WORLD.props.filter((p) => p.kind === 'car').forEach((p, i) => {
      const car = mesh(carGeo(carColors[i % carColors.length]), MAT.vinyl);
      car.position.set(p.x, groundHeight(p.x, p.z), p.z);
      car.rotation.y = p.rot;
      this.cars.set(p.id, car);
      this.group.add(car);
    });
  }

  /** Non-interactive dressing: stunt-park flags, hill-top flag, lily pads. */
  private buildDecor(): void {
    const parts: Part[] = [];
    const flag = (x: number, z: number, color: number, h = 5) => {
      const y = surfaceHeight(x, z);
      parts.push({ geo: cyl(0.1, 0.12, h, 6), color: C.cream, pos: [x, y + h / 2, z] });
      parts.push({ geo: box(1.8, 1.0, 0.08, 0.04, 1), color, pos: [x + 0.95, y + h - 0.6, z] });
      parts.push({ geo: ball(0.2, 6, 5), color: C.sun, pos: [x, y + h + 0.1, z] });
    };
    const cols = [C.red, C.sun, C.blue, C.purple, C.orange, C.blossom];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      flag(STUNT_PARK.x + Math.cos(a) * 31, STUNT_PARK.z + Math.sin(a) * 31, cols[i % cols.length], 4.5);
    }
    flag(BIG_HILL.x, BIG_HILL.z, C.red, 7);
    flag(NORTH_HILL.x, NORTH_HILL.z, C.blue, 7);
    const rng = mulberry32(12);
    for (let i = 0; i < 80; i++) { // lily pads on calm water
      const still = i < 14 ? POND : i < 40 ? LAKE : null;
      const x = range(rng, -WORLD_R, WORLD_R), z = still ? still.z + range(rng, -still.r, still.r) : riverCenterZ(x) + range(rng, -3, 3);
      const px = still ? still.x + range(rng, -still.r, still.r) : x;
      if (groundHeight(px, z) > WATER_Y - 0.5) continue;
      parts.push({ geo: cyl(0.7, 0.7, 0.06, 10), color: C.leaf, pos: [px, WATER_Y + 0.04, z] });
      if (i % 3 === 0) parts.push({ geo: ball(0.22, 6, 5), color: C.blossom, pos: [px, WATER_Y + 0.2, z] });
    }
    // Mud-pit rim stones and a stack of tyres in the stunt park.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU, x = MUD.x + Math.cos(a) * (MUD.r + 0.6), z = MUD.z + Math.sin(a) * (MUD.r + 0.6);
      parts.push({ geo: ball(0.5, 7, 5), color: i % 2 ? C.rock : C.rockDark, pos: [x, groundHeight(x, z) + 0.15, z], scale: [1, 0.6, 1] });
    }
    this.group.add(mesh(merged(parts), MAT.clay));
  }

  /** Scale grass density with the quality level. */
  setGrassDensity(frac: number): void {
    this.grass.count = Math.floor(this.grass.userData.full * clamp(frac, 0, 1));
    this.flowers.count = Math.floor(this.flowers.userData.full * clamp(frac * 1.5, 0, 1));
  }

  setSunColor(c: THREE.Color): void {
    ((this.water.material as THREE.ShaderMaterial).uniforms.uSun.value as THREE.Color).copy(c);
  }

  smashProp(id: number): void {
    const car = this.cars.get(id);
    if (car) { car.userData.crush = 1; return; }
    const slot = this.propSlots.get(id);
    if (!slot) return;
    slot.mesh.setMatrixAt(slot.index, _m.makeScale(0, 0, 0));
    slot.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Put every prop back for a new run. */
  reset(): void {
    for (const slot of this.propSlots.values()) {
      slot.mesh.setMatrixAt(slot.index, slot.matrix);
      slot.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const car of this.cars.values()) { car.userData.crush = 0; car.scale.set(1, 1, 1); }
  }

  update(dt: number, time: number): void {
    for (const s of this.spinners) s.rotation.z += dt * 0.9;
    for (const b of this.birds) {
      const a = time * 0.22 + b.phase;
      b.root.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(a * 3) * 1.5, b.cz + Math.sin(a) * b.r);
      b.root.rotation.y = -a;
      const flap = Math.sin(time * 7 + b.phase * 3) * 0.6;
      b.wings[0].rotation.z = flap; b.wings[1].rotation.z = -flap;
    }
    for (const car of this.cars.values()) { // crushed cars pancake with a wobble
      if (!car.userData.crush) continue;
      const k = (car.userData.crush = Math.max(0.0001, car.userData.crush - dt * 5));
      const flat = lerp(0.22, 1, k) + Math.sin(time * 30) * 0.04 * k;
      car.scale.set(lerp(1.25, 1, k), flat, lerp(1.15, 1, k));
    }
  }
}

export const propColor = (kind: PropKind): number[] => ({
  hay: [C.hay, C.hayDark], crate: [C.wood, C.woodDark], pumpkin: [C.pumpkin, 0xffa040], scarecrow: [C.hay, C.barn],
  fence: [C.cream, C.cream, C.barn], rock: [C.rock, C.rockDark], boulder: [C.rock, C.rockDark], car: [C.chrome, C.steel, C.tyre],
}[kind]);
