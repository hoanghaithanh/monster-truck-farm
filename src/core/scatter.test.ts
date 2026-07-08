import { describe, expect, it } from 'vitest';
import { SCATTER_DURATION_SECONDS, SCATTER_SPEED, isScatterDone, startScatter, tickScatter } from './scatter';

describe('scatter — boop flee reaction (animal AC4a/AC4c)', () => {
  it('starts with the full scatter duration remaining, not yet done', () => {
    const state = startScatter({ x: 1, z: 0 }, { x: 0, z: 0 });
    expect(state.remainingSeconds).toBe(SCATTER_DURATION_SECONDS);
    expect(isScatterDone(state)).toBe(false);
  });

  it('flees directly away from the truck at SCATTER_SPEED', () => {
    const state = startScatter({ x: 3, z: 0 }, { x: 0, z: 0 });
    expect(state.velocity).toEqual({ x: SCATTER_SPEED, z: 0 });
  });

  it('flees along a normalized diagonal direction when off-axis', () => {
    const state = startScatter({ x: 3, z: 4 }, { x: 0, z: 0 }); // 3-4-5 triangle
    expect(state.velocity.x).toBeCloseTo((3 / 5) * SCATTER_SPEED);
    expect(state.velocity.z).toBeCloseTo((4 / 5) * SCATTER_SPEED);
  });

  it('picks an arbitrary non-zero flee direction when animal and truck share a position', () => {
    const state = startScatter({ x: 2, z: 2 }, { x: 2, z: 2 });
    expect(Math.hypot(state.velocity.x, state.velocity.z)).toBeCloseTo(SCATTER_SPEED);
  });

  it('moves the animal along its flee velocity each tick', () => {
    const state = startScatter({ x: 0, z: 0 }, { x: -1, z: 0 });
    const next = tickScatter(state, 0.1);
    expect(next.position.x).toBeCloseTo(SCATTER_SPEED * 0.1);
    expect(next.position.z).toBeCloseTo(0);
  });

  it('counts down remainingSeconds and is not done before the duration elapses', () => {
    let state = startScatter({ x: 1, z: 0 }, { x: 0, z: 0 });
    state = tickScatter(state, SCATTER_DURATION_SECONDS - 0.01);
    expect(isScatterDone(state)).toBe(false);
  });

  it('is done exactly once the full duration has ticked away', () => {
    let state = startScatter({ x: 1, z: 0 }, { x: 0, z: 0 });
    state = tickScatter(state, SCATTER_DURATION_SECONDS);
    expect(isScatterDone(state)).toBe(true);
  });

  it('clamps remainingSeconds at 0, never goes negative', () => {
    let state = startScatter({ x: 1, z: 0 }, { x: 0, z: 0 });
    state = tickScatter(state, 100);
    expect(state.remainingSeconds).toBe(0);
  });

  it('does not mutate the input state', () => {
    const state = startScatter({ x: 1, z: 0 }, { x: 0, z: 0 });
    const before = { ...state, position: { ...state.position }, velocity: { ...state.velocity } };
    tickScatter(state, 0.1);
    expect(state).toEqual(before);
  });
});
