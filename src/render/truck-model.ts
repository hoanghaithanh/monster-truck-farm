// The hero: a procedural toy monster truck. Six body types, four armour kits,
// four wheel sizes, four engines, four nitro tanks, and a working suspension:
// solid axles that articulate, coil-over shocks that compress and extend, and
// link bars that follow, all driven by the per-wheel ground heights.
import * as THREE from 'three';
import { damp, lerp, TAU } from '../core/math';
import { PAINTS, type Decal, type Finish, type Loadout, type TruckId } from '../core/parts';
import { C, MAT, ball, box, capsule, cone, cyl, merged, mesh, torus, type Part } from './kit';

export interface TruckLook { loadout: Loadout; truck: TruckId; paint: number; decal: Decal; finish: Finish }

const WHEEL_R = [0.85, 1.05, 1.3, 1.6];
const WHEEL_W = [0.7, 0.85, 1.1, 1.35];
const LIFT = [0.42, 0.6, 0.82, 1.05];
const RIM_COLOR = [C.cream, C.red, C.sun, 0x33f0ff];
const SHOCK_COLOR = [C.sun, C.orange, C.red, 0x33f0ff];
const NEON = 0x33f0ff;
const HALF_PI = Math.PI / 2;
const DIMS: Record<TruckId, { W: number; L: number }> = {
  pickup: { W: 2.4, L: 4.7 }, buggy: { W: 2.2, L: 4.3 }, bus: { W: 2.5, L: 5.7 },
  shark: { W: 2.4, L: 5.2 }, dino: { W: 2.5, L: 5.0 }, bull: { W: 2.7, L: 4.8 },
};

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
    parts.push({ geo: box(W * 0.56, tH * 2, ((TAU * R) / n) * 0.62, 0.05, 1), color: C.tyreLight, pos: [side * W * 0.22, Math.cos(a) * (R - tH * 0.2), Math.sin(a) * (R - tH * 0.2)], rot: [a, 0, 0] });
  }
  for (const s of [-1, 1]) { // rim on both faces so it reads from any side
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

class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(private r: number, private turns: number) { super(); }
  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = t * this.turns * TAU;
    return target.set(Math.cos(a) * this.r, t, Math.sin(a) * this.r);
  }
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
  } else if (kind === 'stripes') {
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) { g.beginPath(); const x = 30 + i * 120; g.moveTo(x, 128); g.lineTo(x + 70, 0); g.lineTo(x + 70 + 70 - i * 18, 0); g.lineTo(x + 70 - i * 18, 128); g.fill(); }
    g.fillStyle = '#ffe14a'; g.fillRect(0, 54, 512, 20);
  } else if (kind === 'tiger') {
    g.fillStyle = '#2b2440';
    for (let i = 0; i < 9; i++) {
      const x = 20 + i * 56, top = i % 2 === 0;
      g.beginPath();
      g.moveTo(x, top ? 0 : 128); g.quadraticCurveTo(x + 34, 64, x + 10 + (i % 3) * 8, top ? 104 : 24); g.quadraticCurveTo(x + 52, 64, x + 30, top ? 0 : 128);
      g.fill();
    }
  } else if (kind === 'rainbow') {
    const cols = ['#ff3b3b', '#ff8a1f', '#ffd21f', '#5fd83a', '#2fa8ff', '#8f5bff'];
    cols.forEach((c, i) => {
      g.strokeStyle = c; g.lineWidth = 13;
      g.beginPath(); g.moveTo(-10, 36 + i * 12); g.bezierCurveTo(140, -10 + i * 12, 300, 100 + i * 12, 522, 30 + i * 12); g.stroke();
    });
  } else {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 3; y++) {
      if ((x + y) % 2) continue;
      g.fillStyle = '#ffffff'; g.fillRect(x * 32 + y * 6, 22 + y * 28, 30, 26);
    }
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 0, 512, 0);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.7, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade; g.fillRect(0, 0, 512, 128);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Where bolt-ons attach, in body-local space (y = 0 is the underside of the tub). */
interface Anchors {
  roofY: number; roofRear: number; roofFront: number; roofW: number;
  hoodY: number; hoodZ: number; bedY: number; bedZ: number;
  eye: { y: number; z: number; gap: number; r: number };
  decal: { y: number; h: number; len: number; z: number };
  /** Draw angry eyebrows over the headlight eyes. */
  brows?: boolean;
}
interface Bins { P: Part[]; D: Part[]; K: Part[]; G: Part[]; E: Part[] }

