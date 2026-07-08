import { describe, expect, it } from 'vitest';
import { farmerReduce, initialFarmerState, type FarmerState } from './farmer';
import { FARMER_CHASE_DURATION, FARMER_LEAVE_DURATION, FARMER_TIRED_DURATION } from './config';

describe('farmerReduce — ABSENT state (farmer AC1)', () => {
  it('starts ABSENT with zero spawnElapsed and phaseElapsed', () => {
    expect(initialFarmerState.kind).toBe('ABSENT');
    expect(initialFarmerState.spawnElapsed).toBe(0);
    expect(initialFarmerState.phaseElapsed).toBe(0);
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

  it('resets spawnElapsed and phaseElapsed to 0 on the SPAWN_TRIGGER transition', () => {
    const primed: FarmerState = { kind: 'ABSENT', position: { x: 0, z: 0 }, spawnElapsed: 9, phaseElapsed: 0 };
    const result = farmerReduce(primed, { type: 'SPAWN_TRIGGER', position: { x: 1, z: 1 } }, 0.1);
    expect(result.spawnElapsed).toBe(0);
    expect(result.phaseElapsed).toBe(0);
  });
});

describe('farmerReduce — PURSUING state (ADR 0007 §1: fixed CHASE_DURATION timer, not reset by bumps)', () => {
  const pursuing: FarmerState = { kind: 'PURSUING', position: { x: 5, z: 5 }, spawnElapsed: 0, phaseElapsed: 0 };

  it('accumulates phaseElapsed on TICK while under the chase duration', () => {
    const result = farmerReduce(pursuing, { type: 'TICK' }, 1);
    expect(result.kind).toBe('PURSUING');
    expect(result.phaseElapsed).toBe(1);
  });

  it('ignores a stray SPAWN_TRIGGER while already PURSUING (never re-triggers)', () => {
    const result = farmerReduce(pursuing, { type: 'SPAWN_TRIGGER', position: { x: 9, z: 9 } }, 1);
    expect(result).toEqual(pursuing);
  });

  it('transitions PURSUING -> TIRED once phaseElapsed reaches FARMER_CHASE_DURATION', () => {
    const primed: FarmerState = { ...pursuing, phaseElapsed: FARMER_CHASE_DURATION - 0.5 };
    const result = farmerReduce(primed, { type: 'TICK' }, 1);
    expect(result.kind).toBe('TIRED');
    expect(result.phaseElapsed).toBe(0);
  });

  it('does not transition before the chase duration elapses', () => {
    const primed: FarmerState = { ...pursuing, phaseElapsed: FARMER_CHASE_DURATION - 2 };
    const result = farmerReduce(primed, { type: 'TICK' }, 1);
    expect(result.kind).toBe('PURSUING');
  });

  it('keeps the farmer\'s position through the PURSUING -> TIRED transition (kinematics live in the system, not the reducer)', () => {
    const primed: FarmerState = { ...pursuing, phaseElapsed: FARMER_CHASE_DURATION };
    const result = farmerReduce(primed, { type: 'TICK' }, 0.1);
    expect(result.position).toEqual(pursuing.position);
  });
});

describe('farmerReduce — TIRED state (ADR 0007 §1: friendly give-up beat)', () => {
  const tired: FarmerState = { kind: 'TIRED', position: { x: 2, z: 2 }, spawnElapsed: 0, phaseElapsed: 0 };

  it('accumulates phaseElapsed on TICK while under the tired duration', () => {
    const result = farmerReduce(tired, { type: 'TICK' }, 0.5);
    expect(result.kind).toBe('TIRED');
    expect(result.phaseElapsed).toBe(0.5);
  });

  it('transitions TIRED -> LEAVING once phaseElapsed reaches FARMER_TIRED_DURATION', () => {
    const primed: FarmerState = { ...tired, phaseElapsed: FARMER_TIRED_DURATION - 0.1 };
    const result = farmerReduce(primed, { type: 'TICK' }, 0.2);
    expect(result.kind).toBe('LEAVING');
    expect(result.phaseElapsed).toBe(0);
  });

  it('ignores a stray SPAWN_TRIGGER while TIRED', () => {
    const result = farmerReduce(tired, { type: 'SPAWN_TRIGGER', position: { x: 9, z: 9 } }, 1);
    expect(result).toEqual(tired);
  });
});

describe('farmerReduce — LEAVING state (ADR 0007 §1: retreat-and-despawn back to ABSENT)', () => {
  const leaving: FarmerState = { kind: 'LEAVING', position: { x: 7, z: 1 }, spawnElapsed: 0, phaseElapsed: 0 };

  it('accumulates phaseElapsed on TICK while under the leave duration', () => {
    const result = farmerReduce(leaving, { type: 'TICK' }, 1);
    expect(result.kind).toBe('LEAVING');
    expect(result.phaseElapsed).toBe(1);
  });

  it('transitions LEAVING -> ABSENT once phaseElapsed reaches FARMER_LEAVE_DURATION, resetting to the initial state shape', () => {
    const primed: FarmerState = { ...leaving, phaseElapsed: FARMER_LEAVE_DURATION - 0.5 };
    const result = farmerReduce(primed, { type: 'TICK' }, 1);
    expect(result.kind).toBe('ABSENT');
    expect(result.spawnElapsed).toBe(0);
    expect(result.phaseElapsed).toBe(0);
  });

  it('ignores a stray SPAWN_TRIGGER while LEAVING', () => {
    const result = farmerReduce(leaving, { type: 'SPAWN_TRIGGER', position: { x: 9, z: 9 } }, 1);
    expect(result).toEqual(leaving);
  });
});

describe('farmerReduce — full cycle (ADR 0007 §1)', () => {
  it('walks ABSENT -> PURSUING -> TIRED -> LEAVING -> ABSENT with the configured durations', () => {
    let state = farmerReduce(initialFarmerState, { type: 'SPAWN_TRIGGER', position: { x: 1, z: 1 } }, 0);
    expect(state.kind).toBe('PURSUING');

    state = farmerReduce(state, { type: 'TICK' }, FARMER_CHASE_DURATION);
    expect(state.kind).toBe('TIRED');

    state = farmerReduce(state, { type: 'TICK' }, FARMER_TIRED_DURATION);
    expect(state.kind).toBe('LEAVING');

    state = farmerReduce(state, { type: 'TICK' }, FARMER_LEAVE_DURATION);
    expect(state.kind).toBe('ABSENT');
    expect(state.spawnElapsed).toBe(0);
  });
});
