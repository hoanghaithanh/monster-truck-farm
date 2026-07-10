// Random valid spawn point selection (animal AC1: "not inside an obstacle
// or structure, not on top of the player"). Takes an injected RNG so it's
// deterministically testable without mocking Math.random.
import type { Vec2 } from '../types';
import type { StructureInstance, TerrainBounds } from '../terrain';

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
 * Maps the collidable structures (windmill/barn/farmhouse) to keep-out
 * circles (ADR 0012 §5, AC6) -- shared by every spawn-system call site
 * (animal/farmer/fuel) so "combine obstacles + structures" is one small
 * helper instead of three independent, drift-prone inline mappings. Only
 * `collidable` structures produce a keep-out entry: river/mountains (issue
 * #47) are deliberately excluded (river is spawnable-over by design,
 * mountains sit outside `TERRAIN_BOUNDS` and are never selected anyway).
 */
export function structureKeepouts(structures: StructureInstance[]): Keepout[] {
  return structures
    .filter((structure) => structure.collidable)
    .map((structure) => ({ position: structure.position, radius: structure.footprintRadius }));
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
