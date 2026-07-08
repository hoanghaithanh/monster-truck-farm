import { describe, expect, it } from 'vitest';
import { initialInvulnState, isInvulnerable, startInvuln, tickInvuln } from './invuln';
import { FARMER_INVULN_SECONDS } from './config';

describe('invuln — post-bump invulnerability window (farmer Open Q1 / ADR 0003)', () => {
  it('starts not invulnerable', () => {
    expect(isInvulnerable(initialInvulnState)).toBe(false);
  });

  it('startInvuln makes the state invulnerable for the given duration', () => {
    const state = startInvuln(FARMER_INVULN_SECONDS);
    expect(isInvulnerable(state)).toBe(true);
    expect(state.remainingSeconds).toBe(FARMER_INVULN_SECONDS);
  });

  it('remains invulnerable just before the window elapses (blocks a second bump within 1.0s)', () => {
    let state = startInvuln(FARMER_INVULN_SECONDS);
    state = tickInvuln(state, FARMER_INVULN_SECONDS - 0.01);
    expect(isInvulnerable(state)).toBe(true);
  });

  it('is no longer invulnerable exactly once the full duration has ticked away', () => {
    let state = startInvuln(FARMER_INVULN_SECONDS);
    state = tickInvuln(state, FARMER_INVULN_SECONDS);
    expect(isInvulnerable(state)).toBe(false);
  });

  it('allows a bump again once the window has fully elapsed (>1.0s)', () => {
    let state = startInvuln(FARMER_INVULN_SECONDS);
    state = tickInvuln(state, FARMER_INVULN_SECONDS + 0.5);
    expect(isInvulnerable(state)).toBe(false);
  });

  it('clamps remainingSeconds at 0, never goes negative', () => {
    let state = startInvuln(FARMER_INVULN_SECONDS);
    state = tickInvuln(state, 100);
    expect(state.remainingSeconds).toBe(0);
  });

  it('ticking an already-expired state is a no-op (stays at 0)', () => {
    const state = tickInvuln(initialInvulnState, 5);
    expect(state.remainingSeconds).toBe(0);
    expect(isInvulnerable(state)).toBe(false);
  });
});
