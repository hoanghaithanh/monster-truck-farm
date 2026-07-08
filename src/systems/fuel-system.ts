// Bridges the fuel-pickup spawn/contact core logic <-> render (ADR 0008 §3),
// parallel to AnimalSystem but simpler: collection is instant (fuel AC13),
// so there is no scatter map and no multi-frame despawn loop. Reuses the
// generic spawn/spawn-timer.ts and spawn/spawn-position.ts machinery as-is
// (ADR 0008 §1) -- its own timer/cap/config, independent of animals (AC3).
import { updateSpawnTimer, initialSpawnTimerState, type SpawnTimerState } from '../core/spawn/spawn-timer';
import { pickSpawnPosition, type Rng } from '../core/spawn/spawn-position';
import { spawnFuelPickup } from '../core/fuel/spawn-fuel';
import { isFuelContact } from '../core/fuel/collect';
import {
  FUEL_CONTACT_RADIUS,
  FUEL_MIN_SPAWN_DISTANCE_FROM_TRUCK,
  FUEL_REFILL_AMOUNT,
  FUEL_SPAWN_INTERVAL_SECONDS,
  MAX_CONCURRENT_FUEL,
} from '../core/fuel/config';
import { TERRAIN_BOUNDS, STUB_OBSTACLES } from '../core/terrain';
import { TRUCK_CONTACT_RADIUS } from '../core/driving/config';
import type { FuelPickupState, Vec2 } from '../core/types';

export interface FuelSystemCallbacks {
  onSpawn(id: string, position: Vec2): void;
  /** Fired on collection with the refill amount (fuel AC8/AC9) -- main.ts routes this to gasSystem.refill + a scene effect. Gas-ignorant by design (ADR 0008 §3), mirroring how the farmer stays gas-ignorant (ADR 0007). */
  onCollect(id: string, amount: number): void;
}

export class FuelSystem {
  private timerState: SpawnTimerState = initialSpawnTimerState;
  private pickups: FuelPickupState[] = [];
  private nextId = 1;

  constructor(
    private rng: Rng = Math.random,
  ) {}

  update(dt: number, truckPosition: Vec2, callbacks: FuelSystemCallbacks): void {
    const timerResult = updateSpawnTimer(this.timerState, dt, this.pickups.length, MAX_CONCURRENT_FUEL, FUEL_SPAWN_INTERVAL_SECONDS);
    this.timerState = timerResult.state;

    if (timerResult.shouldSpawn) {
      const position = pickSpawnPosition({
        bounds: TERRAIN_BOUNDS,
        obstacles: STUB_OBSTACLES,
        truckPosition,
        minDistanceFromTruck: FUEL_MIN_SPAWN_DISTANCE_FROM_TRUCK,
        rng: this.rng,
      });
      if (position) {
        const id = `fuel-${this.nextId++}`;
        this.pickups.push(spawnFuelPickup(id, position));
        callbacks.onSpawn(id, position);
      }
    }

    const remaining: FuelPickupState[] = [];
    for (const pickup of this.pickups) {
      if (isFuelContact(truckPosition, TRUCK_CONTACT_RADIUS, pickup, FUEL_CONTACT_RADIUS)) {
        // Instant collect (fuel AC13): no scatter, removed the frame it's touched.
        callbacks.onCollect(pickup.id, FUEL_REFILL_AMOUNT);
      } else {
        remaining.push(pickup);
      }
    }
    this.pickups = remaining;
  }
}
