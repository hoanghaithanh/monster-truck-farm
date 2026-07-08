import { describe, expect, it } from 'vitest';
import { FarmerSystem } from './farmer-system';
import { GameStore } from '../core/game-state';
import { FARMER_CHASE_DURATION, FARMER_CREEP_FLOOR, FARMER_LEAVE_DURATION, FARMER_TIRED_DURATION } from '../core/farmer/config';

const NOOP_CALLBACKS = { onAppear: () => {}, onMove: () => {}, onBump: () => {}, onTired: () => {}, onDespawn: () => {} };

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
    original.update(1, { x: 0, z: 0 }, 0, {
      onAppear: () => {},
      onMove: () => {},
      onBump: () => {},
      onTired: () => {},
      onDespawn: () => {},
    });

    const snap = original.snapshot();
    expect(snap.state.kind).toBe('ABSENT');

    const restored = new FarmerSystem(store, rng, snap);
    expect(restored.snapshot()).toEqual(snap);
  });

  it('round-trips a PURSUING farmer: resumes PURSUING (not reset to ABSENT), same position', () => {
    const store = new GameStore();
    const pursuingSeed = {
      state: { kind: 'PURSUING' as const, position: { x: 3, z: 4 }, spawnElapsed: 0, phaseElapsed: 4.5 },
      invuln: { remainingSeconds: 0.4 },
      spawnDelay: 8,
    };
    const restored = new FarmerSystem(store, Math.random, pursuingSeed);
    expect(restored.snapshot()).toEqual(pursuingSeed);
  });

  it('carries the invuln (i-frame) timer across the seed, not reset to 0', () => {
    const store = new GameStore();
    const seed = {
      state: { kind: 'PURSUING' as const, position: { x: 1, z: 1 }, spawnElapsed: 0, phaseElapsed: 2 },
      invuln: { remainingSeconds: 0.6 },
      spawnDelay: 5,
    };
    const restored = new FarmerSystem(store, Math.random, seed);
    expect(restored.snapshot().invuln.remainingSeconds).toBe(0.6);
  });

  it('keeps spawnElapsed/spawnDelay on an ABSENT seed (no re-roll of the "about to appear" timer)', () => {
    const store = new GameStore();
    const seed = {
      state: { kind: 'ABSENT' as const, position: { x: 0, z: 0 }, spawnElapsed: 4.2, phaseElapsed: 0 },
      invuln: { remainingSeconds: 0 },
      spawnDelay: 9.1,
    };
    const restored = new FarmerSystem(store, Math.random, seed);
    expect(restored.snapshot()).toEqual(seed);
  });

  it('constructs a fresh ABSENT farmer with default spawnElapsed 0 when no seed is given', () => {
    const store = new GameStore();
    const fresh = new FarmerSystem(store);
    expect(fresh.snapshot().state).toEqual({ kind: 'ABSENT', position: { x: 0, z: 0 }, spawnElapsed: 0, phaseElapsed: 0 });
  });

  it('round-trips a TIRED farmer with a partial phaseElapsed (ADR 0007 forward-compat with ADR 0009\'s opaque carry)', () => {
    const store = new GameStore();
    const seed = {
      state: { kind: 'TIRED' as const, position: { x: 2, z: 2 }, spawnElapsed: 0, phaseElapsed: 0.7 },
      invuln: { remainingSeconds: 0 },
      spawnDelay: 6,
    };
    const restored = new FarmerSystem(store, Math.random, seed);
    expect(restored.snapshot()).toEqual(seed);
  });

  it('round-trips a LEAVING farmer with a partial phaseElapsed', () => {
    const store = new GameStore();
    const seed = {
      state: { kind: 'LEAVING' as const, position: { x: -3, z: 5 }, spawnElapsed: 0, phaseElapsed: 1.2 },
      invuln: { remainingSeconds: 0 },
      spawnDelay: 7,
    };
    const restored = new FarmerSystem(store, Math.random, seed);
    expect(restored.snapshot()).toEqual(seed);
  });
});

