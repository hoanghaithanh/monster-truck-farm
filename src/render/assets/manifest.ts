// Typed key -> .glb URL manifest (ADR 0010 §6). Using Vite's
// `new URL('...', import.meta.url)` pattern (the ADR's primary
// recommendation) means every entry is fingerprinted for cache-busting,
// emitted as its own asset (never inlined into the JS chunk, so the
// first-paint budget is protected structurally), and has the GitHub Pages
// base path rewritten automatically -- render/ code never hardcodes a path.
//
// ADR 0011 pass: the truck body/wheel/engine-cue/gas-cue models replace the
// PASS-1 test-fixture demo as the real gameplay-facing entries. Every
// approxGzipBytes below is the real measured gzip size of the procedurally
// authored .glb (see scripts/generate-truck-art.mjs) -- re-measure and
// update here if that script is re-run with different geometry.
//
// Sourced-art pass (issue #33 follow-up, 2026-07-09): body-tier-{0,1,2} and
// wheel-tier-{0,1,2} were replaced with real sourced CC0/CC-BY low-poly
// models (see repo-root CREDITS.md) -- their approxGzipBytes below are
// measured directly (`gzip -9`) against the committed files, not estimated.
// engine-cue-*/gas-cue-* are unchanged (still scripts/generate-truck-art.mjs
// procedural props -- this pass didn't touch them).
//
// Chicken pass (issue #28, 2026-07-10): 'chicken' added as the first real
// sourced-art *animal* entry (previously animals were the raw
// BoxGeometry(0.5,0.5,0.5) primitive only, in render/scene.ts). "Hen" by Poly
// by Google (CC-BY 3.0, see repo-root CREDITS.md), a single static mesh with
// one baked-texture material -- no tiers, no cosmetics, no animation clips.
// approxGzipBytes is measured directly (`gzip -9`) against the committed
// file, same as the body/wheel sourced-art entries above.
import type { AnimalSpecies, TruckBuild } from '../../core/types';

export interface AssetManifestEntry {
  url: URL;
  /** Approximate gzipped size in bytes, for the ADR 0010 §3 budget check (core/assets/budget.ts). Update alongside the real asset when it's swapped in. */
  approxGzipBytes: number;
}

const TEST_FIXTURE_CUBE_URL = new URL('./test-fixture-cube.glb', import.meta.url);

const BODY_URLS = [
  new URL('./models/body-tier-0.glb', import.meta.url),
  new URL('./models/body-tier-1.glb', import.meta.url),
  new URL('./models/body-tier-2.glb', import.meta.url),
];
const WHEEL_URLS = [
  new URL('./models/wheel-tier-0.glb', import.meta.url),
  new URL('./models/wheel-tier-1.glb', import.meta.url),
  new URL('./models/wheel-tier-2.glb', import.meta.url),
];
const ENGINE_CUE_URLS = [
  new URL('./models/engine-cue-tier-0.glb', import.meta.url),
  new URL('./models/engine-cue-tier-1.glb', import.meta.url),
  new URL('./models/engine-cue-tier-2.glb', import.meta.url),
];
const GAS_CUE_URLS = [
  new URL('./models/gas-cue-tier-0.glb', import.meta.url),
  new URL('./models/gas-cue-tier-1.glb', import.meta.url),
  new URL('./models/gas-cue-tier-2.glb', import.meta.url),
];
const CHICKEN_URL = new URL('./models/chicken.glb', import.meta.url);

// Structures pass (issue #46, 2026-07-10): 'barn'/'windmill'/'farmhouse'
// added as the first real sourced-art *environment* entries (previously
// windmill/barn/farmhouse didn't exist in the scene at all). Same sourcing
// discipline as the chicken entry above -- barn/windmill are "Barn"/"Tower
// Windmill" by Quaternius (CC0 1.0), farmhouse is "Farm house" by Poly by
// Google (CC-BY 3.0); see repo-root CREDITS.md for full attribution.
// farmhouse's baked texture was pre-downscaled 2048->512 before being
// committed (~991KB gzip -> ~200KB gzip) to stay well inside ADR 0010 §3's
// budget -- see CREDITS.md, no further action needed here.
const BARN_URL = new URL('./models/barn.glb', import.meta.url);
const WINDMILL_URL = new URL('./models/windmill.glb', import.meta.url);
const FARMHOUSE_URL = new URL('./models/farmhouse.glb', import.meta.url);

