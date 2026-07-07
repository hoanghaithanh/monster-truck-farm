// Random valid spawn point selection (animal AC1: "not inside an obstacle
// or structure, not on top of the player"). Takes an injected RNG so it's
// deterministically testable without mocking Math.random.
import type { ObstacleInstance, Vec2 } from '../types';
import type { TerrainBounds } from '../terrain';

export type Rng = () => number;

export interface SpawnPositionOptions {
  bounds: TerrainBounds;
  obstacles: ObstacleInstance[];
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
