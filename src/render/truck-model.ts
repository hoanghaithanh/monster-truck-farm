// The hero: a procedural toy monster truck whose silhouette changes
// dramatically with every upgrade tier on every axis.
import * as THREE from 'three';
import { damp, lerp, TAU } from '../core/math';
import { PAINTS, type Decal, type Loadout } from '../core/parts';
import { C, MAT, ball, box, capsule, cone, cyl, merged, mesh, torus, type Part } from './kit';

export interface TruckLook { loadout: Loadout; paint: number; decal: Decal }

const WHEEL_R = [0.85, 1.05, 1.3, 1.6];
const WHEEL_W = [0.7, 0.85, 1.1, 1.35];
const LIFT = [0.3, 0.45, 0.65, 0.85];
const BODY_W = [2.3, 2.45, 2.65, 2.85];
const BODY_L = [4.5, 4.7, 5.0, 5.3];
const RIM_COLOR = [C.cream, C.red, C.sun, 0x33f0ff];
const NEON = 0x33f0ff;

const HALF_PI = Math.PI / 2;

function wheelGeometry(R: number, W: number, tier: number): THREE.BufferGeometry {
  // Fat rounded tyre (lathe), chunky alternating tread blocks, deep-dish rim.
  const pts: THREE.Vector2[] = [];
  const rIn = R * 0.52, sh = Math.min(W * 0.32, R * 0.3);
  pts.push(new THREE.Vector2(rIn, -W / 2), new THREE.Vector2(R - sh, -W / 2));
  for (let i = 1; i <= 5; i++) { const a = (i / 5) * HALF_PI; pts.push(new THREE.Vector2(R - sh + Math.sin(a) * sh, -W / 2 + sh - Math.cos(a) * sh)); }
  for (let i = 0; i <= 5; i++) { const a = (i / 5) * HALF_PI; pts.push(new THREE.Vector2(R - sh + Math.cos(a) * sh, W / 2 - sh + Math.sin(a) * sh)); }
  pts.push(new THREE.Vector2(rIn, W / 2));
  const parts: Part[] = [{ geo: new THREE.LatheGeometry(pts, 22), color: C.tyre, rot: [0, 0, HALF_PI] }];
  const n = 12 + tier * 2, tH = R * (0.1 + tier * 0.02);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, side = i % 2 ? 1 : -1;
    parts.push({
      geo: box(W * 0.56, tH * 2, ((TAU * R) / n) * 0.62, 0.05, 1), color: C.tyreLight,
      pos: [side * W * 0.22, Math.cos(a) * (R - tH * 0.2), Math.sin(a) * (R - tH * 0.2)], rot: [a, 0, side * 0.0],
    });
  }
  // Rim on both faces so it reads from any side.
  for (const s of [-1, 1]) {
    parts.push({ geo: cyl(rIn * 1.02, rIn * 1.02, 0.12, 18), color: RIM_COLOR[tier], pos: [s * W * 0.36, 0, 0], rot: [0, 0, HALF_PI] });
    parts.push({ geo: torus(rIn * 0.98, 0.07, 18), color: C.chrome, pos: [s * W * 0.42, 0, 0], rot: [0, HALF_PI, 0] });
    parts.push({ geo: ball(rIn * 0.34, 10, 8), color: C.chrome, pos: [s * W * 0.4, 0, 0], scale: [0.6, 1, 1] });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      parts.push({ geo: cyl(rIn * 0.17, rIn * 0.17, 0.14, 8), color: C.ink, pos: [s * W * 0.37, Math.cos(a) * rIn * 0.62, Math.sin(a) * rIn * 0.62], rot: [0, 0, HALF_PI] });
    }
  }
  return merged(parts);
}

