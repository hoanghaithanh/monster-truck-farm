import { createGameScene } from './render/scene';
import { initPhysics, TruckController, createObstacleColliders, createGroundCollider } from './physics/world';
import { GameStore } from './core/game-state';
import { KeyboardInput } from './input/keyboard-input';
import { createHud } from './ui/hud';
import { createBuilderScreen } from './ui/builder';
import { createGameOverScreen } from './ui/game-over';
import { DrivingSystem, TRUCK_HALF_HEIGHT } from './systems/driving-system';
import { TRUCK_CONTACT_RADIUS } from './core/driving/config';
import { AnimalSystem } from './systems/animal-system';
import { GasSystem } from './systems/gas-system';
import { FarmerSystem } from './systems/farmer-system';
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
  const gameOver = createGameOverScreen(app, store);

  // A driving session (rAF loop, input listeners, Rapier obstacle/truck
  // bodies, three.js scene) is started fresh on every BUILDER -> DRIVING
  // transition and torn down on the matching DRIVING -> GAME_OVER
  // transition, so a restart (GAME_OVER -> BUILDER -> DRIVING, builder AC7)
  // rebuilds against the player's possibly-new TruckSpec instead of
  // silently continuing the stale session (issue #18). The `!driving` /
  // `driving` guards make each branch fire exactly once per transition,
  // not on every store mutation (e.g. addCoins) that re-fires this
  // subscriber while already mid-session.
  let driving: ReturnType<typeof startDriving> | undefined;
  // Guards against *re-entrant* `store.emit()` calls firing synchronously
  // while this very listener is still on the call stack constructing a
  // session -- e.g. `GasSystem`'s constructor calls `store.setGas()`
  // (drive AC10) partway through `startDriving()`, which synchronously
  // notifies every subscriber, including this one, before `driving` below
  // has been assigned. The `!driving` guard alone can't catch that: it's
  // still `undefined` at that point (the assignment only happens once
  // `startDriving()` *returns*), so the re-entrant call passed the guard
  // too, called `startDriving()` again, which itself re-entered via its own
  // `GasSystem` construction, and so on -- unbounded synchronous recursion,
  // each level standing up a whole extra scene/physics session that never
  // gets disposed (only the last one survives in `driving`), until the JS
  // call stack overflowed mid-`Rapier.World.createCollider()` WASM call.
  // That's the actual root cause of issue #21's "Maximum call stack size
  // exceeded" / "recursive use of an object" crash -- confirmed by
  // instrumenting this listener, which logged 1643 nested `startDriving()`
  // entries (and hundreds of "Too many active WebGL contexts" warnings from
  // the orphaned scenes) before the crash. It is not a bug in
  // `createObstacleColliders`/Rapier's collider API, which builds a fresh
  // descriptor per obstacle and reproduces cleanly in isolation.
  let startingDriving = false;
  const unsubscribe = store.subscribe(() => {
    if (store.screen === 'DRIVING' && !driving && !startingDriving && store.spec) {
      startingDriving = true;
      driving = startDriving(app, world, store, store.spec);
      startingDriving = false;
    } else if (store.screen === 'GAME_OVER' && driving) {
      driving.dispose();
      driving = undefined;
    }
  });

  window.addEventListener('unload', () => {
    unsubscribe();
    hud.dispose();
    builder.dispose();
    gameOver.dispose();
    driving?.dispose();
  });
}

/** Sets up and runs the drivable farm scene for the player's confirmed TruckSpec (builder AC1). */
function startDriving(app: HTMLElement, world: RAPIER.World, store: GameStore, spec: TruckSpec) {
  // Obstacle clearance is fixed for the run: partition once against the
  // truck's wheel tier (drive AC6-AC9), only blocking obstacles get colliders.
  const { blocking } = partitionObstacles(STUB_OBSTACLES, spec.clearance);
  const obstacleBodies = createObstacleColliders(world, blocking);

  const truckStart = { x: 0, z: 6 };
  const truckController = new TruckController(world, truckStart, TRUCK_CONTACT_RADIUS, TRUCK_HALF_HEIGHT);

  const scene = createGameScene(app, TERRAIN_BOUNDS, STUB_OBSTACLES);
  scene.setTruckTransform(truckStart, 0);

  const input = new KeyboardInput();
  const drivingSystem = new DrivingSystem(truckController, spec.topSpeed);
  const animalSystem = new AnimalSystem(store);
  const gasSystem = new GasSystem(store, spec.gasCapacity, spec.topSpeed);
  const farmerSystem = new FarmerSystem(store);

  let last = performance.now();
  let disposed = false;
  function frame(now: number) {
    if (disposed) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    const intent = input.getIntent();
    // Gas (drive AC10-AC14) feeds the effective top speed -- full tank ->
    // full top speed, empty -> ~25% limp mode -- into this frame's driving
    // update, so limp mode is felt immediately rather than a frame late.
    const effectiveTopSpeed = gasSystem.update(intent, drivingSystem.speed, dt);
    drivingSystem.setTopSpeed(effectiveTopSpeed);

    const { position, heading } = drivingSystem.update(intent, dt);
    scene.setTruckTransform(position, heading);

    animalSystem.update(dt, position, {
      onSpawn: (id, animalPosition) => scene.upsertAnimal(id, animalPosition),
      // Booped animal fleeing (animal AC4a): reuse upsertAnimal to move the
      // existing mesh -- it's already the create-or-reposition primitive.
      onScatter: (id, animalPosition) => scene.upsertAnimal(id, animalPosition),
      onRemove: (id) => scene.removeAnimal(id),
    });

    // Farmer (farmer AC1-AC6): appear -> chase -> bump. A bump may end the
    // run via GameStore.gameOver(), which the module-level subscriber above
    // reacts to by disposing this session (issue #18's dispose/recreate fix).
    farmerSystem.update(dt, position, {
      onAppear: (farmerPosition) => scene.setFarmerTransform(farmerPosition),
      onMove: (farmerPosition) => scene.setFarmerTransform(farmerPosition),
      onBump: () => scene.flashTruck(),
    });

    // A bump above may have just driven hits to 0, which synchronously
    // triggers GameStore.gameOver() -> the module-level subscriber disposes
    // this very session (sets `disposed`, tears down the scene/renderer) --
    // bail out immediately rather than touching the now-disposed scene.
    if (disposed) return;

    scene.tickEffects(dt);
    scene.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    dispose() {
      disposed = true;
      input.dispose();
      scene.dispose();
      truckController.dispose();
      for (const body of obstacleBodies) world.removeRigidBody(body);
    },
  };
}

main().catch((err) => {
  console.error('Failed to start Monster Truck Farm', err);
});
