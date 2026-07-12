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

// Terrain expansion (issue #49, ADR 0017 §Decision-4, AC1): -50..50 both
// axes, ~6.25x the original 40x40 (-20..20) area. Every existing piece of
// hand-placed content below (obstacles/structures/river) and TRUCK_START
// keep their original coordinates unchanged (AC3, Open Question 1 resolved
// "leave in place") -- they end up as a small, already-tested area within a
// much bigger, currently-empty map. The soft boundary clamp
// (core/driving/boundary.ts) and every spawn system (core/spawn/spawn-
// position.ts) read this constant directly, so both automatically cover the
// full new extent with no code change of their own (AC2/AC4).
export const TERRAIN_BOUNDS: TerrainBounds = {
  minX: -50,
  maxX: 50,
  minZ: -50,
  maxZ: 50,
};

// The truck's fixed spawn/session-start position (ADR 0017 §Decision-4):
// pulled out to a named constant, rather than left as a literal duplicated
// in main.ts, so it is a single source of truth both main.ts's session
// bootstrap and terrain-height.ts's flatten mask read -- avoiding the
// "two individually reasonable numbers decided apart" drift class this
// project has hit before (see CLAUDE.md's Sprint-1 fairness-retro note).
export const TRUCK_START: Vec2 = { x: 0, z: 6 };

export const STUB_OBSTACLES: ObstacleInstance[] = [
  { id: 'bush-1', kind: 'bush', sizeClass: 'small', position: { x: 6, z: 0 }, radius: 0.6 },
  { id: 'rock-1', kind: 'rock', sizeClass: 'medium', position: { x: -6, z: 4 }, radius: 1.0 },
  { id: 'derelict-car-1', kind: 'derelictCar', sizeClass: 'large', position: { x: 0, z: -8 }, radius: 1.8 },
];

/** Windmill/barn/farmhouse (issue #46) plus the reachable mountain landmark (issue #47 redesign, ADR 0012 addendum). Widened issue #54/ADR 0019 §4 to add 'silo'/'chickenCoop' -- ordinary collidable StructureInstances, no new pattern, just two more entries flowing through the exact same pipeline. River stays non-`StructureInstance` (ADR 0012 §3, unaffected) -- it's pure procedural geometry with no collider/keep-out, so it never belongs in this union. */
export type StructureKind = 'windmill' | 'barn' | 'farmhouse' | 'mountain' | 'silo' | 'chickenCoop';

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

