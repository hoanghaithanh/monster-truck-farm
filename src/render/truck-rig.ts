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
import {
  buildDesignDecal,
  getBodyColorMaterial,
  getBodyColorTintMaterial,
  getWheelLookMaterial,
  getWheelRimTintMaterial,
} from './cosmetics/cosmetic-manifest';

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

/** Assigns `material` to every Mesh in `object`'s hierarchy -- used to paint a whole part uniformly. Only meaningful for the primitive fallback parts now (single-material low-poly shapes; see scripts/generate-truck-art.mjs) -- the loaded sourced-art parts are painted selectively by material name instead (see paintBody/paintWheel below). Only replaces the reference; never disposes the material it's replacing (that material may be the shared source's, still needed by other clones). */
function paintAll(object: THREE.Object3D, material: THREE.Material): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) child.material = material;
  });
}

// The loaded body's textured body-paint material (see repo-root CREDITS.md
// -- baked window/grille/panel-line detail) and the loaded wheel's rim
// material, by name, as they come out of the sourced .glb files.
const BODY_PAINT_MATERIAL_NAME = 'Atlas';
const WHEEL_RIM_MATERIAL_NAME = 'mat22';

// The loaded body models' own built-in wheel nodes (see CREDITS.md) --
// excluded/removed at assembly time so they never render doubled-up
// alongside the rig's own separately-scaled wheel-tier models at the socket
// positions below.
const BODY_BUILTIN_WHEEL_NODE_NAMES = new Set(['BackWheels', 'FrontWheel_L', 'FrontWheel_R']);

/**
 * Tints every Mesh in `object`'s hierarchy whose *current* material is named
 * `targetName` -- e.g. the loaded body's "Atlas" material, or the loaded
 * wheel's "mat22" rim material -- via `getTint(currentMaterial, cosmeticId)`,
 * leaving every other material (Headlights/BrakeLight on the body, mat23/
 * tire-rubber on the wheel) completely untouched. `getTint` receives each
 * matched mesh's *own current* material as its source (not a single shared
 * source) because that differs per loaded asset -- body-tier-0/1/2 each ship
 * their own "Atlas" material instance, for example (cosmetic-manifest.ts's
 * getBodyColorTintMaterial/getWheelRimTintMaterial key their tint cache by
 * that source instance for exactly this reason). Returns whether anything
 * matched, so callers (paintBody/paintWheel) can tell "this part has no
 * target-named material" (the primitive fallback parts, whose one material
 * has no name) apart from "this part matched and is now painted," and fall
 * back to paintAll for the former.
 */
function tintByMaterialName(
  object: THREE.Object3D,
  targetName: string,
  cosmeticId: string,
  getTint: (source: THREE.Material, id: string) => THREE.Material,
): boolean {
  let matched = false;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const current = child.material;
    if (Array.isArray(current) || current.name !== targetName) return;
    matched = true;
    child.material = getTint(current, cosmeticId);
  });
  return matched;
}

/**
 * Removes the loaded body model's own built-in wheel nodes (see
 * BODY_BUILTIN_WHEEL_NODE_NAMES) from `object`'s hierarchy -- a no-op for
 * the primitive fallback body, which has no such children. Detaches rather
 * than disposes: the geometry/material these nodes reference is the shared,
 * cached source owned by AssetRegistry (see TruckRigResult.dispose's doc
 * comment), not something this rig instance owns.
 */
function removeBuiltinWheelNodes(object: THREE.Object3D): void {
  const toRemove: THREE.Object3D[] = [];
  object.traverse((child) => {
    if (BODY_BUILTIN_WHEEL_NODE_NAMES.has(child.name)) toRemove.push(child);
  });
  for (const child of toRemove) child.parent?.remove(child);
}

/**
 * Paints `bodyObject` for cosmetic body-color `colorId`: tints the loaded
 * body's real "Atlas" material in place (preserving its baked texture
 * detail -- see cosmetic-manifest.ts's getBodyColorTintMaterial) if one is
 * present, else falls back to whole-object flat-colour replacement (the
 * primitive fallback body, which has no Atlas material to tint).
 */
function paintBody(bodyObject: THREE.Object3D, colorId: string): void {
  const matched = tintByMaterialName(bodyObject, BODY_PAINT_MATERIAL_NAME, colorId, getBodyColorTintMaterial);
  if (!matched) paintAll(bodyObject, getBodyColorMaterial(colorId));
}

/**
 * Paints `wheelObject` for cosmetic wheel-look `lookId`: tints only the
 * loaded wheel's rim material ("mat22"), leaving the tire-rubber material
 * ("mat23") untouched/black, if a rim material is present, else falls back
 * to whole-object flat-colour replacement (the primitive fallback wheel,
 * which has no rim/tire split).
 */
function paintWheel(wheelObject: THREE.Object3D, lookId: string): void {
  const matched = tintByMaterialName(wheelObject, WHEEL_RIM_MATERIAL_NAME, lookId, getWheelRimTintMaterial);
  if (!matched) paintAll(wheelObject, getWheelLookMaterial(lookId));
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
  if (!bodyResult.usedFallback) {
    // Loaded sourced-art body only: hide its own built-in wheel nodes (the
    // rig attaches its own wheel-tier models below instead) and apply the
    // corrective scale truck-sockets.ts derived for this tier's baked-in
    // 100x FBX scale. The primitive fallback body is already authored at
    // final scale and has no built-in wheels -- neither applies to it.
    removeBuiltinWheelNodes(bodyResult.object);
    bodyResult.object.scale.setScalar(sockets.bodyScale);
  }
  paintBody(bodyResult.object, cosmetics.bodyColor);
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
  for (const socket of sockets.wheels) {
    const wheelResult = resolvePart(registry, wheelKey, fallbackWheel);
    trackFallback(wheelResult);
    // Loaded sourced-art wheel only: apply the corrective scale
    // truck-sockets.ts derived so this tier's real ~0.53-0.56-unit raw tire
    // radius lands at WHEEL_RADIUS_BY_TIER. The primitive fallback wheel is
    // already authored at final scale.
    if (!wheelResult.usedFallback) wheelResult.object.scale.setScalar(sockets.wheelScale);
    paintWheel(wheelResult.object, cosmetics.wheelLook);
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
