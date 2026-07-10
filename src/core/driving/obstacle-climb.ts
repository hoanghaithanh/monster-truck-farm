// Obstacle climb (ADR 0013, issue #42): a stateless, position-derived visual
// lift/tilt of the truck rig over `passable` obstacles -- pure math, no
// three/Rapier types (ADR 0001 §4), mirroring truck-motion.ts's purity
// boundary. Never touches the Rapier collider or the clearance rule
// (core/clearance.ts): this is purely how a `passable` crossing *looks*.
import type { ObstacleInstance, Vec2 } from '../types';
import type { ClimbConfig } from './config';
import { TRUCK_CONTACT_RADIUS } from './config';

export interface ClimbTransform {
  /** Y offset applied to the truck rig group. */
  lift: number;
  /** Rotation about the rig's local (post-heading) X axis. */
  pitch: number;
  /** Rotation about the rig's local (post-heading) Z axis. */
  roll: number;
}

const EPSILON = 1e-6;

function clamp(value: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(limit, Math.max(-limit, value));
}

/**
 * Computes this frame's climb lift/tilt from the truck's current XZ position
 * relative to the known `passable` obstacle footprints. Stateless: nothing is
 * time-integrated or carried frame-to-frame, so it behaves correctly under
 * stop/reverse/re-entry with no special-casing.
 *
 * Multiple overlapping footprints (ADR 0013 §Decision step 4): `lift` is the
 * max across contributing obstacles (never summed, to avoid an unbounded/
 * chaotic stacked spike -- AC3); `pitch`/`roll` are the lift-weighted average
 * of each obstacle's own (unclamped) tilt contribution, then the combined
 * result is clamped to `maxPitch`/`maxRoll`.
 */
export function computeClimbTransform(
  truckPos: Vec2,
  heading: number,
  passable: ObstacleInstance[],
  config: ClimbConfig,
): ClimbTransform {
  const forward: Vec2 = { x: Math.sin(heading), z: Math.cos(heading) };
  const right: Vec2 = { x: Math.cos(heading), z: -Math.sin(heading) };

  let lift = 0;
  let pitchWeightedSum = 0;
  let rollWeightedSum = 0;
  let liftWeightSum = 0;

  for (const obstacle of passable) {
    const dx = truckPos.x - obstacle.position.x;
    const dz = truckPos.z - obstacle.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const combinedRadius = obstacle.radius + TRUCK_CONTACT_RADIUS;
    if (dist >= combinedRadius) continue;

    const peak = Math.min(config.maxLift, config.liftScale * obstacle.radius);
    const liftI = peak * 0.5 * (1 + Math.cos((Math.PI * dist) / combinedRadius));

    if (liftI > lift) lift = liftI;

    let pitchI = 0;
    let rollI = 0;
    if (dist > EPSILON) {
      const outward: Vec2 = { x: dx / dist, z: dz / dist };
      const dLiftDDist = peak * 0.5 * (-Math.PI / combinedRadius) * Math.sin((Math.PI * dist) / combinedRadius);
      const alongSlope = dLiftDDist * (outward.x * forward.x + outward.z * forward.z);
      const lateralSlope = dLiftDDist * (outward.x * right.x + outward.z * right.z);
      pitchI = -alongSlope * config.tiltGain;
      rollI = -lateralSlope * config.tiltGain;
    }

    pitchWeightedSum += pitchI * liftI;
    rollWeightedSum += rollI * liftI;
    liftWeightSum += liftI;
  }

  if (liftWeightSum <= EPSILON) {
    return { lift, pitch: 0, roll: 0 };
  }

  const pitch = clamp(pitchWeightedSum / liftWeightSum, config.maxPitch);
  const roll = clamp(rollWeightedSum / liftWeightSum, config.maxRoll);

  return { lift, pitch, roll };
}