// Placement, issue #46/#47 era (superseded 2026-07-12, issue #54/ADR 0019
// §6, itself superseded the same day by the ADR's "Amendment (2026-07-12)"
// §A1 reference-art redesign -- see below): the four structures used to be
// spread across the small 40x40-era field just to keep clear of each other
// and the truck start, not to read as a real farmstead. §6's first re-layout
// grouped barn/farmhouse/silo/chickenCoop into one farmyard cluster and sent
// windmill out to a distant standalone landmark spot. The human then drove
// that live, shared reference concept art, and asked for a reversal: the
// chicken coop moves OUT of the farmyard into its own standalone fenced pen,
// and the windmill moves IN to join barn/farmhouse/silo instead (ADR 0019
// §A1). Coordinates below implement that amendment, not the superseded §6
// arrangement.
//
// Re-layout (ADR 0019 §A1 "zones, not coordinates" -- exact coordinates are
// this developer's screenshot-iterated call, not specified by the
// requirements doc or the ADR):
//   - Farmyard cluster (south-east quadrant, tightened): barn/farmhouse/
//     silo/windmill grouped within a ~20-unit span around roughly (22,-24),
//     far enough from TRUCK_START (0,6) that a child drives *toward* it
//     across the large map rather than starting on top of it. Windmill
//     takes a farmyard corner seat rather than its former distant NW spot.
//   - Chicken-coop pen (its own quadrant, north-east): the coop leaves the
//     farmyard and becomes a small, standalone fenced pen -- see the
//     STUB_FENCES block below, which now encloses this pen instead of the
//     farmyard.
//   - Mountain stays a distant landmark, unaffected by this amendment (far
//     south-west corner, same reachable/collidable footprintRadius as
//     before -- its issue #47 derivation doesn't change).
//
// footprintRadius for the two new kinds (silo/chickenCoop) is derived the
// same width-driven way the mountain's was (ADR 0012 addendum's method,
// reused verbatim by ADR 0019 §6) -- unaffected by the §A1 amendment, only
// coordinates moved, not the derivation:
//   - silo.glb raw bbox: (-1.750,-0.049,-1.665) to (1.917,9.019,1.845) ->
//     size (3.667, 9.068, 3.510), horizontalExtent = 3.667. Target height 8
//     (a tall landmark within the farmyard, shorter than the windmill/
//     mountain landmarks but clearly taller than the barn): scaleFactor =
//     8 / 9.068 ~= 0.8823, targetWidth = 0.8823 * 3.667 ~= 3.236,
//     footprintRadius = 1.618 ~= 1.62.
//   - chicken-coop.glb raw bbox: (-1.203,-0.003,-0.948) to
//     (1.205,1.848,1.206) -> size (2.408, 1.851, 2.154), horizontalExtent =
//     2.408. Target height 1.6 (a small outbuilding, shorter than every
//     other structure): scaleFactor = 1.6 / 1.851 ~= 0.8644, targetWidth =
//     0.8644 * 2.408 ~= 2.082, footprintRadius = 1.041 ~= 1.04.
//
// Clearance rules (ADR 0019 §6/§A1, checked below, enforced by
// terrain.test.ts): every structure/fence >= (footprint +
// TRUCK_CONTACT_RADIUS + margin) from TRUCK_START, clear of the three
// STUB_OBSTACLES/each other/the river, and strictly inside TERRAIN_BOUNDS.
// Verified by hand for this arrangement and pinned by the updated test suite.
export const STUB_STRUCTURES: StructureInstance[] = [
  // Farmyard cluster (south-east quadrant, ~20-unit span; windmill now a
  // cluster member per ADR 0019 §A1, no longer a distant landmark).
  { id: 'barn-1', kind: 'barn', position: { x: 14, z: -26 }, footprintRadius: 3, collidable: true },
  { id: 'farmhouse-1', kind: 'farmhouse', position: { x: 30, z: -26 }, footprintRadius: 3, collidable: true },
  { id: 'silo-1', kind: 'silo', position: { x: 22, z: -30 }, footprintRadius: 1.62, collidable: true },
  { id: 'windmill-1', kind: 'windmill', position: { x: 22, z: -20 }, footprintRadius: 2, collidable: true },
  // Chicken coop: relocated out of the farmyard into its own standalone
  // fenced pen (ADR 0019 §A1), north-east quadrant.
  { id: 'chicken-coop-1', kind: 'chickenCoop', position: { x: 26, z: 24 }, footprintRadius: 1.04, collidable: true },
  // Distant landmark (AC6), unaffected by the §A1 amendment.
  { id: 'mountain-1', kind: 'mountain', position: { x: -35, z: -25 }, footprintRadius: 4.71, collidable: true },
];

// Fences (issue #54, ADR 0019 §1/§6): a new `FenceInstance` type, deliberately
// NOT an overload of `StructureInstance` (see the ADR's §1 rationale --
// fences carry per-session mutable collapsed state that a `FenceSystem`
// owns at runtime, never the authored data below). `footprintRadius` here
// is both the solid-collider radius (physics/world.ts's
// `createFenceColliders`) and the spawn keep-out radius (AC9,
// `fenceKeepouts` in core/spawn/spawn-position.ts) -- same dual role
// `StructureInstance.footprintRadius` already plays.
export interface FenceInstance {
  id: string;
  position: Vec2;
  /** Yaw (radians) of the segment along the boundary line (ADR 0019 §5) -- a straight run uses 0 (long axis along world X, matching fence.glb's raw local-X-long orientation, see CREDITS.md), a perpendicular closing segment uses Math.PI / 2. Purely a render concern -- the collider is a rotation-invariant circle. */
  rotationY: number;
  footprintRadius: number;
}

