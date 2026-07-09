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
import { buildDesignDecal, getWheelLookMaterial, getWheelRimTintMaterial } from './cosmetics/cosmetic-manifest';

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

/** Assigns `material` to every Mesh in `object`'s hierarchy -- used to paint a whole part uniformly. Only meaningful for the primitive fallback wheel now (a single-material low-poly shape; see scripts/generate-truck-art.mjs) -- the loaded sourced-art wheel is painted selectively by material name instead (see paintWheel below). Only replaces the reference; never disposes the material it's replacing (that material may be the shared source's, still needed by other clones). */
function paintAll(object: THREE.Object3D, material: THREE.Material): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) child.material = material;
  });
}

// The loaded wheel's rim and tire-rubber materials, by name, as they come
// out of the sourced "Truck Tire"/"Vehicle Tire" .glb files (see repo-root
// CREDITS.md). The body's own "Atlas" material is rendered as-is (no cosmetic
// tint -- body color was removed post-ship, see cosmetic-manifest.ts's
// header) so it has no equivalent named constant here.
const WHEEL_RIM_MATERIAL_NAME = 'mat22';
const WHEEL_TIRE_MATERIAL_NAME = 'mat23';

// The loaded body models' own built-in wheel nodes (see CREDITS.md) --
// excluded/removed at assembly time so they never render doubled-up
// alongside the rig's own separately-scaled wheel-tier models at the socket
// positions below.
const BODY_BUILTIN_WHEEL_NODE_NAMES = new Set(['BackWheels', 'FrontWheel_L', 'FrontWheel_R']);

/**
 * Tints every Mesh in `object`'s hierarchy whose *current* material is named
 * `targetName` -- e.g. the loaded wheel's "mat22" rim material -- via
 * `getTint(currentMaterial, cosmeticId)`, leaving every other material
 * (mat23/tire-rubber on the wheel) completely untouched. `getTint` receives
 * each matched mesh's *own current* material as its source (not a single
 * shared source) because that differs per loaded asset -- wheel-tier-0/1/2
 * each ship their own "mat22" material instance, for example
 * (cosmetic-manifest.ts's getWheelRimTintMaterial keys its tint cache by
 * that source instance for exactly this reason). Returns whether anything
 * matched, so callers (paintWheel) can tell "this part has no target-named
 * material" (the primitive fallback wheel, whose one material has no name)
 * apart from "this part matched and is now painted," and fall back to
 * paintAll for the former.
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

/**
 * Hollow-wheel fix (2026-07-09, direct human report -- "you can see inner
 * parts through the wheels"). Root cause, confirmed by inspecting the raw
 * glTF geometry of both sourced tire models (`wheel-tier-{0,1,2}.glb`,
 * "Vehicle Tire"/"Truck Tire" by Jarlan Perez -- see repo-root CREDITS.md),
 * NOT a mirrored-scale winding bug: this rig never mirrors the wheel mesh
 * (no per-side `scale.x = -1` or equivalent anywhere in this file -- all 4
 * wheel sockets place the *same* unflipped object, see truck-sockets.ts), so
 * a negative-scale winding flip can't be what's happening here, and indeed
 * every socket showed the identical defect rather than only the mirrored
 * side. Rebuilding each submesh's true topology (welding vertices by
 * position, since the source file duplicates a vertex per triangle for flat
 * shading -- raw indices alone look "open" everywhere and are not a useful
 * manifold signal) found genuine open boundary edges on both the rim
 * ("mat22") and tire-rubber ("mat23") submeshes of every wheel tier -- an
 * uncapped hole (most likely the hub/axle bore) baked into the source
 * asset, present identically on every copy since there is only one asset,
 * reused unflipped at all 4 sockets. With the default `THREE.FrontSide`,
 * that hole is a literal gap in the shell, and backface culling then hides
 * the inner/back faces you'd otherwise see through it -- exactly the
 * "hollow, see-through" symptom reported.
 *
 * Because the hole is baked into the committed .glb (not something this
 * rig's assembly code introduces or could re-weld/cap without re-authoring
 * the source mesh, which is out of scope here), the pragmatic fix is
 * `THREE.DoubleSide` on both wheel submesh materials -- rendering the
 * inside of the shell too, so the hole reads as "solid tire" rather than
 * "see-through," at a real but small perf cost (2 extra low-poly wheel
 * submeshes per truck, not the whole scene). This is deliberately NOT
 * applied blindly everywhere else (e.g. the body's "Atlas" material is left
 * on the default FrontSide) -- DoubleSide is reserved for this specific,
 * verified-open geometry rather than used as a generic culling workaround.
 *
 * Mutates the *source* materials in place (idempotent, safe to call every
 * build): `.side` is a fixed rendering correction, not a per-truck cosmetic
 * value like `.color`/`.emissive`, so -- unlike the cosmetic tint caches in
 * cosmetic-manifest.ts, which deliberately never mutate a shared source --
 * there is nothing to "bleed" between trucks by setting it once on the one
 * shared material instance each wheel tier's clones all reference (see
 * asset-registry.ts's Mesh.copy() sharing materials by reference). Any
 * later tint clone (getWheelRimTintMaterial) inherits `.side` automatically
 * since `Material.clone()` copies it along with every other property, so
 * this only needs to run once per resolved wheel object, before painting.
 * A no-op for the primitive fallback wheel (a real, already-closed
 * cylinder -- see fallbackWheel() -- with no hole to fix).
 */
function fixHollowWheelGeometry(wheelObject: THREE.Object3D): void {
  wheelObject.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) return;
    if (child.material.name === WHEEL_RIM_MATERIAL_NAME || child.material.name === WHEEL_TIRE_MATERIAL_NAME) {
      child.material.side = THREE.DoubleSide;
    }
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
  if (!bodyResult.usedFallback) {
    // Loaded sourced-art body only: hide its own built-in wheel nodes (the
    // rig attaches its own wheel-tier models below instead) and apply the
    // corrective scale truck-sockets.ts derived for this tier's baked-in
    // 100x FBX scale. The primitive fallback body is already authored at
    // final scale and has no built-in wheels -- neither applies to it.
    removeBuiltinWheelNodes(bodyResult.object);
    bodyResult.object.scale.setScalar(sockets.bodyScale);
  }
  // Body color was removed post-ship (direct human decision -- see
  // cosmetic-manifest.ts's header): the body always renders its native,
  // untinted loaded material (or the primitive fallback's own flat grey) --
  // no `.color`/`.emissive` override of any kind.
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
    if (!wheelResult.usedFallback) {
      wheelResult.object.scale.setScalar(sockets.wheelScale);
      fixHollowWheelGeometry(wheelResult.object);
    }
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
