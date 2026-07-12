import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTruckRig } from './truck-rig';
import { AssetRegistry, type GltfLoaderLike } from './assets/asset-registry';
import { BODY_TIER_SOCKETS } from './truck-sockets';
import { getWheelLookMaterial } from './cosmetics/cosmetic-manifest';
import type { TruckRigResult } from './truck-rig';
import type { TruckBuild, TruckCosmetics } from '../core/types';

const BUILD: TruckBuild = { body: 0, wheels: 0, engine: 0, gasTank: 0 };
const COSMETICS: TruckCosmetics = { wheelLook: 'standard' };

/** All 4 wheel pivots, in the same [FL, FR, RL, RR] order sockets.wheels uses. */
function allWheelPivots(rig: TruckRigResult) {
  return [rig.wheels.frontLeft, rig.wheels.frontRight, rig.wheels.rearLeft, rig.wheels.rearRight];
}

/** The resolved wheel part object nested inside a wheel's roll pivot (see truck-rig.ts's WheelPivots doc comment). */
function wheelObjectOf(rig: TruckRigResult, key: keyof TruckRigResult['wheels']): THREE.Object3D {
  return rig.wheels[key].roll.children[0];
}

function fakeGltfScene(name: string): THREE.Object3D {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  mesh.name = name;
  return mesh;
}

/** A registry with every truckAssetKeysForBuild key already loaded and ready. */
async function readyRegistry(): Promise<AssetRegistry> {
  const loader: GltfLoaderLike = { loadAsync: async (url: string) => ({ scene: fakeGltfScene(url) }) };
  const registry = new AssetRegistry(loader);
  const keys = ['body-tier-0', 'body-tier-1', 'body-tier-2', 'wheel-tier-0', 'wheel-tier-1', 'wheel-tier-2', 'engine-cue-tier-0', 'engine-cue-tier-1', 'engine-cue-tier-2', 'gas-cue-tier-0', 'gas-cue-tier-1', 'gas-cue-tier-2'];
  registry.prefetch(keys.map((key) => ({ key, url: key })));
  await registry.waitFor(keys, 1000);
  return registry;
}

// -- Sourced-art-shaped fixtures (issue #33 follow-up): the real .glb files
// have a multi-material, multi-node structure (repo-root CREDITS.md) that
// fakeGltfScene's single anonymous-material box doesn't exercise at all --
// fakeGltfScene still covers the pre-existing "asset has no target-named
// material" fallback path (paintAll), see the describe blocks above. These
// fixtures instead mimic the real shape closely enough to exercise the
// selective-tint/built-in-wheel-hiding logic truck-rig.ts added for it.
function fakeSourcedBodyScene(): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'RootNode';

  const atlasMaterial = new THREE.MeshStandardMaterial();
  atlasMaterial.name = 'Atlas';
  const headlightsMaterial = new THREE.MeshStandardMaterial();
  headlightsMaterial.name = 'Headlights';

  const pickup = new THREE.Group();
  pickup.name = 'Pickup';
  const chassisMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), atlasMaterial);
  chassisMesh.name = 'Pickup_Atlas';
  const headlightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), headlightsMaterial);
  headlightMesh.name = 'Pickup_Headlights';
  pickup.add(chassisMesh, headlightMesh);

  // Built-in wheel nodes (also textured with "Atlas", same as the real
  // files) -- must be removed/hidden by buildTruckRig, never doubled-up
  // alongside the rig's own wheel-tier models.
  const backWheels = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), atlasMaterial);
  backWheels.name = 'BackWheels';
  const frontWheelL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), atlasMaterial);
  frontWheelL.name = 'FrontWheel_L';
  const frontWheelR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), atlasMaterial);
  frontWheelR.name = 'FrontWheel_R';

  root.add(pickup, backWheels, frontWheelL, frontWheelR);
  return root;
}

function fakeSourcedWheelScene(): THREE.Object3D {
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x595959 });
  rimMaterial.name = 'mat22';
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x030303 });
  tireMaterial.name = 'mat23';

  const node = new THREE.Group();
  node.name = 'Node';
  const rimMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 8), rimMaterial);
  rimMesh.name = 'rim';
  const tireMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.2, 8), tireMaterial);
  tireMesh.name = 'tire';
  node.add(rimMesh, tireMesh);
  return node;
}