/** Bumpers, tail lights and side steps every body shares. */
function commonTrim(b: Bins, W: number, L: number): void {
  b.K.push({ geo: box(W + 0.25, 0.34, 0.5, 0.15), color: 0, pos: [0, 0.16, L / 2 + 0.05] });
  b.K.push({ geo: box(W + 0.25, 0.34, 0.5, 0.15), color: 0, pos: [0, 0.16, -L / 2 - 0.05] });
  for (const s of [-1, 1]) b.D.push({ geo: box(0.34, 0.5, 0.12, 0.08), color: C.red, pos: [s * (W / 2 - 0.3), 0.62, -L / 2 - 0.01] });
  // Frame rails under the tub so the suspension has something to hang from.
  for (const s of [-1, 1]) b.D.push({ geo: box(0.2, 0.22, L * 0.86, 0.06, 1), color: C.ink, pos: [s * W * 0.24, -0.14, 0] });
  for (const z of [-L * 0.3, 0, L * 0.3]) b.D.push({ geo: box(W * 0.5, 0.16, 0.18, 0.05, 1), color: C.ink, pos: [0, -0.14, z] });
}
function grin(b: Bins, W: number, L: number): void {
  b.D.push({ geo: box(W * 0.5, 0.36, 0.12, 0.1), color: C.ink, pos: [0, 0.5, L / 2 + 0.005] });
  for (let i = 0; i < 5; i++) b.D.push({ geo: box(W * 0.075, 0.2, 0.1, 0.03, 1), color: C.white, pos: [(i - 2) * W * 0.09, 0.56, L / 2 + 0.04] });
}