function decalTexture(kind: Decal): THREE.CanvasTexture | null {
  if (kind === 'none' || typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d')!;
  g.lineJoin = 'round';
  if (kind === 'flames') {
    const layer = (color: string, scale: number, wob: number) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, 128);
      g.lineTo(0, 128 - 118 * scale);
      for (let i = 0; i < 5; i++) {
        const x0 = 40 + i * 78 * scale, tipX = x0 + (150 + i * 26) * scale, y = 128 - (112 - i * 20) * scale + wob;
        g.bezierCurveTo(x0 + 40, y - 12, tipX - 50, y - 20, tipX, y + 6);
        g.bezierCurveTo(tipX - 60, y + 12, x0 + 60, y + 14, x0 + 34, y + 26);
      }
      g.lineTo(0, 128);
      g.fill();
    };
    layer('#ff3b1f', 1, 0); layer('#ff9a1f', 0.8, 6); layer('#ffe14a', 0.55, 12);
  } else if (kind === 'bolt') {
    g.fillStyle = '#ffe14a'; g.strokeStyle = '#ffffff'; g.lineWidth = 10;
    g.beginPath();
    for (const [x, y] of [[20, 30], [200, 20], [150, 58], [330, 50], [270, 84], [500, 70], [240, 118], [290, 86], [110, 96], [170, 62]]) g.lineTo(x, y);
    g.closePath(); g.stroke(); g.fill();
  } else if (kind === 'stars') {
    const star = (cx: number, cy: number, r: number, color: string) => {
      g.fillStyle = color; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - HALF_PI, rr = i % 2 ? r * 0.45 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    };
    star(70, 64, 54, '#ffffff'); star(70, 64, 42, '#ffe14a'); star(190, 44, 34, '#ffffff'); star(280, 84, 28, '#ffe14a'); star(360, 50, 22, '#ffffff'); star(430, 80, 16, '#ffe14a'); star(486, 56, 11, '#ffffff');
  } else {
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) { g.beginPath(); const x = 30 + i * 120; g.moveTo(x, 128); g.lineTo(x + 70, 0); g.lineTo(x + 70 + 70 - i * 18, 0); g.lineTo(x + 70 - i * 18, 128); g.fill(); }
    g.fillStyle = '#ffe14a'; g.fillRect(0, 54, 512, 20);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export interface TruckPose {
  /** Signed forward speed and smoothed steer -1..1. */
  speed: number; steer: number;
  throttle: number; boosting: boolean; grounded: boolean;
  /** 0..1 nitro left. */
  nitro: number;
  /** Per-wheel ground offsets relative to the truck origin plane: FL, FR, RL, RR. */
  wheelLift?: [number, number, number, number];
  /** Sideways slip for body roll. */
  slip: number;
}

export class TruckModel {
  readonly group = new THREE.Group();
  /** Local-space wheel contact points (FL, FR, RL, RR) and exhaust tips. */
  readonly wheelPoints: THREE.Vector3[] = [];
  readonly exhausts: THREE.Vector3[] = [];
  readonly wheelRadius: number;
  readonly halfTrack: number;
  readonly halfBase: number;

  private body = new THREE.Group();
  private wheels: { pivot: THREE.Group; spin: THREE.Object3D; front: boolean; lift: number }[] = [];
  private eyes = new THREE.Group();
  private pupils: THREE.Mesh;
  private flames: THREE.Mesh[] = [];
  private glow: THREE.MeshStandardMaterial[] = [];
  private lamps: THREE.MeshStandardMaterial;
  private owned: { geo: THREE.BufferGeometry[]; mat: THREE.Material[]; tex: THREE.Texture[] } = { geo: [], mat: [], tex: [] };
  private bounce = 0; private bounceV = 0; private squash = 0; private squashV = 0;
  private pitch = 0; private roll = 0; private blink = 2; private time = 0; private baseY: number;

