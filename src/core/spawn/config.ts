// Spawn timing/cap (animal AC1-AC2). Placeholder/tunable values pending
// playtest (animal Open Q1) — kept as config constants, not scattered
// magic numbers, so they're the one place to retune.
export const SPAWN_INTERVAL_SECONDS = 4;
export const MAX_CONCURRENT_ANIMALS = 1;
/** Minimum distance from the truck's current position a new spawn must respect (animal AC1: "not on top of the player"). */
export const MIN_SPAWN_DISTANCE_FROM_TRUCK = 4;