// Mountain pass (issue #47, 2026-07-10): 'mountain-a'/'mountain-b' were
// originally added for a 12-instance non-collidable backdrop ring (river has
// no asset -- it's procedural geometry built entirely in render/scene.ts,
// see ADR 0012 §3). Both are "Mountain" by Quaternius (CC0 1.0); see
// repo-root CREDITS.md for full sourcing notes, including the corrective
// node transform already baked into each .glb (no bounding-box-derived
// scale correction needed here, unlike the chicken/structure entries
// above). Mid-Sprint-4 redesign (ADR 0012 addendum, AC3a): the ring was
// superseded by a single reachable/collidable landmark using 'mountain-a'
// (the taller/sharper model) as `StructureInstance` kind 'mountain' (see
// STRUCTURE_ASSET_KEYS below). 'mountain-b' has no consumer as of this
// redesign -- left registered anyway (same "kept even though unused"
// precedent as 'test-fixture-cube' above) since it's a real, already-staged,
// harmless-to-keep asset; no broken reference either way.
const MOUNTAIN_A_URL = new URL('./models/mountain-a.glb', import.meta.url);
const MOUNTAIN_B_URL = new URL('./models/mountain-b.glb', import.meta.url);

// Farmer pass (issue #29, ADR 0015 §1/§5): 'farmer' is the first *animated*
// manifest entry -- a single, non-tiered key like chicken/structures above,
// prefetched the same way (not gated by truckAssetKeysForBuild, ADR 0010
// §4.4 -- not a player truck part). Unlike every prior entry, its consumer
// (scene.ts) reaches it through the new AssetRegistry.getAnimated() path,
// not get(), because it ships a skinned mesh + animation clip library (see
// repo-root CREDITS.md for full sourcing/clip notes). approxGzipBytes is
// measured directly (`gzip -9`) against the committed file, same discipline
// as every other sourced-art entry above.
const FARMER_URL = new URL('./models/farmer.glb', import.meta.url);

// Silo/chicken-coop/fence pass (issue #54, ADR 0019 §4/§6): three more
// structure entries reusing the same Quaternius Farm Buildings Bundle
// family already used for barn/windmill (issue #46) -- near-zero
// incremental sourcing cost, exactly as the requirements doc anticipated.
// silo/chickenCoop are ordinary `StructureInstance`s (AC7), consumed the
// same generic way as barn/windmill/farmhouse/mountain via
// `STRUCTURE_ASSET_KEYS` below. 'fence' is the first manifest entry for the
// new `FenceInstance` family (AC8) -- not a `StructureKind`, so it isn't in
// `STRUCTURE_ASSET_KEYS`; scene.ts's fence-rendering code reaches it via
// `FENCE_ASSET_KEY` below instead. All three are single-mesh/no-texture/
// no-animation (see repo-root CREDITS.md), same "not gated by
// truckAssetKeysForBuild" rationale as every other environment asset above.
const SILO_URL = new URL('./models/silo.glb', import.meta.url);
const CHICKEN_COOP_URL = new URL('./models/chicken-coop.glb', import.meta.url);
const FENCE_URL = new URL('./models/fence.glb', import.meta.url);

// Pig/cow pass (issue #48, ADR 0016 §1): 'pig'/'cow' are the second and
// third *animated* manifest entries (after farmer) -- both ship a rigged
// SkinnedMesh + Armature skeleton, consumed via AssetRegistry.getAnimated()
// like the farmer, not get() (see repo-root CREDITS.md for full sourcing/
// clip notes). Same "not gated by truckAssetKeysForBuild" rationale as
// chicken/structures/farmer above.
const PIG_URL = new URL('./models/pig.glb', import.meta.url);
const COW_URL = new URL('./models/cow.glb', import.meta.url);

// Decorative tree pass (issue #54 amendment, 2026-07-12, ADR 0019 §A4):
// 'tree' is the first sourced-art *decorative prop* entry -- a single,
// non-tiered key like chicken/farmer above, loaded once and cloned per
// instance (~25-45 times, see render/scene.ts) rather than a per-instance
// manifest key. "Tree" by Quaternius (CC0 1.0); see repo-root CREDITS.md for
// the texture-downscale note (1024x1024 -> 128x128, no visible quality loss
// at driving-scene distance).
const TREE_URL = new URL('./models/tree.glb', import.meta.url);

