import { createGameScene } from './render/scene';
import { initPhysics, TruckController, createObstacleColliders, createStructureColliders, createGroundCollider } from './physics/world';
import { GameStore } from './core/game-state';
import { KeyboardInput } from './input/keyboard-input';
import { createHud } from './ui/hud';
import { createBuilderScreen } from './ui/builder';
import { createGameOverScreen } from './ui/game-over';
import { DrivingSystem, TRUCK_HALF_HEIGHT } from './systems/driving-system';
import { DEFAULT_CLIMB_CONFIG, TRUCK_CONTACT_RADIUS } from './core/driving/config';
import { computeClimbTransform } from './core/driving/obstacle-climb';
import { AnimalSystem } from './systems/animal-system';
import { GasSystem } from './systems/gas-system';
import { FarmerSystem, type FarmerRunState } from './systems/farmer-system';
import { FuelSystem } from './systems/fuel-system';
import { partitionObstacles } from './core/clearance';
import { STUB_OBSTACLES, STUB_STRUCTURES, TERRAIN_BOUNDS } from './core/terrain';
import type { TruckBuild, TruckCosmetics, TruckSpec } from './core/types';
import type RAPIER from '@dimforge/rapier3d-compat';
import { AssetRegistry } from './render/assets/asset-registry';
import { ASSET_MANIFEST, truckAssetKeysForBuild } from './render/assets/manifest';
import { footprintForBodyTier } from './render/truck-sockets';
import { createLoadingIndicator } from './ui/loading-indicator';
import { createDrivingSessionController } from './core/driving-session-controller';

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

  // AssetRegistry is app-lived, not session-lived (ADR 0010 §6/Consequences):
  // created once here and prefetched once, so a restart round-trip
  // (BUILDER -> DRIVING -> GAME_OVER -> BUILDER) never re-downloads. Created
  // before the builder screen (which now needs it for its ADR 0011 §5 live
  // 3D preview) and prefetched immediately, so "prefetch on entering the
  // builder" (ADR 0010 §4.1) holds without a second prefetch trigger later
  // -- the builder screen is itself only ever mounted once (toggled via
  // display, not recreated per ADR 0009's pause/resume flow).
  const assetRegistry = new AssetRegistry();
  assetRegistry.prefetch(
    Object.entries(ASSET_MANIFEST).map(([key, entry]) => ({ key, url: entry.url.toString() })),
  );

  const hud = createHud(app, store);
  const builder = createBuilderScreen(app, store, assetRegistry);
  const gameOver = createGameOverScreen(app, store);
  const loadingIndicator = createLoadingIndicator(app);

  // A driving session (rAF loop, input listeners, Rapier obstacle/truck
  // bodies, three.js scene) is started fresh on every BUILDER -> DRIVING
  // transition and torn down on the matching DRIVING -> GAME_OVER/BUILDER
  // transition, so a restart (GAME_OVER -> BUILDER -> DRIVING, builder AC7)
  // rebuilds against the player's possibly-new TruckSpec instead of
  // silently continuing the stale session (issue #18). The full lifecycle
  // guard (re-entrancy per issue #21; reading store state only after the
  // ADR 0010 §4.3 truck-asset gate resolves, per issue #31) lives in
  // `createDrivingSessionController` (src/core/driving-session-controller.ts)
  // rather than inline here, so it can be driven and tested with a fake
  // gate/store independent of this module's DOM/Rapier/three.js wiring.
  const sessionController = createDrivingSessionController<FarmerRunState>({
    store,
    // ADR 0011 pass: gate on exactly the current build's body/wheel/engine-cue/
    // gas-cue asset keys (read fresh each call, so a re-shop mid-pause before
    // resuming is reflected) instead of the PASS-1 static test-fixture list.
    waitForGate: () => assetRegistry.waitFor(truckAssetKeysForBuild(store.build), TRUCK_GATE_TIMEOUT_MS),
    onGateStart: () => loadingIndicator.show(),
    onGateEnd: () => loadingIndicator.hide(),
    onSessionActiveChange: (active) => store.setSessionActive(active), // issue #32
    startSession: (spec, gas, farmerSeed) =>
      startDriving(app, world, store, assetRegistry, spec, store.build, store.cosmetics, gas, farmerSeed),
  });

  window.addEventListener('unload', () => {
    sessionController.dispose();
    hud.dispose();
    builder.dispose();
    gameOver.dispose();
    loadingIndicator.dispose();
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
  build: TruckBuild,
  cosmetics: TruckCosmetics,
  initialGas: number = spec.gasCapacity,
  farmerSeed?: FarmerRunState,
) {
  // Obstacle clearance is fixed for the run: partition once against the
  // truck's wheel tier (drive AC6-AC9), only blocking obstacles get colliders.
  const { blocking, passable } = partitionObstacles(STUB_OBSTACLES, spec.clearance);
  const obstacleBodies = createObstacleColliders(world, blocking);

  // Structures (issue #46, ADR 0012 §1): always-solid regardless of wheel
  // tier -- unconditional, no clearance partitioning, so this is simpler
  // than the obstacle path above rather than more complex.
  const structureBodies = createStructureColliders(world, STUB_STRUCTURES);

  // Obstacle-climb wheel footprint (ADR 0014, issue #42): body tier is fixed
  // for a run, so this is computed once here rather than every frame --
  // unwraps truck-sockets.ts's THREE.Vector3-based per-tier wheel table into
  // the plain {halfTrack, zFront, zRear} shape computeClimbTransform (core/,
  // three-free per ADR 0001 §4) needs to sample its four wheel corners.
  const climbFootprint = footprintForBodyTier(build.body);

  const truckStart = { x: 0, z: 6 };
  const truckController = new TruckController(world, truckStart, TRUCK_CONTACT_RADIUS, TRUCK_HALF_HEIGHT);

  // Truck rig (ADR 0011 §4/§5): the build/cosmetics the player actually
  // confirmed, assembled via buildTruckRig -- the same assembly path the
  // builder's live preview uses, so what's driven here can never mismatch
  // what was shown there (AC4, cosmetics AC8).
  const scene = createGameScene(app, TERRAIN_BOUNDS, STUB_OBSTACLES, STUB_STRUCTURES, build, cosmetics, assetRegistry);
  scene.setTruckTransform(truckStart, 0);

  const input = new KeyboardInput();
  const drivingSystem = new DrivingSystem(truckController, spec.topSpeed);
  const animalSystem = new AnimalSystem(store);
  const gasSystem = new GasSystem(store, spec.gasCapacity, spec.topSpeed, initialGas);
  const farmerSystem = new FarmerSystem(store, Math.random, farmerSeed);
  const fuelSystem = new FuelSystem(Math.random);

  // Render-continuity gap (ADR 0009 §5): a seeded non-ABSENT farmer resumes
  // already PURSUING/TIRED/LEAVING, so the ABSENT->PURSUING onAppear callback
  // that would normally place the mesh (and, per ADR 0015 §4, start it in the
  // Run pose) never fires. Place it explicitly before frame 1, mirroring the
  // truck's own setTruckTransform call just above -- then correct the pose
  // for a resumed TIRED/LEAVING farmer (ADR 0015 §4's "Resume path"), since
  // a fresh farmer record otherwise always starts on Run.
  if (farmerSeed && farmerSeed.state.kind !== 'ABSENT') {
    // No prior placement to diff a facing heading from on a resumed farmer
    // (issue #57 follow-up) -- `truckStart` is this frame-loop's not-yet-
    // started initial truck position, the same one `setTruckTransform` just
    // above was seeded with, so it's a reasonable one-frame fallback exactly
    // like a fresh onAppear's.
    scene.setFarmerTransform(farmerSeed.state.position, truckStart);
    if (farmerSeed.state.kind === 'TIRED') scene.farmerTired();
    if (farmerSeed.state.kind === 'LEAVING') scene.farmerLeaving();
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
    // Obstacle climb (issue #42, ADR 0014): purely visual four-corner
    // lift/tilt over `passable` obstacles, derived statelessly from this
    // frame's position/heading and the run's fixed wheel footprint -- never
    // touches the physics collider or the clearance rule above.
    const climb = computeClimbTransform(position, heading, climbFootprint, passable, DEFAULT_CLIMB_CONFIG);
    scene.setTruckTransform(position, heading, climb);
    // Wheel roll + front-wheel steer-yaw (issue #40): purely visual, reads
    // this frame's already-computed speed/steer intent rather than a second
    // source of truth -- see scene.ts's setTruckWheelMotion doc comment.
    scene.setTruckWheelMotion(drivingSystem.speed, intent.steer, dt);

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
      // `position` (the truck's this-frame position) is threaded through as
      // `referencePosition` (issue #57 follow-up, facing-direction fix): only
      // actually used by `setFarmerTransform` on the very first call for a
      // fresh farmer instance (onAppear), as the "face the truck" fallback
      // before there's a prior position to diff a real heading from -- see
      // `computeFarmerHeading`'s doc comment in scene.ts.
      onAppear: (farmerPosition) => scene.setFarmerTransform(farmerPosition, position),
      onMove: (farmerPosition) => scene.setFarmerTransform(farmerPosition, position),
      onBump: () => scene.flashTruck(),
      onTired: () => scene.farmerTired(),
      onLeaving: () => scene.farmerLeaving(),
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
      for (const body of structureBodies) world.removeRigidBody(body);
    },
  };
}

main().catch((err) => {
  console.error('Failed to start Monster Truck Farm', err);
});