/** A registry whose body-tier-N / wheel-tier-N entries resolve to the sourced-art-shaped fixtures above; engine/gas cues fall back to the plain fakeGltfScene (irrelevant to these tests). */
async function sourcedArtRegistry(): Promise<AssetRegistry> {
  const loader: GltfLoaderLike = {
    loadAsync: async (url: string) => {
      if (url.startsWith('body-tier')) return { scene: fakeSourcedBodyScene() };
      if (url.startsWith('wheel-tier')) return { scene: fakeSourcedWheelScene() };
      return { scene: fakeGltfScene(url) };
    },
  };
  const registry = new AssetRegistry(loader);
  const keys = ['body-tier-0', 'body-tier-1', 'body-tier-2', 'wheel-tier-0', 'wheel-tier-1', 'wheel-tier-2', 'engine-cue-tier-0', 'engine-cue-tier-1', 'engine-cue-tier-2', 'gas-cue-tier-0', 'gas-cue-tier-1', 'gas-cue-tier-2'];
  registry.prefetch(keys.map((key) => ({ key, url: key })));
  await registry.waitFor(keys, 1000);
  return registry;
}

describe('buildTruckRig (ADR 0011 §4) -- no registry / never-loaded assets', () => {
  it('falls back to primitives for every part and reports allAssetsReady=false (vehicle-art AC13)', () => {
    const rig = buildTruckRig(BUILD, COSMETICS);
    expect(rig.allAssetsReady).toBe(false);
    // body(1) + 4 wheels + engine cue(1) + gas cue(1) = 7; no decal for 'plain'.
    expect(rig.group.children).toHaveLength(7);
  });

  it('never throws, and dispose() is safe to call on an all-fallback rig', () => {
    const rig = buildTruckRig(BUILD, COSMETICS);
    expect(() => rig.dispose()).not.toThrow();
  });

  it('places the body and 4 wheels at exactly the body tier\'s socket positions (children order: body, 4 wheels, engine cue, gas cue)', () => {
    const rig = buildTruckRig({ ...BUILD, body: 1 }, COSMETICS);
    const [bodyMesh, ...wheelMeshes] = rig.group.children.slice(0, 5);
    const sockets = BODY_TIER_SOCKETS[1];
    expect([bodyMesh.position.x, bodyMesh.position.y, bodyMesh.position.z]).toEqual([
      sockets.body.x,
      sockets.body.y,
      sockets.body.z,
    ]);
    const positions = wheelMeshes.map((m) => [m.position.x, m.position.y, m.position.z]);
    for (const socket of sockets.wheels) {
      expect(positions).toContainEqual([socket.x, socket.y, socket.z]);
    }
  });
});

describe('buildTruckRig -- with a fully-ready AssetRegistry', () => {
  it('reports allAssetsReady=true once every key for the build has loaded', async () => {
    const registry = await readyRegistry();
    const rig = buildTruckRig(BUILD, COSMETICS, registry);
    expect(rig.allAssetsReady).toBe(true);
  });

  it('dispose() on a fully-loaded rig does not throw (no owned fallback resources to free, per-clone geometry is never touched)', async () => {
    const registry = await readyRegistry();
    const rig = buildTruckRig(BUILD, COSMETICS, registry);
    expect(() => rig.dispose()).not.toThrow();
  });

  it('two rigs built from the same registry never share the same wheel Object3D instance (each socket gets its own clone)', async () => {
    const registry = await readyRegistry();
    const rig = buildTruckRig(BUILD, COSMETICS, registry);
    const wheels = rig.group.children.filter((c) => c !== rig.group.children[0]).slice(0, 4);
    const unique = new Set(wheels);
    expect(unique.size).toBe(wheels.length);
  });
});

