import { describe, expect, it } from 'vitest';
import { BODY_TIER_SOCKETS } from './truck-sockets';

describe('BODY_TIER_SOCKETS[2] (issue #38, tier-2 front/rear wheel-well fix)', () => {
  // Values re-derived against the tier-2 body's own built-in
  // FrontWheel_L/FrontWheel_R/BackWheels node anchors (see truck-sockets.ts's
  // module-header comment for the derivation) -- pinned here so a future
  // edit can't silently drift back toward the old symmetric 0.713/-0.713
  // guess that caused the "detached front wheel" defect (#38) without a
  // test failing.
  it('places the front wheel socket Z at the real wheel-well anchor (~0.479), not the old symmetric guess (0.713)', () => {
    const [frontLeft, frontRight] = BODY_TIER_SOCKETS[2].wheels;
    expect(frontLeft.z).toBeCloseTo(0.479, 3);
    expect(frontRight.z).toBeCloseTo(0.479, 3);
  });

  it('places the rear wheel socket Z at the real wheel-well anchor (~-0.885), not the old symmetric guess (-0.713)', () => {
    const [, , rearLeft, rearRight] = BODY_TIER_SOCKETS[2].wheels;
    expect(rearLeft.z).toBeCloseTo(-0.885, 3);
    expect(rearRight.z).toBeCloseTo(-0.885, 3);
  });

  it('front and rear wheel sockets stay mirrored left/right (only fore-aft Z differs from the old table)', () => {
    const [frontLeft, frontRight, rearLeft, rearRight] = BODY_TIER_SOCKETS[2].wheels;
    expect(frontLeft.x).toBe(-frontRight.x);
    expect(rearLeft.x).toBe(-rearRight.x);
    expect(frontLeft.y).toBe(frontRight.y);
    expect(rearLeft.y).toBe(rearRight.y);
  });
});
