import * as THREE from 'three';
import type { ObstacleInstance, TruckBuild, TruckCosmetics, Vec2 } from '../core/types';
import type { TerrainBounds } from '../core/terrain';
import { clampCameraToBounds } from '../core/driving/boundary';
import type { AssetRegistry } from './assets/asset-registry';
import { truckAssetKeysForBuild } from './assets/manifest';
import { buildTruckRig, type TruckWheelPivots } from './truck-rig';
import { WHEEL_RADIUS_BY_TIER } from './truck-sockets';

/**
 * Copies each wheel's current roll/steer angle from `from` onto the matching
 * pivot in `to` (issue #44) -- extracted to a small, DOM/WebGL-free pure
 * function specifically so it's unit-testable on its own (scene.test.ts):
 * `createGameScene`'s returned closure needs a real `THREE.WebGLRenderer`
 * (this project's test env is plain Node, no jsdom/canvas), but this one
 * step of `tickEffects`'s rig-rebuild path has no such dependency. The cast
 * inside is safe by construction: both `from` and `to` are `TruckWheelPivots`
 * literals assembled by the same `buildTruckRig` (truck-rig.ts), so they
 * always share the exact same four keys (frontLeft/frontRight/rearLeft/rearRight).
 */
export function carryOverWheelRotations(from: TruckWheelPivots, to: TruckWheelPivots): void {
  for (const key of Object.keys(from) as (keyof TruckWheelPivots)[]) {
    to[key].roll.rotation.x = from[key].roll.rotation.x;
    to[key].steer.rotation.y = from[key].steer.rotation.y;
  }
}

// Chase camera stays this far inset from the ground plane's edge so a
// corner position never lets the camera see past the ground into the
// scene background/"void" (issue #17, drive AC4 intent).
const CAMERA_GROUND_MARGIN = 3;

// Wheel roll/steer (issue #40, truck-wheel-motion AC1-AC7): purely visual,
// render-only motion layered on top of the truck rig's wheel pivots
// (truck-rig.ts's WheelPivots) -- zero effect on the kinematic controller,
// obstacle resolution, or any driving math (AC8). Front-wheel max steer-yaw
// (truck-wheel-motion doc's Open Question 2, non-blocking, tuning value
// left to the developer): 30 degrees reads as "clearly turning" without
// looking cartoonish at the truck's actual turn rate.
const MAX_FRONT_WHEEL_STEER_YAW = THREE.MathUtils.degToRad(30);

// Farmer bump feedback (farmer AC5): a brief flash on the truck, distinct
// from the animal-boop reward feel and never scary/violent -- just "something
// happened to me". Decays back to fully transparent over this duration.
// ADR 0011: the truck body's own material is now one of the shared,
// never-mutated cosmetic paint materials (render/cosmetics/cosmetic-manifest.ts)
// -- mutating its .color per-bump would bleed into every other truck sharing
// that colour (including the builder preview). So this flash is a separate
// translucent overlay mesh, following the same disposable-burst-effect
// pattern already used for the fuel-collect glow below, rather than a
// mutation of the truck's own paint.
const BUMP_FLASH_SECONDS = 0.3;
const TRUCK_FLASH_COLOR = 0xff3b3b;
const FARMER_COLOR = 0xd1495b;
// TIRED give-up beat (ADR 0007 §1, farmer AC7 tone): a friendly amber tint,
// distinct from the truck's bump-flash red -- "phew, giving up", not scary.
const FARMER_TIRED_COLOR = 0xf4c542;

// Fuel pickup (ADR 0008 §3): a recognizable jerry-can-ish color, and a brief
// positive glow burst on collection -- no scatter (fuel AC13), just a
// friendly sparkle then gone.
const FUEL_COLOR = 0xffd23f;
const FUEL_GLOW_COLOR = 0xffffff;
const FUEL_GLOW_SECONDS = 0.35;

// Thin rendering adapter (ADR 0001 §4/§7): three.js meshes only, no
// gameplay rules live here. systems/ tells this module where things are;
// this module just draws them.

const OBSTACLE_COLORS: Record<ObstacleInstance['kind'], number> = {
  bush: 0x3fa34d,
  rock: 0x8a8a8a,
  derelictCar: 0x6b4a2f,
};

function buildObstacleGeometry(obstacle: ObstacleInstance): { geometry: THREE.BufferGeometry; height: number } {
  if (obstacle.kind === 'bush') {
    return { geometry: new THREE.SphereGeometry(obstacle.radius, 12, 10), height: obstacle.radius };
  }
  if (obstacle.kind === 'rock') {
    return { geometry: new THREE.IcosahedronGeometry(obstacle.radius, 0), height: obstacle.radius };
  }
  return { geometry: new THREE.BoxGeometry(obstacle.radius * 2, 1.2, obstacle.radius), height: 0.6 };
}

