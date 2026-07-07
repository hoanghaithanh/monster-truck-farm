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
import { TERRAIN_BOUNDS, STUB_OBSTACLES } from '../core/terrain';
import type { AnimalState, Vec2 } from '../core/types';
import type { GameStore } from '../core/game-state';

const TRUCK_CONTACT_RADIUS = 0.9;

export interface AnimalSystemCallbacks {
  onSpawn(id: string, position: Vec2): void;
  onRemove(id: string): void;
}

export class AnimalSystem {
  private timerState: SpawnTimerState = initialSpawnTimerState;
  private animals: AnimalState[] = [];
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
        callbacks.onRemove(animal.id);
      }
    }

    this.animals = this.animals.filter((a) => a.alive);
  }
}
