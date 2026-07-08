// Bridges core driving math <-> the Rapier kinematic controller (ADR 0001
// §5/§7 systems ordering: input -> driving -> physics(move)). Owns the
// truck's per-frame motion state; render/ only ever reads the resulting
// position/heading, it never computes them.
import { integrateTruckMotion, type TruckMotionState } from '../core/driving/truck-motion';
import { DEFAULT_DRIVING_CONFIG } from '../core/driving/config';
import { clampToBounds } from '../core/driving/boundary';
import { TERRAIN_BOUNDS } from '../core/terrain';
import type { DriveIntent, Vec2 } from '../core/types';
import type { TruckController } from '../physics/world';

export const TRUCK_HALF_HEIGHT = 0.4;

export class DrivingSystem {
  private motionState: TruckMotionState = { heading: 0, speed: 0 };

  constructor(
    private truckController: TruckController,
    private topSpeed: number,
  ) {}

  /** Current signed forward speed (units/s) from the last update — read by GasSystem to detect idle (drive AC12). */
  get speed(): number {
    return this.motionState.speed;
  }

  /** Overrides the top speed used on the next update (drive AC11/AC13: gas system feeds in limp/full top speed each frame). */
  setTopSpeed(topSpeed: number): void {
    this.topSpeed = topSpeed;
  }

  update(intent: DriveIntent, dt: number): { position: Vec2; heading: number } {
    const { state, displacement } = integrateTruckMotion(
      this.motionState,
      intent,
      this.topSpeed,
      DEFAULT_DRIVING_CONFIG,
      dt,
    );
    this.motionState = state;

    // Physics resolves the desired displacement against obstacle colliders:
    // slides along / stops, never passes through, never crashes (drive AC6-AC9).
    this.truckController.moveBy(displacement);
    let position = this.truckController.position();

    // Soft boundary (drive AC4): clamp back inside the playable area.
    const clamped = clampToBounds(position, TERRAIN_BOUNDS);
    if (clamped.x !== position.x || clamped.z !== position.z) {
      this.truckController.setPosition(clamped, TRUCK_HALF_HEIGHT);
      position = clamped;
    }

    return { position, heading: this.motionState.heading };
  }
}
