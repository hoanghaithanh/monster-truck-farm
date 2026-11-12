// Living things and collectables: animals, the farmer on his tractor,
// floating coins, nitro cans and golden corn.
import * as THREE from 'three';
import type { Animal, Species } from '../core/animals';
import type { Farmer } from '../core/farmer';
import { damp, TAU } from '../core/math';
import type { Pickup } from '../core/sim';
import { groundHeight } from '../core/world';
import { C, MAT, ball, box, capsule, cone, cyl, merged, mesh, torus, type Part } from './kit';

const HALF_PI = Math.PI / 2;

interface SpeciesModel { body: THREE.BufferGeometry; eyes: THREE.BufferGeometry; eyeY: number; eyeZ: number; height: number }

function eyes(r: number, gap: number): THREE.BufferGeometry {
  const parts: Part[] = [];
  for (const s of [-1, 1]) {
    parts.push({ geo: ball(r, 12, 9), color: C.white, pos: [(s * gap) / 2, 0, 0] });
    parts.push({ geo: ball(r * 0.58, 10, 8), color: C.black, pos: [(s * gap) / 2, 0, r * 0.6] });
    parts.push({ geo: ball(r * 0.22, 6, 5), color: C.white, pos: [(s * gap) / 2 + r * 0.22, r * 0.25, r * 1.05] });
  }
  return merged(parts);
}