// Real measured gzip sizes. body-tier-*/wheel-tier-* are the sourced-art
// models (`gzip -9` against the committed files, 2026-07-09 -- see repo-root
// CREDITS.md's budget table); engine-cue-*/gas-cue-* are still the
// scripts/generate-truck-art.mjs procedural props (2026-07-08, unchanged).
//
// wheel-tier-1 and wheel-tier-2 are two committed copies of the exact same
// source file ("Truck Tire" by Jarlan Perez, scaled differently at runtime
// via each tier's own `wheelScale` in truck-sockets.ts -- see CREDITS.md's
// "only 2 distinct tire meshes across 3 tiers" design call). Deliberately
// left as two separate manifest entries/URLs rather than pointing both keys
// at one cache entry (AssetRegistry's cache is keyed 1:1 by asset key today,
// and ~11KB gzip is noise against the 1.5MB budget -- not worth adding
// key-aliasing complexity for). In practice this doesn't even cost a real
// duplicate download: since the two files are byte-identical, Vite's
// content-hashed asset filenames (confirmed via `npm run build`) resolve
// both `new URL(...)` entries to the *same* emitted file/URL, so the browser
// only ever fetches it once regardless of how many wheel tiers a session
// equips.
const BODY_GZIP_BYTES = [111372, 225331, 263091];
const WHEEL_GZIP_BYTES = [10408, 10833, 10833];
const ENGINE_CUE_GZIP_BYTES = [740, 789, 1371];
const GAS_CUE_GZIP_BYTES = [1233, 1398, 3366];
const CHICKEN_GZIP_BYTES = 15821;
// Measured directly (`gzip -9`) against the committed files (issue #46).
const BARN_GZIP_BYTES = 25758;
const WINDMILL_GZIP_BYTES = 81508;
const FARMHOUSE_GZIP_BYTES = 200378;
// Measured directly (`gzip -9`) against the committed files (issue #47).
const MOUNTAIN_A_GZIP_BYTES = 17009;
const MOUNTAIN_B_GZIP_BYTES = 6561;
// Measured directly (`gzip -9`) against the committed file (issue #29) --
// matches ADR 0015 §5's measured figure exactly.
const FARMER_GZIP_BYTES = 324927;
// Measured directly (`gzip -9`) against the committed files (issue #48).
// Close to (within ~11 bytes of) CREDITS.md's 59430/135299 figures -- that
// doc's numbers were captured in a slightly different gzip invocation; these
// are the ones actually re-measured against the committed files at
// implementation time and are what the budget check below uses.
const PIG_GZIP_BYTES = 59419;
const COW_GZIP_BYTES = 135288;
// Measured directly (`gzip -9`) against the committed files (issue #54).
const SILO_GZIP_BYTES = 14770;
const CHICKEN_COOP_GZIP_BYTES = 9583;
const FENCE_GZIP_BYTES = 3451;
// Measured directly (`gzip -9`) against the committed file (issue #54
// amendment) -- matches CREDITS.md's ~263KB post-downscale estimate closely.
const TREE_GZIP_BYTES = 258149;

