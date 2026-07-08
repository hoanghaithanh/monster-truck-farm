import { describe, expect, it } from 'vitest';
import { GasSystem } from './gas-system';
import { GameStore } from '../core/game-state';

// ADR 0009 §5/Testing: GasSystem ctor gains an optional `initialRemaining`
// param feeding the resume path (gas preserved, not refilled, across a
// voluntary pause). The default keeps every existing fresh-start caller
// byte-for-byte unchanged.
describe('GasSystem constructor seeding (ADR 0009 §2b/§5)', () => {
  it('defaults to a full tank when initialRemaining is omitted (fresh-build behavior unchanged)', () => {
    const store = new GameStore();
    new GasSystem(store, 20, 8);
    expect(store.gas).toBe(20);
  });

  it('seeds the mirror from initialRemaining when provided (resume path)', () => {
    const store = new GameStore();
    new GasSystem(store, 20, 8, 7.5);
    expect(store.gas).toBe(7.5);
  });

  it('clamps initialRemaining to capacity (a smaller tank equipped while paused cannot exceed its own capacity)', () => {
    const store = new GameStore();
    new GasSystem(store, 10, 8, 999);
    expect(store.gas).toBe(10);
  });
});

// ADR 0008 §2/§5: GasSystem stays the single owner/writer of GasState --
// fuel-pickup collection routes through refill() rather than store.setGas
// directly, so the HUD gauge updates immediately and the next update() tick
// doesn't clobber the refill from stale state.
describe('GasSystem.refill (ADR 0008 §2, fuel AC8/AC9)', () => {
  it('adds the amount and updates the store mirror immediately', () => {
    const store = new GameStore();
    const gas = new GasSystem(store, 20, 8, 5);
    gas.refill(15);
    expect(store.gas).toBe(20);
  });

  it('clamps to capacity on a near-full tank (no penalty, no overflow)', () => {
    const store = new GameStore();
    const gas = new GasSystem(store, 20, 8, 18);
    gas.refill(15);
    expect(store.gas).toBe(20);
  });

  it('a subsequent per-frame update() does not clobber the refill (single-owner correctness)', () => {
    const store = new GameStore();
    const gas = new GasSystem(store, 20, 8, 5);
    gas.refill(10);
    expect(store.gas).toBe(15);
    gas.update({ throttle: 0, steer: 0 }, 0, 1); // idle, regen
    expect(store.gas).toBeGreaterThanOrEqual(15); // continues from the refilled value, not the stale pre-refill one
  });
});