function buildSpecies(): Record<Species, SpeciesModel> {
  const legs = (x: number, z: number, h: number, r: number, color: number, hoof = color): Part[] =>
    [[x, z], [-x, z], [x, -z], [-x, -z]].flatMap(([lx, lz]): Part[] => [
      { geo: cyl(r, r, h, 8), color, pos: [lx, h / 2, lz] },
      { geo: cyl(r * 1.15, r * 1.15, h * 0.3, 8), color: hoof, pos: [lx, h * 0.15, lz] },
    ]);
  const chicken: Part[] = [
    { geo: ball(0.48, 14, 10), color: C.white, pos: [0, 0.62, -0.05], scale: [1, 0.95, 1.15] },
    { geo: ball(0.34, 12, 9), color: C.white, pos: [0, 1.08, 0.3] },
    { geo: cone(0.12, 0.26, 8), color: C.orange, pos: [0, 1.04, 0.66], rot: [HALF_PI, 0, 0] },
    { geo: ball(0.1, 6, 5), color: C.red, pos: [0, 0.9, 0.56], scale: [1, 1.5, 1] },
    ...[-0.12, 0, 0.12].map((z, i): Part => ({ geo: ball(0.11 + (i === 1 ? 0.03 : 0), 6, 5), color: C.red, pos: [0, 1.42 + (i === 1 ? 0.04 : 0), 0.3 + z] })),
    ...[-1, 1].map((s): Part => ({ geo: ball(0.28, 8, 6), color: 0xf2eee0, pos: [s * 0.44, 0.66, -0.05], scale: [0.35, 0.8, 1.1] })),
    ...[0, 1, 2].map((i): Part => ({ geo: ball(0.16, 6, 5), color: C.white, pos: [(i - 1) * 0.14, 0.95 + (i === 1 ? 0.12 : 0), -0.58], scale: [1, 1.6, 0.8] })),
    ...[-1, 1].flatMap((s): Part[] => [
      { geo: cyl(0.04, 0.04, 0.3, 5), color: C.orange, pos: [s * 0.18, 0.15, 0] },
      { geo: box(0.2, 0.06, 0.3, 0.03, 1), color: C.orange, pos: [s * 0.18, 0.03, 0.08] },
    ]),
  ];
  const pig: Part[] = [
    { geo: capsule(0.56, 0.7), color: C.pink, pos: [0, 0.82, -0.1], rot: [HALF_PI, 0, 0] },
    { geo: ball(0.5, 14, 10), color: C.pink, pos: [0, 1.0, 0.72] },
    { geo: cyl(0.24, 0.26, 0.24, 12), color: C.pinkDark, pos: [0, 0.92, 1.2], rot: [HALF_PI, 0, 0] },
    ...[-1, 1].map((s): Part => ({ geo: ball(0.055, 6, 5), color: C.ink, pos: [s * 0.09, 0.94, 1.33] })),
    ...[-1, 1].map((s): Part => ({ geo: cone(0.17, 0.3, 4), color: C.pinkDark, pos: [s * 0.3, 1.46, 0.62], rot: [0.3, 0, -s * 0.4] })),
    ...legs(0.3, 0.42, 0.42, 0.14, C.pink, C.pinkDark),
    { geo: torus(0.13, 0.045, 10), color: C.pinkDark, pos: [0, 1.05, -1.05], rot: [0, HALF_PI, 0] },
  ];
  const wool = 0xfffaf0, face = 0x4a4566;
  const sheep: Part[] = [
    ...[[0, 0.95, -0.1, 0.62], [0.36, 1.05, 0.2, 0.42], [-0.36, 1.05, 0.2, 0.42], [0.34, 1.0, -0.5, 0.44], [-0.34, 1.0, -0.5, 0.44], [0, 1.4, -0.1, 0.44], [0, 1.25, 0.42, 0.4], [0, 1.0, -0.8, 0.36]]
      .map(([x, y, z, r]): Part => ({ geo: ball(r, 10, 8), color: wool, pos: [x, y, z] })),
    { geo: ball(0.36, 12, 9), color: face, pos: [0, 1.15, 0.84], scale: [0.9, 1, 1.1] },
    { geo: ball(0.24, 8, 6), color: wool, pos: [0, 1.48, 0.72] },
    ...[-1, 1].map((s): Part => ({ geo: ball(0.14, 6, 5), color: face, pos: [s * 0.4, 1.2, 0.72], scale: [1.6, 0.5, 0.8] })),
    ...legs(0.3, 0.4, 0.5, 0.1, face),
  ];
  const cow: Part[] = [
    { geo: box(1.3, 1.1, 2.1, 0.5), color: C.white, pos: [0, 1.35, -0.2] },
    { geo: ball(0.42, 8, 6), color: C.ink, pos: [0.5, 1.6, -0.4], scale: [0.5, 0.9, 1.2] },
    { geo: ball(0.36, 8, 6), color: C.ink, pos: [-0.56, 1.3, 0.2], scale: [0.4, 1, 1] },
    { geo: ball(0.4, 8, 6), color: C.ink, pos: [0.1, 1.86, -0.9], scale: [1.2, 0.35, 1] },
    { geo: box(0.9, 0.85, 0.8, 0.35), color: C.white, pos: [0, 1.75, 1.1] },
    { geo: box(0.74, 0.44, 0.44, 0.2), color: C.pink, pos: [0, 1.52, 1.42] },
    ...[-1, 1].map((s): Part => ({ geo: ball(0.06, 6, 5), color: C.pinkDark, pos: [s * 0.16, 1.56, 1.65] })),
    ...[-1, 1].map((s): Part => ({ geo: cone(0.11, 0.36, 6), color: C.cream, pos: [s * 0.36, 2.28, 1.0], rot: [0, 0, -s * 0.5] })),
    ...[-1, 1].map((s): Part => ({ geo: ball(0.16, 6, 5), color: C.ink, pos: [s * 0.56, 1.98, 0.95], scale: [1.5, 0.6, 0.9] })),
    { geo: ball(0.3, 8, 6), color: C.pink, pos: [0, 0.78, -0.5], scale: [1, 0.7, 1] },
    ...legs(0.42, 0.72, 0.85, 0.16, C.white, C.ink),
    { geo: cyl(0.04, 0.04, 0.8, 5), color: C.white, pos: [0, 1.45, -1.32], rot: [0.5, 0, 0] },
    { geo: ball(0.1, 6, 5), color: C.ink, pos: [0, 1.1, -1.52] },
  ];
  return {
    chicken: { body: merged(chicken), eyes: eyes(0.11, 0.36), eyeY: 1.16, eyeZ: 0.5, height: 1.5 },
    pig: { body: merged(pig), eyes: eyes(0.13, 0.5), eyeY: 1.16, eyeZ: 1.08, height: 1.6 },
    sheep: { body: merged(sheep), eyes: eyes(0.11, 0.36), eyeY: 1.22, eyeZ: 1.14, height: 1.9 },
    cow: { body: merged(cow), eyes: eyes(0.15, 0.56), eyeY: 1.92, eyeZ: 1.44, height: 2.5 },
  };
}

let SPECIES_MODELS: Record<Species, SpeciesModel> | null = null;

