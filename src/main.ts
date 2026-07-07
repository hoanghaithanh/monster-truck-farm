import { createGameScene } from './render/scene';
import { initPhysics, TruckController, createObstacleColliders, createGroundCollider } from './physics/world';
import { GameStore } from './core/game-state';
import { KeyboardInput } from './input/keyboard-input';
import { createHud } from './ui/hud';
import { DrivingSystem, TRUCK_HALF_HEIGHT } from './systems/driving-system';
import { AnimalSystem } from './systems/animal-system';
import { DEFAULT_TRUCK_SPEC } from './core/stats/default-truck';
import { partitionObstacles } from './core/clearance';
import { STUB_OBSTACLES, TERRAIN_BOUNDS } from './core/terrain';

// Bootstrap: wires core (pure rules) <-> physics (Rapier kinematic
// controller) <-> render (three.js) <-> input/ui, per ADR 0001 §5/§7. This
// is the thin end-to-end slice for issues #5/#6/#7/#9/#10/#11 — the truck
// builder (out of scope) is stood in for by DEFAULT_TRUCK_SPEC.

async function main() {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app root element missing');

  // Kick off Rapier's async WASM init early (ADR 0001 risk mitigation).
  const world = await initPhysics();
  createGroundCollider(world);

  // Obstacle clearance is fixed for the run: partition once against the
  // truck's wheel tier (drive AC6-AC9), only blocking obstacles get colliders.
  const { blocking } = partitionObstacles(STUB_OBSTACLES, DEFAULT_TRUCK_SPEC.clearance);
  createObstacleColliders(world, blocking);

  const truckStart = { x: 0, z: 6 };
  const truckController = new TruckController(world, truckStart, 0.9, TRUCK_HALF_HEIGHT);

  const scene = createGameScene(app, TERRAIN_BOUNDS, STUB_OBSTACLES);
  scene.setTruckTransform(truckStart, 0);

  const store = new GameStore();
  const hud = createHud(app, store);

  const input = new KeyboardInput();
  const drivingSystem = new DrivingSystem(truckController, DEFAULT_TRUCK_SPEC.topSpeed);
  const animalSystem = new AnimalSystem(store);

  let last = performance.now();
  function frame(now: number) {
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

  window.addEventListener('unload', () => {
    input.dispose();
    hud.dispose();
    scene.dispose();
  });
}

main().catch((err) => {
  console.error('Failed to start Monster Truck Farm', err);
});
