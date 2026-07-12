// Random valid spawn point selection (animal AC1: "not inside an obstacle
// or structure, not on top of the player"). Takes an injected RNG so it's
// deterministically testable without mocking Math.random.
import type { Vec2 } from '../types';
import type { FenceInstance, StructureInstance, TerrainBounds, TreeInstance } from '../terrain';
import { TREE_COLLIDER_RADIUS } from '../terrain';

export type Rng = () => number;

/**
 * Minimal keep-out circle shape (ADR 0012 §5, issue #46): widened from the
 * previously-concrete `ObstacleInstance[]` because `isValid` below only ever
 * reads `.position`/`.radius`. `ObstacleInstance` already satisfies this
 * shape, so passing one is unchanged/non-breaking; callers now also feed in
 * collidable structure footprints (windmill/barn/farmhouse) alongside the
 * existing obstacles, so AC6 ("don't spawn inside a structure") is covered
 * by the same rule rather than a second, parallel one.
 */
export interface Keepout {
  position: Vec2;
  radius: number;
}

export interface SpawnPositionOptions {
  bounds: TerrainBounds;
  obstacles: Keepout[];
  truckPosition: Vec2;
  minDistanceFromTruck: number;
  /** Padding kept clear around each obstacle beyond its own radius. */
  obstacleClearance?: number;
  rng: Rng;
  maxAttempts?: number;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function isValid(point: Vec2, options: SpawnPositionOptions): boolean {
  if (distance(point, options.truckPosition) < options.minDistanceFromTruck) return false;
  const clearance = options.obstacleClearance ?? 0.5;
  for (const obstacle of options.obstacles) {
    if (distance(point, obstacle.position) < obstacle.radius + clearance) return false;
  }
  return true;
}

/**
 * Maps the collidable structures (windmill/barn/farmhouse, and -- since the
 * issue #47 mountain redesign, 2026-07-10 -- the single collidable mountain
 * landmark too) to keep-out circles (ADR 0012 §5, AC6) -- shared by every
 * spawn-system call site (animal/farmer/fuel) so "combine obstacles +
 * structures" is one small helper instead of three independent, drift-prone
 * inline mappings. Only `collidable` structures produce a keep-out entry --
 * this filter is what makes the mountain get keep-out automatically now that
 * it's `collidable: true` and inside `TERRAIN_BOUNDS`, with no code change
 * needed here. The river remains excluded: it's not a `StructureInstance` at
 * all (spawnable-over by design, ADR 0012 §3).
 */
export function structureKeepouts(structures: StructureInstance[]): Keepout[] {
  return structures
    .filter((structure) => structure.collidable)
    .map((structure) => ({ position: structure.position, radius: structure.footprintRadius }));
}

/**
 * Maps every fence (issue #54, ADR 0019 §6/Alternatives, AC9) to a keep-out
 * circle -- unconditionally, unlike `structureKeepouts`'s `collidable`
 * filter. There is no "not collidable" fence to skip, and per AC9's own
 * non-blocking recommendation a *collapsed* fence's footprint deliberately
 * stays in the keep-out set too (spawn positions are picked once, not
 * continuously re-validated, so re-evaluating on collapse isn't worth the
 * complexity) -- this is why the source is the full authored `STUB_FENCES`
 * array, not a live, collapse-aware `FenceSystem` snapshot.
 */
export function fenceKeepouts(fences: FenceInstance[]): Keepout[] {
  return fences.map((fence) => ({ position: fence.position, radius: fence.footprintRadius }));
}

/**
 * Maps every decorative tree (issue #54 amendment, ADR 0019 §A4 human
 * override: trees are solid, unconditional, unbreakable colliders -- same
 * "always in keep-out" treatment as `fenceKeepouts` above, not the
 * `collidable`-filtered treatment `structureKeepouts` uses, since every tree
 * is always solid with no non-collidable case to skip) to a keep-out circle,
 * so an animal/farmer/fuel pickup never spawns inside one. Radius scales
 * with each tree's own `scale` (default 1), matching the physics collider
 * `physics/world.ts`'s `createTreeColliders` creates.
 */
export function treeKeepouts(trees: TreeInstance[]): Keepout[] {
  return trees.map((tree) => ({ position: tree.position, radius: TREE_COLLIDER_RADIUS * (tree.scale ?? 1) }));
}

/** Returns a valid random point, or null if none was found within maxAttempts. */
export function pickSpawnPosition(options: SpawnPositionOptions): Vec2 | null {
  const maxAttempts = options.maxAttempts ?? 20;
  const { bounds, rng } = options;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const point: Vec2 = {
      x: bounds.minX + rng() * (bounds.maxX - bounds.minX),
      z: bounds.minZ + rng() * (bounds.maxZ - bounds.minZ),
    };
    if (isValid(point, options)) return point;
  }
  return null;
}
