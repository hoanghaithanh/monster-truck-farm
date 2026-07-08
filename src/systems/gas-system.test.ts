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
