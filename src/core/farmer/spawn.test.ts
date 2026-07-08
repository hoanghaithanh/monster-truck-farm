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

describe('FARMER_SPEED fairness invariant (ADR 0003 "Farmer speed")', () => {
  // config.ts throws at *module load* if this invariant is violated, but a
  // throw-on-import isn't itself a regression-catching test — if a future
  // edit narrowed the margin (e.g. raised FARMER_SPEED close to but still
  // under the lowest tier) without breaking the assertion, nothing here
  // would flag it. This test independently re-derives and checks the
  // invariant against the real tier table so a regression is caught by the
  // suite, not only by the app crashing at runtime.
  it('is genuinely below every engine tier\'s top speed, not just the lowest one', async () => {
    const { FARMER_SPEED } = await import('./config');
    const { ENGINE_TIERS } = await import('../stats/tiers');
    for (const tier of ENGINE_TIERS) {
      expect(FARMER_SPEED).toBeLessThan(tier.topSpeed);
    }
  });

  it('is below the lowest engine tier top speed specifically (the binding constraint)', async () => {
    const { FARMER_SPEED } = await import('./config');
    const { ENGINE_TIERS } = await import('../stats/tiers');
    const lowest = Math.min(...ENGINE_TIERS.map((t) => t.topSpeed));
    expect(FARMER_SPEED).toBeLessThan(lowest);
  });
});

describe('FARMER_SPEED vs gas limp mode fairness invariant (ADR 0005, fixes issue #20)', () => {
  // Re-derives the cross-system invariant that #20 found missing: the
  // nominal-topSpeed check above doesn't cover limp mode, so a truck with an
  // empty tank could drop below FARMER_SPEED and become genuinely
  // unescapable. This independently re-checks the real limpTopSpeed formula
  // against the real tier table so a regression (farmer sped up, or the
  // limp floor lowered/removed) is caught by the suite.
  it('the farmer is still outrunnable at every engine tier\'s limp-mode (empty tank) speed', async () => {
    const { FARMER_SPEED } = await import('./config');
    const { ENGINE_TIERS } = await import('../stats/tiers');
    const { limpTopSpeed } = await import('../gas/gas');
    for (const tier of ENGINE_TIERS) {
      expect(FARMER_SPEED).toBeLessThan(limpTopSpeed(tier.topSpeed));
    }
  });
});
