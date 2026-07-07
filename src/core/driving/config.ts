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