class AnimalView {
  readonly root = new THREE.Group();
  private inner = new THREE.Group();
  private eyes: THREE.Mesh;
  private t = Math.random() * 10;
  private pop = 0;
  private squash = 0; private squashV = 0;
  private blink = Math.random() * 3;
  private prevMode = '';
  private tumble = new THREE.Vector3();
  private model: SpeciesModel;

  constructor(a: Animal) {
    this.model = (SPECIES_MODELS ??= buildSpecies())[a.species];
    this.inner.add(mesh(this.model.body, a.golden ? MAT.gold : MAT.vinyl));
    this.eyes = mesh(this.model.eyes, MAT.vinyl, false);
    this.eyes.position.set(0, this.model.eyeY, this.model.eyeZ);
    this.inner.add(this.eyes);
    this.root.add(this.inner);
    if (a.golden) this.root.scale.setScalar(1.25);
  }

  get headHeight(): number { return this.model.height; }

  update(a: Animal, dt: number): void {
    this.t += dt;
    const moving = a.mode === 'flee' || a.mode === 'stampede';
    if (a.mode !== this.prevMode) {
      if (a.mode === 'fly') { this.tumble.set(6 + Math.random() * 6, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6); this.squashV = -6; }
      if (a.mode === 'dizzy') this.squashV = 7;
      if (this.prevMode === 'gone') this.pop = 0;
      if (a.mode === 'flee' && this.prevMode !== 'stampede') this.squashV = -4; // startled hop
      this.prevMode = a.mode;
    }
    this.pop = damp(this.pop, a.mode === 'gone' ? 0 : 1, a.mode === 'gone' ? 18 : 9, dt);
    this.root.visible = this.pop > 0.02;
    if (!this.root.visible) return;
    this.root.position.set(a.x, a.y, a.z);
    this.root.rotation.y = a.heading;

    this.squashV += (-this.squash * 160 - this.squashV * 10) * dt;
    this.squash += this.squashV * dt;
    const sq = THREE.MathUtils.clamp(this.squash, -0.35, 0.45);
    const base = (a.golden ? 1.25 : 1) * this.pop;
    this.root.scale.set(base * (1 + sq * 0.6), base * (1 - sq), base * (1 + sq * 0.6));

    const inner = this.inner;
    if (a.mode === 'fly') {
      inner.rotation.x += this.tumble.x * dt; inner.rotation.y += this.tumble.y * dt; inner.rotation.z += this.tumble.z * dt;
      inner.position.y = this.model.height * 0.4; // tumble around the middle, not the feet
    } else {
      inner.position.y = 0;
      const k = Math.min(1, 12 * dt);
      inner.rotation.x += (0 - inner.rotation.x) * k; inner.rotation.y += (0 - inner.rotation.y) * k;
      if (a.mode === 'dizzy') {
        inner.rotation.z = Math.sin(this.t * 9) * 0.22;
        this.eyes.rotation.z += dt * 14;
      } else {
        this.eyes.rotation.z = 0;
        const rate = moving ? 15 : a.mode === 'walk' ? 8 : 2.2;
        const hop = moving ? 0.28 : a.mode === 'walk' ? 0.1 : 0.03;
        inner.position.y = Math.abs(Math.sin(this.t * rate)) * hop;
        inner.rotation.z = Math.sin(this.t * rate) * (moving ? 0.16 : a.mode === 'walk' ? 0.08 : 0.02);
        // Grazing animals dip their heads now and then.
        if (a.mode === 'graze') inner.rotation.x = Math.max(0, Math.sin(this.t * 0.9 + a.id)) * 0.22;
      }
    }
    // Wide-eyed when scared, blinking when calm.
    this.blink -= dt;
    if (this.blink < -0.1) this.blink = 1 + Math.random() * 4;
    const eye = moving || a.mode === 'fly' ? 1.45 : this.blink < 0 ? 0.1 : 1;
    this.eyes.scale.set(moving || a.mode === 'fly' ? 1.3 : 1, damp(this.eyes.scale.y, eye, 25, dt), 1);
  }
}

// ------------------------------------------------------------------ farmer

