// Boop contact detection + resolution (animal AC4-AC6). Contact is a simple
// circle-overlap check on the XZ plane — booping is a gameplay trigger, not
// a physical collision that needs sliding/obstacle resolution (that's the
// truck-vs-obstacle job in clearance.ts + the physics adapter), so plain
// geometry here is sufficient and keeps this fully unit-testable.
import type { AnimalState, Vec2 } from './types';
import { computeCoins } from './coins/coin-formula';

export function isBoopContact(truckPosition: Vec2, truckRadius: number, animal: AnimalState, animalRadius: number): boolean {
  if (!animal.alive) return false;
  const dx = truckPosition.x - animal.position.x;
  const dz = truckPosition.z - animal.position.z;
  return Math.hypot(dx, dz) < truckRadius + animalRadius;
}

export interface BoopResult {
  animal: AnimalState;
  coinsAwarded: number;
}

/**
 * Resolves a boop: awards coins per the size/speed formula and marks the
 * animal removed from play (animal AC4c). Never touches truck hit capacity
 * (animal AC5) — that's a wholly separate farmer system.
 */
export function resolveBoop(animal: AnimalState): BoopResult {
  const coinsAwarded = computeCoins(animal.sizeTier, animal.speedTier);
  return { animal: { ...animal, alive: false }, coinsAwarded };
}
