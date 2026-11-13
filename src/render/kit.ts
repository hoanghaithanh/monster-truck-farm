// Tiny modelling kit for the "toy-box" look: rounded primitives merged into
// single vertex-coloured meshes (one draw call per model).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const C = {
  ink: 0x2b2440, white: 0xffffff, cream: 0xfff6e0, black: 0x1b1730,
  grass: 0x7ed957, grassDark: 0x58bf4a, dirt: 0xf2c98a, mud: 0x9a6b4a, sand: 0xffe7a8,
  barn: 0xff5a4f, barnDark: 0xd93f3a, wood: 0xc98850, woodDark: 0x9a6238, roof: 0x6b5bd6,
  hay: 0xffd447, hayDark: 0xf0b429, pumpkin: 0xff8a1f, leaf: 0x4fc45a, leafDark: 0x36a853, blossom: 0xff9fcf,
  rock: 0xb9b4c8, rockDark: 0x8f8aa6, chrome: 0xe8eef7, steel: 0x8a93a8, tyre: 0x34304a, tyreLight: 0x4a4566,
  pink: 0xff9db8, pinkDark: 0xff7aa0, sun: 0xffd23f, red: 0xff3b3b, blue: 0x2fa8ff, purple: 0x9b6bff, orange: 0xff8a1f,
  gold: 0xffc93c, skin: 0xffc9a0, denim: 0x4a7fe0, water: 0x4fd0e8,
};

type V3 = [number, number, number];
export interface Part { geo: THREE.BufferGeometry; color: number; pos?: V3; rot?: V3; scale?: V3 | number }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

/** Bakes transforms + flat colours into one geometry (position/normal/color). */
export function merged(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const sc = p.scale ?? 1;
    _m.compose(
      _p.set(...(p.pos ?? [0, 0, 0])),
      _q.setFromEuler(_e.set(...(p.rot ?? [0, 0, 0]))),
      typeof sc === 'number' ? _s.setScalar(sc) : _s.set(...sc),
    );
    g.applyMatrix4(_m);
    _c.setHex(p.color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const out = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  return out;
}

export const box = (w: number, h: number, d: number, r = 0.12, seg = 3): THREE.BufferGeometry =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.98);
/** Plain 12-triangle box for things drawn hundreds of times (leaves, fence rails). */
export const slab = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);
export const ball = (r: number, ws = 14, hs = 10): THREE.BufferGeometry => new THREE.SphereGeometry(r, ws, hs);
export const cyl = (rTop: number, rBot: number, h: number, seg = 14): THREE.BufferGeometry => new THREE.CylinderGeometry(rTop, rBot, h, seg);
export const cone = (r: number, h: number, seg = 12): THREE.BufferGeometry => new THREE.ConeGeometry(r, h, seg);
export const capsule = (r: number, len: number): THREE.BufferGeometry => new THREE.CapsuleGeometry(r, len, 5, 12);
export const torus = (r: number, tube: number, seg = 20): THREE.BufferGeometry => new THREE.TorusGeometry(r, tube, 8, seg);

/** Matte clay for the world, glossy vinyl for characters. Shared instances. */
export const MAT = {
  clay: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
  vinyl: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 }),
  chrome: new THREE.MeshStandardMaterial({ color: C.chrome, roughness: 0.12, metalness: 1 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.28, metalness: 0.55, emissive: 0xff9a00, emissiveIntensity: 0.55 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fe3ff, roughness: 0.05, metalness: 0.6 }),
};

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}

/** Big glossy toy eyes, looking down +Z. `gap` = distance between centres. */
export function eyeParts(r: number, gap: number, y: number, z: number, look = 0): Part[] {
  const parts: Part[] = [];
  for (const side of [-1, 1]) {
    const x = (side * gap) / 2;
    parts.push({ geo: ball(r, 10, 7), color: C.white, pos: [x, y, z] });
    parts.push({ geo: ball(r * 0.55, 8, 5), color: C.black, pos: [x + look * r * 0.3, y, z + r * 0.62] });
    parts.push({ geo: ball(r * 0.2, 5, 3), color: C.white, pos: [x + r * 0.22 + look * r * 0.3, y + r * 0.25, z + r * 1.05] });
  }
  return parts;
}

export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}
