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
import type { TruckBuild } from '../../core/types';

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

// Real measured gzip sizes (scripts/generate-truck-art.mjs output, 2026-07-08).
const BODY_GZIP_BYTES = [752, 937, 1821];
const WHEEL_GZIP_BYTES = [1395, 3756, 5041];
const ENGINE_CUE_GZIP_BYTES = [740, 789, 1371];
const GAS_CUE_GZIP_BYTES = [1233, 1398, 3366];

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
} satisfies Record<string, AssetManifestEntry>;

export type AssetKey = keyof typeof ASSET_MANIFEST;

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