const BODIES: Record<TruckId, (b: Bins, W: number, L: number) => Anchors> = {
  pickup(b, W, L) {
    const cabZ = L * 0.04, cabL = L * 0.36, cabH = 1.0;
    b.P.push({ geo: box(W, 1.0, L, 0.36), color: 0, pos: [0, 0.5, 0] });
    b.P.push({ geo: box(W * 0.9, cabH, cabL, 0.36), color: 0, pos: [0, 0.85 + cabH / 2, cabZ] });
    b.G.push({ geo: box(W * 0.8, cabH * 0.58, cabL + 0.04, 0.2), color: 0, pos: [0, 0.92 + cabH / 2, cabZ] });
    b.G.push({ geo: box(W * 0.9 + 0.04, cabH * 0.5, cabL * 0.66, 0.16), color: 0, pos: [0, 0.94 + cabH / 2, cabZ] });
    b.D.push({ geo: box(W * 0.8, 0.12, L * 0.3, 0.05, 1), color: C.ink, pos: [0, 1.0, -L * 0.31] });
    b.D.push({ geo: box(W * 0.6, 0.5, 0.08, 0.05, 1), color: C.ink, pos: [0, 0.6, -L / 2 - 0.005] });
    for (const s of [-1, 1]) {
      b.K.push({ geo: box(0.25, 0.1, L * 0.36, 0.04, 1), color: 0, pos: [s * (W / 2 + 0.08), 0.02, cabZ] });
      b.P.push({ geo: box(0.3, 0.22, 0.16, 0.06, 1), color: 0, pos: [s * (W / 2 + 0.1), 1.25, cabZ + cabL / 2 - 0.1] });
    }
    grin(b, W, L);
    return { roofY: 0.85 + cabH, roofRear: cabZ - cabL / 2, roofFront: cabZ + cabL / 2, roofW: W * 0.9, hoodY: 1.0, hoodZ: L * 0.31, bedY: 1.06, bedZ: -L * 0.31, eye: { y: 0.62, z: L / 2 - 0.1, gap: W * 0.66, r: 0.3 }, decal: { y: 0.52, h: 0.62, len: L * 0.72, z: 0.1 } };
  },

  buggy(b, W, L) {
    // Low open tub, wedge nose, full roll cage, and a chick at the wheel.
    b.P.push({ geo: box(W, 0.7, L, 0.3), color: 0, pos: [0, 0.35, 0] });
    b.P.push({ geo: box(W * 0.84, 0.5, L * 0.36, 0.2), color: 0, pos: [0, 0.72, L * 0.3], rot: [0.22, 0, 0] });
    b.P.push({ geo: box(W * 0.9, 0.34, L * 0.28, 0.14), color: 0, pos: [0, 0.78, -L * 0.34] });
    b.D.push({ geo: box(W * 0.6, 0.2, 0.9, 0.08), color: C.ink, pos: [0, 0.74, -0.25] });
    b.D.push({ geo: box(W * 0.6, 0.9, 0.22, 0.1), color: C.ink, pos: [0, 1.15, -0.72] });
    b.D.push({ geo: cyl(0.04, 0.04, 0.6, 6), color: C.ink, pos: [0, 1.05, 0.42], rot: [-0.7, 0, 0] });
    b.D.push({ geo: torus(0.26, 0.05, 14), color: C.ink, pos: [0, 1.28, 0.22], rot: [-0.7 + HALF_PI, 0, 0] });
    const top = 2.25, zf = 0.62, zr = -0.95, x = W * 0.42;
    for (const s of [-1, 1]) {
      b.K.push({ geo: cyl(0.08, 0.08, top - 0.6, 8), color: 0, pos: [s * x, (top + 0.6) / 2, zr] });
      b.K.push({ geo: cyl(0.08, 0.08, top - 0.55, 8), color: 0, pos: [s * x, (top + 0.7) / 2, zf + 0.3], rot: [-0.38, 0, 0] });
      b.K.push({ geo: cyl(0.08, 0.08, zf - zr + 0.1, 8), color: 0, pos: [s * x, top, (zf + zr) / 2], rot: [HALF_PI, 0, 0] });
      b.K.push({ geo: cyl(0.06, 0.06, 1.9, 8), color: 0, pos: [s * x, 1.45, zr - 0.62], rot: [0.72, 0, 0] });
    }
    for (const z of [zf, zr]) b.K.push({ geo: cyl(0.08, 0.08, x * 2, 8), color: 0, pos: [0, top, z], rot: [0, 0, HALF_PI] });
    // The driver.
    b.D.push({ geo: ball(0.36, 12, 9), color: C.sun, pos: [0, 1.5, -0.3] });
    b.D.push({ geo: ball(0.42, 12, 9), color: C.sun, pos: [0, 0.98, -0.3], scale: [1, 0.8, 0.9] });
    b.D.push({ geo: cone(0.1, 0.22, 6), color: C.orange, pos: [0, 1.46, 0.08], rot: [HALF_PI, 0, 0] });
    for (const s of [-1, 1]) { b.D.push({ geo: ball(0.09, 8, 6), color: C.white, pos: [s * 0.14, 1.6, -0.02] }); b.D.push({ geo: ball(0.05, 6, 5), color: C.black, pos: [s * 0.14, 1.6, 0.06] }); }
    grin(b, W, L);
    return { roofY: top, roofRear: zr + 0.2, roofFront: zf, roofW: x * 2, hoodY: 0.88, hoodZ: L * 0.3, bedY: 0.96, bedZ: -L * 0.34, eye: { y: 0.62, z: L / 2 - 0.1, gap: W * 0.62, r: 0.28 }, decal: { y: 0.36, h: 0.5, len: L * 0.8, z: 0 } };
  },

  bus(b, W, L) {
    const cz = -L * 0.1, cl = L * 0.76, ch = 1.5;
    b.P.push({ geo: box(W, 1.0, L, 0.3), color: 0, pos: [0, 0.5, 0] });
    b.P.push({ geo: box(W * 0.98, ch, cl, 0.3), color: 0, pos: [0, 0.9 + ch / 2, cz] });
    b.G.push({ geo: box(W * 0.98 + 0.05, 0.6, cl * 0.9, 0.12), color: 0, pos: [0, 1.85, cz] });
    b.G.push({ geo: box(W * 0.84, 0.7, cl + 0.05, 0.14), color: 0, pos: [0, 1.82, cz] });
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) b.P.push({ geo: box(0.1, 0.66, 0.14, 0.03, 1), color: 0, pos: [s * (W * 0.49 + 0.03), 1.85, cz - cl * 0.42 + i * cl * 0.168] });
    for (const y of [0.72, 1.12]) b.D.push({ geo: box(W + 0.03, 0.09, L * 0.92, 0.02, 1), color: C.ink, pos: [0, y, 0] });
    // Flip-out stop sign and amber roof lamps.
    b.D.push({ geo: cyl(0.42, 0.42, 0.08, 8), color: C.red, pos: [-(W / 2 + 0.12), 1.35, 0.9], rot: [0, 0, HALF_PI] });
    b.D.push({ geo: cyl(0.26, 0.26, 0.1, 8), color: C.white, pos: [-(W / 2 + 0.12), 1.35, 0.9], rot: [0, 0, HALF_PI] });
    for (const s of [-1, 1]) for (const z of [cz + cl / 2 - 0.12, cz - cl / 2 + 0.12]) b.E.push({ geo: ball(0.16, 8, 6), color: 0, pos: [s * W * 0.3, 0.9 + ch - 0.12, z] });
    b.D.push({ geo: box(W * 0.62, 0.42, 0.08, 0.05, 1), color: C.ink, pos: [0, 0.6, -L / 2 - 0.005] });
    grin(b, W, L);
    return { roofY: 0.9 + ch, roofRear: cz - cl / 2 + 0.5, roofFront: cz + cl / 2 - 0.35, roofW: W * 0.98, hoodY: 1.0, hoodZ: L * 0.4, bedY: 0.92 + ch, bedZ: -L * 0.3, eye: { y: 0.62, z: L / 2 - 0.1, gap: W * 0.66, r: 0.3 }, decal: { y: 0.42, h: 0.5, len: L * 0.8, z: 0 } };
  },

  shark(b, W, L) {
    b.P.push({ geo: box(W, 1.0, L * 0.8, 0.4), color: 0, pos: [0, 0.5, -L * 0.1] });
    b.P.push({ geo: box(W * 0.86, 0.75, L * 0.56, 0.36), color: 0, pos: [0, 1.2, -L * 0.14] });
    b.P.push({ geo: cone(W * 0.5, L * 0.42, 14), color: 0, pos: [0, 0.56, L * 0.4], rot: [HALF_PI, 0, 0], scale: [1, 1, 0.8] });
    b.D.push({ geo: box(W * 0.88, 0.3, L * 0.74, 0.14), color: C.cream, pos: [0, 0.1, -L * 0.08] });
    // Mouth full of teeth.
    b.D.push({ geo: box(W * 0.62, 0.16, 0.9, 0.06), color: 0x8a1f2b, pos: [0, 0.3, L * 0.38] });
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * W * 0.1;
      b.D.push({ geo: cone(0.09, 0.26, 4), color: C.white, pos: [x, 0.3, L * 0.5 - Math.abs(i - 2.5) * 0.12], rot: [Math.PI, 0, 0] });
      if (i % 2) b.D.push({ geo: cone(0.08, 0.2, 4), color: C.white, pos: [x, 0.16, L * 0.47 - Math.abs(i - 2.5) * 0.12] });
    }
    // Fins and tail.
    b.P.push({ geo: cone(0.85, 1.5, 3), color: 0, pos: [0, 2.2, -L * 0.04], rot: [-0.3, HALF_PI, 0], scale: [1, 1, 0.22] });
    for (const s of [-1, 1]) b.P.push({ geo: cone(0.55, 1.3, 3), color: 0, pos: [s * (W / 2 + 0.45), 0.55, L * 0.08], rot: [0.3, 0, -s * 1.25], scale: [1, 1, 0.2] });
    b.P.push({ geo: cone(0.7, 1.7, 3), color: 0, pos: [0, 1.5, -L / 2 - 0.25], rot: [-0.55, HALF_PI, 0], scale: [1, 1, 0.2] });
    b.P.push({ geo: cone(0.5, 1.0, 3), color: 0, pos: [0, 0.45, -L / 2 - 0.3], rot: [Math.PI + 0.7, HALF_PI, 0], scale: [1, 1, 0.2] });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.D.push({ geo: box(0.05, 0.42, 0.09, 0.02, 1), color: C.ink, pos: [s * (W / 2 + 0.005), 0.62, L * 0.14 - i * 0.24], rot: [0.3, 0, 0] });
    return { roofY: 1.57, roofRear: -L * 0.4, roofFront: L * 0.1, roofW: W * 0.86, hoodY: 0.98, hoodZ: L * 0.2, bedY: 1.58, bedZ: -L * 0.31, eye: { y: 0.82, z: L * 0.33, gap: W * 0.8, r: 0.22 }, decal: { y: 0.6, h: 0.5, len: L * 0.5, z: -L * 0.2 }, brows: true };
  },

  dino(b, W, L) {
    b.P.push({ geo: box(W, 1.0, L * 0.9, 0.4), color: 0, pos: [0, 0.5, -L * 0.05] });
    b.P.push({ geo: box(W * 0.86, 0.8, L * 0.52, 0.4), color: 0, pos: [0, 1.3, -L * 0.16] });
    b.D.push({ geo: box(W * 0.8, 0.26, L * 0.8, 0.12), color: C.cream, pos: [0, 0.08, -L * 0.04] });
    // Head: big upper skull, hinged-looking jaw, lots of teeth.
    const hz = L * 0.36;
    b.P.push({ geo: box(W * 0.8, 0.85, 1.7, 0.36), color: 0, pos: [0, 1.22, hz] });
    b.P.push({ geo: box(W * 0.7, 0.3, 1.5, 0.13), color: 0, pos: [0, 0.42, hz + 0.1] });
    b.D.push({ geo: box(W * 0.6, 0.3, 1.3, 0.08), color: 0x8a1f2b, pos: [0, 0.68, hz + 0.1] });
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * W * 0.12;
      b.D.push({ geo: cone(0.1, 0.28, 4), color: C.white, pos: [x, 0.72, hz + 0.78], rot: [Math.PI, 0, 0] });
      if (i > 0 && i < 5) b.D.push({ geo: cone(0.09, 0.22, 4), color: C.white, pos: [x + W * 0.06, 0.62, hz + 0.8] });
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) b.D.push({ geo: cone(0.09, 0.24, 4), color: C.white, pos: [s * W * 0.33, 0.72, hz + 0.2 - i * 0.3], rot: [Math.PI, 0, 0] });
      b.D.push({ geo: ball(0.07, 6, 5), color: C.ink, pos: [s * 0.22, 1.42, hz + 0.86] });
      // Tiny T-rex arms.
      b.P.push({ geo: capsule(0.11, 0.45), color: 0, pos: [s * (W / 2 + 0.08), 0.78, L * 0.12], rot: [-0.9, 0, 0] });
      b.D.push({ geo: cone(0.07, 0.18, 4), color: C.white, pos: [s * (W / 2 + 0.08), 0.56, L * 0.12 + 0.34], rot: [HALF_PI + 0.5, 0, 0] });
    }
    // Spikes down the spine, tail at the back.
    for (let i = 0; i < 7; i++) {
      const z = hz + 0.4 - i * 0.62, y = i < 2 ? 1.64 : i < 6 ? 1.7 : 1.05;
      b.D.push({ geo: cone(0.2, 0.5 - Math.abs(i - 3) * 0.04, 4), color: C.orange, pos: [0, y + 0.2, z], rot: [0, Math.PI / 4, 0] });
    }
    b.P.push({ geo: ball(0.55, 10, 8), color: 0, pos: [0, 0.8, -L / 2 - 0.15], scale: [1, 0.9, 1.3] });
    b.P.push({ geo: ball(0.38, 10, 8), color: 0, pos: [0, 1.05, -L / 2 - 0.85], scale: [1, 0.9, 1.4] });
    b.P.push({ geo: cone(0.26, 0.9, 8), color: 0, pos: [0, 1.36, -L / 2 - 1.5], rot: [-HALF_PI + 0.45, 0, 0] });
    return { roofY: 1.66, roofRear: -L * 0.4, roofFront: hz + 0.25, roofW: W * 0.8, hoodY: 1.7, hoodZ: -L * 0.02, bedY: 1.72, bedZ: -L * 0.3, eye: { y: 1.62, z: hz + 0.42, gap: W * 0.6, r: 0.25 }, decal: { y: 0.5, h: 0.56, len: L * 0.6, z: -L * 0.12 }, brows: true };
  },

  bull(b, W, L) {
    const a = BODIES.pickup(b, W, L);
    // Horns, nose ring, ears, shoulder hump, tail.
    for (const s of [-1, 1]) {
      b.D.push({ geo: cone(0.24, 1.2, 8), color: C.cream, pos: [s * (W * 0.5 + 0.5), 1.25, L * 0.32], rot: [0, 0, -s * 1.15] });
      b.D.push({ geo: cone(0.15, 0.8, 8), color: C.cream, pos: [s * (W * 0.5 + 1.08), 1.72, L * 0.32], rot: [0, 0, -s * 0.25] });
      b.P.push({ geo: box(0.5, 0.2, 0.3, 0.08), color: 0, pos: [s * (W * 0.5 + 0.18), 0.95, L * 0.18], rot: [0, 0, -s * 0.4] });
      b.D.push({ geo: ball(0.09, 6, 5), color: C.ink, pos: [s * 0.2, 0.32, L / 2 + 0.32] });
    }
    b.P.push({ geo: box(W * 0.5, 0.5, 0.5, 0.2), color: 0, pos: [0, 0.38, L / 2 + 0.12] });
    b.D.push({ geo: torus(0.24, 0.06, 14), color: C.gold, pos: [0, 0.14, L / 2 + 0.4] });
    b.P.push({ geo: ball(0.9, 12, 9), color: 0, pos: [0, 1.3, -L * 0.26], scale: [1.1, 0.6, 1.0] });
    b.D.push({ geo: cyl(0.05, 0.05, 1.0, 6), color: C.ink, pos: [0, 0.75, -L / 2 - 0.5], rot: [0.9, 0, 0] });
    b.D.push({ geo: ball(0.2, 8, 6), color: C.ink, pos: [0, 0.42, -L / 2 - 0.9], scale: [1, 1.6, 1] });
    return { ...a, brows: true };
  },
};

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

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
/** Lay a unit-height (+Y) mesh between two points. */
function stretch(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void {
  _d.subVectors(b, a);
  const len = Math.max(0.05, _d.length());
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, _d.divideScalar(len));
  m.scale.set(1, len, 1);
}

