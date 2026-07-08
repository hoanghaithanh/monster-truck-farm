// Pure gas drain/regen/limp model (ADR 0004 §Decision, drive AC10-AC14).
// No fail state anywhere in this module -- running out only ever reduces
// effective top speed, never stops the truck (drive AC11/AC14).
import { GAS_DRAIN_PER_SECOND, GAS_LIMP_FACTOR, GAS_REGEN_PER_SECOND } from './config';

export interface GasState {
  /** Remaining tank amount, 0..capacity. */
  remaining: number;
}

export interface GasInputs {
  capacity: number;
  /** True while the player holds throttle above idle (either direction). */
  throttleOn: boolean;
  /** True while no throttle is held and the truck is effectively stationary. */
  movingIdle: boolean;
  dt: number;
}

/** Per-tick gas update (drive AC10/AC12): drains while driving, regens while idle, clamped to [0, capacity]. */
export function updateGas(state: GasState, inputs: GasInputs): GasState {
  let remaining = state.remaining;
  if (inputs.throttleOn) {
    remaining -= GAS_DRAIN_PER_SECOND * inputs.dt;
  } else if (inputs.movingIdle) {
    remaining += GAS_REGEN_PER_SECOND * inputs.dt;
  }
  remaining = Math.min(inputs.capacity, Math.max(0, remaining));
  return { remaining };
}

/**
 * Effective top speed for the current tank level (drive AC11/AC13): a pure
 * function of `remaining`, so "limp mode" and "instant recovery" both fall
 * out for free -- there is no separate limp state to enter/exit (ADR 0004).
 */
export function effectiveTopSpeed(topSpeed: number, remaining: number): number {
  return remaining > 0 ? topSpeed : topSpeed * GAS_LIMP_FACTOR;
}
