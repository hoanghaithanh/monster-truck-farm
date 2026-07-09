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
import { FarmerSystem, type FarmerRunState } from './systems/farmer-system';
import { FuelSystem } from './systems/fuel-system';
import { partitionObstacles } from './core/clearance';
import { STUB_OBSTACLES, TERRAIN_BOUNDS } from './core/terrain';
import type { TruckSpec } from './core/types';
import type RAPIER from '@dimforge/rapier3d-compat';
import { AssetRegistry } from './render/assets/asset-registry';
import { ASSET_MANIFEST, TRUCK_GATE_ASSET_KEYS } from './render/assets/manifest';
import { createLoadingIndicator } from './ui/loading-indicator';

// Art-asset loading (ADR 0010): TRUCK_GATE_TIMEOUT_MS bounds how long the
// BUILDER -> DRIVING transition will wait for the player's own truck
// model(s) before starting anyway with whatever's loaded so far (primitive
// fallback for the rest) -- human-confirmed 3s, tunable here if playtests
// disagree (ADR 0010 §4.3).
const TRUCK_GATE_TIMEOUT_MS = 3000;

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
  const loadingIndicator = createLoadingIndicator(app);

  // AssetRegistry is app-lived, not session-lived (ADR 0010 §6/Consequences):
  // created once here and prefetched once, so a restart round-trip
  // (BUILDER -> DRIVING -> GAME_OVER -> BUILDER) never re-downloads. The
  // builder screen is itself only ever mounted once (toggled via display,
  // not recreated per ADR 0009's pause/resume flow), so kicking prefetch off
  // right after it mounts satisfies "prefetch on entering the builder"
  // (ADR 0010 §4.1) without needing a second prefetch trigger later.
  const assetRegistry = new AssetRegistry();
  assetRegistry.prefetch(
    Object.entries(ASSET_MANIFEST).map(([key, entry]) => ({ key, url: entry.url.toString() })),
  );

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
  // Farmer state-carry across a voluntary pause (ADR 0009 §2c): held here,
  // not on GameStore, because the farmer FSM was never store-owned and its
  // lifecycle is bound to this module's own session dispose/recreate.
  // Captured (pause) / consumed (resume) below; stays undefined across a
  // game-over so a subsequent fresh build gets a fresh farmer.
  let pausedFarmerState: FarmerRunState | undefined;

  // Truck-asset gate (ADR 0010 §4.3): waits up to TRUCK_GATE_TIMEOUT_MS for
  // the player's own truck model(s) before constructing the driving
  // session, showing the loading indicator only for that bounded wait --
  // then starts regardless (primitive fallback for anything not ready by
  // then). Kept as its own const arrow function (rather than a hoisted
  // `function` declaration) so TypeScript's narrowing of `app` from the
  // guard above still applies inside it.
  const beginDrivingSession = async (spec: TruckSpec, gas: number, farmerSeed: FarmerRunState | undefined) => {
    loadingIndicator.show();
    await assetRegistry.waitFor(TRUCK_GATE_ASSET_KEYS, TRUCK_GATE_TIMEOUT_MS);
    loadingIndicator.hide();

    // The player may have left DRIVING again (e.g. an immediate pause)
    // while the gate was pending -- don't construct a session for a screen
    // we're no longer on; the dispose branch below already ran (or will run)
    // for that transition and expects `driving` to still be undefined here.
    if (store.screen !== 'DRIVING') {
      startingDriving = false;
      return;
    }

    driving = startDriving(app, world, store, assetRegistry, spec, gas, farmerSeed);
    startingDriving = false;
  };

  const unsubscribe = store.subscribe(() => {
    if (store.screen === 'DRIVING' && !driving && !startingDriving && store.spec) {
      startingDriving = true;
      // resumeDriving() and confirmBuild() both land here through this one
      // guarded call site (ADR 0009 §4) — resume adds no second
      // session-construction path, so the #21 re-entrancy guard still
      // covers both entries. `startingDriving` is set synchronously above,
      // before beginDrivingSession()'s first `await`, so a re-entrant
      // `store.emit()` during the async gate below still can't pass this
      // guard -- same #21 protection, just spanning an async gap now.
      const spec = store.spec;
      const gas = store.gas;
      const farmerSeed = pausedFarmerState;
      pausedFarmerState = undefined; // consumed
      void beginDrivingSession(spec, gas, farmerSeed);
    } else if (store.screen !== 'DRIVING' && driving) {
      // Ordering requirement (ADR 0009 §2c): the farmer snapshot MUST be
      // captured before dispose() tears the FarmerSystem down, and only on
      // the *pause* exit (store.pausedMidRun), not a game-over -- on
      // game-over the blob stays undefined so a fresh build gets a fresh
      // farmer, matching #18's dispose-ordering fix precisely.
      pausedFarmerState = store.pausedMidRun ? driving.snapshotFarmer() : undefined;
      driving.dispose();
      driving = undefined;
    }
  });

  window.addEventListener('unload', () => {
    unsubscribe();
    hud.dispose();
    builder.dispose();
    gameOver.dispose();
    loadingIndicator.dispose();
    driving?.dispose();
  });
}