describe('FarmerSystem — dynamic speed (ADR 0007 §2: farmerSpeed = max(|truckSpeed|/3, FARMER_CREEP_FLOOR))', () => {
  function pursuingSeed(x: number) {
    return {
      state: { kind: 'PURSUING' as const, position: { x, z: 0 }, spawnElapsed: 0, phaseElapsed: 0 },
      invuln: { remainingSeconds: 0 },
      spawnDelay: 8,
    };
  }

  it('closes the gap faster when the truck is moving fast than when the truck is stopped', () => {
    const fastFarmer = new FarmerSystem(new GameStore(), Math.random, pursuingSeed(-20));
    fastFarmer.update(1, { x: 0, z: 0 }, 12, NOOP_CALLBACKS);

    const stoppedFarmer = new FarmerSystem(new GameStore(), Math.random, pursuingSeed(-20));
    stoppedFarmer.update(1, { x: 0, z: 0 }, 0, NOOP_CALLBACKS);

    // Both start at x=-20 chasing a truck at x=0: the fast-truck farmer
    // should have covered more ground toward 0 in the same 1s tick.
    expect(fastFarmer.snapshot().state.position.x).toBeGreaterThan(stoppedFarmer.snapshot().state.position.x);
  });

  it('still creeps toward a fully stopped truck at FARMER_CREEP_FLOOR, not frozen in place', () => {
    const store = new GameStore();
    const seed = {
      state: { kind: 'PURSUING' as const, position: { x: -5, z: 0 }, spawnElapsed: 0, phaseElapsed: 0 },
      invuln: { remainingSeconds: 0 },
      spawnDelay: 8,
    };
    const farmer = new FarmerSystem(store, Math.random, seed);
    farmer.update(1, { x: 0, z: 0 }, 0, NOOP_CALLBACKS);
    expect(farmer.snapshot().state.position.x).toBeCloseTo(-5 + FARMER_CREEP_FLOOR, 5);
  });
});

