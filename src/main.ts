import { createGameScene } from './render/scene';
import { initPhysics, TruckController, createObstacleColliders, createGroundCollider } from './physics/world';
import { GameStore } from './core/game-state';
import { KeyboardInput } from './input/keyboard-input';
import { createHud } from './ui/hud';
import { createBuilderScreen } from './ui/builder';
import { DrivingSystem, TRUCK_HALF_HEIGHT } from './systems/driving-system';
import { AnimalSystem } from './systems/animal-system';
import { partitionObstacles } from './core/clearance';
import { STUB_OBSTACLES, TERRAIN_BOUNDS } from './core/terrain';
import type { TruckSpec } from './core/types';
import type RAPIER from '@dimforge/rapier3d-compat';

// Bootstrap: wires core (pure rules) <-> physics (Rapier kinematic
// controller) <-> render (three.js) <-> input/ui, per ADR 0001 §5/§7. The
// player now assembles their own truck on the builder screen (issues
// #1-4); driving/obstacle-clearance only start once GameStore's screen
// FSM moves BUILDER -> DRIVING (builder AC1), using the TruckSpec the
// player actually picked, not a hardcoded default.

async function main() {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app root element missing');

  // Kick off Rapier's async WASM init early (ADR 0001 risk mitigation) while
  // the player is still choosing parts on the builder screen.
  const world = await initPhysics();
  createGroundCollider(world);

  const store = new GameStore();
  const hud = createHud(app, store);
  const builder = createBuilderScreen(app, store);

  let driving: ReturnType<typeof startDriving> | undefined;
  const unsubscribe = store.subscribe(() => {
    if (store.screen === 'DRIVING' && !driving && store.spec) {
      driving = startDriving(app, world, store, store.spec);
    }
  });

  window.addEventListener('unload', () => {
    unsubscribe();
    hud.dispose();
    builder.dispose();
    driving?.dispose();
  });
}

/** Sets up and runs the drivable farm scene for the player's confirmed TruckSpec (builder AC1). */
function startDriving(app: HTMLElement, world: RAPIER.World, store: GameStore, spec: TruckSpec) {
  // Obstacle clearance is fixed for the run: partition once against the
  // truck's wheel tier (drive AC6-AC9), only blocking obstacles get colliders.
  const { blocking } = partitionObstacles(STUB_OBSTACLES, spec.clearance);
  createObstacleColliders(world, blocking);

  const truckStart = { x: 0, z: 6 };
  const truckController = new TruckController(world, truckStart, 0.9, TRUCK_HALF_HEIGHT);

  const scene = createGameScene(app, TERRAIN_BOUNDS, STUB_OBSTACLES);
  scene.setTruckTransform(truckStart, 0);

  const input = new KeyboardInput();
  const drivingSystem = new DrivingSystem(truckController, spec.topSpeed);
  const animalSystem = new AnimalSystem(store);

  let last = performance.now();
  let disposed = false;
  function frame(now: number) {
    if (disposed) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    const { position, heading } = drivingSystem.update(input.getIntent(), dt);
    scene.setTruckTransform(position, heading);

    animalSystem.update(dt, position, {
      onSpawn: (id, animalPosition) => scene.upsertAnimal(id, animalPosition),
      onRemove: (id) => scene.removeAnimal(id),
    });

    scene.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    dispose() {
      disposed = true;
      input.dispose();
      scene.dispose();
    },
  };
}

main().catch((err) => {
  console.error('Failed to start Monster Truck Farm', err);
});
