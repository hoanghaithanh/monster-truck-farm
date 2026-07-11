import { describe, expect, it } from 'vitest';
import { AnimalSystem } from './animal-system';
import { GameStore } from '../core/game-state';
import { MAX_CONCURRENT_ANIMALS, SPAWN_INTERVAL_SECONDS } from '../core/spawn/config';
import type { Rng } from '../core/spawn/spawn-position';
import type { AnimalSpecies, Vec2 } from '../core/types';

// This module had zero direct test coverage before issue #48 (ADR 0016 §1) --
// species.spawns were only exercised indirectly through fuel-system.test.ts's
// independence check. This file adds real coverage of the one genuinely new
// behavior this feature adds here: the weighted species picker threaded into
// onSpawn.

/** Deterministic RNG that yields a fixed sequence of [0,1) values, cycling if exhausted (same idiom as fuel-system.test.ts's sequenceRng). */
function sequenceRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

const TRUCK_POS: Vec2 = { x: 0, z: 0 };

function noop() {}

// rng()=1 for both x/z maps pickSpawnPosition to the terrain's max corner
// (20,20) -- far from every STUB_OBSTACLES entry and far from a truck parked
// at the origin, so it's a reliable "always valid" spawn point (same
// derivation fuel-system.test.ts's FAR_RNG documents). Each spawn attempt
// then consumes one more rng() call for pickSpecies's roll.
function farPositionThenSpecies(...speciesRolls: number[]): Rng {
  const values: number[] = [];
  for (const roll of speciesRolls) values.push(1, 1, roll);
  return sequenceRng(values);
}

describe('AnimalSystem -- weighted species picker on spawn (issue #48, ADR 0016 §1)', () => {
  it('spawns chicken for a roll in [0, 0.7), passing species through onSpawn and using a chicken-N id', () => {
    const system = new AnimalSystem(new GameStore(), farPositionThenSpecies(0.1));
    const spawns: { id: string; position: Vec2; species: AnimalSpecies }[] = [];
    system.update(SPAWN_INTERVAL_SECONDS, TRUCK_POS, {
      onSpawn: (id, position, species) => spawns.push({ id, position, species }),
      onScatter: noop,
      onRemove: noop,
    });
    expect(spawns).toHaveLength(1);
    expect(spawns[0].species).toBe('chicken');
    expect(spawns[0].id).toMatch(/^chicken-\d+$/);
    expect(spawns[0].position).toEqual({ x: 20, z: 20 });
  });

  it('spawns pig for a roll in [0.7, 0.95), with a pig-N id', () => {
    const system = new AnimalSystem(new GameStore(), farPositionThenSpecies(0.8));
    const spawns: { species: AnimalSpecies; id: string }[] = [];
    system.update(SPAWN_INTERVAL_SECONDS, TRUCK_POS, {
      onSpawn: (id, _position, species) => spawns.push({ id, species }),
      onScatter: noop,
      onRemove: noop,
    });
    expect(spawns[0].species).toBe('pig');
    expect(spawns[0].id).toMatch(/^pig-\d+$/);
  });

  it('spawns cow for a roll in [0.95, 1), with a cow-N id', () => {
    const system = new AnimalSystem(new GameStore(), farPositionThenSpecies(0.99));
    const spawns: { species: AnimalSpecies; id: string }[] = [];
    system.update(SPAWN_INTERVAL_SECONDS, TRUCK_POS, {
      onSpawn: (id, _position, species) => spawns.push({ id, species }),
      onScatter: noop,
      onRemove: noop,
    });
    expect(spawns[0].species).toBe('cow');
    expect(spawns[0].id).toMatch(/^cow-\d+$/);
  });

  it('produces a mix of all three species across repeated spawns, not one hardcoded species (AC3/AC4)', () => {
    const system = new AnimalSystem(new GameStore(), farPositionThenSpecies(0.1, 0.8, 0.99));
    const species: AnimalSpecies[] = [];
    for (let i = 0; i < 3; i++) {
      system.update(SPAWN_INTERVAL_SECONDS, TRUCK_POS, {
        onSpawn: (_id, _position, sp) => species.push(sp),
        onScatter: noop,
        onRemove: noop,
      });
    }
    expect(species).toEqual(['chicken', 'pig', 'cow']);
  });

  it('still respects MAX_CONCURRENT_ANIMALS (raised to 5, issue #48) regardless of species mix', () => {
    const system = new AnimalSystem(new GameStore(), farPositionThenSpecies(0.1, 0.8, 0.99, 0.1, 0.8, 0.1, 0.1));
    const spawns: string[] = [];
    for (let i = 0; i < MAX_CONCURRENT_ANIMALS + 2; i++) {
      system.update(SPAWN_INTERVAL_SECONDS, TRUCK_POS, {
        onSpawn: (id) => spawns.push(id),
        onScatter: noop,
        onRemove: noop,
      });
    }
    expect(spawns).toHaveLength(MAX_CONCURRENT_ANIMALS);
    expect(MAX_CONCURRENT_ANIMALS).toBe(5);
  });
});

describe('AnimalSystem -- boop/scatter/remove is species-agnostic (unchanged mechanics, AC6/AC7)', () => {
  it('a booped pig scatters and despawns exactly like a chicken would, awarding its own (larger) coin value', () => {
    const store = new GameStore();
    const system = new AnimalSystem(store, farPositionThenSpecies(0.8)); // pig
    let spawnedPosition: Vec2 = { x: 0, z: 0 };
    system.update(SPAWN_INTERVAL_SECONDS, TRUCK_POS, {
      onSpawn: (_id, position) => (spawnedPosition = position),
      onScatter: noop,
      onRemove: noop,
    });

    // Drive the truck onto the pig (spawned at the far corner) -- boop
    // contact starts the scatter, coins should already reflect pig's tier
    // (20, per ADR 0016 §1's resolved tiers) even before the scatter finishes.
    const scatters: string[] = [];
    system.update(0.016, spawnedPosition, { onSpawn: noop, onScatter: (id) => scatters.push(id), onRemove: noop });
    expect(store.coins).toBe(20);
    expect(scatters).toHaveLength(1);

    // Advance past the scatter duration -- the animal should despawn.
    const removed: string[] = [];
    system.update(1, TRUCK_POS, { onSpawn: noop, onScatter: noop, onRemove: (id) => removed.push(id) });
    expect(removed).toHaveLength(1);
  });
});
