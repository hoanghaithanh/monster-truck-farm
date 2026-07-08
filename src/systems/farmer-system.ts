// Bridges the farmer FSM (core/farmer) <-> GameStore.bump() <-> render
// (ADR 0003 §5/§7 systems ordering: farmer-move -> contact -> bump-effect).
// Owns the farmer's live state; render/ only ever reflects it via callbacks,
// matching AnimalSystem's shape in animal-system.ts.
import { farmerReduce, initialFarmerState, type FarmerState } from '../core/farmer/farmer';
import { pickSpawnDelay } from '../core/farmer/spawn';
import { stepTowards } from '../core/farmer/pursue';
import { isFarmerContact } from '../core/farmer/contact';
import { initialInvulnState, isInvulnerable, startInvuln, tickInvuln, type InvulnState } from '../core/farmer/invuln';
import {
  FARMER_CONTACT_RADIUS,
  FARMER_INVULN_SECONDS,
  FARMER_MIN_SPAWN_DISTANCE_FROM_TRUCK,
  FARMER_SPAWN_MAX_SECONDS,
  FARMER_SPAWN_MIN_SECONDS,
  FARMER_SPEED,
} from '../core/farmer/config';
import { pickSpawnPosition, type Rng } from '../core/spawn/spawn-position';
import { TERRAIN_BOUNDS, STUB_OBSTACLES } from '../core/terrain';
import { TRUCK_CONTACT_RADIUS } from '../core/driving/config';
import type { Vec2 } from '../core/types';
import type { GameStore } from '../core/game-state';

export interface FarmerSystemCallbacks {
  onAppear(position: Vec2): void;
  onMove(position: Vec2): void;
  /** Fired on a successful bump (farmer AC5): render/ plays the "something happened to me" feedback. */
  onBump(): void;
}

export class FarmerSystem {
  private state: FarmerState = initialFarmerState;
  private invuln: InvulnState = initialInvulnState;
  private spawnDelay: number;

  constructor(
    private store: GameStore,
    private rng: Rng = Math.random,
  ) {
    this.spawnDelay = pickSpawnDelay(FARMER_SPAWN_MIN_SECONDS, FARMER_SPAWN_MAX_SECONDS, this.rng);
  }

  update(dt: number, truckPosition: Vec2, callbacks: FarmerSystemCallbacks): void {
    this.invuln = tickInvuln(this.invuln, dt);

    if (this.state.kind === 'ABSENT') {
      if (this.state.spawnElapsed + dt >= this.spawnDelay) {
        const position = pickSpawnPosition({
          bounds: TERRAIN_BOUNDS,
          obstacles: STUB_OBSTACLES,
          truckPosition,
          minDistanceFromTruck: FARMER_MIN_SPAWN_DISTANCE_FROM_TRUCK,
          rng: this.rng,
        });
        if (position) {
          this.state = farmerReduce(this.state, { type: 'SPAWN_TRIGGER', position }, dt);
          callbacks.onAppear(position);
        } else {
          this.state = farmerReduce(this.state, { type: 'TICK' }, dt);
        }
      } else {
        this.state = farmerReduce(this.state, { type: 'TICK' }, dt);
      }
      return;
    }

    // PURSUING (farmer AC2): steer toward the player's current position.
    const nextPosition = stepTowards(this.state.position, truckPosition, FARMER_SPEED, dt);
    this.state = { ...this.state, position: nextPosition };
    callbacks.onMove(nextPosition);

    if (isFarmerContact(truckPosition, TRUCK_CONTACT_RADIUS, nextPosition, FARMER_CONTACT_RADIUS) && !isInvulnerable(this.invuln)) {
      this.store.bump();
      this.invuln = startInvuln(FARMER_INVULN_SECONDS);
      callbacks.onBump();
    }
  }
}
