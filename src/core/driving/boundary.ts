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

// Chase-camera edge fix (issue #17): the truck's own position is clamped by
// clampToBounds above, but a chase camera offset behind the truck's heading
// can still extend past the finite ground plane at corners, exposing the
// scene background ("void") and undercutting AC4's no-void intent even
// though the truck itself never leaves bounds. Pull the camera's desired
// (x,z) back in by `margin` so it stays over the ground plane; the camera
// still looks at the truck, so the truck stays framed.
export function clampCameraToBounds(position: Vec2, bounds: TerrainBounds, margin: number): Vec2 {
  return {
    x: Math.min(bounds.maxX - margin, Math.max(bounds.minX + margin, position.x)),
    z: Math.min(bounds.maxZ - margin, Math.max(bounds.minZ + margin, position.z)),
  };
}
