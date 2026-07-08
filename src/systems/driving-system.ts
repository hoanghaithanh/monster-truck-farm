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
    // `moveBy`/`setPosition` below only *queue* kinematic targets now — neither steps the world itself
    // (issues #16/#21: a second, independent `world.step()` call within the same tick, previously fired
    // by `setPosition` whenever the boundary clamp triggered, corrupted Rapier's internal wasm-bindgen
    // object graph). `before` is read *before* `moveBy` queues anything, so it's still last tick's
    // committed position; combined with `moveBy`'s returned applied movement, that's enough to compute
    // this tick's prospective position without needing to step the world before deciding on the boundary
    // clamp below. Exactly one `step()` call closes out the tick, after any clamp has queued its target.
    const before = this.truckController.position();
    const movement = this.truckController.moveBy(displacement);
    const prospective: Vec2 = { x: before.x + movement.x, z: before.z + movement.z };

    // Soft boundary (drive AC4): clamp back inside the playable area.
    const clamped = clampToBounds(prospective, TERRAIN_BOUNDS);
    let position = prospective;
    if (clamped.x !== prospective.x || clamped.z !== prospective.z) {
      this.truckController.setPosition(clamped, TRUCK_HALF_HEIGHT);
      position = clamped;
    }

    this.truckController.step();

    return { position, heading: this.motionState.heading };
  }
}
