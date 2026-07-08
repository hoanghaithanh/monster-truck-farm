import { describe, expect, it } from 'vitest';
import { isFuelContact } from './collect';
import type { FuelPickupState } from '../types';

const TRUCK_RADIUS = 1;
const FUEL_RADIUS = 0.5;

function makePickup(overrides: Partial<FuelPickupState> = {}): FuelPickupState {
  return { id: 'fuel-1', position: { x: 0, z: 0 }, ...overrides };
}

// Fuel-vs-truck contact (ADR 0008 §1, fuel AC5): same circle-overlap
// geometry as isBoopContact/isFarmerContact.
describe('isFuelContact — contact detection (fuel AC5)', () => {
  it('detects contact when circles overlap', () => {
    const pickup = makePickup({ position: { x: 1, z: 0 } }); // distance 1 < 1 + 0.5
    expect(isFuelContact({ x: 0, z: 0 }, TRUCK_RADIUS, pickup, FUEL_RADIUS)).toBe(true);
  });

  it('does not detect contact when far away', () => {
    const pickup = makePickup({ position: { x: 10, z: 0 } });
    expect(isFuelContact({ x: 0, z: 0 }, TRUCK_RADIUS, pickup, FUEL_RADIUS)).toBe(false);
  });

  it('boundary case: distance exactly equal to combined radii is NOT contact (strict less-than)', () => {
    const pickup = makePickup({ position: { x: 1.5, z: 0 } });
    expect(isFuelContact({ x: 0, z: 0 }, TRUCK_RADIUS, pickup, FUEL_RADIUS)).toBe(false);
  });

  it('boundary case: distance just inside combined radii IS contact', () => {
    const pickup = makePickup({ position: { x: 1.49, z: 0 } });
    expect(isFuelContact({ x: 0, z: 0 }, TRUCK_RADIUS, pickup, FUEL_RADIUS)).toBe(true);
  });

  it('works along both axes, not just aligned on one', () => {
    const pickup = makePickup({ position: { x: 1, z: 1 } }); // hypot(1,1) ~= 1.414 < 1.5
    expect(isFuelContact({ x: 0, z: 0 }, TRUCK_RADIUS, pickup, FUEL_RADIUS)).toBe(true);
  });
});
