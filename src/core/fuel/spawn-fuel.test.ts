import { describe, expect, it } from 'vitest';
import { spawnFuelPickup } from './spawn-fuel';

// Fuel pickup factory (ADR 0008 §1): produces a FuelPickupState -- just an
// id + position, no animal concepts (no alive/species/scatter, fuel AC13).
describe('spawnFuelPickup', () => {
  it('produces a FuelPickupState with the requested id and position', () => {
    const pickup = spawnFuelPickup('fuel-1', { x: 3, z: -2 });
    expect(pickup).toEqual({ id: 'fuel-1', position: { x: 3, z: -2 } });
  });

  it('does not carry any animal-only fields', () => {
    const pickup = spawnFuelPickup('fuel-1', { x: 0, z: 0 });
    expect(pickup).not.toHaveProperty('alive');
    expect(pickup).not.toHaveProperty('species');
  });
});