export const ASSET_MANIFEST = {
  // PASS-1 test fixture (ADR 0010 infrastructure) -- kept registered so the
  // AssetRegistry/prefetch/gate plumbing this proved end-to-end stays
  // exercised; no longer referenced by any gameplay render code (ADR 0011
  // removed the scene.ts demo probe that used it).
  'test-fixture-cube': { url: TEST_FIXTURE_CUBE_URL, approxGzipBytes: 1200 },

  'body-tier-0': { url: BODY_URLS[0], approxGzipBytes: BODY_GZIP_BYTES[0] },
  'body-tier-1': { url: BODY_URLS[1], approxGzipBytes: BODY_GZIP_BYTES[1] },
  'body-tier-2': { url: BODY_URLS[2], approxGzipBytes: BODY_GZIP_BYTES[2] },

  'wheel-tier-0': { url: WHEEL_URLS[0], approxGzipBytes: WHEEL_GZIP_BYTES[0] },
  'wheel-tier-1': { url: WHEEL_URLS[1], approxGzipBytes: WHEEL_GZIP_BYTES[1] },
  'wheel-tier-2': { url: WHEEL_URLS[2], approxGzipBytes: WHEEL_GZIP_BYTES[2] },

  'engine-cue-tier-0': { url: ENGINE_CUE_URLS[0], approxGzipBytes: ENGINE_CUE_GZIP_BYTES[0] },
  'engine-cue-tier-1': { url: ENGINE_CUE_URLS[1], approxGzipBytes: ENGINE_CUE_GZIP_BYTES[1] },
  'engine-cue-tier-2': { url: ENGINE_CUE_URLS[2], approxGzipBytes: ENGINE_CUE_GZIP_BYTES[2] },

  'gas-cue-tier-0': { url: GAS_CUE_URLS[0], approxGzipBytes: GAS_CUE_GZIP_BYTES[0] },
  'gas-cue-tier-1': { url: GAS_CUE_URLS[1], approxGzipBytes: GAS_CUE_GZIP_BYTES[1] },
  'gas-cue-tier-2': { url: GAS_CUE_URLS[2], approxGzipBytes: GAS_CUE_GZIP_BYTES[2] },

  // Issue #28: not gated by truckAssetKeysForBuild (chicken is not one of
  // the player's own truck parts, ADR 0010 §4.4) -- prefetched here like
  // everything else in the manifest, loaded progressively/in-place via
  // UpgradableObject in scene.ts's upsertAnimal.
  chicken: { url: CHICKEN_URL, approxGzipBytes: CHICKEN_GZIP_BYTES },

  // Issue #46: same "not gated by truckAssetKeysForBuild" rationale as
  // chicken above -- structures aren't the player's own truck parts, so
  // they load progressively per ADR 0010 §4.4 rather than blocking the
  // BUILDER -> DRIVING transition.
  barn: { url: BARN_URL, approxGzipBytes: BARN_GZIP_BYTES },
  windmill: { url: WINDMILL_URL, approxGzipBytes: WINDMILL_GZIP_BYTES },
  farmhouse: { url: FARMHOUSE_URL, approxGzipBytes: FARMHOUSE_GZIP_BYTES },

  // Issue #47: same "not gated by truckAssetKeysForBuild" rationale as the
  // structures above -- the mountain landmark is not a player truck part,
  // so it loads progressively per ADR 0010 §4.4 like every other structure.
  'mountain-a': { url: MOUNTAIN_A_URL, approxGzipBytes: MOUNTAIN_A_GZIP_BYTES },
  'mountain-b': { url: MOUNTAIN_B_URL, approxGzipBytes: MOUNTAIN_B_GZIP_BYTES },

  // Issue #29: same "not gated by truckAssetKeysForBuild" rationale as the
  // chicken/structures/mountain above -- the farmer is not a player truck
  // part, so it loads progressively per ADR 0010 §4.4. Consumed via
  // AssetRegistry.getAnimated() (ADR 0015 §1), not get().
  farmer: { url: FARMER_URL, approxGzipBytes: FARMER_GZIP_BYTES },

  // Issue #48: same "not gated by truckAssetKeysForBuild" rationale as the
  // chicken/structures/farmer above -- pig/cow are not player truck parts,
  // so they load progressively per ADR 0010 §4.4. Consumed via
  // AssetRegistry.getAnimated() (ADR 0016 §1), like the farmer.
  pig: { url: PIG_URL, approxGzipBytes: PIG_GZIP_BYTES },
  cow: { url: COW_URL, approxGzipBytes: COW_GZIP_BYTES },

  // Issue #54: same "not gated by truckAssetKeysForBuild" rationale as the
  // chicken/structures/farmer/pig/cow above. silo/chickenCoop are consumed
  // via STRUCTURE_ASSET_KEYS like the other four structures; fence is
  // consumed via FENCE_ASSET_KEY (below), since fences aren't a
  // `StructureKind`.
  silo: { url: SILO_URL, approxGzipBytes: SILO_GZIP_BYTES },
  chickenCoop: { url: CHICKEN_COOP_URL, approxGzipBytes: CHICKEN_COOP_GZIP_BYTES },
  fence: { url: FENCE_URL, approxGzipBytes: FENCE_GZIP_BYTES },

  // Issue #54 amendment: same "not gated by truckAssetKeysForBuild"
  // rationale as every other environment asset above -- trees are not
  // player truck parts, so they load progressively per ADR 0010 §4.4.
  // Consumed via TREE_ASSET_KEY (below), same single-key pattern as
  // FENCE_ASSET_KEY since trees aren't a `StructureKind` either.
  tree: { url: TREE_URL, approxGzipBytes: TREE_GZIP_BYTES },
} satisfies Record<string, AssetManifestEntry>;

