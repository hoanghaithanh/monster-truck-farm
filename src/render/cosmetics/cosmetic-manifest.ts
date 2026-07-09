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
// docs/qa/screenshots/adr-0011-cosmetic-visibility-fix/): the *fallback*
// wheel-look material here (keyed only by cosmetic id, used on the primitive
// fallback wheel while assets are still loading -- see truck-rig.ts's
// fallbackWheel()) is a `MeshBasicMaterial` (flat, unlit), NOT
// `MeshStandardMaterial`. This was the actual bug behind "chrome and
// standard wheels look nearly identical" -- with a lit material, scene.ts's
// single directional sun + modest ambient produced large per-face shading
// swings on the low-poly wheel geometry (deep-shadow faces vs.
// sun-facing faces), and that shading range overlapped between a near-black
// and a near-white *lit* material enough to wash out the intended hex
// contrast, especially at the builder's small 220x220 preview size. An unlit
// flat-colour material always renders exactly its authored hex, everywhere,
// regardless of light direction or geometry facet count.
//
// Sourced-art pass (issue #33 follow-up, 2026-07-09): the *loaded* wheel
// model (real sourced CC0/CC-BY low-poly mesh -- see repo-root CREDITS.md)
// is no longer a single-material shape, so it's no longer painted by
// whole-object material replacement. `getWheelRimTintMaterial` below clones
// the *loaded asset's own* rim material and only overwrites `.color` --
// truck-rig.ts's paintWheel() decides, per part, whether a target-named
// material (`mat22` on the wheel) exists to tint -- if not (the primitive
// fallback case), it falls back to whole-object replacement with this
// file's flat `getWheelLookMaterial`, which is otherwise unchanged from the
// pre-sourced-art behaviour described above.
//
// Body-color removal (2026-07-09, direct human decision post-ship -- see
// docs/requirements/truck-cosmetics.md's dated note): the body used to carry
// an equivalent "body color" cosmetic (flat-material fallback + an
// Atlas-material tint clone for the loaded body, both keyed the same way as
// the wheel-look machinery above). The human found the tinted body looked
// bad and asked for it to be removed outright, always rendering the body's
// native/untinted loaded material. That machinery (BODY_COLOR_HEX,
// getBodyColorMaterial, getBodyColorTintMaterial, and the emissive-tint fix
// for issue #35) was deleted rather than disabled -- no dead code/feature
// flag left behind. Body *design* (the decal below) and wheel *look* (the
// rim tint further down) are unrelated cosmetic axes and are unaffected.
import * as THREE from 'three';

export interface CosmeticOption {
  id: string;
  label: string;
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