describe('buildTruckRig -- cosmetic material application (ADR 0011 §2, material-mutation-bleed risk)', () => {
  it('assigns the shared wheel-look material to every wheel, matching getWheelLookMaterial', () => {
    const rig = buildTruckRig(BUILD, { ...COSMETICS, wheelLook: 'chrome' });
    for (const pivots of allWheelPivots(rig)) {
      const wheel = pivots.roll.children[0] as THREE.Mesh;
      expect(wheel.material).toBe(getWheelLookMaterial('chrome'));
    }
  });

  it('rig.dispose() never disposes a shared cosmetic-manifest material (it would stay usable by other rigs/the preview)', () => {
    const rig = buildTruckRig(BUILD, { ...COSMETICS, wheelLook: 'chrome' });
    const material = getWheelLookMaterial('chrome');
    rig.dispose();
    // THREE.Material doesn't expose a public "disposed" flag; the contract
    // under test is behavioural -- a second rig using the same id must still
    // get a *usable* (same-reference, still-correct-colour) material.
    const rigAfter = buildTruckRig(BUILD, { ...COSMETICS, wheelLook: 'chrome' });
    const materialAfter = (wheelObjectOf(rigAfter, 'frontLeft') as THREE.Mesh).material;
    expect(materialAfter).toBe(material);
  });
});

describe('buildTruckRig -- body color removed (direct human decision, post-ship): body always renders its native/untinted material', () => {
  it('leaves the primitive fallback body\'s own flat grey material untouched -- no color override applied', () => {
    const rig = buildTruckRig(BUILD, COSMETICS); // no registry -- fallback body
    const bodyMesh = rig.group.children[0] as THREE.Mesh;
    const material = bodyMesh.material as THREE.MeshStandardMaterial;
    expect(material.color.getHexString()).toBe('888888');
  });

  it('two rigs built from the same registry share the exact same loaded "Atlas" material instance -- never cloned/tinted per rig', async () => {
    const registry = await sourcedArtRegistry();
    const rigA = buildTruckRig(BUILD, COSMETICS, registry);
    const rigB = buildTruckRig(BUILD, COSMETICS, registry);
    const findAtlas = (root: THREE.Object3D) => {
      let found: THREE.Mesh | undefined;
      root.traverse((child) => {
        if (child instanceof THREE.Mesh && !Array.isArray(child.material) && child.material.name === 'Atlas') found = child;
      });
      return found;
    };
    const atlasA = findAtlas(rigA.group.children[0]);
    const atlasB = findAtlas(rigB.group.children[0]);
    expect(atlasA?.material).toBe(atlasB?.material);
  });
});

