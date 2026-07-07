import { describe, expect, it } from 'vitest';
import { isBoopContact, resolveBoop } from './boop';
import { computeCoins } from './coins/coin-formula';
import type { AnimalState } from './types';

const TRUCK_RADIUS = 1;
const ANIMAL_RADIUS = 0.4;

function makeAnimal(overrides: Partial<AnimalState> = {}): AnimalState {
  return {
    id: 'a1',
    species: 'chicken',
    position: { x: 0, z: 0 },
    sizeTier: 'small',
    speedTier: 'fast',
    alive: true,
    ...overrides,
  };
}

describe('isBoopContact — contact detection (animal AC4)', () => {
  it('detects contact when circles overlap (distance less than combined radii)', () => {
    const animal = makeAnimal({ position: { x: 1, z: 0 } }); // distance 1 < 1 + 0.4
    expect(isBoopContact({ x: 0, z: 0 }, TRUCK_RADIUS, animal, ANIMAL_RADIUS)).toBe(true);
  });

  it('does not detect contact when distance exceeds combined radii', () => {
    const animal = makeAnimal({ position: { x: 5, z: 0 } });
    expect(isBoopContact({ x: 0, z: 0 }, TRUCK_RADIUS, animal, ANIMAL_RADIUS)).toBe(false);
  });

  it('boundary case: distance exactly equal to combined radii is NOT contact (strict less-than)', () => {
    const animal = makeAnimal({ position: { x: 1.4, z: 0 } }); // distance == 1 + 0.4 exactly
    expect(isBoopContact({ x: 0, z: 0 }, TRUCK_RADIUS, animal, ANIMAL_RADIUS)).toBe(false);
  });

  it('boundary case: distance just inside combined radii IS contact', () => {
    const animal = makeAnimal({ position: { x: 1.39, z: 0 } });
    expect(isBoopContact({ x: 0, z: 0 }, TRUCK_RADIUS, animal, ANIMAL_RADIUS)).toBe(true);
  });

  it('never reports contact with an already-dead animal, regardless of distance', () => {
    const animal = makeAnimal({ position: { x: 0, z: 0 }, alive: false });
    expect(isBoopContact({ x: 0, z: 0 }, TRUCK_RADIUS, animal, ANIMAL_RADIUS)).toBe(false);
  });

  it('works along both X and Z axes (not just aligned on one)', () => {
    const animal = makeAnimal({ position: { x: 0.6, z: 0.6 } }); // hypot ~0.849 < 1.4
    expect(isBoopContact({ x: 0, z: 0 }, TRUCK_RADIUS, animal, ANIMAL_RADIUS)).toBe(true);
  });
});

describe('resolveBoop — boop resolution (animal AC4b-c, AC5)', () => {
  it('awards coins per the size/speed formula (AC4b)', () => {
    const animal = makeAnimal({ sizeTier: 'medium', speedTier: 'slow' });
    const result = resolveBoop(animal);
    expect(result.coinsAwarded).toBe(computeCoins('medium', 'slow'));
  });

  it('marks the animal as no longer alive, removing it from play (AC4c)', () => {
    const animal = makeAnimal({ alive: true });
    const result = resolveBoop(animal);
    expect(result.animal.alive).toBe(false);
  });

  it('preserves the animal id/species/position/tiers, only flipping alive (does not mutate input)', () => {
    const animal = makeAnimal({ id: 'chicken-42', position: { x: 3, z: 4 } });
    const result = resolveBoop(animal);
    expect(result.animal.id).toBe('chicken-42');
    expect(result.animal.position).toEqual({ x: 3, z: 4 });
    expect(animal.alive).toBe(true); // original object untouched
  });

  it('scales coins with size and speed tier consistently with the coin formula (AC7 relationship)', () => {
    const smallSlow = resolveBoop(makeAnimal({ sizeTier: 'small', speedTier: 'slow' }));
    const largeFast = resolveBoop(makeAnimal({ sizeTier: 'large', speedTier: 'fast' }));
    expect(largeFast.coinsAwarded).toBeGreaterThan(smallSlow.coinsAwarded);
  });
});