// fence.glb's raw bounding box (CREDITS.md, issue #54) is (-2.945,-0.009,
// -0.083) to (2.945,1.164,0.083) -- a long, thin single boundary segment
// (~5.89 wide x 1.164 tall x 0.166 deep), not a general-purpose prop.
// footprintRadius = 2.945 is the raw half-width itself (scaleFactor ~= 1,
// no correction needed -- the raw model is already sized sensibly for one
// segment of a farmyard boundary at this project's world scale).
//
// Layout (superseded 2026-07-12, ADR 0019 §A1): originally an L-shaped run
// closing the farmyard cluster's open north side. The reference-art redesign
// relocates the coop out of the farmyard into its own standalone pen (see
// STUB_STRUCTURES above), so this fence run moves with it -- same exact
// mechanics (breakable, per-session FenceSystem, createFenceColliders,
// authored rotationY per ADR 0019 §5), only the coordinates and what they
// enclose change. Four segments now form a north/west/east three-sided pen
// around the relocated chicken coop (26,24): two contiguous east-west
// segments close the north side (x=23/29, z=29), one north-south segment
// closes the west side (x=20,z=24), one closes the east side (x=32,z=24) --
// the south side is deliberately left open, facing the reserved-field zone
// (ADR 0019 §A1) below the pen, so a child smashing through reads as
// "breaking into the coop pen from the field side." Corner segments overlap
// slightly where north meets west/east (same "contiguous/overlapping corner
// join" look the original L-shaped layout already used) -- clearance from
// the coop itself and from every other structure/obstacle/TRUCK_START is
// checked by hand below and pinned by terrain.test.ts.
export const STUB_FENCES: FenceInstance[] = [
  { id: 'fence-1', position: { x: 23, z: 29 }, rotationY: 0, footprintRadius: 2.945 },
  { id: 'fence-2', position: { x: 29, z: 29 }, rotationY: 0, footprintRadius: 2.945 },
  { id: 'fence-3', position: { x: 20, z: 24 }, rotationY: Math.PI / 2, footprintRadius: 2.945 },
  { id: 'fence-4', position: { x: 32, z: 24 }, rotationY: Math.PI / 2, footprintRadius: 2.945 },
];

// River (issue #47, ADR 0012 §3): a procedural flat ribbon following this
// polyline, rendered in render/scene.ts's buildRiverMesh. Moved here (was
// previously a render/scene.ts-local constant) by issue #49/ADR 0017
// §Decision-4, so core/terrain-height.ts's flatten mask can read the same
// route data render/scene.ts renders from -- one source of truth, no risk of
// the two drifting apart. Runs roughly along the terrain's north edge
// (z ~15-17), clear of the bush/rock/derelict-car obstacles (all south of
// z=4) and, after the issue #54 re-layout, clear of every structure/fence
// too -- the farmyard cluster and its fence boundary sit well south (z -10
// to -30) and the windmill/mountain landmarks sit far north-west/south-west
// of the river's x/z extent (see the STUB_STRUCTURES placement comment
// above for the current coordinates).
export const RIVER_WIDTH = 3;
export const RIVER_ROUTE: Vec2[] = [
  { x: -18, z: 16 },
  { x: -8, z: 15 },
  { x: 2, z: 16.5 },
  { x: 18, z: 15.5 },
];

