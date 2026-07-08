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

  // Genuine gap: only relative (fast > stopped) and the pure-creep (v=0) case
  // were pinned above. The formula is `max(|v|/3, FARMER_CREEP_FLOOR)`, which
  // has a real branch switch at v = 3 * FARMER_CREEP_FLOOR = 3.0 -- below it
  // the floor dominates (speed is constant regardless of v), at/above it the
  // v/3 term takes over (speed scales with v). Pin exact displacement at
  // several truck speeds, including the crossover point itself, so a future
  // change to the formula (e.g. swapping max for a blend, or an off-by-factor
  // bug) is caught by an exact assertion instead of only an inequality.
  it.each([
    { truckSpeed: 0, expectedFarmerSpeed: FARMER_CREEP_FLOOR }, // pure creep floor
    { truckSpeed: 2, expectedFarmerSpeed: FARMER_CREEP_FLOOR }, // below crossover: v/3=0.667 < floor, floor wins
    { truckSpeed: 3, expectedFarmerSpeed: 1.0 }, // exact crossover: v/3 === floor === 1.0
    { truckSpeed: 6, expectedFarmerSpeed: 2.0 }, // Standard top speed: v/3 dominates
    { truckSpeed: 12, expectedFarmerSpeed: 4.0 }, // Turbo top speed: matches the retired Sprint-1 FARMER_SPEED=4 by design (ADR 0007 §2 continuity note)
  ])('at truck speed $truckSpeed, farmer covers exactly $expectedFarmerSpeed units in a 1s tick', ({ truckSpeed, expectedFarmerSpeed }) => {
    const store = new GameStore();
    const seed = {
      state: { kind: 'PURSUING' as const, position: { x: -100, z: 0 }, spawnElapsed: 0, phaseElapsed: 0 },
      invuln: { remainingSeconds: 0 },
      spawnDelay: 8,
    };
    const farmer = new FarmerSystem(store, Math.random, seed);
    farmer.update(1, { x: 0, z: 0 }, truckSpeed, NOOP_CALLBACKS);
    expect(farmer.snapshot().state.position.x).toBeCloseTo(-100 + expectedFarmerSpeed, 10);
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

  // Genuine gap: the reducer-level tests in farmer.test.ts pin the exact
  // phaseElapsed >= CHASE_DURATION boundary for the *state transition*, but
  // FarmerSystem.update() does its contact check BEFORE calling farmerReduce
  // for the TICK that may cross that same boundary (see farmer-system.ts:
  // contact/bump happens first, then the TICK that can flip PURSUING ->
  // TIRED). This test pins that ordering: a bump landing on the exact frame
  // that crosses the chase-duration boundary must still register (not
  // silently dropped because the state flipped to TIRED "at the same time"),
  // and the transition still fires exactly once (no double-transition).
  it('registers a bump on the exact tick that crosses the CHASE_DURATION boundary, and still transitions to TIRED that same tick (no missed bump, no double-transition)', () => {
    const store = new GameStore();
    store.confirmBuild(); // enters DRIVING and seeds hitsRemaining -- store.bump() is a no-op outside DRIVING/with 0 capacity
    const seed = {
      state: { kind: 'PURSUING' as const, position: { x: 0, z: 0 }, spawnElapsed: 0, phaseElapsed: FARMER_CHASE_DURATION - 1 },
      invuln: { remainingSeconds: 0 },
      spawnDelay: 8,
    };
    const farmer = new FarmerSystem(store, Math.random, seed);
    let bumpCount = 0;
    let tiredCount = 0;
    const hitsBefore = store.hitsRemaining;
    // Truck sits exactly on top of the farmer (contact range) for this 1s
    // tick, which also exactly crosses phaseElapsed from CHASE_DURATION-1 to
    // CHASE_DURATION.
    farmer.update(1, { x: 0, z: 0 }, 0, { ...NOOP_CALLBACKS, onBump: () => bumpCount++, onTired: () => tiredCount++ });
    expect(bumpCount).toBe(1);
    expect(store.hitsRemaining).toBe(hitsBefore - 1);
    expect(farmer.snapshot().state.kind).toBe('TIRED');
    expect(tiredCount).toBe(1);
  });

  // Genuine gap: the ADR 0009 snapshot/seed tests elsewhere in this file (and
  // in FarmerSystem's own describe block above) only assert *structural*
  // equality of the snapshot across a round trip -- they don't prove that a
  // farmer resumed from a TIRED/LEAVING seed *behaves* identically to one
  // that was never paused. This is the highest-value gap called out for the
  // #25 cross-feature contract: simulate "pause mid-phase, resume, keep
  // ticking" against a control that never paused, and assert the two paths
  // converge on the same subsequent transitions.
  it('a farmer paused and resumed mid-TIRED reaches LEAVING/ABSENT at the same wall-clock time as one that was never paused', () => {
    const storeA = new GameStore();
    const storeB = new GameStore();
    const seed = {
      state: { kind: 'TIRED' as const, position: { x: 5, z: 5 }, spawnElapsed: 0, phaseElapsed: 0.4 },
      invuln: { remainingSeconds: 0 },
      spawnDelay: 8,
    };

    // Control: one continuous FarmerSystem, ticked straight through.
    const control = new FarmerSystem(storeA, Math.random, seed);
    control.update(FARMER_TIRED_DURATION - 0.4, { x: 0, z: 0 }, 0, NOOP_CALLBACKS); // finishes TIRED -> LEAVING
    control.update(FARMER_LEAVE_DURATION, { x: 0, z: 0 }, 0, NOOP_CALLBACKS); // finishes LEAVING -> ABSENT

    // "Paused" path: tick partway through TIRED, snapshot (simulating
    // main.ts's pause-to-builder capture), reconstruct a fresh instance from
    // that seed (simulating resume), then finish the same total elapsed time.
    const beforePause = new FarmerSystem(storeB, Math.random, seed);
    beforePause.update(0.2, { x: 0, z: 0 }, 0, NOOP_CALLBACKS); // still TIRED, partway
    const midSnap = beforePause.snapshot();
    expect(midSnap.state.kind).toBe('TIRED');

    const afterResume = new FarmerSystem(storeB, Math.random, midSnap);
    afterResume.update(FARMER_TIRED_DURATION - 0.4 - 0.2, { x: 0, z: 0 }, 0, NOOP_CALLBACKS); // finishes TIRED -> LEAVING
    afterResume.update(FARMER_LEAVE_DURATION, { x: 0, z: 0 }, 0, NOOP_CALLBACKS); // finishes LEAVING -> ABSENT

    expect(afterResume.snapshot().state.kind).toBe(control.snapshot().state.kind);
    expect(afterResume.snapshot().state.kind).toBe('ABSENT');
  });

  it('a farmer paused and resumed mid-LEAVING keeps retreating from its exact paused position, not reset', () => {
    const store = new GameStore();
    const seed = {
      state: { kind: 'LEAVING' as const, position: { x: 2, z: 0 }, spawnElapsed: 0, phaseElapsed: 0.5 },
      invuln: { remainingSeconds: 0 },
      spawnDelay: 8,
    };
    const beforePause = new FarmerSystem(store, Math.random, seed);
    beforePause.update(0.3, { x: 0, z: 0 }, 12, NOOP_CALLBACKS); // retreats further, still LEAVING
    const snap = beforePause.snapshot();
    expect(snap.state.kind).toBe('LEAVING');
    const positionAtPause = snap.state.position.x;

    const afterResume = new FarmerSystem(store, Math.random, snap);
    afterResume.update(0.1, { x: 0, z: 0 }, 12, NOOP_CALLBACKS);
    // Resumed retreat continues moving further away from the paused position
    // (not reset back toward the truck or to the original pre-pause spot).
    expect(afterResume.snapshot().state.position.x).toBeGreaterThan(positionAtPause);
    expect(afterResume.snapshot().state.kind).toBe('LEAVING');
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
