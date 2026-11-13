// Arcade truck physics: velocity + lateral slip on a height function, with
// gravity, jumps, air tricks and nitro. No physics engine.
import { clamp, damp, lerp, TAU } from './math';
import type { TruckStats } from './parts';
import { inMud, isWater, surfaceHeight, WORLD_R, type Solid } from './world';

export const TRUCK_RADIUS = 1.7;
const GRAVITY = 26;
const JUMP_V = 9.5;
const BOOST_SPEED = 1.45;
/** Steepest drivable gradient (rise/run) and the tallest lip the wheels roll over. */
const MAX_SLOPE = 1.25;
const STEP_UP = 0.6;
const NITRO_REGEN = 0.07; // seconds of nitro regained per second

export interface DriveInput { throttle: number; steer: number; boost: boolean; jump: boolean; horn: boolean }
export const NO_INPUT: DriveInput = { throttle: 0, steer: 0, boost: false, jump: false, horn: false };

export interface Truck {
  x: number; z: number; y: number;
  vx: number; vz: number; vy: number;
  heading: number;
  /** Smoothed steering -1..1 (also drives the visual wheel angle). */
  steer: number;
  grounded: boolean;
  airTime: number;
  /** Radians of yaw / pitch accumulated during the current air. */
  spin: number; flip: number;
  nitro: number;
  boosting: boolean;
  /** Signed sideways speed; |slip| high = drifting. */
  slip: number;
  driftTime: number;
  inWater: boolean; inMud: boolean;
  jumpHeld: boolean;
}

export type TruckEvent =
  | { type: 'jump' }
  | { type: 'land'; impact: number; airTime: number; spins: number; flips: number }
  | { type: 'bonk'; speed: number }
  | { type: 'splash' };

export function createTruck(x: number, z: number, heading: number, stats: TruckStats): Truck {
  return {
    x, z, y: surfaceHeight(x, z), vx: 0, vz: 0, vy: 0, heading, steer: 0, grounded: true, airTime: 0,
    spin: 0, flip: 0, nitro: stats.nitro, boosting: false, slip: 0, driftTime: 0, inWater: false, inMud: false, jumpHeld: false,
  };
}

export const truckSpeed = (t: Truck) => Math.hypot(t.vx, t.vz);
export const forwardSpeed = (t: Truck) => t.vx * Math.sin(t.heading) + t.vz * Math.cos(t.heading);

export interface Circle { x: number; z: number; r: number }