interface Strut { mesh: THREE.Object3D; wheel: number; axle: THREE.Vector3; mount: THREE.Vector3 }

export class TruckModel {
  readonly group = new THREE.Group();
  /** Local-space wheel contact points (FL, FR, RL, RR) and exhaust tips. */
  readonly wheelPoints: THREE.Vector3[] = [];
  readonly exhausts: THREE.Vector3[] = [];
  readonly wheelRadius: number;
  readonly halfTrack: number;
  readonly halfBase: number;
  /** Rough size, for framing the showroom camera. */
  readonly length: number;
  readonly height: number;

  private body = new THREE.Group();
  private wheels: { pivot: THREE.Group; spin: THREE.Object3D; front: boolean; lift: number }[] = [];
  private axles: THREE.Object3D[] = [];
  private struts: Strut[] = [];
  private eyes = new THREE.Group();
  private pupils: THREE.Mesh;
  private flames: THREE.Mesh[] = [];
  private glow: THREE.MeshStandardMaterial[] = [];
  private lamps: THREE.MeshStandardMaterial;
  private owned: { geo: THREE.BufferGeometry[]; mat: THREE.Material[]; tex: THREE.Texture[] } = { geo: [], mat: [], tex: [] };
  private bounce = 0; private bounceV = 0; private squash = 0; private squashV = 0;
  private pitch = 0; private roll = 0; private blink = 2; private time = 0; private baseY: number;