  constructor(look: TruckLook) {
    const { body: bt, wheels: wt, engine: et, tank: tt } = look.loadout;
    const R = (this.wheelRadius = WHEEL_R[wt]), WW = WHEEL_W[wt];
    const W = BODY_W[bt], L = BODY_L[bt];
    const base = (this.baseY = R + LIFT[wt]); // underside of the tub
    this.halfTrack = W / 2 + WW / 2 + 0.12;
    this.halfBase = L * 0.33;
    const paintColor = PAINTS[look.paint % PAINTS.length].color;
    const paint = this.own(new THREE.MeshPhysicalMaterial({ color: paintColor, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }));
    this.lamps = this.own(new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xffe680, emissiveIntensity: 1.2, roughness: 0.3 }));
    const neon = this.own(new THREE.MeshBasicMaterial({ color: NEON, toneMapped: false }));
    const add = (parent: THREE.Object3D, parts: Part[], mat: THREE.Material, shadows = true) => {
      if (!parts.length) return null;
      const m = mesh(this.ownGeo(merged(parts)), mat, shadows);
      parent.add(m);
      return m;
    };

    // ---- running gear (does not bounce with the body)
    const gear: Part[] = [
      { geo: box(W * 0.45, 0.3, this.halfBase * 2 + 1, 0.1, 1), color: C.ink, pos: [0, base - 0.25, 0] },
    ];
    const chromeGear: Part[] = [];
    for (const z of [this.halfBase, -this.halfBase]) {
      gear.push({ geo: cyl(0.16, 0.16, this.halfTrack * 2, 8), color: C.steel, pos: [0, R, z], rot: [0, 0, HALF_PI] });
      chromeGear.push({ geo: ball(0.4, 10, 8), color: C.chrome, pos: [0, R, z] });
      for (const s of [-1, 1]) {
        // Tall coil-over shocks: the taller the lift, the more they show.
        const top = base + 0.2, x = s * (W / 2 - 0.1), len = top - R;
        gear.push({ geo: cyl(0.2, 0.2, len, 10), color: wt >= 2 ? C.red : C.sun, pos: [x + s * 0.18, R + len / 2, z], rot: [0, 0, s * -0.22] });
        chromeGear.push({ geo: cyl(0.08, 0.08, len + 0.3, 6), color: C.chrome, pos: [x + s * 0.18, R + len / 2, z], rot: [0, 0, s * -0.22] });
        gear.push({ geo: box(0.14, 0.14, this.halfBase + 0.2, 0.04, 1), color: C.steel, pos: [s * W * 0.2, (R + base) / 2 - 0.1, z / 2], rot: [Math.sign(z) * Math.atan2(base - 0.25 - R, this.halfBase), 0, 0] });
      }
    }
    add(this.group, gear, MAT.vinyl);
    add(this.group, chromeGear, MAT.chrome);

    const wheelGeo = this.ownGeo(wheelGeometry(R, WW, wt));
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * this.halfTrack, R, sz * this.halfBase);
      const spin = mesh(wheelGeo, MAT.vinyl);
      pivot.add(spin);
      if (wt === 3) { // glowing rims on the top tier
        for (const s of [-1, 1]) {
          const ring = new THREE.Mesh(this.ownGeo(torus(R * 0.4, 0.05, 20)), neon);
          ring.rotation.y = HALF_PI; ring.position.x = s * WW * 0.45;
          spin.add(ring);
        }
      }
      this.group.add(pivot);
      this.wheels.push({ pivot, spin, front: sz > 0, lift: 0 });
      this.wheelPoints.push(new THREE.Vector3(sx * this.halfTrack, 0, sz * this.halfBase));
    }

    // ---- body
    this.body.position.y = base;
    this.group.add(this.body);
    const P: Part[] = []; // painted
    const D: Part[] = []; // detail (vertex colours)
    const K: Part[] = []; // chrome
    const G: Part[] = []; // glass
    const E: Part[] = []; // emissive lamps
    const N: Part[] = []; // neon
    const cabZ = L * 0.04, cabL = L * 0.36, cabH = 0.95 + bt * 0.05;
    P.push({ geo: box(W, 1.0, L, 0.36), color: 0, pos: [0, 0.5, 0] });
    P.push({ geo: box(W * 0.9, cabH, cabL, 0.36), color: 0, pos: [0, 1.0 + cabH / 2 - 0.15, cabZ] });
    G.push({ geo: box(W * 0.8, cabH * 0.58, cabL + 0.04, 0.2), color: 0, pos: [0, 1.0 + cabH / 2 - 0.08, cabZ] });
    G.push({ geo: box(W * 0.9 + 0.04, cabH * 0.5, cabL * 0.66, 0.16), color: 0, pos: [0, 1.0 + cabH / 2 - 0.06, cabZ] });
    // Truck bed.
    D.push({ geo: box(W * 0.8, 0.12, L * 0.3, 0.05, 1), color: C.ink, pos: [0, 1.0, -L * 0.31] });
    // Face: chrome bumper, toothy grin grille.
    K.push({ geo: box(W + 0.25, 0.34, 0.5, 0.15), color: 0, pos: [0, 0.16, L / 2 + 0.05] });
    K.push({ geo: box(W + 0.25, 0.34, 0.5, 0.15), color: 0, pos: [0, 0.16, -L / 2 - 0.05] });
    D.push({ geo: box(W * 0.5, 0.36, 0.12, 0.1), color: C.ink, pos: [0, 0.5, L / 2 + 0.005] });
    for (let i = 0; i < 5; i++) D.push({ geo: box(W * 0.075, 0.2, 0.1, 0.03, 1), color: C.white, pos: [(i - 2) * W * 0.09, 0.56, L / 2 + 0.04] });
    // Tail lights + tailgate panel.
    D.push({ geo: box(W * 0.6, 0.5, 0.08, 0.05, 1), color: C.ink, pos: [0, 0.6, -L / 2 - 0.005] });
    for (const s of [-1, 1]) D.push({ geo: box(0.34, 0.5, 0.12, 0.08), color: C.red, pos: [s * (W / 2 - 0.3), 0.62, -L / 2 - 0.01] });
    // Side steps + mirrors.
    for (const s of [-1, 1]) {
      K.push({ geo: box(0.25, 0.1, L * 0.36, 0.04, 1), color: 0, pos: [s * (W / 2 + 0.08), 0.02, cabZ] });
      P.push({ geo: box(0.3, 0.22, 0.16, 0.06, 1), color: 0, pos: [s * (W / 2 + 0.1), 1.25, cabZ + cabL / 2 - 0.1] });
    }
    if (bt >= 1) { // Bruiser: fender flares, bull bar, roll bar with spot lamps
      for (const s of [-1, 1]) for (const z of [this.halfBase, -this.halfBase]) P.push({ geo: box(0.5, 0.3, R * 1.7, 0.14), color: 0, pos: [s * (W / 2 + 0.12), 0.62, z] });
      for (const s of [-1, 1]) K.push({ geo: cyl(0.07, 0.07, 0.9, 6), color: 0, pos: [s * W * 0.3, 0.55, L / 2 + 0.3] });
      K.push({ geo: cyl(0.07, 0.07, W * 0.75, 6), color: 0, pos: [0, 1.0, L / 2 + 0.3], rot: [0, 0, HALF_PI] });
      K.push({ geo: cyl(0.07, 0.07, W * 0.75, 6), color: 0, pos: [0, 0.6, L / 2 + 0.3], rot: [0, 0, HALF_PI] });
      const rz = cabZ - cabL / 2 - 0.25, top = 1.0 + cabH + 0.2;
      for (const s of [-1, 1]) K.push({ geo: cyl(0.09, 0.09, top - 0.9, 8), color: 0, pos: [s * W * 0.36, (top + 0.9) / 2, rz] });
      K.push({ geo: cyl(0.09, 0.09, W * 0.72 + 0.18, 8), color: 0, pos: [0, top, rz], rot: [0, 0, HALF_PI] });
      for (const s of [-1, 1]) E.push({ geo: ball(0.2, 10, 8), color: 0, pos: [s * W * 0.2, top + 0.2, rz + 0.05] });
    }
    if (bt >= 2) { // Crusher: roof light bar, spoiler lip, hood stripes
      const y = 1.0 + cabH - 0.1;
      D.push({ geo: box(W * 0.78, 0.16, 0.3, 0.06, 1), color: C.ink, pos: [0, y + 0.08, cabZ + cabL * 0.3] });
      for (let i = 0; i < 5; i++) E.push({ geo: box(W * 0.12, 0.2, 0.22, 0.08), color: 0, pos: [(i - 2) * W * 0.155, y + 0.2, cabZ + cabL * 0.3 + 0.06] });
      for (const s of [-1, 1]) D.push({ geo: box(0.22, 0.03, L * 0.3, 0.01, 1), color: C.white, pos: [s * 0.3, 1.005, L * 0.33] });
      P.push({ geo: box(W * 0.95, 0.12, 0.6, 0.05, 1), color: 0, pos: [0, 1.25, -L / 2 + 0.2], rot: [0.25, 0, 0] });
    }
    if (bt >= 3) { // Titan: big wing, neon underglow + trim, gold details
      for (const s of [-1, 1]) K.push({ geo: box(0.12, 1.1, 0.5, 0.04, 1), color: 0, pos: [s * W * 0.33, 1.6, -L / 2 + 0.35], rot: [-0.2, 0, 0] });
      P.push({ geo: box(W * 1.15, 0.14, 1.0, 0.06, 1), color: 0, pos: [0, 2.2, -L / 2 + 0.2], rot: [0.18, 0, 0] });
      for (const s of [-1, 1]) P.push({ geo: box(0.12, 0.5, 1.0, 0.05, 1), color: 0, pos: [s * W * 0.575, 2.3, -L / 2 + 0.2], rot: [0.18, 0, 0] });
      for (const s of [-1, 1]) N.push({ geo: box(0.06, 0.08, L * 0.9, 0.02, 1), color: 0, pos: [s * (W / 2 + 0.005), 0.1, 0] });
      N.push({ geo: box(W * 0.9, 0.06, 0.06, 0.02, 1), color: 0, pos: [0, 0.1, L / 2 + 0.005] });
      N.push({ geo: box(W * 0.9, 0.06, 0.06, 0.02, 1), color: 0, pos: [0, 0.1, -L / 2 - 0.005] });
      N.push({ geo: box(W * 0.7, 0.04, L * 0.8, 0.02, 1), color: 0, pos: [0, -0.32, 0] });
    }

    // ---- engine: grows out of the hood
    const hz = L * 0.31, hy = 1.0;
    const pipe = (x: number, y: number, z: number, len: number, r: number, rot: [number, number, number], flame: number) => {
      K.push({ geo: cyl(r, r * 0.85, len, 10), color: 0, pos: [x, y, z], rot });
      const tip = new THREE.Vector3(0, len / 2, 0).applyEuler(new THREE.Euler(...rot)).add(new THREE.Vector3(x, y, z));
      this.exhausts.push(tip.clone().add(new THREE.Vector3(0, base, 0)));
      if (flame > 0) {
        const f = new THREE.Mesh(this.ownGeo(cone(r * 1.3, flame, 8).translate(0, flame / 2, 0)), this.own(new THREE.MeshBasicMaterial({ color: 0xffb030, toneMapped: false, transparent: true, opacity: 0.9 })));
        f.position.copy(tip); f.rotation.set(...rot);
        f.userData.len = 1;
        this.body.add(f);
        this.flames.push(f);
      }
    };
    if (et === 0) {
      P.push({ geo: box(W * 0.3, 0.16, 0.8, 0.07), color: 0, pos: [0, hy + 0.04, hz] });
      pipe(W / 2 - 0.25, 0.05, -L / 2 - 0.15, 0.5, 0.1, [-HALF_PI, 0, 0], 0);
    } else if (et === 1) {
      D.push({ geo: box(0.8, 0.3, 0.9, 0.08), color: C.steel, pos: [0, hy + 0.1, hz] });
      K.push({ geo: cyl(0.48, 0.48, 0.22, 16), color: 0, pos: [0, hy + 0.36, hz] });
      D.push({ geo: cyl(0.4, 0.4, 0.26, 16), color: C.red, pos: [0, hy + 0.36, hz] });
      for (const s of [-1, 1]) pipe(s * (W / 2 + 0.12), 0.2, cabZ - 0.3, 1.5, 0.13, [-HALF_PI, 0, 0], 0.5);
    } else {
      const k = et === 3 ? 1.3 : 1;
      D.push({ geo: box(1.0 * k, 0.4, 1.3 * k, 0.1), color: C.steel, pos: [0, hy + 0.12, hz] });
      K.push({ geo: box(0.8 * k, 0.5 * k, 1.0 * k, 0.12), color: 0, pos: [0, hy + 0.5 * k, hz] });
      for (let i = 0; i < 4; i++) D.push({ geo: box(0.84 * k, 0.06, 0.08, 0.02, 1), color: C.ink, pos: [0, hy + 0.5 * k, hz - 0.36 * k + i * 0.24 * k] });
      // Bug-catcher scoop with a gaping mouth.
      P.push({ geo: box(0.86 * k, 0.5 * k, 0.9 * k, 0.16), color: 0, pos: [0, hy + 0.98 * k, hz + 0.02] });
      D.push({ geo: box(0.66 * k, 0.3 * k, 0.1, 0.06), color: C.ink, pos: [0, hy + 1.0 * k, hz + 0.45 * k] });
      K.push({ geo: cyl(0.22 * k, 0.22 * k, 0.14, 12), color: 0, pos: [0, hy + 0.42 * k, hz + 0.72 * k], rot: [HALF_PI, 0, 0] });
      for (const s of [-1, 1]) {
        for (let i = 0; i < 4; i++) pipe(s * (0.62 * k + i * 0.02), hy + 0.42, hz - 0.42 * k + i * 0.28 * k, 0.95 * k, 0.085 * k, [0.25, 0, -s * 0.95], i % 2 === 0 ? 0.55 * k : 0);
      }
      const stacks = et === 3 ? 2 : 1;
      for (const s of [-1, 1]) for (let i = 0; i < stacks; i++) pipe(s * (W / 2 - 0.2 - i * 0.34), 1.9, cabZ - cabL / 2 - 0.5 - i * 0.05, 2.0 + bt * 0.1, 0.15, [0, 0, 0], 0.7);
      if (et === 3) { // rocket nozzles out the back
        for (const s of [-1, 1]) {
          K.push({ geo: cyl(0.3, 0.3, 1.5, 14), color: 0, pos: [s * W * 0.27, 1.45, -L / 2 + 0.45], rot: [HALF_PI, 0, 0] });
          D.push({ geo: cyl(0.33, 0.33, 0.2, 14), color: C.red, pos: [s * W * 0.27, 1.45, -L / 2 + 0.9], rot: [HALF_PI, 0, 0] });
          pipe(s * W * 0.27, 1.45, -L / 2 - 0.45, 0.5, 0.38, [-HALF_PI, 0, 0], 1.5);
        }
      }
    }

    // ---- nitro tank: sits in the bed, glows brighter the fuller it is
    const bz = -L * 0.31, by = 1.06;
    const glowMat = (color: number) => {
      const m = this.own(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.25 }));
      this.glow.push(m);
      return m;
    };
    if (tt <= 1) {
      for (let i = 0; i <= tt; i++) {
        const x = tt === 0 ? 0 : (i - 0.5) * 0.8;
        D.push({ geo: box(0.55, 0.7, 0.35, 0.1), color: C.red, pos: [x, by + 0.35, bz] });
        D.push({ geo: cyl(0.09, 0.09, 0.16, 8), color: C.sun, pos: [x + 0.14, by + 0.76, bz] });
        D.push({ geo: box(0.3, 0.08, 0.1, 0.03, 1), color: C.ink, pos: [x - 0.08, by + 0.74, bz] });
      }
    } else if (tt === 2) {
      const parts: Part[] = [];
      for (const s of [-1, 1]) {
        parts.push({ geo: capsule(0.3, 0.95), color: 0, pos: [s * 0.42, by + 0.42, bz], rot: [HALF_PI - 0.35, 0, 0] });
        K.push({ geo: cyl(0.12, 0.12, 0.25, 8), color: 0, pos: [s * 0.42, by + 0.72, bz + 0.72], rot: [HALF_PI - 0.35, 0, 0] });
        K.push({ geo: torus(0.31, 0.04, 14), color: 0, pos: [s * 0.42, by + 0.42, bz], rot: [-0.35, 0, 0] });
      }
      add(this.body, parts, glowMat(0x3aa8ff));
    } else {
      add(this.body, [
        { geo: capsule(0.52, W * 0.42), color: 0, pos: [0, by + 0.6, bz], rot: [0, 0, HALF_PI] },
        { geo: ball(0.3, 10, 8), color: 0, pos: [0, by + 1.15, bz] },
      ], glowMat(0x7dff5a));
      for (const s of [-1, 1]) {
        K.push({ geo: torus(0.54, 0.06, 16), color: 0, pos: [s * W * 0.14, by + 0.6, bz], rot: [0, HALF_PI, 0] });
        K.push({ geo: cyl(0.07, 0.07, L * 0.3, 6), color: 0, pos: [s * 0.3, by + 0.9, bz + L * 0.16], rot: [HALF_PI - 0.15, 0, 0] });
      }
      D.push({ geo: box(W * 0.6, 0.2, 0.9, 0.06, 1), color: C.ink, pos: [0, by + 0.08, bz] });
    }

    add(this.body, P, paint);
    add(this.body, D, MAT.vinyl);
    add(this.body, K, MAT.chrome);
    add(this.body, G, MAT.glass);
    add(this.body, E, this.lamps);
    add(this.body, N, neon, false);

    // ---- googly headlight eyes (blink + look where you steer)
    const er = 0.3 + bt * 0.015;
    this.eyes.position.set(0, 0.62, L / 2 - 0.1);
    const whites: Part[] = [], pupils: Part[] = [];
    for (const s of [-1, 1]) {
      whites.push({ geo: ball(er, 14, 10), color: C.white, pos: [s * W * 0.33, 0, 0] });
      pupils.push({ geo: ball(er * 0.55, 10, 8), color: C.black, pos: [s * W * 0.33, 0, er * 0.62] });
      pupils.push({ geo: ball(er * 0.2, 6, 5), color: C.white, pos: [s * W * 0.33 + er * 0.2, er * 0.25, er * 1.05] });
    }
    add(this.eyes, whites, MAT.vinyl);
    this.pupils = add(this.eyes, pupils, MAT.vinyl)!;
    this.body.add(this.eyes);

    // ---- decals on both flanks
    const tex = decalTexture(look.decal);
    if (tex) {
      this.owned.tex.push(tex);
      const dm = this.own(new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.35, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
      const dg = this.ownGeo(new THREE.PlaneGeometry(L * 0.72, 0.62));
      for (const s of [-1, 1]) {
        const d = new THREE.Mesh(dg, dm);
        d.position.set(s * (W / 2 + 0.006), 0.52, 0.1);
        d.rotation.y = s * HALF_PI;
        d.scale.x = s; // flames always lick rearward
        this.body.add(d);
      }
    }
  }

  private own<T extends THREE.Material>(m: T): T { this.owned.mat.push(m); return m; }
  private ownGeo<T extends THREE.BufferGeometry>(g: T): T { this.owned.geo.push(g); return g; }

  /** Suspension kick: positive = body slams down (landing), negative = hop. */
  kick(amount: number): void { this.bounceV -= amount; this.squashV += amount * 0.6; }

  update(dt: number, p: TruckPose): void {
    this.time += dt;
    // Wheels roll, steer and hug the ground individually.
    const lifts = p.wheelLift ?? [0, 0, 0, 0];
    this.wheels.forEach((w, i) => {
      w.spin.rotation.x += (p.speed / this.wheelRadius) * dt;
      if (w.front) w.pivot.rotation.y = damp(w.pivot.rotation.y, -p.steer * 0.5, 14, dt);
      w.lift = damp(w.lift, p.grounded ? lifts[i] : -0.3, 18, dt);
      w.pivot.position.y = this.wheelRadius + w.lift;
    });
    // Body follows the wheel plane with a soft spring, leans in corners, squats under power.
    const front = (lifts[0] + lifts[1]) / 2, rear = (lifts[2] + lifts[3]) / 2, left = (lifts[0] + lifts[2]) / 2, right = (lifts[1] + lifts[3]) / 2;
    const targetPitch = p.grounded ? Math.atan2(rear - front, this.halfBase * 2) - p.throttle * 0.035 - (p.boosting ? 0.07 : 0) : 0;
    const targetRoll = p.grounded ? Math.atan2(left - right, this.halfTrack * 2) + p.slip * 0.018 + p.steer * Math.min(1, Math.abs(p.speed) / 14) * 0.09 : 0;
    this.pitch = damp(this.pitch, targetPitch, 9, dt);
    this.roll = damp(this.roll, targetRoll, 7, dt);
    const targetY = p.grounded ? (front + rear) / 2 : 0;
    this.bounceV += (-(this.bounce - targetY) * 130 - this.bounceV * 11) * dt;
    this.bounce += this.bounceV * dt;
    this.squashV += (-this.squash * 220 - this.squashV * 14) * dt;
    this.squash += this.squashV * dt;
    const idle = Math.sin(this.time * 22) * 0.012 * (1 - Math.min(1, Math.abs(p.speed) / 6)); // engine shiver
    this.body.position.y = this.baseY + THREE.MathUtils.clamp(this.bounce, -0.5, 0.6) + idle;
    this.body.rotation.set(this.pitch, 0, this.roll);
    const sq = THREE.MathUtils.clamp(this.squash, -0.25, 0.25);
    this.body.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);

    // Eyes.
    this.blink -= dt;
    if (this.blink < -0.12) this.blink = 1.5 + Math.random() * 3.5;
    this.eyes.scale.y = damp(this.eyes.scale.y, this.blink < 0 ? 0.08 : p.boosting ? 1.25 : 1, 30, dt);
    this.pupils.position.x = damp(this.pupils.position.x, -p.steer * 0.1, 10, dt);

    // Fire and glow.
    const heat = p.boosting ? 1 : Math.max(0, p.throttle) * 0.35;
    for (const f of this.flames) {
      const flick = 0.75 + Math.random() * 0.5;
      const len = (f.userData.len = damp(f.userData.len, heat, 12, dt));
      f.scale.set(0.6 + len * 0.6, Math.max(0.001, len * flick * (p.boosting ? 1.8 : 1)), 0.6 + len * 0.6);
      f.visible = len > 0.03;
      (f.material as THREE.MeshBasicMaterial).color.setHex(p.boosting ? 0x66d9ff : 0xffb030);
    }
    for (const g of this.glow) g.emissiveIntensity = lerp(0.15, 1.1, p.nitro) + Math.sin(this.time * 6) * 0.12 + (p.boosting ? 0.8 : 0);
    this.lamps.emissiveIntensity = p.boosting ? 2.4 : 1.2;
  }

  dispose(): void {
    for (const g of this.owned.geo) g.dispose();
    for (const m of this.owned.mat) m.dispose();
    for (const t of this.owned.tex) t.dispose();
    this.group.removeFromParent();
  }
}
