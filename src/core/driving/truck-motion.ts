// Arcade driving integration (drive AC1-AC3): pure math, no physics engine,
// per ADR 0001 §2. Given the current heading/speed and a frame of keyboard
// intent, produces the truck's new heading/speed and the *desired* world-space
// displacement for the frame. The desired displacement is handed to the
// physics adapter (systems/), which resolves it against obstacle colliders
// (slide/block, never crash) — this module never knows about obstacles.
import type { DriveIntent, Vec2 } from '../types';
import type { DrivingConfig } from './config';

export interface TruckMotionState {
  /**
   * Heading in radians. 0 = facing +Z. `displacement` is derived as
   * (sin(heading), cos(heading)), the same convention `render/scene.ts`
   * uses for `mesh.rotation.y` — i.e. this is a standard Three.js Y-axis
   * rotation. Given forward = +Z, the truck's physical right side (Forward
   * x Up) is -X, so *increasing* heading swings the nose toward +X, which
   * is the truck's LEFT. Decreasing heading turns it right. The heading
   * update below therefore subtracts `intent.steer`: steer=+1 (right key)
   * must decrease heading to turn right; steer=-1 (left key) increases it
   * to turn left.
   */
  heading: number;
  /** Signed forward speed (negative = reversing), units/s. */
  speed: number;
}

export interface TruckMotionResult {
  state: TruckMotionState;
  /** Desired world-space displacement this frame, before obstacle resolution. */
  displacement: Vec2;
}

const EPSILON = 1e-4;

export function integrateTruckMotion(
  state: TruckMotionState,
  intent: DriveIntent,
  topSpeed: number,
  config: DrivingConfig,
  dt: number,
): TruckMotionResult {
  const reverseTopSpeed = -topSpeed * config.reverseSpeedFactor;
  let speed = state.speed;

  if (intent.throttle > 0) {
    speed += config.acceleration * dt;
  } else if (intent.throttle < 0) {
    // Braking while moving forward decelerates faster than coasting;
    // once stopped/reversing it's just reverse acceleration (AC1: brake/reverse on one key).
    speed -= (speed > 0 ? config.braking : config.acceleration) * dt;
  } else {
    // No throttle: coast to a stop, never reverses on its own.
    if (speed > 0) speed = Math.max(0, speed - config.friction * dt);
    else if (speed < 0) speed = Math.min(0, speed + config.friction * dt);
  }

  speed = Math.min(topSpeed, Math.max(reverseTopSpeed, speed));

  // Steering only has an effect while moving, otherwise the truck could spin in place.
  let heading = state.heading;
  if (Math.abs(speed) > EPSILON) {
    // Subtract, not add: see the TruckMotionState.heading doc comment above
    // for why steer=+1 (right) must *decrease* heading to actually turn right.
    heading -= intent.steer * config.turnRate * dt;
  }

  const displacement: Vec2 = {
    x: Math.sin(heading) * speed * dt,
    z: Math.cos(heading) * speed * dt,
  };

  return { state: { heading, speed }, displacement };
}
