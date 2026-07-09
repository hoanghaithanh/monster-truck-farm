// id -> THREE.Material mapping for cosmetic variants (ADR 0011 §2/§3): the
// "cosmetic manifest" the ADR's component diagram names. Lives in render/,
// not core/, per ADR 0001 §4 -- core/ only ever knows cosmetic ids as plain
// strings (see core/types.ts's TruckCosmetics).
//
// Material-mutation-bleed risk (ADR 0011 Consequences/Risks): every material
// returned here is created once, cached, and NEVER mutated after creation --
// callers only ever *assign* `mesh.material = getXMaterial(id)`, never touch
// `.color`/etc. on the returned instance. That is what makes sharing one
// instance across every truck (and the builder preview) safe: there is
// nothing to bleed between trucks because nothing ever writes to it again.
// (Contrast with scene.ts's truck bump-flash, which legitimately owns and
// mutates its own dedicated material -- that one was never shared to begin
// with.)
//
// Cosmetic-visibility fix (2026-07-09, ADR 0011 follow-up -- see
// docs/qa/screenshots/adr-0011-cosmetic-visibility-fix/): every *fallback*
// material here (the ones keyed only by cosmetic id, used on the primitive
// fallback body/wheel while assets are still loading -- see truck-rig.ts's
// fallbackBody()/fallbackWheel()) is a `MeshBasicMaterial` (flat, unlit), NOT
// `MeshStandardMaterial`. This was the actual bug behind "chrome and
// standard wheels look nearly identical" -- with a lit material, scene.ts's
// single directional sun + modest ambient produced large per-face shading
// swings on the low-poly wheel/body geometry (deep-shadow faces vs.
// sun-facing faces), and that shading range overlapped between a near-black
// and a near-white *lit* material enough to wash out the intended hex
// contrast, especially at the builder's small 220x220 preview size. An unlit
// flat-colour material always renders exactly its authored hex, everywhere,
// regardless of light direction or geometry facet count.
//
// Sourced-art pass (issue #33 follow-up, 2026-07-09): the *loaded* body/
// wheel models (real sourced CC0/CC-BY low-poly meshes -- see repo-root
// CREDITS.md) are no longer single-material shapes, so they're no longer
// painted by whole-object material replacement. The body's real "Atlas"
// material is a UV-textured MeshStandardMaterial baking in window/grille/
// panel-line detail; replacing it with a flat MeshBasicMaterial would erase
// that texture entirely. Instead, `getBodyColorTintMaterial`/
// `getWheelRimTintMaterial` below clone the *loaded asset's own* material
// and only overwrite `.color` -- Three.js multiplies `.map` x `.color`
// per-pixel, so this recolors the body/rim while the baked texture detail
// (or, for the wheel rim, the untouched black tire-rubber submesh) survives.
// truck-rig.ts's paintBody()/paintWheel() decide, per part, whether a
// target-named material (`Atlas` on the body, `mat22` on the wheel) exists
// to tint -- if not (the primitive fallback case), they fall back to whole-
// object replacement with this file's flat `getBodyColorMaterial`/
// `getWheelLookMaterial`, which are otherwise unchanged from the pre-sourced-
// art behaviour described above.
import * as THREE from 'three';

export interface CosmeticOption {
  id: string;
  label: string;
}

// -- Body paint color: flat/plain-colour materials (ADR 0011 §2: "prefer
// flat vertex-colour / plain-colour materials for paint -- near-zero
// download, on-brand for low-poly"). Applied uniformly to every Mesh in the
// loaded body model (see truck-rig.ts) regardless of body tier -- a shared
// palette, which is what makes tier-change carry-over (cosmetics AC7) a
// non-issue: the same material id is valid on any body model.
const BODY_COLOR_HEX: Record<string, number> = {
  orange: 0xff8c1a,
  blue: 0x3f88ff,
  green: 0x4bd15c,
  purple: 0x9b59d6,
  red: 0xe64b4b,
};
export const DEFAULT_BODY_COLOR = 'orange';
export const BODY_COLOR_OPTIONS: CosmeticOption[] = Object.keys(BODY_COLOR_HEX).map((id) => ({
  id,
  label: id[0].toUpperCase() + id.slice(1),
}));

const bodyColorMaterials = new Map<string, THREE.MeshBasicMaterial>();
/** Flat plain-colour body-paint material -- only used on the primitive fallback body (truck-rig.ts's fallbackBody()), which has no textured "Atlas" material to tint. See getBodyColorTintMaterial for the loaded-asset path. */
export function getBodyColorMaterial(id: string): THREE.MeshBasicMaterial {
  const hex = BODY_COLOR_HEX[id] ?? BODY_COLOR_HEX[DEFAULT_BODY_COLOR];
  let material = bodyColorMaterials.get(id);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color: hex });
    bodyColorMaterials.set(id, material);
  }
  return material;
}

