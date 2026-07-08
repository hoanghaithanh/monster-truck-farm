// Farmer FSM (ADR 0003 §Decision, extended by ADR 0007 §1): the full
// ABSENT -> PURSUING -> TIRED -> LEAVING -> ABSENT cycle. Bump/contact is
// still an *effect* handled by the calling system on CONTACT, not a state
// transition here (ADR 0003 rationale) -- that part is unchanged from
// Sprint 1. What's new in Sprint 2 (ADR 0007): a `phaseElapsed` timer that
// the reducer itself advances and thresholds against fixed config durations
// (CHASE/TIRED/LEAVE), since -- unlike the random ABSENT spawn delay -- these
// durations are fixed and don't need system-owned randomness to decide when
// to fire.
import type { Vec2 } from '../types';
import { FARMER_CHASE_DURATION, FARMER_LEAVE_DURATION, FARMER_TIRED_DURATION } from './config';

export type FarmerStateKind = 'ABSENT' | 'PURSUING' | 'TIRED' | 'LEAVING';

export interface FarmerState {
  kind: FarmerStateKind;
  /** Current position; meaningless while ABSENT. */
  position: Vec2;
  /** Time accumulated toward the next spawn trigger while ABSENT. */
  spawnElapsed: number;
  /** Time accumulated in the current PURSUING/TIRED/LEAVING phase (ADR 0007 §1). */
  phaseElapsed: number;
}

export const initialFarmerState: FarmerState = { kind: 'ABSENT', position: { x: 0, z: 0 }, spawnElapsed: 0, phaseElapsed: 0 };

export type FarmerEvent =
  | { type: 'TICK' }
  | { type: 'SPAWN_TRIGGER'; position: Vec2 };

/**
 * `farmerReduce(state, event, dt) -> state` per ADR 0003, extended by ADR
 * 0007 §1. While ABSENT, TICK accumulates `spawnElapsed` (the calling system
 * decides when that's enough to fire SPAWN_TRIGGER, mirroring
 * spawn/spawn-timer.ts's split of "accumulate" vs. "decide"). Once
 * PURSUING/TIRED/LEAVING, TICK accumulates `phaseElapsed` and the reducer
 * itself fires the fixed-duration transition once the relevant threshold is
 * crossed -- these durations are fixed config, not random, so no system-side
 * decision is needed (unlike the ABSENT spawn trigger).
 */
export function farmerReduce(state: FarmerState, event: FarmerEvent, dt: number): FarmerState {
  if (state.kind === 'ABSENT') {
    if (event.type === 'SPAWN_TRIGGER') {
      return { kind: 'PURSUING', position: event.position, spawnElapsed: 0, phaseElapsed: 0 };
    }
    return { ...state, spawnElapsed: state.spawnElapsed + dt };
  }

  if (event.type !== 'TICK') return state;

  const phaseElapsed = state.phaseElapsed + dt;

  if (state.kind === 'PURSUING') {
    if (phaseElapsed >= FARMER_CHASE_DURATION) {
      return { ...state, kind: 'TIRED', phaseElapsed: 0 };
    }
    return { ...state, phaseElapsed };
  }

  if (state.kind === 'TIRED') {
    if (phaseElapsed >= FARMER_TIRED_DURATION) {
      return { ...state, kind: 'LEAVING', phaseElapsed: 0 };
    }
    return { ...state, phaseElapsed };
  }

  // LEAVING
  if (phaseElapsed >= FARMER_LEAVE_DURATION) {
    return { ...initialFarmerState };
  }
  return { ...state, phaseElapsed };
}
