// Farmer FSM (ADR 0003 §Decision): Sprint 1 implements the ABSENT ->
// PURSUING subset only. Bump/contact is an *effect* handled by the calling
// system on CONTACT, not a state transition here (ADR 0003 rationale: keeps
// this reducer untouched when Sprint 2 adds TIMER_EXPIRED/TIRED/LEAVING).
import type { Vec2 } from '../types';

export type FarmerStateKind = 'ABSENT' | 'PURSUING';

export interface FarmerState {
  kind: FarmerStateKind;
  /** Current position; meaningless while ABSENT. */
  position: Vec2;
  /** Time accumulated toward the next spawn trigger while ABSENT. */
  spawnElapsed: number;
}

export const initialFarmerState: FarmerState = { kind: 'ABSENT', position: { x: 0, z: 0 }, spawnElapsed: 0 };

export type FarmerEvent =
  | { type: 'TICK' }
  | { type: 'SPAWN_TRIGGER'; position: Vec2 };

/**
 * `farmerReduce(state, event, dt) -> state` per ADR 0003. While ABSENT, TICK
 * accumulates `spawnElapsed` (the calling system decides when that's enough
 * to fire SPAWN_TRIGGER, mirroring spawn/spawn-timer.ts's split of
 * "accumulate" vs. "decide"). Once PURSUING, Sprint 1 never leaves that
 * state (no give-up logic yet -- farmer non-goals).
 */
export function farmerReduce(state: FarmerState, event: FarmerEvent, dt: number): FarmerState {
  if (state.kind === 'ABSENT') {
    if (event.type === 'SPAWN_TRIGGER') {
      return { kind: 'PURSUING', position: event.position, spawnElapsed: 0 };
    }
    return { ...state, spawnElapsed: state.spawnElapsed + dt };
  }
  return state;
}
