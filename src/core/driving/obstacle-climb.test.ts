import { describe, expect, it } from 'vitest';
import { computeClimbTransform, type TruckFootprint } from './obstacle-climb';
import { DEFAULT_CLIMB_CONFIG, TRUCK_CONTACT_RADIUS, type ClimbConfig } from './config';
import type { ObstacleInstance } from '../types';

// Tier-0/tier-2 footprint fixtures (ADR 0014 §Layering table -- the real
// per-body-tier numbers `render/truck-sockets.ts`'s footprintForBodyTier
// would extract). Tier 0 is symmetric front/rear; tier 2 is deliberately
// asymmetric (zFront 0.479 / zRear -0.885), which is why "pitch ~ 0 exactly
// at dead-center" is a tier-0-only property, not a general one.
const TIER0_FOOTPRINT: TruckFootprint = { halfTrack: 0.556, zFront: 0.558, zRear: -0.558 };
const TIER2_FOOTPRINT: TruckFootprint = { halfTrack: 0.933, zFront: 0.479, zRear: -0.885 };

function bush(overrides: Partial<ObstacleInstance> = {}): ObstacleInstance {
  return {
    id: 'bush-1',
    kind: 'bush',
    sizeClass: 'small',
    position: { x: 0, z: 0 },
    radius: 0.6,
    ...overrides,
  };
}

