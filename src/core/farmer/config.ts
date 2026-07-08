// Tunable farmer constants (ADR 0003 §Decision, farmer AC1/Open Q1 --
// playtest-tunable, matching the spawn/gas config pattern).
import { ENGINE_TIERS } from '../stats/tiers';

/** Random spawn delay range in seconds before the farmer's first appearance (farmer AC1). */
export const FARMER_SPAWN_MIN_SECONDS = 6;
export const FARMER_SPAWN_MAX_SECONDS = 12;

// Sprint 1: constant speed set safely below the lowest engine tier's top
// speed (ADR 0003 "Farmer speed") so the farmer is always outrunnable.
// Guarded by a dev-time assertion rather than just a comment, since this
// safety property is load-bearing for the game's fairness.
export const FARMER_SPEED = 4;
if (FARMER_SPEED >= Math.min(...ENGINE_TIERS.map((t) => t.topSpeed))) {
  throw new Error('FARMER_SPEED must stay below the lowest engine tier top speed (ADR 0003 fairness guarantee).');
}

/** Post-bump invulnerability window (ADR 0003 "Contact cooldown", resolves farmer Open Q1). */
export const FARMER_INVULN_SECONDS = 1.0;

/** Farmer's own contact radius, matching the obstacle/animal radius convention. */
export const FARMER_CONTACT_RADIUS = 0.6;

/** Minimum distance from the truck's current position the farmer may spawn at (mirrors animal spawn config). */
export const FARMER_MIN_SPAWN_DISTANCE_FROM_TRUCK = 8;
