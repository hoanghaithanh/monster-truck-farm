import * as THREE from 'three';
import type { ObstacleInstance, Vec2 } from '../core/types';
import type { TerrainBounds } from '../core/terrain';
import { clampCameraToBounds } from '../core/driving/boundary';
import type { AssetRegistry } from './assets/asset-registry';
import { createUpgradableObject, disposeObject3D } from './assets/upgradable-object';
import { TRUCK_GATE_ASSET_KEYS } from './assets/manifest';

// Chase camera stays this far inset from the ground plane's edge so a
// corner position never lets the camera see past the ground into the
// scene background/"void" (issue #17, drive AC4 intent).
const CAMERA_GROUND_MARGIN = 3;

// Farmer bump feedback (farmer AC5): a brief flash on the truck, distinct
// from the animal-boop reward feel and never scary/violent -- just "something
// happened to me". Decays back to the truck's base color over this duration.
const BUMP_FLASH_SECONDS = 0.3;
const TRUCK_BASE_COLOR = 0xff8c1a;
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

// PASS-1 INFRASTRUCTURE DEMO (ADR 0010): a small marker cube that proves the
// AssetRegistry + createUpgradableObject pipeline works end-to-end against a
// real loaded .glb in the running game -- primitive on frame 1, swapped in
// place for the ADR 0010 test-fixture model the moment it's ready, with no
// pop (see upgradable-object.ts). It is NOT a real gameplay object and has
// no consumer meaning yet; ADR 0011 replaces it with the actual truck
// body/wheel upgrade wiring once real truck models exist, at which point
// this demo can be deleted.
const DEMO_UPGRADE_PROBE_POSITION: Vec2 = { x: 4, z: 4 };
const DEMO_UPGRADE_PROBE_ASSET_KEY = TRUCK_GATE_ASSET_KEYS[0];

export function createGameScene(
  container: HTMLElement,
  bounds: TerrainBounds,
  obstacles: ObstacleInstance[],
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

  const truckMaterial = new THREE.MeshStandardMaterial({ color: TRUCK_BASE_COLOR });
  const truckMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 2), truckMaterial);
  truckMesh.position.y = 0.4;
  scene.add(truckMesh);
  let bumpFlashRemaining = 0;

  // PASS-1 INFRASTRUCTURE DEMO (see comment above createGameScene): starts
  // as a small primitive and upgrades in place once the fixture loads.
  const demoUpgradeProbe = (() => {
    if (!assetRegistry || !DEMO_UPGRADE_PROBE_ASSET_KEY) return undefined;
    const primitive = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x9b59b6 }),
    );
    primitive.position.set(DEMO_UPGRADE_PROBE_POSITION.x, 0.3, DEMO_UPGRADE_PROBE_POSITION.z);
    scene.add(primitive);
    return createUpgradableObject(scene, primitive);
  })();

  const animalMeshes = new Map<string, THREE.Object3D>();
  let farmerMesh: THREE.Mesh | undefined;
  let farmerMaterial: THREE.MeshStandardMaterial | undefined;
  const fuelMeshes = new Map<string, THREE.Object3D>();
  const fuelGlows: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; remaining: number }[] = [];

  function setTruckTransform(position: Vec2, heading: number): void {
    truckMesh.position.set(position.x, 0.4, position.z);
    truckMesh.rotation.y = heading;

    // Simple chase camera, offset behind the truck's heading. At terrain
    // corners this offset can extend past the finite ground plane, so the
    // camera's own (x,z) is pulled back in to stay over the ground — the
    // camera still looks at the truck, so it stays framed either way.
    const behind = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading)).multiplyScalar(6);
    const desiredCameraPos = { x: truckMesh.position.x + behind.x, z: truckMesh.position.z + behind.z };
    const cameraPos = clampCameraToBounds(desiredCameraPos, bounds, CAMERA_GROUND_MARGIN);
    camera.position.set(cameraPos.x, 5, cameraPos.z);
    camera.lookAt(truckMesh.position);
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

  /** Triggers the bump feedback flash (farmer AC5); decayed each frame in tickEffects. */
  function flashTruck(): void {
    bumpFlashRemaining = BUMP_FLASH_SECONDS;
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

  /** Per-frame visual-effect decay (bump flash + fuel glow bursts) -- called once per render frame from main.ts. */
  function tickEffects(dt: number): void {
    // PASS-1 INFRASTRUCTURE DEMO: upgrade the probe the moment its asset is
    // ready (ADR 0010 §4 "upgrade in place" -- checked, not pushed, so it
    // naturally fires on whichever frame the load settles, no matter when).
    if (demoUpgradeProbe && !demoUpgradeProbe.upgraded && assetRegistry && DEMO_UPGRADE_PROBE_ASSET_KEY) {
      const model = assetRegistry.get(DEMO_UPGRADE_PROBE_ASSET_KEY);
      if (model) demoUpgradeProbe.upgrade(model);
    }

    if (bumpFlashRemaining > 0) {
      bumpFlashRemaining = Math.max(0, bumpFlashRemaining - dt);
      const t = bumpFlashRemaining / BUMP_FLASH_SECONDS;
      truckMaterial.color.copy(new THREE.Color(TRUCK_FLASH_COLOR)).lerp(new THREE.Color(TRUCK_BASE_COLOR), 1 - t);
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
    // Per-session model clones are disposed with the scene (ADR 0010 §6) --
    // the shared cached source in AssetRegistry is left untouched, only this
    // session's clone. Existing primitive meshes elsewhere in this module
    // aren't individually disposed (a pre-existing gap, not introduced
    // here); this only covers what upgrade-in-place newly adds.
    if (demoUpgradeProbe?.upgraded) disposeObject3D(demoUpgradeProbe.current);
    renderer.dispose();
    container.removeChild(renderer.domElement);
  }

  return {
    setTruckTransform,
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
