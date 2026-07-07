import { describe, expect, it } from 'vitest';
import { canClear, partitionObstacles } from './clearance';
import type { ObstacleInstance } from './types';

// Wheel-tier obstacle clearance (drive AC6-AC9).
describe('canClear', () => {
  it('Tier 0 (small clearance) passes bush (small), blocked by rock (medium) and derelict car (large) — AC6', () => {
    expect(canClear('small', 'small')).toBe(true);
    expect(canClear('small', 'medium')).toBe(false);
    expect(canClear('small', 'large')).toBe(false);
  });

  it('Tier 1 (medium clearance) passes bush and rock, blocked by derelict car — AC7', () => {
    expect(canClear('medium', 'small')).toBe(true);
    expect(canClear('medium', 'medium')).toBe(true);
    expect(canClear('medium', 'large')).toBe(false);
  });

  it('Tier 2 (large clearance) passes all three obstacle classes — AC8', () => {
    expect(canClear('large', 'small')).toBe(true);
    expect(canClear('large', 'medium')).toBe(true);
    expect(canClear('large', 'large')).toBe(true);
  });

  it('exact tier match clears (boundary case: obstacle class == truck clearance)', () => {
    expect(canClear('medium', 'medium')).toBe(true);
  });

  it('one tier short blocks (boundary case: obstacle one class above truck clearance)', () => {
    expect(canClear('small', 'medium')).toBe(false);
    expect(canClear('medium', 'large')).toBe(false);
  });
});

describe('partitionObstacles', () => {
  const bush: ObstacleInstance = { id: 'bush-1', kind: 'bush', sizeClass: 'small', position: { x: 6, z: 0 }, radius: 0.6 };
  const rock: ObstacleInstance = { id: 'rock-1', kind: 'rock', sizeClass: 'medium', position: { x: -6, z: 4 }, radius: 1.0 };
  const car: ObstacleInstance = { id: 'derelict-car-1', kind: 'derelictCar', sizeClass: 'large', position: { x: 0, z: -8 }, radius: 1.8 };
  const obstacles = [bush, rock, car];

  it('Tier 0 truck: bush passable, rock+car blocking — AC6', () => {
    const result = partitionObstacles(obstacles, 'small');
    expect(result.passable).toEqual([bush]);
    expect(result.blocking).toEqual([rock, car]);
  });

  it('Tier 1 truck: bush+rock passable, car blocking — AC7', () => {
    const result = partitionObstacles(obstacles, 'medium');
    expect(result.passable).toEqual([bush, rock]);
    expect(result.blocking).toEqual([car]);
  });

  it('Tier 2 truck: all three passable, nothing blocking — AC8', () => {
    const result = partitionObstacles(obstacles, 'large');
    expect(result.passable).toEqual([bush, rock, car]);
    expect(result.blocking).toEqual([]);
  });

  it('empty obstacle list partitions to two empty arrays', () => {
    const result = partitionObstacles([], 'small');
    expect(result.passable).toEqual([]);
    expect(result.blocking).toEqual([]);
  });
});