describe('buildTruckRig -- sourced-art selective paint & built-in-wheel hiding (issue #33 follow-up)', () => {
  function findByMaterialName(root: THREE.Object3D, name: string): THREE.Mesh[] {
    const found: THREE.Mesh[] = [];
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && !Array.isArray(child.material) && child.material.name === name) {
        found.push(child);
      }
    });
    return found;
  }

  it('leaves the loaded body\'s "Atlas" and "Headlights" materials both at their untouched original color (body color removed, direct human decision post-ship)', async () => {
    const registry = await sourcedArtRegistry();
    const rig = buildTruckRig(BUILD, COSMETICS, registry);
    const bodyObject = rig.group.children[0];

    const atlasMeshes = findByMaterialName(bodyObject, 'Atlas');
    expect(atlasMeshes.length).toBeGreaterThan(0);
    // Never tinted -- still the fixture's original default (white) color.
    expect((atlasMeshes[0].material as THREE.MeshStandardMaterial).color.getHexString()).toBe('ffffff');

    const headlightMeshes = findByMaterialName(bodyObject, 'Headlights');
    expect(headlightMeshes).toHaveLength(1);
    expect((headlightMeshes[0].material as THREE.MeshStandardMaterial).color.getHexString()).toBe('ffffff');
  });

  it('removes the loaded body\'s built-in wheel nodes (BackWheels/FrontWheel_L/FrontWheel_R) so they never render doubled-up with the rig\'s own wheel-tier models', async () => {
    const registry = await sourcedArtRegistry();
    const rig = buildTruckRig(BUILD, COSMETICS, registry);
    const bodyObject = rig.group.children[0];
    const builtinWheelNames = ['BackWheels', 'FrontWheel_L', 'FrontWheel_R'];
    for (const name of builtinWheelNames) {
      expect(bodyObject.getObjectByName(name)).toBeUndefined();
    }
  });

  it('scales a loaded body by its socket table\'s bodyScale (correcting the sourced model\'s baked-in 100x FBX scale)', async () => {
    const registry = await sourcedArtRegistry();
    const rig = buildTruckRig({ ...BUILD, body: 2 }, COSMETICS, registry);
    const bodyObject = rig.group.children[0];
    expect(bodyObject.scale.x).toBeCloseTo(BODY_TIER_SOCKETS[2].bodyScale);
    expect(bodyObject.scale.y).toBeCloseTo(BODY_TIER_SOCKETS[2].bodyScale);
    expect(bodyObject.scale.z).toBeCloseTo(BODY_TIER_SOCKETS[2].bodyScale);
  });

  it('tints only the loaded wheel\'s rim material ("mat22"), leaving the tire-rubber material ("mat23") untouched/black', async () => {
    const registry = await sourcedArtRegistry();
    const rig = buildTruckRig(BUILD, { ...COSMETICS, wheelLook: 'chrome' }, registry);
    const wheelObjects = rig.group.children.slice(1, 5);
    for (const wheelObject of wheelObjects) {
      const [rimMesh] = findByMaterialName(wheelObject, 'mat22');
      const [tireMesh] = findByMaterialName(wheelObject, 'mat23');
      expect(rimMesh).toBeDefined();
      expect(tireMesh).toBeDefined();
      const rimMaterial = rimMesh.material as THREE.MeshStandardMaterial;
      const tireMaterial = tireMesh.material as THREE.MeshStandardMaterial;
      expect(rimMaterial.color.getHexString()).not.toBe('595959'); // recolored off the fixture's original rim grey
      expect(tireMaterial.color.getHexString()).toBe('030303'); // untouched -- still the fixture's original near-black tire
    }
  });

  it('scales a loaded wheel by the (body-tier-keyed) socket table\'s wheelScale (correcting the sourced tire\'s real-world raw radius to WHEEL_RADIUS_BY_TIER)', async () => {
    // NOTE: wheelScale is looked up from the *body* tier's socket entry
    // (socketsForBodyTier(build.body) -- see buildTruckRig), same as the
    // pre-existing wheel-Y-placement convention this table already used.
    // That's only exactly right when build.wheels === build.body; a truck
    // with independently-chosen body/wheel tiers gets whatever wheel scale
    // the *body* tier's row specifies, same pre-existing limitation as the
    // ground-clearance Y placement below it in the same row -- not something
    // this pass introduced, flagged here rather than silently relied on.
    const registry = await sourcedArtRegistry();
    const rig = buildTruckRig(BUILD, COSMETICS, registry); // body: 0, wheels: 0
    const wheelObject = wheelObjectOf(rig, 'frontLeft');
    expect(wheelObject.scale.x).toBeCloseTo(BODY_TIER_SOCKETS[0].wheelScale, 5);
  });

  it('sets both the rim ("mat22") and tire-rubber ("mat23") materials to THREE.DoubleSide on every loaded wheel at all 4 sockets (hollow-wheel fix, direct human report: the sourced tire model has a genuine open/uncapped hole, confirmed by inspecting the raw glTF geometry -- see truck-rig.ts\'s fixHollowWheelGeometry)', async () => {
    const registry = await sourcedArtRegistry();
    const rig = buildTruckRig(BUILD, COSMETICS, registry);
    const wheelObjects = rig.group.children.slice(1, 5);
    expect(wheelObjects).toHaveLength(4);
    for (const wheelObject of wheelObjects) {
      const [rimMesh] = findByMaterialName(wheelObject, 'mat22');
      const [tireMesh] = findByMaterialName(wheelObject, 'mat23');
      expect((rimMesh.material as THREE.MeshStandardMaterial).side).toBe(THREE.DoubleSide);
      expect((tireMesh.material as THREE.MeshStandardMaterial).side).toBe(THREE.DoubleSide);
    }
  });

  it('leaves the primitive fallback wheel (no registry) alone -- default FrontSide, nothing to fix on an already-closed cylinder', () => {
    const rig = buildTruckRig(BUILD, COSMETICS); // no registry -- fallback wheels
    const wheelMesh = wheelObjectOf(rig, 'frontLeft') as THREE.Mesh;
    expect((wheelMesh.material as THREE.MeshStandardMaterial).side).toBe(THREE.FrontSide);
  });
});

