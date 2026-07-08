// Tunable gas constants (ADR 0004 §Decision, Open Q1: playtest-tunable).
// GAS_TIERS capacity (tiers.ts) is documented in the builder UI as
// "<capacity>s of drive" (see ui/builder.ts) -- a drain rate of 1 unit/s
// makes that label literally true: a full tank lasts exactly `capacity`
// seconds of continuous full-throttle driving.
import { ENGINE_TIERS } from '../stats/tiers';

export const GAS_DRAIN_PER_SECOND = 1;
// Regen is faster than drain so a short idle break meaningfully restores
// the tank without requiring the player to stop for as long as they drove.
export const GAS_REGEN_PER_SECOND = 2;
// ADR 0004 "limp mode" (drive AC11): interpretation (b), a percentage of
// the truck's own top speed (~25%), so engine tier still matters while low on gas.
export const GAS_LIMP_FACTOR = 0.25;

// ADR 0005 (fixes issue #20): a floor on limp speed so it never drops below
// FARMER_SPEED (4) on any engine tier -- proportional limp alone (0.25x)
// falls below the farmer's speed on every tier, letting an empty tank trap
// the player against ADR 0003's "always outrunnable" guarantee. Must stay
// strictly above FARMER_SPEED and strictly below the lowest nominal top
// speed, asserted below (mirrors the assert pattern in core/farmer/config.ts).
export const GAS_LIMP_MIN_SPEED = 5;
if (GAS_LIMP_MIN_SPEED >= Math.min(...ENGINE_TIERS.map((t) => t.topSpeed))) {
  throw new Error('GAS_LIMP_MIN_SPEED must stay below the lowest engine tier top speed (ADR 0005 fairness guarantee).');
}

// Below this speed (units/s) with no throttle counts as "effectively
// stationary" for idle-regen purposes (drive AC12, ADR 0004 idle-detection risk).
export const GAS_IDLE_SPEED_EPSILON = 0.05;