// Tint cache for the loaded body model's real "Atlas" material, keyed two
// levels deep: source material instance (each body tier's own Atlas
// material -- AssetRegistry.get() clones the scene graph but shares
// material *references* across every clone, see asset-registry.ts's Mesh.
// copy() behaviour) -> cosmetic body-color id -> the tinted clone. Keying by
// the source instance (rather than a flat id -> material map, like every
// other cache in this file) is necessary here because "Atlas" isn't one
// shared material -- body-tier-0/1/2 each ship their own -- so the same
// color id needs a different tinted clone per body tier. Every tint is
// created once, cached, and NEVER mutated after creation, same discipline as
// the rest of this file; the *source* Atlas material is also never mutated
// (only cloned from).
const bodyColorTintMaterials = new WeakMap<THREE.Material, Map<string, THREE.Material>>();

/**
 * A tinted clone of `source` (the loaded body model's real "Atlas" material)
 * for cosmetic body-color `id`: identical to `source` in every respect
 * (including its `.map` texture) except `.color`, which is set to the
 * cosmetic hex. Three.js's standard `.map` x `.color` per-fragment multiply
 * means this recolors the body paint while keeping the baked window/grille/
 * panel-line detail intact -- see this file's header. Falls back to
 * DEFAULT_BODY_COLOR's hex for an unknown id, same forgiving-fallback
 * behaviour as getBodyColorMaterial.
 */
export function getBodyColorTintMaterial(source: THREE.Material, id: string): THREE.Material {
  const hex = BODY_COLOR_HEX[id] ?? BODY_COLOR_HEX[DEFAULT_BODY_COLOR];
  let byColor = bodyColorTintMaterials.get(source);
  if (!byColor) {
    byColor = new Map();
    bodyColorTintMaterials.set(source, byColor);
  }
  let tinted = byColor.get(id);
  if (!tinted) {
    tinted = source.clone();
    if ('color' in tinted && tinted.color instanceof THREE.Color) tinted.color.setHex(hex);
    byColor.set(id, tinted);
  }
  return tinted;
}

// -- Body design: a shared decal mesh (a thin racing-stripe/flame-accent
// strip), attached at the body's `design` socket (truck-sockets.ts) --
// independent of body tier, same shared-across-tiers reasoning as color.
// 'plain' renders no decal at all.
export const DEFAULT_BODY_DESIGN = 'plain';
export const BODY_DESIGN_OPTIONS: CosmeticOption[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'stripe', label: 'Racing stripe' },
  { id: 'flames', label: 'Flame accent' },
];

const DESIGN_DECAL_HEX: Record<string, number> = {
  stripe: 0xffffff,
  flames: 0xff6f1a,
};

const designDecalMaterials = new Map<string, THREE.MeshBasicMaterial>();
function getDesignDecalMaterial(id: string): THREE.MeshBasicMaterial {
  let material = designDecalMaterials.get(id);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color: DESIGN_DECAL_HEX[id] ?? 0xffffff });
    designDecalMaterials.set(id, material);
  }
  return material;
}

/** Builds a fresh decal/ornament object for `designId`, or `undefined` for 'plain' (no decal) / an unknown id. Callers position the returned object at the body's `design` socket. */
export function buildDesignDecal(designId: string): THREE.Object3D | undefined {
  if (designId === 'stripe') return buildStripeDecal();
  if (designId === 'flames') return buildFlameDecal();
  return undefined;
}

/** A flat racing-stripe strip laid along the roof's centerline. A fresh mesh per call (cheap primitive geometry) since each truck rig owns and disposes its own decal instance; only the *material* is shared/cached (see module header). */
function buildStripeDecal(): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(0.18, 0.02, 1.6);
  return new THREE.Mesh(geometry, getDesignDecalMaterial('stripe'));
}

/**
 * "Flame accent" (cosmetic-visibility fix, 2026-07-09 -- see
 * docs/qa/screenshots/adr-0011-cosmetic-visibility-fix/): originally shared
 * `buildStripeDecal`'s flat-strip-on-the-roof shape, which read as an
 * ambiguous small vertical bar rather than a flame, because the game's
 * cameras (chase cam in scene.ts, the builder's 3/4 preview) both view the
 * truck mostly from behind/above -- a strip lying flat and long *along the
 * truck's length* foreshortens hard from that angle into a short sliver.
 * Built instead as a small cluster of tapered boxes that stand *up* off the
 * roof (their extent is in Y, not laid flat) -- a central tongue plus two
 * shorter, outward-canted tips -- so the flame silhouette reads against the
 * sky from any horizontal viewing angle, not just a lucky one. Still cheap
 * low-poly primitive geometry, no texture maps (ADR 0011 §2). A fresh group
 * per call (each truck rig owns and disposes its own decal instance); only
 * the *material* is shared/cached across every tip and every rig (see module
 * header).
 */