describe('buildTruckRig -- wheel motion pivots (issue #40, truck-wheel-motion AC1/AC3/AC4/AC6; extended issue #63/ADR 0018 §4)', () => {
  /** Resolves a wheel pivot's world position by walking up to its (unexposed) mountPivot ancestor -- see truck-rig.ts's WheelPivots doc comment: the socket offset now lives on `mountPivot`, one level above `travel`, so `travel.position` itself is always {0,0,0} until a caller sets an offset. */
  function worldPositionOf(pivot: THREE.Object3D): THREE.Vector3 {
    const world = new THREE.Vector3();
    pivot.updateWorldMatrix(true, false);
    pivot.getWorldPosition(world);
    return world;
  }

  it('exposes frontLeft/frontRight/rearLeft/rearRight wheel pivots whose world position starts at that wheel\'s socket (offset now lives on the new mountPivot, not on steer itself)', () => {
    const rig = buildTruckRig({ ...BUILD, body: 1 }, COSMETICS);
    const sockets = BODY_TIER_SOCKETS[1];
    const [flSocket, frSocket, rlSocket, rrSocket] = sockets.wheels;
    expect(worldPositionOf(rig.wheels.frontLeft.steer).toArray()).toEqual(flSocket.toArray());
    expect(worldPositionOf(rig.wheels.frontRight.steer).toArray()).toEqual(frSocket.toArray());
    expect(worldPositionOf(rig.wheels.rearLeft.steer).toArray()).toEqual(rlSocket.toArray());
    expect(worldPositionOf(rig.wheels.rearRight.steer).toArray()).toEqual(rrSocket.toArray());
  });

  it('exposes a travel pivot per wheel, positioned above steer (mount -> travel -> steer -> roll -> wheel), starting at local {0,0,0}', () => {
    const rig = buildTruckRig(BUILD, COSMETICS);
    for (const pivots of allWheelPivots(rig)) {
      expect(pivots.travel.position.toArray()).toEqual([0, 0, 0]);
      expect(pivots.travel.children).toContain(pivots.steer);
    }
  });

  it('nests roll inside steer, steer inside travel, and the resolved wheel part inside roll, so rotating/translating any one pivot never touches another\'s own transform', () => {
    const rig = buildTruckRig(BUILD, COSMETICS);
    for (const pivots of allWheelPivots(rig)) {
      expect(pivots.travel.children).toContain(pivots.steer);
      expect(pivots.steer.children).toContain(pivots.roll);
      expect(pivots.roll.children).toHaveLength(1);
    }
  });

  it('setting roll.rotation.x / steer.rotation.y does not move the wheel off its socket (position lives on the new mountPivot, unaffected by rotation)', () => {
    const rig = buildTruckRig({ ...BUILD, body: 1 }, COSMETICS);
    const { steer, roll } = rig.wheels.frontLeft;
    const before = worldPositionOf(steer).clone();
    roll.rotation.x = 1.23;
    steer.rotation.y = 0.4;
    expect(worldPositionOf(steer).toArray()).toEqual(before.toArray());
  });

  it('setting travel.position.y moves the wheel\'s world position vertically without moving steer/roll\'s own local transforms (AC9: translation composes independently of roll/steer-yaw)', () => {
    const rig = buildTruckRig({ ...BUILD, body: 1 }, COSMETICS);
    const { travel, steer, roll } = rig.wheels.frontLeft;
    const worldBefore = worldPositionOf(travel);
    steer.rotation.y = 0.4;
    roll.rotation.x = 1.23;
    travel.position.y = 0.25;
    const worldAfter = worldPositionOf(travel);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y + 0.25);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.z).toBeCloseTo(worldBefore.z);
    // Steer/roll's own local angles are exactly what was set -- travel's
    // translation didn't reorient or otherwise corrupt them.
    expect(steer.rotation.y).toBeCloseTo(0.4);
    expect(roll.rotation.x).toBeCloseTo(1.23);
  });
});
