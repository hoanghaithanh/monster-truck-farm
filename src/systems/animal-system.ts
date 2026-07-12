// Bridges animal spawn timing/position/boop core logic <-> the GameStore and
// render layer (ADR 0001 §5/§7: spawn -> ... -> collision-resolution
// (boop) -> coin -> hud-sync). Owns the list of live animals; render/ only
// ever reflects it via onSpawn/onRemove callbacks.
import { updateSpawnTimer, initialSpawnTimerState, type SpawnTimerState } from '../core/spawn/spawn-timer';
import { fenceKeepouts, pickSpawnPosition, structureKeepouts, treeKeepouts, type Rng } from '../core/spawn/spawn-position';
import { spawnAnimal } from '../core/spawn/spawn-animal';
import { pickSpecies } from '../core/spawn/pick-species';
import { ANIMAL_SPECIES } from '../core/spawn/species';
import { SPAWN_INTERVAL_SECONDS, MAX_CONCURRENT_ANIMALS, MIN_SPAWN_DISTANCE_FROM_TRUCK } from '../core/spawn/config';
import { isBoopContact, resolveBoop } from '../core/boop';
import { isScatterDone, startScatter, tickScatter, type ScatterState } from '../core/scatter';
import { DECORATIVE_TREES, TERRAIN_BOUNDS, STUB_OBSTACLES, STUB_STRUCTURES, STUB_FENCES } from '../core/terrain';
import { TRUCK_CONTACT_RADIUS } from '../core/driving/config';
import type { AnimalSpecies, AnimalState, Vec2 } from '../core/types';
import type { GameStore } from '../core/game-state';

// Spawn keep-out (issue #46, ADR 0012 §5, AC6; extended issue #54/ADR 0019
// §6 AC9; extended again by the issue #54 amendment, ADR 0019 §A4 -- solid/
// unbreakable trees): the existing obstacles plus the collidable structures',
// standing fences', and decorative trees' footprints, computed once since
// all four source arrays are fixed stub data -- see structureKeepouts's/
// fenceKeepouts's/treeKeepouts's own doc comments.
const SPAWN_KEEPOUTS = [
  ...STUB_OBSTACLES,
  ...structureKeepouts(STUB_STRUCTURES),
  ...fenceKeepouts(STUB_FENCES),
  ...treeKeepouts(DECORATIVE_TREES),
];

export interface AnimalSystemCallbacks {
  /** `species` is fixed at spawn (issue #48, ADR 0016 §1) -- render/ needs it once here to pick the right asset key/builder; `onScatter`/`onRemove` don't need it since scene.ts already remembers species per-slot (`AnimalRecord`). */
  onSpawn(id: string, position: Vec2, species: AnimalSpecies): void;
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
        obstacles: SPAWN_KEEPOUTS,
        truckPosition,
        minDistanceFromTruck: MIN_SPAWN_DISTANCE_FROM_TRUCK,
        rng: this.rng,
      });
      if (position) {
        // Species picker (issue #48, ADR 0016 §1) -- the only behavioral
        // change in this module. Reuses `this.rng` (the same seedable Rng
        // already injected for spawn positions) rather than a second,
        // independent random source.
        const species = pickSpecies(this.rng);
        const id = `${species}-${this.nextId++}`;
        this.animals.push(spawnAnimal(id, species, position));
        callbacks.onSpawn(id, position, species);
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
