import { describe, expect, it } from 'vitest';
import { integrateTruckMotion, type TruckMotionState } from './truck-motion';
import { DEFAULT_DRIVING_CONFIG } from './config';
import type { DriveIntent } from '../types';

const TOP_SPEED = 10;
const DT = 1; // 1s steps make the constants in DEFAULT_DRIVING_CONFIG easy to reason about.

const idleIntent: DriveIntent = { throttle: 0, steer: 0 };
const restState: TruckMotionState = { heading: 0, speed: 0 };

describe('integrateTruckMotion — throttle (drive AC1-AC2)', () => {
  it('accelerates forward when throttle is positive', () => {
    const result = integrateTruckMotion(restState, { throttle: 1, steer: 0 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, DT);
    expect(result.state.speed).toBeCloseTo(DEFAULT_DRIVING_CONFIG.acceleration * DT);
  });

  it('caps forward speed at the truck top speed (engine tier cap, AC2)', () => {
    const fastState: TruckMotionState = { heading: 0, speed: TOP_SPEED - 0.5 };
    const result = integrateTruckMotion(fastState, { throttle: 1, steer: 0 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, DT);
    expect(result.state.speed).toBe(TOP_SPEED);
  });

  it('brakes (decelerates faster than coasting) when throttle is negative while moving forward', () => {
    const movingState: TruckMotionState = { heading: 0, speed: 5 };
    const result = integrateTruckMotion(movingState, { throttle: -1, steer: 0 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, DT);
    expect(result.state.speed).toBeCloseTo(5 - DEFAULT_DRIVING_CONFIG.braking * DT);
  });

  it('reverses (accelerates backward) when throttle is negative from a stop — brake/reverse on one key (AC1)', () => {
    // Use a short dt so the reverse top-speed clamp doesn't mask the underlying acceleration.
    const shortDt = 0.1;
    const result = integrateTruckMotion(restState, { throttle: -1, steer: 0 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, shortDt);
    expect(result.state.speed).toBeCloseTo(-DEFAULT_DRIVING_CONFIG.acceleration * shortDt);
  });

  it('caps reverse speed at reverseSpeedFactor * topSpeed', () => {
    const reversingState: TruckMotionState = { heading: 0, speed: -TOP_SPEED * DEFAULT_DRIVING_CONFIG.reverseSpeedFactor + 0.5 };
    const result = integrateTruckMotion(reversingState, { throttle: -1, steer: 0 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, DT);
    expect(result.state.speed).toBe(-TOP_SPEED * DEFAULT_DRIVING_CONFIG.reverseSpeedFactor);
  });

  it('coasts to a stop (friction) when no throttle is held while moving forward', () => {
    const movingState: TruckMotionState = { heading: 0, speed: 2 };
    const result = integrateTruckMotion(movingState, idleIntent, TOP_SPEED, DEFAULT_DRIVING_CONFIG, DT);
    expect(result.state.speed).toBeCloseTo(Math.max(0, 2 - DEFAULT_DRIVING_CONFIG.friction * DT));
  });

  it('coasting never overshoots past zero to reverse on its own', () => {
    const barelyMovingState: TruckMotionState = { heading: 0, speed: 0.1 };
    const result = integrateTruckMotion(barelyMovingState, idleIntent, TOP_SPEED, DEFAULT_DRIVING_CONFIG, DT);
    expect(result.state.speed).toBe(0);
  });

  it('coasts back up toward zero when reversing with no throttle', () => {
    const reversingState: TruckMotionState = { heading: 0, speed: -2 };
    const result = integrateTruckMotion(reversingState, idleIntent, TOP_SPEED, DEFAULT_DRIVING_CONFIG, DT);
    expect(result.state.speed).toBeCloseTo(Math.min(0, -2 + DEFAULT_DRIVING_CONFIG.friction * DT));
  });
});

describe('integrateTruckMotion — steering (drive AC1-AC3)', () => {
  it('turns heading when steer is applied while moving', () => {
    // Use a short dt: with idle throttle, friction would otherwise coast speed
    // to 0 within a full 1s step, which correctly (per code) disables steering.
    // steer=1 is the right-key intent, which *decreases* heading (see
    // TruckMotionState.heading doc comment: forward=+Z means the truck's
    // physical right side is -X, so turning right must swing heading negative).
    const shortDt = 0.1;
    const movingState: TruckMotionState = { heading: 0, speed: 3 };
    const result = integrateTruckMotion(movingState, { throttle: 0, steer: 1 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, shortDt);
    expect(result.state.heading).toBeCloseTo(-DEFAULT_DRIVING_CONFIG.turnRate * shortDt);
  });

  it('steer=-1 turns the opposite direction from steer=1', () => {
    const shortDt = 0.1;
    const movingState: TruckMotionState = { heading: 0, speed: 3 };
    const right = integrateTruckMotion(movingState, { throttle: 0, steer: 1 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, shortDt);
    const left = integrateTruckMotion(movingState, { throttle: 0, steer: -1 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, shortDt);
    expect(left.state.heading).toBeCloseTo(-right.state.heading);
  });

  it('steering has no effect while stationary (cannot spin in place)', () => {
    const result = integrateTruckMotion(restState, { throttle: 0, steer: 1 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, DT);
    expect(result.state.heading).toBe(0);
  });

  // Regression test for the inverted-steering bug (Up+Left turned the truck
  // right instead of left): the heading tests above only check internal
  // consistency between steer=1 and steer=-1, which does NOT catch a
  // globally-flipped sign — both directions would still be "opposite" of
  // each other even if both were backwards. These tests instead pin steer
  // direction to the truck's *physical* left/right using the same
  // displacement math the renderer/physics actually consume
  // (displacement = (sin(heading), cos(heading)), forward = +Z at heading 0,
  // so the truck's physical right is -X per Forward x Up).
  describe('steer direction matches the truck\'s physical left/right (not just internal symmetry)', () => {
    const shortDt = 0.1;
    const movingState: TruckMotionState = { heading: 0, speed: 3 };

    it('steer=1 (right key) curves the truck toward its physical right (-X)', () => {
      const result = integrateTruckMotion(movingState, { throttle: 0, steer: 1 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, shortDt);
      expect(result.displacement.x).toBeLessThan(0);
    });

    it('steer=-1 (left key) curves the truck toward its physical left (+X)', () => {
      const result = integrateTruckMotion(movingState, { throttle: 0, steer: -1 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, shortDt);
      expect(result.displacement.x).toBeGreaterThan(0);
    });
  });

  // Regression test for issue #68 (steering inverted while reversing): the
  // chase camera (render/scene.ts) always sits behind and looks along the
  // nose (`heading`), regardless of travel direction. While reversing, the
  // truck's tail is the end actually leading the motion and visible to the
  // player, and the tail of a rotating rigid body always swings opposite the
  // nose — so applying the same steer-to-heading sign in reverse as forward
  // makes the visible/leading end curve the *wrong* way on screen. Per this
  // project's QA convention (CLAUDE.md), pin this against an externally
  // meaningful expectation, not just internal self-consistency with the
  // module's own heading sign.
  //
  // cameraBehindX below is a literal, traceable copy of render/scene.ts's
  // "Simple chase camera" block (the `behind` vector, ~line 892):
  //   const behind = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading))
  //     .multiplyScalar(CAMERA_CHASE_DISTANCE);
  // `core/` deliberately has no dependency on `three`/`render/` (ADR 0001),
  // so this can't be a real import — it's a pinned copy of scene.ts's actual
  // formula, cross-referenced by file/line so it doesn't silently drift.
  // Camera position = truck position + behind, i.e. the camera always sits
  // on the truck's tail side and looks back at the nose; behind's sign is
  // therefore what actually determines, on screen, which world side the
  // camera (and thus the visible truck) leans toward for a given heading.
  // Using this instead of re-deriving "tail = -nose" from `heading` itself
  // means this test would have a chance of catching scene.ts's camera
  // formula changing (e.g. no longer tracking nose direction) — the thing
  // the #68 fix's rationale actually depends on — whereas re-deriving from
  // heading alone only re-checks this module's own internal sign choice.
  function cameraBehindX(heading: number): number {
    return -Math.sin(heading);
  }

  describe('steering direction while reversing (issue #68)', () => {
    const shortDt = 0.1;

    it('reversing + steer=1 (right key) swings the truck\'s visible/leading tail toward physical right (-X), same screen side as forward + steer=1', () => {
      const reversingState: TruckMotionState = { heading: 0, speed: -3 };
      const result = integrateTruckMotion(reversingState, { throttle: 0, steer: 1 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, shortDt);
      expect(cameraBehindX(result.state.heading)).toBeLessThan(0);
    });

    it('reversing + steer=-1 (left key) swings the truck\'s visible/leading tail toward physical left (+X)', () => {
      const reversingState: TruckMotionState = { heading: 0, speed: -3 };
      const result = integrateTruckMotion(reversingState, { throttle: 0, steer: -1 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, shortDt);
      expect(cameraBehindX(result.state.heading)).toBeGreaterThan(0);
    });

    it('a given steer produces the opposite heading delta in reverse vs. forward (the fix)', () => {
      const forwardState: TruckMotionState = { heading: 0, speed: 3 };
      const reversingState: TruckMotionState = { heading: 0, speed: -3 };
      const forward = integrateTruckMotion(forwardState, { throttle: 0, steer: 1 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, shortDt);
      const reverse = integrateTruckMotion(reversingState, { throttle: 0, steer: 1 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, shortDt);
      expect(reverse.state.heading).toBeCloseTo(-forward.state.heading);
    });

    it('forward steering behavior is unchanged by the fix (speed > 0 still uses the original sign)', () => {
      const movingState: TruckMotionState = { heading: 0, speed: 3 };
      const result = integrateTruckMotion(movingState, { throttle: 0, steer: 1 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, shortDt);
      expect(result.state.heading).toBeCloseTo(-DEFAULT_DRIVING_CONFIG.turnRate * shortDt);
    });
  });
});

describe('integrateTruckMotion — displacement', () => {
  it('produces zero displacement when stationary', () => {
    const result = integrateTruckMotion(restState, idleIntent, TOP_SPEED, DEFAULT_DRIVING_CONFIG, DT);
    expect(result.displacement.x).toBeCloseTo(0);
    expect(result.displacement.z).toBeCloseTo(0);
  });

  it('moves forward along +Z when heading is 0 and speed is positive', () => {
    const movingState: TruckMotionState = { heading: 0, speed: 4 };
    const result = integrateTruckMotion(movingState, idleIntent, TOP_SPEED, DEFAULT_DRIVING_CONFIG, DT);
    // Coasting for 1s at friction=4 leaves speed at 0, so use a smaller dt to observe non-zero displacement.
    const shortDtResult = integrateTruckMotion(movingState, idleIntent, TOP_SPEED, DEFAULT_DRIVING_CONFIG, 0.01);
    expect(shortDtResult.displacement.z).toBeGreaterThan(0);
    expect(shortDtResult.displacement.x).toBeCloseTo(0);
    expect(result).toBeDefined();
  });

  it('scales displacement with heading via sin/cos (turned 90 degrees moves along X)', () => {
    const movingState: TruckMotionState = { heading: Math.PI / 2, speed: 4 };
    const result = integrateTruckMotion(movingState, idleIntent, TOP_SPEED, DEFAULT_DRIVING_CONFIG, 0.01);
    expect(result.displacement.x).toBeGreaterThan(0);
    expect(result.displacement.z).toBeCloseTo(0, 5);
  });
});

// Terrain movement-isolation guard (issue #49, ADR 0017 §Testing, AC8): the
// simplest possible proof that hills never touch the truck's real
// position/velocity math is structural -- `integrateTruckMotion`'s signature
// (state, intent, topSpeed, config, dt) has no terrain parameter at all,
// nothing here imports core/terrain-height.ts, and it has no Y axis anywhere.
// This test makes that literal, per the ADR's "simulated position/velocity
// are identical whether or not hill data is present" phrasing: it drives a
// batch of pseudo-random input sequences through two independently-run
// trajectories -- there is no way to even *offer* one of them "hill data" to
// this function, so identical output is trivially guaranteed, and this test
// exists so a future dev cannot silently add a terrain parameter here
// without this test either catching the signature change or needing to be
// deliberately updated (a tripwire, not just documentation).
describe('terrain movement isolation (issue #49, ADR 0017 AC8)', () => {
  it('a batch of random input sequences produces byte-identical trajectories across two independent integration runs', () => {
    function pseudoRandom(seed: number): () => number {
      let state = seed;
      return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
      };
    }

    function runTrajectory(seed: number): TruckMotionState[] {
      const rng = pseudoRandom(seed);
      let state: TruckMotionState = { heading: 0, speed: 0 };
      const history: TruckMotionState[] = [];
      for (let step = 0; step < 200; step++) {
        const intent: DriveIntent = { throttle: rng() * 2 - 1, steer: rng() * 2 - 1 };
        const result = integrateTruckMotion(state, intent, TOP_SPEED, DEFAULT_DRIVING_CONFIG, 0.05);
        state = result.state;
        history.push(state);
      }
      return history;
    }

    const runA = runTrajectory(42);
    const runB = runTrajectory(42);
    expect(runA).toEqual(runB);
  });
});