export function stepTruck(t: Truck, input: DriveInput, stats: TruckStats, dt: number, solids: readonly Solid[], blockers: readonly Circle[] = []): TruckEvent[] {
  const events: TruckEvent[] = [];
  t.steer = damp(t.steer, input.steer, 9, dt);
  const wasWater = t.inWater;
  t.inWater = t.grounded && isWater(t.x, t.z);
  t.inMud = t.grounded && inMud(t.x, t.z);
  if (t.inWater && !wasWater && truckSpeed(t) > 4) events.push({ type: 'splash' });

  t.boosting = input.boost && t.nitro > 0;
  if (t.boosting) t.nitro = Math.max(0, t.nitro - dt);
  else t.nitro = Math.min(stats.nitro, t.nitro + NITRO_REGEN * dt);

  if (t.grounded) {
    // Steer first, then decompose velocity in the new basis so slip appears naturally.
    const vf0 = forwardSpeed(t);
    const speedFrac = clamp(Math.abs(vf0) / stats.topSpeed, 0, 1.5);
    const turn = t.steer * 2.7 * clamp(Math.abs(vf0) / 5, 0, 1) * (1 - 0.42 * Math.min(1, speedFrac));
    t.heading -= turn * dt * (vf0 >= 0 ? 1 : -1);
    const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
    let vf = t.vx * fx + t.vz * fz;
    let vl = -t.vx * fz + t.vz * fx;

    const maxSpeed = stats.topSpeed * (t.boosting ? BOOST_SPEED : 1) * (t.inWater ? 0.6 : t.inMud ? 0.72 : 1);
    const throttle = t.boosting ? 1 : input.throttle;
    const handbrake = input.throttle < 0 && vf > 4 && Math.abs(t.steer) > 0.3;
    if (throttle > 0) {
      const a = stats.accel * (t.boosting ? 1.9 : 1);
      vf = vf < maxSpeed ? Math.min(maxSpeed, vf + a * throttle * dt) : damp(vf, maxSpeed, 2.5, dt);
    } else if (throttle < 0) {
      vf = vf > 1 ? vf - (handbrake ? 12 : 36) * dt : Math.max(-stats.topSpeed * 0.45, vf - stats.accel * 0.8 * dt);
    } else {
      vf = damp(vf, 0, 0.9, dt);
    }
    if (vf > maxSpeed) vf = damp(vf, maxSpeed, 2.5, dt);
    // Hills tug gently.
    vf -= (surfaceHeight(t.x + fx * 0.6, t.z + fz * 0.6) - surfaceHeight(t.x - fx * 0.6, t.z - fz * 0.6)) * 5 * dt;

    const grip = handbrake ? 1.8 : lerp(11, 3.4, clamp(Math.abs(t.steer) * speedFrac * speedFrac * 1.25, 0, 1));
    vl *= Math.exp(-grip * dt);
    t.slip = vl;
    t.driftTime = Math.abs(vl) > 3.2 && Math.abs(vf) > 6 ? t.driftTime + dt : 0;
    t.vx = fx * vf - fz * vl;
    t.vz = fz * vf + fx * vl;

    if (input.jump && !t.jumpHeld) {
      t.vy = Math.max(t.vy, 0) + JUMP_V;
      t.grounded = false;
      t.y += 0.05;
      events.push({ type: 'jump' });
    }
  } else {
    // Air control = tricks. Velocity is untouched; only the body rotates.
    const dYaw = input.steer * 5.2 * dt;
    t.heading -= dYaw;
    t.spin += Math.abs(dYaw);
    // Backflips are deliberate: pull back (brake) in the air. Holding the gas does nothing.
    if (input.throttle < 0) t.flip -= 6.2 * dt;
    t.slip = 0;
    t.driftTime = 0;
  }
  t.jumpHeld = input.jump;

  const prevGround = surfaceHeight(t.x, t.z);
  const x0 = t.x, z0 = t.z;
  t.x += t.vx * dt;
  t.z += t.vz * dt;

  // Solids: push out and bounce.
  const speedBefore = truckSpeed(t);
  let bonked = false;
  const pushOut = (nx: number, nz: number, depth: number) => {
    t.x += nx * depth;
    t.z += nz * depth;
    const vn = t.vx * nx + t.vz * nz;
    if (vn < 0) {
      t.vx -= nx * vn * 1.4;
      t.vz -= nz * vn * 1.4;
      if (-vn > 4) bonked = true;
    }
  };
  const circle = (cx: number, cz: number, r: number) => {
    const dx = t.x - cx, dz = t.z - cz;
    const d = Math.hypot(dx, dz), min = r + TRUCK_RADIUS;
    if (d < min && d > 1e-6) pushOut(dx / d, dz / d, min - d);
  };
  for (const s of solids) {
    if (s.kind === 'circle') { circle(s.x, s.z, s.r); continue; }
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const dx = t.x - s.x, dz = t.z - s.z;
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    const px = clamp(lx, -s.hw, s.hw), pz = clamp(lz, -s.hd, s.hd);
    let nx = lx - px, nz = lz - pz;
    const d = Math.hypot(nx, nz);
    if (d >= TRUCK_RADIUS) continue;
    let depth = TRUCK_RADIUS - d;
    if (d < 1e-6) { // centre inside the box: exit through the nearest face
      const ex = s.hw - Math.abs(lx), ez = s.hd - Math.abs(lz);
      if (ex < ez) { nx = Math.sign(lx) || 1; nz = 0; depth = ex + TRUCK_RADIUS; } else { nx = 0; nz = Math.sign(lz) || 1; depth = ez + TRUCK_RADIUS; }
    } else { nx /= d; nz /= d; }
    pushOut(nx * c + nz * sn, -nx * sn + nz * c, depth);
  }
  if (t.y - prevGround < 1.6) for (const b of blockers) circle(b.x, b.z, b.r);
  const r = Math.hypot(t.x, t.z);
  if (r > WORLD_R) pushOut(-t.x / r, -t.z / r, r - WORLD_R);
  // Ledges: a sudden rise (ramp side/back, bridge flank) is a wall, not a launcher.
  // Anything steeper than MAX_SLOPE and taller than STEP_UP blocks; small lips are
  // stepped over without gaining upward speed.
  const base = Math.max(t.y, prevGround);
  const tooSteep = (x: number, z: number) => surfaceHeight(x, z) - base > Math.hypot(x - x0, z - z0) * MAX_SLOPE + 0.04;
  let stepped = false;
  if (tooSteep(t.x, t.z)) {
    if (surfaceHeight(t.x, t.z) - base <= STEP_UP) stepped = true;
    else {
      // Slide along the wall if one axis is free, otherwise stop dead.
      const freeX = !tooSteep(t.x, z0) || surfaceHeight(t.x, z0) - base <= STEP_UP;
      const freeZ = !tooSteep(x0, t.z) || surfaceHeight(x0, t.z) - base <= STEP_UP;
      const hit = Math.hypot(t.vx, t.vz);
      if (freeX && !freeZ) { t.z = z0; t.vz *= -0.3; } else if (freeZ && !freeX) { t.x = x0; t.vx *= -0.3; } else { t.x = x0; t.z = z0; t.vx *= -0.3; t.vz *= -0.3; }
      if (hit > 4) bonked = true;
    }
  }
  if (bonked) events.push({ type: 'bonk', speed: speedBefore });

  // Vertical: follow the ground, leave it at crests/ramps, land with a thump.
  const ground = surfaceHeight(t.x, t.z);
  const slopeVy = stepped ? 0 : clamp((ground - prevGround) / Math.max(dt, 1e-4), -40, 16);
  t.vy -= GRAVITY * dt;
  t.y += t.vy * dt;
  const stick = t.grounded && t.vy <= slopeVy + 3 ? 0.18 : 0;
  if (t.y <= ground + stick) {
    if (!t.grounded) {
      if (t.airTime > 0.25) {
        events.push({ type: 'land', impact: slopeVy - t.vy, airTime: t.airTime, spins: Math.floor(t.spin / TAU + 0.2), flips: Math.floor(Math.abs(t.flip) / TAU + 0.25) });
      }
      t.grounded = true;
    }
    t.y = ground;
    t.vy = slopeVy;
    t.airTime = 0; t.spin = 0; t.flip = 0;
  } else {
    t.grounded = false;
    t.airTime += dt;
  }
  return events;
}
