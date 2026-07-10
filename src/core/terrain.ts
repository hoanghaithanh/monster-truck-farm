// Stub terrain data (drive AC5): the bounded playable area and the three
// required, functional obstacle instances (bush/rock/derelict car). Full
// farm dressing (windmill, barn, farmhouse, river, mountains) is deferred —
// only these obstacle instances are in scope this pass.
//
// Structures (issue #46, ADR 0012 §1): windmill/barn/farmhouse are added as
// a separate `StructureInstance[]` -- deliberately NOT `ObstacleInstance`s.
// This is what makes AC5 ("existing clearance system unchanged") hold
// structurally rather than by discipline: `StructureInstance` never enters
// `partitionObstacles`/`clearance.ts` (nothing here imports either), so this
// data cannot perturb the tier-gated bush/rock/derelict-car behavior no
// matter how it's used elsewhere. River/mountains (`'river' | 'mountains'`)
// are the separate, not-yet-implemented issue #47 -- omitted from
// `StructureKind` on purpose, not added speculatively.
import type { ObstacleInstance, Vec2 } from './types';

export interface TerrainBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// A modest square stub terrain — plenty of room to drive around and to
// place three obstacles with clear approach lines to each.
export const TERRAIN_BOUNDS: TerrainBounds = {
  minX: -20,
  maxX: 20,
  minZ: -20,
  maxZ: 20,
};

export const STUB_OBSTACLES: ObstacleInstance[] = [
  { id: 'bush-1', kind: 'bush', sizeClass: 'small', position: { x: 6, z: 0 }, radius: 0.6 },
  { id: 'rock-1', kind: 'rock', sizeClass: 'medium', position: { x: -6, z: 4 }, radius: 1.0 },
  { id: 'derelict-car-1', kind: 'derelictCar', sizeClass: 'large', position: { x: 0, z: -8 }, radius: 1.8 },
];

/** Windmill/barn/farmhouse only (issue #46); river/mountains ('river' | 'mountains') belong to issue #47 and are deliberately omitted here. */
export type StructureKind = 'windmill' | 'barn' | 'farmhouse';

/** A placed structure (ADR 0012 §1) -- entirely separate from `ObstacleInstance`; never enters `partitionObstacles`/`clearance.ts`. */
export interface StructureInstance {
  id: string;
  kind: StructureKind;
  position: Vec2;
  /** Circle radius used for both the simplified solid collider (physics/world.ts) and spawn keep-out (core/spawn/spawn-position.ts) -- ADR 0012 §2/§5. Not the visual mesh's exact footprint. */
  footprintRadius: number;
  /** windmill/barn/farmhouse are always true (AC2); kept explicit (rather than assumed) so a future river/mountains entry can set it false without special-casing callers. */
  collidable: boolean;
}

// Placement (developer's-call per the requirements doc's "Open questions" #1
// -- non-blocking): spread across the 40x40 field, each comfortably clear of
// the truck's origin start, the three STUB_OBSTACLES, and each other, so a
// child driving around actually passes near all three rather than finding
// them clustered.
//   - windmill (12, 12): far corner, tall landmark visible from a distance.
//   - barn (-12, -10): opposite quadrant from the windmill, clear of the
//     derelict car at (0, -8) and the rock at (-6, 4).
//   - farmhouse (10, -12): third quadrant, clear of the derelict car and the
//     bush at (6, 0); paired conceptually with the barn as a little
//     farmstead corner without the two overlapping footprints.
export const STUB_STRUCTURES: StructureInstance[] = [
  { id: 'windmill-1', kind: 'windmill', position: { x: 12, z: 12 }, footprintRadius: 2, collidable: true },
  { id: 'barn-1', kind: 'barn', position: { x: -12, z: -10 }, footprintRadius: 3, collidable: true },
  { id: 'farmhouse-1', kind: 'farmhouse', position: { x: 10, z: -12 }, footprintRadius: 3, collidable: true },
];
