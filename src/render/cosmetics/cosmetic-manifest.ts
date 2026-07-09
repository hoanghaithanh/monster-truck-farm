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
// docs/qa/screenshots/adr-0011-cosmetic-visibility-fix/): every material
// here is a `MeshBasicMaterial` (flat, unlit), NOT `MeshStandardMaterial`.
// This was the actual bug behind "chrome and standard wheels look nearly
// identical" -- with a lit material, scene.ts's single directional sun +
// modest ambient produced large per-face shading swings on the low-poly
// wheel/body geometry (deep-shadow faces vs. sun-facing faces), and that
// shading range overlapped between a near-black and a near-white *lit*
// material enough to wash out the intended hex contrast, especially at the
// builder's small 220x220 preview size. An unlit flat-colour material always
// renders exactly its authored hex, everywhere, regardless of light
// direction or geometry facet count -- which is what "flat/plain-colour
// materials for paint" (this file's own original intent, see the body-color
// section below) actually requires. Every paintable part (body, wheels,
// design decal) uses this family of material for the same reason; scene.ts's
// lighting is otherwise untouched since obstacles/farmer/fuel/fallback
// primitives are deliberately still lit (MeshStandardMaterial).
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
export function getBodyColorMaterial(id: string): THREE.MeshBasicMaterial {
  const hex = BODY_COLOR_HEX[id] ?? BODY_COLOR_HEX[DEFAULT_BODY_COLOR];
  let material = bodyColorMaterials.get(id);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color: hex });
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

const wheelLookMaterials = new Map<string, THREE.MeshBasicMaterial>();
export function getWheelLookMaterial(id: string): THREE.MeshBasicMaterial {
  const hex = WHEEL_LOOK_HEX[id] ?? WHEEL_LOOK_HEX[DEFAULT_WHEEL_LOOK];
  let material = wheelLookMaterials.get(id);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color: hex });
    wheelLookMaterials.set(id, material);
  }
  return material;
}
