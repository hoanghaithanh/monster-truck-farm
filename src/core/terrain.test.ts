import { describe, expect, it } from 'vitest';
import { RIVER_ROUTE, STUB_OBSTACLES, STUB_STRUCTURES, TERRAIN_BOUNDS, TRUCK_START } from './terrain';

describe('TERRAIN_BOUNDS (issue #49, ADR 0017 §Decision-4, AC1)', () => {
  it('is expanded to -50..50 both axes (~6.25x the original 40x40 area)', () => {
    expect(TERRAIN_BOUNDS).toEqual({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });
    const oldArea = 40 * 40;
    const newArea = (TERRAIN_BOUNDS.maxX - TERRAIN_BOUNDS.minX) * (TERRAIN_BOUNDS.maxZ - TERRAIN_BOUNDS.minZ);
    expect(newArea / oldArea).toBeCloseTo(6.25);
  });

  it('TRUCK_START sits well inside the expanded bounds', () => {
    expect(TRUCK_START.x).toBeGreaterThan(TERRAIN_BOUNDS.minX);
    expect(TRUCK_START.x).toBeLessThan(TERRAIN_BOUNDS.maxX);
    expect(TRUCK_START.z).toBeGreaterThan(TERRAIN_BOUNDS.minZ);
    expect(TRUCK_START.z).toBeLessThan(TERRAIN_BOUNDS.maxZ);
  });

  it('every RIVER_ROUTE point sits well inside the expanded bounds', () => {
    for (const point of RIVER_ROUTE) {
      expect(point.x).toBeGreaterThan(TERRAIN_BOUNDS.minX);
      expect(point.x).toBeLessThan(TERRAIN_BOUNDS.maxX);
      expect(point.z).toBeGreaterThan(TERRAIN_BOUNDS.minZ);
      expect(point.z).toBeLessThan(TERRAIN_BOUNDS.maxZ);
    }
  });
});

describe('STUB_STRUCTURES (issue #46, ADR 0012 §1; mountain landmark added issue #47 redesign, ADR 0012 addendum/AC3a)', () => {
  it('has exactly one windmill, one barn, one farmhouse, and one mountain landmark', () => {
    const kinds = STUB_STRUCTURES.map((s) => s.kind).sort();
    expect(kinds).toEqual(['barn', 'farmhouse', 'mountain', 'windmill']);
  });

  it('every structure is collidable (AC2: always-solid, no tier gating)', () => {
    for (const structure of STUB_STRUCTURES) {
      expect(structure.collidable).toBe(true);
    }
  });

  it('every structure sits within TERRAIN_BOUNDS, clear of the edge by at least its own footprint', () => {
    for (const structure of STUB_STRUCTURES) {
      expect(structure.position.x - structure.footprintRadius).toBeGreaterThanOrEqual(TERRAIN_BOUNDS.minX);
      expect(structure.position.x + structure.footprintRadius).toBeLessThanOrEqual(TERRAIN_BOUNDS.maxX);
      expect(structure.position.z - structure.footprintRadius).toBeGreaterThanOrEqual(TERRAIN_BOUNDS.minZ);
      expect(structure.position.z + structure.footprintRadius).toBeLessThanOrEqual(TERRAIN_BOUNDS.maxZ);
    }
  });

  it('no structure overlaps the truck start position (origin) or any STUB_OBSTACLE', () => {
    const truckStart = { x: 0, z: 6 }; // matches main.ts's truckStart
    const minTruckClearance = 4;
    for (const structure of STUB_STRUCTURES) {
      const distToTruck = Math.hypot(structure.position.x - truckStart.x, structure.position.z - truckStart.z);
      expect(distToTruck).toBeGreaterThanOrEqual(structure.footprintRadius + minTruckClearance);

      for (const obstacle of STUB_OBSTACLES) {
        const dist = Math.hypot(structure.position.x - obstacle.position.x, structure.position.z - obstacle.position.z);
        expect(dist).toBeGreaterThanOrEqual(structure.footprintRadius + obstacle.radius);
      }
    }
  });

  it('no two structures overlap each other', () => {
    for (let i = 0; i < STUB_STRUCTURES.length; i++) {
      for (let j = i + 1; j < STUB_STRUCTURES.length; j++) {
        const a = STUB_STRUCTURES[i];
        const b = STUB_STRUCTURES[j];
        const dist = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
        expect(dist).toBeGreaterThanOrEqual(a.footprintRadius + b.footprintRadius);
      }
    }
  });
});

describe('mountain landmark specifically (issue #47 redesign, AC3a: reachable/collidable, inside TERRAIN_BOUNDS -- opposite of the superseded backdrop-ring design)', () => {
  const mountain = STUB_STRUCTURES.find((s) => s.kind === 'mountain');

  it('exists exactly once', () => {
    expect(mountain).toBeDefined();
  });

  it('is collidable (AC3a: same unconditional-solid behavior as windmill/barn/farmhouse)', () => {
    expect(mountain?.collidable).toBe(true);
  });

  it('sits strictly inside TERRAIN_BOUNDS, clear of the edge by at least its own footprint (AC3a: reachable, not a backdrop-outside-bounds ring member)', () => {
    expect(mountain).toBeDefined();
    if (!mountain) return;
    expect(mountain.position.x - mountain.footprintRadius).toBeGreaterThanOrEqual(TERRAIN_BOUNDS.minX);
    expect(mountain.position.x + mountain.footprintRadius).toBeLessThanOrEqual(TERRAIN_BOUNDS.maxX);
    expect(mountain.position.z - mountain.footprintRadius).toBeGreaterThanOrEqual(TERRAIN_BOUNDS.minZ);
    expect(mountain.position.z + mountain.footprintRadius).toBeLessThanOrEqual(TERRAIN_BOUNDS.maxZ);
  });
});
