import { describe, expect, it } from 'vitest';
import { buildTruckRig } from './truck-rig';
import { carryOverWheelRotations } from './scene';
import type { TruckBuild, TruckCosmetics } from '../core/types';

// carryOverWheelRotations (issue #44) is exercised directly here rather than
// through `createGameScene`/`tickEffects`'s full rig-rebuild path: this
// project's test environment is plain Node (vitest.config.ts, no
// jsdom/canvas), and `createGameScene` constructs a real
// `THREE.WebGLRenderer`, which needs a browser canvas/WebGL context to
// initialize -- not available here. `carryOverWheelRotations` was pulled out
// of `tickEffects` specifically because it has no such dependency (see its
// own doc comment in scene.ts) and is the exact function `tickEffects` calls
// during the asset-upgrade in-place rig rebuild, so this test covers the
// real production code path, not a reimplementation of it.

const BUILD: TruckBuild = { body: 1, wheels: 1, engine: 0, gasTank: 0 };
const COSMETICS: TruckCosmetics = { wheelLook: 'standard' };

describe('carryOverWheelRotations (issue #44, wheel-roll continuity across the in-place rig rebuild)', () => {
  it('copies every wheel\'s roll.rotation.x and steer.rotation.y from the outgoing rig onto the rebuilt rig\'s matching pivot', () => {
    const outgoing = buildTruckRig(BUILD, COSMETICS); // primitive-fallback rig (no registry) -- simulates the pre-upgrade rig
    const rebuilt = buildTruckRig(BUILD, COSMETICS); // a fresh rig -- simulates the post-asset-load rebuild, pivots start at rotation 0

    outgoing.wheels.frontLeft.roll.rotation.x = 1.23;
    outgoing.wheels.frontLeft.steer.rotation.y = 0.4;
    outgoing.wheels.frontRight.roll.rotation.x = 2.5;
    outgoing.wheels.frontRight.steer.rotation.y = -0.4;
    outgoing.wheels.rearLeft.roll.rotation.x = -3.1;
    outgoing.wheels.rearRight.roll.rotation.x = 7.77;

    // Sanity check: the rebuilt rig actually starts at rotation 0, same as a
    // freshly-created rig would in production -- otherwise this test
    // wouldn't actually be exercising the "snap back" bug it guards against.
    expect(rebuilt.wheels.frontLeft.roll.rotation.x).toBe(0);

    carryOverWheelRotations(outgoing.wheels, rebuilt.wheels);

    expect(rebuilt.wheels.frontLeft.roll.rotation.x).toBeCloseTo(1.23);
    expect(rebuilt.wheels.frontLeft.steer.rotation.y).toBeCloseTo(0.4);
    expect(rebuilt.wheels.frontRight.roll.rotation.x).toBeCloseTo(2.5);
    expect(rebuilt.wheels.frontRight.steer.rotation.y).toBeCloseTo(-0.4);
    expect(rebuilt.wheels.rearLeft.roll.rotation.x).toBeCloseTo(-3.1);
    expect(rebuilt.wheels.rearRight.roll.rotation.x).toBeCloseTo(7.77);
  });

  it('never touches a pivot\'s position -- only rotation is carried over, so the wheel stays on its socket', () => {
    const outgoing = buildTruckRig(BUILD, COSMETICS);
    const rebuilt = buildTruckRig(BUILD, COSMETICS);
    const beforePositions = {
      frontLeft: rebuilt.wheels.frontLeft.steer.position.clone(),
      frontRight: rebuilt.wheels.frontRight.steer.position.clone(),
      rearLeft: rebuilt.wheels.rearLeft.steer.position.clone(),
      rearRight: rebuilt.wheels.rearRight.steer.position.clone(),
    };

    outgoing.wheels.frontLeft.roll.rotation.x = 5;
    outgoing.wheels.frontLeft.steer.rotation.y = 1;
    carryOverWheelRotations(outgoing.wheels, rebuilt.wheels);

    expect(rebuilt.wheels.frontLeft.steer.position.toArray()).toEqual(beforePositions.frontLeft.toArray());
    expect(rebuilt.wheels.frontRight.steer.position.toArray()).toEqual(beforePositions.frontRight.toArray());
    expect(rebuilt.wheels.rearLeft.steer.position.toArray()).toEqual(beforePositions.rearLeft.toArray());
    expect(rebuilt.wheels.rearRight.steer.position.toArray()).toEqual(beforePositions.rearRight.toArray());
  });
});