function buildFarmer(): { group: THREE.Group; fist: THREE.Object3D; head: THREE.Object3D; wheels: THREE.Object3D[] } {
  const group = new THREE.Group();
  group.add(mesh(merged([
    { geo: box(1.5, 1.0, 2.6, 0.3), color: 0x4cc45a, pos: [0, 1.5, 0.5] },
    { geo: box(1.7, 0.5, 1.6, 0.2), color: 0x3aa84a, pos: [0, 1.15, -0.9] },
    { geo: box(1.3, 0.9, 0.2, 0.08), color: C.ink, pos: [0, 1.5, 1.82] },
    { geo: cyl(0.1, 0.1, 1.3, 8), color: C.steel, pos: [0.45, 2.5, 1.2] },
    { geo: cyl(0.16, 0.12, 0.3, 8), color: C.ink, pos: [0.45, 3.2, 1.2] },
    { geo: box(1.2, 0.2, 0.9, 0.08), color: C.barn, pos: [0, 1.55, -1.0] },
    { geo: box(1.2, 0.9, 0.2, 0.08), color: C.barn, pos: [0, 2.0, -1.5] },
    { geo: cyl(0.05, 0.05, 0.8, 6), color: C.ink, pos: [0, 2.1, -0.15], rot: [0.6, 0, 0] },
    { geo: torus(0.3, 0.05, 14), color: C.ink, pos: [0, 2.45, -0.38], rot: [0.6 - HALF_PI, 0, 0] },
    // Grumpy headlight eyes on the tractor itself.
    ...[-1, 1].flatMap((s): Part[] => [
      { geo: ball(0.24, 10, 8), color: C.sun, pos: [s * 0.45, 1.6, 1.86] },
      { geo: box(0.4, 0.1, 0.1, 0.03, 1), color: C.ink, pos: [s * 0.45, 1.86, 1.95], rot: [0, 0, s * 0.45] },
    ]),
  ]), MAT.vinyl));
  const wheelGeo = (r: number, w: number) => merged([
    { geo: cyl(r, r, w, 16), color: C.tyre, rot: [0, 0, HALF_PI] },
    { geo: cyl(r * 0.55, r * 0.55, w + 0.06, 12), color: C.sun, rot: [0, 0, HALF_PI] },
    ...Array.from({ length: 10 }, (_, i): Part => ({ geo: box(w * 0.9, r * 0.24, r * 0.3, 0.04, 1), color: C.tyreLight, pos: [0, Math.cos((i / 10) * TAU) * r, Math.sin((i / 10) * TAU) * r], rot: [(i / 10) * TAU, 0, 0] })),
  ]);
  const big = wheelGeo(1.15, 0.6), small = wheelGeo(0.65, 0.4);
  const wheels: THREE.Object3D[] = [];
  for (const [x, y, z, g] of [[1.1, 1.15, -0.9, big], [-1.1, 1.15, -0.9, big], [0.85, 0.65, 1.3, small], [-0.85, 0.65, 1.3, small]] as const) {
    const w = mesh(g, MAT.vinyl);
    w.position.set(x, y, z);
    group.add(w);
    wheels.push(w);
  }
  // The farmer: round, red-faced, straw hat, magnificent moustache.
  const man = new THREE.Group();
  man.position.set(0, 1.75, -1.0);
  man.add(mesh(merged([
    { geo: capsule(0.42, 0.5), color: C.denim, pos: [0, 0.6, 0] },
    { geo: box(0.5, 0.5, 0.1, 0.05, 1), color: 0x6f9bf0, pos: [0, 0.75, 0.4] },
    ...[-1, 1].map((s): Part => ({ geo: ball(0.05, 6, 5), color: C.sun, pos: [s * 0.18, 0.92, 0.46] })),
    { geo: capsule(0.13, 0.5), color: C.red, pos: [-0.5, 0.75, 0.2], rot: [1.0, 0, 0.3] },
  ]), MAT.vinyl));
  const head = new THREE.Group();
  head.position.set(0, 1.42, 0);
  head.add(mesh(merged([
    { geo: ball(0.42, 14, 10), color: 0xffb08a, pos: [0, 0, 0] },
    { geo: ball(0.13, 8, 6), color: 0xff8a6a, pos: [0, -0.04, 0.42] },
    { geo: ball(0.11, 10, 8), color: C.white, pos: [-0.16, 0.1, 0.36] }, { geo: ball(0.11, 10, 8), color: C.white, pos: [0.16, 0.1, 0.36] },
    { geo: ball(0.06, 6, 5), color: C.black, pos: [-0.15, 0.1, 0.45] }, { geo: ball(0.06, 6, 5), color: C.black, pos: [0.15, 0.1, 0.45] },
    { geo: box(0.26, 0.08, 0.08, 0.03, 1), color: C.ink, pos: [-0.17, 0.26, 0.4], rot: [0, 0, -0.5] },
    { geo: box(0.26, 0.08, 0.08, 0.03, 1), color: C.ink, pos: [0.17, 0.26, 0.4], rot: [0, 0, 0.5] },
    { geo: ball(0.14, 8, 6), color: C.white, pos: [-0.14, -0.16, 0.4], scale: [1.4, 0.6, 0.7] },
    { geo: ball(0.14, 8, 6), color: C.white, pos: [0.14, -0.16, 0.4], scale: [1.4, 0.6, 0.7] },
    { geo: cyl(0.75, 0.75, 0.06, 16), color: C.hayDark, pos: [0, 0.3, 0] },
    { geo: cyl(0.36, 0.42, 0.34, 14), color: C.hay, pos: [0, 0.48, 0] },
    { geo: cyl(0.43, 0.43, 0.09, 14), color: C.barn, pos: [0, 0.36, 0] },
  ]), MAT.vinyl));
  man.add(head);
  const fist = new THREE.Group();
  fist.position.set(0.5, 1.0, 0);
  fist.add(mesh(merged([
    { geo: capsule(0.13, 0.6), color: C.red, pos: [0, 0.4, 0] },
    { geo: ball(0.2, 8, 6), color: 0xffb08a, pos: [0, 0.85, 0] },
  ]), MAT.vinyl));
  man.add(fist);
  group.add(man);
  return { group, fist, head, wheels };
}