export type AssetKey = keyof typeof ASSET_MANIFEST;

/** The manifest key for the (single, non-tiered) farmer model (issue #29) -- exported so scene.ts's farmer-rendering code doesn't hardcode the string. */
export const FARMER_ASSET_KEY: AssetKey = 'farmer';

/** The manifest key for a given tier index on a given truck-rig geometry axis (ADR 0011 §1/§4). */
export function bodyAssetKey(tier: number): AssetKey {
  return `body-tier-${tier}` as AssetKey;
}
export function wheelAssetKey(tier: number): AssetKey {
  return `wheel-tier-${tier}` as AssetKey;
}
export function engineCueAssetKey(tier: number): AssetKey {
  return `engine-cue-tier-${tier}` as AssetKey;
}
export function gasCueAssetKey(tier: number): AssetKey {
  return `gas-cue-tier-${tier}` as AssetKey;
}

/** The (single, non-tiered) manifest key for the chicken model (issue #28) -- exported so scene.ts's upsertAnimal doesn't hardcode the string. */
export const CHICKEN_ASSET_KEY: AssetKey = 'chicken';

/**
 * Manifest keys for every `AnimalSpecies`, keyed by species (issue #48, ADR
 * 0016 §1) -- mirroring `STRUCTURE_ASSET_KEYS`'s pattern so scene.ts never
 * hardcodes a species->key string. `CHICKEN_ASSET_KEY` above is kept
 * (existing test coverage depends on it) but scene.ts's animal-rendering
 * code reaches chicken's key through this map too, same as pig/cow.
 */
export const ANIMAL_ASSET_KEYS: Record<AnimalSpecies, AssetKey> = {
  chicken: 'chicken',
  pig: 'pig',
  cow: 'cow',
};

/**
 * Manifest keys for the four structure models, keyed by `StructureKind` --
 * exported so scene.ts's structure-rendering code doesn't hardcode the
 * strings. 'mountain' added in the issue #47 redesign (ADR 0012 addendum,
 * AC3a): the landmark mountain is a `StructureInstance` like the other
 * three, so it goes through the exact same generic
 * asset-key-lookup/AssetRegistry/UpgradableObject path -- no mountain-
 * specific rendering code needed.
 */
export const STRUCTURE_ASSET_KEYS: Record<'windmill' | 'barn' | 'farmhouse' | 'mountain' | 'silo' | 'chickenCoop', AssetKey> = {
  windmill: 'windmill',
  barn: 'barn',
  farmhouse: 'farmhouse',
  mountain: 'mountain-a',
  silo: 'silo',
  chickenCoop: 'chickenCoop',
};

/** The manifest key for the (single, unvarying) fence model (issue #54) -- exported so scene.ts's fence-rendering code doesn't hardcode the string. Fences aren't a `StructureKind`, so they get their own single-key export rather than a slot in `STRUCTURE_ASSET_KEYS`. */
export const FENCE_ASSET_KEY: AssetKey = 'fence';

/** The manifest key for the (single, unvarying) decorative tree model (issue #54 amendment, ADR 0019 §A4) -- exported so scene.ts's tree-rendering code doesn't hardcode the string. Same single-key pattern as `FENCE_ASSET_KEY`: trees aren't a `StructureKind` either. */
export const TREE_ASSET_KEY: AssetKey = 'tree';

/**
 * The asset keys the ADR 0010 §4.3 bounded gate waits on before DRIVING
 * starts, for one particular player build. ADR 0011 pass: replaces the
 * PASS-1 static `['test-fixture-cube']` list -- gates on exactly the four
 * geometry parts (body/wheels/engine-cue/gas-cue) this build's tiers need,
 * since those are what buildTruckRig assembles into the driving-scene truck
 * and the builder preview (the "player's own truck models" the ADR 0010
 * rationale for gating refers to). Cosmetics never gate anything: they're
 * material swaps resolved from an in-memory manifest (render/cosmetics/),
 * not network-loaded assets.
 */
export function truckAssetKeysForBuild(build: TruckBuild): AssetKey[] {
  return [
    bodyAssetKey(build.body),
    wheelAssetKey(build.wheels),
    engineCueAssetKey(build.engine),
    gasCueAssetKey(build.gasTank),
  ];
}
