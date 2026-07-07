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
    const shortDt = 0.1;
    const movingState: TruckMotionState = { heading: 0, speed: 3 };
    const result = integrateTruckMotion(movingState, { throttle: 0, steer: 1 }, TOP_SPEED, DEFAULT_DRIVING_CONFIG, shortDt);
    expect(result.state.heading).toBeCloseTo(DEFAULT_DRIVING_CONFIG.turnRate * shortDt);
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
