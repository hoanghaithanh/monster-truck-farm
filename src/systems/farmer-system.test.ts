import { describe, expect, it } from 'vitest';
import { FarmerSystem } from './farmer-system';
import { GameStore } from '../core/game-state';

// ADR 0009 §2c/§5/Testing: FarmerSystem.snapshot() + the optional `seed` ctor
// param are the whole-blob carry across a voluntary pause. Round-tripping
// through snapshot() -> new FarmerSystem(seed) must reproduce every field
// exactly, and must NOT re-roll a fresh ABSENT/spawnDelay or reset a
// PURSUING farmer back to ABSENT.
describe('FarmerSystem snapshot/seed round trip (ADR 0009 §2c)', () => {
  it('round-trips a fresh ABSENT farmer: same kind, spawnElapsed, spawnDelay (no re-roll)', () => {
    const store = new GameStore();
    const rngValues = [0.5]; // deterministic spawnDelay pick
    let i = 0;
    const rng = () => rngValues[i++ % rngValues.length];
    const original = new FarmerSystem(store, rng);

    // Tick a bit so spawnElapsed is non-zero without triggering a spawn.
    original.update(1, { x: 0, z: 0 }, { onAppear: () => {}, onMove: () => {}, onBump: () => {} });

    const snap = original.snapshot();
    expect(snap.state.kind).toBe('ABSENT');

    const restored = new FarmerSystem(store, rng, snap);
    expect(restored.snapshot()).toEqual(snap);
  });

  it('round-trips a PURSUING farmer: resumes PURSUING (not reset to ABSENT), same position', () => {
    const store = new GameStore();
    const pursuingSeed = {
      state: { kind: 'PURSUING' as const, position: { x: 3, z: 4 }, spawnElapsed: 0 },
      invuln: { remainingSeconds: 0.4 },
      spawnDelay: 8,
    };
    const restored = new FarmerSystem(store, Math.random, pursuingSeed);
    expect(restored.snapshot()).toEqual(pursuingSeed);
  });

  it('carries the invuln (i-frame) timer across the seed, not reset to 0', () => {
    const store = new GameStore();
    const seed = {
      state: { kind: 'PURSUING' as const, position: { x: 1, z: 1 }, spawnElapsed: 0 },
      invuln: { remainingSeconds: 0.6 },
      spawnDelay: 5,
    };
    const restored = new FarmerSystem(store, Math.random, seed);
    expect(restored.snapshot().invuln.remainingSeconds).toBe(0.6);
  });

  it('keeps spawnElapsed/spawnDelay on an ABSENT seed (no re-roll of the "about to appear" timer)', () => {
    const store = new GameStore();
    const seed = {
      state: { kind: 'ABSENT' as const, position: { x: 0, z: 0 }, spawnElapsed: 4.2 },
      invuln: { remainingSeconds: 0 },
      spawnDelay: 9.1,
    };
    const restored = new FarmerSystem(store, Math.random, seed);
    expect(restored.snapshot()).toEqual(seed);
  });

  it('constructs a fresh ABSENT farmer with default spawnElapsed 0 when no seed is given', () => {
    const store = new GameStore();
    const fresh = new FarmerSystem(store);
    expect(fresh.snapshot().state).toEqual({ kind: 'ABSENT', position: { x: 0, z: 0 }, spawnElapsed: 0 });
  });
});
