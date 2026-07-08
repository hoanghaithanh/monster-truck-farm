import { describe, expect, it } from 'vitest';
import { stepTowards } from './pursue';

describe('stepTowards — farmer steering (farmer AC2)', () => {
  it('moves the farmer toward the target along the straight-line direction', () => {
    const result = stepTowards({ x: 0, z: 0 }, { x: 10, z: 0 }, 4, 1);
    expect(result).toEqual({ x: 4, z: 0 });
  });

  it('moves diagonally toward a target off-axis, preserving direction', () => {
    const result = stepTowards({ x: 0, z: 0 }, { x: 3, z: 4 }, 5, 1); // distance 5, speed 5 -> reaches exactly
    expect(result.x).toBeCloseTo(3);
    expect(result.z).toBeCloseTo(4);
  });

  it('does not overshoot the target — clamps the step to the remaining distance', () => {
    const result = stepTowards({ x: 0, z: 0 }, { x: 1, z: 0 }, 4, 1); // speed*dt=4 > distance=1
    expect(result).toEqual({ x: 1, z: 0 });
  });

  it('scales the step by dt', () => {
    const result = stepTowards({ x: 0, z: 0 }, { x: 10, z: 0 }, 4, 0.5);
    expect(result).toEqual({ x: 2, z: 0 });
  });

  it('returns the current position unchanged once already (near-)at the target', () => {
    const current = { x: 5, z: 5 };
    const result = stepTowards(current, { x: 5, z: 5 }, 4, 1);
    expect(result).toEqual(current);
  });

  it('moving toward the truck strictly decreases distance each step (never moves away)', () => {
    const start = { x: 0, z: 0 };
    const target = { x: 20, z: 0 };
    const distBefore = Math.hypot(target.x - start.x, target.z - start.z);
    const next = stepTowards(start, target, 4, 0.5);
    const distAfter = Math.hypot(target.x - next.x, target.z - next.z);
    expect(distAfter).toBeLessThan(distBefore);
  });
});
