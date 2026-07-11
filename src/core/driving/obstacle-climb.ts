// Obstacle climb (ADR 0013, superseded by ADR 0014, issue #42): a stateless,
// position-derived visual lift/tilt of the truck rig over `passable`
// obstacles -- pure math, no three/Rapier types (ADR 0001 §4), mirroring
// truck-motion.ts's purity boundary. Never touches the Rapier collider or
// the clearance rule (core/clearance.ts): this is purely how a `passable`
// crossing *looks*.
//
// ADR 0014 rework: single-center-point sampling (ADR 0013) couldn't
// represent "front two wheels are up on a wide obstacle, rear two are still
// on flat ground," which let the rock obstacle visually clip through the
// cab even after a config retune -- the defect was structural, not a tuning
// gap. This module now samples the same raised-cosine height field at the
// truck's four wheel corners (front-left/right, rear-left/right) and
// derives lift (mean of the 4) and pitch/roll (finite differences between
// the front/rear and left/right pairs) from those samples, the standard
// "raycast suspension" technique. `TruckFootprint` is a plain-number shape
// (deliberately NOT imported from render/truck-sockets.ts -- core/ must
// never depend on render/, per ADR 0001 §4; the two interfaces are
// structurally identical by convention, not by import).
//
// ADR 0017 extension (issue #49, terrain hills): a second, injected height
// source is added per corner -- `sampleTerrainHeight` (a pure `(p) => number`
// function, always `core/terrain-height.ts`'s `terrainHeightAt` in
// production, per its own doc comment on why render and climb must sample
// the exact same function). It is *added* to the obstacle hump at each
// corner, not maxed against it -- but because `terrainHeightAt`'s flatten
// mask damps terrain to ~0 at every obstacle footprint, the sum collapses
// back to the pure obstacle hump there in practice, leaving
// `DEFAULT_CLIMB_CONFIG`'s existing tuning undisturbed (see the ADR 0014
// addendum pointer at the top of that ADR). The lift/pitch/roll averaging
// and finite-difference math below is otherwise byte-for-byte unchanged --
// only what feeds a corner's height grew, not how four corner heights become
// `{lift,pitch,roll}`. Injection (not an internal import of
// `terrainHeightAt`) keeps this module test-cheap and dependency-free, same
// rationale as `TruckFootprint` above.
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

/**
 * Plain-number truck wheel footprint (ADR 0014 §Layering): `halfTrack` is
 * half the left-right wheel spread, `zFront`/`zRear` are the front/rear axle
 * offsets along the truck's local forward axis (rig-group-local, same
 * convention as render/truck-sockets.ts's TruckFootprint, which is where the
 * real per-body-tier numbers are unwrapped from THREE.Vector3 sockets --
 * this module only ever sees the plain numbers).
 */
export interface TruckFootprint {
  halfTrack: number;
  zFront: number;
  zRear: number;
}

function clamp(value: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(limit, Math.max(-limit, value));
}

/**
 * The ADR 0013 raised-cosine hump, byte-for-byte unchanged, now a standalone
 * scalar height field sampled per wheel corner instead of once at the truck
 * center: `peak` at the obstacle's own center, easing to exactly `0` at
 * `combinedRadius` (C¹-smooth -- no pop on footprint entry/exit).
 * `maxLiftByClass` (ADR 0013 "Tuning knobs") still overrides the
 * radius-derived default per `sizeClass` (e.g. derelictCar's fixed rendered
 * height doesn't scale with radius the way bush/rock's does).
 */
function heightField(point: Vec2, obstacle: ObstacleInstance, config: ClimbConfig): number {
  const dx = point.x - obstacle.position.x;
  const dz = point.z - obstacle.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const combinedRadius = obstacle.radius + TRUCK_CONTACT_RADIUS;
  if (dist >= combinedRadius) return 0;

  const maxLiftForObstacle = config.maxLiftByClass?.[obstacle.sizeClass] ?? config.maxLift;
  const peak = Math.min(maxLiftForObstacle, config.liftScale * obstacle.radius);
  return peak * 0.5 * (1 + Math.cos((Math.PI * dist) / combinedRadius));
}

