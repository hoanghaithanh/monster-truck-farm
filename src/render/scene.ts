import * as THREE from 'three';
import type { ObstacleInstance, TruckBuild, TruckCosmetics, Vec2 } from '../core/types';
import type { StructureInstance, TerrainBounds } from '../core/terrain';
import { clampCameraToBounds } from '../core/driving/boundary';
import type { AssetRegistry } from './assets/asset-registry';
import { CHICKEN_ASSET_KEY, STRUCTURE_ASSET_KEYS, truckAssetKeysForBuild } from './assets/manifest';
import { createUpgradableObject, type UpgradableObject } from './assets/upgradable-object';
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

// Chicken sourced-art (issue #28): the sourced "Hen" glTF's raw geometry is
// baked at an unusual scale with no corrective node transform (measured raw
// bounding-box height ~77 units -- not meters, and not any tidy round
// number), so the corrective scale is *derived from the model's own
// measured bounding box* at load time (buildChickenDisplayModel below)
// rather than hand-picked as a magic constant -- robust if the asset is
// ever swapped for a different sourced model with different raw units.
// CHICKEN_TARGET_HEIGHT is the one tuned number: chosen to roughly match
// the previous BoxGeometry(0.5,0.5,0.5) primitive's footprint next to the
// truck/terrain -- confirmed by a live screenshot in the driving scene
// (small, farm-appropriately-sized, not clipping/floating/oversized).
const CHICKEN_TARGET_HEIGHT = 0.5;

/**
 * Wraps a freshly-cloned chicken source model (from `AssetRegistry.get`) in
 * a corrective group: re-centered and scaled (from the model's own measured
 * bounding box) so it renders at `CHICKEN_TARGET_HEIGHT` with its bounding
 * center at the wrapper's local origin -- matching how the primitive
 * `BoxGeometry(0.5,0.5,0.5)` it replaces is itself centered at its own
 * local origin. That means `upsertAnimal`'s existing
 * `mesh.position.set(x, 0.3, z)` call (made on the primitive, which
 * `UpgradableObject.upgrade()` then copies onto the object returned here)
 * needs no change to keep the chicken resting on the ground the same way
 * the box did.
 *
 * The correction lives on an *inner* group, not the returned outer one,
 * deliberately: `UpgradableObject.upgrade()` overwrites the position/
 * rotation/scale of whatever object it's given with the outgoing
 * primitive's own transform (see upgradable-object.ts), so a correction
 * applied directly to the returned object would be clobbered the instant
 * `upgrade()` runs.
 */
export function buildChickenDisplayModel(source: THREE.Object3D): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(source);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  source.position.sub(center);

  const scaleFactor = size.y > 0 ? CHICKEN_TARGET_HEIGHT / size.y : 1;
  const inner = new THREE.Group();
  inner.name = 'ChickenDisplayScale';
  inner.scale.setScalar(scaleFactor);
  inner.add(source);

  const outer = new THREE.Group();
  outer.name = 'ChickenModel';
  outer.add(inner);
  return outer;
}

// Structures (issue #46, ADR 0012 §2): always-solid scenery (windmill/barn/
// farmhouse/mountain), rendered via the same primitive-fallback ->
// AssetRegistry -> UpgradableObject pattern the chicken (issue #28)
// established. Unlike animals, structures are static (create-once, no
// per-frame position tracking) -- see createGameScene's structuresGroup
// below. 'mountain' added in the issue #47 redesign (ADR 0012 addendum,
// AC3a): the landmark mountain is just a fourth `StructureKind`, so it
// needs a fallback color/primitive shape here like the other three, but no
// new rendering machinery.
const STRUCTURE_PRIMITIVE_COLORS: Record<StructureInstance['kind'], number> = {
  windmill: 0xd8c9a3,
  barn: 0xb23a2f,
  farmhouse: 0xe8dcb8,
  mountain: 0x8a8a80,
};

/**
 * A simple, recognizable primitive stand-in for each structure kind (AC7's
 * "falls back to a simple placeholder"), sized off the structure's own
 * `footprintRadius` -- the same simplified-footprint sizing philosophy ADR
 * 0012 §2 uses for the physics collider, reused here for visual consistency.
 * Geometry is translated so the mesh's local origin sits at its *base*
 * (y=0), not its center -- unlike the small obstacle primitives above, a
 * multi-unit-tall building floating/sinking by half its height would be an
 * obvious defect, so both the primitive and (`buildStructureDisplayModel`
 * below) the corrected real model share this "local origin = ground contact
 * point" convention, letting `UpgradableObject.upgrade()`'s position-copy
 * behave correctly with no special-casing.
 */