function createObstacleMesh(obstacle: ObstacleInstance): THREE.Object3D {
  const { geometry, height } = buildObstacleGeometry(obstacle);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: OBSTACLE_COLORS[obstacle.kind] }));
  mesh.position.set(obstacle.position.x, height, obstacle.position.z);
  return mesh;
}

export function createGameScene(
  container: HTMLElement,
  bounds: TerrainBounds,
  obstacles: ObstacleInstance[],
  build: TruckBuild,
  cosmetics: TruckCosmetics,
  assetRegistry?: AssetRegistry,
) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;

  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 200);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(10, 15, 8);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x404040, 1.6));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: 0x6fbf5e }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  for (const obstacle of obstacles) {
    scene.add(createObstacleMesh(obstacle));
  }

  // Truck rig (ADR 0011 §4/§5): the single buildTruckRig assembly path also
  // used by the builder's live 3D preview (ui/builder.ts) -- so a mismatch
  // between what the player picked and what they drive (AC4, cosmetics AC8)
  // is structurally impossible, not just tested for. Starts from whatever
  // the AssetRegistry has ready right now (primitive fallback per part if
  // not, per ADR 0010 §7/vehicle-art AC13); `currentBuild`/`currentCosmetics`
  // let tickEffects retry the assembly if any part was still loading when
  // driving started (e.g. the bounded gate in main.ts timed out first).
  const currentBuild = build;
  const currentCosmetics = cosmetics;
  let truckRig = buildTruckRig(currentBuild, currentCosmetics, assetRegistry);
  scene.add(truckRig.group);
  const bumpFlashes: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; remaining: number }[] = [];

  const animalMeshes = new Map<string, THREE.Object3D>();
  let farmerMesh: THREE.Mesh | undefined;
  let farmerMaterial: THREE.MeshStandardMaterial | undefined;
  const fuelMeshes = new Map<string, THREE.Object3D>();
  const fuelGlows: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; remaining: number }[] = [];

  function setTruckTransform(position: Vec2, heading: number): void {
    truckRig.group.position.set(position.x, 0, position.z);
    truckRig.group.rotation.y = heading;

    // Simple chase camera, offset behind the truck's heading. At terrain
    // corners this offset can extend past the finite ground plane, so the
    // camera's own (x,z) is pulled back in to stay over the ground — the
    // camera still looks at the truck, so it stays framed either way.
    const behind = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading)).multiplyScalar(6);
    const desiredCameraPos = { x: truckRig.group.position.x + behind.x, z: truckRig.group.position.z + behind.z };
    const cameraPos = clampCameraToBounds(desiredCameraPos, bounds, CAMERA_GROUND_MARGIN);
    camera.position.set(cameraPos.x, 5, cameraPos.z);
    camera.lookAt(truckRig.group.position.x, 0.5, truckRig.group.position.z);
  }

  /**
   * Per-frame wheel roll + front-wheel steer-yaw (issue #40, truck-wheel-
   * motion AC1/AC3-AC6): a purely visual sibling to setTruckTransform,
   * called from the same call site (main.ts) once both `drivingSystem.speed`
   * and `input.getIntent().steer` are known for the frame -- reads that
   * existing per-frame data rather than introducing a second, independent
   * source of truth for speed/steer (the requirements doc's Constraints).
   *
   * Roll (AC1/AC3, Open Question 1 resolved -- physically accurate): angle
   * delta = distance traveled this frame (`speed * dt`, signed so reverse
   * spins the wheels the other way, AC1) / this build's actual wheel-tier
   * circumference (`2 * PI * WHEEL_RADIUS_BY_TIER[build.wheels]`) * 2*PI
   * radians per full turn -- applied to every wheel's `roll` pivot (AC1),
   * regardless of cosmetic wheel-look (AC7, this never touches materials).
   * Zero speed -> zero delta -> AC2's "reads as parked" falls out for free,
   * no special-casing needed.
   *
   * Steer (AC4-AC6): front-left/front-right wheels' `steer` pivot yaws
   * toward `steerIntent` (-1..1), capped at MAX_FRONT_WHEEL_STEER_YAW;
   * rear wheels' `steer` pivot is never touched here, so they never yaw
   * (AC6) even though the rig gives them a pivot too (structural symmetry
   * only, see truck-rig.ts's WheelPivots doc comment). An instant "snap" to
   * the target angle each frame, not a smoothed return -- AC5 explicitly
   * allows either, and instant is simplest / needs no extra per-frame state.
   *
   * Roll direction while blocked against an obstacle (Open Question 3,
   * non-blocking): this reads `drivingSystem.speed` (the truck's internal
   * motion state), not actual displacement applied, so a truck stalled
   * against an obstacle with the throttle still held keeps its wheels
   * spinning -- a real stuck vehicle's wheels can spin too, and the doc
   * explicitly leaves this either way.
   */
  function setTruckWheelMotion(speed: number, steerIntent: number, dt: number): void {
    const wheelRadius = WHEEL_RADIUS_BY_TIER[currentBuild.wheels] ?? WHEEL_RADIUS_BY_TIER[0];
    const circumference = 2 * Math.PI * wheelRadius;
    const rollDelta = (speed * dt) / circumference * (2 * Math.PI);

    const { frontLeft, frontRight, rearLeft, rearRight } = truckRig.wheels;
    frontLeft.roll.rotation.x += rollDelta;
    frontRight.roll.rotation.x += rollDelta;
    rearLeft.roll.rotation.x += rollDelta;
    rearRight.roll.rotation.x += rollDelta;

    // Sign fix (2026-07-09, issue #40 human report -- wheels steered
    // opposite the truck's actual turn direction). `steer.rotation.y` is a
    // plain Three.js Y-axis rotation on a pivot nested directly under the
    // truck body group, so it obeys the exact same right-hand-rule
    // convention `truck-motion.ts`'s TruckMotionState.heading doc comment
    // establishes: increasing Y-rotation swings a +Z-forward vector toward
    // +X, which is the truck's LEFT, not right. That's why
    // integrateTruckMotion() computes `heading -= intent.steer * ...` (steer
    // right => heading must *decrease*) -- the wheel-visual angle needs that
    // same negation, which this code originally omitted, so it was
    // literally the mirror image of the correct steer direction.
    const steerAngle = -THREE.MathUtils.clamp(steerIntent, -1, 1) * MAX_FRONT_WHEEL_STEER_YAW;
    frontLeft.steer.rotation.y = steerAngle;
    frontRight.steer.rotation.y = steerAngle;
  }

  function upsertAnimal(id: string, position: Vec2): void {
    let mesh = animalMeshes.get(id);
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshStandardMaterial({ color: 0xfff2a8 }),
      );
      scene.add(mesh);
      animalMeshes.set(id, mesh);
    }
    mesh.position.set(position.x, 0.3, position.z);
  }

  function removeAnimal(id: string): void {
    const mesh = animalMeshes.get(id);
    if (!mesh) return;
    scene.remove(mesh);
    animalMeshes.delete(id);
  }

  /** Places (creating on first call) the farmer mesh at its current position (farmer AC1/AC2). */
  function setFarmerTransform(position: Vec2): void {
    if (!farmerMesh) {
      farmerMaterial = new THREE.MeshStandardMaterial({ color: FARMER_COLOR });
      farmerMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.8, 4, 8), farmerMaterial);
      scene.add(farmerMesh);
    }
    farmerMesh.position.set(position.x, 0.75, position.z);
  }

  /** TIRED give-up beat (ADR 0007 §1): a friendly, non-scary tint -- no motion change, just feedback that the farmer is done chasing for now. */
  function farmerTired(): void {
    farmerMaterial?.color.setHex(FARMER_TIRED_COLOR);
  }

  /** LEAVING -> ABSENT (ADR 0007 §1): the farmer has walked off; remove the mesh so a later re-appear recreates it fresh (base color). */
  function farmerDespawn(): void {
    if (!farmerMesh) return;
    scene.remove(farmerMesh);
    farmerMesh = undefined;
    farmerMaterial = undefined;
  }

  /** Triggers the bump feedback flash (farmer AC5) as a translucent overlay burst at the truck's current position, decayed in tickEffects -- see the module header note on why this can't mutate the shared paint material. */
  function flashTruck(): void {
    const flashMaterial = new THREE.MeshBasicMaterial({ color: TRUCK_FLASH_COLOR, transparent: true, opacity: 0.85 });
    const flashMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 2.6), flashMaterial);
    flashMesh.position.copy(truckRig.group.position);
    flashMesh.position.y += 0.5;
    scene.add(flashMesh);
    bumpFlashes.push({ mesh: flashMesh, material: flashMaterial, remaining: BUMP_FLASH_SECONDS });
  }

  /** Places (creating on first call) a fuel pickup mesh (ADR 0008 §3, fuel AC1-AC4). */
  function upsertFuelPickup(id: string, position: Vec2): void {
    let mesh = fuelMeshes.get(id);
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.35, 0.6, 10),
        new THREE.MeshStandardMaterial({ color: FUEL_COLOR }),
      );
      scene.add(mesh);
      fuelMeshes.set(id, mesh);
    }
    mesh.position.set(position.x, 0.3, position.z);
  }

  /** Instant collect (fuel AC13): removes the pickup mesh immediately and starts a brief glow-burst effect at its last position, decayed in tickEffects. */
  function collectFuelPickup(id: string): void {
    const mesh = fuelMeshes.get(id);
    if (!mesh) return;
    const glowMaterial = new THREE.MeshBasicMaterial({ color: FUEL_GLOW_COLOR, transparent: true, opacity: 0.9 });
    const glowMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), glowMaterial);
    glowMesh.position.copy(mesh.position);
    scene.add(glowMesh);
    fuelGlows.push({ mesh: glowMesh, material: glowMaterial, remaining: FUEL_GLOW_SECONDS });

    scene.remove(mesh);
    fuelMeshes.delete(id);
  }

  // Truck-rig upgrade-in-place (ADR 0010 §4/§7): if any part fell back to a
  // primitive when the rig was (re)built -- e.g. the bounded gate in
  // main.ts timed out before this build's assets settled -- keep checking
  // cheaply (status() only, no clone) each frame and rebuild the whole rig
  // in place the moment everything needed is ready. Stops checking once
  // true, since a rig never needs a *second* rebuild within one session
  // (build/cosmetics are fixed for the session; see truck-rig.ts).
  let rigNeedsRecheck = !truckRig.allAssetsReady;

  /** Per-frame visual-effect decay (bump flash + fuel glow bursts) -- called once per render frame from main.ts. */
  function tickEffects(dt: number): void {
    if (rigNeedsRecheck && assetRegistry) {
      const keys = truckAssetKeysForBuild(currentBuild);
      const nowReady = keys.every((key) => assetRegistry.status(key) === 'ready' || assetRegistry.status(key) === 'failed');
      if (nowReady) {
        const rebuilt = buildTruckRig(currentBuild, currentCosmetics, assetRegistry);
        rebuilt.group.position.copy(truckRig.group.position);
        rebuilt.group.rotation.copy(truckRig.group.rotation);
        // Carry over each wheel's current roll/steer angle (issue #44) --
        // the rebuilt rig's pivots are freshly created at rotation 0, so
        // without this the wheels visibly snap back to un-rolled for one
        // frame before setTruckWheelMotion's next call resumes accumulating.
        // See carryOverWheelRotations's own doc comment for why this is a
        // separate top-level function (scene.test.ts coverage).
        carryOverWheelRotations(truckRig.wheels, rebuilt.wheels);
        scene.add(rebuilt.group);
        scene.remove(truckRig.group);
        truckRig.dispose();
        truckRig = rebuilt;
        rigNeedsRecheck = false;
      }
    }

    for (let i = bumpFlashes.length - 1; i >= 0; i--) {
      const flash = bumpFlashes[i];
      flash.remaining -= dt;
      if (flash.remaining <= 0) {
        scene.remove(flash.mesh);
        flash.material.dispose();
        flash.mesh.geometry.dispose();
        bumpFlashes.splice(i, 1);
        continue;
      }
      flash.material.opacity = 0.85 * (flash.remaining / BUMP_FLASH_SECONDS);
    }

    for (let i = fuelGlows.length - 1; i >= 0; i--) {
      const glow = fuelGlows[i];
      glow.remaining -= dt;
      if (glow.remaining <= 0) {
        scene.remove(glow.mesh);
        fuelGlows.splice(i, 1);
        continue;
      }
      const t = glow.remaining / FUEL_GLOW_SECONDS;
      glow.material.opacity = t;
      const scale = 1 + (1 - t) * 0.6;
      glow.mesh.scale.setScalar(scale);
    }
  }

  function onResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener('resize', onResize);

  function render() {
    renderer.render(scene, camera);
  }

  function dispose() {
    window.removeEventListener('resize', onResize);
    // Per-session rig clones are disposed with the scene (ADR 0010 §6 /
    // 0011 Consequences) -- only the resources truckRig.dispose() actually
    // owns (fallback primitives + decal geometry); the shared cached source
    // geometry/materials in AssetRegistry and the cosmetic-manifest paint
    // materials are left untouched, exactly as intended (see truck-rig.ts's
    // TruckRigResult.dispose doc comment). Other primitive meshes elsewhere
    // in this module aren't individually disposed (a pre-existing gap, not
    // introduced here).
    truckRig.dispose();
    renderer.dispose();
    container.removeChild(renderer.domElement);
  }

  return {
    setTruckTransform,
    setTruckWheelMotion,
    upsertAnimal,
    removeAnimal,
    setFarmerTransform,
    farmerTired,
    farmerDespawn,
    flashTruck,
    upsertFuelPickup,
    collectFuelPickup,
    tickEffects,
    render,
    dispose,
  };
}
