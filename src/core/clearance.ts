// Wheel-tier vs obstacle-class rule (ADR 0001 §7 "Obstacle clearance").
// Pure, unit-testable: canClear(truckClearance, obstacleClass) decides
// whether an obstacle blocks the truck (drive AC6-AC9). Clearance is fixed
// for the run, so systems/ partitions obstacles into solid vs. passable
// once at setup via partitionObstacles().
import type { ObstacleClass, ObstacleInstance } from './types';

const CLASS_ORDER: Record<ObstacleClass, number> = {
  small: 0,
  medium: 1,
  large: 2,
};

/** True if a truck with the given wheel clearance can drive over this obstacle class. */
export function canClear(truckClearance: ObstacleClass, obstacleClass: ObstacleClass): boolean {
  return CLASS_ORDER[obstacleClass] <= CLASS_ORDER[truckClearance];
}

export interface ObstaclePartition {
  /** Obstacles above the truck's clearance — must get a solid collider (drive AC6-AC8). */
  blocking: ObstacleInstance[];
  /** Obstacles at or below the truck's clearance — pass over freely, no collider. */
  passable: ObstacleInstance[];
}

export function partitionObstacles(obstacles: ObstacleInstance[], truckClearance: ObstacleClass): ObstaclePartition {
  const blocking: ObstacleInstance[] = [];
  const passable: ObstacleInstance[] = [];
  for (const obstacle of obstacles) {
    if (canClear(truckClearance, obstacle.sizeClass)) {
      passable.push(obstacle);
    } else {
      blocking.push(obstacle);
    }
  }
  return { blocking, passable };
}
