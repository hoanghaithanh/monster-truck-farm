import { describe, expect, it } from 'vitest';
import { isFenceContact } from './contact';

const TRUCK_RADIUS = 0.9;
const FENCE_RADIUS = 2.945;

describe('isFenceContact — fence collapse contact detection (issue #54, AC8)', () => {
  it('detects contact when circles overlap', () => {
    expect(isFenceContact({ x: 0, z: 0 }, TRUCK_RADIUS, { x: 3, z: 0 }, FENCE_RADIUS)).toBe(true); // dist 3 < 3.845
  });

  it('does not detect contact when the fence is far away', () => {
    expect(isFenceContact({ x: 0, z: 0 }, TRUCK_RADIUS, { x: 20, z: 0 }, FENCE_RADIUS)).toBe(false);
  });

  it('boundary case: distance exactly equal to combined radii is NOT contact (strict less-than)', () => {
    expect(isFenceContact({ x: 0, z: 0 }, TRUCK_RADIUS, { x: 3.845, z: 0 }, FENCE_RADIUS)).toBe(false);
  });

  it('boundary case: distance just inside combined radii IS contact', () => {
    expect(isFenceContact({ x: 0, z: 0 }, TRUCK_RADIUS, { x: 3.84, z: 0 }, FENCE_RADIUS)).toBe(true);
  });

  it('works along both axes, not just aligned on one', () => {
    // distance = hypot(2.7,2.7) ~= 3.818 < 3.845
    expect(isFenceContact({ x: 0, z: 0 }, TRUCK_RADIUS, { x: 2.7, z: 2.7 }, FENCE_RADIUS)).toBe(true);
  });
});
