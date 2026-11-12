// Chase camera: lags behind, looks ahead into turns, widens FOV with speed,
// shakes on impacts, and never dips under terrain or inside buildings.
import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp } from '../core/math';
import type { Truck } from '../core/truck';
import { surfaceHeight, WORLD, WORLD_R, type Solid } from '../core/world';

const inSolid = (s: Solid, x: number, z: number, pad: number): boolean => {
  if (s.kind === 'circle') return Math.hypot(x - s.x, z - s.z) < s.r + pad;
  if (s.hw < 2.5) return false; // only buildings matter
  const c = Math.cos(s.rot), sn = Math.sin(s.rot), dx = x - s.x, dz = z - s.z;
  return Math.abs(dx * c - dz * sn) < s.hw + pad && Math.abs(dx * sn + dz * c) < s.hd + pad;
};
// Buildings, plus tree crowns (so foliage never fills the screen).
const BIG_SOLIDS: Solid[] = [
  ...WORLD.solids.filter((s) => s.kind === 'box' || s.r > 2),
  ...WORLD.trees.filter((t) => Math.hypot(t.x, t.z) < WORLD_R).map((t): Solid => ({ kind: 'circle', x: t.x, z: t.z, r: 2.3 * t.s })),
];

export class ChaseCam {
  shakeEnabled = true;
  private heading = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private trauma = 0;
  private fov = 62;
  private t = 0;
  private boom = 1;

  constructor(private camera: THREE.PerspectiveCamera) {}

  snap(truck: Truck): void {
    this.heading = truck.heading;
    this.pos.set(truck.x - Math.sin(truck.heading) * 10, truck.y + 5, truck.z - Math.cos(truck.heading) * 10);
    this.look.set(truck.x, truck.y + 1.6, truck.z);
    this.trauma = 0;
  }

  /** amount ~0.2 (boop) .. 1 (huge landing). */
  shake(amount: number): void { this.trauma = Math.min(1, this.trauma + amount); }

  update(truck: Truck, topSpeed: number, dt: number): void {
    this.t += dt;
    const speed = Math.hypot(truck.vx, truck.vz);
    const frac = clamp(speed / topSpeed, 0, 1.5);
    const fwd = truck.vx * Math.sin(truck.heading) + truck.vz * Math.cos(truck.heading);
    // In the air (or sliding) follow the direction of travel so spins are visible.
    let target = truck.heading;
    if (speed > 4 && fwd > -1) {
      const travel = Math.atan2(truck.vx, truck.vz);
      target = truck.grounded ? truck.heading + angleDelta(truck.heading, travel) * 0.45 : travel;
    }
    this.heading += angleDelta(this.heading, target) * (1 - Math.exp(-(truck.grounded ? 4.2 : 2.5) * dt));

    const dist = 9.5 + frac * 3 + (truck.boosting ? 1.5 : 0);
    const height = 4.3 + frac * 0.8 + (truck.grounded ? 0 : 1.2);
    const bx = -Math.sin(this.heading), bz = -Math.cos(this.heading);
    // Pull the boom in if a building is in the way.
    let boom = 1;
    for (; boom > 0.3; boom -= 0.14) {
      const x = truck.x + bx * dist * boom, z = truck.z + bz * dist * boom;
      if (!BIG_SOLIDS.some((s) => inSolid(s, x, z, 0.8))) break;
    }
    this.boom = damp(this.boom, boom, boom < this.boom ? 14 : 3, dt);
    const d = dist * this.boom;
    const tx = truck.x + bx * d, tz = truck.z + bz * d;
    let ty = truck.y + height + (1 - this.boom) * 5;
    ty = Math.max(ty, surfaceHeight(tx, tz) + 1.6, surfaceHeight((tx + truck.x) / 2, (tz + truck.z) / 2) + 1.8);
    this.pos.x = damp(this.pos.x, tx, 9, dt);
    this.pos.z = damp(this.pos.z, tz, 9, dt);
    this.pos.y = damp(this.pos.y, ty, truck.grounded ? 6 : 3.5, dt);

    const ahead = 2.5 + frac * 4;
    const lx = truck.x + Math.sin(truck.heading) * ahead + Math.cos(truck.heading) * truck.steer * -2.2 * frac;
    const lz = truck.z + Math.cos(truck.heading) * ahead - Math.sin(truck.heading) * truck.steer * -2.2 * frac;
    this.look.x = damp(this.look.x, lx, 10, dt);
    this.look.z = damp(this.look.z, lz, 10, dt);
    this.look.y = damp(this.look.y, truck.y + 1.7, 8, dt);

    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.shakeEnabled ? this.trauma * this.trauma : 0;
    const rumble = this.shakeEnabled && truck.boosting ? 0.035 : 0;
    this.camera.position.set(
      this.pos.x + (Math.sin(this.t * 47) * s + Math.sin(this.t * 61) * rumble) * 0.7,
      this.pos.y + (Math.sin(this.t * 53 + 1) * s + Math.sin(this.t * 71) * rumble) * 0.7,
      this.pos.z + Math.sin(this.t * 41 + 2) * s * 0.7,
    );
    this.camera.lookAt(this.look);
    this.camera.rotation.z += Math.sin(this.t * 37) * s * 0.04;
    this.fov = damp(this.fov, lerp(60, 76, Math.min(1, frac)) + (truck.boosting ? 9 : 0), 5, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }
}