// Dramatic terrain zones (issue #54 amendment, ADR 0019 §A2): a small,
// authored set of gates consumed by core/terrain-height.ts's
// `dramaticZoneFactor` -- 1 (full drama) inside `innerRadius`, easing to 0
// (pure gentle field) by `outerRadius`, reusing the same `ringFactor`
// smoothstep the flatten mask already uses. Deliberately placed in an
// otherwise-empty peripheral pocket of the map, not anywhere near the
// farmyard/coop/fields/truck-start content -- a global steepness bump would
// turn every drivable approach into a rollercoaster, which is exactly what
// this zone-gated approach avoids (ADR 0019 §A2's "why zone-based" call).
// Single starting zone far west, north of the mountain landmark, without
// the zone's own footprint reaching any authored content (checked
// by hand: zone center (-42,10) to the nearest content -- the mountain at
// (-35,-25) -- is ~35.7 units, comfortably outside `outerRadius` + the
// mountain's own footprint).
export interface DramaticZone {
  center: Vec2;
  innerRadius: number;
  outerRadius: number;
}
export const DRAMATIC_ZONES: DramaticZone[] = [{ center: { x: -42, z: 10 }, innerRadius: 7, outerRadius: 22 }];

// Decorative trees (issue #54 amendment, ADR 0019 §A4): sparse (~25-45),
// non-`InstancedMesh` scenery props authored as plain data, following the
// exact same "load-once, clone-many" shape `farm-layout-and-fields.md`
// already established for field stalk-clusters. NOT a `StructureInstance`
// (trees are not flattened -- a forested hillside/mesa is the point) but,
// per the human's collidability override of the ADR's non-collidable
// default, they ARE solid and unbreakable -- see `TREE_COLLIDER_RADIUS`
// below and physics/world.ts's `createTreeColliders`. `scale` (default 1)
// gives a little size variety between clumped/single trees without a second
// authored field; `rotationY` (default 0) likewise varies canopy silhouette
// cheaply. Placement is deliberately clear of the truck-start pocket, the
// farmyard interior, the coop pen/fence run, the river corridor, and the
// mountain landmark -- loose clumps in the map's otherwise-empty stretches
// (the dramatic west zone above reads as "forested canyon rim"; the rest are
// scattered across the open plains) plus a handful of loners. Screenshot-
// iterated starting placement, not a locked layout (ADR 0019 §A6.4).
export interface TreeInstance {
  id: string;
  position: Vec2;
  rotationY?: number;
  scale?: number;
}

/** Fixed solid-collider/spawn-keep-out radius for every tree (issue #54 amendment, ADR 0019 §A4 human override -- "solid but not breakable"): sized to the trunk, not the full canopy, so the truck bumps a believable obstacle rather than an oversized invisible wall around each tree's visual silhouette. */
export const TREE_COLLIDER_RADIUS = 0.6;

// Corn/wheat fields (issue #53, `docs/requirements/farm-layout-and-fields.md`
// AC1-AC4; ADR 0019 §6/§A1's "reserved field space" note): purely decorative
// -- a `FieldPatch` (ground-patch footprint, consumed only by render's
// terrain-conforming colored-mesh builder) plus a sparse `CropInstance[]`
// stalk-cluster prop set, following the exact "load-once, clone-many, NOT
// InstancedMesh" pattern DECORATIVE_TREES already established. Deliberately
// carry **no** collider and **no** spawn-keepout radius at all (AC2/AC12) --
// unlike TreeInstance/TREE_COLLIDER_RADIUS above, there is no field/crop
// counterpart consumed by physics/world.ts or core/spawn/spawn-position.ts;
// this data is imported directly by render/scene.ts only, the same
// "no drift risk to guard against" rationale DECORATIVE_TREES's own comment
// gives for not threading trees through createGameScene as a parameter.
//
// Placement: the ADR's suggested `~x 12..38, z 8..20` zone overlaps
// RIVER_ROUTE's last segment (its ribbon reaches x=18 at z~15.5, width 3 --
// the ribbon's actual footprint at that end is a thin sliver just past
// x=18), so both fields are shifted to sit with a comfortable margin east of
// the river's x-extent (minX 21, nearest-point distance from the corn
// field's rectangle to the river's closest route point is 3 units, well
// clear of RIVER_WIDTH/2) and clear of the coop pen's fence run (STUB_FENCES'
// west/east segments start at z~21, fields stay at maxZ 20) and the nearby
// tree-27 (38,14, fields stay at maxX 37) -- checked by hand below, pinned by
// terrain.test.ts. This reads as "the farm's fields, between the river and
// the coop pen's open south side," per the ADR's own framing, without
// literally reusing its now-slightly-stale numbers (this file's header
// comment already flags that the ADR's suggestion may need adjusting once
// the real #54 coordinates are in hand).
export type CropKind = 'corn' | 'wheat';

