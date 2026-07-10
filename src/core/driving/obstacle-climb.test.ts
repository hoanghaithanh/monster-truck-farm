import { describe, expect, it } from 'vitest';
import { computeClimbTransform } from './obstacle-climb';
import { DEFAULT_CLIMB_CONFIG, TRUCK_CONTACT_RADIUS, type ClimbConfig } from './config';
import type { ObstacleInstance } from '../types';

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

describe('computeClimbTransform (obstacle climb, ADR 0013 / issue #42)', () => {
  it('returns exactly {0,0,0} for an empty obstacle list', () => {
    const result = computeClimbTransform({ x: 5, z: 5 }, 0, [], DEFAULT_CLIMB_CONFIG);
    expect(result).toEqual({ lift: 0, pitch: 0, roll: 0 });
  });

  it('produces zero lift when the truck is outside every footprint', () => {
    const obstacle = bush();
    const combinedRadius = obstacle.radius + TRUCK_CONTACT_RADIUS;
    const result = computeClimbTransform({ x: combinedRadius + 1, z: 0 }, 0, [obstacle], DEFAULT_CLIMB_CONFIG);
    expect(result.lift).toBe(0);
    expect(result.pitch).toBe(0);
    expect(result.roll).toBe(0);
  });

  it('lift rises monotonically as the truck approaches the obstacle center', () => {
    const obstacle = bush();
    const combinedRadius = obstacle.radius + TRUCK_CONTACT_RADIUS;
    const distances = [combinedRadius * 0.9, combinedRadius * 0.6, combinedRadius * 0.3, 0];
    const lifts = distances.map(
      (d) => computeClimbTransform({ x: d, z: 0 }, 0, [obstacle], DEFAULT_CLIMB_CONFIG).lift,
    );
    for (let i = 1; i < lifts.length; i++) {
      expect(lifts[i]).toBeGreaterThan(lifts[i - 1]);
    }
  });

  it('lift is exactly 0 at the footprint edge and at its peak at the center', () => {
    const obstacle = bush();
    const combinedRadius = obstacle.radius + TRUCK_CONTACT_RADIUS;
    const edge = computeClimbTransform({ x: combinedRadius, z: 0 }, 0, [obstacle], DEFAULT_CLIMB_CONFIG);
    const center = computeClimbTransform({ x: 0, z: 0 }, 0, [obstacle], DEFAULT_CLIMB_CONFIG);
    expect(edge.lift).toBeCloseTo(0);
    const expectedPeak = Math.min(DEFAULT_CLIMB_CONFIG.maxLift, DEFAULT_CLIMB_CONFIG.liftScale * obstacle.radius);
    expect(center.lift).toBeCloseTo(expectedPeak);
  });

  it('peak lift scales with obstacle radius (bigger obstacle -> bigger bump)', () => {
    const smallObstacle = bush({ id: 'small', radius: 0.6 });
    const bigObstacle = bush({ id: 'big', radius: 1.8 });
    const smallPeak = computeClimbTransform({ x: 0, z: 0 }, 0, [smallObstacle], DEFAULT_CLIMB_CONFIG).lift;
    const bigPeak = computeClimbTransform({ x: 0, z: 0 }, 0, [bigObstacle], DEFAULT_CLIMB_CONFIG).lift;
    expect(bigPeak).toBeGreaterThan(smallPeak);
  });

  it('caps peak lift at config.maxLift regardless of how large the obstacle radius is', () => {
    const hugeObstacle = bush({ radius: 100 });
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, [hugeObstacle], DEFAULT_CLIMB_CONFIG);
    expect(result.lift).toBeCloseTo(DEFAULT_CLIMB_CONFIG.maxLift);
  });

  it('uses max (not sum) across two overlapping footprints', () => {
    const a = bush({ id: 'a', position: { x: -0.3, z: 0 }, radius: 0.6 });
    const b = bush({ id: 'b', position: { x: 0.3, z: 0 }, radius: 1.0 });
    const combined = computeClimbTransform({ x: 0, z: 0 }, 0, [a, b], DEFAULT_CLIMB_CONFIG);
    const aOnly = computeClimbTransform({ x: 0, z: 0 }, 0, [a], DEFAULT_CLIMB_CONFIG);
    const bOnly = computeClimbTransform({ x: 0, z: 0 }, 0, [b], DEFAULT_CLIMB_CONFIG);
    expect(combined.lift).toBeCloseTo(Math.max(aOnly.lift, bOnly.lift));
    // Explicitly rule out summing: sum would be strictly greater than the max here.
    expect(combined.lift).toBeLessThan(aOnly.lift + bOnly.lift);
  });

  it('pitches the nose up while approaching (before the center) and down while leaving (past the center)', () => {
    // Sign convention (matches render/scene.ts's group.rotation.set(pitch, heading, roll, 'YXZ')
    // applied verbatim, no negation): with forward = +Z at heading 0, Three.js
    // rotates a positive rotation.x so the +Z direction dips toward -Y --
    // i.e. positive climb.pitch reads as nose-DOWN, negative as nose-UP.
    const obstacle = bush();
    const combinedRadius = obstacle.radius + TRUCK_CONTACT_RADIUS;
    // Heading 0 => forward = +Z. Approaching along +Z means truck z < 0 (obstacle ahead).
    const approaching = computeClimbTransform({ x: 0, z: -combinedRadius * 0.5 }, 0, [obstacle], DEFAULT_CLIMB_CONFIG);
    const leaving = computeClimbTransform({ x: 0, z: combinedRadius * 0.5 }, 0, [obstacle], DEFAULT_CLIMB_CONFIG);
    expect(approaching.pitch).toBeLessThan(0);
    expect(leaving.pitch).toBeGreaterThan(0);
    // Symmetric approach/leave points produce equal-and-opposite pitch.
    expect(approaching.pitch).toBeCloseTo(-leaving.pitch);
  });

  it('pitch is ~0 at the exact crest (truck center over obstacle center)', () => {
    const obstacle = bush();
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, [obstacle], DEFAULT_CLIMB_CONFIG);
    expect(result.pitch).toBeCloseTo(0);
  });

  it('clamps pitch to maxPitch even with an aggressive tiltGain', () => {
    const obstacle = bush();
    const combinedRadius = obstacle.radius + TRUCK_CONTACT_RADIUS;
    const aggressiveConfig: ClimbConfig = { ...DEFAULT_CLIMB_CONFIG, tiltGain: 1000, maxPitch: 0.2 };
    const result = computeClimbTransform({ x: 0, z: -combinedRadius * 0.5 }, 0, [obstacle], aggressiveConfig);
    expect(Math.abs(result.pitch)).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it('roll defaults to 0 with DEFAULT_CLIMB_CONFIG (maxRoll caution, AC3)', () => {
    const obstacle = bush();
    const combinedRadius = obstacle.radius + TRUCK_CONTACT_RADIUS;
    const result = computeClimbTransform({ x: combinedRadius * 0.3, z: 0 }, 0, [obstacle], DEFAULT_CLIMB_CONFIG);
    expect(result.roll).toBe(0);
  });

  it('a passable-only obstacle list needs no special-casing for a blocking-class obstacle -- the function only ever reads position/radius from whatever it is handed', () => {
    // Confirms computeClimbTransform has no notion of blocking vs. passable at
    // all: partitioning happens upstream (core/clearance.ts). Passing any
    // ObstacleInstance (regardless of sizeClass) produces the same lift/tilt
    // math -- the caller is responsible for only ever passing the `passable`
    // partition (AC6 lives in main.ts's wiring, not in this pure module).
    const largeObstacle = bush({ sizeClass: 'large', radius: 1.8 });
    const result = computeClimbTransform({ x: 0, z: 0 }, 0, [largeObstacle], DEFAULT_CLIMB_CONFIG);
    expect(result.lift).toBeGreaterThan(0);
  });
});
