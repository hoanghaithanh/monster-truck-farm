// Soft boundary (drive AC4): gently keep the truck within the playable area
// rather than an undefined void or a hard stuck stop. Chosen interpretation
// (drive Open Question 3): an invisible soft wall that clamps position —
// simplest, most forgiving option for a young child; no visible fence asset
// this pass. Revisit if the human wants a visible edge later.
import type { Vec2 } from '../types';
import type { TerrainBounds } from '../terrain';

export function clampToBounds(position: Vec2, bounds: TerrainBounds): Vec2 {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, position.x)),
    z: Math.min(bounds.maxZ, Math.max(bounds.minZ, position.z)),
  };
}
