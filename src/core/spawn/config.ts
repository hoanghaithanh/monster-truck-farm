// Spawn timing/cap (animal AC1-AC2). Placeholder/tunable values pending
// playtest (animal Open Q1) — kept as config constants, not scattered
// magic numbers, so they're the one place to retune.
export const SPAWN_INTERVAL_SECONDS = 4;
// Raised 1 -> 5 for issue #48 (pig/cow species): with three species now
// spawning at a 0.7/0.25/0.05 weighting (animal-system.ts's pickSpecies), a
// cap of 1 would make it near-impossible for a player to ever see more than
// one animal at a time, let alone a reasonable mix of all three (AC4).
export const MAX_CONCURRENT_ANIMALS = 5;
/**
 * Minimum distance from the truck's current position a new spawn must
 * respect (animal AC1: "not on top of the player"). Raised 4 -> 4.32
 * (2026-07-11, ADR 0018 §2 / issue #62): the truck's contact radius grew by
 * `Δ = 0.9 * (TRUCK_SCALE - 1) ≈ 0.315` (measured from truck center, not
 * radius-adjusted), so a spawn at the old 4-unit keep-out now lands closer
 * to the bigger truck's edge -- risking "on top of the player." Best-tuned
 * default per the ADR's formula; final magnitude pending human playtest
 * (AC4 is explicitly playtest-verified, not code-inspection-verified).
 */
export const MIN_SPAWN_DISTANCE_FROM_TRUCK = 4.32;
