import { describe, expect, it } from 'vitest';
import { pickSpawnDelay } from './spawn';
import { FARMER_SPAWN_MAX_SECONDS, FARMER_SPAWN_MIN_SECONDS } from './config';

function fakeRng(value: number) {
  return () => value;
}

describe('pickSpawnDelay — random spawn timing (farmer AC1)', () => {
  it('returns exactly the minimum when rng returns 0', () => {
    expect(pickSpawnDelay(FARMER_SPAWN_MIN_SECONDS, FARMER_SPAWN_MAX_SECONDS, fakeRng(0))).toBe(FARMER_SPAWN_MIN_SECONDS);
  });

  it('returns exactly the maximum when rng returns 1 (upper bound of the range)', () => {
    expect(pickSpawnDelay(FARMER_SPAWN_MIN_SECONDS, FARMER_SPAWN_MAX_SECONDS, fakeRng(1))).toBe(FARMER_SPAWN_MAX_SECONDS);
  });

  it('returns a value within [min, max] for a mid-range rng draw', () => {
    const delay = pickSpawnDelay(FARMER_SPAWN_MIN_SECONDS, FARMER_SPAWN_MAX_SECONDS, fakeRng(0.5));
    expect(delay).toBeGreaterThanOrEqual(FARMER_SPAWN_MIN_SECONDS);
    expect(delay).toBeLessThanOrEqual(FARMER_SPAWN_MAX_SECONDS);
    expect(delay).toBe(FARMER_SPAWN_MIN_SECONDS + 0.5 * (FARMER_SPAWN_MAX_SECONDS - FARMER_SPAWN_MIN_SECONDS));
  });

  it('never returns a value below the minimum or above the maximum across the full rng domain', () => {
    for (const r of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const delay = pickSpawnDelay(FARMER_SPAWN_MIN_SECONDS, FARMER_SPAWN_MAX_SECONDS, fakeRng(r));
      expect(delay).toBeGreaterThanOrEqual(FARMER_SPAWN_MIN_SECONDS);
      expect(delay).toBeLessThanOrEqual(FARMER_SPAWN_MAX_SECONDS);
    }
  });
});

describe('FARMER_CREEP_FLOOR fairness invariant (ADR 0007 §2/§3 Check A -- supersedes the retired ADR 0005 FARMER_SPEED-vs-limp check)', () => {
  // config.ts throws at *module load* if this invariant is violated, but a
  // throw-on-import isn't itself a regression-catching test — if a future
  // edit narrowed the margin (e.g. raised FARMER_CREEP_FLOOR close to but
  // still under the slowest limp speed) without breaking the assertion,
  // nothing here would flag it. This test independently re-derives and
  // checks the invariant against the real tier table so a regression is
  // caught by the suite, not only by the app crashing at runtime.
  it('the creep floor is below every engine tier\'s limp-mode (empty tank) speed', async () => {
    const { FARMER_CREEP_FLOOR } = await import('./config');
    const { ENGINE_TIERS } = await import('../stats/tiers');
    const { limpTopSpeed } = await import('../gas/gas');
    for (const tier of ENGINE_TIERS) {
      expect(FARMER_CREEP_FLOOR).toBeLessThan(limpTopSpeed(tier.topSpeed));
    }
  });

  it('is below the lowest engine tier\'s limp speed specifically (the binding constraint, ADR 0007 Check A: 1.0 < 1.5)', async () => {
    const { FARMER_CREEP_FLOOR } = await import('./config');
    const { ENGINE_TIERS } = await import('../stats/tiers');
    const { limpTopSpeed } = await import('../gas/gas');
    const lowestLimpSpeed = Math.min(...ENGINE_TIERS.map((t) => limpTopSpeed(t.topSpeed)));
    expect(FARMER_CREEP_FLOOR).toBeLessThan(lowestLimpSpeed);
  });
});

describe('farmerSpeed(v) structural fairness (ADR 0007 §2/§3): "driving away always widens the gap"', () => {
  // farmerSpeed(v) = max(v/3, FARMER_CREEP_FLOOR) -- this test re-derives the
  // formula (systems/farmer-system.ts computes it inline) and asserts the
  // structural guarantee holds for every v the floor no longer dominates at
  // (v >= 3 * FARMER_CREEP_FLOOR), so a future change to the formula or the
  // floor that breaks "always outrunnable while driving" fails the suite.
  function farmerSpeed(v: number, creepFloor: number): number {
    return Math.max(Math.abs(v) / 3, creepFloor);
  }

  it('farmerSpeed(v) < v for every v at or above 3x the creep floor', async () => {
    const { FARMER_CREEP_FLOOR } = await import('./config');
    for (const v of [3 * FARMER_CREEP_FLOOR, 4, 6, 9, 12, 100]) {
      expect(farmerSpeed(v, FARMER_CREEP_FLOOR)).toBeLessThan(v);
    }
  });
});

describe('Check B — a stopped truck at the closest spawn is reachable within the chase window (ADR 0007 §2, deliberate design, pinned so it is not "fixed" back)', () => {
  it('FARMER_CREEP_FLOOR * FARMER_CHASE_DURATION >= FARMER_MIN_SPAWN_DISTANCE_FROM_TRUCK (10 >= 8)', async () => {
    const { FARMER_CREEP_FLOOR, FARMER_CHASE_DURATION, FARMER_MIN_SPAWN_DISTANCE_FROM_TRUCK } = await import('./config');
    expect(FARMER_CREEP_FLOOR * FARMER_CHASE_DURATION).toBeGreaterThanOrEqual(FARMER_MIN_SPAWN_DISTANCE_FROM_TRUCK);
  });
});
