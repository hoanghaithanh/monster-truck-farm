import { describe, expect, it } from 'vitest';
import { isFarmerContact } from './contact';

const TRUCK_RADIUS = 0.9;
const FARMER_RADIUS = 0.6;

describe('isFarmerContact — farmer bump contact detection (farmer AC3)', () => {
  it('detects contact when circles overlap', () => {
    expect(isFarmerContact({ x: 0, z: 0 }, TRUCK_RADIUS, { x: 1, z: 0 }, FARMER_RADIUS)).toBe(true); // dist 1 < 1.5
  });

  it('does not detect contact when farmer is far away', () => {
    expect(isFarmerContact({ x: 0, z: 0 }, TRUCK_RADIUS, { x: 10, z: 0 }, FARMER_RADIUS)).toBe(false);
  });

  it('boundary case: distance exactly equal to combined radii is NOT contact (strict less-than)', () => {
    expect(isFarmerContact({ x: 0, z: 0 }, TRUCK_RADIUS, { x: 1.5, z: 0 }, FARMER_RADIUS)).toBe(false);
  });

  it('boundary case: distance just inside combined radii IS contact', () => {
    expect(isFarmerContact({ x: 0, z: 0 }, TRUCK_RADIUS, { x: 1.49, z: 0 }, FARMER_RADIUS)).toBe(true);
  });

  it('works along both axes, not just aligned on one', () => {
    // distance = hypot(1,1) ~= 1.414 < 1.5
    expect(isFarmerContact({ x: 0, z: 0 }, TRUCK_RADIUS, { x: 1, z: 1 }, FARMER_RADIUS)).toBe(true);
  });
});
