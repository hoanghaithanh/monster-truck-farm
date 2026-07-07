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
});