function buildStructurePrimitive(structure: StructureInstance): THREE.Object3D {
  const r = structure.footprintRadius;
  let geometry: THREE.BufferGeometry;
  let height: number;
  if (structure.kind === 'windmill') {
    height = r * 3;
    geometry = new THREE.CylinderGeometry(r * 0.4, r * 0.7, height, 10);
  } else if (structure.kind === 'mountain') {
    // A cone reads as "mountain" at a glance far better than the generic
    // box fallback the other buildings use -- cheap and worth it since this
    // fallback is what a slow/failed asset load leaves on screen (AC7).
    // Height target matches the real model's derivation (terrain.ts's own
    // footprintRadius comment): ~3.46x the footprint radius gets close to
    // the ~16.3-unit target height for this structure's actual r=4.71.
    height = r * 3.46;
    geometry = new THREE.ConeGeometry(r, height, 12);
  } else {
    height = r * 1.6;
    geometry = new THREE.BoxGeometry(r * 2, height, r * 1.6);
  }
  geometry.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: STRUCTURE_PRIMITIVE_COLORS[structure.kind] }));
  mesh.position.set(structure.position.x, 0, structure.position.z);
  return mesh;
}

/**
 * Wraps a freshly-cloned structure source model (from `AssetRegistry.get`)
 * in a corrective group, following the same "derive the scale from the
 * model's own measured bounding box, don't hand-pick a magic constant"
 * pattern `buildChickenDisplayModel` established (issue #28) -- the three
 * sourced windmill/barn/farmhouse `.glb`s were each authored/exported at
 * their own unrelated raw scale (see the orchestrator's sourcing notes,
 * issue #46), so a single hardcoded scale constant would be wrong for at
 * least two of the three.
 *
 * Unlike the chicken (which centers on all three axes -- acceptable for a
 * small animal), this keeps the model's *base* at the wrapper's local
 * origin (only x/z are re-centered, not y) so a multi-unit-tall building
 * sits on the ground rather than floating/sinking by half its height --
 * matching `buildStructurePrimitive`'s "local origin = ground contact
 * point" convention above, so `UpgradableObject.upgrade()`'s position-copy
 * (primitive -> real model) requires no special-casing.
 *
 * `targetWidth` is the structure's own `footprintRadius * 2` (passed by the
 * caller) -- scaling anchored to the model's horizontal (max of X/Z) extent
 * so the visual footprint tracks the same authored constant the physics
 * collider uses, keeping the two from silently drifting apart.
 *
 * The correction lives on an *inner* group, not the returned outer one, for
 * the same reason `buildChickenDisplayModel` does: `UpgradableObject.upgrade()`
 * overwrites the outer object's position/rotation/scale with the outgoing
 * primitive's own transform, which would clobber a correction applied
 * directly to the returned object.
 *
 * Metalness override (2026-07-10, issue #47 mountain landmark follow-up):
 * the mountain model's sourced "Stone"/"Snow"/"Dirt" materials ship
 * `metallicFactor: 0.4` (vs. `0` on every other structure/asset in this
 * project -- barn/windmill/farmhouse/chicken/truck are all fully diffuse),
 * which under `MeshStandardMaterial`'s PBR model means that fraction of the
 * surface's appearance is expected to come from reflecting a scene
 * `envMap`. This project's lighting setup has no `envMap` (nothing else
 * needs one), so a nonzero metalness with no environment to reflect renders
 * visibly darker than it should -- confirmed via live before/after pixel
 * sampling (average brightness across the rendered silhouette rose ~36%
 * with this override applied). Forcing `metalness` to 0 on every material
 * of the loaded clone is a physically-motivated consistency fix matching
 * this project's diffuse-only material convention, not a recolor --
 * `color`/`roughness`/textures are untouched, and the source `.glb` on disk
 * is never modified (this only mutates the per-clone material instance
 * `AssetRegistry.get()` already hands the caller to own). Applied here
 * (generically, to every structure) rather than as a mountain-only special
 * case: it's a no-op for barn/windmill/farmhouse, which already ship
 * `metallicFactor: 0`.
 */
