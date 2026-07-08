// Fuel pickup factory (ADR 0008 §1), mirrors core/spawn/spawn-animal.ts.
// A fuel pickup has none of an animal's concepts (species/sizeTier/alive) --
// it's inanimate and instant-collect (AC13), so its payload is just an id +
// position.
import type { FuelPickupState, Vec2 } from '../types';

export function spawnFuelPickup(id: string, position: Vec2): FuelPickupState {
  return { id, position };
}