  constructor(look: TruckLook) {
    const { body: at, wheels: wt, engine: et, tank: tt } = look.loadout;
    const R = (this.wheelRadius = WHEEL_R[wt]), WW = WHEEL_W[wt];
    const { W, L } = DIMS[look.truck];
    const base = (this.baseY = R + LIFT[wt]); // underside of the tub
    this.halfTrack = W / 2 + WW / 2 + 0.12;
    this.halfBase = L * 0.33;
    this.length = L;
    const paintColor = PAINTS[look.paint % PAINTS.length].color;
    const finish = { gloss: { metalness: 0.35, roughness: 0.3, clearcoat: 1 }, metal: { metalness: 0.92, roughness: 0.24, clearcoat: 0.5 }, matte: { metalness: 0, roughness: 0.85, clearcoat: 0 } }[look.finish];
    const paint = this.own(new THREE.MeshPhysicalMaterial({ color: paintColor, clearcoatRoughness: 0.08, ...finish }));
    this.lamps = this.own(new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xffe680, emissiveIntensity: 1.2, roughness: 0.3 }));
    const neon = this.own(new THREE.MeshBasicMaterial({ color: NEON, toneMapped: false }));
    const add = (parent: THREE.Object3D, parts: Part[], mat: THREE.Material, shadows = true) => {
      if (!parts.length) return null;
      const m = mesh(this.ownGeo(merged(parts)), mat, shadows);
      parent.add(m);
      return m;
    };

    // ---- running gear: solid axles + wheels (they move independently of the body)
    const axleGeo = this.ownGeo(merged([
      { geo: cyl(0.17, 0.17, this.halfTrack * 2 - WW * 0.5, 10), color: C.steel, rot: [0, 0, HALF_PI] },
      { geo: ball(0.4, 12, 9), color: C.steel, scale: [1.2, 1, 1] },
      { geo: cyl(0.2, 0.2, 0.2, 10), color: C.red, pos: [0, 0, -0.34], rot: [HALF_PI, 0, 0] },
    ]));
    for (const sz of [1, -1]) {
      const axle = mesh(axleGeo, MAT.vinyl);
      axle.position.set(0, R, sz * this.halfBase);
      if (sz < 0) axle.rotation.y = Math.PI;
      this.group.add(axle);
      this.axles.push(axle);
    }
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

    // ---- suspension: coil-overs and link bars stretched between axle and frame every frame
    const springMat = this.own(new THREE.MeshStandardMaterial({ color: SHOCK_COLOR[wt], roughness: 0.35, metalness: 0.2, emissive: wt === 3 ? NEON : 0, emissiveIntensity: wt === 3 ? 0.5 : 0 }));
    const springGeo = this.ownGeo(new THREE.TubeGeometry(new Helix(0.22, 6), 66, 0.07, 6));
    const rodGeo = this.ownGeo(cyl(0.1, 0.1, 1, 8).translate(0, 0.5, 0));
    const barGeo = this.ownGeo(cyl(0.06, 0.06, 1, 6).translate(0, 0.5, 0));
    const inner = this.halfTrack - WW / 2 - 0.22;
    const shocksPerWheel = wt >= 2 ? 2 : 1;
    this.wheels.forEach((w, i) => {
      const sx = Math.sign(w.pivot.position.x), sz = Math.sign(w.pivot.position.z);
      for (let k = 0; k < shocksPerWheel; k++) {
        const dz = shocksPerWheel === 1 ? 0 : (k - 0.5) * 0.5;
        const axle = new THREE.Vector3(sx * inner, 0, sz * this.halfBase + dz);
        const mount = new THREE.Vector3(sx * (W / 2 - 0.3), 0.72, sz * this.halfBase * 0.86 + dz);
        for (const [geo, mat] of [[springGeo, springMat], [rodGeo, MAT.chrome]] as const) {
          const m = mesh(geo, mat);
          this.group.add(m);
          this.struts.push({ mesh: m, wheel: i, axle, mount });
        }
      }
      // Link bar from the frame, mid-truck, down to the axle.
      const bar = mesh(barGeo, MAT.chrome);
      this.group.add(bar);
      this.struts.push({ mesh: bar, wheel: i, axle: new THREE.Vector3(sx * inner * 0.7, 0, sz * this.halfBase), mount: new THREE.Vector3(sx * W * 0.24, -0.14, sz * this.halfBase * 0.12) });
    });

    // ---- body
    this.body.position.y = base;
    this.group.add(this.body);
    const P: Part[] = [], D: Part[] = [], K: Part[] = [], G: Part[] = [], E: Part[] = [], N: Part[] = [];
    const A = BODIES[look.truck]({ P, D, K, G, E }, W, L);
    commonTrim({ P, D, K, G, E }, W, L);
    this.height = base + A.roofY;

    // ---- armour kit bolt-ons
    if (at >= 1) { // fender flares, bull bar, roll hoop with spot lamps
      for (const s of [-1, 1]) for (const z of [this.halfBase, -this.halfBase]) P.push({ geo: box(0.5, 0.3, R * 1.7, 0.14), color: 0, pos: [s * (W / 2 + 0.12), 0.62, z] });
      for (const s of [-1, 1]) K.push({ geo: cyl(0.07, 0.07, 0.9, 6), color: 0, pos: [s * W * 0.3, 0.55, L / 2 + 0.36] });
      for (const y of [1.0, 0.6]) K.push({ geo: cyl(0.07, 0.07, W * 0.75, 6), color: 0, pos: [0, y, L / 2 + 0.36], rot: [0, 0, HALF_PI] });
      const rz = A.roofRear - 0.25, top = A.roofY + 0.3;
      for (const s of [-1, 1]) K.push({ geo: cyl(0.09, 0.09, top - 0.8, 8), color: 0, pos: [s * A.roofW * 0.42, (top + 0.8) / 2, rz] });
      K.push({ geo: cyl(0.09, 0.09, A.roofW * 0.84 + 0.18, 8), color: 0, pos: [0, top, rz], rot: [0, 0, HALF_PI] });
      for (const s of [-1, 1]) E.push({ geo: ball(0.2, 10, 8), color: 0, pos: [s * A.roofW * 0.24, top + 0.2, rz + 0.05] });
    }
    if (at >= 2) { // roof light bar, spoiler lip
      const y = A.roofY, z = A.roofFront - 0.3;
      D.push({ geo: box(A.roofW * 0.86, 0.16, 0.3, 0.06, 1), color: C.ink, pos: [0, y + 0.08, z] });
      for (let i = 0; i < 5; i++) E.push({ geo: box(A.roofW * 0.13, 0.2, 0.22, 0.08), color: 0, pos: [(i - 2) * A.roofW * 0.17, y + 0.2, z + 0.06] });
      P.push({ geo: box(W * 0.95, 0.12, 0.6, 0.05, 1), color: 0, pos: [0, 1.22, -L / 2 + 0.2], rot: [0.25, 0, 0] });
    }
    if (at >= 3) { // big wing, neon underglow + trim
      const wy = Math.max(2.2, A.roofY + 0.45);
      for (const s of [-1, 1]) K.push({ geo: box(0.12, wy - 1.0, 0.5, 0.04, 1), color: 0, pos: [s * W * 0.33, (wy + 1.0) / 2, -L / 2 + 0.35], rot: [-0.15, 0, 0] });
      P.push({ geo: box(W * 1.15, 0.14, 1.0, 0.06, 1), color: 0, pos: [0, wy, -L / 2 + 0.2], rot: [0.18, 0, 0] });
      for (const s of [-1, 1]) P.push({ geo: box(0.12, 0.5, 1.0, 0.05, 1), color: 0, pos: [s * W * 0.575, wy + 0.1, -L / 2 + 0.2], rot: [0.18, 0, 0] });
      for (const s of [-1, 1]) N.push({ geo: box(0.06, 0.08, L * 0.9, 0.02, 1), color: 0, pos: [s * (W / 2 + 0.005), 0.1, 0] });
      for (const s of [-1, 1]) N.push({ geo: box(W * 0.9, 0.06, 0.06, 0.02, 1), color: 0, pos: [0, 0.1, s * (L / 2 + 0.005)] });
      N.push({ geo: box(W * 0.7, 0.04, L * 0.8, 0.02, 1), color: 0, pos: [0, -0.3, 0] });
    }

    // ---- engine: grows out of the hood
    const hz = A.hoodZ, hy = A.hoodY;
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
    const stackZ = A.roofRear - 0.5;
    if (et === 0) {
      P.push({ geo: box(W * 0.3, 0.16, 0.8, 0.07), color: 0, pos: [0, hy + 0.04, hz] });
      pipe(W / 2 - 0.25, 0.05, -L / 2 - 0.15, 0.5, 0.1, [-HALF_PI, 0, 0], 0);
    } else if (et === 1) {
      D.push({ geo: box(0.8, 0.3, 0.9, 0.08), color: C.steel, pos: [0, hy + 0.1, hz] });
      K.push({ geo: cyl(0.48, 0.48, 0.22, 16), color: 0, pos: [0, hy + 0.36, hz] });
      D.push({ geo: cyl(0.4, 0.4, 0.26, 16), color: C.red, pos: [0, hy + 0.36, hz] });
      for (const s of [-1, 1]) pipe(s * (W / 2 + 0.12), 0.2, -0.4, 1.5, 0.13, [-HALF_PI, 0, 0], 0.5);
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
      for (const s of [-1, 1]) for (let i = 0; i < stacks; i++) pipe(s * (W / 2 - 0.2 - i * 0.34), 1.9, stackZ - i * 0.05, 2.2, 0.15, [0, 0, 0], 0.7);
      if (et === 3) { // rocket nozzles out the back
        for (const s of [-1, 1]) {
          K.push({ geo: cyl(0.3, 0.3, 1.5, 14), color: 0, pos: [s * W * 0.27, 1.38, -L / 2 + 0.45], rot: [HALF_PI, 0, 0] });
          D.push({ geo: cyl(0.33, 0.33, 0.2, 14), color: C.red, pos: [s * W * 0.27, 1.38, -L / 2 + 0.9], rot: [HALF_PI, 0, 0] });
          pipe(s * W * 0.27, 1.38, -L / 2 - 0.45, 0.5, 0.38, [-HALF_PI, 0, 0], 1.5);
        }
      }
    }

    // ---- nitro tank: glows brighter the fuller it is
    const bz = A.bedZ, by = A.bedY;
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
      for (const s of [-1, 1]) K.push({ geo: torus(0.54, 0.06, 16), color: 0, pos: [s * W * 0.14, by + 0.6, bz], rot: [0, HALF_PI, 0] });
      D.push({ geo: box(W * 0.6, 0.2, 0.9, 0.06, 1), color: C.ink, pos: [0, by + 0.08, bz] });
    }

    add(this.body, P, paint);
    add(this.body, D, MAT.vinyl);
    add(this.body, K, MAT.chrome);
    add(this.body, G, MAT.glass);
    add(this.body, E, this.lamps);
    add(this.body, N, neon, false);

    // ---- googly headlight eyes (blink + look where you steer)
    const er = A.eye.r;
    this.eyes.position.set(0, A.eye.y, A.eye.z);
    const whites: Part[] = [], pupils: Part[] = [];
    for (const s of [-1, 1]) {
      const x = (s * A.eye.gap) / 2;
      whites.push({ geo: ball(er, 14, 10), color: C.white, pos: [x, 0, 0] });
      pupils.push({ geo: ball(er * 0.55, 10, 8), color: C.black, pos: [x, 0, er * 0.62] });
      pupils.push({ geo: ball(er * 0.2, 6, 5), color: C.white, pos: [x + er * 0.2, er * 0.25, er * 1.05] });
      if (A.brows) whites.push({ geo: box(er * 2.2, er * 0.45, er * 0.6, 0.04, 1), color: C.ink, pos: [x, er * 0.95, er * 0.55], rot: [0, 0, s * 0.42] });
    }
    add(this.eyes, whites, MAT.vinyl);
    this.pupils = add(this.eyes, pupils, MAT.vinyl)!;
    this.body.add(this.eyes);

    // ---- decals on both flanks
    const tex = decalTexture(look.decal);
    if (tex) {
      this.owned.tex.push(tex);
      const dm = this.own(new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.35, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
      const dg = this.ownGeo(new THREE.PlaneGeometry(A.decal.len, A.decal.h));
      const out = W / 2 + 0.008;
      for (const s of [-1, 1]) {
        const d = new THREE.Mesh(dg, dm);
        d.position.set(s * out, A.decal.y, A.decal.z);
        d.rotation.y = s * HALF_PI;
        d.scale.x = s; // flames always lick rearward
        this.body.add(d);
      }
    }
    this.update(0, { speed: 0, steer: 0, throttle: 0, boosting: false, grounded: true, nitro: 1, slip: 0 });
  }

  private own<T extends THREE.Material>(m: T): T { this.owned.mat.push(m); return m; }
  private ownGeo<T extends THREE.BufferGeometry>(g: T): T { this.owned.geo.push(g); return g; }

  /** Suspension kick: positive = body slams down (landing), negative = hop. */
  kick(amount: number): void { this.bounceV -= amount; this.squashV += amount * 0.6; }

  update(dt: number, p: TruckPose): void {
    this.time += dt;
    const R = this.wheelRadius;
    // Wheels roll, steer and hug the ground individually; in the air they droop.
    const lifts = p.wheelLift ?? [0, 0, 0, 0];
    this.wheels.forEach((w, i) => {
      w.spin.rotation.x += (p.speed / R) * dt;
      if (w.front) w.pivot.rotation.y = damp(w.pivot.rotation.y, -p.steer * 0.5, 14, dt);
      w.lift = dt === 0 ? lifts[i] : damp(w.lift, p.grounded ? lifts[i] : -0.5, p.grounded ? 22 : 9, dt);
      w.pivot.position.y = R + w.lift;
    });
    // Solid axles tilt with their two wheels.
    [[0, 1], [2, 3]].forEach(([l, r], i) => {
      const a = this.axles[i], wl = this.wheels[l], wr = this.wheels[r];
      a.position.y = R + (wl.lift + wr.lift) / 2;
      a.rotation.z = Math.atan2(wl.lift - wr.lift, this.halfTrack * 2) * (i === 0 ? 1 : -1);
      wl.pivot.rotation.z = wr.pivot.rotation.z = Math.atan2(wl.lift - wr.lift, this.halfTrack * 2);
    });

    // Body rides the wheel plane on a soft spring: squats, dives, leans and wobbles.
    const w = this.wheels;
    const front = (w[0].lift + w[1].lift) / 2, rear = (w[2].lift + w[3].lift) / 2, left = (w[0].lift + w[2].lift) / 2, right = (w[1].lift + w[3].lift) / 2;
    const targetPitch = p.grounded ? Math.atan2(rear - front, this.halfBase * 2) * 0.8 - p.throttle * 0.06 - (p.boosting ? 0.09 : 0) : 0;
    const targetRoll = p.grounded ? Math.atan2(left - right, this.halfTrack * 2) * 0.7 + p.slip * 0.022 + p.steer * Math.min(1, Math.abs(p.speed) / 14) * 0.14 : 0;
    this.pitch = damp(this.pitch, targetPitch, 7, dt);
    this.roll = damp(this.roll, targetRoll, 6, dt);
    const targetY = p.grounded ? (front + rear) / 2 : 0.12;
    this.bounceV += (-(this.bounce - targetY) * 95 - this.bounceV * 7.5) * dt;
    this.bounce += this.bounceV * dt;
    this.squashV += (-this.squash * 220 - this.squashV * 14) * dt;
    this.squash += this.squashV * dt;
    const idle = Math.sin(this.time * 22) * 0.014 * (1 - Math.min(1, Math.abs(p.speed) / 6)); // engine shiver
    this.body.position.y = this.baseY + THREE.MathUtils.clamp(this.bounce, -0.6, 0.7) + idle;
    this.body.rotation.set(this.pitch, 0, this.roll);
    const sq = THREE.MathUtils.clamp(this.squash, -0.25, 0.25);
    this.body.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);

    // Shocks and link bars span from each axle end up to the moving frame.
    this.body.updateMatrix();
    for (const s of this.struts) {
      _a.copy(s.axle).setY(R + this.wheels[s.wheel].lift);
      _b.copy(s.mount).applyMatrix4(this.body.matrix);
      stretch(s.mesh, _a, _b);
    }

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