/**
 * Computes this frame's climb lift/tilt from the truck's current XZ position
 * relative to the known `passable` obstacle footprints. Stateless: nothing is
 * time-integrated or carried frame-to-frame, so it behaves correctly under
 * stop/reverse/re-entry with no special-casing.
 *
 * ADR 0014: samples `heightField` at the truck's four wheel world-positions
 * (derived from `truckPos`/`heading`/`footprint`), taking the `max` across
 * `passable` obstacles at each corner (ADR 0013's AC3 anti-stacking rule,
 * now applied per-corner rather than once). `lift` is the straight mean of
 * the four corner heights; `pitch`/`roll` are finite differences between the
 * front/rear and left/right corner pairs (`atan2` of the height delta over
 * the wheelbase/track), clamped to `maxPitch`/`maxRoll`. This replaces ADR
 * 0013's single-center-sample-plus-analytic-gradient approach, which
 * couldn't represent a wide obstacle lifting only the front (or only one
 * side) of the rig.
 *
 * ADR 0017: `sampleTerrainHeight` is added into each corner's height
 * alongside the obstacle hump (see this file's header comment) -- callers
 * pass `() => 0` to get byte-identical pre-#49 obstacle-only behavior
 * (obstacle-climb.test.ts's regression guard), or `terrainHeightAt` in
 * production so hills produce the same lift/pitch response as a passable
 * obstacle crossing.
 */
export function computeClimbTransform(
  truckPos: Vec2,
  heading: number,
  footprint: TruckFootprint,
  passable: ObstacleInstance[],
  config: ClimbConfig,
  sampleTerrainHeight: (p: Vec2) => number,
): ClimbTransform {
  const forward: Vec2 = { x: Math.sin(heading), z: Math.cos(heading) };
  const right: Vec2 = { x: Math.cos(heading), z: -Math.sin(heading) };

  function cornerWorldPos(zOffset: number, sideSign: 1 | -1): Vec2 {
    return {
      x: truckPos.x + forward.x * zOffset + right.x * footprint.halfTrack * sideSign,
      z: truckPos.z + forward.z * zOffset + right.z * footprint.halfTrack * sideSign,
    };
  }

  const cornerPositions = {
    fl: cornerWorldPos(footprint.zFront, -1),
    fr: cornerWorldPos(footprint.zFront, 1),
    rl: cornerWorldPos(footprint.zRear, -1),
    rr: cornerWorldPos(footprint.zRear, 1),
  };

  const cornerHeights = { fl: 0, fr: 0, rl: 0, rr: 0 };
  for (const obstacle of passable) {
    for (const key of Object.keys(cornerPositions) as Array<keyof typeof cornerPositions>) {
      const h = heightField(cornerPositions[key], obstacle, config);
      if (h > cornerHeights[key]) cornerHeights[key] = h;
    }
  }
  // ADR 0017: terrain height is *added* per corner (not maxed against the
  // obstacle hump like different obstacles are against each other above) --
  // see this file's header comment for why that's safe against the existing
  // ADR 0014 tuning.
  for (const key of Object.keys(cornerPositions) as Array<keyof typeof cornerPositions>) {
    cornerHeights[key] += sampleTerrainHeight(cornerPositions[key]);
  }

  const lift = (cornerHeights.fl + cornerHeights.fr + cornerHeights.rl + cornerHeights.rr) / 4;

  // No early "all-zero" return anymore (pre-#49 this checked `lift <=
  // EPSILON`): with terrain height now in the mix, a corner sum can be a
  // small negative number over a hill's gentle dip, and pitch/roll must
  // still reflect that slope. This is safe for the obstacle-only case too --
  // when every corner height is exactly 0 (no obstacle, `sampleTerrainHeight`
  // returning 0), every atan2 below evaluates to exactly 0 anyway, so
  // dropping the early return does not change pre-#49 behavior (pinned by
  // the regression-guard tests).
  const frontAvg = (cornerHeights.fl + cornerHeights.fr) / 2;
  const rearAvg = (cornerHeights.rl + cornerHeights.rr) / 2;
  const leftAvg = (cornerHeights.fl + cornerHeights.rl) / 2;
  const rightAvg = (cornerHeights.fr + cornerHeights.rr) / 2;
  const wheelbase = footprint.zFront - footprint.zRear;
  const track = 2 * footprint.halfTrack;

  // Sign convention (ADR 0013's already-established render convention,
  // unchanged by ADR 0014): front higher -> nose-up -> negative pitch;
  // obstacle under the truck's right -> positive roll. atan2(rearAvg -
  // frontAvg, wheelbase) is negative when the front sits higher, matching.
  const pitch = clamp(Math.atan2(rearAvg - frontAvg, wheelbase) * config.tiltGain, config.maxPitch);
  const roll = clamp(Math.atan2(rightAvg - leftAvg, track) * config.tiltGain, config.maxRoll);

  return { lift, pitch, roll };
}
