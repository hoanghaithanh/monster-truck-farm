// Bridges the pure gas model (core/gas) <-> GameStore <-> the driving
// system's effective top speed (ADR 0004: drain-while-driving,
// regen-while-idle, limp mode never hard-stops the truck).
import { updateGas, effectiveTopSpeed, type GasState } from '../core/gas/gas';
import { GAS_IDLE_SPEED_EPSILON } from '../core/gas/config';
import type { DriveIntent } from '../core/types';
import type { GameStore } from '../core/game-state';

export class GasSystem {
  private state: GasState;

  constructor(
    private store: GameStore,
    private capacity: number,
    private topSpeed: number,
  ) {
    this.state = { remaining: capacity };
    this.store.setGas(capacity);
  }

  /**
   * Advances the gas model by one frame and returns the effective top speed
   * to drive with this frame (drive AC11/AC13). `currentSpeed` is the truck's
   * speed from the *previous* frame's driving update — a one-frame lag that's
   * immaterial at this game's timescale (matches the existing frame-ordering
   * pattern in main.ts, e.g. animalSystem reading the just-updated position).
   */
  update(intent: DriveIntent, currentSpeed: number, dt: number): number {
    const throttleOn = intent.throttle !== 0;
    const movingIdle = !throttleOn && Math.abs(currentSpeed) < GAS_IDLE_SPEED_EPSILON;
    this.state = updateGas(this.state, { capacity: this.capacity, throttleOn, movingIdle, dt });
    this.store.setGas(this.state.remaining);
    return effectiveTopSpeed(this.topSpeed, this.state.remaining);
  }
}
