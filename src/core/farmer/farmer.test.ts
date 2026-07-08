import { describe, expect, it } from 'vitest';
import { farmerReduce, initialFarmerState, type FarmerState } from './farmer';

describe('farmerReduce — ABSENT state (farmer AC1)', () => {
  it('starts ABSENT with zero spawnElapsed', () => {
    expect(initialFarmerState.kind).toBe('ABSENT');
    expect(initialFarmerState.spawnElapsed).toBe(0);
  });

  it('accumulates spawnElapsed on TICK while ABSENT', () => {
    const result = farmerReduce(initialFarmerState, { type: 'TICK' }, 1.5);
    expect(result.kind).toBe('ABSENT');
    expect(result.spawnElapsed).toBe(1.5);
  });

  it('accumulates across multiple ticks', () => {
    let state = initialFarmerState;
    state = farmerReduce(state, { type: 'TICK' }, 2);
    state = farmerReduce(state, { type: 'TICK' }, 3);
    expect(state.spawnElapsed).toBe(5);
  });

  it('transitions ABSENT -> PURSUING on SPAWN_TRIGGER, adopting the given position', () => {
    const result = farmerReduce(initialFarmerState, { type: 'SPAWN_TRIGGER', position: { x: 3, z: 4 } }, 0.1);
    expect(result.kind).toBe('PURSUING');
    expect(result.position).toEqual({ x: 3, z: 4 });
  });

  it('resets spawnElapsed to 0 on the SPAWN_TRIGGER transition', () => {
    const primed: FarmerState = { kind: 'ABSENT', position: { x: 0, z: 0 }, spawnElapsed: 9 };
    const result = farmerReduce(primed, { type: 'SPAWN_TRIGGER', position: { x: 1, z: 1 } }, 0.1);
    expect(result.spawnElapsed).toBe(0);
  });
});

describe('farmerReduce — PURSUING state (Sprint 1: no give-up logic, ADR 0003)', () => {
  const pursuing: FarmerState = { kind: 'PURSUING', position: { x: 5, z: 5 }, spawnElapsed: 0 };

  it('stays PURSUING and is a no-op on TICK (Sprint 1 has no timer/give-up)', () => {
    const result = farmerReduce(pursuing, { type: 'TICK' }, 1);
    expect(result).toEqual(pursuing);
  });

  it('ignores a stray SPAWN_TRIGGER while already PURSUING (never re-triggers)', () => {
    const result = farmerReduce(pursuing, { type: 'SPAWN_TRIGGER', position: { x: 9, z: 9 } }, 1);
    expect(result).toEqual(pursuing);
  });
});
