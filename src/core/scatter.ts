// Boop scatter reaction (animal AC4a): a brief non-violent "flee" motion the
// booped animal plays before it's removed from play, so a boop doesn't read
// as instant, unexplained disappearance. Pure position/velocity timer state,
// matching the shape of farmer/invuln.ts's post-bump cooldown -- render/ only
// ever moves the mesh to the position this module computes each tick, it
// never invents the motion itself.
import type { Vec2 } from './types';

/** How long the scatter flee plays before the animal despawns (animal AC4c: "shortly after"). */
export const SCATTER_DURATION_SECONDS = 0.4;
/** units/s the animal flees at -- brisk enough to read as a startled hop/dash, not a crawl. */
export const SCATTER_SPEED = 6;

export interface ScatterState {
  position: Vec2;
  velocity: Vec2;
  remainingSeconds: number;
}

/**
 * Starts a scatter, fleeing directly away from the truck's position at the
 * moment of contact. Falls back to an arbitrary flee direction in the
 * degenerate case where the animal and truck share the exact same position,
 * rather than producing a NaN/zero velocity.
 */
export function startScatter(animalPosition: Vec2, truckPosition: Vec2): ScatterState {
  const dx = animalPosition.x - truckPosition.x;
  const dz = animalPosition.z - truckPosition.z;
  const dist = Math.hypot(dx, dz);
  const dirX = dist > 0 ? dx / dist : 1;
  const dirZ = dist > 0 ? dz / dist : 0;
  return {
    position: animalPosition,
    velocity: { x: dirX * SCATTER_SPEED, z: dirZ * SCATTER_SPEED },
    remainingSeconds: SCATTER_DURATION_SECONDS,
  };
}

/** Advances the flee motion by dt. Once remainingSeconds hits 0, the caller despawns the animal (animal AC4c). */
export function tickScatter(state: ScatterState, dt: number): ScatterState {
  return {
    position: { x: state.position.x + state.velocity.x * dt, z: state.position.z + state.velocity.z * dt },
    velocity: state.velocity,
    remainingSeconds: Math.max(0, state.remainingSeconds - dt),
  };
}

export function isScatterDone(state: ScatterState): boolean {
  return state.remainingSeconds <= 0;
}
