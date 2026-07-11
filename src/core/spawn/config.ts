// Spawn timing/cap (animal AC1-AC2). Placeholder/tunable values pending
// playtest (animal Open Q1) — kept as config constants, not scattered
// magic numbers, so they're the one place to retune.
export const SPAWN_INTERVAL_SECONDS = 4;
// Raised 1 -> 5 for issue #48 (pig/cow species): with three species now
// spawning at a 0.7/0.25/0.05 weighting (animal-system.ts's pickSpecies), a
// cap of 1 would make it near-impossible for a player to ever see more than
// one animal at a time, let alone a reasonable mix of all three (AC4).
export const MAX_CONCURRENT_ANIMALS = 5;
/** Minimum distance from the truck's current position a new spawn must respect (animal AC1: "not on top of the player"). */
export const MIN_SPAWN_DISTANCE_FROM_TRUCK = 4;
