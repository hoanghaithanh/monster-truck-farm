// Grumpy farmer on a putt-putt tractor. Telegraphed, escapable, funny.
// Escapes: outrun him, juke (he turns wide), jump over him, cross the river
// (tractors can't swim), or honk in his face.
import { angleDelta, clamp, damp, range, type Rng } from './math';
import { BUILDINGS, isOpenGround, isWater, riverCenterZ, WORLD } from './world';

export type FarmerMode = 'away' | 'warn' | 'chase' | 'laugh' | 'stunned' | 'stuck' | 'leave';
export interface Farmer {
  mode: FarmerMode; x: number; z: number; heading: number; speed: number;
  timer: number; chaseLeft: number;
  /** Adaptive difficulty 0.5..1: drops every time he catches the player. */
  ease: number;
  stunCooldown: number;
}

export const FARMER_RADIUS = 1.9;
export const CHASE_SECONDS = 24;
const WARN_SECONDS = 2.6;

export function createFarmer(rng: Rng, ease = 1): Farmer {
  return { mode: 'away', x: 0, z: 0, heading: 0, speed: 0, timer: range(rng, 26, 34), chaseLeft: 0, ease, stunCooldown: 0 };
}

export type FarmerEvent = 'warn' | 'chase' | 'stuck' | 'gaveUp' | 'gone' | null;

export interface FarmerTarget { x: number; z: number; heading: number; topSpeed: number }

export function stepFarmer(f: Farmer, dt: number, t: FarmerTarget, rng: Rng): FarmerEvent {
  f.timer -= dt;
  f.stunCooldown -= dt;
  const dx = t.x - f.x, dz = t.z - f.z, dist = Math.hypot(dx, dz);
  const drive = (targetHeading: number, targetSpeed: number, turnRate: number) => {
    f.heading += clamp(angleDelta(f.heading, targetHeading), -turnRate * dt, turnRate * dt);
    f.speed = damp(f.speed, targetSpeed, 2, dt);
    const nx = f.x + Math.sin(f.heading) * f.speed * dt, nz = f.z + Math.cos(f.heading) * f.speed * dt;
    if (isWater(nx, nz)) return false;
    f.x = nx; f.z = nz;
    for (const s of WORLD.solids) { // squeeze around tree trunks instead of ghosting through them
      if (s.kind !== 'circle' || s.r > 1.6 || Math.abs(s.x - f.x) > 3 || Math.abs(s.z - f.z) > 3) continue;
      const tx = f.x - s.x, tz = f.z - s.z, d = Math.hypot(tx, tz), min = s.r + 1.5;
      if (d < min && d > 0.01) { f.x = s.x + (tx / d) * min; f.z = s.z + (tz / d) * min; }
    }
    for (const b of BUILDINGS) { // shove out of buildings (coarse circles)
      const bx = f.x - b.x, bz = f.z - b.z, d = Math.hypot(bx, bz);
      if (d < 8 && d > 0.01) { f.x = b.x + (bx / d) * 8; f.z = b.z + (bz / d) * 8; }
    }
    return true;
  };

  switch (f.mode) {
    case 'away':
      if (f.timer > 0) return null;
      for (let i = 0; i < 24; i++) {
        // Appear ahead-ish of the truck, on the same side of the river.
        const a = t.heading + range(rng, -1.4, 1.4), d = range(rng, 34, 42);
        const x = t.x + Math.sin(a) * d, z = t.z + Math.cos(a) * d;
        if (!isOpenGround(x, z, 3) || Math.sign(z - riverCenterZ(x)) !== Math.sign(t.z - riverCenterZ(t.x))) continue;
        Object.assign(f, { x, z, heading: Math.atan2(t.x - x, t.z - z), speed: 0, mode: 'warn', timer: WARN_SECONDS, chaseLeft: CHASE_SECONDS });
        return 'warn';
      }
      f.timer = 3;
      return null;
    case 'warn':
      f.heading += angleDelta(f.heading, Math.atan2(dx, dz)) * Math.min(1, 6 * dt);
      if (f.timer <= 0) { f.mode = 'chase'; return 'chase'; }
      return null;
    case 'chase': {
      f.chaseLeft -= dt;
      if (f.chaseLeft <= 0 || dist > 80) { f.mode = 'leave'; f.timer = 4; return 'gaveUp'; }
      const speed = Math.max(9, t.topSpeed * 0.8) * f.ease;
      if (!drive(Math.atan2(dx, dz), speed, 1.5)) { f.mode = 'stuck'; f.timer = 3.2; f.speed = 0; return 'stuck'; }
      return null;
    }
    case 'laugh': // one bump per visit: he gloats, then putters off satisfied
      f.speed = damp(f.speed, 0, 6, dt);
      if (f.timer <= 0) { f.mode = 'leave'; f.timer = 4; }
      return null;
    case 'stunned':
      f.speed = damp(f.speed, 0, 6, dt);
      if (f.timer <= 0) f.mode = 'chase';
      return null;
    case 'stuck':
      if (f.timer <= 0) { f.mode = 'leave'; f.timer = 4; }
      return null;
    case 'leave':
      drive(Math.atan2(-dx, -dz), 10, 2.5);
      if (f.timer <= 0) { f.mode = 'away'; f.timer = range(rng, 28, 42); return 'gone'; }
      return null;
  }
}

/** He just bumped the truck: pause to gloat, and go a bit easier from now on. */
export function farmerBumped(f: Farmer): void {
  f.mode = 'laugh';
  f.timer = 2.4;
  f.ease = Math.max(0.5, f.ease * 0.86);
}

export function farmerHonked(f: Farmer, dist: number): boolean {
  if (f.mode !== 'chase' || dist > 15 || f.stunCooldown > 0) return false;
  f.mode = 'stunned';
  f.timer = 2.6;
  f.stunCooldown = 9;
  return true;
}

export const farmerActive = (f: Farmer) => f.mode !== 'away';
export const farmerDangerous = (f: Farmer) => f.mode === 'chase';
