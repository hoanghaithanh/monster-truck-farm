// Stub terrain data (drive AC5): the bounded playable area and the three
// required, functional obstacle instances (bush/rock/derelict car). Full
// farm dressing (windmill, barn, farmhouse, river, mountain) is deferred —
// only these obstacle instances are in scope this pass.
//
// Structures (issue #46, ADR 0012 §1): windmill/barn/farmhouse are added as
// a separate `StructureInstance[]` -- deliberately NOT `ObstacleInstance`s.
// This is what makes AC5 ("existing clearance system unchanged") hold
// structurally rather than by discipline: `StructureInstance` never enters
// `partitionObstacles`/`clearance.ts` (nothing here imports either), so this
// data cannot perturb the tier-gated bush/rock/derelict-car behavior no
// matter how it's used elsewhere.
//
// Mountain (issue #47, mid-Sprint-4 redesign, ADR 0012 addendum 2026-07-10):
// the original design shipped a 12-instance non-collidable backdrop ring
// placed *outside* `TERRAIN_BOUNDS` as a separate `MountainInstance[]` data
// shape. The human superseded that after seeing it rendered (requirements
// doc AC3a, supersedes AC3): a single large, reachable, collidable mountain
// landmark *inside* `TERRAIN_BOUNDS` instead -- reusing `StructureInstance`
// rather than a parallel data shape, so it gets colliders/keep-out/asset
// loading for free from the exact plumbing already built for windmill/barn/
// farmhouse. The ring code (`MountainInstance`, `STUB_MOUNTAINS`, the ring
// generator) is removed entirely, not kept alongside this -- see the ADR
// addendum for the full rationale/derivation.
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

/** Windmill/barn/farmhouse (issue #46) plus the reachable mountain landmark (issue #47 redesign, ADR 0012 addendum). River stays non-`StructureInstance` (ADR 0012 §3, unaffected by the mountain redesign) -- it's pure procedural geometry with no collider/keep-out, so it never belongs in this union. */
export type StructureKind = 'windmill' | 'barn' | 'farmhouse' | 'mountain';

/** A placed structure (ADR 0012 §1) -- entirely separate from `ObstacleInstance`; never enters `partitionObstacles`/`clearance.ts`. */
export interface StructureInstance {
  id: string;
  kind: StructureKind;
  position: Vec2;
  /** Circle radius used for both the simplified solid collider (physics/world.ts) and spawn keep-out (core/spawn/spawn-position.ts) -- ADR 0012 §2/§5. Not the visual mesh's exact footprint. */
  footprintRadius: number;
  /** windmill/barn/farmhouse/mountain are always true (AC2/AC3a) -- every current `StructureInstance` is collidable. Kept explicit (rather than assumed true) so a future non-collidable structure could set it false without special-casing callers; `structureKeepouts()` (core/spawn/spawn-position.ts) already filters on this flag rather than a hardcoded kind list, so any such future entry gets correct keep-out behavior for free. */
  collidable: boolean;
}

// Placement (developer's-call per the requirements doc's "Open questions" #1
// -- non-blocking): spread across the 40x40 field, each comfortably clear of
// the truck's origin start, the three STUB_OBSTACLES, and each other, so a
// child driving around actually passes near all four rather than finding
// them clustered.
//   - windmill (12, 12): far corner, tall landmark visible from a distance.
//   - barn (-12, -10): opposite quadrant from the windmill, clear of the
//     derelict car at (0, -8) and the rock at (-6, 4).
//   - farmhouse (10, -12): third quadrant, clear of the derelict car and the
//     bush at (6, 0); paired conceptually with the barn as a little
//     farmstead corner without the two overlapping footprints.
//   - mountain (-14, 5): fourth quadrant (west side), reachable/collidable
//     landmark (issue #47 redesign, ADR 0012 addendum 2026-07-10, AC3a).
//     footprintRadius 4.71 is not an arbitrary "large structure" number --
//     it's back-computed from the target rendered *height* (~16.3 units,
//     3x the barn's own measured rendered height) through
//     `buildStructureDisplayModel`'s existing width-driven scaling (see
//     render/scene.ts and the ADR addendum for the full derivation):
//     mountain-a.glb's raw bounding box is (1.079, 1.911, 1.103) on (x,y,z),
//     so scaleFactor = 16.3 / 1.911 ~= 8.531, targetWidth = scaleFactor *
//     max(1.079, 1.103) ~= 9.41, footprintRadius = targetWidth / 2 ~= 4.71.
//     The ADR's suggested starting coordinate (-16, -2) doesn't clear
//     TERRAIN_BOUNDS once this footprint is that large (-16 - 4.71 < -20),
//     so this was adjusted to (-14, 5) -- still open west side, clear of
//     every obstacle/structure/the river/the truck start with comfortable
//     margin (checked below, enforced by terrain.test.ts):
//       barn (-12,-10,r3) -> dist ~15.1, needs >=7.71
//       rock (-6,4,r1) -> dist ~8.06, needs >=5.71
//       bush (6,0,r0.6) -> dist ~20.6, needs >=5.31
//       derelict car (0,-8,r1.8) -> dist ~19.1, needs >=6.51
//       windmill/farmhouse (east side) -> dist >25, far clear
//       river (z 15-17 strip) -> mountain's z-range tops out at 9.71, far south of it
//       truck start (0,6) -> dist ~14.0, needs >=8.71 (footprint + 4-unit clearance)
//       TERRAIN_BOUNDS (-20..20 both axes) -> x:[-18.71,-9.29], z:[0.29,9.71], both inside with margin
export const STUB_STRUCTURES: StructureInstance[] = [
  { id: 'windmill-1', kind: 'windmill', position: { x: 12, z: 12 }, footprintRadius: 2, collidable: true },
  { id: 'barn-1', kind: 'barn', position: { x: -12, z: -10 }, footprintRadius: 3, collidable: true },
  { id: 'farmhouse-1', kind: 'farmhouse', position: { x: 10, z: -12 }, footprintRadius: 3, collidable: true },
  { id: 'mountain-1', kind: 'mountain', position: { x: -14, z: 5 }, footprintRadius: 4.71, collidable: true },
];
