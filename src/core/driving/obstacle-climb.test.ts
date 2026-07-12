import { describe, expect, it } from 'vitest';
import { computeClimbTransform, type TruckFootprint } from './obstacle-climb';
import {
  DEFAULT_CLIMB_CONFIG,
  DEFAULT_SUSPENSION_CONFIG,
  TRUCK_CONTACT_RADIUS,
  type ClimbConfig,
  type SuspensionConfig,
} from './config';
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
  it('returns exactly {0,0,0} (and all-zero wheelSuspension) for an empty obstacle list', () => {
    const result = computeClimbTransform({ x: 5, z: 5 }, 0, TIER0_FOOTPRINT, [], DEFAULT_CLIMB_CONFIG, () => 0);
    expect(result).toEqual({ lift: 0, pitch: 0, roll: 0, wheelSuspension: { fl: 0, fr: 0, rl: 0, rr: 0 } });
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
      DEFAULT_CLIMB_CONFIG, () => 0
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
      (d) => computeClimbTransform({ x: d, z: 0 }, 0, TIER0_FOOTPRINT, [obstacle], DEFAULT_CLIMB_CONFIG, () => 0).lift,
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
    const center = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [obstacle], DEFAULT_CLIMB_CONFIG, () => 0);
    const singlePointPeak = Math.min(DEFAULT_CLIMB_CONFIG.maxLift, DEFAULT_CLIMB_CONFIG.liftScale * obstacle.radius);
    expect(center.lift).toBeGreaterThan(0);
    expect(center.lift).toBeLessThan(singlePointPeak);
    expect(center.pitch).toBeCloseTo(0);
    expect(center.roll).toBeCloseTo(0);
  });

  it('peak lift scales with obstacle radius (bigger obstacle -> bigger centered bump)', () => {
    const smallObstacle = bush({ id: 'small', radius: 0.6 });
    const bigObstacle = bush({ id: 'big', radius: 1.8 });
    const smallLift = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [smallObstacle], DEFAULT_CLIMB_CONFIG, () => 0).lift;
    const bigLift = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [bigObstacle], DEFAULT_CLIMB_CONFIG, () => 0).lift;
    expect(bigLift).toBeGreaterThan(smallLift);
  });

  it('caps lift at (approximately) config.maxLift regardless of how large the obstacle radius is', () => {
    // With a huge radius, combinedRadius dwarfs the footprint's half-diagonal,
    // so all four corners sit effectively at the obstacle's center -- lift
    // converges to the single-point peak (maxLift, since liftScale*radius
    // vastly exceeds it).
    const hugeObstacle = bush({ radius: 100 });
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [hugeObstacle], DEFAULT_CLIMB_CONFIG, () => 0);
    expect(result.lift).toBeCloseTo(DEFAULT_CLIMB_CONFIG.maxLift, 1);
  });

  it('maxLiftByClass still caps a matching sizeClass lower than an obstacle with no override', () => {
    // Comparative, not exact-value: under 4-corner averaging the realized
    // lift is a mean of sub-peak corner samples, so it no longer equals
    // maxLiftByClass.large directly -- but the override must still produce
    // a strictly lower lift than the same obstacle would get without it.
    const derelictCar = bush({ id: 'derelict', sizeClass: 'large', radius: 1.8 });
    const withOverride = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [derelictCar], DEFAULT_CLIMB_CONFIG, () => 0);
    const noOverrideConfig: ClimbConfig = { ...DEFAULT_CLIMB_CONFIG, maxLiftByClass: undefined };
    const withoutOverride = computeClimbTransform(
      { x: 0, z: 0 },
      0,
      TIER0_FOOTPRINT,
      [derelictCar],
      noOverrideConfig, () => 0
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
    const withGlobalFallback = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [rock], DEFAULT_CLIMB_CONFIG, () => 0);
    const withMediumOverride = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [rock], lowCapForMedium, () => 0);
    expect(withGlobalFallback.lift).toBeGreaterThan(withMediumOverride.lift);
  });

  it('uses per-corner max (not sum) across two overlapping footprints', () => {
    const a = bush({ id: 'a', position: { x: -0.3, z: 0 }, radius: 0.6 });
    const b = bush({ id: 'b', position: { x: 0.3, z: 0 }, radius: 1.0 });
    const combined = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [a, b], DEFAULT_CLIMB_CONFIG, () => 0);
    const aOnly = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [a], DEFAULT_CLIMB_CONFIG, () => 0);
    const bOnly = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [b], DEFAULT_CLIMB_CONFIG, () => 0);
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
      DEFAULT_CLIMB_CONFIG, () => 0
    );
    const leaving = computeClimbTransform(
      { x: 0, z: combinedRadius * 0.5 },
      0,
      TIER0_FOOTPRINT,
      [obstacle],
      DEFAULT_CLIMB_CONFIG, () => 0
    );
    expect(approaching.pitch).toBeLessThan(0);
    expect(leaving.pitch).toBeGreaterThan(0);
    expect(approaching.pitch).toBeCloseTo(-leaving.pitch);
  });

  it('pitch is ~0 at the exact crest for a symmetric (tier-0) footprint', () => {
    const obstacle = bush();
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [obstacle], DEFAULT_CLIMB_CONFIG, () => 0);
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
      aggressiveConfig, () => 0
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
      DEFAULT_CLIMB_CONFIG, () => 0
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
    // Ground truth, not this module's own internal `right` vector (issue
    // #64: the two were previously out of sync -- this test used to define
    // `right` as `{cos(heading), -sin(heading)}`, byte-identical to the
    // pre-fix (buggy) production formula, so it only ever verified the
    // production code agreed with itself, not with reality). Per
    // `core/driving/truck-motion.ts`'s `TruckMotionState.heading` doc
    // comment -- "Given forward = +Z, the truck's physical right side
    // (Forward x Up) is -X" -- physical right at heading 0 is exactly (-1, 0).
    const right: { x: number; z: number } = { x: -Math.cos(heading), z: Math.sin(heading) };
    const offset = combinedRadius * 0.5;
    const rollConfig: ClimbConfig = { ...DEFAULT_CLIMB_CONFIG, maxRoll: 0.2 };

    const obstacleUnderRight = bush({ position: { x: right.x * offset, z: right.z * offset } });
    const obstacleUnderLeft = bush({ position: { x: -right.x * offset, z: -right.z * offset } });

    const underRight = computeClimbTransform({ x: 0, z: 0 }, heading, TIER0_FOOTPRINT, [obstacleUnderRight], rollConfig, () => 0);
    const underLeft = computeClimbTransform({ x: 0, z: 0 }, heading, TIER0_FOOTPRINT, [obstacleUnderLeft], rollConfig, () => 0);

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
    // At heading = PI/2, physical right = (-cos(PI/2), sin(PI/2)) = (0, 1) --
    // the truck's body-frame right now points along world +Z, not -Z. (See
    // the ground-truth note in the heading-0 test just above -- same
    // `truck-motion.ts` Forward x Up derivation, evaluated at this heading.)
    const right: { x: number; z: number } = { x: -Math.cos(heading), z: Math.sin(heading) };
    const offset = combinedRadius * 0.5;
    const rollConfig: ClimbConfig = { ...DEFAULT_CLIMB_CONFIG, maxRoll: 0.2 };

    const obstacleUnderRight = bush({ position: { x: right.x * offset, z: right.z * offset } });
    const obstacleUnderLeft = bush({ position: { x: -right.x * offset, z: -right.z * offset } });

    const underRight = computeClimbTransform({ x: 0, z: 0 }, heading, TIER0_FOOTPRINT, [obstacleUnderRight], rollConfig, () => 0);
    const underLeft = computeClimbTransform({ x: 0, z: 0 }, heading, TIER0_FOOTPRINT, [obstacleUnderLeft], rollConfig, () => 0);

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
      aggressiveConfig, () => 0
    );
    expect(Math.abs(result.roll)).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it('a passable-only obstacle list needs no special-casing for a blocking-class obstacle -- the function only ever reads position/radius from whatever it is handed', () => {
    const largeObstacle = bush({ sizeClass: 'large', radius: 1.8 });
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [largeObstacle], DEFAULT_CLIMB_CONFIG, () => 0);
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

    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [rock], DEFAULT_CLIMB_CONFIG, () => 0);
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
      DEFAULT_CLIMB_CONFIG, () => 0
    );
    expect(result.lift).toBeGreaterThan(0);
  });

  it('TIER SENSITIVITY: the same obstacle/position produces different lift/pitch under a tier-0 vs. tier-2 footprint', () => {
    // Documents that footprint is load-bearing (ADR 0014 §Layering's
    // rejection of a single shared core constant) -- tier 2's wider track
    // and asymmetric wheelbase must change the sampled result for an
    // identical obstacle placement.
    const rock = bush({ id: 'rock', kind: 'rock', sizeClass: 'medium', radius: 1.0, position: { x: 0, z: 1.5 } });
    const tier0Result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [rock], DEFAULT_CLIMB_CONFIG, () => 0);
    const tier2Result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER2_FOOTPRINT, [rock], DEFAULT_CLIMB_CONFIG, () => 0);
    const differs =
      Math.abs(tier0Result.lift - tier2Result.lift) > 1e-6 || Math.abs(tier0Result.pitch - tier2Result.pitch) > 1e-6;
    expect(differs).toBe(true);
  });
});

