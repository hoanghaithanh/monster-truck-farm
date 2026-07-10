import { describe, expect, it } from 'vitest';
import {
  BODY_TIER_SOCKETS,
  DEFAULT_SOCKETS,
  WHEEL_RADIUS_BY_TIER,
  socketsForBodyTier,
  footprintForBodyTier,
} from './truck-sockets';

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

// Regression tests (issue #36): pin every BODY_TIER_SOCKETS entry's full
// values -- body, bodyScale, all 4 wheels, wheelScale, engine, gasTank -- so
// an accidental edit to any tier's sourced-art-derived constants (module
// header in truck-sockets.ts explains how each number was derived) shows up
// as a failing test instead of a silent drift. These pin *all three* tiers;
// the describe block above already covers tier 2's wheel Z values/mirroring
// from issue #38, so it isn't duplicated here.
describe('BODY_TIER_SOCKETS full-value regression (issue #36)', () => {
  it('tier 0 matches its authored values', () => {
    const tier0 = BODY_TIER_SOCKETS[0];
    expect(tier0.body.x).toBe(0);
    expect(tier0.body.y).toBeCloseTo(0.1001, 4);
    expect(tier0.body.z).toBe(0);
    expect(tier0.bodyScale).toBeCloseTo(0.3475, 4);

    const [frontLeft, frontRight, rearLeft, rearRight] = tier0.wheels;
    expect(frontLeft.x).toBeCloseTo(0.5557, 4);
    expect(frontLeft.y).toBeCloseTo(0.28, 4);
    expect(frontLeft.z).toBeCloseTo(0.558, 4);
    expect(frontRight.x).toBeCloseTo(-0.5557, 4);
    expect(frontRight.y).toBeCloseTo(0.28, 4);
    expect(frontRight.z).toBeCloseTo(0.558, 4);
    expect(rearLeft.x).toBeCloseTo(0.5557, 4);
    expect(rearLeft.y).toBeCloseTo(0.28, 4);
    expect(rearLeft.z).toBeCloseTo(-0.558, 4);
    expect(rearRight.x).toBeCloseTo(-0.5557, 4);
    expect(rearRight.y).toBeCloseTo(0.28, 4);
    expect(rearRight.z).toBeCloseTo(-0.558, 4);

    expect(tier0.wheelScale).toBeCloseTo(0.5207, 4);
    expect(tier0.engine.x).toBe(0);
    expect(tier0.engine.y).toBeCloseTo(0.6851, 4);
    expect(tier0.engine.z).toBeCloseTo(0.648, 4);
    expect(tier0.gasTank.x).toBeCloseTo(0.3615, 4);
    expect(tier0.gasTank.y).toBeCloseTo(0.4089, 4);
    expect(tier0.gasTank.z).toBeCloseTo(-0.612, 4);
  });

  it('tier 1 matches its authored values', () => {
    const tier1 = BODY_TIER_SOCKETS[1];
    expect(tier1.body.x).toBe(0);
    expect(tier1.body.y).toBeCloseTo(0.3111, 4);
    expect(tier1.body.z).toBe(0);
    expect(tier1.bodyScale).toBeCloseTo(0.3724, 4);

    const [frontLeft, frontRight, rearLeft, rearRight] = tier1.wheels;
    expect(frontLeft.x).toBeCloseTo(0.7134, 4);
    expect(frontLeft.y).toBeCloseTo(0.4, 4);
    expect(frontLeft.z).toBeCloseTo(0.6355, 4);
    expect(frontRight.x).toBeCloseTo(-0.7134, 4);
    expect(frontRight.y).toBeCloseTo(0.4, 4);
    expect(frontRight.z).toBeCloseTo(0.6355, 4);
    expect(rearLeft.x).toBeCloseTo(0.7134, 4);
    expect(rearLeft.y).toBeCloseTo(0.4, 4);
    expect(rearLeft.z).toBeCloseTo(-0.6355, 4);
    expect(rearRight.x).toBeCloseTo(-0.7134, 4);
    expect(rearRight.y).toBeCloseTo(0.4, 4);
    expect(rearRight.z).toBeCloseTo(-0.6355, 4);

    expect(tier1.wheelScale).toBeCloseTo(0.7166, 4);
    expect(tier1.engine.x).toBe(0);
    expect(tier1.engine.y).toBeCloseTo(0.9743, 4);
    expect(tier1.engine.z).toBeCloseTo(0.738, 4);
    expect(tier1.gasTank.x).toBeCloseTo(0.444, 4);
    expect(tier1.gasTank.y).toBeCloseTo(0.5827, 4);
    expect(tier1.gasTank.z).toBeCloseTo(-0.697, 4);
  });

  it('tier 2 matches its authored values (body/bodyScale/wheelScale/engine/gasTank not covered by the #38 describe block above)', () => {
    const tier2 = BODY_TIER_SOCKETS[2];
    expect(tier2.body.x).toBe(0);
    expect(tier2.body.y).toBeCloseTo(0.5059, 4);
    expect(tier2.body.z).toBe(0);
    expect(tier2.bodyScale).toBeCloseTo(0.4125, 4);

    const [frontLeft, frontRight, rearLeft, rearRight] = tier2.wheels;
    expect(frontLeft.x).toBeCloseTo(0.9328, 4);
    expect(frontLeft.y).toBeCloseTo(0.58, 4);
    expect(frontRight.x).toBeCloseTo(-0.9328, 4);
    expect(frontRight.y).toBeCloseTo(0.58, 4);
    expect(rearLeft.x).toBeCloseTo(0.9328, 4);
    expect(rearLeft.y).toBeCloseTo(0.58, 4);
    expect(rearRight.x).toBeCloseTo(-0.9328, 4);
    expect(rearRight.y).toBeCloseTo(0.58, 4);

    expect(tier2.wheelScale).toBeCloseTo(1.039, 4);
    expect(tier2.engine.x).toBe(0);
    expect(tier2.engine.y).toBeCloseTo(1.569, 4);
    expect(tier2.engine.z).toBeCloseTo(0.828, 4);
    expect(tier2.gasTank.x).toBeCloseTo(0.5524, 4);
    expect(tier2.gasTank.y).toBeCloseTo(0.8947, 4);
    expect(tier2.gasTank.z).toBeCloseTo(-0.782, 4);
  });
});

