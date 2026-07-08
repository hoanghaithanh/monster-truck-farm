import { describe, expect, it } from 'vitest';
import { updateGas, effectiveTopSpeed, limpTopSpeed, type GasState } from './gas';
import { GAS_DRAIN_PER_SECOND, GAS_LIMP_FACTOR, GAS_LIMP_MIN_SPEED, GAS_REGEN_PER_SECOND } from './config';

const CAPACITY = 20;

function state(remaining: number): GasState {
  return { remaining };
}

describe('updateGas — drain while throttled (drive AC10)', () => {
  it('drains at GAS_DRAIN_PER_SECOND while throttleOn', () => {
    const result = updateGas(state(10), { capacity: CAPACITY, throttleOn: true, movingIdle: false, dt: 1 });
    expect(result.remaining).toBe(10 - GAS_DRAIN_PER_SECOND);
  });

  it('drains proportionally to dt (partial second)', () => {
    const result = updateGas(state(10), { capacity: CAPACITY, throttleOn: true, movingIdle: false, dt: 0.5 });
    expect(result.remaining).toBeCloseTo(10 - GAS_DRAIN_PER_SECOND * 0.5);
  });

  it('a full tank reaches empty after exactly `capacity` seconds of continuous throttle (drive AC10, drain rate = 1/s)', () => {
    let s = state(CAPACITY);
    for (let i = 0; i < CAPACITY; i++) {
      s = updateGas(s, { capacity: CAPACITY, throttleOn: true, movingIdle: false, dt: 1 });
    }
    expect(s.remaining).toBe(0);
  });
});

describe('updateGas — regen while idle (drive AC12)', () => {
  it('regens at GAS_REGEN_PER_SECOND while movingIdle and not throttled', () => {
    const result = updateGas(state(10), { capacity: CAPACITY, throttleOn: false, movingIdle: true, dt: 1 });
    expect(result.remaining).toBe(10 + GAS_REGEN_PER_SECOND);
  });

  it('neither drains nor regens when not throttled and not idle (e.g. coasting above idle threshold)', () => {
    const result = updateGas(state(10), { capacity: CAPACITY, throttleOn: false, movingIdle: false, dt: 1 });
    expect(result.remaining).toBe(10);
  });

  it('throttleOn takes priority over movingIdle if both were somehow true', () => {
    const result = updateGas(state(10), { capacity: CAPACITY, throttleOn: true, movingIdle: true, dt: 1 });
    expect(result.remaining).toBe(10 - GAS_DRAIN_PER_SECOND);
  });
});

describe('updateGas — clamping (drive AC10/AC12)', () => {
  it('clamps at 0, never goes negative when draining past empty', () => {
    const result = updateGas(state(0.5), { capacity: CAPACITY, throttleOn: true, movingIdle: false, dt: 1 });
    expect(result.remaining).toBe(0);
  });

  it('clamps at capacity, never regens past full', () => {
    const result = updateGas(state(CAPACITY - 0.5), { capacity: CAPACITY, throttleOn: false, movingIdle: true, dt: 1 });
    expect(result.remaining).toBe(CAPACITY);
  });

  it('a tank already at 0 stays at 0 while continuing to drain (no negative excursion, no fail state — drive AC11/AC14)', () => {
    let s = state(0);
    s = updateGas(s, { capacity: CAPACITY, throttleOn: true, movingIdle: false, dt: 5 });
    expect(s.remaining).toBe(0);
  });
});

describe('effectiveTopSpeed — limp mode (drive AC11/AC13)', () => {
  const TOP_SPEED = 12;

  it('returns full top speed when remaining > 0', () => {
    expect(effectiveTopSpeed(TOP_SPEED, 0.01)).toBe(TOP_SPEED);
  });

  it('returns the floored limp speed (GAS_LIMP_MIN_SPEED) when remaining is exactly 0 — the transition boundary (ADR 0005, TOP_SPEED * 0.25 = 3.0 is below the floor of 5)', () => {
    expect(effectiveTopSpeed(TOP_SPEED, 0)).toBe(limpTopSpeed(TOP_SPEED));
    expect(effectiveTopSpeed(TOP_SPEED, 0)).toBe(GAS_LIMP_MIN_SPEED);
  });

  it('never returns a negative or NaN speed for a negative remaining (defensive: same as 0 case)', () => {
    expect(effectiveTopSpeed(TOP_SPEED, -1)).toBe(limpTopSpeed(TOP_SPEED));
  });

  it('full top speed is restored the instant regen ticks remaining from 0 to any positive amount (AC13, "immediately")', () => {
    const regenerated = updateGas(state(0), { capacity: CAPACITY, throttleOn: false, movingIdle: true, dt: 0.01 });
    expect(regenerated.remaining).toBeGreaterThan(0);
    expect(effectiveTopSpeed(TOP_SPEED, regenerated.remaining)).toBe(TOP_SPEED);
  });

  it('floors to GAS_LIMP_MIN_SPEED for every current engine tier (ADR 0005: proportional 0.25x alone falls below FARMER_SPEED on every tier, so the floor dominates and tier differentiation is intentionally lost for now)', () => {
    expect(limpTopSpeed(6)).toBe(GAS_LIMP_MIN_SPEED);
    expect(limpTopSpeed(9)).toBe(GAS_LIMP_MIN_SPEED);
    expect(limpTopSpeed(12)).toBe(GAS_LIMP_MIN_SPEED);
  });

  it('reverts to proportional (0.25x) scaling once topSpeed is high enough that the proportional term exceeds the floor — documents the formula, not a shipping tier', () => {
    const hypotheticalTopSpeed = (GAS_LIMP_MIN_SPEED / GAS_LIMP_FACTOR) + 1; // just above the crossover point
    expect(limpTopSpeed(hypotheticalTopSpeed)).toBe(hypotheticalTopSpeed * GAS_LIMP_FACTOR);
    expect(limpTopSpeed(hypotheticalTopSpeed)).toBeGreaterThan(GAS_LIMP_MIN_SPEED);
  });
});