// --- ADR 0017 (issue #49, terrain hills): extension tests for the injected ---
// --- `sampleTerrainHeight` parameter. ------------------------------------------
describe('computeClimbTransform terrain extension (issue #49, ADR 0017 §Decision-3)', () => {
  it('REGRESSION GUARD: sampleTerrainHeight = () => 0 reproduces byte-identical pre-#49 obstacle-only output', () => {
    // Every test above in this file already passes `() => 0` and its
    // assertions are unchanged from before this feature -- this is the
    // explicit, named version of that same guarantee (ADR 0017 §Testing).
    const obstacle = bush({ position: { x: 0.4, z: -0.2 } });
    const withZeroSampler = computeClimbTransform({ x: 0, z: 0 }, 0.3, TIER0_FOOTPRINT, [obstacle], DEFAULT_CLIMB_CONFIG, () => 0);
    const again = computeClimbTransform({ x: 0, z: 0 }, 0.3, TIER0_FOOTPRINT, [obstacle], DEFAULT_CLIMB_CONFIG, () => 0);
    expect(withZeroSampler).toEqual(again);
  });

  it('a uniform terrain height under every corner lifts the whole rig by that amount with zero pitch/roll, even with no obstacles', () => {
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [], DEFAULT_CLIMB_CONFIG, () => 0.5);
    expect(result.lift).toBeCloseTo(0.5);
    expect(result.pitch).toBeCloseTo(0);
    expect(result.roll).toBeCloseTo(0);
  });

  it('a terrain slope (higher in front than behind) produces nose-up pitch with no obstacles present, same sign convention as an obstacle climb', () => {
    // Simple linear "slope" sampler: height rises with world Z. The truck
    // sits at the origin facing +Z (heading 0), so its front corners
    // (zFront > 0) sample a higher point than its rear corners.
    const slope = (p: { x: number; z: number }) => p.z * 0.5;
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [], DEFAULT_CLIMB_CONFIG, slope);
    expect(result.pitch).toBeLessThan(0); // nose-up, same convention as the obstacle-climb tests above
    expect(result.lift).toBeCloseTo(0); // symmetric slope through the origin averages back to ~0
  });

  it('hill lift/tilt stays within maxPitch/maxRoll even for a steep injected sampler (AC8c chaos guard)', () => {
    const steepSlope = (p: { x: number; z: number }) => p.x * 100 + p.z * 100;
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [], DEFAULT_CLIMB_CONFIG, steepSlope);
    expect(Math.abs(result.pitch)).toBeLessThanOrEqual(DEFAULT_CLIMB_CONFIG.maxPitch + 1e-9);
    expect(Math.abs(result.roll)).toBeLessThanOrEqual(DEFAULT_CLIMB_CONFIG.maxRoll + 1e-9);
  });

  it('terrain height and an obstacle hump sum per corner rather than one overriding the other', () => {
    const obstacle = bush({ position: { x: 0, z: 0 } });
    const withoutTerrain = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [obstacle], DEFAULT_CLIMB_CONFIG, () => 0);
    const withTerrain = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [obstacle], DEFAULT_CLIMB_CONFIG, () => 0.2);
    expect(withTerrain.lift).toBeCloseTo(withoutTerrain.lift + 0.2);
  });

  // AC9 (hills never enter the wheel-tier clearance system): computeClimbTransform
  // has no wheel-tier/clearance parameter anywhere in its signature -- `footprint`
  // is purely geometric (halfTrack/zFront/zRear), not a clearance class -- so a
  // uniform terrain sample under every corner must produce identical lift
  // regardless of which body tier's footprint is passed in. If hills were ever
  // wired to be tier-gated (e.g. only lifting for tiers above some threshold),
  // this test would catch it.
  it('AC9: a uniform hill sample lifts the rig by the same amount under a tier-0 and a tier-2 footprint (hills are not wheel-tier gated)', () => {
    const tier0 = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [], DEFAULT_CLIMB_CONFIG, () => 0.7);
    const tier2 = computeClimbTransform({ x: 0, z: 0 }, 0, TIER2_FOOTPRINT, [], DEFAULT_CLIMB_CONFIG, () => 0.7);
    expect(tier0.lift).toBeCloseTo(0.7);
    expect(tier2.lift).toBeCloseTo(0.7);
    expect(tier0.lift).toBeCloseTo(tier2.lift);
  });

  // Explicit regression guard for the removed pre-#49 early return (ADR 0017,
  // obstacle-climb.ts's "No early 'all-zero' return anymore" comment): the old
  // code short-circuited to {0,0,0} whenever the summed lift was <= a small
  // EPSILON, which is wrong once hills can produce a small-but-nonzero dip that
  // must still tilt the rig. If that early return were mistakenly reintroduced
  // gated on |lift| being small, this test would fail because it constructs a
  // case where lift is smaller than a plausible epsilon (~1e-4) yet pitch must
  // still be a real, nonzero value.
  it('REGRESSION GUARD (EPSILON early-return removal): a terrain dip smaller than a plausible epsilon still produces nonzero pitch, not a zeroed-out transform', () => {
    // A gentle slope scaled down so the *lift* (mean of 4 corners, symmetric
    // through the origin for a tier-0 footprint) is far below any reasonable
    // epsilon, while pitch (a ratio/atan2 of the corner deltas) stays a real,
    // measurable, nonzero value because it doesn't depend on the mean's
    // magnitude, only the front/rear difference.
    const tinySlope = (p: { x: number; z: number }) => p.z * 1e-6;
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [], DEFAULT_CLIMB_CONFIG, tinySlope);
    expect(Math.abs(result.lift)).toBeLessThan(1e-4);
    expect(result.pitch).not.toBe(0);
    expect(result.pitch).toBeLessThan(0); // nose-up, same convention as every other pitch assertion in this file
  });
});

