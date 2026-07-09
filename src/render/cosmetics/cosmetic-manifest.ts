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
// flag left behind.
//
// Body-design removal (2026-07-09, direct human decision post-ship, issue
// #41 -- see docs/requirements/truck-cosmetics.md's second dated note): the
// "Racing stripe"/"Flame accent" decal cosmetic (a shared decal mesh
// attached at the body's `design` socket, truck-sockets.ts) "looked weird"
// in-game per direct playtest feedback and was removed outright, same
// pattern as the body-color removal above. That machinery
// (buildDesignDecal/buildStripeDecal/buildFlameDecal, BODY_DESIGN_OPTIONS,
// DEFAULT_BODY_DESIGN, DESIGN_DECAL_HEX, getDesignDecalMaterial) was deleted
// rather than disabled. Wheel *look* (the rim tint below) is the only
// surviving cosmetic axis now that body color and body design are both gone.
import * as THREE from 'three';

export interface CosmeticOption {
  id: string;
  label: string;
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
