// Tunable farmer constants (ADR 0003 §Decision, farmer AC1/Open Q1 --
// playtest-tunable, matching the spawn/gas config pattern). Extended by ADR
// 0007 §1/§2 for the full chase-timer FSM and dynamic 1/3-speed.
import { ENGINE_TIERS } from '../stats/tiers';
import { GAS_LIMP_FACTOR } from '../gas/config';

/** Random spawn delay range in seconds before the farmer's first appearance (farmer AC1). */
export const FARMER_SPAWN_MIN_SECONDS = 6;
export const FARMER_SPAWN_MAX_SECONDS = 12;

// ADR 0007 §1: fixed-duration phase timers for the full chase FSM
// (PURSUING -> TIRED -> LEAVING -> ABSENT). Placeholders, playtest-tunable
// (ADR 0007 Open Q3).
/** How long PURSUING runs before giving up, not reset by a bump (ADR 0007 §1). */
export const FARMER_CHASE_DURATION = 10;
/** Friendly "tired" give-up beat duration (ADR 0007 §1, farmer AC7 tone). */
export const FARMER_TIRED_DURATION = 1.5;
/** Retreat-and-despawn duration before returning to ABSENT (ADR 0007 §1). */
export const FARMER_LEAVE_DURATION = 3;

// ADR 0007 §2: dynamic speed = truck's instantaneous velocity / 3, floored
// at a "real minimum speed when stopped" (human-confirmed, ADR 0007 Revision
// note). The Sprint 1 flat FARMER_SPEED = 4 constant is retired from the
// pursuit path -- `farmerSpeed(v) = max(abs(v)/3, FARMER_CREEP_FLOOR)` is now
// computed in systems/farmer-system.ts.
export const FARMER_CREEP_FLOOR = 1.0;

// ADR 0007 §2/§3 Check A -- the load-bearing fairness assertion, replacing
// the retired Sprint-1/ADR-0005 `FARMER_SPEED < limpTopSpeed(tier)` check:
// the farmer's creep floor must stay below the slowest speed a truck can
// ever sustain while flooring throttle -- limp mode on the lowest engine
// tier. Re-derived from ENGINE_TIERS + GAS_LIMP_FACTOR (not a `gas.ts`
// import) so the farmer config stays gas-runtime-ignorant, per ADR 0007's
// developer touch-list #2. Deliberately does NOT re-add the old
// `FARMER_CREEP_FLOOR * FARMER_CHASE_DURATION < FARMER_MIN_SPAWN_DISTANCE`
// guard -- that's now intentionally violated (10 > 8, ADR 0007 §2 Check B).
const lowestLimpSpeed = Math.min(...ENGINE_TIERS.map((t) => t.topSpeed)) * GAS_LIMP_FACTOR;
if (FARMER_CREEP_FLOOR >= lowestLimpSpeed) {
  throw new Error('FARMER_CREEP_FLOOR must stay below the slowest limp-mode speed on any engine tier (ADR 0007 §3 Check A).');
}

/** Post-bump invulnerability window (ADR 0003 "Contact cooldown", resolves farmer Open Q1). */
export const FARMER_INVULN_SECONDS = 1.0;

/** Farmer's own contact radius, matching the obstacle/animal radius convention. */
export const FARMER_CONTACT_RADIUS = 0.6;

/**
 * Minimum distance from the truck's current position the farmer may spawn at
 * (mirrors animal spawn config). Raised 8 -> 8.32 (2026-07-11, ADR 0018 §2 /
 * issue #62): same `Δ ≈ 0.315` truck-contact-radius-growth re-tune as
 * `core/spawn/config.ts`'s `MIN_SPAWN_DISTANCE_FROM_TRUCK`. The
 * `FARMER_CREEP_FLOOR * FARMER_CHASE_DURATION >= FARMER_MIN_SPAWN_DISTANCE_FROM_TRUCK`
 * invariant below (10 >= 8.32) still holds -- re-confirmed by the existing
 * `spawn.test.ts` assertion, which reads these constants live rather than
 * pinning a literal. Best-tuned default; final magnitude pending human
 * playtest (AC4).
 */
export const FARMER_MIN_SPAWN_DISTANCE_FROM_TRUCK = 8.32;