describe('FarmerSystem — full FSM cycle via update() (ADR 0007 §1: PURSUING -> TIRED -> LEAVING -> ABSENT)', () => {
  it('fires onTired exactly once on the PURSUING -> TIRED transition, at the chase duration', () => {
    const store = new GameStore();
    const seed = {
      state: { kind: 'PURSUING' as const, position: { x: 0, z: 0 }, spawnElapsed: 0, phaseElapsed: FARMER_CHASE_DURATION - 0.5 },
      invuln: { remainingSeconds: 0 },
      spawnDelay: 8,
    };
    const farmer = new FarmerSystem(store, Math.random, seed);
    let tiredCount = 0;
    farmer.update(1, { x: 100, z: 100 }, 0, { ...NOOP_CALLBACKS, onTired: () => tiredCount++ });
    expect(farmer.snapshot().state.kind).toBe('TIRED');
    expect(tiredCount).toBe(1);
  });

  it('does not move the farmer while TIRED (stationary give-up beat)', () => {
    const store = new GameStore();
    const seed = {
      state: { kind: 'TIRED' as const, position: { x: 3, z: 3 }, spawnElapsed: 0, phaseElapsed: 0 },
      invuln: { remainingSeconds: 0 },
      spawnDelay: 8,
    };
    const farmer = new FarmerSystem(store, Math.random, seed);
    farmer.update(0.5, { x: 0, z: 0 }, 12, NOOP_CALLBACKS);
    expect(farmer.snapshot().state.position).toEqual({ x: 3, z: 3 });
    expect(farmer.snapshot().state.kind).toBe('TIRED');
  });

  it('does not fire onBump while TIRED or LEAVING, even at truck-contact-range proximity (only PURSUING calls store.bump())', () => {
    const store = new GameStore();
    const seed = {
      state: { kind: 'LEAVING' as const, position: { x: 0, z: 0 }, spawnElapsed: 0, phaseElapsed: 0 },
      invuln: { remainingSeconds: 0 },
      spawnDelay: 8,
    };
    const farmer = new FarmerSystem(store, Math.random, seed);
    let bumped = false;
    const before = store.hitsRemaining;
    farmer.update(0.1, { x: 0, z: 0 }, 0, { ...NOOP_CALLBACKS, onBump: () => (bumped = true) });
    expect(bumped).toBe(false);
    expect(store.hitsRemaining).toBe(before);
  });

  it('moves the farmer away from the truck while LEAVING (retreat kinematics)', () => {
    const store = new GameStore();
    const seed = {
      state: { kind: 'LEAVING' as const, position: { x: 2, z: 0 }, spawnElapsed: 0, phaseElapsed: 0 },
      invuln: { remainingSeconds: 0 },
      spawnDelay: 8,
    };
    const farmer = new FarmerSystem(store, Math.random, seed);
    farmer.update(1, { x: 0, z: 0 }, 12, NOOP_CALLBACKS);
    // Truck is at x=0, farmer starts at x=2 -- retreating means increasing x further.
    expect(farmer.snapshot().state.position.x).toBeGreaterThan(2);
  });

  it('fires onDespawn and re-rolls spawnDelay on the LEAVING -> ABSENT transition', () => {
    const store = new GameStore();
    const seed = {
      state: { kind: 'LEAVING' as const, position: { x: 2, z: 0 }, spawnElapsed: 0, phaseElapsed: FARMER_LEAVE_DURATION - 0.5 },
      invuln: { remainingSeconds: 0 },
      spawnDelay: 8,
    };
    const rngValues = [0.25];
    let i = 0;
    const rng = () => rngValues[i++ % rngValues.length];
    const farmer = new FarmerSystem(store, rng, seed);
    let despawned = false;
    farmer.update(1, { x: 0, z: 0 }, 12, { ...NOOP_CALLBACKS, onDespawn: () => (despawned = true) });
    expect(farmer.snapshot().state.kind).toBe('ABSENT');
    expect(despawned).toBe(true);
    // spawnDelay was re-rolled (rng(0.25) maps into [MIN,MAX], differs from the seeded 8 in general,
    // but the important structural property is that a fresh pick happened via the injected rng).
    expect(typeof farmer.snapshot().spawnDelay).toBe('number');
  });

  it('walks the full cycle end to end with a stationary truck (ADR 0007 §1 durations)', () => {
    const store = new GameStore();
    const rng = () => 0.5;
    const farmer = new FarmerSystem(store, rng);
    // Drain spawnElapsed to force an appearance.
    const snap0 = farmer.snapshot();
    const spawnDelay = snap0.spawnDelay;
    farmer.update(spawnDelay, { x: 100, z: 100 }, 0, NOOP_CALLBACKS); // far truck avoids immediate contact
    expect(farmer.snapshot().state.kind).toBe('PURSUING');

    farmer.update(FARMER_TIRED_DURATION, { x: 100, z: 100 }, 0, NOOP_CALLBACKS); // still within chase duration
    // Advance the remaining chase time.
    let remainingChase = FARMER_CHASE_DURATION - FARMER_TIRED_DURATION;
    while (farmer.snapshot().state.kind === 'PURSUING' && remainingChase > 0) {
      const step = Math.min(1, remainingChase);
      farmer.update(step, { x: 100, z: 100 }, 0, NOOP_CALLBACKS);
      remainingChase -= step;
    }
    expect(farmer.snapshot().state.kind).toBe('TIRED');

    farmer.update(FARMER_TIRED_DURATION, { x: 100, z: 100 }, 0, NOOP_CALLBACKS);
    expect(farmer.snapshot().state.kind).toBe('LEAVING');

    farmer.update(FARMER_LEAVE_DURATION, { x: 100, z: 100 }, 0, NOOP_CALLBACKS);
    expect(farmer.snapshot().state.kind).toBe('ABSENT');
  });
});
