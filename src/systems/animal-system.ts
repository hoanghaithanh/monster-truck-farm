// Bridges animal spawn timing/position/boop core logic <-> the GameStore and
// render layer (ADR 0001 §5/§7: spawn -> ... -> collision-resolution
// (boop) -> coin -> hud-sync). Owns the list of live animals; render/ only
// ever reflects it via onSpawn/onRemove callbacks.
import { updateSpawnTimer, initialSpawnTimerState, type SpawnTimerState } from '../core/spawn/spawn-timer';
import { pickSpawnPosition, type Rng } from '../core/spawn/spawn-position';
import { spawnAnimal } from '../core/spawn/spawn-animal';
import { ANIMAL_SPECIES } from '../core/spawn/species';
import { SPAWN_INTERVAL_SECONDS, MAX_CONCURRENT_ANIMALS, MIN_SPAWN_DISTANCE_FROM_TRUCK } from '../core/spawn/config';
import { isBoopContact, resolveBoop } from '../core/boop';
import { isScatterDone, startScatter, tickScatter, type ScatterState } from '../core/scatter';
import { TERRAIN_BOUNDS, STUB_OBSTACLES } from '../core/terrain';
import { TRUCK_CONTACT_RADIUS } from '../core/driving/config';
import type { AnimalState, Vec2 } from '../core/types';
import type { GameStore } from '../core/game-state';

export interface AnimalSystemCallbacks {
  onSpawn(id: string, position: Vec2): void;
  /** Fired each frame a booped animal is fleeing (animal AC4a), so render/ can move its mesh. */
  onScatter(id: string, position: Vec2): void;
  onRemove(id: string): void;
}

export class AnimalSystem {
  private timerState: SpawnTimerState = initialSpawnTimerState;
  private animals: AnimalState[] = [];
  private scatters = new Map<string, ScatterState>();
  private nextId = 1;

  constructor(
    private store: GameStore,
    private rng: Rng = Math.random,
  ) {}

  update(dt: number, truckPosition: Vec2, callbacks: AnimalSystemCallbacks): void {
    const aliveCount = this.animals.filter((a) => a.alive).length;
    const timerResult = updateSpawnTimer(this.timerState, dt, aliveCount, MAX_CONCURRENT_ANIMALS, SPAWN_INTERVAL_SECONDS);
    this.timerState = timerResult.state;

    if (timerResult.shouldSpawn) {
      const position = pickSpawnPosition({
        bounds: TERRAIN_BOUNDS,
        obstacles: STUB_OBSTACLES,
        truckPosition,
        minDistanceFromTruck: MIN_SPAWN_DISTANCE_FROM_TRUCK,
        rng: this.rng,
      });
      if (position) {
        const id = `chicken-${this.nextId++}`;
        this.animals.push(spawnAnimal(id, 'chicken', position));
        callbacks.onSpawn(id, position);
      }
    }

    for (let i = 0; i < this.animals.length; i++) {
      const animal = this.animals[i];
      if (!animal.alive) continue;
      const radius = ANIMAL_SPECIES[animal.species].radius;
      if (isBoopContact(truckPosition, TRUCK_CONTACT_RADIUS, animal, radius)) {
        const { animal: booped, coinsAwarded } = resolveBoop(animal);
        this.animals[i] = booped;
        this.store.addCoins(coinsAwarded);
        // Coins/removal-from-boop-eligibility happen immediately (AC4b), but
        // the mesh itself keeps fleeing for a beat before despawning (AC4a)
        // rather than vanishing the same frame -- see scatters loop below.
        this.scatters.set(animal.id, startScatter(animal.position, truckPosition));
      }
    }

    // Advance in-flight scatter reactions and despawn once each finishes
    // (animal AC4c), decoupled from the contact loop above so a scatter
    // that just started still gets its first tick next frame.
    for (const [id, scatterState] of this.scatters) {
      const next = tickScatter(scatterState, dt);
      if (isScatterDone(next)) {
        this.scatters.delete(id);
        callbacks.onRemove(id);
      } else {
        this.scatters.set(id, next);
        callbacks.onScatter(id, next.position);
      }
    }

    this.animals = this.animals.filter((a) => a.alive);
  }
}