export function buildStructureDisplayModel(source: THREE.Object3D, targetWidth: number): THREE.Object3D {
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = child.material;
    if (Array.isArray(material)) {
      for (const m of material) {
        if (m instanceof THREE.MeshStandardMaterial) m.metalness = 0;
      }
    } else if (material instanceof THREE.MeshStandardMaterial) {
      material.metalness = 0;
    }
  });

  const box = new THREE.Box3().setFromObject(source);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  source.position.x -= center.x;
  source.position.z -= center.z;
  source.position.y -= box.min.y;

  const horizontalExtent = Math.max(size.x, size.z);
  const scaleFactor = horizontalExtent > 0 ? targetWidth / horizontalExtent : 1;
  const inner = new THREE.Group();
  inner.name = 'StructureDisplayScale';
  inner.scale.setScalar(scaleFactor);
  inner.add(source);

  const outer = new THREE.Group();
  outer.name = 'StructureModel';
  outer.add(inner);
  return outer;
}

// River (issue #47, ADR 0012 §3): a procedural flat ribbon following a
// simple polyline -- built entirely here, no external asset, no collider,
// no AssetRegistry involvement. Runs roughly along the terrain's north edge
// (z ~15-17), clear of the windmill/barn/farmhouse (issue #46, at (12,12)/
// (-12,-10)/(10,-12)) and the bush/rock/derelict-car obstacles (all south of
// z=4) -- see the issue #47 hand-off notes for the placement rationale.
const RIVER_COLOR = 0x2f7fb8;
const RIVER_SURFACE_Y = 0.03; // just above the ground plane (y=0) to avoid z-fighting.
const RIVER_WIDTH = 3;
const RIVER_ROUTE: Vec2[] = [
  { x: -18, z: 16 },
  { x: -8, z: 15 },
  { x: 2, z: 16.5 },
  { x: 18, z: 15.5 },
];

/**
 * Builds a flat triangle-strip ribbon following `route`, `width` units wide,
 * laid at `RIVER_SURFACE_Y`. Each vertex's left/right offset is the local
 * segment normal (averaged from the adjacent segments at interior points),
 * so the ribbon follows gentle bends in the route without gapping.
 *
 * Defensive per AC7 ("degrade gracefully if e.g. terrain data is
 * malformed"): a route with fewer than 2 points can't form a ribbon, so this
 * returns an empty (childless) group instead of building degenerate/empty
 * geometry -- caller just adds it to the scene like any other object3D, no
 * special-casing needed, and nothing crashes.
 */
export function buildRiverMesh(route: Vec2[], width: number): THREE.Object3D {
  if (route.length < 2) return new THREE.Group();

  const positions: number[] = [];
  for (let i = 0; i < route.length; i++) {
    const prev = route[i - 1] ?? route[i];
    const next = route[i + 1] ?? route[i];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const segLength = Math.hypot(dx, dz) || 1;
    // Left-hand normal of the local direction, in the XZ plane.
    const nx = -dz / segLength;
    const nz = dx / segLength;
    const halfWidth = width / 2;
    positions.push(route[i].x + nx * halfWidth, RIVER_SURFACE_Y, route[i].z + nz * halfWidth);
    positions.push(route[i].x - nx * halfWidth, RIVER_SURFACE_Y, route[i].z - nz * halfWidth);
  }

  const indices: number[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    indices.push(a, b, c, b, d, c);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: RIVER_COLOR,
    transparent: true,
    opacity: 0.85,
    // DoubleSide (not the default FrontSide): the ribbon's triangle winding
    // depends on the route's direction/curvature, and a flat horizontal
    // strip built from an arbitrary polyline can easily end up with a
    // downward-facing normal for a given segment (confirmed empirically --
    // the initial FrontSide version rendered invisible from the chase
    // camera, which always looks down at the ground, even though the mesh
    // was correctly present in the scene graph). Double-siding is the
    // robust fix rather than hand-deriving a winding-order rule that would
    // only hold for this specific RIVER_ROUTE and break if it's edited.
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geometry, material);
}

