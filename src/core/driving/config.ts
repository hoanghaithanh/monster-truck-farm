// Tunable movement constants (ADR 0001 risk mitigation: keep movement feel
// in one config module). Placeholder values pending playtest with the
// target child.
import type { ObstacleClass } from '../types';

export interface DrivingConfig {
  /** units/s^2 while throttle is held forward. */
  acceleration: number;
  /** units/s^2 while braking (throttle held back while still moving forward). */
  braking: number;
  /** units/s^2 coast-to-stop when no throttle is held. */
  friction: number;
  /** radians/s steering rate at full lock. */
  turnRate: number;
  /** reverse top speed as a fraction of the truck's forward top speed. */
  reverseSpeedFactor: number;
}

export const DEFAULT_DRIVING_CONFIG: DrivingConfig = {
  acceleration: 6,
  braking: 10,
  friction: 4,
  turnRate: 2.2,
  reverseSpeedFactor: 0.5,
};

/**
 * The truck's contact/collision radius, shared by the Rapier collider
 * (physics/world.ts's TruckController) and every gameplay contact check
 * (animal boop, farmer bump) so the physical and gameplay collision sizes
 * can never silently drift apart (issue #15).
 */
export const TRUCK_CONTACT_RADIUS = 0.9;

/**
 * Tuning knobs for the visual-only obstacle climb (ADR 0013, reworked by
 * ADR 0014 to four-corner/per-wheel sampling, issue #42): a stateless
 * lift/tilt of the truck rig over `passable` obstacles, derived purely from
 * the truck's current position/heading and its wheel footprint -- never
 * touches the physics collider or the clearance rule (core/clearance.ts).
 */
export interface ClimbConfig {
  /** Fraction of an obstacle's radius that becomes its (single-point) peak height-field value (auto-sizes per class). */
  liftScale: number;
  /** Absolute cap on the height field's peak (units), so no obstacle floats the truck absurdly. */
  maxLift: number;
  /**
   * Optional per-`sizeClass` override of `maxLift` (ADR 0013 "Tuning knobs" --
   * "optional maxLiftByClass override table ... if playtest wants per-class
   * hand-tuning instead of the radius-derived default"). Needed because the
   * render layer's obstacle geometry doesn't scale height with `radius`
   * uniformly across kinds (render/scene.ts's buildObstacleGeometry): bush/
   * rock height IS ~2*radius, but derelictCar height is a fixed 1.2 units
   * regardless of radius -- so a single `liftScale * radius` formula
   * overshoots badly for the large/derelict-car class. Keyed by the
   * already-available `sizeClass` (not `kind`) so computeClimbTransform stays
   * agnostic to obstacle kind, per ADR 0001 §4 purity.
   */
  maxLiftByClass?: Partial<Record<ObstacleClass, number>>;
  /**
   * Pitch/roll exaggeration dial (ADR 0014 -- meaning changed from ADR 0013).
   * `pitch`/`roll` are now `atan2(...)` of an actual finite-difference height
   * delta between wheel pairs, i.e. already a true geometric angle -- so
   * `tiltGain` no longer converts a slope into radians, it's a pure
   * multiplier on top of that honest angle. ~1.0 is geometrically truthful;
   * >1 exaggerates the tilt for readability, <1 dampens it.
   */
  tiltGain: number;
  /** Hard cap on pitch magnitude (radians). */
  maxPitch: number;
  /** Hard cap on roll magnitude (radians); kept small/zero by default to protect AC3 (no chaotic motion). */
  maxRoll: number;
}

// Retuned 2026-07 for ADR 0014's four-corner sampling (issue #42 acceptance
// follow-up #2): moving from one center sample to a mean of four wheel-corner
// samples systematically LOWERS realized lift for the same liftScale/maxLift
// -- no corner ever sits exactly at an obstacle's center the way the old
// single-point sample did (ADR 0014 Consequences). The single-center-tuned
// values (liftScale 1.0 / maxLift 1.1 / maxLiftByClass.large 0.75) read as
// too low/floaty-underneath under 4-corner averaging and were re-tuned
// upward against live rock/bush/derelict-car screenshots (the rock
// specifically -- the obstacle that motivated ADR 0014 -- no longer visually
// clips through the cab at any point in the crossing with these numbers).
//
// Actual rendered heights today (core/terrain.ts's STUB_OBSTACLES radii,
// render/scene.ts's buildObstacleGeometry):
//   bush   (small,  radius 0.6): SphereGeometry      -> height ~= 2*radius = 1.2
//   rock   (medium, radius 1.0): IcosahedronGeometry  -> height ~= 2*radius = 2.0
//   derelictCar (large, radius 1.8): BoxGeometry, FIXED height 1.2 regardless of radius
//
// tiltGain=1.0 is the geometrically-honest default (ADR 0014): pitch/roll
// are now true atan2 angles between wheel-pair height deltas, so 1.0 applies
// no exaggeration; kept at 1.0 rather than pushed higher since the 4-corner
// lift increase alone was enough to fix the visual clipping in screenshots.
export const DEFAULT_CLIMB_CONFIG: ClimbConfig = {
  liftScale: 1.6,
  maxLift: 1.8,
  maxLiftByClass: { large: 1.1 },
  tiltGain: 1.0,
  maxPitch: 0.45,
  maxRoll: 0,
};