function buildFlameDecal(): THREE.Group {
  const material = getDesignDecalMaterial('flames');
  const tips: { size: [number, number, number]; position: [number, number, number]; rotationZ: number; rotationX: number }[] = [
    { size: [0.09, 0.34, 0.16], position: [0, 0.17, 0], rotationZ: 0, rotationX: 0 },
    { size: [0.07, 0.22, 0.12], position: [0.1, 0.11, -0.06], rotationZ: -0.55, rotationX: 0.2 },
    { size: [0.07, 0.22, 0.12], position: [-0.1, 0.11, 0.06], rotationZ: 0.55, rotationX: -0.2 },
  ];
  const group = new THREE.Group();
  for (const tip of tips) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...tip.size), material);
    mesh.position.set(...tip.position);
    mesh.rotation.set(tip.rotationX, 0, tip.rotationZ);
    group.add(mesh);
  }
  return group;
}

// -- Wheel look: flat-colour materials, same shared-palette/carry-over
// reasoning as body color.
//
// getWheelLookMaterial (below) is the flat whole-object-replacement fallback
// -- only used on the primitive fallback wheel (truck-rig.ts's
// fallbackWheel()), which has no rim/tire material split to target
// selectively. For a *loaded* wheel model (real sourced tire mesh -- repo-
// root CREDITS.md), the wheel-look cosmetic now targets only the rim
// submesh (material name "mat22"), leaving the tire-rubber submesh
// ("mat23") untouched/black -- see getWheelRimTintMaterial and truck-rig.ts's
// paintWheel(). (ADR 0011 §2 reserves actual texture maps for tread/rim
// patterns "if genuinely needed" -- flat colour is still what's used here,
// just now targeted at one submesh instead of the whole model.)
const WHEEL_LOOK_HEX: Record<string, number> = {
  standard: 0x2b2b2b,
  redRim: 0xb23b3b,
  chrome: 0xd8d8d8,
};
export const DEFAULT_WHEEL_LOOK = 'standard';
export const WHEEL_LOOK_OPTIONS: CosmeticOption[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'redRim', label: 'Red rim' },
  { id: 'chrome', label: 'Chrome' },
];

const wheelLookMaterials = new Map<string, THREE.MeshBasicMaterial>();
/** Flat wheel-look material -- only used on the primitive fallback wheel (truck-rig.ts's fallbackWheel()). See getWheelRimTintMaterial for the loaded-asset (rim-only) path. */
export function getWheelLookMaterial(id: string): THREE.MeshBasicMaterial {
  const hex = WHEEL_LOOK_HEX[id] ?? WHEEL_LOOK_HEX[DEFAULT_WHEEL_LOOK];
  let material = wheelLookMaterials.get(id);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color: hex });
    wheelLookMaterials.set(id, material);
  }
  return material;
}

// Tint cache for the loaded wheel model's real rim material ("mat22"),
// keyed the same two-levels-deep way as getBodyColorTintMaterial and for the
// same reason -- "mat22" isn't one shared material; wheel-tier-0's rim and
// wheel-tier-1/2's rim (the "Truck Tire" model, reused at two scales -- see
// truck-sockets.ts) are each their own material instance, so the same
// wheel-look id needs its own tinted clone per source. Never mutated after
// creation; the source rim material is never mutated either.
const wheelRimTintMaterials = new WeakMap<THREE.Material, Map<string, THREE.Material>>();

/**
 * A tinted clone of `source` (the loaded wheel model's real rim material,
 * "mat22") for cosmetic wheel-look `id` -- only the rim submesh's colour
 * changes; the tire-rubber submesh ("mat23") is a separate material this
 * function never touches, so the tire stays black regardless of wheel-look.
 */
export function getWheelRimTintMaterial(source: THREE.Material, id: string): THREE.Material {
  const hex = WHEEL_LOOK_HEX[id] ?? WHEEL_LOOK_HEX[DEFAULT_WHEEL_LOOK];
  let byLook = wheelRimTintMaterials.get(source);
  if (!byLook) {
    byLook = new Map();
    wheelRimTintMaterials.set(source, byLook);
  }
  let tinted = byLook.get(id);
  if (!tinted) {
    tinted = source.clone();
    if ('color' in tinted && tinted.color instanceof THREE.Color) tinted.color.setHex(hex);
    byLook.set(id, tinted);
  }
  return tinted;
}