export function createGameScene(
  container: HTMLElement,
  bounds: TerrainBounds,
  obstacles: ObstacleInstance[],
  structures: StructureInstance[],
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

  // Structures (issue #46, ADR 0012 §2): created once at scene setup (static
  // scenery, no per-frame position tracking needed unlike animals) -- each
  // gets its own UpgradableObject starting as the primitive placeholder
  // (AC7), upgraded in place the moment its manifest key reports 'ready'
  // (checked in tickEffects below, mirroring upsertAnimal's chicken check).
  const structureSlots: { structure: StructureInstance; slot: UpgradableObject }[] = [];
  for (const structure of structures) {
    const primitive = buildStructurePrimitive(structure);
    scene.add(primitive);
    structureSlots.push({ structure, slot: createUpgradableObject(scene, primitive) });
  }

  // River (issue #47, ADR 0012 §3): pure procedural geometry, created once
  // here -- no loading, no fallback concern (buildRiverMesh's own empty-
  // group guard covers a malformed/degenerate route per AC7).
  scene.add(buildRiverMesh(RIVER_ROUTE, RIVER_WIDTH));

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

  // Each animal instance gets its own UpgradableObject (issue #28): starts
  // as the permanent-baseline primitive box (AC13's "never crash, falls
  // back to existing primitive" -- unchanged even after the chicken model
  // ships), upgraded in place to its own clone of the sourced chicken model
  // the moment AssetRegistry reports it ready (AssetRegistry.get() returns
  // a fresh clone per call, per its own doc comment -- required here since
  // multiple animals can be on screen at once).
  const animalSlots = new Map<string, UpgradableObject>();
  let farmerMesh: THREE.Mesh | undefined;
  let farmerMaterial: THREE.MeshStandardMaterial | undefined;
  const fuelMeshes = new Map<string, THREE.Object3D>();
  const fuelGlows: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; remaining: number }[] = [];

  function setTruckTransform(
    position: Vec2,
    heading: number,
    climb?: { lift: number; pitch: number; roll: number },
  ): void {
    // Obstacle climb (issue #42, ADR 0013): a dumb adapter over numbers
    // computed in core/driving/obstacle-climb.ts -- this function never
    // computes the climb itself or reads obstacle data. When `climb` is
    // omitted, behavior is pixel-identical to before this feature (lift 0,
    // no pitch/roll), so the builder preview and any other caller of this
    // function are unaffected.
    const lift = climb?.lift ?? 0;
    const pitch = climb?.pitch ?? 0;
    const roll = climb?.roll ?? 0;
    truckRig.group.position.set(position.x, lift, position.z);
    // 'YXZ' Euler order: heading (Y) applies first, then pitch about the
    // rig's already-yawed local X axis, then roll -- so the tilt reads
    // correctly in the truck's own body frame at any heading.
    truckRig.group.rotation.set(pitch, heading, roll, 'YXZ');

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
    let slot = animalSlots.get(id);
    if (!slot) {
      const primitive = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshStandardMaterial({ color: 0xfff2a8 }),
      );
      scene.add(primitive);
      slot = createUpgradableObject(scene, primitive);
      animalSlots.set(id, slot);
    }
    slot.current.position.set(position.x, 0.3, position.z);

    // Chicken sourced-art upgrade-in-place (issue #28, ADR 0010 §4/§7):
    // status() is a cheap map lookup -- checked every call while not yet
    // upgraded, but a clone (assetRegistry.get()) is only ever taken once
    // it's actually ready, and this stops checking entirely the moment
    // `slot.upgraded` flips true (mirrors this module's own
    // `rigNeedsRecheck` pattern for the truck rig, below).
    if (!slot.upgraded && assetRegistry?.status(CHICKEN_ASSET_KEY) === 'ready') {
      const source = assetRegistry.get(CHICKEN_ASSET_KEY);
      if (source) slot.upgrade(buildChickenDisplayModel(source));
    }
  }

  function removeAnimal(id: string): void {
    const slot = animalSlots.get(id);
    if (!slot) return;
    // No dispose() call here -- a pre-existing gap for the primitive case
    // (see this module's dispose() doc comment on "other primitive meshes
    // elsewhere in this module aren't individually disposed"), and
    // deliberately *not* extended to the upgraded case either: an upgraded
    // slot's `current` is a clone whose geometry/material are shared by
    // reference with every other clone of the same loaded source (see
    // truck-rig.ts's TruckRigResult.dispose doc comment for the same
    // hazard) -- disposing them here would free GPU resources still in use
    // by any other animal's own chicken clone.
    scene.remove(slot.current);
    animalSlots.delete(id);
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
    // Structure sourced-art upgrade-in-place (issue #46, ADR 0010 §4/§7):
    // same cheap status()-check-then-upgrade-once pattern as upsertAnimal's
    // chicken check -- stops checking a given structure the moment its slot
    // is upgraded.
    if (assetRegistry) {
      for (const { structure, slot } of structureSlots) {
        if (slot.upgraded) continue;
        const assetKey = STRUCTURE_ASSET_KEYS[structure.kind];
        if (assetRegistry.status(assetKey) !== 'ready') continue;
        const source = assetRegistry.get(assetKey);
        if (source) slot.upgrade(buildStructureDisplayModel(source, structure.footprintRadius * 2));
      }
    }

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
