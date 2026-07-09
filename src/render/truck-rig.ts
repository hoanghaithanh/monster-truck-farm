// buildTruckRig (ADR 0011 §4): assembles the truck from parts at render
// time -- body + 4 wheels at sockets + engine cue + gas-tank cue -- so the
// four build axes vary independently, and cosmetics apply as material swaps
// on top. Called from exactly two places (scene.ts's driving-scene truck,
// and the builder's live 3D preview) so "preview matches driving" (AC4,
// cosmetics AC8) holds by construction: there is only one assembly path.
import * as THREE from 'three';
import type { TruckBuild, TruckCosmetics } from '../core/types';
import type { AssetRegistry } from './assets/asset-registry';
import { bodyAssetKey, engineCueAssetKey, gasCueAssetKey, wheelAssetKey } from './assets/manifest';
import { socketsForBodyTier } from './truck-sockets';
import { buildDesignDecal, getBodyColorMaterial, getWheelLookMaterial } from './cosmetics/cosmetic-manifest';

export interface TruckRigResult {
  /** The assembled truck -- add this to a scene/preview and position/rotate it as a unit. */
  group: THREE.Group;
  /**
   * True once every geometry asset this rig needed (body/wheels/engine
   * cue/gas cue for this exact build) was loaded from the AssetRegistry --
   * false if any part is still showing a primitive placeholder (vehicle-art
   * AC13 / ADR 0010 §7). Callers that want "upgrade in place" once loading
   * finishes (e.g. scene.ts, if the bounded gate timed out before this
   * build's assets settled) can rebuild while this is false and stop once
   * it flips true.
   */
  allAssetsReady: boolean;
  /**
   * Frees exactly the GPU resources *this rig instance* exclusively owns --
   * NOT a blind `object.traverse()` dispose (ADR 0011 Consequences/Risks'
   * "get the clone granularity right" warning). This matters because
   * `THREE.Object3D.clone()` (what `AssetRegistry.get()` returns) copies
   * `mesh.geometry`/`mesh.material` *by reference*, not a deep clone -- every
   * clone of "wheel-tier-2", for instance, shares one `BufferGeometry`
   * instance (all 4 wheels on this truck, every other truck, and the
   * builder preview). Disposing a loaded part's geometry/material here would
   * free GPU resources still in use elsewhere. Only the primitive-fallback
   * geometries/materials (created fresh per call, never shared) and the
   * cosmetic design-decal's geometry (also fresh per call; its *material* is
   * a shared cosmetic-manifest instance and is deliberately left alone) are
   * tracked and disposed. Loaded parts' geometry, and every cosmetic paint
   * material (shared, read-only, cached in cosmetic-manifest.ts), are never
   * touched -- they persist for the app's lifetime by design (ADR 0010 §6).
   */
  dispose(): void;
}

// Fallback primitives (ADR 0010 §7's "primitive is the permanent baseline"):
// used per-part when that part's asset isn't ready yet (still loading,
// failed, or no registry at all -- e.g. a Vitest/non-browser context).
// Dimensioned to roughly match the real body-tier-0/wheel-tier-0 models so a
// fallback truck doesn't look wildly different in scale from the real one.
// Each call creates its own fresh geometry/material (never shared) so it's
// always safe for a rig to dispose its own fallback parts.
function fallbackBody(): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 1.8), new THREE.MeshStandardMaterial({ color: 0x888888 }));
}
function fallbackWheel(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.22, 12),
    new THREE.MeshStandardMaterial({ color: 0x222222 }),
  );
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}
function fallbackCue(): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), new THREE.MeshStandardMaterial({ color: 0x888888 }));
}

/** Assigns `material` to every Mesh in `object`'s hierarchy -- used to paint a whole loaded part uniformly (body/wheel models are single-material low-poly shapes; see scripts/generate-truck-art.mjs). Only replaces the reference; never disposes the material it's replacing (that material may be the shared source's, still needed by other clones). */
function paintAll(object: THREE.Object3D, material: THREE.Material): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) child.material = material;
  });
}

interface ResolvedPart {
  object: THREE.Object3D;
  usedFallback: boolean;
}

/**
 * Loads a part from the registry if ready, else returns a primitive
 * fallback -- and reports which happened via `usedFallback`, so the caller
 * can track `allAssetsReady` and ownership for disposal without duplicating
 * the ready-check.
 */
function resolvePart(registry: AssetRegistry | undefined, key: string, fallback: () => THREE.Mesh): ResolvedPart {
  const source = registry?.get(key);
  if (source) return { object: source, usedFallback: false };
  return { object: fallback(), usedFallback: true };
}

export function buildTruckRig(
  build: TruckBuild,
  cosmetics: TruckCosmetics,
  registry?: AssetRegistry,
): TruckRigResult {
  const group = new THREE.Group();
  group.name = 'TruckRig';
  let allAssetsReady = true;
  // Only the fallback (never-shared) geometries/materials this instance
  // created go here -- see TruckRigResult.dispose's doc comment above.
  const ownedGeometries: THREE.BufferGeometry[] = [];
  const ownedMaterials: THREE.Material[] = [];

  const trackFallback = (part: ResolvedPart) => {
    if (!part.usedFallback) return;
    allAssetsReady = false;
    const mesh = part.object as THREE.Mesh;
    ownedGeometries.push(mesh.geometry);
    if (mesh.material instanceof THREE.Material) ownedMaterials.push(mesh.material);
  };

  const sockets = socketsForBodyTier(build.body);

  const bodyResult = resolvePart(registry, bodyAssetKey(build.body), fallbackBody);
  trackFallback(bodyResult);
  paintAll(bodyResult.object, getBodyColorMaterial(cosmetics.bodyColor));
  bodyResult.object.position.copy(sockets.body);
  group.add(bodyResult.object);

  const decal = buildDesignDecal(cosmetics.bodyDesign);
  if (decal) {
    decal.position.copy(sockets.design);
    group.add(decal);
    // The decal's geometry (one mesh for 'stripe', several tip meshes for
    // 'flames' -- see cosmetic-manifest.ts's buildFlameDecal) is fresh per
    // call (owned); every tip's material is a shared, cached
    // cosmetic-manifest instance (never owned/disposed here).
    decal.traverse((child) => {
      if (child instanceof THREE.Mesh) ownedGeometries.push(child.geometry);
    });
  }

  const wheelKey = wheelAssetKey(build.wheels);
  const wheelLookMaterial = getWheelLookMaterial(cosmetics.wheelLook);
  for (const socket of sockets.wheels) {
    const wheelResult = resolvePart(registry, wheelKey, fallbackWheel);
    trackFallback(wheelResult);
    paintAll(wheelResult.object, wheelLookMaterial);
    wheelResult.object.position.copy(socket);
    group.add(wheelResult.object);
  }

  const engineResult = resolvePart(registry, engineCueAssetKey(build.engine), fallbackCue);
  trackFallback(engineResult);
  engineResult.object.position.copy(sockets.engine);
  group.add(engineResult.object);

  const gasResult = resolvePart(registry, gasCueAssetKey(build.gasTank), fallbackCue);
  trackFallback(gasResult);
  gasResult.object.position.copy(sockets.gasTank);
  group.add(gasResult.object);

  return {
    group,
    allAssetsReady,
    dispose() {
      for (const geometry of ownedGeometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
    },
  };
}