describe('computeClimbTransform (obstacle climb, ADR 0013 superseded by ADR 0014 four-corner sampling / issue #42)', () => {
  it('returns exactly {0,0,0} for an empty obstacle list', () => {
    const result = computeClimbTransform({ x: 5, z: 5 }, 0, TIER0_FOOTPRINT, [], DEFAULT_CLIMB_CONFIG);
    expect(result).toEqual({ lift: 0, pitch: 0, roll: 0 });
  });

  it('produces zero lift when the truck (all four corners) is outside every footprint', () => {
    const obstacle = bush();
    const combinedRadius = obstacle.radius + TRUCK_CONTACT_RADIUS;
    // Generous margin beyond combinedRadius so even the wheel corners (offset
    // by the footprint's half-diagonal from truckPos) stay outside.
    const result = computeClimbTransform(
      { x: combinedRadius + 3, z: 0 },
      0,
      TIER0_FOOTPRINT,
      [obstacle],
      DEFAULT_CLIMB_CONFIG,
    );
    expect(result.lift).toBe(0);
    expect(result.pitch).toBe(0);
    expect(result.roll).toBe(0);
  });

  it('lift rises monotonically as the truck (all corners, symmetric tier-0 footprint) approaches the obstacle center', () => {
    const obstacle = bush();
    const combinedRadius = obstacle.radius + TRUCK_CONTACT_RADIUS;
    const distances = [combinedRadius + 2, combinedRadius * 0.6, combinedRadius * 0.3, 0];
    const lifts = distances.map(
      (d) => computeClimbTransform({ x: d, z: 0 }, 0, TIER0_FOOTPRINT, [obstacle], DEFAULT_CLIMB_CONFIG).lift,
    );
    for (let i = 1; i < lifts.length; i++) {
      expect(lifts[i]).toBeGreaterThan(lifts[i - 1]);
    }
  });

  it('centered over an obstacle: lift > 0 but strictly below that obstacle single-point peak, pitch/roll ~ 0 by tier-0 symmetry', () => {
    // ADR 0014: this REPLACES ADR 0013's "center.lift ~= peak" assertion,
    // which is now false -- under 4-corner averaging no corner ever sits
    // exactly at the obstacle's center (each is offset by the footprint's
    // half-diagonal), so the realized lift must be below the single-point
    // peak the old center-sample formula would have produced.
    const obstacle = bush();
    const center = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [obstacle], DEFAULT_CLIMB_CONFIG);
    const singlePointPeak = Math.min(DEFAULT_CLIMB_CONFIG.maxLift, DEFAULT_CLIMB_CONFIG.liftScale * obstacle.radius);
    expect(center.lift).toBeGreaterThan(0);
    expect(center.lift).toBeLessThan(singlePointPeak);
    expect(center.pitch).toBeCloseTo(0);
    expect(center.roll).toBeCloseTo(0);
  });

  it('peak lift scales with obstacle radius (bigger obstacle -> bigger centered bump)', () => {
    const smallObstacle = bush({ id: 'small', radius: 0.6 });
    const bigObstacle = bush({ id: 'big', radius: 1.8 });
    const smallLift = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [smallObstacle], DEFAULT_CLIMB_CONFIG).lift;
    const bigLift = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [bigObstacle], DEFAULT_CLIMB_CONFIG).lift;
    expect(bigLift).toBeGreaterThan(smallLift);
  });

  it('caps lift at (approximately) config.maxLift regardless of how large the obstacle radius is', () => {
    // With a huge radius, combinedRadius dwarfs the footprint's half-diagonal,
    // so all four corners sit effectively at the obstacle's center -- lift
    // converges to the single-point peak (maxLift, since liftScale*radius
    // vastly exceeds it).
    const hugeObstacle = bush({ radius: 100 });
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [hugeObstacle], DEFAULT_CLIMB_CONFIG);
    expect(result.lift).toBeCloseTo(DEFAULT_CLIMB_CONFIG.maxLift, 1);
  });

  it('maxLiftByClass still caps a matching sizeClass lower than an obstacle with no override', () => {
    // Comparative, not exact-value: under 4-corner averaging the realized
    // lift is a mean of sub-peak corner samples, so it no longer equals
    // maxLiftByClass.large directly -- but the override must still produce
    // a strictly lower lift than the same obstacle would get without it.
    const derelictCar = bush({ id: 'derelict', sizeClass: 'large', radius: 1.8 });
    const withOverride = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [derelictCar], DEFAULT_CLIMB_CONFIG);
    const noOverrideConfig: ClimbConfig = { ...DEFAULT_CLIMB_CONFIG, maxLiftByClass: undefined };
    const withoutOverride = computeClimbTransform(
      { x: 0, z: 0 },
      0,
      TIER0_FOOTPRINT,
      [derelictCar],
      noOverrideConfig,
    );
    expect(DEFAULT_CLIMB_CONFIG.maxLiftByClass?.large).toBeDefined();
    expect(withOverride.lift).toBeGreaterThan(0);
    expect(withOverride.lift).toBeLessThan(withoutOverride.lift);
  });

  it('a sizeClass with no matching maxLiftByClass entry falls back to the global maxLift (differs from an overridden class)', () => {
    const rock = bush({ id: 'rock', sizeClass: 'medium', radius: 1.0 });
    const lowCapForMedium: ClimbConfig = {
      ...DEFAULT_CLIMB_CONFIG,
      maxLiftByClass: { ...DEFAULT_CLIMB_CONFIG.maxLiftByClass, medium: 0.05 },
    };
    const withGlobalFallback = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [rock], DEFAULT_CLIMB_CONFIG);
    const withMediumOverride = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [rock], lowCapForMedium);
    expect(withGlobalFallback.lift).toBeGreaterThan(withMediumOverride.lift);
  });

  it('uses per-corner max (not sum) across two overlapping footprints', () => {
    const a = bush({ id: 'a', position: { x: -0.3, z: 0 }, radius: 0.6 });
    const b = bush({ id: 'b', position: { x: 0.3, z: 0 }, radius: 1.0 });
    const combined = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [a, b], DEFAULT_CLIMB_CONFIG);
    const aOnly = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [a], DEFAULT_CLIMB_CONFIG);
    const bOnly = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [b], DEFAULT_CLIMB_CONFIG);
    // Per-corner max is pointwise >= either obstacle alone, so the mean
    // (combined.lift) is always >= the greater of the two single-obstacle means.
    expect(combined.lift).toBeGreaterThanOrEqual(Math.max(aOnly.lift, bOnly.lift) - 1e-9);
    // Explicitly rule out summing: sum would be strictly greater than this.
    expect(combined.lift).toBeLessThan(aOnly.lift + bOnly.lift);
  });

  it('pitches the nose up while approaching (before the center) and down while leaving (past the center), symmetric tier-0 footprint', () => {
    // Sign convention (matches render/scene.ts's group.rotation.set(pitch, heading, roll, 'YXZ')
    // applied verbatim, no negation): with forward = +Z at heading 0, Three.js
    // rotates a positive rotation.x so the +Z direction dips toward -Y --
    // i.e. positive climb.pitch reads as nose-DOWN, negative as nose-UP.
    const obstacle = bush();
    const combinedRadius = obstacle.radius + TRUCK_CONTACT_RADIUS;
    const approaching = computeClimbTransform(
      { x: 0, z: -combinedRadius * 0.5 },
      0,
      TIER0_FOOTPRINT,
      [obstacle],
      DEFAULT_CLIMB_CONFIG,
    );
    const leaving = computeClimbTransform(
      { x: 0, z: combinedRadius * 0.5 },
      0,
      TIER0_FOOTPRINT,
      [obstacle],
      DEFAULT_CLIMB_CONFIG,
    );
    expect(approaching.pitch).toBeLessThan(0);
    expect(leaving.pitch).toBeGreaterThan(0);
    expect(approaching.pitch).toBeCloseTo(-leaving.pitch);
  });

  it('pitch is ~0 at the exact crest for a symmetric (tier-0) footprint', () => {
    const obstacle = bush();
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [obstacle], DEFAULT_CLIMB_CONFIG);
    expect(result.pitch).toBeCloseTo(0);
  });

  it('clamps pitch to maxPitch even with an aggressive tiltGain', () => {
    const obstacle = bush();
    const combinedRadius = obstacle.radius + TRUCK_CONTACT_RADIUS;
    const aggressiveConfig: ClimbConfig = { ...DEFAULT_CLIMB_CONFIG, tiltGain: 1000, maxPitch: 0.2 };
    const result = computeClimbTransform(
      { x: 0, z: -combinedRadius * 0.5 },
      0,
      TIER0_FOOTPRINT,
      [obstacle],
      aggressiveConfig,
    );
    expect(Math.abs(result.pitch)).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it('roll defaults to 0 with DEFAULT_CLIMB_CONFIG (maxRoll caution, AC3)', () => {
    const obstacle = bush();
    const combinedRadius = obstacle.radius + TRUCK_CONTACT_RADIUS;
    const result = computeClimbTransform(
      { x: combinedRadius * 0.3, z: 0 },
      0,
      TIER0_FOOTPRINT,
      [obstacle],
      DEFAULT_CLIMB_CONFIG,
    );
    expect(result.roll).toBe(0);
  });

  it('produces nonzero, correctly-signed roll when the obstacle sits under the truck body-frame right vs. left', () => {
    // Offset the OBSTACLE (not the truck) along the truck's own `right`
    // vector, with the truck fixed at the origin -- this is the unambiguous
    // way to phrase "obstacle under the truck's right/left": offsetting the
    // *truck* instead by the same amount relative to a fixed obstacle is
    // mathematically equivalent (only relative position matters) but reads
    // backwards (moving the truck to +x puts the obstacle at the truck's
    // relative -x, i.e. its LEFT, not its right) -- exactly the mix-up ADR
    // 0014's Risks section calls out ("roll sign flip / left-right corner
    // mix-up"). Obstacle offsetting keeps the test's intent legible.
    const combinedRadius = 0.6 + TRUCK_CONTACT_RADIUS;
    const heading = 0;
    const right: { x: number; z: number } = { x: Math.cos(heading), z: -Math.sin(heading) };
    const offset = combinedRadius * 0.5;
    const rollConfig: ClimbConfig = { ...DEFAULT_CLIMB_CONFIG, maxRoll: 0.2 };

    const obstacleUnderRight = bush({ position: { x: right.x * offset, z: right.z * offset } });
    const obstacleUnderLeft = bush({ position: { x: -right.x * offset, z: -right.z * offset } });

    const underRight = computeClimbTransform({ x: 0, z: 0 }, heading, TIER0_FOOTPRINT, [obstacleUnderRight], rollConfig);
    const underLeft = computeClimbTransform({ x: 0, z: 0 }, heading, TIER0_FOOTPRINT, [obstacleUnderLeft], rollConfig);

    expect(underRight.pitch).toBeCloseTo(0);
    expect(underLeft.pitch).toBeCloseTo(0);
    expect(underRight.roll).not.toBe(0);
    // Sign convention (ADR 0013, reaffirmed unchanged by ADR 0014 §Decision
    // step 4): obstacle under the truck's right -> positive roll.
    expect(underRight.roll).toBeGreaterThan(0);
    expect(underLeft.roll).toBeLessThan(0);
    expect(underRight.roll).toBeCloseTo(-underLeft.roll);
  });

  it('roll sign convention holds under a rotated heading (right vector follows heading, not world X)', () => {
    const combinedRadius = 0.6 + TRUCK_CONTACT_RADIUS;
    const heading = Math.PI / 2;
    // At heading = PI/2, right = (cos(PI/2), -sin(PI/2)) = (0, -1) -- the
    // truck's body-frame right now points along world -Z, not +X.
    const right: { x: number; z: number } = { x: Math.cos(heading), z: -Math.sin(heading) };
    const offset = combinedRadius * 0.5;
    const rollConfig: ClimbConfig = { ...DEFAULT_CLIMB_CONFIG, maxRoll: 0.2 };

    const obstacleUnderRight = bush({ position: { x: right.x * offset, z: right.z * offset } });
    const obstacleUnderLeft = bush({ position: { x: -right.x * offset, z: -right.z * offset } });

    const underRight = computeClimbTransform({ x: 0, z: 0 }, heading, TIER0_FOOTPRINT, [obstacleUnderRight], rollConfig);
    const underLeft = computeClimbTransform({ x: 0, z: 0 }, heading, TIER0_FOOTPRINT, [obstacleUnderLeft], rollConfig);

    expect(underRight.pitch).toBeCloseTo(0);
    expect(underLeft.pitch).toBeCloseTo(0);
    expect(underRight.roll).toBeGreaterThan(0);
    expect(underLeft.roll).toBeLessThan(0);
    expect(underRight.roll).toBeCloseTo(-underLeft.roll);
  });

  it('clamps roll to maxRoll even with an aggressive tiltGain', () => {
    const obstacle = bush();
    const combinedRadius = obstacle.radius + TRUCK_CONTACT_RADIUS;
    const aggressiveConfig: ClimbConfig = { ...DEFAULT_CLIMB_CONFIG, tiltGain: 1000, maxRoll: 0.2 };
    const result = computeClimbTransform(
      { x: combinedRadius * 0.5, z: 0 },
      0,
      TIER0_FOOTPRINT,
      [obstacle],
      aggressiveConfig,
    );
    expect(Math.abs(result.roll)).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it('a passable-only obstacle list needs no special-casing for a blocking-class obstacle -- the function only ever reads position/radius from whatever it is handed', () => {
    const largeObstacle = bush({ sizeClass: 'large', radius: 1.8 });
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [largeObstacle], DEFAULT_CLIMB_CONFIG);
    expect(result.lift).toBeGreaterThan(0);
  });

  // --- ADR 0014 §Test/verification: the actual regression guard for the ---
  // --- rock-clipping defect that motivated this rework. ---------------------
  it('REGRESSION GUARD: an obstacle under the front axle only (front corners in, rear corners out) produces nose-up pitch and a moderate, non-peak lift', () => {
    // Rock-sized obstacle (radius 1.0, matching core/terrain.ts's stub rock)
    // placed so that with the tier-0 footprint, the two front corners
    // (z = +0.558, x = ±0.556) fall inside combinedRadius (1.9) but the two
    // rear corners (z = -0.558) fall outside it -- exactly the "front two
    // wheels up on the rock's slope, rear two still on flat ground" state
    // ADR 0013's single-center sample could not represent (it would either
    // lift the whole rig too much or too little based on where the center
    // alone happened to sit, letting the rock visually clip into the cab).
    const rock = bush({ id: 'rock', kind: 'rock', sizeClass: 'medium', radius: 1.0, position: { x: 0, z: 1.8 } });
    const combinedRadius = rock.radius + TRUCK_CONTACT_RADIUS;

    const frontLeftDist = Math.hypot(TIER0_FOOTPRINT.halfTrack, rock.position.z - TIER0_FOOTPRINT.zFront);
    const rearLeftDist = Math.hypot(TIER0_FOOTPRINT.halfTrack, rock.position.z - TIER0_FOOTPRINT.zRear);
    expect(frontLeftDist).toBeLessThan(combinedRadius); // sanity: front corners are in range
    expect(rearLeftDist).toBeGreaterThan(combinedRadius); // sanity: rear corners are out of range

    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [rock], DEFAULT_CLIMB_CONFIG);
    const singlePointPeak = Math.min(DEFAULT_CLIMB_CONFIG.maxLift, DEFAULT_CLIMB_CONFIG.liftScale * rock.radius);

    expect(result.pitch).toBeLessThan(0); // nose-up: this is the fix
    expect(result.lift).toBeGreaterThan(0);
    expect(result.lift).toBeLessThan(singlePointPeak); // moderate, not the obstacle's full peak
  });

  it('BELLY-CLIP GUARD: an obstacle smaller than the wheel spread, centered under the truck, still lifts the body', () => {
    // A small obstacle (radius 0.3) sitting exactly at the truck's center
    // is smaller than the footprint's own half-diagonal (~0.79 for tier 0),
    // so a naive "is the obstacle under any wheel" check could wrongly read
    // this as "no wheel is over it" and produce zero lift, letting the mesh
    // poke through the truck's belly. Because combinedRadius (0.3+0.9=1.2)
    // still exceeds the corner-to-center distance, every corner is inside
    // the footprint and lift must be > 0.
    const smallObstacle = bush({ id: 'small-center', radius: 0.3, position: { x: 0, z: 0 } });
    const result = computeClimbTransform(
      { x: 0, z: 0 },
      0,
      TIER0_FOOTPRINT,
      [smallObstacle],
      DEFAULT_CLIMB_CONFIG,
    );
    expect(result.lift).toBeGreaterThan(0);
  });

  it('TIER SENSITIVITY: the same obstacle/position produces different lift/pitch under a tier-0 vs. tier-2 footprint', () => {
    // Documents that footprint is load-bearing (ADR 0014 §Layering's
    // rejection of a single shared core constant) -- tier 2's wider track
    // and asymmetric wheelbase must change the sampled result for an
    // identical obstacle placement.
    const rock = bush({ id: 'rock', kind: 'rock', sizeClass: 'medium', radius: 1.0, position: { x: 0, z: 1.5 } });
    const tier0Result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [rock], DEFAULT_CLIMB_CONFIG);
    const tier2Result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER2_FOOTPRINT, [rock], DEFAULT_CLIMB_CONFIG);
    const differs =
      Math.abs(tier0Result.lift - tier2Result.lift) > 1e-6 || Math.abs(tier0Result.pitch - tier2Result.pitch) > 1e-6;
    expect(differs).toBe(true);
  });
});
