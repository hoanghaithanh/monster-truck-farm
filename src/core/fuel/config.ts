// Tunable fuel-pickup constants (ADR 0008 §3, fuel Open Q1/Q2 --
// playtest-tunable placeholders, matching the spawn/gas/farmer config
// pattern). Kept in its own `core/fuel/config.ts`, physically separate from
// `core/spawn/config.ts`, so animal and fuel spawn cadence/cap stay
// independent (AC3) -- mirrors how `core/farmer/config.ts` sits apart too.
export const FUEL_SPAWN_INTERVAL_SECONDS = 12;
export const MAX_CONCURRENT_FUEL = 2;
/**
 * Minimum distance from the truck's current position a new pickup may spawn
 * at (mirrors animal/farmer spawn config). Raised 4 -> 4.32 (2026-07-11, ADR
 * 0018 §2 / issue #62): same `Δ ≈ 0.315` truck-contact-radius-growth re-tune
 * as `core/spawn/config.ts`'s `MIN_SPAWN_DISTANCE_FROM_TRUCK`. Best-tuned
 * default; final magnitude pending human playtest (AC4).
 */
export const FUEL_MIN_SPAWN_DISTANCE_FROM_TRUCK = 4.32;
/** Flat gas units restored per pickup, clamped to capacity (AC9/AC11) -- not a percentage. */
export const FUEL_REFILL_AMOUNT = 15;
/** The pickup's own contact radius for the overlap check (AC5). */
export const FUEL_CONTACT_RADIUS = 0.5;