describe('WHEEL_RADIUS_BY_TIER (issue #36)', () => {
  it('pins the Base/Off-road/Monster wheel-radius progression', () => {
    expect(WHEEL_RADIUS_BY_TIER[0]).toBe(0.28);
    expect(WHEEL_RADIUS_BY_TIER[1]).toBe(0.4);
    expect(WHEEL_RADIUS_BY_TIER[2]).toBe(0.58);
  });
});

describe('socketsForBodyTier (issue #36)', () => {
  it('returns each in-range tier\'s own table, not the fallback', () => {
    expect(socketsForBodyTier(0)).toBe(BODY_TIER_SOCKETS[0]);
    expect(socketsForBodyTier(1)).toBe(BODY_TIER_SOCKETS[1]);
    expect(socketsForBodyTier(2)).toBe(BODY_TIER_SOCKETS[2]);
  });

  it.each([-1, 3, 99])('falls back to DEFAULT_SOCKETS for an out-of-range tier index (%d)', (tier) => {
    expect(socketsForBodyTier(tier)).toBe(DEFAULT_SOCKETS);
  });

  it('DEFAULT_SOCKETS is exactly BODY_TIER_SOCKETS[0]', () => {
    expect(DEFAULT_SOCKETS).toBe(BODY_TIER_SOCKETS[0]);
  });
});

describe('footprintForBodyTier (ADR 0014, issue #42): plain-number wheel footprint extraction for core/driving/obstacle-climb.ts', () => {
  it('extracts halfTrack/zFront/zRear from each in-range tier\'s own front-right/rear-right wheel sockets', () => {
    for (const tier of [0, 1, 2]) {
      const sockets = BODY_TIER_SOCKETS[tier];
      const [, frontRight, , rearRight] = sockets.wheels;
      const footprint = footprintForBodyTier(tier);
      expect(footprint.halfTrack).toBeCloseTo(Math.abs(frontRight.x), 6);
      expect(footprint.zFront).toBeCloseTo(frontRight.z, 6);
      expect(footprint.zRear).toBeCloseTo(rearRight.z, 6);
    }
  });

  it('matches ADR 0014\'s §Layering table numbers for tier 0/1/2', () => {
    const tier0 = footprintForBodyTier(0);
    expect(tier0.halfTrack).toBeCloseTo(0.556, 2);
    expect(tier0.zFront).toBeCloseTo(0.558, 2);
    expect(tier0.zRear).toBeCloseTo(-0.558, 2);

    const tier1 = footprintForBodyTier(1);
    expect(tier1.halfTrack).toBeCloseTo(0.713, 2);
    expect(tier1.zFront).toBeCloseTo(0.636, 2);
    expect(tier1.zRear).toBeCloseTo(-0.636, 2);

    const tier2 = footprintForBodyTier(2);
    expect(tier2.halfTrack).toBeCloseTo(0.933, 2);
    expect(tier2.zFront).toBeCloseTo(0.479, 2);
    expect(tier2.zRear).toBeCloseTo(-0.885, 2);
  });

  it.each([-1, 3, 99])('falls back to tier 0\'s footprint for an out-of-range tier index (%d) -- never crash (ADR 0010 §7)', (tier) => {
    expect(footprintForBodyTier(tier)).toEqual(footprintForBodyTier(0));
  });
});
