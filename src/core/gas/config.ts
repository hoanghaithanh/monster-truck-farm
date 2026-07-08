// Tunable gas constants (ADR 0004 §Decision, Open Q1: playtest-tunable).
// GAS_TIERS capacity (tiers.ts) is documented in the builder UI as
// "<capacity>s of drive" (see ui/builder.ts) -- a drain rate of 1 unit/s
// makes that label literally true: a full tank lasts exactly `capacity`
// seconds of continuous full-throttle driving.
export const GAS_DRAIN_PER_SECOND = 1;
// Regen is faster than drain so a short idle break meaningfully restores
// the tank without requiring the player to stop for as long as they drove.
export const GAS_REGEN_PER_SECOND = 2;
// ADR 0004 "limp mode" (drive AC11): interpretation (b), a percentage of
// the truck's own top speed (~25%), so engine tier still matters while low on gas.
export const GAS_LIMP_FACTOR = 0.25;
// Below this speed (units/s) with no throttle counts as "effectively
// stationary" for idle-regen purposes (drive AC12, ADR 0004 idle-detection risk).
export const GAS_IDLE_SPEED_EPSILON = 0.05;
