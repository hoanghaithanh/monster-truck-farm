// Pooled instanced particles (puffs, tumbling flakes, bouncing chunks) plus
// tyre marks. Everything shrinks out instead of fading: cheap and toy-like.
import * as THREE from 'three';
import { surfaceHeight, WATER_Y } from '../core/world';

type Kind = 'puff' | 'flake' | 'chunk';
interface P {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  life: number; max: number; size: number; grow: number; gravity: number; drag: number;
  rx: number; ry: number; rz: number; spin: number; bounce: boolean;
  /** Homing target (coins flying to the truck). */
  home: THREE.Vector3 | null;
}
export interface EmitOpts {
  kind: Kind; count?: number; x: number; y: number; z: number;
  color: number | number[];
  speed?: number; up?: number; spread?: number; size?: number; life?: number;
  gravity?: number; drag?: number; grow?: number; bounce?: boolean; home?: THREE.Vector3 | null;
  /** Bias direction added to every particle's velocity. */
  vx?: number; vy?: number; vz?: number;
  /** Colours above 1.0 so bloom picks them up. */
  glow?: number;
}

const CAP: Record<Kind, number> = { puff: 500, flake: 500, chunk: 260 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

class Pool {
  readonly mesh: THREE.InstancedMesh;
  readonly items: P[] = [];
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, private cap: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
  }
  add(p: P, color: THREE.Color): void {
    if (this.items.length >= this.cap) { // recycle the oldest
      this.items.shift();
      for (let i = 0; i < this.items.length; i++) { this.mesh.getColorAt(i + 1, _c); this.mesh.setColorAt(i, _c); }
    }
    this.mesh.setColorAt(this.items.length, color);
    this.items.push(p);
    this.mesh.instanceColor!.needsUpdate = true;
  }
  update(dt: number): void {
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const p = items[i];
      p.life -= dt;
      if (p.life <= 0) {
        const last = items.length - 1;
        if (i !== last) { items[i] = items[last]; this.mesh.getColorAt(last, _c); this.mesh.setColorAt(i, _c); this.mesh.instanceColor!.needsUpdate = true; }
        items.pop();
        continue;
      }
      if (p.home) {
        const k = 1 - p.life / p.max;
        p.x += (p.home.x - p.x) * k * k * 0.6 + p.vx * dt * (1 - k);
        p.y += (p.home.y + 1 - p.y) * k * k * 0.6 + p.vy * dt * (1 - k);
        p.z += (p.home.z - p.z) * k * k * 0.6 + p.vz * dt * (1 - k);
      } else {
        p.vy -= p.gravity * dt;
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vz *= d; if (p.gravity <= 0) p.vy *= d;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.bounce) {
          const g = Math.max(surfaceHeight(p.x, p.z), WATER_Y) + p.size * 0.4;
          if (p.y < g) { p.y = g; p.vy = Math.abs(p.vy) * 0.4; p.vx *= 0.6; p.vz *= 0.6; p.spin *= 0.5; }
        }
      }
      p.rx += p.spin * dt; p.rz += p.spin * 0.7 * dt;
    }
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      const k = p.life / p.max;
      // Pop in fast, shrink out.
      const s = p.size * (1 + p.grow * (1 - k)) * Math.min(1, (1 - k) * 12) * Math.min(1, k * 3);
      _m.compose(_p.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(p.rx, p.ry, p.rz)), _s.setScalar(s));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.count = items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Particles {
  readonly group = new THREE.Group();
  /** 0..1, scales emission counts with the quality level. */
  budget = 1;
  private pools: Record<Kind, Pool>;
  private marks: THREE.InstancedMesh;
  private markIndex = 0;

  constructor() {
    this.pools = {
      puff: new Pool(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ roughness: 1, envMapIntensity: 0.3 }), CAP.puff),
      flake: new Pool(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), CAP.flake),
      chunk: new Pool(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), CAP.chunk),
    };
    this.pools.chunk.mesh.castShadow = true;
    for (const p of Object.values(this.pools)) this.group.add(p.mesh);

    const markGeo = new THREE.PlaneGeometry(0.7, 1.3);
    markGeo.rotateX(-Math.PI / 2);
    this.marks = new THREE.InstancedMesh(markGeo, new THREE.MeshBasicMaterial({ color: 0x4a3a2a, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), 600);
    this.marks.frustumCulled = false;
    this.marks.count = 0;
    this.marks.renderOrder = 1;
    this.group.add(this.marks);
  }

  emit(o: EmitOpts): void {
    const pool = this.pools[o.kind];
    const count = Math.max(1, Math.round((o.count ?? 1) * this.budget));
    const speed = o.speed ?? 3, spread = o.spread ?? 0.3, life = o.life ?? 0.8, size = o.size ?? 0.4;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random();
      const color = Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : o.color;
      _c.setHex(color);
      if (o.glow) _c.multiplyScalar(o.glow);
      pool.add({
        x: o.x + Math.cos(a) * spread * r, y: o.y + (Math.random() - 0.3) * spread, z: o.z + Math.sin(a) * spread * r,
        vx: Math.cos(a) * speed * (0.4 + Math.random() * 0.6) + (o.vx ?? 0),
        vy: (o.up ?? speed) * (0.5 + Math.random() * 0.5) + (o.vy ?? 0),
        vz: Math.sin(a) * speed * (0.4 + Math.random() * 0.6) + (o.vz ?? 0),
        life: life * (0.7 + Math.random() * 0.6), max: life * 1.3, size: size * (0.6 + Math.random() * 0.8), grow: o.grow ?? 0,
        gravity: o.gravity ?? 0, drag: o.drag ?? 1.5, rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
        spin: o.kind === 'puff' ? 0 : (Math.random() - 0.5) * 16, bounce: o.bounce ?? false, home: o.home ?? null,
      }, _c);
    }
  }

  /** Stamp a tyre mark on the ground. */
  mark(x: number, z: number, heading: number): void {
    const y = surfaceHeight(x, z) + 0.04;
    if (y < WATER_Y) return;
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, heading, 0)), _s.set(1, 1, 1));
    this.marks.setMatrixAt(this.markIndex % 600, _m);
    this.markIndex++;
    this.marks.count = Math.min(600, this.markIndex);
    this.marks.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    for (const p of Object.values(this.pools)) p.update(dt);
  }

  clear(): void {
    for (const p of Object.values(this.pools)) { p.items.length = 0; p.mesh.count = 0; }
    this.markIndex = 0;
    this.marks.count = 0;
  }
}
