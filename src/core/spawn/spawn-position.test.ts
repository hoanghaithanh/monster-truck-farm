import { describe, expect, it } from 'vitest';
import { pickSpawnPosition, structureKeepouts, type Rng } from './spawn-position';
import type { StructureInstance, TerrainBounds } from '../terrain';
import type { ObstacleInstance } from '../types';

const bounds: TerrainBounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
const obstacles: ObstacleInstance[] = [
  { id: 'bush-1', kind: 'bush', sizeClass: 'small', position: { x: 6, z: 0 }, radius: 0.6 },
  { id: 'rock-1', kind: 'rock', sizeClass: 'medium', position: { x: -6, z: 4 }, radius: 1.0 },
  { id: 'derelict-car-1', kind: 'derelictCar', sizeClass: 'large', position: { x: 0, z: -8 }, radius: 1.8 },
];

/** Deterministic RNG that yields a fixed sequence of [0,1) values, cycling if exhausted. */
function sequenceRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('pickSpawnPosition — spawn AC1 (valid location: within bounds, not on obstacle/truck)', () => {
  it('returns a point within terrain bounds', () => {
    const rng = sequenceRng([0.5, 0.5]);
    const point = pickSpawnPosition({
      bounds,
      obstacles: [],
      truckPosition: { x: -100, z: -100 }, // far away so distance check never blocks
      minDistanceFromTruck: 4,
      rng,
    });
    expect(point).not.toBeNull();
    expect(point!.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(point!.x).toBeLessThanOrEqual(bounds.maxX);
    expect(point!.z).toBeGreaterThanOrEqual(bounds.minZ);
    expect(point!.z).toBeLessThanOrEqual(bounds.maxZ);
  });

  it('maps rng()=0 to the min corner and rng()=1 to the max corner', () => {
    const minCorner = pickSpawnPosition({
      bounds,
      obstacles: [],
      truckPosition: { x: 1000, z: 1000 },
      minDistanceFromTruck: 4,
      rng: sequenceRng([0]),
    });
    expect(minCorner).toEqual({ x: bounds.minX, z: bounds.minZ });

    const maxCorner = pickSpawnPosition({
      bounds,
      obstacles: [],
      truckPosition: { x: -1000, z: -1000 },
      minDistanceFromTruck: 4,
      rng: sequenceRng([1]),
    });
    expect(maxCorner).toEqual({ x: bounds.maxX, z: bounds.maxZ });
  });

  it('rejects a candidate too close to the truck and retries until a valid one is found', () => {
    // First candidate (rng=0.5,0.5 -> origin) is within 4 units of the truck at origin — rejected.
    // Second candidate (rng=0.9,0.9) should be far enough away and accepted.
    const rng = sequenceRng([0.5, 0.5, 0.9, 0.9]);
    const point = pickSpawnPosition({
      bounds,
      obstacles: [],
      truckPosition: { x: 0, z: 0 },
      minDistanceFromTruck: 4,
      rng,
    });
    expect(point).not.toBeNull();
    const dist = Math.hypot(point!.x - 0, point!.z - 0);
    expect(dist).toBeGreaterThanOrEqual(4);
  });

  it('rejects a candidate inside an obstacle-clearance radius', () => {
    // rng=0.5,0.5 -> origin (0,0), well clear of truck but not of any obstacle in this set.
    // Use an obstacle centered at the origin so the first candidate is rejected.
    const centeredObstacle: ObstacleInstance = { id: 'o', kind: 'rock', sizeClass: 'medium', position: { x: 0, z: 0 }, radius: 2 };
    const rng = sequenceRng([0.5, 0.5, 0.9, 0.9]);
    const point = pickSpawnPosition({
      bounds,
      obstacles: [centeredObstacle],
      truckPosition: { x: -1000, z: -1000 },
      minDistanceFromTruck: 4,
      rng,
    });
    expect(point).not.toBeNull();
    const dist = Math.hypot(point!.x - 0, point!.z - 0);
    expect(dist).toBeGreaterThanOrEqual(2 + 0.5); // default obstacleClearance padding is 0.5
  });

  it('returns null when no valid position is found within maxAttempts', () => {
    // Every candidate lands at the same point regardless of rng draw distribution
    // because rng always returns 0.5 -> always the origin, which is inside the truck's exclusion zone.
    const rng = sequenceRng([0.5]);
    const point = pickSpawnPosition({
      bounds,
      obstacles: [],
      truckPosition: { x: 0, z: 0 },
      minDistanceFromTruck: 4,
      rng,
      maxAttempts: 5,
    });
    expect(point).toBeNull();
  });

  it('avoids all three stub-terrain obstacles simultaneously (integration-style check)', () => {
    // Deterministic sequence that walks a diagonal sweep until it clears every obstacle + truck.
    const candidates = [0, 0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.5, 0.65, 0.35];
    const rng = sequenceRng(candidates);
    const point = pickSpawnPosition({
      bounds,
      obstacles,
      truckPosition: { x: 15, z: 15 },
      minDistanceFromTruck: 4,
      rng,
      maxAttempts: 50,
    });
    expect(point).not.toBeNull();
    for (const obstacle of obstacles) {
      const dist = Math.hypot(point!.x - obstacle.position.x, point!.z - obstacle.position.z);
      expect(dist).toBeGreaterThanOrEqual(obstacle.radius + 0.5);
    }
  });
});

describe('structureKeepouts (issue #46, ADR 0012 §5, AC6)', () => {
  const structures: StructureInstance[] = [
    { id: 'windmill-1', kind: 'windmill', position: { x: 12, z: 12 }, footprintRadius: 2, collidable: true },
    { id: 'barn-1', kind: 'barn', position: { x: -12, z: -10 }, footprintRadius: 3, collidable: true },
  ];

  it('maps every collidable structure to a {position, radius} keep-out circle', () => {
    expect(structureKeepouts(structures)).toEqual([
      { position: { x: 12, z: 12 }, radius: 2 },
      { position: { x: -12, z: -10 }, radius: 3 },
    ]);
  });

  it('excludes non-collidable structures (river/mountains, issue #47) from the keep-out set', () => {
    const withNonCollidable: StructureInstance[] = [
      ...structures,
      { id: 'river-1', kind: 'windmill', position: { x: 0, z: 0 }, footprintRadius: 5, collidable: false },
    ];
    expect(structureKeepouts(withNonCollidable)).toHaveLength(2);
  });
});

describe('pickSpawnPosition — AC6 (never spawns inside a structure footprint)', () => {
  it('rejects a candidate inside a structure footprint, same as an obstacle', () => {
    // A single generously-sized structure keep-out centered at the origin --
    // ADR 0012's own risk-mitigation suggestion (a pinned-RNG unit test
    // asserting no point lands within a footprint).
    const structureFootprint = { position: { x: 0, z: 0 }, radius: 4 };
    const rng = sequenceRng([0.5, 0.5, 0.9, 0.9]); // first candidate -> origin (inside footprint), second -> clear
    const point = pickSpawnPosition({
      bounds,
      obstacles: [structureFootprint],
      truckPosition: { x: -1000, z: -1000 },
      minDistanceFromTruck: 4,
      rng,
    });
    expect(point).not.toBeNull();
    const dist = Math.hypot(point!.x, point!.z);
    expect(dist).toBeGreaterThanOrEqual(structureFootprint.radius + 0.5);
  });

  it('combined obstacles + structure keep-out (as every real call site now passes) keeps candidates clear of both', () => {
    const structures: StructureInstance[] = [
      { id: 'barn-1', kind: 'barn', position: { x: 3, z: 3 }, footprintRadius: 2, collidable: true },
    ];
    const combined = [...obstacles, ...structureKeepouts(structures)];
    const candidates = [0, 0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.5, 0.65, 0.35, 0.55, 0.45];
    const rng = sequenceRng(candidates);
    const point = pickSpawnPosition({
      bounds,
      obstacles: combined,
      truckPosition: { x: 15, z: 15 },
      minDistanceFromTruck: 4,
      rng,
      maxAttempts: 50,
    });
    expect(point).not.toBeNull();
    for (const keepout of combined) {
      const dist = Math.hypot(point!.x - keepout.position.x, point!.z - keepout.position.z);
      expect(dist).toBeGreaterThanOrEqual(keepout.radius + 0.5);
    }
  });
});
