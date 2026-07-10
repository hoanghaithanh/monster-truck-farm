// Bridges the farmer FSM (core/farmer) <-> GameStore.bump() <-> render
// (ADR 0003 §5/§7 systems ordering: farmer-move -> contact -> bump-effect).
// Owns the farmer's live state; render/ only ever reflects it via callbacks,
// matching AnimalSystem's shape in animal-system.ts. Extended by ADR 0007
// for the full chase-timer FSM (TIRED/LEAVING) and dynamic 1/3-speed.
import { farmerReduce, initialFarmerState, type FarmerState } from '../core/farmer/farmer';
import { pickSpawnDelay } from '../core/farmer/spawn';
import { stepTowards } from '../core/farmer/pursue';
import { isFarmerContact } from '../core/farmer/contact';
import { initialInvulnState, isInvulnerable, startInvuln, tickInvuln, type InvulnState } from '../core/farmer/invuln';
import {
  FARMER_CONTACT_RADIUS,
  FARMER_CREEP_FLOOR,
  FARMER_INVULN_SECONDS,
  FARMER_MIN_SPAWN_DISTANCE_FROM_TRUCK,
  FARMER_SPAWN_MAX_SECONDS,
  FARMER_SPAWN_MIN_SECONDS,
} from '../core/farmer/config';
import { pickSpawnPosition, structureKeepouts, type Rng } from '../core/spawn/spawn-position';
import { TERRAIN_BOUNDS, STUB_OBSTACLES, STUB_STRUCTURES } from '../core/terrain';
import { TRUCK_CONTACT_RADIUS } from '../core/driving/config';
import type { Vec2 } from '../core/types';
import type { GameStore } from '../core/game-state';

// Spawn keep-out (issue #46, ADR 0012 §5, AC6): the existing obstacles plus
// the collidable structures' footprints, computed once since both source
// arrays are fixed stub data -- see structureKeepouts's own doc comment.
const SPAWN_KEEPOUTS = [...STUB_OBSTACLES, ...structureKeepouts(STUB_STRUCTURES)];

export interface FarmerSystemCallbacks {
  onAppear(position: Vec2): void;
  onMove(position: Vec2): void;
  /** Fired on a successful bump (farmer AC5): render/ plays the "something happened to me" feedback. */
  onBump(): void;
  /** Fired once, on the PURSUING -> TIRED transition (ADR 0007 §1): a friendly, non-scary give-up beat. */
  onTired(position: Vec2): void;
  /** Fired once, on the LEAVING -> ABSENT transition (ADR 0007 §1): the farmer has walked off; render/ removes/hides the mesh. */
  onDespawn(): void;
}

/**
 * FarmerSystem's entire mutable field set (ADR 0009 §2c), captured/restored
 * as one opaque blob by `main.ts` across a voluntary pause. Deliberately the
 * whole-field-set shape, not an enumerated subset: now that ADR 0007 has
 * grown `FarmerState` (`phaseElapsed`, TIRED/LEAVING), the carry picked it up
 * with zero change here or in main.ts's plumbing, exactly as ADR 0009
 * intended.
 */
export interface FarmerRunState {
  state: FarmerState;
  invuln: InvulnState;
  spawnDelay: number;
}

export class FarmerSystem {
  private state: FarmerState;
  private invuln: InvulnState;
  private spawnDelay: number;

  constructor(
    private store: GameStore,
    private rng: Rng = Math.random,
    seed?: FarmerRunState,
  ) {
    if (seed) {
      // Resume path (ADR 0009 §2c/§3c): reconstitute exactly where the
      // farmer left off — no re-rolled spawn delay, no reset chase.
      this.state = seed.state;
      this.invuln = seed.invuln;
      this.spawnDelay = seed.spawnDelay;
    } else {
      this.state = initialFarmerState;
      this.invuln = initialInvulnState;
      this.spawnDelay = pickSpawnDelay(FARMER_SPAWN_MIN_SECONDS, FARMER_SPAWN_MAX_SECONDS, this.rng);
    }
  }

