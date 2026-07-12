import { describe, expect, it } from 'vitest';
import {
  DECORATIVE_CROPS,
  DECORATIVE_TREES,
  RIVER_ROUTE,
  STUB_FENCES,
  STUB_FIELDS,
  STUB_OBSTACLES,
  STUB_STRUCTURES,
  TERRAIN_BOUNDS,
  TREE_COLLIDER_RADIUS,
  TRUCK_START,
} from './terrain';

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

describe('STUB_STRUCTURES (issue #46, ADR 0012 §1; mountain landmark added issue #47 redesign, ADR 0012 addendum/AC3a; silo/chickenCoop added issue #54/ADR 0019 §4)', () => {
  it('has exactly one windmill, one barn, one farmhouse, one mountain landmark, one silo, and one chicken coop', () => {
    const kinds = STUB_STRUCTURES.map((s) => s.kind).sort();
    expect(kinds).toEqual(['barn', 'chickenCoop', 'farmhouse', 'mountain', 'silo', 'windmill']);
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

describe('STUB_FENCES (issue #54, ADR 0019 §1/§6, AC8)', () => {
  it('has at least 4 segments (ADR 0019 §6 suggests 4-8)', () => {
    expect(STUB_FENCES.length).toBeGreaterThanOrEqual(4);
  });

  it('every id is unique', () => {
    const ids = STUB_FENCES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every fence sits within TERRAIN_BOUNDS, clear of the edge by at least its own footprint', () => {
    for (const fence of STUB_FENCES) {
      expect(fence.position.x - fence.footprintRadius).toBeGreaterThanOrEqual(TERRAIN_BOUNDS.minX);
      expect(fence.position.x + fence.footprintRadius).toBeLessThanOrEqual(TERRAIN_BOUNDS.maxX);
      expect(fence.position.z - fence.footprintRadius).toBeGreaterThanOrEqual(TERRAIN_BOUNDS.minZ);
      expect(fence.position.z + fence.footprintRadius).toBeLessThanOrEqual(TERRAIN_BOUNDS.maxZ);
    }
  });

  it('no fence overlaps the truck start position or any STUB_OBSTACLE (ADR 0019 §6 clearance rule 1/2)', () => {
    const minTruckClearance = 4;
    for (const fence of STUB_FENCES) {
      const distToTruck = Math.hypot(fence.position.x - TRUCK_START.x, fence.position.z - TRUCK_START.z);
      expect(distToTruck).toBeGreaterThanOrEqual(fence.footprintRadius + minTruckClearance);

      for (const obstacle of STUB_OBSTACLES) {
        const dist = Math.hypot(fence.position.x - obstacle.position.x, fence.position.z - obstacle.position.z);
        expect(dist).toBeGreaterThanOrEqual(fence.footprintRadius + obstacle.radius);
      }
    }
  });

  it('no fence overlaps any STUB_STRUCTURE (ADR 0019 §6 clearance rule 2)', () => {
    for (const fence of STUB_FENCES) {
      for (const structure of STUB_STRUCTURES) {
        const dist = Math.hypot(fence.position.x - structure.position.x, fence.position.z - structure.position.z);
        expect(dist).toBeGreaterThanOrEqual(fence.footprintRadius + structure.footprintRadius);
      }
    }
  });
});

describe('Reference-art redesign (issue #54 amendment, ADR 0019 §A1): windmill joins the farmyard, coop becomes a standalone pen', () => {
  const windmill = STUB_STRUCTURES.find((s) => s.kind === 'windmill')!;
  const barn = STUB_STRUCTURES.find((s) => s.kind === 'barn')!;
  const farmhouse = STUB_STRUCTURES.find((s) => s.kind === 'farmhouse')!;
  const silo = STUB_STRUCTURES.find((s) => s.kind === 'silo')!;
  const coop = STUB_STRUCTURES.find((s) => s.kind === 'chickenCoop')!;

  it('windmill sits within a ~20-unit span of barn/farmhouse/silo (clustered in the farmyard, not a distant landmark)', () => {
    for (const clusterMate of [barn, farmhouse, silo]) {
      const dist = Math.hypot(windmill.position.x - clusterMate.position.x, windmill.position.z - clusterMate.position.z);
      expect(dist).toBeLessThanOrEqual(20);
    }
  });

  it('chicken coop sits far from the farmyard cluster (its own standalone pen, not grouped with barn/farmhouse/silo/windmill)', () => {
    for (const clusterMate of [barn, farmhouse, silo, windmill]) {
      const dist = Math.hypot(coop.position.x - clusterMate.position.x, coop.position.z - clusterMate.position.z);
      expect(dist).toBeGreaterThan(20);
    }
  });

  it('every STUB_FENCE segment sits close to the relocated coop (the fence run now encloses the coop pen, not the farmyard)', () => {
    const maxPenRadius = 12; // generous upper bound on "same small pen", well under the ~20-unit farmyard-cluster span above.
    for (const fence of STUB_FENCES) {
      const dist = Math.hypot(fence.position.x - coop.position.x, fence.position.z - coop.position.z);
      expect(dist).toBeLessThanOrEqual(maxPenRadius);
    }
  });
});

describe('DECORATIVE_TREES (issue #54 amendment, ADR 0019 §A4)', () => {
  it('has a sparse count in the ADR-suggested ~25-45 range', () => {
    expect(DECORATIVE_TREES.length).toBeGreaterThanOrEqual(25);
    expect(DECORATIVE_TREES.length).toBeLessThanOrEqual(45);
  });

  it('every id is unique', () => {
    const ids = DECORATIVE_TREES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every tree sits within TERRAIN_BOUNDS, clear of the edge by at least the collider radius', () => {
    for (const tree of DECORATIVE_TREES) {
      expect(tree.position.x - TREE_COLLIDER_RADIUS).toBeGreaterThanOrEqual(TERRAIN_BOUNDS.minX);
      expect(tree.position.x + TREE_COLLIDER_RADIUS).toBeLessThanOrEqual(TERRAIN_BOUNDS.maxX);
      expect(tree.position.z - TREE_COLLIDER_RADIUS).toBeGreaterThanOrEqual(TERRAIN_BOUNDS.minZ);
      expect(tree.position.z + TREE_COLLIDER_RADIUS).toBeLessThanOrEqual(TERRAIN_BOUNDS.maxZ);
    }
  });

  it('no tree overlaps the truck start position, any STUB_OBSTACLE, any STUB_STRUCTURE, or any STUB_FENCE (trees are solid, ADR 0019 §A4 human override)', () => {
    const margin = 0.3;
    for (const tree of DECORATIVE_TREES) {
      const distToTruck = Math.hypot(tree.position.x - TRUCK_START.x, tree.position.z - TRUCK_START.z);
      expect(distToTruck).toBeGreaterThanOrEqual(TREE_COLLIDER_RADIUS + 3);

      for (const obstacle of STUB_OBSTACLES) {
        const dist = Math.hypot(tree.position.x - obstacle.position.x, tree.position.z - obstacle.position.z);
        expect(dist).toBeGreaterThanOrEqual(TREE_COLLIDER_RADIUS + obstacle.radius + margin);
      }
      for (const structure of STUB_STRUCTURES) {
        const dist = Math.hypot(tree.position.x - structure.position.x, tree.position.z - structure.position.z);
        expect(dist).toBeGreaterThanOrEqual(TREE_COLLIDER_RADIUS + structure.footprintRadius + margin);
      }
      for (const fence of STUB_FENCES) {
        const dist = Math.hypot(tree.position.x - fence.position.x, tree.position.z - fence.position.z);
        expect(dist).toBeGreaterThanOrEqual(TREE_COLLIDER_RADIUS + fence.footprintRadius + margin);
      }
    }
  });

  it('no two trees overlap each other', () => {
    for (let i = 0; i < DECORATIVE_TREES.length; i++) {
      for (let j = i + 1; j < DECORATIVE_TREES.length; j++) {
        const a = DECORATIVE_TREES[i];
        const b = DECORATIVE_TREES[j];
        const dist = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
        expect(dist).toBeGreaterThanOrEqual(TREE_COLLIDER_RADIUS * 2);
      }
    }
  });
});

describe('STUB_FIELDS / DECORATIVE_CROPS (issue #53, farm-layout-and-fields.md AC1-AC4)', () => {
  it('has exactly one corn field and one wheat field', () => {
    const kinds = STUB_FIELDS.map((f) => f.kind).sort();
    expect(kinds).toEqual(['corn', 'wheat']);
  });

  it('every field id is unique and every footprint is well-formed (min < max)', () => {
    const ids = STUB_FIELDS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const field of STUB_FIELDS) {
      expect(field.minX).toBeLessThan(field.maxX);
      expect(field.minZ).toBeLessThan(field.maxZ);
    }
  });

  it('every field sits within TERRAIN_BOUNDS', () => {
    for (const field of STUB_FIELDS) {
      expect(field.minX).toBeGreaterThanOrEqual(TERRAIN_BOUNDS.minX);
      expect(field.maxX).toBeLessThanOrEqual(TERRAIN_BOUNDS.maxX);
      expect(field.minZ).toBeGreaterThanOrEqual(TERRAIN_BOUNDS.minZ);
      expect(field.maxZ).toBeLessThanOrEqual(TERRAIN_BOUNDS.maxZ);
    }
  });

  it('no field overlaps the river ribbon route (nearest-point distance from the field rectangle to every RIVER_ROUTE point exceeds half the river width + margin)', () => {
    const requiredClearance = 1.5 + 0.5; // RIVER_WIDTH/2 (1.5) plus a margin.
    for (const field of STUB_FIELDS) {
      for (const point of RIVER_ROUTE) {
        const nearestX = Math.min(Math.max(point.x, field.minX), field.maxX);
        const nearestZ = Math.min(Math.max(point.z, field.minZ), field.maxZ);
        const dist = Math.hypot(nearestX - point.x, nearestZ - point.z);
        expect(dist).toBeGreaterThanOrEqual(requiredClearance);
      }
    }
  });

  it('no field overlaps any STUB_STRUCTURE or STUB_FENCE footprint', () => {
    const nearestPointOnRect = (field: (typeof STUB_FIELDS)[number], x: number, z: number) => ({
      x: Math.min(Math.max(x, field.minX), field.maxX),
      z: Math.min(Math.max(z, field.minZ), field.maxZ),
    });
    for (const field of STUB_FIELDS) {
      for (const structure of STUB_STRUCTURES) {
        const nearest = nearestPointOnRect(field, structure.position.x, structure.position.z);
        const dist = Math.hypot(nearest.x - structure.position.x, nearest.z - structure.position.z);
        expect(dist).toBeGreaterThanOrEqual(structure.footprintRadius);
      }
      for (const fence of STUB_FENCES) {
        const nearest = nearestPointOnRect(field, fence.position.x, fence.position.z);
        const dist = Math.hypot(nearest.x - fence.position.x, nearest.z - fence.position.z);
        expect(dist).toBeGreaterThanOrEqual(fence.footprintRadius);
      }
    }
  });

  it('has a per-field crop count in the confirmed 15-30 range (AC3)', () => {
    for (const field of STUB_FIELDS) {
      const count = DECORATIVE_CROPS.filter((c) => c.kind === field.kind).length;
      expect(count).toBeGreaterThanOrEqual(15);
      expect(count).toBeLessThanOrEqual(30);
    }
  });

  it('every crop id is unique', () => {
    const ids = DECORATIVE_CROPS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every crop sits inside its own field\'s footprint (AC3/AC4: scattered within the field, not floating elsewhere)', () => {
    for (const crop of DECORATIVE_CROPS) {
      const field = STUB_FIELDS.find((f) => f.kind === crop.kind);
      expect(field).toBeDefined();
      if (!field) continue;
      expect(crop.position.x).toBeGreaterThanOrEqual(field.minX);
      expect(crop.position.x).toBeLessThanOrEqual(field.maxX);
      expect(crop.position.z).toBeGreaterThanOrEqual(field.minZ);
      expect(crop.position.z).toBeLessThanOrEqual(field.maxZ);
    }
  });
});