// ------------------------------------------------------------------ manager

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

export class Critters {
  readonly group = new THREE.Group();
  readonly farmerPos = new THREE.Vector3();
  private animals = new Map<number, AnimalView>();
  private farmer = buildFarmer();
  private farmerT = 0;
  private coins: THREE.InstancedMesh;
  private fuel = new Map<number, THREE.Object3D>();
  private fuelGeo: THREE.BufferGeometry;
  private cornGeo: THREE.BufferGeometry;
  private glowMat = new THREE.MeshStandardMaterial({ color: 0x4dff9a, emissive: 0x2bff88, emissiveIntensity: 0.9, roughness: 0.3 });
  private beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  private t = 0;

  constructor() {
    this.farmer.group.visible = false;
    this.group.add(this.farmer.group);
    const coinGeo = merged([
      { geo: cyl(0.55, 0.55, 0.14, 18), color: C.gold, rot: [HALF_PI, 0, 0] },
      { geo: cyl(0.4, 0.4, 0.18, 18), color: 0xffe680, rot: [HALF_PI, 0, 0] },
    ]);
    this.coins = new THREE.InstancedMesh(coinGeo, MAT.gold, 160);
    this.coins.frustumCulled = false;
    this.coins.castShadow = true;
    this.coins.count = 0;
    this.group.add(this.coins);
    this.fuelGeo = merged([
      { geo: capsule(0.42, 0.7), color: 0, pos: [0, 0, 0] },
      { geo: cyl(0.14, 0.14, 0.3, 8), color: 0, pos: [0, 0.85, 0] },
      { geo: torus(0.44, 0.07, 14), color: 0, pos: [0, 0.1, 0], rot: [HALF_PI, 0, 0] },
    ]);
    this.cornGeo = merged([
      { geo: ball(0.42, 12, 9), color: C.gold, pos: [0, 0, 0], scale: [1, 2.1, 1] },
      { geo: cone(0.5, 1.0, 6), color: C.leaf, pos: [0, -0.5, 0], rot: [Math.PI, 0, 0] },
      { geo: box(0.2, 1.1, 0.5, 0.05, 1), color: C.leaf, pos: [0.42, -0.2, 0], rot: [0, 0, -0.5] },
      { geo: box(0.2, 1.1, 0.5, 0.05, 1), color: C.leaf, pos: [-0.42, -0.2, 0], rot: [0, 0, 0.5] },
    ]);
  }

  animalView(id: number): AnimalView | undefined { return this.animals.get(id); }

