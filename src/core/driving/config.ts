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
 * Global uniform truck size-up factor (ADR 0018 §1, issue #62 -- "bigger
 * truck: proportional size + hitbox scale-up"). Canonically owned here (a
 * plain number, no `three` dependency) and imported by `render/truck-sockets.ts`
 * to scale the visual rig's per-tier tables, so the physical/gameplay
 * collision size (`TRUCK_CONTACT_RADIUS` below) and the visual size can never
 * silently drift apart.
 *
 * Proposed default **1.35** (+35%), playtest range 1.25-1.5 per ADR 0018's
 * Open Question 1 -- this magnitude is implemented-with-defaults, pending a
 * live human playtest pass to confirm (not a code-only decision).
 */
export const TRUCK_SCALE = 1.35;

/**
 * The truck's contact/collision radius, shared by the Rapier collider
 * (physics/world.ts's TruckController) and every gameplay contact check
 * (animal boop, farmer bump, fuel pickup) and the obstacle-climb footprint
 * sampling, so the physical and gameplay collision sizes can never silently
 * drift apart (issue #15). Scaled by the same `TRUCK_SCALE` factor as the
 * truck's visual size (ADR 0018 §1, issue #62) -- kept a single value shared
 * across all 3 body tiers, deliberately not made per-tier, so a bigger body
 * tier doesn't also get a longer boop/bump reach (would stray into
 * `truck-scale-and-suspension.md` AC5's "no rebalance" line).
 */
export const TRUCK_CONTACT_RADIUS = 0.9 * TRUCK_SCALE;

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
//
// Re-tuned 2026-07-11 for ADR 0018 §2 / issue #62's TRUCK_SCALE=1.35 ripple
// (AC4): the widened footprint (combinedRadius = obstacle.radius +
// TRUCK_CONTACT_RADIUS, now bigger) makes lift activate slightly earlier and
// spreads the raised-cosine hump over a larger area, marginally LOWERING
// realized per-corner lift at a given distance -- same direction of effect
// ADR 0014's four-corner move away from a single-point sample had. `maxLift`/
// `maxLiftByClass.large` are scaled up by the same TRUCK_SCALE factor
// (1.8/1.1 -> 2.43/1.485) as a best-tuned default matching the truck's own
// proportional size-up (a bigger truck riding over the same-height obstacle
// plausibly wants a proportionally bigger visual lift too, not the old
// absolute cap). `liftScale`/`tiltGain`/`maxPitch`/`maxRoll` are left
// unscaled: `liftScale` multiplies the obstacle's own (unchanged) radius,
// and the tilt angles are dimensionless atan2 geometry, not world-unit
// magnitudes. Per ADR 0018 §2, this is implemented-with-defaults pending a
// live playtest pass against rock/bush/derelict-car screenshots (same
// discipline as ADR 0014's own re-tune) -- not a final, code-inspection-only
// value.
export const DEFAULT_CLIMB_CONFIG: ClimbConfig = {
  liftScale: 1.6,
  maxLift: 2.43,
  maxLiftByClass: { large: 1.485 },
  tiltGain: 1.0,
  maxPitch: 0.45,
  maxRoll: 0,
};

/**
 * Tuning knobs for the per-wheel independent suspension (ADR 0018 §3, issue
 * #63): a stateless residual layered on top of the whole-body climb lift/tilt
 * above -- `computeClimbTransform` decomposes its four sampled corner heights
 * into `{lift,pitch,roll}` (the rigid plane every wheel shares) plus this
 * config's `travelGain`-scaled, `maxTravel`-clamped leftover per corner (the
 * part the rigid plane can't represent, e.g. the diagonal warp and the
 * left/right lean the chassis intentionally suppresses via `maxRoll=0`).
 */
export interface SuspensionConfig {
  /** Multiplier on each wheel's plane residual; 1.0 = the wheel plants exactly on its own sampled contact height, <1 damps, >1 exaggerates. */
  travelGain: number;
  /** Hard cap (world units) on each wheel's vertical suspension-offset magnitude, so no wheel can visually launch/flip (AC10's anti-chaos clamp) -- same role as ClimbConfig.maxPitch/maxRoll, one axis lower (a linear offset instead of an angle). */
  maxTravel: number;
}

// Proposed defaults per ADR 0018 §3/Open Question 2: travelGain 1.0 is the
// geometrically-honest "plant on contact" default (no exaggeration/damping);
// maxTravel ~0.25 world units is a first-pass guess pending a live playtest
// pass against rock/bush/derelict-car screenshots, same "implemented-with-
// defaults, confirm by playtest" treatment already applied to TRUCK_SCALE and
// DEFAULT_CLIMB_CONFIG above -- not a final, code-inspection-only value.
export const DEFAULT_SUSPENSION_CONFIG: SuspensionConfig = {
  travelGain: 1.0,
  maxTravel: 0.25,
};