export interface FieldPatch {
  id: string;
  kind: CropKind;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const STUB_FIELDS: FieldPatch[] = [
  { id: 'field-corn-1', kind: 'corn', minX: 21, maxX: 29, minZ: 9, maxZ: 20 },
  { id: 'field-wheat-1', kind: 'wheat', minX: 30, maxX: 37, minZ: 9, maxZ: 20 },
];

export interface CropInstance {
  id: string;
  kind: CropKind;
  position: Vec2;
  rotationY?: number;
  scale?: number;
}

/**
 * Deterministically scatters `count` stalk-cluster positions near the
 * perimeter of `field` (AC1/AC3's "scattered near its edges", not filling
 * the interior densely) -- walks the rectangle boundary at even intervals
 * and nudges each point inward/along-the-edge with a small sine/cosine-based
 * jitter, rather than `Math.random()`, so `DECORATIVE_CROPS` below is
 * reproducible (same "authored, deterministic data" ethos every other
 * `core/terrain.ts` array follows, including `core/terrain-height.ts`'s own
 * sum-of-sines fields) instead of re-rolling a different layout on every
 * import.
 */
function scatterFieldEdgeCrops(field: FieldPatch, kind: CropKind, count: number, idPrefix: string): CropInstance[] {
  const width = field.maxX - field.minX;
  const depth = field.maxZ - field.minZ;
  const perimeter = 2 * (width + depth);
  const inset = 1.2; // pulls the ring slightly inside the raw rectangle edge.
  const crops: CropInstance[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * perimeter;
    let x: number;
    let z: number;
    if (t < width) {
      x = field.minX + t;
      z = field.minZ;
    } else if (t < width + depth) {
      x = field.maxX;
      z = field.minZ + (t - width);
    } else if (t < 2 * width + depth) {
      x = field.maxX - (t - width - depth);
      z = field.maxZ;
    } else {
      x = field.minX;
      z = field.maxZ - (t - 2 * width - depth);
    }
    const jitterX = Math.sin(i * 12.9898 + t) * 0.7;
    const jitterZ = Math.cos(i * 78.233 + t) * 0.7;
    x = clampValue(x + jitterX, field.minX + 0.2, field.maxX - 0.2);
    z = clampValue(z + jitterZ, field.minZ + 0.2, field.maxZ - 0.2);
    // Nudge everything a touch inward from the exact boundary line so the
    // stalk clusters read as "near the edges of the patch," not perched
    // exactly on it.
    const cx = field.minX + width / 2;
    const cz = field.minZ + depth / 2;
    x += Math.sign(cx - x) * inset * 0.3;
    z += Math.sign(cz - z) * inset * 0.3;
    x = clampValue(x, field.minX + 0.15, field.maxX - 0.15);
    z = clampValue(z, field.minZ + 0.15, field.maxZ - 0.15);
    const rotationY = (i * 2.399963) % (Math.PI * 2);
    const scale = 0.85 + 0.3 * Math.abs(Math.sin(i * 1.618));
    crops.push({ id: `${idPrefix}-${i + 1}`, kind, position: { x, z }, rotationY, scale });
  }
  return crops;
}

/** Local clamp helper (no three.js import in `core/`, ADR 0001 §4 purity). */
function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const DECORATIVE_CROPS: CropInstance[] = [
  ...scatterFieldEdgeCrops(STUB_FIELDS[0], 'corn', 20, 'crop-corn'),
  ...scatterFieldEdgeCrops(STUB_FIELDS[1], 'wheat', 20, 'crop-wheat'),
];

export const DECORATIVE_TREES: TreeInstance[] = [
  // West canyon-rim clump (dramatic zone, forested mesa look) -- kept clear
  // of the river's west end and the mountain's own footprint.
  { id: 'tree-1', position: { x: -44, z: 2 }, rotationY: 0.2, scale: 1.1 },
  { id: 'tree-2', position: { x: -40, z: -2 }, rotationY: 1.4, scale: 0.9 },
  { id: 'tree-3', position: { x: -47, z: -4 }, rotationY: 2.6, scale: 1.0 },
  { id: 'tree-4', position: { x: -36, z: 4 }, rotationY: 0.8, scale: 1.2 },
  { id: 'tree-5', position: { x: -42, z: 18 }, rotationY: 3.0, scale: 0.95 },
  { id: 'tree-6', position: { x: -48, z: 14 }, rotationY: 1.9, scale: 1.05 },
  { id: 'tree-7', position: { x: -33, z: -8 }, rotationY: 0.5, scale: 1.15 },
  { id: 'tree-8', position: { x: -46, z: -14 }, rotationY: 2.2, scale: 0.85 },
  { id: 'tree-9', position: { x: -38, z: 22 }, rotationY: 1.1, scale: 1.0 },
  { id: 'tree-10', position: { x: -30, z: 6 }, rotationY: 2.9, scale: 0.9 },
  { id: 'tree-11', position: { x: -44, z: -20 }, rotationY: 0.3, scale: 1.1 },
  { id: 'tree-12', position: { x: -49, z: 22 }, rotationY: 1.6, scale: 1.0 },

  // North bank clump, north of the river, south of the top boundary.
  { id: 'tree-13', position: { x: -30, z: 26 }, rotationY: 0.4, scale: 1.0 },
  { id: 'tree-14', position: { x: -22, z: 30 }, rotationY: 2.1, scale: 0.95 },
  { id: 'tree-15', position: { x: -10, z: 28 }, rotationY: 1.3, scale: 1.1 },
  { id: 'tree-16', position: { x: -2, z: 32 }, rotationY: 2.7, scale: 0.9 },
  { id: 'tree-17', position: { x: 8, z: 27 }, rotationY: 0.9, scale: 1.05 },
  { id: 'tree-18', position: { x: -16, z: 24 }, rotationY: 1.8, scale: 1.0 },
  { id: 'tree-19', position: { x: -6, z: 22 }, rotationY: 0.6, scale: 0.9 },

  // South-central and east scattered singles, clear of the farmyard cluster
  // (x14-34, z-32..-18), the derelict car obstacle, and the coop pen.
  { id: 'tree-20', position: { x: -14, z: -22 }, rotationY: 1.2, scale: 1.0 },
  { id: 'tree-21', position: { x: -20, z: -32 }, rotationY: 2.4, scale: 0.95 },
  { id: 'tree-22', position: { x: 8, z: -34 }, rotationY: 0.7, scale: 1.1 },
  { id: 'tree-23', position: { x: -8, z: -40 }, rotationY: 1.7, scale: 0.9 },
  { id: 'tree-24', position: { x: 2, z: -20 }, rotationY: 2.9, scale: 1.0 },
  { id: 'tree-25', position: { x: 40, z: -4 }, rotationY: 0.5, scale: 1.05 },
  { id: 'tree-26', position: { x: 44, z: 6 }, rotationY: 1.5, scale: 0.9 },
  { id: 'tree-27', position: { x: 38, z: 14 }, rotationY: 2.2, scale: 1.1 },
  { id: 'tree-28', position: { x: 44, z: -14 }, rotationY: 0.9, scale: 1.0 },
  { id: 'tree-29', position: { x: 12, z: 40 }, rotationY: 1.9, scale: 0.95 },
  { id: 'tree-30', position: { x: -34, z: 40 }, rotationY: 0.3, scale: 1.0 },
];