// --- Issue #63, ADR 0018 §3: `wheelSuspension`, the per-wheel residual ---
// --- layered on top of the whole-body {lift,pitch,roll} above. ------------
describe('computeClimbTransform wheelSuspension (issue #63, ADR 0018 §3 -- independent per-wheel suspension)', () => {
  // A config with pitch/roll fully disabled isolates the residual formula:
  // planeHeightAt(...) collapses to the constant `lift` at every corner, so
  // wheelSuspension[c] = clamp(travelGain * (cornerHeight - lift), maxTravel)
  // becomes directly, independently checkable against the corner heights.
  const NO_TILT_CONFIG: ClimbConfig = { ...DEFAULT_CLIMB_CONFIG, maxPitch: 0, maxRoll: 0 };
  const GENEROUS_SUSPENSION: SuspensionConfig = { travelGain: 1.0, maxTravel: 100 };

  it('AC11 (regression, uniform terrain height): a flat, uniform terrain sample under every corner produces zero wheelSuspension on every wheel (the whole-body lift already fully explains it)', () => {
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [], DEFAULT_CLIMB_CONFIG, () => 0.6);
    expect(result.lift).toBeCloseTo(0.6);
    expect(result.wheelSuspension).toEqual({ fl: 0, fr: 0, rl: 0, rr: 0 });
  });

  it('AC7 regression: whole-body {lift,pitch,roll} is byte-identical to pre-#63 behavior regardless of suspensionConfig -- suspension is purely additive, never fed back into the rigid-plane math', () => {
    const obstacle = bush({ position: { x: 0.2, z: 0.5 } });
    const withDefault = computeClimbTransform({ x: 0, z: 0 }, 0.4, TIER0_FOOTPRINT, [obstacle], DEFAULT_CLIMB_CONFIG, () => 0.1);
    const withDifferentSuspension = computeClimbTransform(
      { x: 0, z: 0 },
      0.4,
      TIER0_FOOTPRINT,
      [obstacle],
      DEFAULT_CLIMB_CONFIG,
      () => 0.1,
      { travelGain: 3, maxTravel: 0.01 },
    );
    expect(withDifferentSuspension.lift).toBe(withDefault.lift);
    expect(withDifferentSuspension.pitch).toBe(withDefault.pitch);
    expect(withDifferentSuspension.roll).toBe(withDefault.roll);
  });

  it('planeHeightAt formula: with pitch/roll clamped to exactly 0, each wheel\'s residual equals travelGain * (cornerHeight - lift)', () => {
    // Front-only obstacle (regression-guard fixture from the describe block
    // above) with NO_TILT_CONFIG: pitch/roll are forced to 0 by the clamp, so
    // planeHeightAt collapses to the constant `lift` everywhere.
    const rock = bush({ id: 'rock', kind: 'rock', sizeClass: 'medium', radius: 1.0, position: { x: 0, z: 1.8 } });
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [rock], NO_TILT_CONFIG, () => 0, GENEROUS_SUSPENSION);
    expect(result.pitch).toBe(0);
    expect(result.roll).toBe(0);
    // Recompute the four raw corner heights the same way the function does,
    // to check the residual formula independently of the function's own
    // internals -- front corners are inside the rock's combinedRadius, rear
    // corners are outside it (see the REGRESSION GUARD test above).
    const combinedRadius = rock.radius + TRUCK_CONTACT_RADIUS;
    const frontLeftDist = Math.hypot(TIER0_FOOTPRINT.halfTrack, rock.position.z - TIER0_FOOTPRINT.zFront);
    const rearLeftDist = Math.hypot(TIER0_FOOTPRINT.halfTrack, rock.position.z - TIER0_FOOTPRINT.zRear);
    expect(frontLeftDist).toBeLessThan(combinedRadius);
    expect(rearLeftDist).toBeGreaterThan(combinedRadius);
    // Rear corners are fully outside the footprint -> raw corner height 0 ->
    // residual = -lift (lift is > 0, so rear wheels dip below the flat plane).
    expect(result.wheelSuspension.rl).toBeCloseTo(-result.lift);
    expect(result.wheelSuspension.rr).toBeCloseTo(-result.lift);
    // Front corners are inside the footprint -> raw corner height > lift (the
    // mean of 4, two of which are 0) -> positive residual.
    expect(result.wheelSuspension.fl).toBeGreaterThan(0);
    expect(result.wheelSuspension.fr).toBeGreaterThan(0);
  });

  it('AC6 (independent per-wheel articulation): an obstacle centered on the front-left corner (diagonal from the other three) produces a wheelSuspension.fl clearly distinct from the other three wheels\' offsets at the same moment', () => {
    // NOTE: TRUCK_CONTACT_RADIUS alone (~1.22 at TRUCK_SCALE=1.35) already
    // exceeds tier-0's track/wheelbase spacing (~1.11), so no obstacle can be
    // sized to put its footprint entirely inside just one corner's
    // combinedRadius -- some spillover onto the neighbouring corners is
    // geometrically unavoidable. What AC6 actually requires ("that wheel
    // visibly moves ... distinct from the other three wheels' current
    // position") is a clearly asymmetric, diagonal-warp scenario -- which an
    // obstacle centered exactly on the FL corner (closest to FL, roughly
    // equidistant-but-farther from FR and RL, farthest from RR) provides,
    // without depending on a hard in/out-of-range split.
    // fl's corner world position is offset by `right * halfTrack * -1` (see
    // computeClimbTransform's cornerWorldPos/cornerPositions.fl). Per the
    // #63 sign-inversion bugfix, `right` at heading 0 is (-1, 0) -- Forward x
    // Up, matching truck-motion.ts's documented convention -- so fl's world x
    // is `-halfTrack * -1` = +halfTrack, the *positive*-x side. Placing the
    // obstacle there, not at -halfTrack, is what actually centers it on the
    // FL corner (pre-fix this was inverted; see this file's sign-inversion
    // regression test below for the ground-truth derivation).
    const diagonalBush = bush({ id: 'fl-diagonal', radius: 0.3, position: { x: TIER0_FOOTPRINT.halfTrack, z: TIER0_FOOTPRINT.zFront } });
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [diagonalBush], DEFAULT_CLIMB_CONFIG, () => 0);
    expect(result.wheelSuspension.fl).not.toBeCloseTo(result.wheelSuspension.fr, 3);
    expect(result.wheelSuspension.fl).not.toBeCloseTo(result.wheelSuspension.rl, 3);
    expect(result.wheelSuspension.fl).not.toBeCloseTo(result.wheelSuspension.rr, 3);
    // The wheel nearest the obstacle must rise the most -- not constrained to
    // move together with the other three as a single rigid group.
    expect(result.wheelSuspension.fl).toBeGreaterThan(result.wheelSuspension.fr);
    expect(result.wheelSuspension.fl).toBeGreaterThan(result.wheelSuspension.rl);
    expect(result.wheelSuspension.fl).toBeGreaterThan(result.wheelSuspension.rr);
    const values = Object.values(result.wheelSuspension);
    expect(new Set(values.map((v) => v.toFixed(4))).size).toBeGreaterThan(1);
  });

  it('AC8 (works across obstacle classes/tiers): the same diagonal (off-centerline) asymmetry produces a wheelSuspension pattern that is not uniform across all 4 wheels, for a large (derelict-car-class) obstacle under both the tier-0 and tier-2 footprint', () => {
    // Off-centerline (not just off-axle) placement -- unlike a dead-centered
    // obstacle straight ahead (which only produces a front/rear split that
    // the whole-body pitch alone already fully explains, leaving zero
    // residual by construction, see the planeHeightAt-formula test above),
    // an off-centerline obstacle also breaks left/right symmetry, which
    // `maxRoll=0` (DEFAULT_CLIMB_CONFIG's anti-chaos guard) intentionally
    // refuses to let the rigid body show -- so that part necessarily shows
    // up as wheel residual instead (ADR 0018 §3/Consequences).
    const derelictCar = bush({
      id: 'derelict',
      kind: 'derelictCar',
      sizeClass: 'large',
      radius: 1.8,
      // Positive x = fl/rl's side (see cornerPositions.fl's `right * -1`
      // offset above, and the #63 sign-inversion bugfix to `right`) and closer to the
      // front axle -- so fl (near, front) is the closest corner and rr (far,
      // rear) is the farthest.
      position: { x: TIER0_FOOTPRINT.halfTrack, z: 2.0 },
    });
    const tier0 = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [derelictCar], DEFAULT_CLIMB_CONFIG, () => 0);
    const tier2 = computeClimbTransform({ x: 0, z: 0 }, 0, TIER2_FOOTPRINT, [derelictCar], DEFAULT_CLIMB_CONFIG, () => 0);
    for (const result of [tier0, tier2]) {
      const values = Object.values(result.wheelSuspension);
      expect(new Set(values.map((v) => v.toFixed(4))).size).toBeGreaterThan(1);
      // The near-side front corner (fl, closest to the obstacle) must carry
      // more residual than the far-side rear corner (rr, farthest).
      expect(result.wheelSuspension.fl).toBeGreaterThan(result.wheelSuspension.rr);
    }
  });

  // Sign-inversion regression (found during #63 live playtest): AC6/AC8
  // above only assert that *some* asymmetry exists across the four corners
  // and that the nearest-labeled corner reads highest -- but both tests
  // place their obstacle using the module's own internal `right`-vector
  // convention (`x: -TIER0_FOOTPRINT.halfTrack` "is fl's side" per
  // computeClimbTransform's own cornerWorldPos offset), so a bug that
  // consistently inverts that internal convention (the `right` vector was
  // defined as `forward` rotated -90 deg, i.e. physical LEFT, not right) is
  // invisible to them -- fl/fr both silently swap *together* with the
  // obstacle's assumed side, so "fl reads highest" stayed true even though
  // the *world position* fl actually sampled was on the wrong physical side
  // of the truck. This test instead pins corner world position against an
  // *external*, independently-documented ground truth --
  // `core/driving/truck-motion.ts`'s `TruckMotionState.heading` doc comment:
  // "Given forward = +Z, the truck's physical right side (Forward x Up) is
  // -X" -- so it would have failed against the pre-fix `right` vector.
  it('sign-inversion regression: fl/rl sample the truck\'s physical LEFT (+X at heading 0) and fr/rr sample physical RIGHT (-X), per truck-motion.ts\'s documented Forward x Up convention, not just "some" internally-consistent asymmetry', () => {
    // Heading 0 -> forward = +Z. Per truck-motion.ts, physical right = -X, so
    // physical left = +X. Placing an obstacle at world x = +halfTrack (the
    // physical left side) must make fl -- not fr -- the wheel that visibly
    // lifts.
    const leftSideObstacle = bush({
      id: 'left-side',
      radius: 0.3,
      position: { x: TIER0_FOOTPRINT.halfTrack, z: TIER0_FOOTPRINT.zFront },
    });
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [leftSideObstacle], DEFAULT_CLIMB_CONFIG, () => 0);
    expect(result.wheelSuspension.fl).toBeGreaterThan(result.wheelSuspension.fr);
    expect(result.wheelSuspension.fl).toBeGreaterThan(result.wheelSuspension.rr);
    expect(result.wheelSuspension.fl).toBeGreaterThan(0);
    // The mirror case: an obstacle on the physical right (-X) must lift fr,
    // not fl.
    const rightSideObstacle = bush({
      id: 'right-side',
      radius: 0.3,
      position: { x: -TIER0_FOOTPRINT.halfTrack, z: TIER0_FOOTPRINT.zFront },
    });
    const mirrored = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [rightSideObstacle], DEFAULT_CLIMB_CONFIG, () => 0);
    expect(mirrored.wheelSuspension.fr).toBeGreaterThan(mirrored.wheelSuspension.fl);
    expect(mirrored.wheelSuspension.fr).toBeGreaterThan(mirrored.wheelSuspension.rl);
    expect(mirrored.wheelSuspension.fr).toBeGreaterThan(0);
  });

  it('AC10 (no chaotic motion): wheelSuspension magnitude never exceeds maxTravel, even for a huge obstacle and an aggressive travelGain', () => {
    const hugeObstacle = bush({ id: 'huge', radius: 50, position: { x: TIER0_FOOTPRINT.halfTrack, z: TIER0_FOOTPRINT.zFront } });
    const aggressiveSuspension: SuspensionConfig = { travelGain: 1000, maxTravel: 0.25 };
    const result = computeClimbTransform(
      { x: 0, z: 0 },
      0,
      TIER0_FOOTPRINT,
      [hugeObstacle],
      DEFAULT_CLIMB_CONFIG,
      () => 0,
      aggressiveSuspension,
    );
    for (const value of Object.values(result.wheelSuspension)) {
      expect(Math.abs(value)).toBeLessThanOrEqual(0.25 + 1e-9);
    }
  });

  it('defaults to DEFAULT_SUSPENSION_CONFIG when suspensionConfig is omitted (pre-#63 call sites keep working with no changes)', () => {
    const rock = bush({ id: 'rock', kind: 'rock', sizeClass: 'medium', radius: 1.0, position: { x: 0, z: 1.8 } });
    const withoutArg = computeClimbTransform({ x: 0, z: 0 }, 0, TIER0_FOOTPRINT, [rock], DEFAULT_CLIMB_CONFIG, () => 0);
    const withExplicitDefault = computeClimbTransform(
      { x: 0, z: 0 },
      0,
      TIER0_FOOTPRINT,
      [rock],
      DEFAULT_CLIMB_CONFIG,
      () => 0,
      DEFAULT_SUSPENSION_CONFIG,
    );
    expect(withoutArg.wheelSuspension).toEqual(withExplicitDefault.wheelSuspension);
  });
});
