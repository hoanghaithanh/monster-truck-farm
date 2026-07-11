import { describe, expect, it } from 'vitest';
import { spawnAnimal } from './spawn-animal';
import { ANIMAL_SPECIES } from './species';

// Animal factory (animal AC3): produces a valid AnimalState from a species def.
describe('spawnAnimal', () => {
  it('produces an AnimalState with the requested id, species, and position', () => {
    const animal = spawnAnimal('animal-1', 'chicken', { x: 3, z: -2 });
    expect(animal.id).toBe('animal-1');
    expect(animal.species).toBe('chicken');
    expect(animal.position).toEqual({ x: 3, z: -2 });
  });

  it('pulls sizeTier and speedTier from the species table (chicken = small/fast)', () => {
    const animal = spawnAnimal('animal-1', 'chicken', { x: 0, z: 0 });
    expect(animal.sizeTier).toBe(ANIMAL_SPECIES.chicken.sizeTier);
    expect(animal.speedTier).toBe(ANIMAL_SPECIES.chicken.speedTier);
    expect(animal.sizeTier).toBe('small');
    expect(animal.speedTier).toBe('fast');
  });

  it('spawns alive', () => {
    const animal = spawnAnimal('animal-1', 'chicken', { x: 0, z: 0 });
    expect(animal.alive).toBe(true);
  });

  // Issue #48 (ADR 0016 §1): pig/cow are additive rows in the same species
  // table -- spawnAnimal itself needed no change, but these parallel cases
  // confirm the two new species resolve correctly through it.
  it('pulls sizeTier and speedTier from the species table (pig = medium/medium)', () => {
    const animal = spawnAnimal('animal-2', 'pig', { x: 1, z: 1 });
    expect(animal.species).toBe('pig');
    expect(animal.sizeTier).toBe(ANIMAL_SPECIES.pig.sizeTier);
    expect(animal.speedTier).toBe(ANIMAL_SPECIES.pig.speedTier);
    expect(animal.sizeTier).toBe('medium');
    expect(animal.speedTier).toBe('medium');
  });

  it('pulls sizeTier and speedTier from the species table (cow = large/medium)', () => {
    const animal = spawnAnimal('animal-3', 'cow', { x: -1, z: 2 });
    expect(animal.species).toBe('cow');
    expect(animal.sizeTier).toBe(ANIMAL_SPECIES.cow.sizeTier);
    expect(animal.speedTier).toBe(ANIMAL_SPECIES.cow.speedTier);
    expect(animal.sizeTier).toBe('large');
    expect(animal.speedTier).toBe('medium');
  });

  it('pig and cow spawn alive too', () => {
    expect(spawnAnimal('animal-2', 'pig', { x: 0, z: 0 }).alive).toBe(true);
    expect(spawnAnimal('animal-3', 'cow', { x: 0, z: 0 }).alive).toBe(true);
  });
});