/**
 * Sets up and runs the drivable farm scene for the player's confirmed
 * TruckSpec (builder AC1). `initialGas`/`farmerSeed` (ADR 0009 §5) let a
 * resume carry state across the dispose/recreate boundary; both default to
 * the fresh-start behavior so the confirmBuild() path is unchanged.
 */
function startDriving(
  app: HTMLElement,
  world: RAPIER.World,
  store: GameStore,
  assetRegistry: AssetRegistry,
  spec: TruckSpec,
  initialGas: number = spec.gasCapacity,
  farmerSeed?: FarmerRunState,
) {
  // Obstacle clearance is fixed for the run: partition once against the
  // truck's wheel tier (drive AC6-AC9), only blocking obstacles get colliders.
  const { blocking } = partitionObstacles(STUB_OBSTACLES, spec.clearance);
  const obstacleBodies = createObstacleColliders(world, blocking);

  const truckStart = { x: 0, z: 6 };
  const truckController = new TruckController(world, truckStart, TRUCK_CONTACT_RADIUS, TRUCK_HALF_HEIGHT);

  const scene = createGameScene(app, TERRAIN_BOUNDS, STUB_OBSTACLES, assetRegistry);
  scene.setTruckTransform(truckStart, 0);

  const input = new KeyboardInput();
  const drivingSystem = new DrivingSystem(truckController, spec.topSpeed);
  const animalSystem = new AnimalSystem(store);
  const gasSystem = new GasSystem(store, spec.gasCapacity, spec.topSpeed, initialGas);
  const farmerSystem = new FarmerSystem(store, Math.random, farmerSeed);
  const fuelSystem = new FuelSystem(Math.random);

  // Render-continuity gap (ADR 0009 §5): a seeded non-ABSENT farmer resumes
  // already PURSUING, so the ABSENT->PURSUING onAppear callback that would
  // normally place the mesh never fires. Place it explicitly before frame 1,
  // mirroring the truck's own setTruckTransform call just above.
  if (farmerSeed && farmerSeed.state.kind !== 'ABSENT') {
    scene.setFarmerTransform(farmerSeed.state.position);
  }

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

    // Farmer (farmer AC1-AC6, ADR 0007 full chase-timer FSM): appear -> chase
    // (dynamic 1/3-speed) -> tired -> leaving -> appear again. A bump may end
    // the run via GameStore.gameOver(), which the module-level subscriber
    // above reacts to by disposing this session (issue #18's dispose/recreate
    // fix). `drivingSystem.speed` is this frame's instantaneous truck speed
    // (ADR 0007 §2) -- the farmer stays gas-ignorant, same as before.
    farmerSystem.update(dt, position, drivingSystem.speed, {
      onAppear: (farmerPosition) => scene.setFarmerTransform(farmerPosition),
      onMove: (farmerPosition) => scene.setFarmerTransform(farmerPosition),
      onBump: () => scene.flashTruck(),
      onTired: () => scene.farmerTired(),
      onDespawn: () => scene.farmerDespawn(),
    });

    // A bump above may have just driven hits to 0, which synchronously
    // triggers GameStore.gameOver() -> the module-level subscriber disposes
    // this very session (sets `disposed`, tears down the scene/renderer) --
    // bail out immediately rather than touching the now-disposed scene.
    if (disposed) return;

    // Fuel pickups (ADR 0008): independent spawn/cap/timer from animals;
    // collection routes to gasSystem.refill (the single GasState owner) plus
    // a positive scene effect, never coins/hits (fuel AC7).
    fuelSystem.update(dt, position, {
      onSpawn: (id, fuelPosition) => scene.upsertFuelPickup(id, fuelPosition),
      onCollect: (id, amount) => {
        gasSystem.refill(amount);
        scene.collectFuelPickup(id);
      },
    });

    scene.tickEffects(dt);
    scene.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    /** Captures the live FarmerSystem's state (ADR 0009 §2c) — must be called before dispose(). */
    snapshotFarmer(): FarmerRunState {
      return farmerSystem.snapshot();
    },
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
