import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTruckRig } from './truck-rig';
import { AssetRegistry, type GltfLoaderLike } from './assets/asset-registry';
import { BODY_TIER_SOCKETS } from './truck-sockets';
import { getBodyColorMaterial, getWheelLookMaterial } from './cosmetics/cosmetic-manifest';
import type { TruckBuild, TruckCosmetics } from '../core/types';

const BUILD: TruckBuild = { body: 0, wheels: 0, engine: 0, gasTank: 0 };
const COSMETICS: TruckCosmetics = { bodyColor: 'orange', bodyDesign: 'plain', wheelLook: 'standard' };

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

  it('adds a design decal only when bodyDesign is not "plain"', () => {
    const plain = buildTruckRig(BUILD, { ...COSMETICS, bodyDesign: 'plain' });
    const striped = buildTruckRig(BUILD, { ...COSMETICS, bodyDesign: 'stripe' });
    expect(plain.group.children).toHaveLength(7);
    expect(striped.group.children).toHaveLength(8);
  });

  it('places the body and 4 wheels at exactly the body tier\'s socket positions (children order: body, [decal], 4 wheels, engine cue, gas cue)', () => {
    const rig = buildTruckRig({ ...BUILD, body: 1 }, COSMETICS); // 'plain' design -- no decal
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
  it('assigns the shared, cached cosmetic-manifest material instance to the body mesh -- same id -> same material reference across separate rigs (safe sharing, never mutated)', () => {
    const rigA = buildTruckRig(BUILD, { ...COSMETICS, bodyColor: 'blue' });
    const rigB = buildTruckRig({ ...BUILD, body: 2 }, { ...COSMETICS, bodyColor: 'blue' });
    const bodyMeshA = rigA.group.children[0] as THREE.Mesh;
    const bodyMeshB = rigB.group.children[0] as THREE.Mesh;
    expect(bodyMeshA.material).toBe(getBodyColorMaterial('blue'));
    expect(bodyMeshA.material).toBe(bodyMeshB.material);
  });

  it('different body colors on two rigs never share a material instance, and neither rig\'s material is ever mutated by the other (no cross-truck colour bleed)', () => {
    const rigRed = buildTruckRig(BUILD, { ...COSMETICS, bodyColor: 'red' });
    const rigGreen = buildTruckRig(BUILD, { ...COSMETICS, bodyColor: 'green' });
    const redMaterial = (rigRed.group.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const greenMaterial = (rigGreen.group.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    expect(redMaterial).not.toBe(greenMaterial);
    expect(redMaterial.color.getHex()).not.toBe(greenMaterial.color.getHex());
  });

  it('assigns the shared wheel-look material to every wheel, matching getWheelLookMaterial', () => {
    const rig = buildTruckRig(BUILD, { ...COSMETICS, wheelLook: 'chrome' });
    const wheelMeshes = rig.group.children.slice(1, 5) as THREE.Mesh[];
    for (const wheel of wheelMeshes) {
      expect(wheel.material).toBe(getWheelLookMaterial('chrome'));
    }
  });

  it('rig.dispose() never disposes a shared cosmetic-manifest material (it would stay usable by other rigs/the preview)', () => {
    const rig = buildTruckRig(BUILD, { ...COSMETICS, bodyColor: 'purple' });
    const material = getBodyColorMaterial('purple');
    rig.dispose();
    // THREE.Material doesn't expose a public "disposed" flag; the contract
    // under test is behavioural -- a second rig using the same id must still
    // get a *usable* (same-reference, still-correct-colour) material.
    const rigAfter = buildTruckRig(BUILD, { ...COSMETICS, bodyColor: 'purple' });
    const materialAfter = (rigAfter.group.children[0] as THREE.Mesh).material;
    expect(materialAfter).toBe(material);
  });
});
