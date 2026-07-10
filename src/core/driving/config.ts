// Tunable movement constants (ADR 0001 risk mitigation: keep movement feel
// in one config module). Placeholder values pending playtest with the
// target child.
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
 * Tuning knobs for the visual-only obstacle climb (ADR 0013, issue #42):
 * a stateless lift/tilt of the truck rig over `passable` obstacles, derived
 * purely from the truck's current position -- never touches the physics
 * collider or the clearance rule (core/clearance.ts).
 */
export interface ClimbConfig {
  /** Fraction of an obstacle's radius that becomes its peak lift (auto-sizes per class). */
  liftScale: number;
  /** Absolute cap on peak lift (units), so no obstacle floats the truck absurdly. */
  maxLift: number;
  /** Slope -> radians multiplier for pitch/roll. */
  tiltGain: number;
  /** Hard cap on pitch magnitude (radians). */
  maxPitch: number;
  /** Hard cap on roll magnitude (radians); kept small/zero by default to protect AC3 (no chaotic motion). */
  maxRoll: number;
}

// Obstacle radii today (core/terrain.ts's STUB_OBSTACLES): bush 0.6, rock 1.0,
// derelict car 1.8. liftScale=0.35 puts peak lift at ~0.21/0.35/0.63 units --
// a clearly visible bump for each class without floating the rig absurdly;
// maxLift=0.7 only clips the largest obstacle slightly. tiltGain=0.6 keeps
// pitch readable but gentle at these lift magnitudes; maxRoll defaults to 0
// per the ADR's AC3 caution (roll is the more disorientation-prone axis and
// isn't needed for a head-on crossing to read as a climb).
export const DEFAULT_CLIMB_CONFIG: ClimbConfig = {
  liftScale: 0.35,
  maxLift: 0.7,
  tiltGain: 0.6,
  maxPitch: 0.35,
  maxRoll: 0,
};