  /** Captures the farmer's complete current state (ADR 0009 §2c), for `main.ts` to hold across a pause and pass back in as `seed` on resume. Opaque to callers — they never inspect the fields. */
  snapshot(): FarmerRunState {
    return { state: this.state, invuln: this.invuln, spawnDelay: this.spawnDelay };
  }

  /**
   * `truckSpeed` is the truck's instantaneous signed speed (ADR 0007 §2,
   * `drivingSystem.speed`) -- drives the dynamic 1/3-speed pursuit/retreat
   * rate. The farmer stays gas-ignorant; the caller (main.ts) is the only
   * place both systems are known.
   */
  update(dt: number, truckPosition: Vec2, truckSpeed: number, callbacks: FarmerSystemCallbacks): void {
    this.invuln = tickInvuln(this.invuln, dt);

    if (this.state.kind === 'ABSENT') {
      if (this.state.spawnElapsed + dt >= this.spawnDelay) {
        const position = pickSpawnPosition({
          bounds: TERRAIN_BOUNDS,
          obstacles: SPAWN_KEEPOUTS,
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

    if (this.state.kind === 'PURSUING') {
      // Dynamic speed (ADR 0007 §2): 1/3 of the truck's instantaneous
      // speed, floored at FARMER_CREEP_FLOOR so a stopped truck still faces
      // genuine (if slow) pressure rather than total immunity.
      const farmerSpeed = Math.max(Math.abs(truckSpeed) / 3, FARMER_CREEP_FLOOR);
      const nextPosition = stepTowards(this.state.position, truckPosition, farmerSpeed, dt);
      this.state = { ...this.state, position: nextPosition };
      callbacks.onMove(nextPosition);

      if (isFarmerContact(truckPosition, TRUCK_CONTACT_RADIUS, nextPosition, FARMER_CONTACT_RADIUS) && !isInvulnerable(this.invuln)) {
        this.store.bump();
        this.invuln = startInvuln(FARMER_INVULN_SECONDS);
        callbacks.onBump();
      }

      // Fixed CHASE_DURATION timer (ADR 0007 §1): not reset by the bump
      // above, capping how much a single encounter can hurt regardless of
      // how many contacts land.
      this.state = farmerReduce(this.state, { type: 'TICK' }, dt);
      if (this.state.kind === 'TIRED') {
        callbacks.onTired(this.state.position);
      }
      return;
    }

    if (this.state.kind === 'TIRED') {
      // Stationary friendly give-up beat (ADR 0007 §1, farmer AC7 tone) --
      // no motion, just the fixed-duration timer ticking toward LEAVING.
      this.state = farmerReduce(this.state, { type: 'TICK' }, dt);
      return;
    }

    // LEAVING: retreat kinematics, symmetric to PURSUING -- the same
    // dynamic-speed formula, steering away from the truck instead of toward
    // it (ADR 0007 §1/Component design).
    const farmerSpeed = Math.max(Math.abs(truckSpeed) / 3, FARMER_CREEP_FLOOR);
    const retreatTarget: Vec2 = {
      x: this.state.position.x + (this.state.position.x - truckPosition.x),
      z: this.state.position.z + (this.state.position.z - truckPosition.z),
    };
    const nextPosition = stepTowards(this.state.position, retreatTarget, farmerSpeed, dt);
    this.state = { ...this.state, position: nextPosition };
    callbacks.onMove(nextPosition);

    this.state = farmerReduce(this.state, { type: 'TICK' }, dt);
    if (this.state.kind === 'ABSENT') {
      // Re-entering ABSENT (farmer AC1): re-roll the random spawn delay so
      // the farmer reappears later on its own cadence, not immediately.
      this.spawnDelay = pickSpawnDelay(FARMER_SPAWN_MIN_SECONDS, FARMER_SPAWN_MAX_SECONDS, this.rng);
      callbacks.onDespawn();
    }
  }
}
