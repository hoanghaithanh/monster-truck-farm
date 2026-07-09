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

const bodyColorMaterials = new Map<string, THREE.MeshStandardMaterial>();
export function getBodyColorMaterial(id: string): THREE.MeshStandardMaterial {
  const hex = BODY_COLOR_HEX[id] ?? BODY_COLOR_HEX[DEFAULT_BODY_COLOR];
  let material = bodyColorMaterials.get(id);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color: hex });
    bodyColorMaterials.set(id, material);
  }
  return material;
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

const designDecalMaterials = new Map<string, THREE.MeshStandardMaterial>();
function getDesignDecalMaterial(id: string): THREE.MeshStandardMaterial {
  let material = designDecalMaterials.get(id);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color: DESIGN_DECAL_HEX[id] ?? 0xffffff });
    designDecalMaterials.set(id, material);
  }
  return material;
}

/** Builds a fresh decal mesh for `designId`, or `undefined` for 'plain' (no decal) / an unknown id. Callers position it at the body's `design` socket. A fresh mesh per call (cheap primitive geometry) since each truck rig owns and disposes its own decal instance; only the *material* is shared/cached (see module header). */
export function buildDesignDecal(designId: string): THREE.Object3D | undefined {
  if (designId === 'plain' || !(designId in DESIGN_DECAL_HEX)) return undefined;
  const geometry = new THREE.BoxGeometry(0.18, 0.02, 1.6);
  return new THREE.Mesh(geometry, getDesignDecalMaterial(designId));
}

// -- Wheel look: flat-colour materials applied to every Mesh in the loaded
// wheel model, same shared-palette/carry-over reasoning as body color. (ADR
// 0011 §2 reserves actual texture maps for tread/rim patterns "if genuinely
// needed" -- flagged as a follow-up; flat colour keeps this pass consistent,
// testable without a DOM/Canvas texture pipeline, and still visually
// distinct per look.)
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

const wheelLookMaterials = new Map<string, THREE.MeshStandardMaterial>();
export function getWheelLookMaterial(id: string): THREE.MeshStandardMaterial {
  const hex = WHEEL_LOOK_HEX[id] ?? WHEEL_LOOK_HEX[DEFAULT_WHEEL_LOOK];
  let material = wheelLookMaterials.get(id);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color: hex });
    wheelLookMaterials.set(id, material);
  }
  return material;
}
