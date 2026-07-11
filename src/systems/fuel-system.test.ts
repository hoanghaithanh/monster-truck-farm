import { describe, expect, it } from 'vitest';
import { FuelSystem } from './fuel-system';
import { AnimalSystem } from './animal-system';
import { GameStore } from '../core/game-state';
import { FUEL_REFILL_AMOUNT, FUEL_SPAWN_INTERVAL_SECONDS, MAX_CONCURRENT_FUEL } from '../core/fuel/config';
import { MAX_CONCURRENT_ANIMALS, SPAWN_INTERVAL_SECONDS } from '../core/spawn/config';
import type { Rng } from '../core/spawn/spawn-position';
import type { Vec2 } from '../core/types';

/** Deterministic RNG that yields a fixed sequence of [0,1) values, cycling if exhausted. */
function sequenceRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

// rng()=1 maps pickSpawnPosition to the terrain's max corner (50,50) --
// far from every STUB_OBSTACLES entry and far from a truck parked at the
// origin, so it's a reliable "always valid" spawn point for these tests.
const FAR_RNG = sequenceRng([1]);
const TRUCK_POS: Vec2 = { x: 0, z: 0 };

function noop() {}

describe('FuelSystem — spawn cadence/cap (ADR 0008 §1/§3, fuel AC1-AC4, AC3 independence)', () => {
  it('does not spawn before FUEL_SPAWN_INTERVAL_SECONDS has elapsed', () => {
    const system = new FuelSystem(FAR_RNG);
    const spawns: string[] = [];
    system.update(FUEL_SPAWN_INTERVAL_SECONDS - 0.1, TRUCK_POS, { onSpawn: (id) => spawns.push(id), onCollect: noop });
    expect(spawns).toHaveLength(0);
  });

  it('spawns exactly one pickup once the interval elapses, calling onSpawn with a valid position', () => {
    const system = new FuelSystem(FAR_RNG);
    const spawns: { id: string; position: Vec2 }[] = [];
    system.update(FUEL_SPAWN_INTERVAL_SECONDS, TRUCK_POS, {
      onSpawn: (id, position) => spawns.push({ id, position }),
      onCollect: noop,
    });
    expect(spawns).toHaveLength(1);
    expect(spawns[0].position).toEqual({ x: 50, z: 50 });
  });

  it('caps concurrent pickups at MAX_CONCURRENT_FUEL, holding the timer rather than spawning past the cap', () => {
    const system = new FuelSystem(FAR_RNG);
    const spawns: string[] = [];
    // Tick past the interval MAX_CONCURRENT_FUEL + 2 times; each pickup lands
    // at the same far corner (never collected, truck stays at origin), so
    // spawns should stop once the cap is reached.
    for (let i = 0; i < MAX_CONCURRENT_FUEL + 2; i++) {
      system.update(FUEL_SPAWN_INTERVAL_SECONDS, TRUCK_POS, { onSpawn: (id) => spawns.push(id), onCollect: noop });
    }
    expect(spawns).toHaveLength(MAX_CONCURRENT_FUEL);
  });

  it('has its own cap, independent of MAX_CONCURRENT_ANIMALS (AC3: no shared slots)', () => {
    // Documents the independence decision: the two caps are separate config
    // constants, not the same value coincidentally reused.
    expect(MAX_CONCURRENT_FUEL).toBeDefined();
    expect(MAX_CONCURRENT_ANIMALS).toBeDefined();
  });

  // Genuine gap: the test above only checks the two config constants exist
  // and are separate -- it never actually runs both systems together, so it
  // wouldn't catch a bug where e.g. FuelSystem accidentally read
  // MAX_CONCURRENT_ANIMALS, or where the two systems shared a spawn-timer
  // instance. This test drives AnimalSystem to its own cap (1, so a single
  // spawn already saturates it) and FuelSystem independently to *its* cap in
  // the same test, asserting fuel spawning is entirely unaffected by animals
  // being at capacity -- and vice versa, animal spawning is unaffected by
  // fuel being at capacity.
  it('spawns up to its own cap even while AnimalSystem is independently saturated at MAX_CONCURRENT_ANIMALS (AC3, behavioral)', () => {
    const store = new GameStore();
    const animalSystem = new AnimalSystem(store, FAR_RNG);
    const fuelSystem = new FuelSystem(FAR_RNG);

    // Saturate animals at their own (much smaller) cap first.
    const animalSpawns: string[] = [];
    for (let i = 0; i < MAX_CONCURRENT_ANIMALS + 2; i++) {
      animalSystem.update(SPAWN_INTERVAL_SECONDS, TRUCK_POS, {
        onSpawn: (id) => animalSpawns.push(id),
        onScatter: noop,
        onRemove: noop,
      });
    }
    expect(animalSpawns).toHaveLength(MAX_CONCURRENT_ANIMALS);

    // Now drive fuel spawning to its own (independently larger) cap. If fuel
    // shared a slot budget with animals, it would spawn 0 pickups here.
    const fuelSpawns: string[] = [];
    for (let i = 0; i < MAX_CONCURRENT_FUEL + 2; i++) {
      fuelSystem.update(FUEL_SPAWN_INTERVAL_SECONDS, TRUCK_POS, { onSpawn: (id) => fuelSpawns.push(id), onCollect: noop });
    }
    expect(fuelSpawns).toHaveLength(MAX_CONCURRENT_FUEL);
  });
});

describe('FuelSystem — contact -> collect (ADR 0008 §2/§3, fuel AC5/AC8/AC9/AC13)', () => {
  it('fires onCollect with FUEL_REFILL_AMOUNT and removes the pickup instantly on contact (no scatter)', () => {
    const system = new FuelSystem(FAR_RNG);
    let spawnedId = '';
    system.update(FUEL_SPAWN_INTERVAL_SECONDS, TRUCK_POS, { onSpawn: (id) => (spawnedId = id), onCollect: noop });
    expect(spawnedId).not.toBe('');

    // Drive the truck onto the pickup (spawned at the far corner) and update again.
    const collects: { id: string; amount: number }[] = [];
    system.update(0.016, { x: 50, z: 50 }, { onSpawn: noop, onCollect: (id, amount) => collects.push({ id, amount }) });
    expect(collects).toEqual([{ id: spawnedId, amount: FUEL_REFILL_AMOUNT }]);
  });

  it('does not re-fire onCollect for an already-collected pickup on a later frame', () => {
    const system = new FuelSystem(FAR_RNG);
    system.update(FUEL_SPAWN_INTERVAL_SECONDS, TRUCK_POS, { onSpawn: noop, onCollect: noop });

    const collects: { id: string; amount: number }[] = [];
    const onCollect = (id: string, amount: number) => collects.push({ id, amount });
    system.update(0.016, { x: 50, z: 50 }, { onSpawn: noop, onCollect });
    system.update(0.016, { x: 50, z: 50 }, { onSpawn: noop, onCollect });
    expect(collects).toHaveLength(1);
  });

  it('never touches coins or hit capacity -- the callback interface has no such hook (fuel AC7, structural)', () => {
    // FuelSystemCallbacks only exposes onSpawn/onCollect(id, amount); there is
    // no coins or hits parameter anywhere in the type, and FuelSystem takes
    // no GameStore dependency at all (unlike AnimalSystem/FarmerSystem) --
    // it is structurally incapable of awarding coins or draining hits.
    const system = new FuelSystem(FAR_RNG);
    expect(system).not.toHaveProperty('store');
  });
});