  sync(animals: readonly Animal[], pickups: readonly Pickup[], farmer: Farmer, dt: number): void {
    this.t += dt;
    // Animals.
    const seen = new Set<number>();
    for (const a of animals) {
      seen.add(a.id);
      let v = this.animals.get(a.id);
      if (!v) { v = new AnimalView(a); this.animals.set(a.id, v); this.group.add(v.root); }
      v.update(a, dt);
    }
    for (const [id, v] of this.animals) if (!seen.has(id)) { v.root.removeFromParent(); this.animals.delete(id); }

    // Pickups: coins are instanced, the rest are a handful of meshes.
    let n = 0;
    const live = new Set<number>();
    for (const p of pickups) {
      if (p.cool > 0) continue;
      const bob = Math.sin(this.t * 3 + p.id) * 0.18;
      if (p.kind === 'coin') {
        if (n >= 160) continue;
        const fade = Math.min(1, p.life / 2); // dropped coins blink out
        _m.compose(_p.set(p.x, p.y + bob, p.z), _q.setFromEuler(_e.set(0, this.t * 3 + p.id, 0)), _s.setScalar(fade < 1 ? fade * (0.6 + 0.4 * Math.abs(Math.sin(this.t * 12))) : 1));
        this.coins.setMatrixAt(n++, _m);
        continue;
      }
      live.add(p.id);
      let o = this.fuel.get(p.id);
      if (!o) {
        o = new THREE.Group();
        if (p.kind === 'fuel') o.add(mesh(this.fuelGeo, this.glowMat));
        else {
          o.add(mesh(this.cornGeo, MAT.gold));
          const beam = new THREE.Mesh(cyl(0.5, 1.4, 26, 10).translate(0, 13, 0), this.beamMat);
          o.add(beam);
        }
        this.fuel.set(p.id, o);
        this.group.add(o);
      }
      o.position.set(p.x, p.y + bob, p.z);
      o.rotation.y = this.t * 2 + p.id;
      o.rotation.z = p.kind === 'fuel' ? 0.3 : 0.15;
      const pulse = 1 + Math.sin(this.t * 5 + p.id) * 0.08;
      o.scale.setScalar(pulse * (p.life < 3 ? Math.max(0.2, p.life / 3) : 1));
    }
    this.coins.count = n;
    this.coins.instanceMatrix.needsUpdate = true;
    for (const [id, o] of this.fuel) if (!live.has(id)) { o.removeFromParent(); this.fuel.delete(id); }

    // Farmer.
    const f = this.farmer, g = f.group;
    g.visible = farmer.mode !== 'away';
    if (!g.visible) return;
    this.farmerT += dt;
    const t = this.farmerT;
    const y = groundHeight(farmer.x, farmer.z);
    const rev = farmer.mode === 'warn' ? Math.sin(t * 40) * 0.05 : Math.abs(Math.sin(t * 9)) * 0.08 * Math.min(1, farmer.speed / 6);
    g.position.set(farmer.x, y + rev, farmer.z);
    g.rotation.set(0, farmer.heading, farmer.mode === 'stunned' ? Math.sin(t * 20) * 0.08 : 0);
    this.farmerPos.set(farmer.x, y + 3.6, farmer.z);
    for (const w of f.wheels) w.rotation.x += farmer.speed * dt;
    const angry = farmer.mode === 'chase' || farmer.mode === 'stuck' || farmer.mode === 'warn';
    f.fist.rotation.z = angry ? -0.4 + Math.sin(t * (farmer.mode === 'stuck' ? 22 : 13)) * 0.5 : farmer.mode === 'laugh' ? -2.4 : 0.6;
    f.fist.rotation.x = angry ? -0.6 : 0;
    f.head.position.y = 1.42 + (farmer.mode === 'laugh' ? Math.abs(Math.sin(t * 14)) * 0.14 : 0);
    f.head.rotation.z = farmer.mode === 'stunned' ? Math.sin(t * 16) * 0.4 : 0;
    f.head.rotation.x = farmer.mode === 'laugh' ? -0.35 : 0;
  }

  clear(): void {
    for (const v of this.animals.values()) v.root.removeFromParent();
    this.animals.clear();
    for (const o of this.fuel.values()) o.removeFromParent();
    this.fuel.clear();
    this.coins.count = 0;
    this.farmer.group.visible = false;
  }
}
