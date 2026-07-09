// Typed key -> .glb URL manifest (ADR 0010 §6). Using Vite's
// `new URL('...', import.meta.url)` pattern (the ADR's primary
// recommendation) means every entry is fingerprinted for cache-busting,
// emitted as its own asset (never inlined into the JS chunk, so the
// first-paint budget is protected structurally), and has the GitHub Pages
// base path rewritten automatically -- render/ code never hardcodes a path.
//
// PASS 1 (this file, ADR 0010 infrastructure): only a tiny placeholder
// test-fixture cube is registered, to prove the AssetRegistry/prefetch/gate
// machinery end-to-end against a real .glb file. It is NOT production art
// (see scripts/generate-test-fixture-glb.mjs) and it stands in for the
// truck-body/wheel keys that ADR 0011 will add once real truck models
// exist -- AssetRegistry itself does not change when that happens, only
// this manifest and TRUCK_GATE_ASSET_KEYS below.

export interface AssetManifestEntry {
  url: URL;
  /** Approximate gzipped size in bytes, for the ADR 0010 §3 budget check (core/assets/budget.ts). Update alongside the real asset when it's swapped in. */
  approxGzipBytes: number;
}

const TEST_FIXTURE_CUBE_URL = new URL('./test-fixture-cube.glb', import.meta.url);

export const ASSET_MANIFEST = {
  // TEST FIXTURE ONLY -- see file header. Not production art.
  'test-fixture-cube': { url: TEST_FIXTURE_CUBE_URL, approxGzipBytes: 1200 },
} satisfies Record<string, AssetManifestEntry>;

export type AssetKey = keyof typeof ASSET_MANIFEST;

/**
 * The asset keys the ADR 0010 §4.3 bounded gate waits on before DRIVING
 * starts (the player's own truck models -- small enough to be worth a
 * short wait, per the ADR's rationale). PASS 1 stand-in: the placeholder
 * fixture, so the gating logic itself is exercised end-to-end. ADR 0011
 * replaces this list with the real truck-body/wheel keys for the player's
 * chosen tiers.
 */
export const TRUCK_GATE_ASSET_KEYS: AssetKey[] = ['test-fixture-cube'];
