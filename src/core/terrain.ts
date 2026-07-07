// Stub terrain data (drive AC5): the bounded playable area and the three
// required, functional obstacle instances (bush/rock/derelict car). Full
// farm dressing (windmill, barn, farmhouse, river, mountains) is deferred —
// only these obstacle instances are in scope this pass.
import type { ObstacleInstance } from './types';

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
